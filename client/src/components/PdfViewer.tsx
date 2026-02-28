import { bookmarkPlugin } from '@react-pdf-viewer/bookmark';
import { Viewer, Worker } from '@react-pdf-viewer/core';
import { fullScreenPlugin } from '@react-pdf-viewer/full-screen';
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation';
import { thumbnailPlugin } from '@react-pdf-viewer/thumbnail';
import { zoomPlugin } from '@react-pdf-viewer/zoom';
import {
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import '@react-pdf-viewer/bookmark/lib/styles/index.css';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/full-screen/lib/styles/index.css';
import '@react-pdf-viewer/page-navigation/lib/styles/index.css';
import '@react-pdf-viewer/thumbnail/lib/styles/index.css';
import '@react-pdf-viewer/zoom/lib/styles/index.css';

import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { SelectionOverlay } from '@/components/SelectionOverlay';

import { PdfSidebarContext } from '@/contexts/PdfSidebarContext';
import { API_BASE } from '@/lib/utils';
import { toolbarSyncPlugin } from '@/plugins/toolbarSyncPlugin';
import { usePdfViewerStore } from '@/stores/pdfViewerStore';

interface PdfViewerProps {
	pdfId: string | null;
}

export function PdfViewer({ pdfId }: PdfViewerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerHeight, setContainerHeight] = useState(0);
	const setViewerApi = usePdfViewerStore((s) => s.setViewerApi);
	const setViewerContainerRef = usePdfViewerStore(
		(s) => s.setViewerContainerRef,
	);
	const reset = usePdfViewerStore((s) => s.reset);
	const selectionMode = usePdfViewerStore((s) => s.selectionMode);
	const setSlots = useContext(PdfSidebarContext).setSlots;

	// example に合わせてトップレベルで呼ぶ（useMemo 内で呼ぶとプラグイン内のフックが Rules of Hooks に違反する）
	const zoom = zoomPlugin();
	const pageNav = pageNavigationPlugin();
	const fullScreen = fullScreenPlugin({
		getFullScreenTarget: (pages) =>
			pages.closest('.pdf-viewer-container') ?? pages,
	});
	const thumbnail = thumbnailPlugin();
	const bookmark = bookmarkPlugin();
	const syncPlugin = toolbarSyncPlugin();

	useLayoutEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const updateHeight = () => setContainerHeight(el.clientHeight);
		updateHeight();

		const ro = new ResizeObserver(updateHeight);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		setViewerContainerRef(containerRef);
		return () => {
			reset();
			setViewerContainerRef(null);
			setViewerApi(null);
		};
	}, [setViewerApi, setViewerContainerRef, reset]);

	// プラグインは毎レンダーで新しくなるため、viewerApi だけ別 effect で更新（reset は呼ばない）
	useEffect(() => {
		setViewerApi({
			zoomTo: (scale) => zoom.zoomTo(scale),
			jumpToPage: (pageIndex) => pageNav.jumpToPage(pageIndex),
			jumpToNextPage: () => pageNav.jumpToNextPage(),
			jumpToPreviousPage: () => pageNav.jumpToPreviousPage(),
			fullScreenPlugin: fullScreen,
		});
		return () => setViewerApi(null);
	}, [zoom, pageNav, fullScreen, setViewerApi]);

	const url = pdfId ? `${API_BASE}/api/pdfs/${pdfId}` : null;

	useEffect(() => {
		if (!url) {
			setSlots(null);
			return;
		}
		setSlots({
			thumbnails: <thumbnail.Thumbnails />,
			bookmarks: <bookmark.Bookmarks />,
		});
		return () => setSlots(null);
	}, [url, setSlots]);

	if (!url) {
		return (
			<div className='flex h-full items-center justify-center text-muted-foreground'>
				PDFを選択してください
			</div>
		);
	}

	const plugins = [syncPlugin, zoom, pageNav, fullScreen, thumbnail, bookmark];

	return (
		<div
			ref={containerRef}
			className='pdf-viewer-container flex h-full flex-col overflow-auto bg-muted/30'
		>
			<div
				className='relative w-full'
				style={{
					height: containerHeight > 0 ? containerHeight : '100%',
				}}
			>
				<Worker workerUrl={workerSrc}>
					<Viewer fileUrl={url} plugins={plugins} />
				</Worker>
				{selectionMode && <SelectionOverlay />}
			</div>
		</div>
	);
}
