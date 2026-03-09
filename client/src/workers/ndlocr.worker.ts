/**
 * NDL OCR Worker: DEIM レイアウト検出、TEXTBLOCK グルーピング、XY-cut、PARSEQ（layoutAndOcr 時）。
 * メインスレッドから imageData を受け取り、orderedRects / lines を返す。
 */

import * as ort from 'onnxruntime-web';
import { parse as parseYaml } from 'yaml';
import {
	type DEIMDetection,
	deimPostprocess,
	deimPreprocess,
	parseNdlClasses,
} from '../lib/ndlocr/deim';
import { buildBlockRectsFromDetections } from '../lib/ndlocr/ndlParser';
import {
	parseParseqCharlist,
	parseqPostprocess,
	parseqPreprocess,
} from '../lib/ndlocr/parseq';
import {
	type BBox,
	sortBboxesByRank,
	solve as xyCutSolve,
} from '../lib/readingOrder';

// CPU (WASM): 全コアだと重くなるため「論理コアの半分、最低1・最大4」に制限。
// ※マルチスレッドには crossOriginIsolated が必要（SharedArrayBuffer）。
const logicalCores =
	typeof navigator !== 'undefined' && navigator.hardwareConcurrency
		? navigator.hardwareConcurrency
		: 4;
ort.env.wasm.numThreads = Math.min(
	4,
	Math.max(1, Math.floor(logicalCores / 2)),
);

const DEIM_MODEL_URL = '/ndlocr-lite/model/deim-s-1024x1024.onnx';
const PARSEQ_MODEL_URL =
	'/ndlocr-lite/model/parseq-ndl-16x768-100-tiny-165epoch-tegaki2.onnx';
const NDL_YAML_URL = '/ndlocr-lite/config/ndl.yaml';
const NDLMOJI_YAML_URL = '/ndlocr-lite/config/NDLmoji.yaml';
/** モデルが 800x800 の場合は 800、1024x1024 の場合は 1024。未取得時は 800（DEIMv2 r4_800 系） */
const DEIM_INPUT_SIZE_DEFAULT = 800;
const CONF_THRESHOLD = 0.25;
/** これより小さい幅または高さの imageData は処理しない（空・極小解像度のスキップ用） */
const MIN_IMAGE_DIMENSION = 10;

let deimSession: ort.InferenceSession | null = null;
/** DEIM の images 入力の高さ・幅（モデルメタデータから取得、未取得時は DEIM_INPUT_SIZE_DEFAULT） */
let deimInputHeight = DEIM_INPUT_SIZE_DEFAULT;
let deimInputWidth = DEIM_INPUT_SIZE_DEFAULT;
let parseqSession: ort.InferenceSession | null = null;
let ndlClasses: string[] = [];
let parseqCharlist: string[] = [];

async function loadDeimSession(): Promise<ort.InferenceSession> {
	if (deimSession) return deimSession;
	const res = await fetch(DEIM_MODEL_URL);
	const buf = await res.arrayBuffer();
	deimSession = await ort.InferenceSession.create(buf, {
		executionProviders: ['wasm'],
		graphOptimizationLevel: 'all',
	});
	// モデルの images 入力の shape から H,W を取得（NCHW: [N, C, H, W]）
	const meta = deimSession.inputMetadata?.[0];
	if (meta && 'shape' in meta && meta.shape && meta.shape.length >= 4) {
		const h = meta.shape[2];
		const w = meta.shape[3];
		if (typeof h === 'number' && typeof w === 'number') {
			deimInputHeight = h;
			deimInputWidth = w;
		}
	}
	return deimSession;
}

async function loadNdlClasses(): Promise<string[]> {
	if (ndlClasses.length > 0) return ndlClasses;
	const res = await fetch(NDL_YAML_URL);
	const text = await res.text();
	const obj = parseYaml(text) as { names?: Record<string, string> };
	const names = obj?.names ?? {};
	ndlClasses = parseNdlClasses(names);
	return ndlClasses;
}

async function loadParseqSession(): Promise<ort.InferenceSession> {
	if (parseqSession) return parseqSession;
	const res = await fetch(PARSEQ_MODEL_URL);
	const buf = await res.arrayBuffer();
	parseqSession = await ort.InferenceSession.create(buf, {
		executionProviders: ['wasm'],
		graphOptimizationLevel: 'all',
	});
	return parseqSession;
}

async function loadParseqCharlist(): Promise<string[]> {
	if (parseqCharlist.length > 0) return parseqCharlist;
	const res = await fetch(NDLMOJI_YAML_URL);
	const text = await res.text();
	const obj = parseYaml(text) as { model?: { charset_train?: string } };
	parseqCharlist = parseParseqCharlist(obj);
	return parseqCharlist;
}

