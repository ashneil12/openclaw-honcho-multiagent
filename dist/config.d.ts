/**
 * Configuration schema and parsing for the Honcho memory plugin.
 */
export type HonchoConfig = {
    apiKey?: string;
    workspaceId: string;
    baseUrl: string;
};
export declare const honchoConfigSchema: {
    parse(value: unknown): HonchoConfig;
};
