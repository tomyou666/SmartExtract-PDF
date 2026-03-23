import { useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { Toaster } from '@/components/ui/sonner';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { PdfViewPage } from './pages/PdfViewPage';

function RedirectToAuth() {
	const [, setLocation] = useLocation();
	useEffect(() => {
		setLocation('/auth');
	}, [setLocation]);
	return null;
}

function App() {
	const initializeTheme = useThemeStore((s) => s.initializeTheme);
	const token = useAuthStore((s) => s.token);
	const isDevAuthEnabled = import.meta.env.DEV;

	useEffect(() => {
		initializeTheme();
	}, [initializeTheme]);

	return (
		<>
			<Switch>
				{isDevAuthEnabled && <Route path='/auth' component={AuthPage} />}
				{isDevAuthEnabled && !token ? (
					<Route component={RedirectToAuth} />
				) : (
					<>
						<Route path='/' component={HomePage} />
						<Route path='/pdf/:id' component={PdfViewPage} />
					</>
				)}
				<Route component={() => <div>Not found</div>} />
			</Switch>
			<Toaster position='top-center' duration={2000} />
		</>
	);
}

export default App;