function cropImageData(
	full: ImageData,
	x: number,
	y: number,
	w: number,
	h: number,
): ImageData {
	const { width: fw } = full;
	const out = new ImageData(w, h);
	const src = full.data;
	const dst = out.data;
	for (let row = 0; row < h; row++) {
		const sy = y + row;
		if (sy < 0 || sy >= full.height) continue;
		for (let col = 0; col < w; col++) {
			const sx = x + col;
			if (sx < 0 || sx >= fw) continue;
			const si = (sy * fw + sx) * 4;
			const di = (row * w + col) * 4;
			dst[di] = src[si];
			dst[di + 1] = src[si + 1];
			dst[di + 2] = src[si + 2];
			dst[di + 3] = 255;
		}
	}
	return out;
}

async function runParseq(lineImage: ImageData): Promise<string> {
	const [session, charlist] = await Promise.all([
		loadParseqSession(),
		loadParseqCharlist(),
	]);
	const tensor = parseqPreprocess(lineImage);
	const inputName = session.inputNames[0];
	if (!inputName) return '';
	// モデル parseq-ndl-16x768-* は NCHW [1, 3, 16, 768]
	const feeds: Record<string, ort.Tensor> = {
		[inputName]: new ort.Tensor('float32', tensor, [1, 3, 16, 768]),
	};
	const outputs = await session.run(feeds);
	const outTensor = outputs[session.outputNames[0]];
	if (!outTensor) return '';
	const data = outTensor.data as Float32Array;
	const decoded = parseqPostprocess(data, charlist);
	return decoded;
}

/**
 * DEIM を実行し、検出矩形を返す。
 * モデルは「パディング済み画像」(paddedWidth x paddedHeight) を input サイズにリサイズしたものを入力とするため、
 * 出力は padded 座標系（paddedWidth x paddedHeight）で返す。元画像座標へは clipRectToImage でクリップする。
 */
async function runDeim(imageData: ImageData): Promise<DEIMDetection[]> {
	const [session, classes] = await Promise.all([
		loadDeimSession(),
		loadNdlClasses(),
	]);
	const { tensor, paddedWidth, paddedHeight } = deimPreprocess(
		imageData,
		deimInputWidth,
		deimInputHeight,
	);
	const inputName = session.inputNames[0];
	const sizeInputName = session.inputNames[1];
	if (!inputName) throw new Error('DEIM model has no input');
	const batch = 1;
	const tensorReshaped = tensor;
	const sizeTensor = new BigInt64Array([
		BigInt(paddedHeight),
		BigInt(paddedWidth),
	]);
	const feeds: Record<string, ort.Tensor> = {
		[inputName]: new ort.Tensor('float32', tensorReshaped, [
			batch,
			3,
			deimInputHeight,
			deimInputWidth,
		]),
	};
	if (sizeInputName) {
		feeds[sizeInputName] = new ort.Tensor('int64', sizeTensor, [1, 2]);
	}
	const outputs = await session.run(feeds);
	const outputNames = session.outputNames;
	const outList = outputNames.map((n) => outputs[n]);
	const detections = deimPostprocess(
		[outList[0], outList[1], outList[2], outList[3]],
		classes,
		CONF_THRESHOLD,
	);
	return detections;
}

/**
 * パディング座標系の矩形を元画像（キャンバス）座標系に収める。
 * パディングは max(W,H)xmax(W,H) のため、元画像はその左上 imageWidth x imageHeight。
 * スケールは 1:1 なので、はみ出し部分をクリップするだけでよい。
 */
function clipRectToImage(
	rect: { x: number; y: number; w: number; h: number },
	imageWidth: number,
	imageHeight: number,
): { x: number; y: number; w: number; h: number } | null {
	const x2 = rect.x + rect.w;
	const y2 = rect.y + rect.h;
	const x = Math.max(0, Math.min(rect.x, imageWidth));
	const y = Math.max(0, Math.min(rect.y, imageHeight));
	const x2c = Math.max(0, Math.min(x2, imageWidth));
	const y2c = Math.max(0, Math.min(y2, imageHeight));
	const w = x2c - x;
	const h = y2c - y;
	if (w <= 0 || h <= 0) return null;
	return { x, y, w, h };
}

type BlockRect = { x: number; y: number; w: number; h: number };

