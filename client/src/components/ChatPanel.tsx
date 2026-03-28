import { useChat } from '@ai-sdk/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useChatApi, useLlmSettingsApi } from '@/contexts/AppApiContext';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import { useChatImageStore } from '@/stores/chatImageStore';
import { useChatSessionStore } from '@/stores/chatSessionStore';
import { ChatComposer } from './chat/ChatComposer';
import { ChatMessageList } from './chat/ChatMessageList';
import { ChatSessionControls } from './chat/ChatSessionControls';
import type { ChatMessage, MessageTurn, Session } from './chat/chatTypes';

interface ChatPanelProps {
	pdfId: string | null;
}

export const ChatPanel = memo(function ChatPanel({ pdfId }: ChatPanelProps) {
	const chat = useChatApi();
	const llmSettings = useLlmSettingsApi();
	const [sessions, setSessions] = useState<Session[]>([]);
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [loadingSessions, setLoadingSessions] = useState(true);
	const apiKeyConfigured = useApiKeyStore((s) => s.apiKeyConfigured);
	const setApiKeyConfigured = useApiKeyStore((s) => s.setApiKeyConfigured);
	const [pendingFirstMessage, setPendingFirstMessage] = useState<{
		text: string;
		attachments?: { url: string; contentType: string }[];
	} | null>(null);
	const pendingImages = useChatImageStore((s) => s.pendingImages);
	const addImage = useChatImageStore((s) => s.addImage);
	const removeImage = useChatImageStore((s) => s.removeImage);
	const clearImages = useChatImageStore((s) => s.clearImages);
	const setCurrentSession = useChatSessionStore((s) => s.setCurrentSession);

	// Map used to translate "copy group key" -> original block text (content)
	// assigned by Streamdown's BlockComponent wrapper.
	const copyBlockContentRef = useRef<Map<string, string>>(new Map());

	const apiUrl = chat.messagesStreamUrl(currentSessionId);

	const [titleGeneratedForSessionId, setTitleGeneratedForSessionId] = useState<
		string | null
	>(null);

	const { messages, append, setMessages, status, error, setInput, input } =
		useChat({
			api: apiUrl,
			id: currentSessionId ?? undefined,
			streamProtocol: 'text',
			initialMessages: [],
			onFinish: async () => {
				if (!currentSessionId) return;
				try {
					if (titleGeneratedForSessionId !== currentSessionId) {
						const suggested = await chat.suggestSessionTitle(currentSessionId);
						if (suggested) {
							setTitleGeneratedForSessionId(currentSessionId);
							await chat.updateSessionTitle(currentSessionId, suggested.title);
							await fetchSessions();
						}
					}
					// 送信済みメッセージにサーバー側の id を反映するため再取得
					await fetchMessages(currentSessionId);
				} catch {
					// ignore
				}
			},
		});

	const fetchSessions = useCallback(async () => {
		try {
			const data = await chat.listSessions();
			setSessions(data);
		} catch {
			// 失敗時は既存の一覧を維持（従来の fetch + res.ok と同じ）
		} finally {
			setLoadingSessions(false);
		}
	}, [chat]);

	useEffect(() => {
		fetchSessions();
	}, [fetchSessions]);

	useEffect(() => {
		llmSettings
			.getSettings()
			.then((data) => setApiKeyConfigured(Boolean(data?.api_key_masked)))
			.catch(() => setApiKeyConfigured(false));
	}, [llmSettings, setApiKeyConfigured]);

	useEffect(() => {
		if (currentSessionId) {
			const s = sessions.find((x) => x.id === currentSessionId);
			setCurrentSession(currentSessionId, s?.title ?? '新規チャット');
		} else {
			setCurrentSession(null, '');
		}
	}, [currentSessionId, sessions, setCurrentSession]);

	const currentSession = sessions.find((s) => s.id === currentSessionId);
	const updateTitle = useCallback(
		async (newTitle: string) => {
			if (!currentSessionId) return;
			const trimmed = newTitle.trim();
			if (trimmed === '') return;
			try {
				const ok = await chat.updateSessionTitle(currentSessionId, trimmed);
				if (ok) {
					setCurrentSession(currentSessionId, trimmed);
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentSessionId ? { ...s, title: trimmed } : s,
						),
					);
				}
			} catch {
				// ignore
			}
		},
		[chat, currentSessionId, setCurrentSession],
	);

	const deleteSession = useCallback(
		async (sessionId: string) => {
			try {
				const ok = await chat.deleteSession(sessionId);
				if (!ok) return;
				setSessions((prev) => prev.filter((s) => s.id !== sessionId));
				if (currentSessionId === sessionId) {
					const remaining = sessions.filter((s) => s.id !== sessionId);
					const nextId = remaining[0]?.id ?? null;
					const nextTitle = remaining[0]?.title ?? '';
					setCurrentSessionId(nextId);
					setCurrentSession(nextId, nextTitle);
				}
				toast.success('セッションを削除しました');
			} catch {
				// ignore
			}
		},
		[chat, currentSessionId, sessions, setCurrentSession],
	);

	useEffect(() => {
		if (pendingFirstMessage && currentSessionId && messages.length === 0) {
			const { text, attachments } = pendingFirstMessage;
			setPendingFirstMessage(null);
			if (attachments) clearImages();
			append(
				{
					role: 'user',
					content: text || '(画像のみ)',
					experimental_attachments: attachments,
				},
				{ body: {} },
			);
		}
	}, [
		currentSessionId,
		pendingFirstMessage,
		messages.length,
		append,
		clearImages,
	]);

	const fetchMessages = useCallback(
		(sessionId: string, options?: { isCancelled?: () => boolean }) =>
			chat
				.listMessages(sessionId)
				.then((msgs) => {
					if (options?.isCancelled?.()) return;
					const uiMessages = msgs.map((m) => ({
						id: m.id,
						role: m.role as 'user' | 'assistant' | 'system',
						content: m.content_json?.text ?? '',
						parts:
							m.content_json?.parts ??
							(m.content_json?.text
								? [{ type: 'text' as const, text: m.content_json.text }]
								: []),
					}));
					// `parts` の型がサーバレスポンス由来で推論しきれないため、UI表示に必要な最低限の形として扱う
					setMessages(uiMessages as unknown as typeof messages);
					if (msgs.length > 0) setTitleGeneratedForSessionId(sessionId);
				})
				.catch(() => {}),
		[chat, setMessages],
	);

	useEffect(() => {
		if (!currentSessionId) {
			setMessages([]);
			return;
		}
		let cancelled = false;
		fetchMessages(currentSessionId, { isCancelled: () => cancelled });
		return () => {
			cancelled = true;
		};
	}, [currentSessionId, fetchMessages, setMessages]);

	const createSession = async () => {
		try {
			const session = await chat.createSession({
				pdfId: pdfId ? Number(pdfId) : null,
				title: '新規チャット',
			});
			if (session) {
				setSessions((prev) => [session, ...prev]);
				setCurrentSessionId(session.id);
				setCurrentSession(session.id, session.title);
			}
		} catch {
			// ignore
		}
	};

	const copyMessage = (text: string) => {
		navigator.clipboard
			.writeText(text)
			.then(() => {
				toast.success('コピーしました');
			})
			.catch(() => {
				// ignore
			});
	};

	// 1会話 = user + 直後の assistant（1ターン）にまとめる
	const messageTurns = useMemo(() => {
		const turns: MessageTurn[] = [];
		for (const msg of messages) {
			if (msg.role === 'user') {
				turns.push({
					id: msg.id,
					messages: [msg as unknown as ChatMessage],
				});
			} else if (msg.role === 'assistant' && turns.length > 0) {
				turns[turns.length - 1].messages.push(msg as unknown as ChatMessage);
				turns[turns.length - 1].id = turns[turns.length - 1].messages[0].id;
			} else {
				turns.push({
					id: msg.id,
					messages: [msg as unknown as ChatMessage],
				});
			}
		}
		return turns;
	}, [messages]);

	const deleteConversationTurn = useCallback(
		async (messageId: string) => {
			if (!currentSessionId) return;
			try {
				const ok = await chat.deleteMessage(currentSessionId, messageId);
				if (!ok) return;
				await fetchMessages(currentSessionId);
				toast.success('会話を削除しました');
			} catch {
				// ignore
			}
		},
		[chat, currentSessionId, fetchMessages],
	);

	const sendWithAttachments = async (e: React.FormEvent) => {
		e.preventDefault();
		const text =
			(e.target as HTMLFormElement).querySelector('textarea')?.value?.trim() ??
			input.trim();
		const attachments =
			pendingImages.length > 0
				? pendingImages.map((url) => ({
						url,
						contentType: 'image/png' as const,
					}))
				: undefined;
		if (text === '' && !attachments) return;
		setInput('');
		if (!currentSessionId) {
			setPendingFirstMessage({ text, attachments });
			await createSession();
			return;
		}
		if (attachments) clearImages();
		await append(
			{
				role: 'user',
				content: text || '(画像のみ)',
				experimental_attachments: attachments,
			},
			{ body: {} },
		);
	};

	const isLoading = status === 'submitted' || status === 'streaming';
	const canSend =
		apiKeyConfigured !== false &&
		!isLoading &&
		(input.trim().length > 0 || pendingImages.length > 0);
	const showThinkingPlaceholder =
		status === 'submitted' &&
		messages.length > 0 &&
		messages[messages.length - 1]?.role === 'user';

	return (
		<div className='flex h-full flex-col'>
			<ChatSessionControls
				loadingSessions={loadingSessions}
				sessions={sessions}
				currentSessionId={currentSessionId}
				currentSessionTitle={currentSession?.title ?? ''}
				onCreateSession={createSession}
				onSelectSession={(id) => {
					setCurrentSessionId(id);
					if (id) {
						const s = sessions.find((x) => x.id === id);
						setCurrentSession(id, s?.title ?? '新規チャット');
					} else {
						setCurrentSession(null, '');
					}
				}}
				onUpdateTitle={updateTitle}
				onDeleteSession={deleteSession}
			/>

			<ChatMessageList
				messageTurns={messageTurns}
				messages={messages as unknown as ChatMessage[]}
				status={status}
				copyMessage={copyMessage}
				deleteConversationTurn={deleteConversationTurn}
				copyBlockContentRef={copyBlockContentRef}
				showThinkingPlaceholder={showThinkingPlaceholder}
			/>

			{error && (
				<p className='text-destructive px-2 text-sm'>{error.message}</p>
			)}

			{apiKeyConfigured === false && (
				<p className='text-muted-foreground border-border border-t px-2 py-1.5 text-sm'>
					APIキーが未設定です。設定からAPIキーを設定してください。
				</p>
			)}

			<ChatComposer
				input={input}
				setInput={setInput}
				pendingImages={pendingImages}
				addImage={addImage}
				removeImage={removeImage}
				canSend={canSend}
				isLoading={isLoading}
				onSubmit={sendWithAttachments}
			/>
		</div>
	);
});
