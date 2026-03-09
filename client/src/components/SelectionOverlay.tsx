import { X } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { Rnd } from 'react-rnd';
import { usePdfViewerStore } from '@/stores/pdfViewerStore';

interface PageLayout {
	contentLeft: number;
	contentTop: number;
	contentWidth: number;
	contentHeight: number;
	scaleX: number; // canvas pixels per content pixel
	scaleY: number;
}

interface Bounds {
	scrollHeight: number;
	scrollWidth: number;
	scrollLeft: number;
	scrollTop: number;
	containerRect: DOMRect | null;
	pageLayouts: Map<number, PageLayout>;
}

function getBounds(
	container: HTMLDivElement | null,
	pageCanvases: Map<number, HTMLCanvasElement>,
): Bounds {
	if (!container) {
		return {
			scrollHeight: 0,
			scrollWidth: 0,
			scrollLeft: 0,
			scrollTop: 0,
			containerRect: null,
			pageLayouts: new Map(),
		};
	}
	const containerRect = container.getBoundingClientRect();
	const pageLayouts = new Map<number, PageLayout>();
	for (const [pageIndex, canvas] of pageCanvases) {
		const canvasRect = canvas.getBoundingClientRect();
		const contentLeft =
			canvasRect.left - containerRect.left + container.scrollLeft;
		const contentTop = canvasRect.top - containerRect.top + container.scrollTop;
		const contentWidth = canvasRect.width;
		const contentHeight = canvasRect.height;
		pageLayouts.set(pageIndex, {
			contentLeft,
			contentTop,
			contentWidth,
			contentHeight,
			scaleX: canvas.width / contentWidth,
			scaleY: canvas.height / contentHeight,
		});
	}
	return {
		scrollHeight: container.scrollHeight,
		scrollWidth: container.scrollWidth,
		scrollLeft: container.scrollLeft,
		scrollTop: container.scrollTop,
		containerRect,
		pageLayouts,
	};
}

function findPageAtContentPoint(
	pageLayouts: Map<number, PageLayout>,
	contentX: number,
	contentY: number,
): number | null {
	for (const [pageIndex, layout] of pageLayouts) {
		if (
			contentX >= layout.contentLeft &&
			contentX < layout.contentLeft + layout.contentWidth &&
			contentY >= layout.contentTop &&
			contentY < layout.contentTop + layout.contentHeight
		) {
			return pageIndex;
		}
	}
	return null;
}

