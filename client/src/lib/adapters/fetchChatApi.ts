import type { Session } from '@/components/chat/chatTypes';
import { ensureOkResponse } from '@/lib/ensureOkResponse';
import type { ChatApi, StoredChatMessage } from '@/lib/ports/chatApi';
import { apiUrl } from '@/lib/ports/urlJoin';

export function createFetchChatApi(baseUrl: string): ChatApi {
	return {
		messagesStreamUrl(sessionId: string | null): string {
			if (sessionId) {
				return apiUrl(baseUrl, `/api/chat/sessions/${sessionId}/messages`);
			}
			return '/api/chat/sessions/__placeholder__/messages';
		},

		async listSessions(): Promise<Session[]> {
			const res = await fetch(apiUrl(baseUrl, '/api/chat/sessions'));
			await ensureOkResponse(res, 'チャットセッション一覧の取得に失敗しました');
			return res.json();
		},

		async createSession(params: {
			pdfId: number | null;
			title: string;
		}): Promise<Session> {
			const res = await fetch(apiUrl(baseUrl, '/api/chat/sessions'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					pdf_id: params.pdfId,
					title: params.title,
				}),
			});
			await ensureOkResponse(res, 'チャットセッションの作成に失敗しました');
			return res.json();
		},

		async updateSessionTitle(sessionId: string, title: string): Promise<void> {
			const res = await fetch(
				apiUrl(baseUrl, `/api/chat/sessions/${sessionId}`),
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title }),
				},
			);
			await ensureOkResponse(res, 'セッションタイトルの更新に失敗しました');
		},

		async deleteSession(sessionId: string): Promise<void> {
			const res = await fetch(
				apiUrl(baseUrl, `/api/chat/sessions/${sessionId}`),
				{ method: 'DELETE' },
			);
			await ensureOkResponse(res, 'チャットセッションの削除に失敗しました');
		},

		async listMessages(sessionId: string): Promise<StoredChatMessage[]> {
			const res = await fetch(
				apiUrl(baseUrl, `/api/chat/sessions/${sessionId}/messages`),
			);
			await ensureOkResponse(res, 'メッセージ一覧の取得に失敗しました');
			return res.json();
		},

		async deleteMessage(sessionId: string, messageId: string): Promise<void> {
			const res = await fetch(
				apiUrl(
					baseUrl,
					`/api/chat/sessions/${sessionId}/messages/${messageId}`,
				),
				{ method: 'DELETE' },
			);
			await ensureOkResponse(res, 'メッセージの削除に失敗しました');
		},

		async suggestSessionTitle(
			sessionId: string,
		): Promise<{ title: string } | null> {
			const res = await fetch(
				apiUrl(baseUrl, `/api/chat/sessions/${sessionId}/title`),
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: '{}',
				},
			);
			if (res.status === 404) return null;
			await ensureOkResponse(res, 'セッションタイトルの提案に失敗しました');
			return res.json();
		},
	};
}
