import { useEffect } from 'react';
import { Route, Switch } from 'wouter';
import { Toaster } from '@/components/ui/sonner';
import { useThemeStore } from '@/stores/themeStore';
import { HomePage } from './pages/HomePage';
import { PdfViewPage } from './pages/PdfViewPage';

function App() {
	const initializeTheme = useThemeStore((s) => s.initializeTheme);

	useEffect(() => {
		initializeTheme();
	}, [initializeTheme]);

	return (
		<>
			<Switch>
				<Route path='/' component={HomePage} />
				<Route path='/pdf/:id' component={PdfViewPage} />
				<Route component={() => <div>Not found</div>} />
			</Switch>
			<Toaster position='top-center' duration={2000} />
		</>
	);
}

export default App;
