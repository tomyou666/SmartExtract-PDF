import type { RenderEnterFullScreenProps } from '@react-pdf-viewer/full-screen';
import {
	ChevronLeft,
	ChevronRight,
	Download,
	Maximize,
	ZoomIn,
	ZoomOut,
} from 'lucide-react';
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
				>
					<ZoomOut className='h-4 w-4' />
				</Button>
				<span className='min-w-[4rem] text-center text-sm'>
					{Math.round(scale * 100)}%
				</span>
				<Button
					variant='ghost'
					size='icon'
					onClick={onZoomIn}
					disabled={!pdfId || !api}
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
				>
					<ChevronLeft className='h-4 w-4' />
				</Button>
				<span className='min-w-[5rem] text-center text-sm'>
					{currentPage} / {pageCount || '-'}
				</span>
				<Button
					variant='ghost'
					size='icon'
					onClick={onPageNext}
					disabled={!pdfId || !api || currentPage >= pageCount}
				>
					<ChevronRight className='h-4 w-4' />
				</Button>
			</div>
			<div className='flex items-center gap-1'>
				{EnterFullScreen ? (
					<EnterFullScreen>
						{(props: RenderEnterFullScreenProps) => (
							<Button
								variant='ghost'
								size='icon'
								onClick={props.onClick}
								disabled={!pdfId}
							>
								<Maximize className='h-4 w-4' />
							</Button>
						)}
					</EnterFullScreen>
				) : (
					<Button variant='ghost' size='icon' disabled>
						<Maximize className='h-4 w-4' />
					</Button>
				)}
				<Button
					variant='ghost'
					size='icon'
					onClick={onDownload}
					disabled={!pdfId}
				>
					<Download className='h-4 w-4' />
				</Button>
			</div>
		</div>
	);
}
