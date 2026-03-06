import { useLayoutEffect, useState } from 'react';
import { usePdfViewerStore } from '@/stores/pdfViewerStore';

interface PageLayout {
	contentLeft: number;
	contentTop: number;
	contentWidth: number;
	contentHeight: number;
	scaleX: number;
	scaleY: number;
}

interface Bounds {
	scrollHeight: number;
	scrollWidth: number;
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
			pageLayouts: new Map(),
		};
	}
	const pageLayouts = new Map<number, PageLayout>();
	for (const [pageIndex, canvas] of pageCanvases) {
		const canvasRect = canvas.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();
		const contentLeft =
			canvasRect.left - containerRect.left + container.scrollLeft;
		const contentTop = canvasRect.top - containerRect.top + container.scrollTop;
		pageLayouts.set(pageIndex, {
			contentLeft,
			contentTop,
			contentWidth: canvasRect.width,
			contentHeight: canvasRect.height,
			scaleX: canvas.width / canvasRect.width,
			scaleY: canvas.height / canvasRect.height,
		});
	}
	return {
		scrollHeight: container.scrollHeight,
		scrollWidth: container.scrollWidth,
		pageLayouts,
	};
}

export function OcrTextLayer() {
	const viewerContainerRef = usePdfViewerStore((s) => s.viewerContainerRef);
	const pageCanvases = usePdfViewerStore((s) => s.pageCanvases);
	const pdfId = usePdfViewerStore((s) => s.pdfId);
	const ocrResults = usePdfViewerStore((s) => s.ocrResults);

	const [bounds, setBounds] = useState<Bounds>({
		scrollHeight: 0,
		scrollWidth: 0,
		pageLayouts: new Map(),
	});

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

	if (!pdfId || Object.keys(ocrResults).length === 0) return null;
	if (bounds.scrollWidth <= 0) return null;

	const { scrollHeight, scrollWidth, pageLayouts } = bounds;

	return (
		<div
			data-ocr-text-layer
			className='pointer-events-none absolute left-0 top-0 z-0 overflow-hidden'
			style={{
				width: scrollWidth,
				height: scrollHeight,
			}}
			aria-hidden
		>
			{pageLayouts.size > 0 &&
				Array.from(pageLayouts.entries()).map(([pageIndex, layout]) => {
					const key = `${pdfId}:${pageIndex}`;
					const result = ocrResults[key];
					if (!result?.lines?.length || result.hasEmbeddedText) return null;
					return (
						<div key={pageIndex}>
							{result.lines.map((line, lineIndex) => {
								const { bbox, text } = line;
								const overlayX = layout.contentLeft + bbox.x / layout.scaleX;
								const overlayY = layout.contentTop + bbox.y / layout.scaleY;
								const overlayW = bbox.w / layout.scaleX;
								const overlayH = bbox.h / layout.scaleY;
								const lineKey = `${pageIndex}-${lineIndex}-${bbox.x}-${bbox.y}`;
								return (
									<span
										key={lineKey}
										className='absolute pointer-events-auto cursor-text whitespace-pre text-foreground/70 selection:bg-primary/30 selection:text-foreground'
										style={{
											left: overlayX,
											top: overlayY,
											width: overlayW,
											height: overlayH,
											fontSize: `${Math.max(8, overlayH * 0.8)}px`,
											lineHeight: 1,
											overflow: 'hidden',
										}}
									>
										{text}
									</span>
								);
							})}
						</div>
					);
				})}
		</div>
	);
}
