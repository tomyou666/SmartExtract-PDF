/**
 * 自動矩形選択: レイアウトキャッシュ取得 or Worker で layout タスク実行し、ブロック矩形リストを返す。
 */

import type { SelectionRect } from '@/stores/pdfViewerStore';
import {
	getLayoutCache,
	LAYOUT_CACHE_VERSION,
	setLayoutCache,
	type LayoutCacheValue,
	type LayoutRect,
} from './ocrCache';

function runLayoutTask(
	pdfId: string,
	pageIndex: number,
	imageData: ImageData,
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
				reject(new Error(d.error ?? 'Layout task failed'));
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
			type: 'layout',
			pdfId,
			pageIndex,
			imageData,
		});
	});
}

/**
 * 指定ページのブロック矩形（読み順付き）を返す。キャッシュにあればそれを使い、なければ Worker で検出してキャッシュに保存する。
 */
export async function getLayoutForPage(
	pdfId: string,
	pageIndex: number,
	imageData: ImageData,
): Promise<SelectionRect[]> {
	const cached = await getLayoutCache(pdfId, pageIndex);
	if (
		cached &&
		(cached as LayoutCacheValue).version === LAYOUT_CACHE_VERSION &&
		cached.orderedRects?.length
	) {
		return cached.orderedRects.map((r) => ({
			pageIndex,
			x: r.x,
			y: r.y,
			w: r.w,
			h: r.h,
		}));
	}
	const orderedRects = await runLayoutTask(pdfId, pageIndex, imageData);
	await setLayoutCache(pdfId, pageIndex, {
		version: LAYOUT_CACHE_VERSION,
		orderedRects,
		imageWidth: imageData.width,
		imageHeight: imageData.height,
	});
	return orderedRects.map((r) => ({
		pageIndex,
		x: r.x,
		y: r.y,
		w: r.w,
		h: r.h,
	}));
}
