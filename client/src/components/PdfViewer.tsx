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

import { TocPanel } from '@/components/TocPanel';
import { PdfSidebarContext } from '@/contexts/PdfSidebarContext';
import { API_BASE } from '@/lib/utils';
import { toolbarSyncPlugin } from '@/plugins/toolbarSyncPlugin';
import { usePdfViewerStore } from '@/stores/pdfViewerStore';
import { useThemeStore } from '@/stores/themeStore';

interface PdfViewerProps {
	pdfId: string | null;
}

export function PdfViewer({ pdfId }: PdfViewerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerHeight, setContainerHeight] = useState(0);
	const setViewerApi = usePdfViewerStore((s) => s.setViewerApi);
	const setPdfId = usePdfViewerStore((s) => s.setPdfId);
	const reset = usePdfViewerStore((s) => s.reset);
	const setHasEmbeddedOutline = usePdfViewerStore(
		(s) => s.setHasEmbeddedOutline,
	);

	useEffect(() => {
		setPdfId(pdfId);
		return () => setPdfId(null);
	}, [pdfId, setPdfId]);
	const setSlots = useContext(PdfSidebarContext).setSlots;
	const theme = useThemeStore((s) => s.theme);

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

	const zoomRef = useRef(zoom);
	const pageNavRef = useRef(pageNav);
	const fullScreenRef = useRef(fullScreen);
	zoomRef.current = zoom;
	pageNavRef.current = pageNav;
	fullScreenRef.current = fullScreen;

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
		return () => {
			reset();
			setViewerApi(null);
		};
	}, [setViewerApi, reset]);

	// プラグインは毎レンダーで新しくなるため ref に保持し、effect は mount 時のみ setViewerApi を呼ぶ（無限ループ防止）
	useEffect(() => {
		setViewerApi({
			zoomTo: (scale) => zoomRef.current.zoomTo(scale),
			jumpToPage: (pageIndex) => pageNavRef.current.jumpToPage(pageIndex),
			jumpToNextPage: () => pageNavRef.current.jumpToNextPage(),
			jumpToPreviousPage: () => pageNavRef.current.jumpToPreviousPage(),
			fullScreenPlugin: fullScreenRef.current,
		});
		return () => setViewerApi(null);
	}, [setViewerApi]);

	const url = pdfId ? `${API_BASE}/api/pdfs/${pdfId}` : null;

	// url/pdfId が変わったときだけスロットを更新。bookmark/thumbnail を依存に含めると setSlots の無限ループになる
	// biome-ignore lint/correctness/useExhaustiveDependencies: 上記の理由で bookmark/thumbnail を意図的に除外
	useEffect(() => {
		if (!url) {
			setSlots(null);
			setHasEmbeddedOutline(null);
			return;
		}
		setHasEmbeddedOutline(null);
		setSlots({
			thumbnails: <thumbnail.Thumbnails />,
			bookmarks: (
				<TocPanel pdfId={pdfId} bookmarksSlot={<bookmark.Bookmarks />} />
			),
		});
		return () => setSlots(null);
	}, [url, pdfId, setSlots, setHasEmbeddedOutline]);

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
					<Viewer fileUrl={url} plugins={plugins} theme={theme} />
				</Worker>
			</div>
		</div>
	);
}
