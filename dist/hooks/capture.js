import { OWNER_ID } from "../state.js";
import { buildSessionKey, isSubagentSession, extractParentAgentKey, extractMessages, cleanMessageContent } from "../helpers.js";

function logError(api, message, error) {
    try { api.logger.error?.(message); } catch {}
    try {
        if (error instanceof Error) {
            console.error(message, error.message);
        } else {
            console.error(message, error);
        }
    } catch {}
}

/**
 * Walk backward from the end to find where the current turn starts.
 * A turn begins at the user message that triggered the agent response.
 * Walks back past trailing assistant and toolResult messages.
 *
 * Falls back to (length - 2) for system-triggered cron runs that have no user message.
 */
function findCurrentTurnStart(messages) {
    if (!messages || messages.length === 0) return 0;

    // Walk backward past assistant and toolResult messages to find the user message
    let i = messages.length - 1;
    while (i > 0) {
        const role = messages[i]?.role ?? messages[i]?.message?.role;
        if (role === "user") break;
        i--;
    }

    // If we landed on a user message, that's the turn start
    if ((messages[i]?.role ?? messages[i]?.message?.role) === "user") {
        return i;
    }

    // No user message found (cron/system trigger) — save last 2 messages
    return Math.max(0, messages.length - 2);
}

export function registerCaptureHook(api, state) {
    // ===================================================================
    // agent_end: capture BOTH user and assistant messages from the
    // completed agent turn.
    //
    // Previously, user messages were captured in a separate
    // message_received hook, but that hook receives a different context
    // shape ({channelId, accountId, conversationId} instead of
    // {sessionKey, agentId, messageProvider}). The reconstructed session
    // key diverged from the canonical one, creating two separate Honcho
    // sessions — one for user messages, one for assistant messages.
    //
    // Fix: capture everything here in agent_end, which has the correct
    // session key from OpenClaw. The extractMessages() helper already
    // maps user -> ownerPeer and assistant -> agentPeer correctly.
    // ===================================================================
    api.on("agent_end", async (event, ctx) => {
        if (!event.messages?.length) return;

        const sessionKey = buildSessionKey(ctx);
        const agentId = ctx.agentId ?? state.resolveDefaultAgentId();
        const isSubagent = isSubagentSession(ctx);

        try {
            await state.ensureInitialized();
            const agentPeer = await state.getAgentPeer(agentId);

            const sessionMeta = {
                agentId,
                ...(isSubagent ? {
                    isSubagent: true,
                    parentAgentKey: extractParentAgentKey(ctx.sessionKey),
                } : {}),
            };

            const session = await state.honcho.session(sessionKey, { metadata: sessionMeta });
            let meta = {};
            try {
                meta = (await session.getMetadata()) ?? {};
            } catch {
                meta = {};
            }

            let lastSavedIndex = Number.isInteger(meta.lastSavedIndex)
                ? meta.lastSavedIndex
                : null;

            // First time: find the current turn start to capture both user + assistant
            if (lastSavedIndex === null) {
                lastSavedIndex = findCurrentTurnStart(event.messages);
                await session.setMetadata({ ...sessionMeta, lastSavedIndex });
            }

            // Safety: if index drifted past messages length, reset
            if (lastSavedIndex > event.messages.length) {
                lastSavedIndex = Math.max(0, event.messages.length - 2);
            }

            try {
                await session.addPeers([
                    [OWNER_ID, { observeMe: true, observeOthers: false }],
                    [agentPeer.id, { observeMe: true, observeOthers: true }],
                ]);
            } catch (peerErr) {
                // Non-fatal: rate limits or duplicate peer adds
                api.logger.debug?.(`[honcho] addPeers non-fatal: ${peerErr}`);
            }

            if (event.messages.length <= lastSavedIndex) {
                return;
            }

            const newRawMessages = event.messages.slice(lastSavedIndex);

            // Save both user and assistant messages — extractMessages() handles
            // role-based peer assignment (user -> ownerPeer, assistant -> agentPeer).
            const messages = extractMessages(newRawMessages, state.ownerPeer, agentPeer);

            if (messages.length > 0) {
                await session.addMessages(messages);
            }

            await session.setMetadata({
                ...meta,
                ...sessionMeta,
                lastSavedIndex: event.messages.length,
            });

            api.logger.debug?.(`[honcho] agent_end saved ${messages.length} messages (user + assistant)`);
        } catch (error) {
            logError(api, `[honcho] Failed to capture session ${sessionKey}`, error);
        }
    });
}
