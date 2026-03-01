/**
 * OpenClaw Memory (Honcho) Plugin
 *
 * AI-native memory with dialectic reasoning for OpenClaw.
 * Uses Honcho's peer paradigm for multi-party conversation memory.
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
declare const _default: {
    id: string;
    name: string;
    description: string;
    kind: "memory";
    configSchema: {
        parse(value: unknown): import("./config.js").HonchoConfig;
    };
    register(api: OpenClawPluginApi): void;
};
export default _default;
