/** `API_BASE`（空なら相対パス）と API パスを結合する */
export function apiUrl(base: string, path: string): string {
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	const b = base.replace(/\/$/, '');
	if (!b) return normalizedPath;
	return `${b}${normalizedPath}`;
}
