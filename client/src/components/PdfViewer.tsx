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
	const [isPanning, setIsPanning] = useState(false);
	const panToolEnabled = usePdfViewerStore((s) => s.panToolEnabled);
	const setPanToolEnabled = usePdfViewerStore((s) => s.setPanToolEnabled);
	const setViewerApi = usePdfViewerStore((s) => s.setViewerApi);
	const setPdfId = usePdfViewerStore((s) => s.setPdfId);
	const reset = usePdfViewerStore((s) => s.reset);
	const setHasEmbeddedOutline = usePdfViewerStore(
		(s) => s.setHasEmbeddedOutline,
	);
	const viewerContainerRefObj = usePdfViewerStore((s) => s.viewerContainerRef);

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
	const panToolEnabledRef = useRef(panToolEnabled);
	zoomRef.current = zoom;
	pageNavRef.current = pageNav;
	fullScreenRef.current = fullScreen;
	panToolEnabledRef.current = panToolEnabled;

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

	// PDF 操作中にのみ有効なショートカット: h を押している間だけ手のひらツールを有効化
	useEffect(() => {
		const holdStateRef = { active: false, previousPanToolEnabled: false };

		const isEditableTarget = (target: EventTarget | null) => {
			if (!(target instanceof HTMLElement)) return false;
			return (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLSelectElement ||
				target.isContentEditable
			);
		};

		const canUseShortcutHere = (target: EventTarget | null) => {
			const rootEl = containerRef.current;
			if (!rootEl || !pdfId) return false;
			if (isEditableTarget(target)) return false;

			const activeEl = document.activeElement;
			const eventInViewer = target instanceof Node && rootEl.contains(target);
			const focusInViewer =
				activeEl instanceof Node && rootEl.contains(activeEl);
			const hoveredViewer = rootEl.matches(':hover');
			return eventInViewer || focusInViewer || hoveredViewer;
		};

		const resetHoldState = () => {
			if (!holdStateRef.active) return;
			holdStateRef.active = false;
			setPanToolEnabled(holdStateRef.previousPanToolEnabled);
		};

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() !== 'h') return;
			if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
			if (!canUseShortcutHere(e.target)) return;

			e.preventDefault();
			e.stopPropagation();

			if (holdStateRef.active) return;
			holdStateRef.active = true;
			holdStateRef.previousPanToolEnabled = panToolEnabledRef.current;
			setPanToolEnabled(!holdStateRef.previousPanToolEnabled);
		};

		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() !== 'h') return;
			if (!holdStateRef.active) return;
			e.preventDefault();
			e.stopPropagation();
			resetHoldState();
		};

		const onVisibilityChange = () => {
			if (document.visibilityState !== 'visible') resetHoldState();
		};

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('blur', resetHoldState);
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', resetHoldState);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			resetHoldState();
		};
	}, [pdfId, setPanToolEnabled]);

	// 手のひらツール（パン）: PDFページ上ドラッグでスクロール（POC優先）
	useEffect(() => {
		if (!panToolEnabled) return;

		const outerEl = containerRef.current;
		const innerEl = viewerContainerRefObj?.current ?? null;
		const rootEl = innerEl ?? outerEl;
		if (!rootEl) return;

		type ScrollContainer = HTMLElement;
		type ScrollStart = {
			el: ScrollContainer;
			top: number;
			left: number;
		};
		type DragState = {
			pointerId: number;
			startClientX: number;
			startClientY: number;
			baselineSynced: boolean; // ズーム直後の一瞬のジャンプ対策: 最初の pointermove で基準同期だけする
			startScrolls: ScrollStart[];
		};

		const dragRef = { current: null as DragState | null };
		let mousedownPrevented = false;

		const isScrollable = (el: HTMLElement) => {
			const style = window.getComputedStyle(el);
			const overflowY = style.overflowY;
			const overflowX = style.overflowX;
			const canY =
				/auto|scroll/.test(overflowY) && el.scrollHeight > el.clientHeight + 1;
			const canX =
				/auto|scroll/.test(overflowX) && el.scrollWidth > el.clientWidth + 1;
			return canY || canX;
		};

		const getScrollContainers = (from: HTMLElement): ScrollContainer[] => {
			const out: ScrollContainer[] = [];
			const seen = new Set<HTMLElement>();
			for (let el: HTMLElement | null = from; el; el = el.parentElement) {
				if (!(el instanceof HTMLElement)) break;
				if (seen.has(el)) continue;
				if (isScrollable(el)) {
					seen.add(el);
					out.push(el);
				}
				if (el === document.body) break;
			}
			return out;
		};

		const shouldHandleTarget = (target: EventTarget | null) => {
			if (!target) return false;
			const el = target as HTMLElement;
			if (!(el instanceof HTMLElement)) return false;
			// PDFのページ領域（canvas/page-layer）だけに限定する
			const surface = el.closest(
				'.rpv-core__page-layer, .rpv-core__canvas-layer, .rpv-core__page',
			);
			if (!surface) return false;
			// 内部UIは巻き込まない（矩形・OCRテキスト・ボタン等）
			if (
				el.closest('[data-selection-rect]') ||
				el.closest('[data-ocr-text-layer]') ||
				el.closest('button, input, textarea, select, a, [role="button"]')
			) {
				return false;
			}
			return rootEl.contains(surface);
		};

		const readScrollStarts = (
			scrollContainers: ScrollContainer[],
		): ScrollStart[] =>
			scrollContainers.map((el) => ({
				el,
				top: el.scrollTop,
				left: el.scrollLeft,
			}));

		const onPointerDown = (e: PointerEvent) => {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			if (!shouldHandleTarget(e.target)) return;

			// 他の mousedown 系ハンドラ（矩形描画など）を抑止
			mousedownPrevented = true;

			e.preventDefault();
			e.stopPropagation();

			const scrollContainers = getScrollContainers(rootEl);
			if (scrollContainers.length === 0) return;

			dragRef.current = {
				pointerId: e.pointerId,
				startClientX: e.clientX,
				startClientY: e.clientY,
				baselineSynced: false,
				startScrolls: readScrollStarts(scrollContainers),
			};
			setIsPanning(true);

			try {
				rootEl.setPointerCapture(e.pointerId);
			} catch {
				// ignore
			}
		};

		const applyScrollDelta = (deltaX: number, deltaY: number) => {
			if (!dragRef.current) return;
			for (const s of dragRef.current.startScrolls) {
				const nextLeft = s.left - deltaX;
				const nextTop = s.top - deltaY;

				const maxLeft = Math.max(0, s.el.scrollWidth - s.el.clientWidth);
				const maxTop = Math.max(0, s.el.scrollHeight - s.el.clientHeight);
				s.el.scrollLeft = Math.max(0, Math.min(maxLeft, nextLeft));
				s.el.scrollTop = Math.max(0, Math.min(maxTop, nextTop));
			}
		};

		const onPointerMove = (e: PointerEvent) => {
			const d = dragRef.current;
			if (!d) return;
			if (e.pointerId !== d.pointerId) return;
			e.preventDefault();
			e.stopPropagation();

			if (!d.baselineSynced) {
				// ズーム直後などの一瞬のジャンプを取り込む（最初の move だけ同期して反映しない）
				d.baselineSynced = true;
				d.startClientX = e.clientX;
				d.startClientY = e.clientY;
				d.startScrolls = readScrollStarts(d.startScrolls.map((s) => s.el));
				return;
			}

			const deltaX = e.clientX - d.startClientX;
			const deltaY = e.clientY - d.startClientY;
			applyScrollDelta(deltaX, deltaY);
		};

		const endPan = (e: PointerEvent) => {
			const d = dragRef.current;
			if (!d) return;
			if (e.pointerId !== d.pointerId) return;

			dragRef.current = null;
			setIsPanning(false);
			mousedownPrevented = false;

			try {
				rootEl.releasePointerCapture(e.pointerId);
			} catch {
				// ignore
			}
		};

		const onMouseDownCapture = (e: MouseEvent) => {
			if (!mousedownPrevented) return;
			// pointerdown とセットで押された mousedown を潰す（矩形描画の capture を抑止）
			if (shouldHandleTarget(e.target)) {
				e.preventDefault();
				e.stopPropagation();
				mousedownPrevented = false;
			}
		};

		rootEl.addEventListener('pointerdown', onPointerDown);
		rootEl.addEventListener('mousedown', onMouseDownCapture, { capture: true });
		window.addEventListener('pointermove', onPointerMove, { passive: false });
		window.addEventListener('pointerup', endPan);
		window.addEventListener('pointercancel', endPan);

		return () => {
			rootEl.removeEventListener('pointerdown', onPointerDown);
			rootEl.removeEventListener('mousedown', onMouseDownCapture, {
				capture: true,
			});
			window.removeEventListener('pointermove', onPointerMove as EventListener);
			window.removeEventListener('pointerup', endPan as EventListener);
			window.removeEventListener('pointercancel', endPan as EventListener);
		};
	}, [panToolEnabled, viewerContainerRefObj]);

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
			style={{
				cursor: panToolEnabled ? (isPanning ? 'grabbing' : 'grab') : undefined,
				touchAction: panToolEnabled ? 'none' : undefined,
			}}
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
