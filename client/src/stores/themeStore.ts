import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ThemeState {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
	initializeTheme: () => void;
}

const STORAGE_KEY = 'theme';

const applyTheme = (theme: Theme) => {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	root.dataset.theme = theme;
};

export const useThemeStore = create<ThemeState>((set, get) => ({
	theme: 'light',
	setTheme: (theme) => {
		set({ theme });
		try {
			window.localStorage.setItem(STORAGE_KEY, theme);
		} catch {
			// ignore
		}
		applyTheme(theme);
	},
	toggleTheme: () => {
		const next: Theme = get().theme === 'light' ? 'dark' : 'light';
		get().setTheme(next);
	},
	initializeTheme: () => {
		let initial: Theme = 'light';
		try {
			const stored = window.localStorage.getItem(STORAGE_KEY);
			if (stored === 'light' || stored === 'dark') {
				initial = stored;
			} else if (window.matchMedia) {
				const prefersDark = window.matchMedia(
					'(prefers-color-scheme: dark)',
				).matches;
				initial = prefersDark ? 'dark' : 'light';
			}
		} catch {
			// ignore
		}
		set({ theme: initial });
		applyTheme(initial);
	},
}));
