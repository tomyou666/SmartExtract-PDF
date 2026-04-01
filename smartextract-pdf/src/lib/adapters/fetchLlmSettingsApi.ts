import { ensureOkResponse } from '@/lib/ensureOkResponse';
import type {
	LlmSettingsApi,
	LlmSettingsSnapshot,
	ProviderOption,
} from '@/lib/ports/llmSettingsApi';
import { apiUrl } from '@/lib/ports/urlJoin';

export function createFetchLlmSettingsApi(baseUrl: string): LlmSettingsApi {
	return {
		async listProviders(): Promise<ProviderOption[]> {
			const res = await fetch(apiUrl(baseUrl, '/api/settings/llm/providers'));
			await ensureOkResponse(res, 'LLMプロバイダー一覧の取得に失敗しました');
			const data = await res.json();
			return Array.isArray(data) ? data : [];
		},

		async getSettings(): Promise<LlmSettingsSnapshot | null> {
			const res = await fetch(apiUrl(baseUrl, '/api/settings/llm'));
			if (res.status === 404) return null;
			await ensureOkResponse(res, 'LLM設定の取得に失敗しました');
			return res.json();
		},

		async listModels(provider: string): Promise<string[]> {
			if (!provider) return [];
			const q = encodeURIComponent(provider);
			const res = await fetch(
				apiUrl(baseUrl, `/api/settings/llm/models?provider=${q}`),
			);
			await ensureOkResponse(res, 'モデル一覧の取得に失敗しました');
			const data: { models?: string[] } = await res.json();
			return data.models ?? [];
		},

		async saveSettings(body: {
			provider: string;
			model: string;
			api_key?: string;
		}): Promise<void> {
			const res = await fetch(apiUrl(baseUrl, '/api/settings/llm'), {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			await ensureOkResponse(res, 'LLM設定の保存に失敗しました');
		},
	};
}
