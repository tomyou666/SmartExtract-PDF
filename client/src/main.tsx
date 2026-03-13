import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { scan } from 'react-scan';
import App from './App';
import './index.css';

const isReactScanEnabled =
	import.meta.env.DEV && import.meta.env.VITE_REACT_SCAN_ENABLED !== 'false';

if (isReactScanEnabled) {
	scan({
		enabled: true,
	});
}

// biome-ignore lint/style/noNonNullAssertion: <explanation>
createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
