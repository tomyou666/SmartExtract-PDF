/**
 * 自動矩形選択: layout キャッシュ（DEIM 検出結果）を参照し、都度 orderedRects を計算する。
 * キャッシュがなければ Worker で layout を実行してキャッシュに保存する。
 */

import type { SelectionRect } from '@/stores/pdfViewerStore';
import {
	getLayoutCache,
	LAYOUT_CACHE_VERSION,
	type LayoutCacheValue,
	type LayoutRect,
	setLayoutCache,
} from './ocrCache';

function runLayoutFromCacheTask(
	pdfId: string,
	pageIndex: number,
	cached: LayoutCacheValue,
	existingRects?: Array<{ x: number; y: number; w: number; h: number }>,
): Promise<LayoutRect[]> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(
			new URL('@/workers/ndlocr.worker.ts', import.meta.url),
			{ type: 'module' },
		);
		worker.onmessage = (
			e: MessageEvent<{
				type: string;
				orderedRects?: LayoutRect[];
				error?: string;
			}>,
		) => {
			const d = e.data;
			if (d?.type === 'error') {
				worker.terminate();
				reject(new Error(d.error ?? 'LayoutFromCache task failed'));
				return;
			}
			if (d?.type === 'result' && Array.isArray(d.orderedRects)) {
				worker.terminate();
				resolve(d.orderedRects);
			}
		};
		worker.onerror = (err) => {
			worker.terminate();
			reject(err);
		};
		worker.postMessage({
			type: 'layoutFromCache',
			pdfId,
			pageIndex,
			detections: cached.detections,
			imageWidth: cached.imageWidth,
			imageHeight: cached.imageHeight,
			paddedWidth: cached.paddedWidth,
			paddedHeight: cached.paddedHeight,
			...(existingRects?.length ? { existingRects } : {}),
		});
	});
}

function runLayoutTask(
	pdfId: string,
	pageIndex: number,
	imageData: ImageData,
	existingRects?: Array<{ x: number; y: number; w: number; h: number }>,
): Promise<{
	orderedRects: LayoutRect[];
	detections: LayoutCacheValue['detections'];
	imageWidth: number;
	imageHeight: number;
	paddedWidth?: number;
	paddedHeight?: number;
}> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(
			new URL('@/workers/ndlocr.worker.ts', import.meta.url),
			{ type: 'module' },
		);
		worker.onmessage = (
			e: MessageEvent<{
				type: string;
				orderedRects?: LayoutRect[];
				detections?: LayoutCacheValue['detections'];
				imageWidth?: number;
				imageHeight?: number;
				paddedWidth?: number;
				paddedHeight?: number;
				error?: string;
			}>,
		) => {
			const d = e.data;
			if (d?.type === 'error') {
				worker.terminate();
				reject(new Error(d.error ?? 'Layout task failed'));
				return;
			}
			if (
				d?.type === 'result' &&
				Array.isArray(d.orderedRects) &&
				Array.isArray(d.detections) &&
				typeof d.imageWidth === 'number' &&
				typeof d.imageHeight === 'number'
			) {
				worker.terminate();
				resolve({
					orderedRects: d.orderedRects,
					detections: d.detections,
					imageWidth: d.imageWidth,
					imageHeight: d.imageHeight,
					paddedWidth: d.paddedWidth,
					paddedHeight: d.paddedHeight,
				});
			}
		};
		worker.onerror = (err) => {
			worker.terminate();
			reject(err);
		};
		worker.postMessage({
			type: 'layout',
			pdfId,
			pageIndex,
			imageData,
			...(existingRects?.length ? { existingRects } : {}),
		});
	});
}

/**
 * 指定ページのブロック矩形（読み順付き）を返す。
 * キャッシュに detections があれば Worker で都度 orderedRects を計算し、なければ Worker で layout を実行してキャッシュに保存する。
 * existingRects を渡すと DEIM 結果とマージして mergeOverlappingBlockRects でマージし、XY-cut でソートした結果を返す。
 */
export async function getLayoutForPage(
	pdfId: string,
	pageIndex: number,
	imageData: ImageData,
	existingRects?: SelectionRect[],
): Promise<SelectionRect[]> {
	const existing =
		existingRects?.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })) ??
		undefined;
	const cached = await getLayoutCache(pdfId, pageIndex);
	const isNewFormat =
		cached &&
		cached.version === LAYOUT_CACHE_VERSION &&
		'detections' in cached &&
		Array.isArray(cached.detections) &&
		cached.detections.length > 0;

	// キャッシュがあり、かつ detections が空でない場合はキャッシュから orderedRects を取得
	if (isNewFormat && cached?.detections?.length) {
		const orderedRects = await runLayoutFromCacheTask(
			pdfId,
			pageIndex,
			cached,
			existing,
		);
		return orderedRects.map((r) => ({
			pageIndex,
			x: r.x,
			y: r.y,
			w: r.w,
			h: r.h,
		}));
	}

	const result = await runLayoutTask(pdfId, pageIndex, imageData, existing);
	await setLayoutCache(pdfId, pageIndex, {
		version: LAYOUT_CACHE_VERSION,
		detections: result.detections,
		imageWidth: result.imageWidth,
		imageHeight: result.imageHeight,
		paddedWidth: result.paddedWidth,
		paddedHeight: result.paddedHeight,
	});
	return result.orderedRects.map((r) => ({
		pageIndex,
		x: r.x,
		y: r.y,
		w: r.w,
		h: r.h,
	}));
}
