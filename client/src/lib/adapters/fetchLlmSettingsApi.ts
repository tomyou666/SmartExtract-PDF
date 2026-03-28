import type {
	LlmSettingsApi,
	LlmSettingsSnapshot,
	ProviderOption,
} from '@/lib/ports/llmSettingsApi';
import { apiUrl } from '@/lib/ports/urlJoin';

export function createFetchLlmSettingsApi(baseUrl: string): LlmSettingsApi {
	return {
		async listProviders(): Promise<ProviderOption[]> {
			try {
				const res = await fetch(apiUrl(baseUrl, '/api/settings/llm/providers'));
				if (!res.ok) return [];
				const data = await res.json();
				return Array.isArray(data) ? data : [];
			} catch {
				return [];
			}
		},

		async getSettings(): Promise<LlmSettingsSnapshot | null> {
			try {
				const res = await fetch(apiUrl(baseUrl, '/api/settings/llm'));
				if (!res.ok) return null;
				return res.json();
			} catch {
				return null;
			}
		},

		async listModels(provider: string): Promise<string[]> {
			if (!provider) return [];
			try {
				const q = encodeURIComponent(provider);
				const res = await fetch(
					apiUrl(baseUrl, `/api/settings/llm/models?provider=${q}`),
				);
				if (!res.ok) return [];
				const data: { models?: string[] } = await res.json();
				return data.models ?? [];
			} catch {
				return [];
			}
		},

		async saveSettings(body: {
			provider: string;
			model: string;
			api_key?: string;
		}): Promise<boolean> {
			try {
				const res = await fetch(apiUrl(baseUrl, '/api/settings/llm'), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});
				return res.ok;
			} catch {
				return false;
			}
		},
	};
}
