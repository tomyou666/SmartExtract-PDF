import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface ThemeState {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
	initializeTheme: () => void;
}

const THEME_PERSIST_KEY = 'app:theme';

const applyTheme = (theme: Theme) => {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	root.dataset.theme = theme;
	// index.css の .dark と @custom-variant dark はクラスで判定するため class も更新
	if (theme === 'dark') {
		root.classList.add('dark');
	} else {
		root.classList.remove('dark');
	}
};

const getDefaultTheme = (): Theme => {
	if (typeof window === 'undefined') return 'light';
	try {
		if (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches)
			return 'dark';
	} catch (e) {
		// console.error にしない: 一部環境・プライベートモード等で matchMedia が例外になることがある（ライトにフォールバック）
		console.warn('[themeStore] matchMedia(prefers-color-scheme)', e);
	}
	return 'light';
};

export const useThemeStore = create<ThemeState>()(
	persist(
		(set, get) => ({
			theme: getDefaultTheme(),
			setTheme: (theme) => {
				set({ theme });
				applyTheme(theme);
			},
			toggleTheme: () => {
				const next: Theme = get().theme === 'light' ? 'dark' : 'light';
				get().setTheme(next);
			},
			initializeTheme: () => {
				applyTheme(get().theme);
			},
		}),
		{
			name: THEME_PERSIST_KEY,
			storage: createJSONStorage(() => window.localStorage),
			version: 1,
			onRehydrateStorage: () => (state) => {
				if (state?.theme) applyTheme(state.theme);
			},
		},
	),
);
