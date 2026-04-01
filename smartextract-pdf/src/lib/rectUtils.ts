/**
 * 矩形ユーティリティ: 交差判定・マージ・拡張・収縮。
 * Worker (ndlocr) と UI（選択矩形の拡張・収縮）で共通利用。
 */

export type Rect = { x: number; y: number; w: number; h: number };

export function rectsOverlap(a: Rect, b: Rect): boolean {
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

export function mergeOverlappingBlockRects(rects: Rect[]): Rect[] {
	if (rects.length <= 1) return rects;
	const source = [...rects];
	const merged: Rect[] = [];

	while (source.length > 0) {
		let current = source.shift() as Rect;

		for (let i = 0; i < source.length; ) {
			const other = source[i];
			if (rectsOverlap(current, other)) {
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

const MIN_RECT_DIM = 20;

/**
 * 矩形を canvas 範囲内にクリップする。幅・高さが 0 以下になる場合は null を返す。
 */
function clipRectToBounds(
	r: Rect,
	canvasWidth: number,
	canvasHeight: number,
): Rect | null {
	const x = Math.max(0, Math.min(r.x, canvasWidth));
	const y = Math.max(0, Math.min(r.y, canvasHeight));
	const x2 = Math.max(x, Math.min(r.x + r.w, canvasWidth));
	const y2 = Math.max(y, Math.min(r.y + r.h, canvasHeight));
	const w = x2 - x;
	const h = y2 - y;
	if (w <= 0 || h <= 0) return null;
	return { x, y, w, h };
}

/**
 * 矩形の中心を基準に拡張または収縮し、マージしてから canvas 内にクリップして返す。
 * @param deltaPx 正で拡張、負で収縮（ピクセル数）
 */
export function expandShrinkRects(
	rects: Rect[],
	deltaPx: number,
	canvasWidth: number,
	canvasHeight: number,
): Rect[] {
	if (rects.length === 0) return [];

	const expanded: Rect[] = [];
	for (const r of rects) {
		const cx = r.x + r.w / 2;
		const cy = r.y + r.h / 2;
		let nw = r.w + 2 * deltaPx;
		let nh = r.h + 2 * deltaPx;
		if (deltaPx < 0) {
			nw = Math.max(MIN_RECT_DIM, nw);
			nh = Math.max(MIN_RECT_DIM, nh);
		}
		const nx = cx - nw / 2;
		const ny = cy - nh / 2;
		expanded.push({ x: nx, y: ny, w: nw, h: nh });
	}

	const merged = mergeOverlappingBlockRects(expanded);
	const result: Rect[] = [];
	for (const r of merged) {
		const clipped = clipRectToBounds(r, canvasWidth, canvasHeight);
		if (clipped) result.push(clipped);
	}
	return result;
}
