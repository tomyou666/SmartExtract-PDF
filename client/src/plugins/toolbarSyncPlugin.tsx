import { LayerRenderStatus, type Plugin } from '@react-pdf-viewer/core';
import type { RefObject } from 'react';
import { createElement, Fragment, useEffect } from 'react';
import { OcrTextLayer } from '@/components/OcrTextLayer';
import { SelectionOverlay } from '@/components/SelectionOverlay';
import {
	getLayoutCache,
	getOcrCache,
	LAYOUT_CACHE_VERSION,
	setOcrCache,
} from '@/lib/ocrCache';
import { getOcrQueue } from '@/lib/ocrWorkerClient';
import { usePdfViewerStore } from '@/stores/pdfViewerStore';

/**
 * ビューアのスクロールコンテナ（inner-pages）の ref をストアに渡し、
 * 矩形オーバーレイをその子として描画してスクロール追従させる。
 */
function PagesContainerRefSync({
	pagesContainerRef,
}: {
	pagesContainerRef: RefObject<HTMLDivElement | null>;
}) {
	const setViewerContainerRef = usePdfViewerStore(
		(s) => s.setViewerContainerRef,
	);
	useEffect(() => {
		setViewerContainerRef(pagesContainerRef);
		return () => setViewerContainerRef(null);
	}, [pagesContainerRef, setViewerContainerRef]);
	return null;
}

/**
 * ビューアの状態（ページ・倍率・キャンバス）のみストアに同期するプラグイン。
 * ズーム・ページ移動・フルスクリーンは @react-pdf-viewer/zoom, page-navigation, full-screen を利用する。
 * 矩形オーバーレイを inner-pages 内に描画し、PDF スクロールに追従させる。
 */
export function toolbarSyncPlugin(): Plugin {
	return {
		onViewerStateChange(viewerState) {
			usePdfViewerStore.setState({
				pageIndex: viewerState.pageIndex,
				scale: viewerState.scale,
			});
			return viewerState;
		},
		onDocumentLoad(props) {
			usePdfViewerStore.setState({ numPages: props.doc.numPages });
			usePdfViewerStore.getState().setPdfDoc(props.doc);
			props.doc
				.getOutline()
				.then((outline) => {
					const has = Array.isArray(outline) && outline.length > 0;
					usePdfViewerStore.getState().setHasEmbeddedOutline(has);
				})
				.catch(() => {
					usePdfViewerStore.getState().setHasEmbeddedOutline(false);
				});
		},
		onCanvasLayerRender(props) {
			usePdfViewerStore.getState().setPageCanvas(props.pageIndex, props.ele);
			if (props.status !== LayerRenderStatus.DidRender) return;
			(async () => {
				const {
					pdfId,
					pdfDoc,
					pageIndex: visiblePage,
				} = usePdfViewerStore.getState();
				if (!pdfId || !pdfDoc) return;
				const pageIndex = props.pageIndex;
				const key = `${pdfId}:${pageIndex}`;
				const canvas = props.ele as HTMLCanvasElement;
				const ctx = canvas?.getContext('2d');
				if (!ctx) return;
				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

				const cached = await getOcrCache(pdfId, pageIndex);
				if (cached) {
					// テキスト埋め込みあり: bbox はなくフラグのみ利用
					if (cached.hasEmbeddedText) {
						usePdfViewerStore.getState().setOcrResult(key, {
							lines: [],
							hasEmbeddedText: true,
						});
						return;
					}
					// OCR 行キャッシュあり: 保存時画像サイズと現在キャンバスサイズの比率で bbox をスケーリングして利用
					if (cached.lines?.length) {
						const { imageWidth, imageHeight } = cached;
						let linesToUse = cached.lines;
						if (
							typeof imageWidth === 'number' &&
							typeof imageHeight === 'number' &&
							(imageWidth !== imageData.width ||
								imageHeight !== imageData.height)
						) {
							const scaleX = imageData.width / imageWidth;
							const scaleY = imageData.height / imageHeight;
							linesToUse = cached.lines.map((line) => ({
								...line,
								bbox: {
									x: line.bbox.x * scaleX,
									y: line.bbox.y * scaleY,
									w: line.bbox.w * scaleX,
									h: line.bbox.h * scaleY,
								},
							}));
						}
						usePdfViewerStore.getState().setOcrResult(key, {
							lines: linesToUse,
						});
						return;
					}
				}
				try {
					const page = await pdfDoc.getPage(pageIndex + 1);
					const content = await page.getTextContent();
					if (content.items.length > 0) {
						await setOcrCache(pdfId, pageIndex, {
							lines: [],
							hasEmbeddedText: true,
						});
						usePdfViewerStore.getState().setOcrResult(key, {
							lines: [],
							hasEmbeddedText: true,
						});
						return;
					}
				} catch (error) {
					console.error('Error getting text content', error);
					// proceed to OCR
				}
				const layoutCache = await getLayoutCache(pdfId, pageIndex);
				const useLayoutCache =
					layoutCache &&
					layoutCache.version === LAYOUT_CACHE_VERSION &&
					'detections' in layoutCache &&
					Array.isArray(layoutCache.detections) &&
					layoutCache.detections.length > 0 &&
					layoutCache.imageWidth === imageData.width &&
					layoutCache.imageHeight === imageData.height;
				if (!usePdfViewerStore.getState().ocrEnabled) return;
				const queue = getOcrQueue();
				queue.setVisiblePage(pdfId, visiblePage);
				if (useLayoutCache && layoutCache) {
					queue.enqueue({
						id: `${pdfId}:${pageIndex}:ocrFromLayoutCache`,
						type: 'ocrFromLayoutCache',
						pdfId,
						pageIndex,
						imageData,
						cachedLayout: layoutCache,
					});
				} else {
					queue.enqueue({
						id: `${pdfId}:${pageIndex}:layoutAndOcr`,
						type: 'layoutAndOcr',
						pdfId,
						pageIndex,
						imageData,
					});
				}
			})();
		},
		renderViewer(props) {
			const slot = props.slot;
			const subSlot = slot.subSlot;
			if (!subSlot) return slot;
			return {
				...slot,
				subSlot: {
					...subSlot,
					children: createElement(
						Fragment,
						null,
						createElement(PagesContainerRefSync, {
							pagesContainerRef: props.pagesContainerRef,
						}),
						subSlot.children,
						createElement(OcrTextLayer),
						createElement(SelectionOverlay),
					),
				},
			};
		},
	};
}
