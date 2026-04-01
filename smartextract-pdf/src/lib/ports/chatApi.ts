import type { Session } from '@/components/chat/chatTypes';

export type StoredChatMessage = {
	id: string;
	role: string;
	content_json: { text?: string; parts?: unknown[] };
};

export interface ChatApi {
	listSessions(): Promise<Session[]>;
	createSession(params: {
		pdfId: number | null;
		title: string;
	}): Promise<Session>;
	updateSessionTitle(sessionId: string, title: string): Promise<void>;
	deleteSession(sessionId: string): Promise<void>;
	listMessages(sessionId: string): Promise<StoredChatMessage[]>;
	deleteMessage(sessionId: string, messageId: string): Promise<void>;
	/** POST /title。404 のときのみ null（提案なし）、それ以外の失敗は throw */
	suggestSessionTitle(sessionId: string): Promise<{ title: string } | null>;
	/** `useChat` の `api` 用。セッション未選択時はプレースホルダー URL */
	messagesStreamUrl(sessionId: string | null): string;
}
