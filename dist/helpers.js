/**
 * Pure helper functions — no mutable state dependencies.
 */

/**
 * Build a Honcho session key from OpenClaw context.
 * Combines sessionKey + provider to create unique sessions per platform.
 * Uses hyphens as separators (Honcho requires hyphens, not underscores).
 * Truncates to 100 chars to satisfy Honcho session id limits.
 */
export function buildSessionKey(ctx) {
    const agentId = ctx?.agentId ?? "main";
    const provider = ctx?.messageProvider ?? ctx?.messageChannel ?? ctx?.channel ?? ctx?.channelId ?? "unknown";
    const baseKey =
        ctx?.sessionKey ??
            (ctx?.conversationId
                ? `agent:${agentId}:${ctx?.channelId ?? provider}:${ctx.conversationId}`
                : "default");
    const combined = `${baseKey}-${provider}`;
    let key = combined.replace(/[^a-zA-Z0-9-]/g, "-");
    if (key.length > 100) {
        key = key.slice(0, 100);
    }
    return key;
}

export function isSubagentSession(ctx) {
    return (ctx?.sessionKey ?? "").includes(":subagent:");
}

export function extractParentAgentKey(sessionKey) {
    const match = sessionKey?.match(/^(agent:[^:]+):subagent:/);
    return match?.[1] ?? undefined;
}

/**
 * Strip Honcho's own injected context from message content to prevent
 * feedback loops (context injected -> saved -> re-injected -> grows forever).
 * Also strips leading OpenClaw reply directive tags (e.g. [[reply_to_current]])
 * so control tokens are never persisted or re-surfaced as user-visible text.
 */
export function cleanMessageContent(content) {
    if (typeof content !== "string") return "";
    let cleaned = content;
    cleaned = cleaned.replace(/<honcho-memory[^>]*>[\s\S]*?<\/honcho-memory>\s*/gi, "");
    cleaned = cleaned.replace(/<!--[^>]*honcho[^>]*-->\s*/gi, "");
    cleaned = cleaned.replace(/^(\s*\[\[\s*(?:reply_to_current|reply_to\s*:\s*[^\]\n]+)\s*\]\]\s*)+/gi, "");
    return cleaned.trim();
}

/**
 * OpenClaw can wrap messages as:
 * { message: { role, content, ... }, ... }
 * This normalizes wrapped/unwrapped variants.
 */
function unwrapMessage(msg) {
    if (!msg || typeof msg !== "object")
        return null;
    const m = msg;
    const wrapped = m.message && typeof m.message === "object" ? m.message : null;
    const role = m.role ?? wrapped?.role;
    const rawContent = m.content ?? wrapped?.content;
    if (!role)
        return null;
    return { role, content: rawContent };
}

export function extractMessages(rawMessages, ownerPeer, agentPeer) {
    const result = [];
    for (const msg of rawMessages) {
        const unwrapped = unwrapMessage(msg);
        if (!unwrapped)
            continue;
        const { role, content: rawContent } = unwrapped;
        if (role !== "user" && role !== "assistant")
            continue;

        let content = "";
        if (typeof rawContent === "string") {
            content = rawContent;
        }
        else if (Array.isArray(rawContent)) {
            const parts = [];
            for (const block of rawContent) {
                if (typeof block === "string") {
                    parts.push(block);
                    continue;
                }
                if (!block || typeof block !== "object")
                    continue;

                const b = block;
                if (typeof b.text === "string" &&
                    (b.type === "text" || b.type === "input_text" || b.type === "output_text")) {
                    parts.push(b.text);
                    continue;
                }
                if (typeof b.content === "string") {
                    parts.push(b.content);
                    continue;
                }
                if (typeof b.value === "string") {
                    parts.push(b.value);
                    continue;
                }
            }
            content = parts.filter((t) => typeof t === "string" && t.trim().length > 0).join("\n");
        }

        content = cleanMessageContent(content);
        content = content.trim();
        if (content) {
            const peer = role === "user" ? ownerPeer : agentPeer;
            result.push(peer.message(content));
        }
    }
    return result;
}
