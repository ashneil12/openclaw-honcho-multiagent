export function registerMemoryPassthrough(api, _state) {
    api.registerTool((ctx) => {
        const memorySearchTool = api.runtime.tools.createMemorySearchTool({
            config: ctx.config,
            agentSessionKey: ctx.sessionKey,
        });
        const memoryGetTool = api.runtime.tools.createMemoryGetTool({
            config: ctx.config,
            agentSessionKey: ctx.sessionKey,
        });
        if (!memorySearchTool || !memoryGetTool) {
            return null;
        }
        return [memorySearchTool, memoryGetTool];
    }, { names: ["memory_search", "memory_get"] });
}
