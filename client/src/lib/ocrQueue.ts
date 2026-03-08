/**
 * ページ単位の OCR/レイアウトタスクキュー。
 * 表示中のページを優先し、同時実行数を制限。requestIdleCallback でバックグラウンド処理。
 */

import type { LayoutCacheValue } from './ocrCache';

export type OcrTaskType = 'layout' | 'layoutAndOcr' | 'ocrFromLayoutCache';

export interface OcrTask {
	id: string;
	type: OcrTaskType;
	pdfId: string;
	pageIndex: number;
	imageData: ImageData;
	/** ocrFromLayoutCache のときのみ。layout キャッシュの DEIM 検出結果。 */
	cachedLayout?: LayoutCacheValue;
}

export interface LayoutResult {
	orderedRects: Array<{ x: number; y: number; w: number; h: number }>;
	imageWidth?: number;
	imageHeight?: number;
}

export interface OcrLineResult {
	bbox: { x: number; y: number; w: number; h: number };
	text: string;
}

/** layoutAndOcr の結果で layout キャッシュに保存するための DEIM 結果 */
export interface LayoutCachePayload {
	detections: LayoutCacheValue['detections'];
	imageWidth: number;
	imageHeight: number;
	paddedWidth?: number;
	paddedHeight?: number;
}

export interface OcrTaskResult {
	pdfId: string;
	pageIndex: number;
	type: OcrTaskType;
	orderedRects?: Array<{ x: number; y: number; w: number; h: number }>;
	lines?: OcrLineResult[];
	/** layoutAndOcr 時に layout キャッシュ保存用 */
	layoutCachePayload?: LayoutCachePayload;
}

const MAX_CONCURRENT = 3;
const IDLE_DEADLINE_MS = 2;

type TaskHandler = (task: OcrTask) => Promise<{
	orderedRects?: LayoutResult['orderedRects'];
	lines?: OcrLineResult[];
	layoutCachePayload?: LayoutCachePayload;
}>;

export interface OcrQueueOptions {
	onResult: (result: OcrTaskResult) => void;
	onError?: (task: OcrTask, err: unknown) => void;
	executeTask: TaskHandler;
}

function taskKey(pdfId: string, pageIndex: number, type: OcrTaskType): string {
	return `${pdfId}:${pageIndex}:${type}`;
}

export function createOcrQueue(options: OcrQueueOptions) {
	const { onResult, onError, executeTask } = options;
	const queue: OcrTask[] = [];
	const pendingKeys = new Set<string>();
	let visiblePage: { pdfId: string; pageIndex: number } | null = null;
	let running = 0;
	let idleScheduled = false;

	function removeDuplicate(key: string): void {
		const idx = queue.findIndex(
			(t) => taskKey(t.pdfId, t.pageIndex, t.type) === key,
		);
		if (idx >= 0) queue.splice(idx, 1);
	}

	function enqueue(task: OcrTask): void {
		const key = taskKey(task.pdfId, task.pageIndex, task.type);
		if (pendingKeys.has(key)) return;
		removeDuplicate(key);
		pendingKeys.add(key);
		queue.push(task);
		scheduleProcess();
	}

	function setVisiblePage(pdfId: string, pageIndex: number): void {
		visiblePage = { pdfId, pageIndex };
		// 表示ページのタスクを先頭に
		const visibleKey = (t: OcrTask) =>
			t.pdfId === pdfId && t.pageIndex === pageIndex;
		const visible = queue.filter(visibleKey);
		const rest = queue.filter((t) => !visibleKey(t));
		queue.length = 0;
		queue.push(...visible, ...rest);
		scheduleProcess();
	}

	function scheduleProcess(): void {
		if (running >= MAX_CONCURRENT || queue.length === 0) return;
		// 表示中ページのタスクがあれば即実行、なければ requestIdleCallback
		const v = visiblePage;
		const hasVisible =
			v &&
			queue.some((t) => t.pdfId === v.pdfId && t.pageIndex === v.pageIndex);
		if (hasVisible || running === 0) {
			processNext();
			return;
		}
		if (typeof requestIdleCallback !== 'undefined' && !idleScheduled) {
			idleScheduled = true;
			requestIdleCallback(
				() => {
					idleScheduled = false;
					processNext();
				},
				{ timeout: IDLE_DEADLINE_MS },
			);
		} else {
			setTimeout(processNext, 0);
		}
	}

	async function processNext(): Promise<void> {
		if (running >= MAX_CONCURRENT || queue.length === 0) return;
		const task = queue.shift();
		if (!task) return;
		const key = taskKey(task.pdfId, task.pageIndex, task.type);
		pendingKeys.delete(key);
		running += 1;
		try {
			const result = await executeTask(task);
			onResult({
				pdfId: task.pdfId,
				pageIndex: task.pageIndex,
				type: task.type,
				orderedRects: result.orderedRects,
				lines: result.lines,
				layoutCachePayload: result.layoutCachePayload,
			});
		} catch (err) {
			onError?.(task, err);
		} finally {
			running -= 1;
			scheduleProcess();
		}
	}

	return {
		enqueue,
		setVisiblePage,
		get pendingCount(): number {
			return queue.length;
		},
		get runningCount(): number {
			return running;
		},
	};
}

export type OcrQueue = ReturnType<typeof createOcrQueue>;
