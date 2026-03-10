import type { RenderEnterFullScreenProps } from '@react-pdf-viewer/full-screen';
import {
	ChevronLeft,
	ChevronRight,
	Download,
	Loader2,
	Maximize,
	ScanText,
	ZoomIn,
	ZoomOut,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { API_BASE } from '@/lib/utils';
import { usePdfViewerStore } from '@/stores/pdfViewerStore';

interface BottomBarProps {
	pdfId: string | null;
}

export function BottomBar({ pdfId }: BottomBarProps) {
	const api = usePdfViewerStore((s) => s.viewerApi);
	const pageIndex = usePdfViewerStore((s) => s.pageIndex);
	const scale = usePdfViewerStore((s) => s.scale);
	const numPages = usePdfViewerStore((s) => s.numPages);
	const ocrEnabled = usePdfViewerStore((s) => s.ocrEnabled);
	const setOcrEnabled = usePdfViewerStore((s) => s.setOcrEnabled);
	const ocrProgress = usePdfViewerStore((s) => s.ocrProgress);

	const currentPage = pageIndex + 1;
	const pageCount = numPages;
	const EnterFullScreen = api?.fullScreenPlugin?.EnterFullScreen;

	const onZoomIn = () => api?.zoomTo(scale + 0.25);
	const onZoomOut = () => api?.zoomTo(Math.max(0.5, scale - 0.25));
	const onPagePrev = () => api?.jumpToPreviousPage();
	const onPageNext = () => api?.jumpToNextPage();

	const onDownload = () => {
		if (!pdfId) return;
		const url = `${API_BASE}/api/pdfs/${pdfId}`;
		window.open(url, '_blank', 'noopener');
	};

	return (
		<div className='flex h-12 items-center justify-between gap-2 border-t border-border bg-background px-4'>
			<div className='flex items-center gap-1'>
				<Button
					variant='ghost'
					size='icon'
					onClick={onZoomOut}
					disabled={!pdfId || !api}
					title='縮小'
				>
					<ZoomOut className='h-4 w-4' />
				</Button>
				<span className='min-w-16 text-center text-sm'>
					{Math.round(scale * 100)}%
				</span>
				<Button
					variant='ghost'
					size='icon'
					onClick={onZoomIn}
					disabled={!pdfId || !api}
					title='拡大'
				>
					<ZoomIn className='h-4 w-4' />
				</Button>
			</div>
			<div className='flex items-center gap-1'>
				<Button
					variant='ghost'
					size='icon'
					onClick={onPagePrev}
					disabled={!pdfId || !api || currentPage <= 1}
					title='前のページ'
				>
					<ChevronLeft className='h-4 w-4' />
				</Button>
				<span className='min-w-20 text-center text-sm'>
					{currentPage} / {pageCount || '-'}
				</span>
				<Button
					variant='ghost'
					size='icon'
					onClick={onPageNext}
					disabled={!pdfId || !api || currentPage >= pageCount}
					title='次のページ'
				>
					<ChevronRight className='h-4 w-4' />
				</Button>
			</div>
			<div className='flex items-center gap-1'>
				{(ocrProgress.running > 0 || ocrProgress.pending > 0) && (
					<span className='flex items-center gap-1.5 text-muted-foreground text-sm'>
						{ocrProgress.running > 0 && (
							<Loader2 className='h-4 w-4 shrink-0 animate-spin' aria-hidden />
						)}
						<span className='min-w-24'>
							{ocrProgress.running > 0 &&
								ocrProgress.currentPageIndex !== undefined && (
									<>OCR実行中: ページ {ocrProgress.currentPageIndex + 1}</>
								)}
							{ocrProgress.running > 0 && ocrProgress.pending > 0 && ' / '}
							{ocrProgress.pending > 0 && <>待機数: {ocrProgress.pending}</>}
						</span>
					</span>
				)}
				<Button
					variant='ghost'
					size='icon'
					onClick={() => setOcrEnabled(!ocrEnabled)}
					aria-label={ocrEnabled ? 'OCRをオフにする' : 'OCRをオンにする'}
					title={ocrEnabled ? 'OCR: オン' : 'OCR: オフ'}
				>
					<ScanText className={`h-4 w-4 ${ocrEnabled ? '' : 'opacity-50'}`} />
				</Button>
				<ThemeToggle />
				{EnterFullScreen ? (
					<EnterFullScreen>
						{(props: RenderEnterFullScreenProps) => (
							<Button
								variant='ghost'
								size='icon'
								onClick={props.onClick}
								disabled={!pdfId}
								title='全画面表示'
							>
								<Maximize className='h-4 w-4' />
							</Button>
						)}
					</EnterFullScreen>
				) : (
					<Button variant='ghost' size='icon' disabled title='全画面表示'>
						<Maximize className='h-4 w-4' />
					</Button>
				)}
				<Button
					variant='ghost'
					size='icon'
					onClick={onDownload}
					disabled={!pdfId}
					title='ダウンロード'
				>
					<Download className='h-4 w-4' />
				</Button>
			</div>
		</div>
	);
}
