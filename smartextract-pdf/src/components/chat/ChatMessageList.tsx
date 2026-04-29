import { Loader2 } from 'lucide-react';
import { type RefObject, useCallback, useRef } from 'react';
import { ChatMessageTurnRow } from './ChatMessageTurnRow';
import type { ChatMessage, MessageTurn } from './chatTypes';

interface ChatMessageListProps {
	messageTurns: MessageTurn[];
	messages: ChatMessage[];
	status: string;
	copyMessage: (text: string) => void;
	deleteConversationTurn: (id: string) => void;
	copyBlockContentRef: RefObject<Map<string, string>>;
	showThinkingPlaceholder: boolean;
}

export function ChatMessageList({
	messageTurns,
	messages,
	status,
	copyMessage,
	deleteConversationTurn,
	copyBlockContentRef,
	showThinkingPlaceholder,
}: ChatMessageListProps) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const turnRootRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

	const handleCopy = useCallback(
		(e: React.ClipboardEvent<HTMLDivElement>) => {
			// Only apply when the Streamdown rendering is stable.
			if (status === 'streaming' || status === 'submitted') return;

			const sel = window.getSelection();
			if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

			// Avoid hijacking copy inside form controls.
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			if (
				tag === 'textarea' ||
				tag === 'input' ||
				tag === 'button' ||
				tag === 'select' ||
				target?.closest?.('[role="dialog"]')
			) {
				return;
			}

			const range = sel.getRangeAt(0);

			const getClosestCopyBlock = (n: Node): HTMLElement | null => {
				const el =
					n instanceof Element
						? n
						: n.parentElement instanceof HTMLElement
							? n.parentElement
							: null;
				return el?.closest?.('[data-sd-copy-block="1"]') ?? null;
			};

			const startBlockEl = getClosestCopyBlock(range.startContainer);
			const endBlockEl = getClosestCopyBlock(range.endContainer);
			if (!startBlockEl || !endBlockEl) {
				return;
			}

			const startMsgId = startBlockEl.getAttribute('data-sd-copy-msg-id');
			const endMsgId = endBlockEl.getAttribute('data-sd-copy-msg-id');
			if (!startMsgId || startMsgId !== endMsgId) {
				return;
			}

			const containerEl = scrollContainerRef.current;
			if (!containerEl) return;

			const blockEls = Array.from(
				containerEl.querySelectorAll<HTMLElement>(
					`[data-sd-copy-block="1"][data-sd-copy-msg-id="${startMsgId}"]`,
				),
			);
			if (blockEls.length === 0) {
				return;
			}

			const startIdx = blockEls.indexOf(startBlockEl);
			const endIdx = blockEls.indexOf(endBlockEl);
			if (startIdx < 0 || endIdx < 0) {
				return;
			}

			const firstIdx = Math.min(startIdx, endIdx);
			const lastIdx = Math.max(startIdx, endIdx);

			const rawParts: string[] = [];
			for (let i = firstIdx; i <= lastIdx; i++) {
				const key = blockEls[i].getAttribute('data-sd-copy-key');
				if (!key) continue;
				rawParts.push(copyBlockContentRef.current.get(key) ?? '');
			}

			const rawText = rawParts.join('');
			if (!rawText) {
				return;
			}

			// Expand selection to the group boundaries (best-effort).
			try {
				const expandedRange = document.createRange();
				expandedRange.setStartBefore(blockEls[firstIdx]);
				expandedRange.setEndAfter(blockEls[lastIdx]);
				sel.removeAllRanges();
				sel.addRange(expandedRange);
			} catch (e) {
				// 選択境界が DOM とずれると Range が失敗しうる。clipboard には rawText をそのまま渡すので致命的ではない
				console.warn('[ChatMessageList] expand selection to copy blocks', e);
			}

			e.preventDefault();
			e.clipboardData.setData('text/plain', rawText);
		},
		[status, copyBlockContentRef],
	);

	return (
		<div
			ref={scrollContainerRef}
			className='flex-1 overflow-auto p-2'
			onCopy={handleCopy}
		>
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
					<ChatMessageTurnRow
						turn={turn}
						allMessages={messages}
						status={status}
						copyMessage={copyMessage}
						deleteConversationTurn={deleteConversationTurn}
						onScrollToTurnTop={() => scrollTurnToNaturalTop(turn.id)}
						copyBlockContentRef={copyBlockContentRef}
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
	);
}
