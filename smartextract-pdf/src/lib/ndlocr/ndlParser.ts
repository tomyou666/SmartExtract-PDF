/**
 * ndl_parser 相当: TEXTBLOCK グルーピング（text_block + line_* 所属判定 + refine）。
 * 矩形選択用のブロック矩形リストを生成する。
 */

import type { DEIMDetection } from './deim';

export type Polygon = Array<[number, number]>; // 各点 [x, y]

function pointLineDistance(
	px: number,
	py: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): number {
	const lineLenSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
	if (lineLenSq === 0) return Math.hypot(px - x1, py - y1);
	let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lineLenSq;
	t = Math.max(0, Math.min(1, t));
	const projX = x1 + t * (x2 - x1);
	const projY = y1 + t * (y2 - y1);
	return Math.hypot(px - projX, py - projY);
}

/**
 * 点がポリゴン内にあるか。内側なら 1、外側なら -1。
 * measureDist が true のときは内側で正の距離、外側で負の距離を返す。
 */
export function pointInPolygon(
	point: [number, number],
	polygon: Polygon,
	measureDist: boolean,
): number {
	const [x, y] = point;
	const n = polygon.length;
	let inside = false;
	let minDist = Infinity;
	let px = polygon[0][0];
	let py = polygon[0][1];
	for (let i = 1; i <= n; i++) {
		const idx = i % n;
		const sx = polygon[idx][0];
		const sy = polygon[idx][1];
		if (
			Math.min(py, sy) < y &&
			y <= Math.max(py, sy) &&
			x <= Math.max(px, sx)
		) {
			if (py !== sy) {
				const xinters = ((y - py) * (sx - px)) / (sy - py) + px;
				if (px === sx || x <= xinters) inside = !inside;
			}
		}
		if (measureDist) {
			const dist = pointLineDistance(x, y, px, py, sx, sy);
			if (dist < minDist) minDist = dist;
		}
		px = sx;
		py = sy;
	}
	for (let i = 0; i < n; i++) {
		const [sx, sy] = polygon[i];
		const [ex, ey] = polygon[(i + 1) % n];
		if (
			(sy === ey &&
				sy === y &&
				x >= Math.min(sx, ex) &&
				x <= Math.max(sx, ex)) ||
			(sx === ex && sx === x && y >= Math.min(sy, ey) && y <= Math.max(sy, ey))
		) {
			return measureDist ? 0 : 0;
		}
	}
	if (measureDist) return inside ? minDist : -minDist;
	return inside ? 1 : -1;
}

/**
 * ポリゴンの外接矩形を (x, y, w, h) で返す。
 */
export function makeBboxFromPoly(
	polygon: Polygon,
): [number, number, number, number] {
	let x1 = polygon[0][0];
	let y1 = polygon[0][1];
	let x2 = x1;
	let y2 = y1;
	for (let i = 1; i < polygon.length; i++) {
		const [px, py] = polygon[i];
		x1 = Math.min(x1, px);
		y1 = Math.min(y1, py);
		x2 = Math.max(x2, px);
		y2 = Math.max(y2, py);
	}
	return [x1, y1, x2 - x1, y2 - y1];
}

const MIN_BBOX_SIZE = 5;

/**
 * text_block の bbox を矩形ポリゴンの配列に変換。
 */
export function textblockToRect(
	textBlockBoxes: Array<[number, number, number, number]>,
): Polygon[] {
	const polygons: Polygon[] = [];
	for (const box of textBlockBoxes) {
		const [xmin, ymin, xmax, ymax] = box;
		if (xmax - xmin < MIN_BBOX_SIZE && ymax - ymin < MIN_BBOX_SIZE) continue;
		polygons.push([
			[xmin, ymin],
			[xmin, ymax],
			[xmax, ymax],
			[xmax, ymin],
		]);
	}
	return polygons;
}

/**
 * line の bbox が block の bbox 内にあるか（重なりで判定）。
 */
