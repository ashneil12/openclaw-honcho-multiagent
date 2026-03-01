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
    // message_received: capture user's inbound message at receive-time.
    // NOTE: The ctx for this hook has {channelId, accountId, conversationId}
    // NOT {sessionKey, messageProvider, agentId}. We must reconstruct the
    // session key to match what agent_end uses.
    // ===================================================================
    api.on("message_received", async (event, ctx) => {
        try {
            if (event?.fromMe === true) return;

            const content = typeof event?.content === "string" ? event.content : "";
            const cleaned = cleanMessageContent(content).trim();
            if (!cleaned) return;

            await state.ensureInitialized();

            // Reconstruct session key from message_received context.
            // message_received usually has: { channelId, accountId, conversationId }
            // For Telegram DMs, conversationId may be plain chat id (e.g. "5614099189").
            // We map that to the same canonical key used by agent_end:
            //   agent:<agentId>:<channelId>:direct:<conversationId>-<provider>
            const agentId = state.resolveDefaultAgentId();
            const channelId = String(ctx?.channelId ?? "unknown");
            let conversationId = String(ctx?.conversationId ?? "unknown");

            // Normalize provider-prefixed ids from message_received (e.g. "telegram:5614099189").
            const providerPrefix = `${channelId}:`;
            if (conversationId.startsWith(providerPrefix)) {
                conversationId = conversationId.slice(providerPrefix.length);
            }
            if (conversationId.startsWith("direct:")) {
                conversationId = conversationId.slice("direct:".length);
            }

            const canonicalSession = conversationId.startsWith("agent:")
                ? conversationId
                : `agent:${agentId}:${channelId}:direct:${conversationId}`;
            const syntheticCtx = {
                sessionKey: canonicalSession,
                messageProvider: channelId,
                agentId,
            };
            const sessionKey = buildSessionKey(syntheticCtx);

            api.logger.debug?.(`[honcho] inbound user message to session=${sessionKey} len=${cleaned.length}`);

            const agentPeer = await state.getAgentPeer(agentId);
            const session = await state.honcho.session(sessionKey, { metadata: { agentId } });

            try {
                await session.addPeers([
                    [OWNER_ID, { observeMe: true, observeOthers: false }],
                    [agentPeer.id, { observeMe: true, observeOthers: true }],
                ]);
            } catch {}

            await session.addMessages([state.ownerPeer.message(cleaned)]);
            api.logger.debug?.(`[honcho] saved inbound user message to ${sessionKey}`);
        } catch (error) {
            logError(api, `[honcho] Failed inbound capture`, error);
        }
    });

    // ===================================================================
    // agent_end: capture assistant messages from the completed agent turn.
    // User messages are ALSO in event.messages but we save them via
    // message_received above to avoid index-tracking issues.
    // Here we only save assistant messages from the new slice.
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

            // Filter out user messages from agent_end since message_received captures them
            // Only save assistant messages from this hook to avoid duplicates
            const assistantOnly = newRawMessages.filter(m => {
                if (!m || typeof m !== "object") return false;
                const role = m.role ?? m.message?.role;
                return role === "assistant";
            });

            const messages = extractMessages(assistantOnly, state.ownerPeer, agentPeer);

            if (messages.length > 0) {
                await session.addMessages(messages);
            }

            await session.setMetadata({
                ...meta,
                ...sessionMeta,
                lastSavedIndex: event.messages.length,
            });

            api.logger.debug?.(`[honcho] agent_end saved ${messages.length} assistant messages`);
        } catch (error) {
            logError(api, `[honcho] Failed to capture session ${sessionKey}`, error);
        }
    });
}