function rectsOverlap(a: BlockRect, b: BlockRect): boolean {
	const ax2 = a.x + a.w;
	const ay2 = a.y + a.h;
	const bx2 = b.x + b.w;
	const by2 = b.y + b.h;
	const interX0 = Math.max(a.x, b.x);
	const interY0 = Math.max(a.y, b.y);
	const interX1 = Math.min(ax2, bx2);
	const interY1 = Math.min(ay2, by2);
	return interX1 > interX0 && interY1 > interY0;
}

function mergeOverlappingBlockRects(rects: BlockRect[]): BlockRect[] {
	if (rects.length <= 1) return rects;
	const source = [...rects];
	const merged: BlockRect[] = [];
	while (source.length > 0) {
		let current = source.pop() as BlockRect;
		for (let i = 0; i < source.length; ) {
			if (rectsOverlap(current, source[i])) {
				const other = source[i];
				const x1 = Math.min(current.x, other.x);
				const y1 = Math.min(current.y, other.y);
				const x2 = Math.max(current.x + current.w, other.x + other.w);
				const y2 = Math.max(current.y + current.h, other.y + other.h);
				current = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
				source.splice(i, 1);
				i = 0;
			} else {
				i++;
			}
		}
		merged.push(current);
	}
	return merged;
}

function buildOrderedRectsFromDetections(
	detections: DEIMDetection[],
	classNames: string[],
	imageWidth: number,
	imageHeight: number,
	existingRects?: BlockRect[],
): Array<{ x: number; y: number; w: number; h: number }> {
	const rawBlockRects = buildBlockRectsFromDetections(detections, classNames);
	const allRects =
		existingRects?.length !== undefined && existingRects.length > 0
			? [...rawBlockRects, ...existingRects]
			: rawBlockRects;
	if (allRects.length === 0) return [];
	const blockRects = mergeOverlappingBlockRects(allRects);
	const bboxes: BBox[] = blockRects.map((r) => [
		r.x,
		r.y,
		r.x + r.w,
		r.y + r.h,
	]);
	const ranks = xyCutSolve(bboxes);
	const sorted = sortBboxesByRank(bboxes, blockRects, ranks);
	const result: Array<{ x: number; y: number; w: number; h: number }> = [];
	for (const r of sorted) {
		const clipped = clipRectToImage(r, imageWidth, imageHeight);
		if (clipped) result.push(clipped);
	}
	return result;
}

type WorkerTask =
	| {
			type: 'layout' | 'layoutAndOcr';
			pdfId: string;
			pageIndex: number;
			imageData: ImageData;
			existingRects?: Array<{ x: number; y: number; w: number; h: number }>;
	  }
	| {
			type: 'layoutFromCache';
			pdfId: string;
			pageIndex: number;
			detections: DEIMDetection[];
			imageWidth: number;
			imageHeight: number;
			paddedWidth?: number;
			paddedHeight?: number;
			existingRects?: Array<{ x: number; y: number; w: number; h: number }>;
	  }
	| {
			type: 'ocrFromLayoutCache';
			pdfId: string;
			pageIndex: number;
			imageData: ImageData;
			detections: DEIMDetection[];
			imageWidth: number;
			imageHeight: number;
			paddedWidth?: number;
			paddedHeight?: number;
	  };

/** パディング後のサイズ（DEIM 座標系）。未指定時は max(W,H) で同一値。 */
function getPaddedSize(
	w: number,
	h: number,
): { paddedWidth: number; paddedHeight: number } {
	const m = Math.max(w, h);
	return { paddedWidth: m, paddedHeight: m };
}