export function isInBlockAd(
	block: [number, number, number, number],
	line: [number, number, number, number],
): boolean {
	const [bx0, by0, bx1, by1] = [block[0], block[1], block[2], block[3]];
	const [lx0, ly0, lx1, ly1] = [line[0], line[1], line[2], line[3]];
	const interX0 = Math.max(bx0, lx0);
	const interY0 = Math.max(by0, ly0);
	const interX1 = Math.min(bx1, lx1);
	const interY1 = Math.min(by1, ly1);
	if (interX1 <= interX0 || interY1 <= interY0) return false;
	const lineArea = (lx1 - lx0) * (ly1 - ly0);
	const interArea = (interX1 - interX0) * (interY1 - interY0);
	return lineArea > 0 && interArea / lineArea > 0.8;
}

const REFINE_MARGIN = 50;

/**
 * 子 text_block が親に完全に含まれる場合は親にマージし、子の tb_info を null に。
 */
export function refineTbRelationship(
	tbPolygons: Polygon[],
	tbInfo: Array<Array<[number, number]> | null>,
	tbClsId: number,
): Array<Array<[number, number]> | null> {
	for (let cIndex = 0; cIndex < tbPolygons.length; cIndex++) {
		const childPoly = tbPolygons[cIndex];
		if (!childPoly || tbInfo[cIndex] === null) continue;
		for (let pIndex = 0; pIndex < tbPolygons.length; pIndex++) {
			if (cIndex === pIndex) continue;
			const parentPoly = tbPolygons[pIndex];
			if (!parentPoly || tbInfo[pIndex] === null) continue;
			let allIn = true;
			for (const p of childPoly) {
				const [x, y] = p;
				if (pointInPolygon([x, y], parentPoly, true) < -REFINE_MARGIN) {
					allIn = false;
					break;
				}
			}
			if (allIn) {
				const childContent = tbInfo[cIndex];
				if (childContent && childContent.length === 0) {
					tbInfo[pIndex].push([tbClsId, cIndex]);
				} else if (childContent) {
					for (const el of childContent) {
						tbInfo[pIndex].push(el);
					}
				}
				tbInfo[cIndex] = null;
				break;
			}
		}
	}
	for (let i = 0; i < tbInfo.length; i++) {
		const content = tbInfo[i];
		if (!content) continue;
		const onlyTb = content.every(([cid]) => cid === tbClsId);
		if (onlyTb) tbInfo[i] = [];
	}
	return tbInfo;
}

/**
 * DEIM 検出結果から TEXTBLOCK グルーピングを行い、ブロック矩形の配列を返す。
 * 各 TEXTBLOCK の外接矩形 + block_ad, block_table 等の矩形。
 */
export function buildBlockRectsFromDetections(
	detections: DEIMDetection[],
	classNames: string[],
): Array<{ x: number; y: number; w: number; h: number }> {
	const byClass = new Map<
		number,
		Array<{ box: [number, number, number, number]; conf: number }>
	>();
	for (const d of detections) {
		const list = byClass.get(d.class_index) ?? [];
		list.push({ box: d.box, conf: d.confidence });
		byClass.set(d.class_index, list);
	}
	const tbClsId = classNames.indexOf('text_block');
	const textBlockBoxes = (byClass.get(tbClsId) ?? []).map((x) => x.box);
	const tbPolygons = textblockToRect(textBlockBoxes);
	const blockRects: Array<{ x: number; y: number; w: number; h: number }> = [];
	for (let j = 0; j < tbPolygons.length; j++) {
		const poly = tbPolygons[j];
		if (!poly) continue;
		const [x, y, w, h] = makeBboxFromPoly(poly);
		blockRects.push({ x, y, w, h });
	}
	const baClsId = classNames.indexOf('block_ad');
	const blockAdList = byClass.get(baClsId) ?? [];
	for (const b of blockAdList) {
		const [x1, y1, x2, y2] = b.box;
		blockRects.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
	}
	const tableClsId = classNames.indexOf('block_table');
	const blockTableList = byClass.get(tableClsId) ?? [];
	for (const b of blockTableList) {
		const [x1, y1, x2, y2] = b.box;
		blockRects.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
	}
	// block_fig, block_pillar 等も追加
	const otherBlockIndices = [6, 8, 9, 10, 11, 12, 13, 14]; // block_fig, block_pillar, ...
	for (const clsId of otherBlockIndices) {
		const list = byClass.get(clsId) ?? [];
		for (const b of list) {
			const [x1, y1, x2, y2] = b.box;
			blockRects.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
		}
	}
	return blockRects;
}
