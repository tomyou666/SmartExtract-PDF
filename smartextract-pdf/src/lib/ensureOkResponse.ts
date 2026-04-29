/** fetch の Response が ok でないとき、本文または HTTP ステータス付きで Error を投げる */
export async function ensureOkResponse(
	res: Response,
	fallbackMessageJa: string,
): Promise<void> {
	if (res.ok) return;
	let body = '';
	try {
		body = (await res.text()).trim();
	} catch (e) {
		// 本文読み取り失敗時も下の throw でフォールバックメッセージは出せる
		console.error(
			'[ensureOkResponse] failed to read response body for error message',
			e,
		);
	}
	throw new Error(
		body || `${fallbackMessageJa}（HTTP ${res.status} ${res.statusText}）`,
	);
}
