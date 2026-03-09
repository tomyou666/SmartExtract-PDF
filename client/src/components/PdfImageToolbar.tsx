import {
	Copy,
	ImagePlus,
	Sparkles,
	Square,
	SquarePlus,
	Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getLayoutForPage } from '@/lib/autoSelection';
import {
	copyImageDataUrlToClipboard,
	getCurrentPageImageDataUrl,
	getSelectionImageDataUrl,
} from '@/lib/pdfImage';
import { useChatImageStore } from '@/stores/chatImageStore';
import { usePdfViewerStore } from '@/stores/pdfViewerStore';

interface PdfImageToolbarProps {
	pdfId: string | null;
}

export function PdfImageToolbar({ pdfId }: PdfImageToolbarProps) {
	const pageIndex = usePdfViewerStore((s) => s.pageIndex);
	const pageCanvases = usePdfViewerStore((s) => s.pageCanvases);
	const selectionRects = usePdfViewerStore((s) => s.selectionRects);
	const selectionMode = usePdfViewerStore((s) => s.selectionMode);
	const setSelectionMode = usePdfViewerStore((s) => s.setSelectionMode);
	const isDrawingMode = usePdfViewerStore((s) => s.isDrawingMode);
	const setDrawingMode = usePdfViewerStore((s) => s.setDrawingMode);
	const clearSelectionRects = usePdfViewerStore((s) => s.clearSelectionRects);
	const replaceSelectionRectsForPage = usePdfViewerStore(
		(s) => s.replaceSelectionRectsForPage,
	);
	const setLastAutoOrderedRects = usePdfViewerStore(
		(s) => s.setLastAutoOrderedRects,
	);
	const addImage = useChatImageStore((s) => s.addImage);
	const [autoSelecting, setAutoSelecting] = useState(false);

	const addCurrentPageAsImage = () => {
		const url = getCurrentPageImageDataUrl(pageCanvases, pageIndex);
		if (url) addImage(url);
	};

	const addSelectionAsImage = () => {
		const url = getSelectionImageDataUrl(pageCanvases, selectionRects);
		if (url) addImage(url);
	};

	const runAutoSelection = async () => {
		const canvas = pageCanvases.get(pageIndex);
		if (!canvas || !pdfId) return;
		const existingOnPage = selectionRects.filter(
			(r) => r.pageIndex === pageIndex,
		);
		setAutoSelecting(true);
		try {
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const rects = await getLayoutForPage(
				pdfId,
				pageIndex,
				imageData,
				existingOnPage,
			);
			setLastAutoOrderedRects(pageIndex, rects);
			replaceSelectionRectsForPage(pageIndex, rects);
		} finally {
			setAutoSelecting(false);
		}
	};

	const copySelectionToClipboard = async () => {
		const url = getSelectionImageDataUrl(pageCanvases, selectionRects);
		if (!url) return;
		try {
			await copyImageDataUrlToClipboard(url);
			toast.success('クリップボードにコピーしました');
		} catch {
			toast.error('コピーに失敗しました');
		}
	};

	if (!pdfId) return null;

	return (
		<div className='space-y-2 border-b border-border pb-2'>
			<p className='text-muted-foreground text-xs font-medium'>
				PDFから画像を追加
			</p>
			<div className='flex flex-wrap gap-1'>
				<Button
					variant='outline'
					size='sm'
					onClick={addCurrentPageAsImage}
					className='min-w-26'
				>
					<ImagePlus className='mr-1 h-3 w-3 shrink-0' />
					現在のページ
				</Button>
				<Button
					variant='outline'
					size='sm'
					onClick={() => setSelectionMode(!selectionMode)}
					className='min-w-22'
				>
					<Square className='mr-1 h-3 w-3 shrink-0' />
					矩形選択
				</Button>
			</div>
			{selectionMode && (
				<div className='space-y-1'>
					<div className='flex flex-wrap gap-1'>
						<Button
							variant={isDrawingMode ? 'default' : 'outline'}
							size='sm'
							onClick={() => setDrawingMode(!isDrawingMode)}
							className='min-w-28'
						>
							<SquarePlus className='mr-1 h-3 w-3 shrink-0' />
							矩形を描画
						</Button>
						<Button
							variant='outline'
							size='sm'
							onClick={runAutoSelection}
							disabled={autoSelecting}
							className='min-w-44'
						>
							<Sparkles className='mr-1 h-3 w-3 shrink-0' />
							{autoSelecting ? '検出中…' : 'AIで自動矩形選択'}
						</Button>
					</div>
					{selectionRects.length > 0 && (
						<>
							<div className='text-muted-foreground tabular-nums text-xs'>
								選択: {selectionRects.length} 件（ドラッグ・リサイズ可）
							</div>
							<div className='flex flex-wrap gap-1'>
								<Button
									variant='outline'
									size='sm'
									onClick={copySelectionToClipboard}
									className='min-w-40 active:scale-95 active:opacity-90 transition-transform'
								>
									<Copy className='mr-1 h-3 w-3 shrink-0' />
									クリップボードにコピー
								</Button>
								<Button
									variant='outline'
									size='sm'
									onClick={addSelectionAsImage}
									className='min-w-42'
								>
									選択範囲を画像に追加
								</Button>
								<Button
									variant='ghost'
									size='sm'
									className='min-w-9'
									onClick={() => {
										clearSelectionRects();
										setDrawingMode(false);
										setSelectionMode(false);
									}}
								>
									<Trash2 className='h-3 w-3' />
								</Button>
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}
