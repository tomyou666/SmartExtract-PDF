import { create } from 'zustand';

interface AuthState {
	token: string | null;
	setToken: (token: string) => void;
	clearToken: () => void;
}

const STORAGE_KEY = 'dev_auth_token';

const readInitialToken = () => {
	if (typeof window === 'undefined') return null;
	return window.localStorage.getItem(STORAGE_KEY);
};

export const useAuthStore = create<AuthState>((set) => ({
	token: readInitialToken(),
	setToken: (token: string) => {
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(STORAGE_KEY, token);
		}
		set({ token });
	},
	clearToken: () => {
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(STORAGE_KEY);
		}
		set({ token: null });
	},
}));
