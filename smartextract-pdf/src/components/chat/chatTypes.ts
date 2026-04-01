export type Session = {
	id: string;
	pdf_id: number | null;
	title: string;
	created_at: string;
	updated_at: string;
};

export type ChatMessagePart = {
	type: string;
	text?: string;
};

export type ChatMessage = {
	id: string;
	role: string;
	content?: string;
	parts?: ChatMessagePart[];
};

// 1ターン = user + 直後の assistant（最大1件）をまとめたUI単位
export type MessageTurn = {
	id: string;
	messages: ChatMessage[];
};
