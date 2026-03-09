/**
 * OCR Worker とキューを接続。executeTask で Worker にタスクを送り、onResult でキャッシュ・ストアを更新する。
 */

import { usePdfViewerStore } from '@/stores/pdfViewerStore';
import { LAYOUT_CACHE_VERSION, setLayoutCache, setOcrCache } from './ocrCache';
import {
	createOcrQueue,
	type LayoutCachePayload,
	type LayoutResult,
	type OcrLineResult,
	type OcrQueue,
	type OcrTask,
	type OcrTaskResult,
} from './ocrQueue';

let workerInstance: Worker | null = null;
let queueInstance: OcrQueue | null = null;

function getWorker(): Worker {
	if (!workerInstance) {
		workerInstance = new Worker(
			new URL('@/workers/ndlocr.worker.ts', import.meta.url),
			{ type: 'module' },
		);
	}
	return workerInstance;
}

function createExecuteTask(): (task: OcrTask) => Promise<{
	orderedRects?: LayoutResult['orderedRects'];
	lines?: OcrLineResult[];
	layoutCachePayload?: LayoutCachePayload;
}> {
	const worker = getWorker();
	let locked = false;
	const waitQueue: Array<() => void> = [];

	function acquire(): Promise<void> {
		return new Promise((resolve) => {
			if (!locked) {
				locked = true;
				resolve();
				return;
			}
			waitQueue.push(resolve);
		});
	}
	function release(): void {
		locked = false;
		const next = waitQueue.shift();
		if (next) {
			locked = true;
			next();
		}
	}

	return (task: OcrTask) =>
		acquire().then(() => {
			return new Promise<{
				orderedRects?: LayoutResult['orderedRects'];
				lines?: OcrLineResult[];
				layoutCachePayload?: LayoutCachePayload;
				imageWidth?: number;
				imageHeight?: number;
			}>((resolve, reject) => {
				const onMessage = (
					e: MessageEvent<{
						type: string;
						orderedRects?: LayoutResult['orderedRects'];
						lines?: OcrLineResult[];
						detections?: LayoutCachePayload['detections'];
						imageWidth?: number;
						imageHeight?: number;
						paddedWidth?: number;
						paddedHeight?: number;
						error?: string;
					}>,
				) => {
					const d = e.data;
					worker.removeEventListener('message', onMessage);
					worker.removeEventListener('error', onError);
					release();
					if (d?.type === 'error') {
						reject(new Error(d.error ?? 'OCR task failed'));
						return;
					}
					if (d?.type === 'result') {
						const hasImageSize =
							typeof d.imageWidth === 'number' &&
							typeof d.imageHeight === 'number';
						const layoutCachePayload: LayoutCachePayload | undefined =
							Array.isArray(d.detections) && hasImageSize
								? {
										detections: d.detections,
										imageWidth: d.imageWidth as number,
										imageHeight: d.imageHeight as number,
										paddedWidth: d.paddedWidth,
										paddedHeight: d.paddedHeight,
									}
								: undefined;
						resolve({
							orderedRects: d.orderedRects,
							lines: d.lines,
							layoutCachePayload,
							imageWidth: hasImageSize ? d.imageWidth : undefined,
							imageHeight: hasImageSize ? d.imageHeight : undefined,
						});
						return;
					}
					reject(new Error('Unknown worker response'));
				};
				const onError = () => {
					worker.removeEventListener('message', onMessage);
					worker.removeEventListener('error', onError);
					release();
					reject(new Error('Worker error'));
				};
				worker.addEventListener('message', onMessage);
				worker.addEventListener('error', onError);
				if (
					task.type === 'ocrFromLayoutCache' &&
					task.cachedLayout &&
					task.cachedLayout.detections?.length
				) {
					worker.postMessage({
						type: 'ocrFromLayoutCache',
						pdfId: task.pdfId,
						pageIndex: task.pageIndex,
						imageData: task.imageData,
						detections: task.cachedLayout.detections,
						imageWidth: task.cachedLayout.imageWidth,
						imageHeight: task.cachedLayout.imageHeight,
						paddedWidth: task.cachedLayout.paddedWidth,
						paddedHeight: task.cachedLayout.paddedHeight,
					});
				} else {
					worker.postMessage({
						type: task.type,
						pdfId: task.pdfId,
						pageIndex: task.pageIndex,
						imageData: task.imageData,
					});
				}
			});
		});
}

function onResult(result: OcrTaskResult): void {
	const {
		pdfId,
		pageIndex,
		lines,
		layoutCachePayload,
		imageWidth,
		imageHeight,
	} = result;
	const key = `${pdfId}:${pageIndex}`;
	if (layoutCachePayload) {
		setLayoutCache(pdfId, pageIndex, {
			version: LAYOUT_CACHE_VERSION,
			detections: layoutCachePayload.detections,
			imageWidth: layoutCachePayload.imageWidth,
			imageHeight: layoutCachePayload.imageHeight,
			paddedWidth: layoutCachePayload.paddedWidth,
			paddedHeight: layoutCachePayload.paddedHeight,
		}).catch(() => {});
	}
	if (lines) {
		const cacheValue: Parameters<typeof setOcrCache>[2] = { lines };
		if (typeof imageWidth === 'number' && typeof imageHeight === 'number') {
			cacheValue.imageWidth = imageWidth;
			cacheValue.imageHeight = imageHeight;
		}
		setOcrCache(pdfId, pageIndex, cacheValue).catch(() => {});
		usePdfViewerStore.getState().setOcrResult(key, { lines });
	}
}

export function getOcrQueue(): OcrQueue {
	if (!queueInstance) {
		queueInstance = createOcrQueue({
			onResult,
			onError: (_task, err) => console.warn('OCR task error', err),
			executeTask: createExecuteTask(),
			onStateChange: (state) => {
				usePdfViewerStore.getState().setOcrProgress(state);
			},
		});
	}
	return queueInstance;
}
