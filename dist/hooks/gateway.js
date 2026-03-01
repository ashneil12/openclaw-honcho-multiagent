export function registerGatewayHook(api, state) {
    api.on("gateway_start", async (_event, _ctx) => {
        api.logger.info("Initializing Honcho memory...");
        try {
            await state.ensureInitialized();
            api.logger.info("Honcho memory ready");
        }
        catch (error) {
            api.logger.error(`Failed to initialize Honcho: ${error}`);
        }
    });
}
