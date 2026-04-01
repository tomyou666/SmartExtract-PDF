import { Loader2, Send, X } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface ChatComposerProps {
	input: string;
	setInput: (value: string) => void;
	pendingImages: string[];
	addImage: (dataUrl: string) => void;
	removeImage: (index: number) => void;
	canSend: boolean;
	isLoading: boolean;
	onSubmit: (e: React.FormEvent) => void | Promise<void>;
}

export const ChatComposer = memo(function ChatComposer({
	input,
	setInput,
	pendingImages,
	addImage,
	removeImage,
	canSend,
	isLoading,
	onSubmit,
}: ChatComposerProps) {
	const formRef = useRef<HTMLFormElement>(null);

	const [textareaHeight, setTextareaHeight] = useState(80);
	const resizeStartY = useRef(0);
	const resizeStartHeight = useRef(0);
	const isResizing = useRef(false);

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
		<form
			ref={formRef}
			onSubmit={onSubmit}
			className='border-t border-border p-2'
		>
			{pendingImages.length > 0 && (
				<div className='mb-1 flex flex-wrap gap-1'>
					{pendingImages.map((url, i) => (
						<div key={url} className='relative shrink-0'>
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
						// biome-ignore lint/a11y/useAriaPropsForRole: false positive
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
	);
});
