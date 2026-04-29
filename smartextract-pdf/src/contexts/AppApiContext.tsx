import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { createFetchChatApi } from '@/lib/adapters/fetchChatApi';
import { createFetchLlmSettingsApi } from '@/lib/adapters/fetchLlmSettingsApi';
import { createFetchPdfApi } from '@/lib/adapters/fetchPdfApi';
import type { ChatApi } from '@/lib/ports/chatApi';
import type { LlmSettingsApi } from '@/lib/ports/llmSettingsApi';
import type { PdfApi } from '@/lib/ports/pdfApi';
import { API_BASE } from '@/lib/utils';

export interface AppApi {
	pdf: PdfApi;
	chat: ChatApi;
	llmSettings: LlmSettingsApi;
}

const AppApiContext = createContext<AppApi | null>(null);

export function AppApiProvider({ children }: { children: ReactNode }) {
	const value = useMemo(
		() => ({
			pdf: createFetchPdfApi(API_BASE),
			chat: createFetchChatApi(API_BASE),
			llmSettings: createFetchLlmSettingsApi(API_BASE),
		}),
		[],
	);

	return (
		<AppApiContext.Provider value={value}>{children}</AppApiContext.Provider>
	);
}

export function useAppApi(): AppApi {
	const ctx = useContext(AppApiContext);
	if (!ctx) {
		throw new Error('useAppApi must be used within AppApiProvider');
	}
	return ctx;
}

export function usePdfApi(): PdfApi {
	return useAppApi().pdf;
}

export function useChatApi(): ChatApi {
	return useAppApi().chat;
}

export function useLlmSettingsApi(): LlmSettingsApi {
	return useAppApi().llmSettings;
}
