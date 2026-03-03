import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeStore } from '@/stores/themeStore';

export function ThemeToggle() {
	const theme = useThemeStore((s) => s.theme);
	const toggleTheme = useThemeStore((s) => s.toggleTheme);

	const isDark = theme === 'dark';

	return (
		<Button
			type='button'
			variant='ghost'
			size='icon'
			onClick={toggleTheme}
			aria-label={isDark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
		>
			{isDark ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
		</Button>
	);
}
