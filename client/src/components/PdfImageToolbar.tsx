import { useState } from 'react';
import {
	ImagePlus,
	Square,
	ListOrdered,
	Trash2,
	Copy,
	SquarePlus,
	ScanSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePdfViewerStore } from '@/stores/pdfViewerStore';
import { useChatImageStore } from '@/stores/chatImageStore';
import {
	getCurrentPageImageDataUrl,
	getSelectionImageDataUrl,
	copyImageDataUrlToClipboard,
} from '@/lib/pdfImage';
import { getLayoutForPage } from '@/lib/autoSelection';

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
	const addSelectionRect = usePdfViewerStore((s) => s.addSelectionRect);
	const clearSelectionRects = usePdfViewerStore((s) => s.clearSelectionRects);
	const lastAutoOrderedRectsByPage = usePdfViewerStore(
		(s) => s.lastAutoOrderedRectsByPage,
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

	const addCurrentPageToSelection = () => {
		const canvas = pageCanvases.get(pageIndex);
		if (!canvas) return;
		addSelectionRect({
			pageIndex,
			x: 0,
			y: 0,
			w: canvas.width,
			h: canvas.height,
		});
	};

	const [copying, setCopying] = useState(false);
	const addSelectionAsImage = () => {
		const url = getSelectionImageDataUrl(pageCanvases, selectionRects);
		if (url) addImage(url);
	};

	const addNewRect = () => {
		const canvas = pageCanvases.get(pageIndex);
		if (!canvas) return;
		const defaultW = Math.min(200, canvas.width * 0.4);
		const defaultH = Math.min(150, canvas.height * 0.3);
		const x = Math.max(0, (canvas.width - defaultW) / 2);
		const y = Math.max(0, (canvas.height - defaultH) / 2);
		addSelectionRect({ pageIndex, x, y, w: defaultW, h: defaultH });
	};

	const runAutoSelection = async () => {
		const cached = lastAutoOrderedRectsByPage[pageIndex];
		if (cached?.length) {
			clearSelectionRects();
			for (const r of cached) addSelectionRect(r);
			return;
		}
		const canvas = pageCanvases.get(pageIndex);
		if (!canvas || !pdfId) return;
		setAutoSelecting(true);
		try {
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const rects = await getLayoutForPage(pdfId, pageIndex, imageData);
			setLastAutoOrderedRects(pageIndex, rects);
			clearSelectionRects();
			for (const r of rects) addSelectionRect(r);
		} finally {
			setAutoSelecting(false);
		}
	};

	const copySelectionToClipboard = async () => {
		const url = getSelectionImageDataUrl(pageCanvases, selectionRects);
		if (!url) return;
		setCopying(true);
		try {
			await copyImageDataUrlToClipboard(url);
		} finally {
			setCopying(false);
		}
	};

	if (!pdfId) return null;

	return (
		<div className='space-y-2 border-b border-border pb-2'>
			<p className='text-muted-foreground text-xs font-medium'>
				PDFから画像を追加
			</p>
			<div className='flex flex-wrap gap-1'>
				<Button variant='outline' size='sm' onClick={addCurrentPageAsImage}>
					<ImagePlus className='mr-1 h-3 w-3' />
					現在のページ
				</Button>
				<Button
					variant='outline'
					size='sm'
					onClick={() => setSelectionMode(!selectionMode)}
				>
					<Square className='mr-1 h-3 w-3' />
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
						>
							<SquarePlus className='mr-1 h-3 w-3' />
							矩形を描画
						</Button>
						<Button variant='outline' size='sm' onClick={addNewRect}>
							矩形を追加
						</Button>
						<Button
							variant='outline'
							size='sm'
							onClick={addCurrentPageToSelection}
						>
							<ListOrdered className='mr-1 h-3 w-3' />
							現在のページを選択に追加
						</Button>
						<Button
							variant='outline'
							size='sm'
							onClick={runAutoSelection}
							disabled={autoSelecting}
						>
							<ScanSearch className='mr-1 h-3 w-3' />
							{autoSelecting ? '検出中…' : '自動矩形選択'}
						</Button>
					</div>
					{selectionRects.length > 0 && (
						<>
							<div className='text-muted-foreground text-xs'>
								選択: {selectionRects.length} 件（ドラッグ・リサイズ可）
							</div>
							<div className='flex flex-wrap gap-1'>
								<Button
									variant='outline'
									size='sm'
									onClick={copySelectionToClipboard}
									disabled={copying}
								>
									<Copy className='mr-1 h-3 w-3' />
									{copying ? 'コピー中…' : 'クリップボードにコピー'}
								</Button>
								<Button
									variant='outline'
									size='sm'
									onClick={addSelectionAsImage}
								>
									選択範囲を画像に追加
								</Button>
								<Button
									variant='ghost'
									size='sm'
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
