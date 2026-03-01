/**
 * Shared mutable state for the Honcho memory plugin.
 * Follows the dependency-injection pattern: createPluginState() returns a
 * PluginState object that gets passed to every module.
 */
import { Honcho } from "@honcho-ai/sdk";
import { honchoConfigSchema } from "./config.js";
export const OWNER_ID = "owner";
export const LEGACY_PEER_ID = "openclaw";
export function createPluginState(api) {
    const cfg = honchoConfigSchema.parse(api.pluginConfig);
    if (!cfg.apiKey) {
        api.logger.warn("openclaw-honcho: No API key configured. Set HONCHO_API_KEY or configure apiKey in plugin config.");
    }
    const honcho = new Honcho({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseUrl,
        workspaceId: cfg.workspaceId,
    });
    const state = {
        honcho,
        cfg,
        ownerPeer: null,
        agentPeers: new Map(),
        agentPeerMap: {},
        initialized: false,
        api,
        ensureInitialized,
        getAgentPeer,
        resolveDefaultAgentId,
    };
    function resolveDefaultAgentId() {
        const agents = api.config?.agents?.list;
        if (!Array.isArray(agents) || agents.length === 0)
            return "main";
        const defaultAgent = agents.find((a) => a?.default) ?? agents[0];
        return (defaultAgent?.id ?? "main").toLowerCase().trim() || "main";
    }
    async function ensureInitialized() {
        if (state.initialized)
            return;
        const wsMeta = await honcho.getMetadata();
        state.agentPeerMap = wsMeta.agentPeerMap ?? {};
        const defaultId = resolveDefaultAgentId();
        if (Object.keys(state.agentPeerMap).length === 0) {
            state.agentPeerMap[defaultId] = `agent-${defaultId}`;
            await honcho.setMetadata({ ...wsMeta, agentPeerMap: state.agentPeerMap });
        }
        else if (Object.values(state.agentPeerMap).includes(LEGACY_PEER_ID) && !state.agentPeerMap[defaultId]) {
            state.agentPeerMap[defaultId] = LEGACY_PEER_ID;
            await honcho.setMetadata({ ...wsMeta, agentPeerMap: state.agentPeerMap });
        }
        state.ownerPeer = await honcho.peer(OWNER_ID, { metadata: {} });
        state.initialized = true;
    }
    async function getAgentPeer(agentId) {
        const id = (agentId || resolveDefaultAgentId()).toLowerCase().trim() || "main";
        let peer = state.agentPeers.get(id);
        if (peer)
            return peer;
        let peerId = state.agentPeerMap[id];
        if (!peerId) {
            const allPeers = await honcho.peers();
            for await (const p of allPeers) {
                if (p.id === OWNER_ID)
                    continue;
                const meta = await p.getMetadata();
                if (meta?.agentId === id) {
                    peerId = p.id;
                    api.logger.info(`[honcho] Recovered peer "${peerId}" for renamed agent "${id}"`);
                    break;
                }
            }
        }
        if (!peerId) {
            peerId = `agent-${id}`;
        }
        if (state.agentPeerMap[id] !== peerId) {
            state.agentPeerMap[id] = peerId;
            const wsMeta = await honcho.getMetadata();
            await honcho.setMetadata({ ...wsMeta, agentPeerMap: state.agentPeerMap });
        }
        peer = await honcho.peer(peerId);
        state.agentPeers.set(id, peer);
        const existingMeta = await peer.getMetadata();
        if (existingMeta.agentId !== id) {
            await peer.setMetadata({ ...existingMeta, agentId: id });
        }
        return peer;
    }
    return state;
}
