import type { Session } from '@/components/chat/chatTypes';
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
			if (!res.ok) {
				throw new Error(res.statusText || 'Failed to list sessions');
			}
			return res.json();
		},

		async createSession(params: {
			pdfId: number | null;
			title: string;
		}): Promise<Session | null> {
			try {
				const res = await fetch(apiUrl(baseUrl, '/api/chat/sessions'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						pdf_id: params.pdfId,
						title: params.title,
					}),
				});
				if (!res.ok) return null;
				return res.json();
			} catch {
				return null;
			}
		},

		async updateSessionTitle(
			sessionId: string,
			title: string,
		): Promise<boolean> {
			try {
				const res = await fetch(
					apiUrl(baseUrl, `/api/chat/sessions/${sessionId}`),
					{
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ title }),
					},
				);
				return res.ok;
			} catch {
				return false;
			}
		},

		async deleteSession(sessionId: string): Promise<boolean> {
			try {
				const res = await fetch(
					apiUrl(baseUrl, `/api/chat/sessions/${sessionId}`),
					{ method: 'DELETE' },
				);
				return res.ok;
			} catch {
				return false;
			}
		},

		async listMessages(sessionId: string): Promise<StoredChatMessage[]> {
			const res = await fetch(
				apiUrl(baseUrl, `/api/chat/sessions/${sessionId}/messages`),
			);
			if (!res.ok) {
				throw new Error(res.statusText || 'Failed to list messages');
			}
			return res.json();
		},

		async deleteMessage(
			sessionId: string,
			messageId: string,
		): Promise<boolean> {
			try {
				const res = await fetch(
					apiUrl(
						baseUrl,
						`/api/chat/sessions/${sessionId}/messages/${messageId}`,
					),
					{ method: 'DELETE' },
				);
				return res.ok;
			} catch {
				return false;
			}
		},

		async suggestSessionTitle(
			sessionId: string,
		): Promise<{ title: string } | null> {
			try {
				const res = await fetch(
					apiUrl(baseUrl, `/api/chat/sessions/${sessionId}/title`),
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: '{}',
					},
				);
				if (!res.ok) return null;
				return res.json();
			} catch {
				return null;
			}
		},
	};
}
