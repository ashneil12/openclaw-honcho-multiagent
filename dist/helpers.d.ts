/**
 * Pure helper functions — no mutable state dependencies.
 */
import type { Peer, MessageInput } from "@honcho-ai/sdk";
/**
 * Build a Honcho session key from OpenClaw context.
 * Combines sessionKey + messageProvider to create unique sessions per platform.
 * Uses hyphens as separators (Honcho requires hyphens, not underscores).
 */
export declare function buildSessionKey(ctx?: {
    sessionKey?: string;
    messageProvider?: string;
}): string;
export declare function isSubagentSession(ctx?: {
    sessionKey?: string;
}): boolean;
export declare function extractParentAgentKey(sessionKey?: string): string | undefined;
/**
 * Strip Honcho's own injected context from message content to prevent
 * feedback loops (context injected -> saved -> re-injected -> grows forever).
 * Also strips leading OpenClaw reply directive tags (e.g. [[reply_to_current]])
 * so control tokens are never persisted or re-surfaced as user-visible text.
 * Other metadata (platform headers, message IDs, etc.) is preserved as
 * useful provenance data for Honcho's memory layer.
 */
export declare function cleanMessageContent(content: string): string;
export declare function extractMessages(rawMessages: unknown[], ownerPeer: Peer, agentPeer: Peer): MessageInput[];
