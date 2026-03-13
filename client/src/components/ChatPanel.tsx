import { useChat } from '@ai-sdk/react';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import 'katex/dist/katex.min.css';
import {
	Copy,
	Loader2,
	Pencil,
	PlusCircle,
	Send,
	Trash2,
	X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { API_BASE } from '@/lib/utils';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import { useChatImageStore } from '@/stores/chatImageStore';
import { useChatSessionStore } from '@/stores/chatSessionStore';

const mathPlugin = createMathPlugin({ singleDollarTextMath: true });
const streamdownPlugins = { math: mathPlugin, cjk, code, mermaid };

type MessageTurn = {
	id: string;
	messages: any[];
};

interface MessageTurnRowProps {
	turn: MessageTurn;
	allMessages: any[];
	status: string;
	copyMessage: (text: string) => void;
	deleteConversationTurn: (id: string) => void;
	onScrollToTurnTop: () => void;
}

const MessageTurnRow = memo(function MessageTurnRow({
	turn,
	allMessages,
	status,
	copyMessage,
	deleteConversationTurn,
	onScrollToTurnTop,
}: MessageTurnRowProps) {
	return (
		<>
			{turn.messages.map((msg) => {
				const isLastAssistant =
					msg.role === 'assistant' &&
					msg.id === allMessages[allMessages.length - 1]?.id;
				const streaming = isLastAssistant && status === 'streaming';
				const textFromParts =
					msg.parts
						?.filter((p: { type: string }) => p.type === 'text')
						.map((p: { text?: string }) => p.text ?? '')
						.join('') ??
					msg.content ??
					'';
				const assistantText = textFromParts;
				const userText = textFromParts;
				const isFirstInTurn = msg.id === turn.messages[0].id;
				const content = (
					<>
						<div className='flex items-center justify-between gap-1'>
							<span className='text-muted-foreground text-xs font-medium'>
								{msg.role === 'assistant' ? 'アシスタント' : null}
							</span>
							<div className='flex items-center gap-0'>
								{msg.role === 'assistant' && isFirstInTurn && (
									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button
												variant='ghost'
												size='icon'
												className='h-6 w-6 text-muted-foreground hover:text-destructive'
												aria-label='この会話を削除'
												title='この会話を削除'
											>
												<Trash2 className='h-3 w-3' />
											</Button>
										</AlertDialogTrigger>
										<AlertDialogContent size='sm'>
											<AlertDialogHeader>
												<AlertDialogTitle>
													この会話を削除しますか？
												</AlertDialogTitle>
												<AlertDialogDescription>
													この1件の会話（ユーザーとアシスタントのペア）が削除されます。この操作は取り消せません。
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel>キャンセル</AlertDialogCancel>
												<AlertDialogAction
													variant='destructive'
													onClick={() => deleteConversationTurn(turn.id)}
												>
													削除する
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								)}
								{msg.role === 'assistant' && (
									<Button
										variant='ghost'
										size='icon'
										className='h-6 w-6'
										title='この回答をコピー'
										onClick={() => {
											const text =
												msg.parts
													?.map((p: { type: string; text?: string }) =>
														p.type === 'text' ? p.text : '',
													)
													.filter(Boolean)
													.join('') ??
												msg.content ??
												'';
											if (text) copyMessage(text);
										}}
									>
										<Copy className='h-3 w-3' />
									</Button>
								)}
							</div>
						</div>
						{msg.role === 'assistant' ? (
							<Streamdown
								plugins={streamdownPlugins}
								mode={streaming ? 'streaming' : 'static'}
								caret='circle'
								isAnimating={streaming}
							>
								{assistantText}
							</Streamdown>
						) : msg.role === 'user' ? (
							<p className='whitespace-pre-wrap text-sm'>{userText}</p>
						) : null}
					</>
				);
				if (msg.role === 'user') {
					return (
						<div
							key={msg.id}
							className='sticky -top-2 -mt-2 z-20 bg-background/95 pt-1'
						>
							<Accordion
								type='single'
								collapsible
								className='mb-3 ml-4 rounded-lg bg-primary/10 p-2 shadow-sm'
								defaultValue={turn.id}
							>
								<AccordionItem value={turn.id}>
									<AccordionTrigger className='px-0 py-0 border-0 hover:no-underline w-full'>
										<div className='w-full flex flex-col items-stretch gap-0'>
											<div className='flex items-start justify-between gap-1 w-full'>
												<div className='text-left min-w-0 flex-1'>
													<span className='text-muted-foreground text-xs font-medium block mb-1'>
														あなた
													</span>
												</div>
												<div className='flex items-center gap-0 pl-1'>
													{isFirstInTurn && (
														<AlertDialog>
															<AlertDialogTrigger asChild>
																<Button
																	variant='ghost'
																	size='icon'
																	className='h-6 w-6 text-muted-foreground hover:text-destructive'
																	aria-label='この会話を削除'
																	title='この会話を削除'
																>
																	<Trash2 className='h-3 w-3' />
																</Button>
															</AlertDialogTrigger>
															<AlertDialogContent size='sm'>
																<AlertDialogHeader>
																	<AlertDialogTitle>
																		この会話を削除しますか？
																	</AlertDialogTitle>
																	<AlertDialogDescription>
																		この1件の会話（ユーザーとアシスタントのペア）が削除されます。この操作は取り消せません。
																	</AlertDialogDescription>
																</AlertDialogHeader>
																<AlertDialogFooter>
																	<AlertDialogCancel>
																		キャンセル
																	</AlertDialogCancel>
																	<AlertDialogAction
																		variant='destructive'
																		onClick={() =>
																			deleteConversationTurn(turn.id)
																		}
																	>
																		削除する
																	</AlertDialogAction>
																</AlertDialogFooter>
															</AlertDialogContent>
														</AlertDialog>
													)}
													<Button
														variant='ghost'
														size='icon'
														className='h-6 w-6'
														title='このメッセージをコピー'
														onClick={(e) => {
															e.preventDefault();
															e.stopPropagation();
															if (userText) copyMessage(userText);
														}}
													>
														<Copy className='h-3 w-3' />
													</Button>
												</div>
											</div>
											<p className='line-clamp-2 text-sm whitespace-pre-wrap group-aria-expanded/accordion-trigger:hidden mt-0.5 text-left'>
												{userText}
											</p>
										</div>
									</AccordionTrigger>
									<AccordionContent
										onClick={onScrollToTurnTop}
										className='pt-0'
									>
										<div className='relative z-10 pointer-events-none [&_button]:pointer-events-auto'>
											{content}
										</div>
									</AccordionContent>
								</AccordionItem>
							</Accordion>
						</div>
					);
				}
				return (
					<div
						key={msg.id}
						className='mb-3 mr-4 rounded-lg bg-muted/50 p-2 relative'
					>
						{content}
					</div>
				);
			})}
		</>
	);
});

interface Session {
	id: string;
	pdf_id: number | null;
	title: string;
	created_at: string;
	updated_at: string;
}

interface ChatPanelProps {
	pdfId: string | null;
}

export const ChatPanel = memo(function ChatPanel({ pdfId }: ChatPanelProps) {
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

	const apiUrl =
		currentSessionId && typeof API_BASE === 'string'
			? `${API_BASE}/api/chat/sessions/${currentSessionId}/messages`
			: '/api/chat/sessions/__placeholder__/messages';

	const [titleGeneratedForSessionId, setTitleGeneratedForSessionId] = useState<
		string | null
	>(null);
	const [editingTitle, setEditingTitle] = useState(false);
	const [editTitleValue, setEditTitleValue] = useState('');
	const editTitleInputRef = useRef<HTMLInputElement>(null);

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
						const res = await fetch(
							`${API_BASE}/api/chat/sessions/${currentSessionId}/title`,
							{
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: '{}',
							},
						);
						if (res.ok) {
							setTitleGeneratedForSessionId(currentSessionId);
							const { title } = await res.json();
							await fetch(`${API_BASE}/api/chat/sessions/${currentSessionId}`, {
								method: 'PATCH',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ title }),
							});
							fetchSessions();
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
			const res = await fetch(`${API_BASE}/api/chat/sessions`);
			if (res.ok) {
				const data = await res.json();
				setSessions(data);
			}
		} finally {
			setLoadingSessions(false);
		}
	}, []);

	useEffect(() => {
		fetchSessions();
	}, [fetchSessions]);

	useEffect(() => {
		fetch(`${API_BASE}/api/settings/llm`)
			.then((r) => (r.ok ? r.json() : Promise.reject(r)))
			.then((data: { api_key_masked?: boolean }) =>
				setApiKeyConfigured(Boolean(data.api_key_masked)),
			)
			.catch(() => setApiKeyConfigured(false));
	}, [setApiKeyConfigured]);

	useEffect(() => {
		if (currentSessionId) {
			const s = sessions.find((x) => x.id === currentSessionId);
			setCurrentSession(currentSessionId, s?.title ?? '新規チャット');
		} else {
			setCurrentSession(null, '');
		}
	}, [currentSessionId, sessions, setCurrentSession]);

	const currentSession = sessions.find((s) => s.id === currentSessionId);
	const saveTitle = useCallback(async () => {
		if (!currentSessionId || editTitleValue.trim() === '') {
			setEditingTitle(false);
			return;
		}
		const newTitle = editTitleValue.trim();
		try {
			const res = await fetch(
				`${API_BASE}/api/chat/sessions/${currentSessionId}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title: newTitle }),
				},
			);
			if (res.ok) {
				setEditingTitle(false);
				setCurrentSession(currentSessionId, newTitle);
				setSessions((prev) =>
					prev.map((s) =>
						s.id === currentSessionId ? { ...s, title: newTitle } : s,
					),
				);
			}
		} catch {
			setEditingTitle(false);
		}
	}, [currentSessionId, editTitleValue, setCurrentSession]);

	const deleteSession = useCallback(
		async (sessionId: string) => {
			try {
				const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}`, {
					method: 'DELETE',
				});
				if (!res.ok) return;
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
		[currentSessionId, sessions, setCurrentSession],
	);

	useEffect(() => {
		if (editingTitle) {
			setEditTitleValue(currentSession?.title ?? '');
			editTitleInputRef.current?.focus();
		}
	}, [editingTitle]);

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
			fetch(`${API_BASE}/api/chat/sessions/${sessionId}/messages`)
				.then((r) => r.json())
				.then(
					(
						msgs: {
							id: string;
							role: string;
							content_json: { text?: string; parts?: unknown[] };
						}[],
					) => {
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
						setMessages(uiMessages);
						if (msgs.length > 0) setTitleGeneratedForSessionId(sessionId);
					},
				)
				.catch(() => {}),
		[setMessages],
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
			const res = await fetch(`${API_BASE}/api/chat/sessions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					pdf_id: pdfId ? Number(pdfId) : null,
					title: '新規チャット',
				}),
			});
			if (res.ok) {
				const session = await res.json();
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
				turns.push({ id: msg.id, messages: [msg] });
			} else if (msg.role === 'assistant' && turns.length > 0) {
				turns[turns.length - 1].messages.push(msg);
				turns[turns.length - 1].id = turns[turns.length - 1].messages[0].id;
			} else {
				turns.push({ id: msg.id, messages: [msg] });
			}
		}
		return turns;
	}, [messages]);

	const deleteConversationTurn = useCallback(
		async (messageId: string) => {
			if (!currentSessionId) return;
			try {
				const res = await fetch(
					`${API_BASE}/api/chat/sessions/${currentSessionId}/messages/${messageId}`,
					{ method: 'DELETE' },
				);
				if (!res.ok) return;
				await fetchMessages(currentSessionId);
				toast.success('会話を削除しました');
			} catch {
				// ignore
			}
		},
		[currentSessionId, fetchMessages],
	);

	const formRef = useRef<HTMLFormElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const turnRootRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const [textareaHeight, setTextareaHeight] = useState(80);
	const resizeStartY = useRef(0);
	const resizeStartHeight = useRef(0);
	const isResizing = useRef(false);

	const scrollTurnToNaturalTop = useCallback((turnId: string) => {
		const containerEl = scrollContainerRef.current;
		const turnRootEl = turnRootRefs.current.get(turnId);
		if (!containerEl || !turnRootEl) return;
		const containerRect = containerEl.getBoundingClientRect();
		const turnRect = turnRootEl.getBoundingClientRect();
		const targetScrollTop =
			containerEl.scrollTop + (turnRect.top - containerRect.top);
		containerEl.scrollTo({
			top: Math.max(0, targetScrollTop),
			behavior: 'smooth',
		});
	}, []);

	const handleResizeMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			isResizing.current = true;
			resizeStartY.current = e.clientY;
			resizeStartHeight.current = textareaHeight;
			document.body.style.userSelect = 'none';
			document.body.style.cursor = 'ns-resize';
		},
		[textareaHeight],
	);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			if (!isResizing.current) return;
			const delta = resizeStartY.current - e.clientY;
			setTextareaHeight((_h) => {
				const next = resizeStartHeight.current + delta;
				return Math.min(320, Math.max(40, next));
			});
		};
		const onUp = () => {
			isResizing.current = false;
			document.body.style.userSelect = '';
			document.body.style.cursor = '';
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		return () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
	}, []);

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

	const handlePaste = useCallback(
		(e: React.ClipboardEvent<HTMLTextAreaElement>) => {
			const items = e.clipboardData?.items;
			if (!items) return;
			for (const item of items) {
				if (!item.type.startsWith('image/')) continue;
				e.preventDefault();
				const file = item.getAsFile();
				if (!file) continue;
				const reader = new FileReader();
				reader.onload = () => {
					const dataUrl = reader.result;
					if (typeof dataUrl === 'string') addImage(dataUrl);
				};
				reader.readAsDataURL(file);
				break;
			}
		},
		[addImage],
	);

	return (
		<div className='flex h-full flex-col'>
			<div className='flex items-center justify-between gap-2 border-b border-border px-2 py-1'>
				<span className='text-muted-foreground text-xs'>セッション</span>
				<Button
					variant='ghost'
					size='sm'
					onClick={createSession}
					title='新しいセッションを作成'
				>
					<PlusCircle className='h-4 w-4' />
					新規
				</Button>
			</div>
			{loadingSessions ? (
				<p className='text-muted-foreground p-2 text-sm'>読み込み中...</p>
			) : (
				<div className='space-y-1 px-2'>
					<div className='flex items-center gap-1'>
						{editingTitle && currentSessionId ? (
							<input
								ref={editTitleInputRef}
								type='text'
								value={editTitleValue}
								onChange={(e) => setEditTitleValue(e.target.value)}
								onBlur={saveTitle}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										saveTitle();
									}
									if (e.key === 'Escape') {
										setEditingTitle(false);
										setEditTitleValue(currentSession?.title ?? '');
									}
								}}
								className='border-border bg-background text-foreground flex-1 rounded border px-2 py-1 text-sm'
								placeholder='タイトル'
							/>
						) : (
							<>
								<select
									className='border-border bg-background text-foreground min-w-0 flex-1 rounded border px-2 py-1 text-sm'
									value={currentSessionId ?? ''}
									onChange={(e) => {
										const id = e.target.value || null;
										setCurrentSessionId(id);
										setEditingTitle(false);
										const s = sessions.find((x) => x.id === id);
										setCurrentSession(id, s?.title ?? '');
									}}
								>
									<option value=''>選択してください</option>
									{sessions.map((s) => (
										<option key={s.id} value={s.id}>
											{s.title}
										</option>
									))}
								</select>
								{currentSessionId && (
									<>
										<Button
											variant='ghost'
											size='icon'
											className='h-7 w-7 shrink-0'
											aria-label='タイトルを編集'
											title='タイトルを編集'
											onClick={() => setEditingTitle(true)}
										>
											<Pencil className='h-3.5 w-3.5' />
										</Button>
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													variant='ghost'
													size='icon'
													className='h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive'
													aria-label='セッションを削除'
													title='このセッションを削除'
												>
													<Trash2 className='h-3.5 w-3.5' />
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent size='sm'>
												<AlertDialogHeader>
													<AlertDialogTitle>
														このセッションを削除しますか？
													</AlertDialogTitle>
													<AlertDialogDescription>
														このセッション内のすべての会話が削除されます。この操作は取り消せません。
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>キャンセル</AlertDialogCancel>
													<AlertDialogAction
														variant='destructive'
														onClick={() => deleteSession(currentSessionId)}
													>
														削除する
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									</>
								)}
							</>
						)}
					</div>
				</div>
			)}

			<div ref={scrollContainerRef} className='flex-1 overflow-auto p-2'>
				{messageTurns.map((turn) => (
					<div
						key={turn.id}
						className='mb-3 group/turn'
						data-turn-id={turn.id}
						ref={(el) => {
							if (el) {
								turnRootRefs.current.set(turn.id, el);
							} else {
								turnRootRefs.current.delete(turn.id);
							}
						}}
					>
						<MessageTurnRow
							turn={turn}
							allMessages={messages}
							status={status}
							copyMessage={copyMessage}
							deleteConversationTurn={deleteConversationTurn}
							onScrollToTurnTop={() => scrollTurnToNaturalTop(turn.id)}
						/>
					</div>
				))}
				{showThinkingPlaceholder && (
					<div
						key='thinking-placeholder'
						className='mb-3 rounded-lg bg-muted/50 mr-4 p-2'
					>
						<div className='flex items-center justify-between gap-1'>
							<span className='text-muted-foreground text-xs font-medium'>
								アシスタント
							</span>
						</div>
						<div className='flex items-center gap-2 pt-1'>
							<Loader2
								className='h-4 w-4 shrink-0 animate-spin text-muted-foreground'
								aria-hidden
							/>
							<span className='text-muted-foreground text-sm'>考え中...</span>
						</div>
					</div>
				)}
			</div>

			{error && (
				<p className='text-destructive px-2 text-sm'>{error.message}</p>
			)}

			{apiKeyConfigured === false && (
				<p className='text-muted-foreground border-border border-t px-2 py-1.5 text-sm'>
					APIキーが未設定です。設定からAPIキーを設定してください。
				</p>
			)}

			<form
				ref={formRef}
				onSubmit={sendWithAttachments}
				className='border-t border-border p-2'
			>
				{pendingImages.length > 0 && (
					<div className='mb-1 flex flex-wrap gap-1'>
						{pendingImages.map((url, i) => (
							<div key={i} className='relative shrink-0'>
								<img
									src={url}
									alt=''
									className='h-12 w-12 rounded object-cover'
								/>
								<Button
									type='button'
									variant='secondary'
									size='icon'
									className='absolute -right-1 -top-1 h-5 w-5 rounded-full border border-border shadow'
									aria-label='画像を削除'
									title='この画像を削除'
									onClick={() => removeImage(i)}
								>
									<X className='h-3 w-3' />
								</Button>
							</div>
						))}
					</div>
				)}
				<div className='flex gap-1 items-stretch'>
					<div
						className='relative flex min-w-0 flex-1 flex-col'
						style={{ height: textareaHeight }}
					>
						<div
							className='absolute left-0 right-0 top-0 z-10 flex h-3 cursor-ns-resize touch-none select-none items-center justify-center group'
							onMouseDown={handleResizeMouseDown}
							title='ドラッグで高さを変更'
							style={{ cursor: 'ns-resize' }}
							// biome-ignore lint/a11y/useAriaPropsForRole: <explanation>
							role='slider'
							aria-label='高さを変更'
							tabIndex={0}
						>
							<span className='rounded-full bg-muted-foreground/30 h-1 w-10 group-hover:bg-muted-foreground/60' />
						</div>
						<textarea
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onPaste={handlePaste}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey && canSend) {
									e.preventDefault();
									formRef.current?.requestSubmit();
								}
							}}
							placeholder='メッセージを入力...'
							className='border-border bg-background text-foreground min-h-0 w-full flex-1 resize-none rounded border px-2 py-1 pt-3 text-sm'
						/>
					</div>
					<Button
						type='submit'
						size='icon'
						disabled={!canSend}
						title={isLoading ? '送信中...' : 'メッセージを送信'}
						aria-label='メッセージを送信'
					>
						{isLoading ? (
							<Loader2 className='h-4 w-4 animate-spin' aria-label='送信中' />
						) : (
							<Send className='h-4 w-4' />
						)}
					</Button>
				</div>
			</form>
		</div>
	);
});
