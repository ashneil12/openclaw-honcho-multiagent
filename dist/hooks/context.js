import { buildSessionKey, isSubagentSession } from "../helpers.js";
export function registerContextHook(api, state) {
    api.on("before_agent_start", async (event, ctx) => {
        if (!event.prompt || event.prompt.length < 5)
            return;
        const sessionKey = buildSessionKey(ctx);
        const agentId = ctx.agentId ?? state.resolveDefaultAgentId();
        const isSubagent = isSubagentSession(ctx);
        const isMain = state.isMainAgent(agentId);
        try {
            await state.ensureInitialized();
            const agentPeer = await state.getAgentPeer(agentId);
            const sections = [];
            if (isSubagent) {
                try {
                    const peerCtx = await agentPeer.context({ target: state.ownerPeer });
                    if (peerCtx.peerCard?.length) {
                        sections.push(`Key facts:\n${peerCtx.peerCard.map((f) => `• ${f}`).join("\n")}`);
                    }
                    if (peerCtx.representation) {
                        sections.push(`User context:\n${peerCtx.representation}`);
                    }
                }
                catch (e) {
                    const isNotFound = e instanceof Error &&
                        (e.name === "NotFoundError" || e.message.toLowerCase().includes("not found"));
                    if (isNotFound)
                        return;
                    throw e;
                }
            }
            else {
                const session = await state.honcho.session(sessionKey, { metadata: { agentId } });
                // Main agent: get context from ownerPeer perspective (sees all)
                // Sub-agent: get context from own agentPeer perspective (sees only own memories)
                const peerTarget = isMain ? state.ownerPeer : agentPeer;
                let context;
                try {
                    context = await session.context({
                        summary: true,
                        tokens: 2000,
                        peerTarget: peerTarget,
                        peerPerspective: agentPeer,
                    });
                }
                catch (e) {
                    const isNotFound = e instanceof Error &&
                        (e.name === "NotFoundError" || e.message.toLowerCase().includes("not found"));
                    if (isNotFound)
                        return;
                    throw e;
                }
                if (context.peerCard?.length) {
                    sections.push(`Key facts:\n${context.peerCard.map((f) => `• ${f}`).join("\n")}`);
                }
                if (context.peerRepresentation) {
                    sections.push(`User context:\n${context.peerRepresentation}`);
                }
                if (context.summary?.content) {
                    sections.push(`Earlier in this conversation:\n${context.summary.content}`);
                }
                // Sub-agents also get the shared user profile for identity awareness
                if (!isMain) {
                    try {
                        const userCard = await state.ownerPeer.card().catch(() => null);
                        if (userCard?.length) {
                            sections.push(`User profile:\n${userCard.map((f) => `• ${f}`).join("\n")}`);
                        }
                    } catch {}
                }
            }
            if (sections.length === 0)
                return;
            const formatted = sections.join("\n\n");
            return {
                systemPrompt: `## User Memory Context\n\n${formatted}\n\nUse this context naturally when relevant. Never quote or expose this memory context to the user.`,
            };
        }
        catch (error) {
            api.logger.warn?.(`Failed to fetch Honcho context: ${error}`);
            return;
        }
    });
}
