import { useLayoutEffect, useRef, useState } from 'react';
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
	const ocrEnabled = usePdfViewerStore((s) => s.ocrEnabled);
	const ocrResults = usePdfViewerStore((s) => s.ocrResults);

	const [bounds, setBounds] = useState<Bounds>({
		scrollHeight: 0,
		scrollWidth: 0,
		pageLayouts: new Map(),
	});
	/** ref.current の有無で bounds を再計算するため、コンテナ検知時にインクリメント */
	const [containerReady, setContainerReady] = useState(0);
	const lastContainerRef = useRef<HTMLDivElement | null>(null);

	// ref.current が後からセットされても bounds をやり直すため、コンテナの有無を検知する
	useLayoutEffect(() => {
		const el = viewerContainerRef?.current ?? null;
		if (el !== lastContainerRef.current) {
			lastContainerRef.current = el;
			if (el) setContainerReady((r) => r + 1);
		}
		if (!el) {
			const raf = requestAnimationFrame(() => {
				const el2 = viewerContainerRef?.current ?? null;
				if (el2 && el2 !== lastContainerRef.current) {
					lastContainerRef.current = el2;
					setContainerReady((r) => r + 1);
				}
			});
			return () => cancelAnimationFrame(raf);
		}
	}, [viewerContainerRef]);

	// containerReady を依存に含め、ref.current が後からセットされたときに bounds を再計算する
	useLayoutEffect(() => {
		void containerReady; // ref.current 検知時の再実行トリガー
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
	}, [viewerContainerRef, pageCanvases, containerReady]);

	if (!ocrEnabled || !pdfId || Object.keys(ocrResults).length === 0)
		return null;
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
								// bbox が不正な場合は描画しない（座標なしで左上に固まる不具合を防ぐ）
								const hasValidBbox =
									bbox &&
									Number.isFinite(bbox.x) &&
									Number.isFinite(bbox.y) &&
									Number.isFinite(bbox.w) &&
									Number.isFinite(bbox.h);
								if (!hasValidBbox) return null;
								const overlayX = layout.contentLeft + bbox.x / layout.scaleX;
								const overlayY = layout.contentTop + bbox.y / layout.scaleY;
								const overlayW = bbox.w / layout.scaleX;
								const overlayH = bbox.h / layout.scaleY;
								const hasValidCoords =
									Number.isFinite(overlayX) &&
									Number.isFinite(overlayY) &&
									Number.isFinite(overlayW) &&
									Number.isFinite(overlayH);
								if (!hasValidCoords) return null;
								const isVertical = overlayW < overlayH;
								const baseFontSize = isVertical ? overlayW : overlayH;
								const fontSize = Math.max(8, baseFontSize * 0.8);
								const lineKey = `${pageIndex}-${lineIndex}-${bbox.x}-${bbox.y}`;
								return (
									<span
										key={lineKey}
										className='absolute pointer-events-auto cursor-text whitespace-pre [text-align-last:justify] text-transparent selection:bg-primary/30 selection:text-transparent'
										style={{
											left: overlayX,
											top: overlayY,
											width: overlayW,
											height: overlayH,
											fontSize: `${fontSize}px`,
											lineHeight: 1,
											overflow: 'hidden',
											...(isVertical && {
												writingMode: 'vertical-rl',
												textOrientation: 'mixed',
											}),
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
