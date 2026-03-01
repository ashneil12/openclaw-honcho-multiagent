/**
 * Configuration schema and parsing for the Honcho memory plugin.
 */
/**
 * Resolve environment variable references in config values.
 * Supports ${ENV_VAR} syntax.
 */
function resolveEnvVars(value) {
    return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
        const envValue = process.env[envVar];
        if (!envValue) {
            throw new Error(`Environment variable ${envVar} is not set`);
        }
        return envValue;
    });
}
export const honchoConfigSchema = {
    parse(value) {
        const cfg = (value ?? {});
        // Resolve API key with env var fallback
        let apiKey;
        if (typeof cfg.apiKey === "string" && cfg.apiKey.length > 0) {
            apiKey = resolveEnvVars(cfg.apiKey);
        }
        else {
            apiKey = process.env.HONCHO_API_KEY;
        }
        return {
            apiKey,
            workspaceId: typeof cfg.workspaceId === "string" && cfg.workspaceId.length > 0
                ? cfg.workspaceId
                : process.env.HONCHO_WORKSPACE_ID ?? "openclaw",
            baseUrl: typeof cfg.baseUrl === "string" && cfg.baseUrl.length > 0
                ? cfg.baseUrl
                : process.env.HONCHO_BASE_URL ?? "https://api.honcho.dev",
        };
    },
};
