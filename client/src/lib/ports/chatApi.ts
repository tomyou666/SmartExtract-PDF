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
	}): Promise<Session | null>;
	updateSessionTitle(sessionId: string, title: string): Promise<boolean>;
	deleteSession(sessionId: string): Promise<boolean>;
	listMessages(sessionId: string): Promise<StoredChatMessage[]>;
	deleteMessage(sessionId: string, messageId: string): Promise<boolean>;
	/** POST /title。失敗時は null */
	suggestSessionTitle(sessionId: string): Promise<{ title: string } | null>;
	/** `useChat` の `api` 用。セッション未選択時はプレースホルダー URL */
	messagesStreamUrl(sessionId: string | null): string;
}
