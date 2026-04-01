import { create } from 'zustand';

interface ApiKeyStore {
	apiKeyConfigured: boolean | null;
	setApiKeyConfigured: (value: boolean | null) => void;
}

export const useApiKeyStore = create<ApiKeyStore>((set) => ({
	apiKeyConfigured: null,
	setApiKeyConfigured: (apiKeyConfigured) => set({ apiKeyConfigured }),
}));
