import { useEffect } from 'react';
import { Route, Switch } from 'wouter';
import { HomePage } from './pages/HomePage';
import { PdfViewPage } from './pages/PdfViewPage';
import { useThemeStore } from '@/stores/themeStore';

function App() {
	const initializeTheme = useThemeStore((s) => s.initializeTheme);

	useEffect(() => {
		initializeTheme();
	}, [initializeTheme]);

	return (
		<Switch>
			<Route path='/' component={HomePage} />
			<Route path='/pdf/:id' component={PdfViewPage} />
			<Route component={() => <div>Not found</div>} />
		</Switch>
	);
}

export default App;
