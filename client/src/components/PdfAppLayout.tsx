import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, MessageSquare, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar, RightSidebarHeader } from './RightSidebar';
import { BottomBar } from './BottomBar';
import { LLMSettingsSheet } from './LLMSettingsSheet';

interface PdfAppLayoutProps {
	pdfArea: ReactNode;
	pdfId: string | null;
	onPdfSelect: (id: number) => void;
	onPdfDelete?: (deletedId: number) => void;
}

const RIGHT_SIDEBAR_MIN = 200;
const RIGHT_SIDEBAR_DEFAULT = 320;

export function PdfAppLayout({
	pdfArea,
	pdfId,
	onPdfSelect,
	onPdfDelete,
}: PdfAppLayoutProps) {
	const [leftOpen, setLeftOpen] = useState(true);
	const [rightOpen, setRightOpen] = useState(true);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [rightSidebarWidth, setRightSidebarWidth] = useState(
		RIGHT_SIDEBAR_DEFAULT,
	);
	const [isResizing, setIsResizing] = useState(false);
	const startXRef = useRef(0);
	const startWidthRef = useRef(0);

	const handleResizeStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setIsResizing(true);
			startXRef.current = e.clientX;
			startWidthRef.current = rightSidebarWidth;
		},
		[rightSidebarWidth],
	);

	const handleMouseMove = useCallback((e: MouseEvent) => {
		const delta = startXRef.current - e.clientX;
		const next = startWidthRef.current + delta;
		setRightSidebarWidth(Math.max(RIGHT_SIDEBAR_MIN, next));
	}, []);

	const handleMouseUp = useCallback(() => {
		setIsResizing(false);
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
	}, [handleMouseMove]);

	const attachResizeListeners = useCallback(() => {
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}, [handleMouseMove, handleMouseUp]);

	const handleResizeStartWithListeners = useCallback(
		(e: React.MouseEvent) => {
			handleResizeStart(e);
			attachResizeListeners();
		},
		[handleResizeStart, attachResizeListeners],
	);

	useEffect(() => {
		if (!isResizing) return;
		const prevCursor = document.body.style.cursor;
		const prevSelect = document.body.style.userSelect;
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
		return () => {
			document.body.style.cursor = prevCursor;
			document.body.style.userSelect = prevSelect;
		};
	}, [isResizing]);

	return (
		<div className='flex h-screen flex-col bg-background'>
			<div className='flex flex-1 overflow-hidden'>
				{/* Left sidebar */}
				<aside
					className={cn(
						'flex flex-col border-r border-border bg-muted/30 transition-[width]',
						leftOpen ? 'w-64' : 'w-14',
					)}
				>
					<div className='flex h-12 items-center gap-1 border-b border-border px-2'>
						<Button
							variant='ghost'
							size='icon'
							onClick={() => setLeftOpen((o) => !o)}
							aria-label={leftOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
						>
							<Menu className='h-5 w-5' />
						</Button>
						{leftOpen && <span className='text-sm font-medium'>メニュー</span>}
					</div>
					{leftOpen && (
						<div className='flex flex-1 flex-col overflow-auto p-2'>
							<LeftSidebar
								onPdfSelect={onPdfSelect}
								onPdfDelete={onPdfDelete}
							/>
							<Button
								variant='ghost'
								size='sm'
								className='mt-auto'
								onClick={() => setSettingsOpen(true)}
							>
								<Settings className='mr-1 h-4 w-4' />
								設定
							</Button>
						</div>
					)}
				</aside>
				<LLMSettingsSheet
					open={settingsOpen}
					onClose={() => setSettingsOpen(false)}
				/>

				{/* Center: PDF */}
				<main className='flex flex-1 flex-col overflow-hidden min-w-0'>
					<div className='flex-1 overflow-auto bg-muted/20'>{pdfArea}</div>
					<BottomBar pdfId={pdfId} />
				</main>

				{/* Right sidebar resize handle */}
				{rightOpen && (
					<div
						role='separator'
						aria-orientation='vertical'
						aria-label='右サイドバーの幅を変更'
						className={cn(
							'w-1 shrink-0 cursor-col-resize border-l border-border bg-border/50 hover:bg-primary/30 active:bg-primary/50 transition-colors',
							isResizing && 'bg-primary/50',
						)}
						onMouseDown={handleResizeStartWithListeners}
						style={{ touchAction: 'none' }}
					/>
				)}

				{/* Right sidebar */}
				<aside
					className={cn(
						'flex flex-col border-l border-border bg-muted/30 shrink-0',
						!rightOpen && 'w-14 transition-[width]',
					)}
					style={
						rightOpen
							? {
									width: rightSidebarWidth,
									minWidth: RIGHT_SIDEBAR_MIN,
								}
							: undefined
					}
				>
					<div className='flex h-12 items-center justify-between border-b border-border px-2'>
						<div className='flex items-center gap-2'>
							<Button
								variant='ghost'
								size='icon'
								onClick={() => setRightOpen((o) => !o)}
								aria-label={
									rightOpen ? '右サイドバーを閉じる' : '右サイドバーを開く'
								}
							>
								<Menu className='h-5 w-5' />
							</Button>
							{rightOpen && (
								<span className='flex items-center gap-2 text-sm font-semibold'>
									<MessageSquare className='h-4 w-4' />
									チャット
								</span>
							)}
						</div>
						{rightOpen && <RightSidebarHeader />}
					</div>
					{rightOpen && (
						<div className='flex flex-1 flex-col overflow-hidden'>
							<RightSidebar pdfId={pdfId} />
						</div>
					)}
				</aside>
			</div>
		</div>
	);
}
