/**
 * OCR Worker とキューを接続。executeTask で Worker にタスクを送り、onResult でキャッシュ・ストアを更新する。
 */

import { usePdfViewerStore } from '@/stores/pdfViewerStore';
import { setLayoutCache, setOcrCache } from './ocrCache';
import {
	createOcrQueue,
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
			}>((resolve, reject) => {
				const onMessage = (
					e: MessageEvent<{
						type: string;
						orderedRects?: LayoutResult['orderedRects'];
						lines?: OcrLineResult[];
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
						resolve({
							orderedRects: d.orderedRects,
							lines: d.lines,
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
				worker.postMessage({
					type: task.type,
					pdfId: task.pdfId,
					pageIndex: task.pageIndex,
					imageData: task.imageData,
				});
			});
		});
}

function onResult(result: OcrTaskResult): void {
	const { pdfId, pageIndex, orderedRects, lines } = result;
	const key = `${pdfId}:${pageIndex}`;
	if (orderedRects?.length) {
		setLayoutCache(pdfId, pageIndex, { orderedRects }).catch(() => {});
	}
	if (lines) {
		setOcrCache(pdfId, pageIndex, { lines }).catch(() => {});
		usePdfViewerStore.getState().setOcrResult(key, { lines });
	}
}

export function getOcrQueue(): OcrQueue {
	if (!queueInstance) {
		queueInstance = createOcrQueue({
			onResult,
			onError: (_task, err) => console.warn('OCR task error', err),
			executeTask: createExecuteTask(),
		});
	}
	return queueInstance;
}
