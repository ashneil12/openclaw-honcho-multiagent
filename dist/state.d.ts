/**
 * Shared mutable state for the Honcho memory plugin.
 * Follows the dependency-injection pattern: createPluginState() returns a
 * PluginState object that gets passed to every module.
 */
import { Honcho, type Peer } from "@honcho-ai/sdk";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { type HonchoConfig } from "./config.js";
export declare const OWNER_ID = "owner";
export declare const LEGACY_PEER_ID = "openclaw";
export type PluginState = {
    honcho: Honcho;
    cfg: HonchoConfig;
    ownerPeer: Peer | null;
    agentPeers: Map<string, Peer>;
    agentPeerMap: Record<string, string>;
    initialized: boolean;
    api: OpenClawPluginApi;
    ensureInitialized: () => Promise<void>;
    getAgentPeer: (agentId?: string) => Promise<Peer>;
    resolveDefaultAgentId: () => string;
};
export declare function createPluginState(api: OpenClawPluginApi): PluginState;