self.onmessage = async (ev: MessageEvent<WorkerTask>) => {
	const payload = ev.data;
	const { type, pdfId, pageIndex } = payload;
	try {
		// layoutFromCache: DEIM は実行せず detections から orderedRects のみ計算
		if (type === 'layoutFromCache') {
			const classNames = await loadNdlClasses();
			const orderedRects = buildOrderedRectsFromDetections(
				payload.detections,
				classNames,
				payload.imageWidth,
				payload.imageHeight,
				payload.existingRects,
			);
			self.postMessage({
				type: 'result',
				pdfId,
				pageIndex,
				taskType: type,
				orderedRects,
			});
			return;
		}

		// ocrFromLayoutCache: DEIM は実行せず detections から行抽出 → PARSEQ のみ
		if (type === 'ocrFromLayoutCache') {
			const lineClassIndices = new Set([1, 2, 3, 4, 5, 16]);
			const lineDetections = payload.detections.filter((d) =>
				lineClassIndices.has(d.class_index),
			);
			if (lineDetections.length === 0) {
				self.postMessage({
					type: 'result',
					pdfId,
					pageIndex,
					taskType: type,
					lines: [],
				});
				return;
			}
			const lineBboxes: BBox[] = lineDetections.map((d) => {
				const [x1, y1, x2, y2] = d.box;
				return [x1, y1, x2, y2];
			});
			const lineRanks = xyCutSolve(lineBboxes);
			const sortedLines = sortBboxesByRank(
				lineBboxes,
				lineDetections,
				lineRanks,
			);
			const imageData = payload.imageData;
			if (
				!imageData ||
				!imageData.data ||
				imageData.data.length === 0 ||
				imageData.width <= MIN_IMAGE_DIMENSION ||
				imageData.height <= MIN_IMAGE_DIMENSION
			) {
				self.postMessage({
					type: 'result',
					pdfId,
					pageIndex,
					taskType: type,
					lines: [],
				});
				return;
			}
			const lines: Array<{
				bbox: { x: number; y: number; w: number; h: number };
				text: string;
			}> = [];
			for (const det of sortedLines) {
				const [x1, y1, x2, y2] = det.box;
				const lineImg = cropImageData(imageData, x1, y1, x2 - x1, y2 - y1);
				const text = await runParseq(lineImg);
				lines.push({
					bbox: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 },
					text,
				});
			}
			self.postMessage({
				type: 'result',
				pdfId,
				pageIndex,
				taskType: type,
				lines,
			});
			return;
		}

		// layout / layoutAndOcr: DEIM 実行
		const imageData = payload.imageData;
		if (
			!imageData ||
			!imageData.data ||
			imageData.data.length === 0 ||
			imageData.width <= MIN_IMAGE_DIMENSION ||
			imageData.height <= MIN_IMAGE_DIMENSION
		) {
			const { paddedWidth, paddedHeight } = getPaddedSize(
				imageData?.width ?? 0,
				imageData?.height ?? 0,
			);
			self.postMessage({
				type: 'result',
				pdfId,
				pageIndex,
				taskType: type,
				orderedRects: [],
				...(type === 'layoutAndOcr' ? { lines: [] } : {}),
				detections: [],
				imageWidth: imageData?.width ?? 0,
				imageHeight: imageData?.height ?? 0,
				paddedWidth,
				paddedHeight,
			});
			return;
		}
		const [detections, classNames] = await Promise.all([
			runDeim(imageData),
			loadNdlClasses(),
		]);
		const { paddedWidth, paddedHeight } = getPaddedSize(
			imageData.width,
			imageData.height,
		);
		const orderedRects = buildOrderedRectsFromDetections(
			detections,
			classNames,
			imageData.width,
			imageData.height,
			payload.existingRects,
		);

		// layout: DEIM 実行 → orderedRects と detections を返す
		if (type === 'layout') {
			self.postMessage({
				type: 'result',
				pdfId,
				pageIndex,
				taskType: type,
				orderedRects,
				detections,
				imageWidth: imageData.width,
				imageHeight: imageData.height,
				paddedWidth,
				paddedHeight,
			});
			return;
		}

		// layoutAndOcr: line_* を抽出 → XY-cut → PARSEQ で行認識
		const lineClassIndices = new Set([1, 2, 3, 4, 5, 16]);
		const lineDetections = detections.filter((d) =>
			lineClassIndices.has(d.class_index),
		);
		if (lineDetections.length === 0) {
			self.postMessage({
				type: 'result',
				pdfId,
				pageIndex,
				taskType: type,
				orderedRects,
				lines: [],
				detections,
				imageWidth: imageData.width,
				imageHeight: imageData.height,
				paddedWidth,
				paddedHeight,
			});
			return;
		}
		const lineBboxes: BBox[] = lineDetections.map((d) => {
			const [x1, y1, x2, y2] = d.box;
			return [x1, y1, x2, y2];
		});
		const lineRanks = xyCutSolve(lineBboxes);
		const sortedLines = sortBboxesByRank(lineBboxes, lineDetections, lineRanks);
		const lines: Array<{
			bbox: { x: number; y: number; w: number; h: number };
			text: string;
		}> = [];
		for (const det of sortedLines) {
			const [x1, y1, x2, y2] = det.box;
			const lineImg = cropImageData(imageData, x1, y1, x2 - x1, y2 - y1);
			const text = await runParseq(lineImg);
			lines.push({
				bbox: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 },
				text,
			});
		}
		self.postMessage({
			type: 'result',
			pdfId,
			pageIndex,
			taskType: type,
			orderedRects,
			lines,
			detections,
			imageWidth: imageData.width,
			imageHeight: imageData.height,
			paddedWidth,
			paddedHeight,
		});
	} catch (err) {
		self.postMessage({
			type: 'error',
			pdfId: payload.pdfId,
			pageIndex: payload.pageIndex,
			taskType: type,
			error: String(err),
		});
	}
};
