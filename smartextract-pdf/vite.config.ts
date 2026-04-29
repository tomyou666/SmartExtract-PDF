import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** COEP/COOP を全レスポンスに付与（ONNX Runtime Web / SharedArrayBuffer 用） */
function crossOriginIsolation() {
	return {
		name: 'cross-origin-isolation',
		configureServer(server) {
			server.middlewares.use((_req, res, next) => {
				res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
				res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
				next();
			});
		},
	};
}

export default defineConfig({
	plugins: [react(), tailwindcss(), crossOriginIsolation()],
	assetsInclude: ['**/*.onnx'],
	optimizeDeps: {
		include: ['pdfjs-dist'],
		exclude: ['onnxruntime-web'],
	},
	resolve: {
		alias: { '@': path.resolve(__dirname, 'src') },
	},
	server: {
		port: 5173,
		// ONNXRuntime-Web の WASM マルチスレッドに必要（SharedArrayBuffer 用）
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp',
		},
		proxy: {
			'/api': {
				target: 'http://127.0.0.1:8000',
				changeOrigin: true,
			},
		},
	},
	preview: {
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp',
		},
	},
});
