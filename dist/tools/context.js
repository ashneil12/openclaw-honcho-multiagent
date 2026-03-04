import { Type } from "@sinclair/typebox";
export function registerContextTool(api, state) {
    api.registerTool((toolCtx) => ({
        name: "honcho_context",
        label: "Get Broad Context",
        description: `Retrieve Honcho's full representation — everything known about this user ACROSS ALL SESSIONS.

━━━ SCOPE: ALL SESSIONS (USER-LEVEL) ━━━
This tool retrieves synthesized knowledge about the user from ALL their past conversations.
It provides a holistic view built over time, not limited to the current session.

━━━ DATA TOOL ━━━
Returns: Broad synthesized representation with frequent observations
Cost: Low (database query only, no LLM)
Speed: Fast

Best for:
- "What do you know about me?"
- Understanding the user holistically before a complex task
- Getting broad context when you're unsure what to search for
- Long-term preferences, patterns, and history

NOT for:
- "What did we just discuss?" → Use honcho_session instead
- Current conversation context → Use honcho_session instead

Parameters:
- includeMostFrequent: Include most frequently referenced observations (default: true)

━━━ vs honcho_session ━━━
• honcho_context: ALL sessions — "what do I know about this user overall?"
• honcho_session: THIS session only — "what did we just discuss?"

━━━ vs Other Tools ━━━
• honcho_profile: Just key facts (fastest, minimal)
• honcho_search: Targeted by query (specific topics across all sessions)
• honcho_context: Broad representation (comprehensive, still cheap)
• honcho_analyze: LLM-synthesized answer (costs more, but interpreted for you)`,
        parameters: Type.Object({
            includeMostFrequent: Type.Optional(Type.Boolean({
                description: "Include most frequently referenced observations (default: true)",
            })),
        }),
        async execute(_toolCallId, params) {
            const { includeMostFrequent } = params;
            await state.ensureInitialized();
            const isMain = state.isMainAgent(toolCtx.agentId);
            // Main agent: read from ownerPeer (cross-read all agents' memories)
            // Sub-agent: read from own agentPeer (only own memories)
            const sourcePeer = isMain
                ? state.ownerPeer
                : await state.getAgentPeer(toolCtx.agentId);
            const representation = await sourcePeer.representation({
                includeMostFrequent: includeMostFrequent ?? true,
            });
            const sections = [];
            // All agents get the shared user profile facts
            if (!isMain) {
                try {
                    const userCard = await state.ownerPeer.card().catch(() => null);
                    if (userCard?.length) {
                        sections.push(`## User Profile\n\n${userCard.map((f) => `• ${f}`).join("\n")}`);
                    }
                } catch {}
            }
            if (representation) {
                sections.push(`## ${isMain ? "User" : "My"} Context\n\n${representation}`);
            }
            if (sections.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No context available yet. Context builds over time through conversations.",
                        },
                    ],
                    details: undefined,
                };
            }
            return {
                content: [{ type: "text", text: sections.join("\n\n") }],
                details: undefined,
            };
        },
    }), { name: "honcho_context" });
}
