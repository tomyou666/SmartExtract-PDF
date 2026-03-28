export interface ProviderOption {
	value: string;
	label: string;
}

export interface LlmSettingsSnapshot {
	provider: string;
	model: string;
	api_key_masked?: boolean;
}

export interface LlmSettingsApi {
	listProviders(): Promise<ProviderOption[]>;
	getSettings(): Promise<LlmSettingsSnapshot | null>;
	listModels(provider: string): Promise<string[]>;
	saveSettings(body: {
		provider: string;
		model: string;
		api_key?: string;
	}): Promise<void>;
}
