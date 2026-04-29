/**
 * DEIM レイアウト検出の前処理・後処理（ブラウザ用）。
 * 推論は onnxruntime-web の InferenceSession で行う。
 */

export interface DEIMDetection {
	class_index: number;
	confidence: number;
	box: [number, number, number, number]; // x1, y1, x2, y2
	pred_char_count: number;
	class_name: string;
}

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/**
 * ImageData をパディング＋リサイズし、正規化済み NCHW float32 テンソルを返す。
 * 画像は max(W,H) x max(W,H) にパッドし、inputWidth x inputHeight にリサイズする。
 */
export function deimPreprocess(
	imageData: ImageData,
	inputWidth: number,
	inputHeight: number,
): { tensor: Float32Array; paddedWidth: number; paddedHeight: number } {
	const { width: w, height: h, data } = imageData;
	const maxWh = Math.max(w, h);
	const paddedWidth = maxWh;
	const paddedHeight = maxWh;

	// パディング済み RGBA を描画するために OffscreenCanvas を使用
	const padCanvas = new OffscreenCanvas(paddedWidth, paddedHeight);
	const padCtx = padCanvas.getContext('2d');
	if (!padCtx) throw new Error('Could not get 2d context');
	const paddedImageData = padCtx.createImageData(paddedWidth, paddedHeight);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const src = (y * w + x) * 4;
			const dst = (y * paddedWidth + x) * 4;
			paddedImageData.data[dst] = data[src];
			paddedImageData.data[dst + 1] = data[src + 1];
			paddedImageData.data[dst + 2] = data[src + 2];
			paddedImageData.data[dst + 3] = 255;
		}
	}
	padCtx.putImageData(paddedImageData, 0, 0);

	// リサイズ用キャンバス
	const resizeCanvas = new OffscreenCanvas(inputWidth, inputHeight);
	const resizeCtx = resizeCanvas.getContext('2d');
	if (!resizeCtx) throw new Error('Could not get 2d context for resize');
	resizeCtx.drawImage(
		padCanvas,
		0,
		0,
		paddedWidth,
		paddedHeight,
		0,
		0,
		inputWidth,
		inputHeight,
	);
	const resized = resizeCtx.getImageData(0, 0, inputWidth, inputHeight);

	// float32 NCHW, normalized
	const tensor = new Float32Array(1 * 3 * inputHeight * inputWidth);
	for (let y = 0; y < inputHeight; y++) {
		for (let x = 0; x < inputWidth; x++) {
			const src = (y * inputWidth + x) * 4;
			const r = resized.data[src] / 255;
			const g = resized.data[src + 1] / 255;
			const b = resized.data[src + 2] / 255;
			const idx = y * inputWidth + x;
			tensor[0 * inputHeight * inputWidth + idx] = (r - MEAN[0]) / STD[0];
			tensor[1 * inputHeight * inputWidth + idx] = (g - MEAN[1]) / STD[1];
			tensor[2 * inputHeight * inputWidth + idx] = (b - MEAN[2]) / STD[2];
		}
	}
	return { tensor, paddedWidth, paddedHeight };
}

/**
 * ONNX 出力を DEIMDetection の配列に変換する。
 * このプロジェクトで使う ONNX は export_onnx で postprocessor 込みでエクスポートされているため、
 * 第2入力 orig_target_sizes に [paddedHeight, paddedWidth] を渡すと bbox は既にその座標系で返る。
 * よってここではスケールせずそのまま round して使う。
 */
export function deimPostprocess(
	outputs: [unknown, unknown, unknown, unknown?],
	classes: string[],
	_confThreshold: number,
): DEIMDetection[] {
	const classIdsRaw = outputs[0];
	const predictionsRaw = outputs[1];
	const scoresRaw = outputs[2];
	const classIds = toFlatArray(classIdsRaw);
	const predictions = toFlatArray(predictionsRaw);
	const scores = toFlatArray(scoresRaw);
	const numDet = scores.length;
	const charCounts =
		outputs[3] != null
			? toFlatArray(outputs[3])
			: Array.from({ length: numDet }, () => 100);

	const confThreshold = _confThreshold;
	const detections: DEIMDetection[] = [];
	for (let i = 0; i < numDet; i++) {
		const score = scores[i];
		if (score === undefined || score < confThreshold) continue;
		const label = classIds[i];
		const val = typeof label === 'number' ? label : Number(label);
		const classIndex = Math.floor(val) - 1;
		const base = i * 4;
		const box: [number, number, number, number] = [
			Math.round((predictions[base] ?? 0) as number),
			Math.round((predictions[base + 1] ?? 0) as number),
			Math.round((predictions[base + 2] ?? 0) as number),
			Math.round((predictions[base + 3] ?? 0) as number),
		];
		const predCharCount = charCounts[i] ?? 100;
		const className = classes[classIndex >= 0 ? classIndex : 0];
		detections.push({
			class_index: classIndex >= 0 ? classIndex : 0,
			confidence: score,
			box,
			pred_char_count: predCharCount,
			class_name: className ?? 'unknown',
		});
	}
	return detections;
}

function toFlatArray(t: unknown): number[] {
	const data = t instanceof Array ? t : (t as { data: number[] }).data;
	if (
		data instanceof Float32Array ||
		data instanceof Int32Array ||
		data instanceof BigInt64Array
	)
		return [...data];
	if (Array.isArray(data)) return data.flat();
	return [];
}

/**
 * ndl.yaml の names をパースしてクラス名配列を得る。
 * names が { "0": "text_block", "1": "line_main", ... } の形式を想定。
 */
export function parseNdlClasses(names: Record<string, string>): string[] {
	const maxKey = Math.max(
		...Object.keys(names)
			.map((k) => parseInt(k, 10))
			.filter((n) => !Number.isNaN(n)),
		0,
	);
	return Array.from(
		{ length: maxKey + 1 },
		(_, i) => names[String(i)] ?? 'unknown',
	);
}
