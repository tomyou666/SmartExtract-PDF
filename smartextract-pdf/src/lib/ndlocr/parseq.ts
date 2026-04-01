/**
 * PARSEQ 文字認識の前処理・後処理（ブラウザ用）。
 * 推論は onnxruntime-web の InferenceSession で行う。
 */

import * as ort from 'onnxruntime-web';

/** モデル parseq-ndl-16x768-* に合わせる */
const PARSEQ_INPUT_W = 768;
const PARSEQ_INPUT_H = 16;

/**
 * 行画像（ImageData）を前処理し、NCHW float32 テンソルを返す。
 * 縦長なら -90° 回転、リサイズ (768, 16)、BGR 順、/127.5 - 1。
 */
export function parseqPreprocess(imageData: ImageData): Float32Array {
	let { width: w, height: h, data } = imageData;
	let srcData = data;
	let srcW = w;
	let srcH = h;
	// 縦長なら 90 度反時計回り
	if (h > w) {
		const rotated = new Uint8ClampedArray(w * h * 4);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const src = (y * w + x) * 4;
				const dst = (x * h + (h - 1 - y)) * 4;
				rotated[dst] = data[src];
				rotated[dst + 1] = data[src + 1];
				rotated[dst + 2] = data[src + 2];
				rotated[dst + 3] = 255;
			}
		}
		srcData = rotated;
		srcW = h;
		srcH = w;
	}
	// リサイズして float32 NCHW
	const canvas = new OffscreenCanvas(srcW, srcH);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not get 2d context');
	const imgData = ctx.createImageData(srcW, srcH);
	imgData.data.set(srcData);
	ctx.putImageData(imgData, 0, 0);
	const outCanvas = new OffscreenCanvas(PARSEQ_INPUT_W, PARSEQ_INPUT_H);
	const outCtx = outCanvas.getContext('2d');
	if (!outCtx) throw new Error('Could not get 2d context for resize');
	outCtx.drawImage(
		canvas,
		0,
		0,
		srcW,
		srcH,
		0,
		0,
		PARSEQ_INPUT_W,
		PARSEQ_INPUT_H,
	);
	const resized = outCtx.getImageData(0, 0, PARSEQ_INPUT_W, PARSEQ_INPUT_H);
	const tensor = new Float32Array(1 * 3 * PARSEQ_INPUT_H * PARSEQ_INPUT_W);
	for (let y = 0; y < PARSEQ_INPUT_H; y++) {
		for (let x = 0; x < PARSEQ_INPUT_W; x++) {
			const src = (y * PARSEQ_INPUT_W + x) * 4;
			// BGR, /127.5 - 1
			const b = resized.data[src] / 127.5 - 1;
			const g = resized.data[src + 1] / 127.5 - 1;
			const r = resized.data[src + 2] / 127.5 - 1;
			const idx = y * PARSEQ_INPUT_W + x;
			tensor[0 * PARSEQ_INPUT_H * PARSEQ_INPUT_W + idx] = b;
			tensor[1 * PARSEQ_INPUT_H * PARSEQ_INPUT_W + idx] = g;
			tensor[2 * PARSEQ_INPUT_H * PARSEQ_INPUT_W + idx] = r;
		}
	}
	return tensor;
}

/**
 * ONNX 出力を文字列にデコードする。
 * Python: predictions = np.squeeze(outputs).T → (T, C)。0=EOS、charlist[i-1] で文字。
 * レイアウトは (1, C, T) のとき T が時間軸。C = charlist.length + 1（EOS 含む）。
 */
export function parseqPostprocess(
	output: Float32Array | Float32Array[],
	charlist: string[],
): string {
	const raw = Array.isArray(output) ? output[0] : output;
	if (!raw || raw.length === 0) return '';
	const C = charlist.length + 1; // EOS = 0
	const T = Math.floor(raw.length / C);
	const indices: number[] = [];
	for (let t = 0; t < T; t++) {
		let maxIdx = 0;
		let maxVal = raw[t * C];
		for (let c = 1; c < C; c++) {
			const v = raw[t * C + c];
			if (v !== undefined && v > (maxVal ?? -Infinity)) {
				maxVal = v;
				maxIdx = c;
			}
		}
		if (maxIdx === 0) break; // EOS
		indices.push(maxIdx);
	}
	return indices.map((i) => charlist[i - 1] ?? '').join('');
}

/**
 * NDLmoji.yaml の model.charset_train をパースして文字配列を得る。
 */
export function parseParseqCharlist(yamlObj: {
	model?: { charset_train?: string };
}): string[] {
	const str = yamlObj?.model?.charset_train ?? '';
	return Array.from(str);
}