export function SelectionOverlay() {
	const selectionMode = usePdfViewerStore((s) => s.selectionMode);
	const viewerContainerRef = usePdfViewerStore((s) => s.viewerContainerRef);
	const pageCanvases = usePdfViewerStore((s) => s.pageCanvases);
	const selectionRects = usePdfViewerStore((s) => s.selectionRects);
	const isDrawingMode = usePdfViewerStore((s) => s.isDrawingMode);
	const addSelectionRect = usePdfViewerStore((s) => s.addSelectionRect);
	const updateSelectionRect = usePdfViewerStore((s) => s.updateSelectionRect);
	const removeSelectionRect = usePdfViewerStore((s) => s.removeSelectionRect);

	const [bounds, setBounds] = useState<Bounds>({
		scrollHeight: 0,
		scrollWidth: 0,
		scrollLeft: 0,
		scrollTop: 0,
		containerRect: null,
		pageLayouts: new Map(),
	});

	type DrawingState = {
		pageIndex: number;
		startX: number;
		startY: number;
		currentX: number;
		currentY: number;
	};
	const [drawing, setDrawing] = useState<DrawingState | null>(null);

	useLayoutEffect(() => {
		const container = viewerContainerRef?.current ?? null;
		const update = () => setBounds(getBounds(container, pageCanvases));
		update();
		if (!container) return;
		const ro = new ResizeObserver(update);
		ro.observe(container);
		container.addEventListener('scroll', update, { passive: true });
		return () => {
			ro.disconnect();
			container.removeEventListener('scroll', update);
		};
	}, [viewerContainerRef, pageCanvases]);

	useLayoutEffect(() => {
		if (!drawing) return;
		const container = viewerContainerRef?.current;

		const onMove = (e: MouseEvent) => {
			if (!container) return;
			const b = getBounds(container, pageCanvases);
			const layout = b.pageLayouts.get(drawing.pageIndex);
			if (!layout || !b.containerRect) return;
			const contentX = e.clientX - b.containerRect.left + container.scrollLeft;
			const contentY = e.clientY - b.containerRect.top + container.scrollTop;
			const canvasX = (contentX - layout.contentLeft) * layout.scaleX;
			const canvasY = (contentY - layout.contentTop) * layout.scaleY;
			setDrawing((d) =>
				d ? { ...d, currentX: canvasX, currentY: canvasY } : null,
			);
		};

		const onUp = () => {
			if (!drawing) return;
			const { pageIndex: pi, startX, startY, currentX, currentY } = drawing;
			const canvas = pageCanvases.get(pi);
			if (!canvas) {
				setDrawing(null);
				return;
			}
			const x = Math.max(0, Math.min(startX, currentX));
			const y = Math.max(0, Math.min(startY, currentY));
			const w = Math.min(canvas.width - x, Math.abs(currentX - startX));
			const h = Math.min(canvas.height - y, Math.abs(currentY - startY));
			if (w >= 10 && h >= 10) {
				addSelectionRect({ pageIndex: pi, x, y, w, h });
			}
			setDrawing(null);
		};

		document.addEventListener('mousemove', onMove, { passive: true });
		document.addEventListener('mouseup', onUp);
		return () => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		};
	}, [drawing, pageCanvases, viewerContainerRef, addSelectionRect]);

	// 矩形描画モード時: 全面レイヤーでなくキャプチャで mousedown のみ処理し、ホイールは下のスクロールに通す
	useLayoutEffect(() => {
		if (!isDrawingMode) return;
		const container = viewerContainerRef?.current;
		if (!container) return;

		const onMouseDown = (e: MouseEvent) => {
			if ((e.target as HTMLElement).closest('[data-selection-rect]')) return;
			const b = getBounds(container, pageCanvases);
			if (!b.containerRect || b.pageLayouts.size === 0) return;
			const contentX = e.clientX - b.containerRect.left + container.scrollLeft;
			const contentY = e.clientY - b.containerRect.top + container.scrollTop;
			const hitPage = findPageAtContentPoint(b.pageLayouts, contentX, contentY);
			if (hitPage == null) return;
			e.preventDefault();
			e.stopPropagation();
			const layout = b.pageLayouts.get(hitPage)!;
			const canvasX = (contentX - layout.contentLeft) * layout.scaleX;
			const canvasY = (contentY - layout.contentTop) * layout.scaleY;
			setDrawing({
				pageIndex: hitPage,
				startX: canvasX,
				startY: canvasY,
				currentX: canvasX,
				currentY: canvasY,
			});
		};

		container.addEventListener('mousedown', onMouseDown, { capture: true });
		return () =>
			container.removeEventListener('mousedown', onMouseDown, {
				capture: true,
			});
	}, [isDrawingMode, viewerContainerRef, pageCanvases]);

	if (!selectionMode) return null;
	if (!bounds.containerRect || bounds.scrollHeight <= 0) return null;

	const { scrollHeight, scrollWidth, pageLayouts } = bounds;

	return (
		<div
			data-selection-overlay
			className='pointer-events-none absolute left-0 top-0 z-10'
			style={{
				width: scrollWidth,
				height: scrollHeight,
			}}
			aria-hidden
		>
			{/* 矩形描画の mousedown は useLayoutEffect でコンテナのキャプチャで処理（スクロールがブロックされない） */}
			{/* Existing rects - pointer-events-auto so only rects capture input when not drawing */}
			{selectionRects.map((rect, index) => {
				const layout = pageLayouts.get(rect.pageIndex);
				if (!layout) return null;
				const overlayX = layout.contentLeft + rect.x / layout.scaleX;
				const overlayY = layout.contentTop + rect.y / layout.scaleY;
				const overlayW = rect.w / layout.scaleX;
				const overlayH = rect.h / layout.scaleY;

				return (
					<Rnd
						key={index}
						data-selection-rect
						className='border-2 border-primary bg-primary/10'
						style={{ overflow: 'visible', pointerEvents: 'auto', zIndex: 1 }}
						position={{ x: overlayX, y: overlayY }}
						size={{ width: overlayW, height: overlayH }}
						minWidth={20}
						minHeight={20}
						onDragStop={(_e, d) => {
							const newX = (d.x - layout.contentLeft) * layout.scaleX;
							const newY = (d.y - layout.contentTop) * layout.scaleY;
							updateSelectionRect(index, {
								...rect,
								x: Math.max(0, newX),
								y: Math.max(0, newY),
							});
						}}
						onResizeStop={(_e, _dir, ref, _delta, position) => {
							const contentW = ref.offsetWidth;
							const contentH = ref.offsetHeight;
							const newX = (position.x - layout.contentLeft) * layout.scaleX;
							const newY = (position.y - layout.contentTop) * layout.scaleY;
							updateSelectionRect(index, {
								pageIndex: rect.pageIndex,
								x: Math.max(0, newX),
								y: Math.max(0, newY),
								w: Math.max(20, contentW * layout.scaleX),
								h: Math.max(20, contentH * layout.scaleY),
							});
						}}
						bounds='parent'
						cancel='button, [data-dont-drag]'
					>
						<span
							data-dont-drag
							className='absolute left-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-br bg-primary px-1 text-xs font-medium text-primary-foreground'
							aria-hidden
						>
							{index + 1}
						</span>
						<button
							type='button'
							data-dont-drag
							className='absolute -right-2 -top-2 z-20 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow hover:bg-destructive/90'
							aria-label='この矩形を削除'
							onPointerDown={(e) => e.stopPropagation()}
							onMouseDown={(e) => e.stopPropagation()}
							onClick={(e) => {
								e.stopPropagation();
								removeSelectionRect(index);
							}}
						>
							<X className='h-3 w-3' />
						</button>
					</Rnd>
				);
			})}

			{/* Drawing preview */}
			{drawing &&
				(() => {
					const layout = pageLayouts.get(drawing.pageIndex);
					if (!layout) return null;
					const x = Math.min(drawing.startX, drawing.currentX) / layout.scaleX;
					const y = Math.min(drawing.startY, drawing.currentY) / layout.scaleY;
					const w = Math.abs(drawing.currentX - drawing.startX) / layout.scaleX;
					const h = Math.abs(drawing.currentY - drawing.startY) / layout.scaleY;
					return (
						<div
							className='pointer-events-none absolute z-20 border-2 border-dashed border-primary bg-primary/20'
							style={{
								left: layout.contentLeft + x,
								top: layout.contentTop + y,
								width: w,
								height: h,
							}}
						/>
					);
				})()}
		</div>
	);
}
