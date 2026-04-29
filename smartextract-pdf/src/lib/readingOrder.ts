/**
 * XY-cut 読み順整序の TypeScript 移植（ndlocr-lite(https://github.com/ndl-lab/ndlocr-lite) reading_order/xy_cut/block_xy_cut.py 相当）。
 * bboxes: [N,4] の [xmin, ymin, xmax, ymax]。戻り値: 長さ N の ranks 配列（読み順）。
 */

export type BBox = [number, number, number, number]; // xmin, ymin, xmax, ymax

class BlockNode {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	parent: BlockNode | null;
	children: BlockNode[] = [];
	line_idx: number[] = [];
	num_lines = 0;
	num_vertical_lines = 0;

	constructor(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		parent: BlockNode | null,
	) {
		this.x0 = Math.floor(x0);
		this.y0 = Math.floor(y0);
		this.x1 = Math.floor(x1);
		this.y1 = Math.floor(y1);
		this.parent = parent;
	}

	get_coords(): [number, number, number, number] {
		return [this.x0, this.y0, this.x1, this.y1];
	}

	append(child: BlockNode): void {
		this.children.push(child);
	}

	is_x_split(): boolean {
		const [, y0, , y1] = this.get_coords();
		for (const child of this.children) {
			const [, c0, , c1] = child.get_coords();
			if (y0 !== c0 || y1 !== c1) return false;
		}
		return true;
	}

	is_vertical(): boolean {
		return this.num_lines < this.num_vertical_lines * 2;
	}
}

function calc_min_span(hist: number[]): [number, number, number] {
	const n = hist.length;
	if (n === 1) return [0, 1, 0];
	const minVal = Math.min(...hist);
	const maxVal = Math.max(...hist);
	let startIdx = 0;
	let endIdx = 0;
	let maxLen = 0;
	for (let i = 0; i < n; i++) {
		if (hist[i] !== minVal) continue;
		let j = i;
		while (j < n && hist[j] === minVal) j++;
		if (j - i > maxLen) {
			maxLen = j - i;
			startIdx = i;
			endIdx = j;
		}
	}
	const ratio = maxVal > 0 ? -minVal / maxVal : 0;
	return [startIdx, endIdx, ratio];
}

function calc_hist(
	table: number[][],
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): [number[], number[]] {
	const xHist = new Array(x1 - x0).fill(0);
	const yHist = new Array(y1 - y0).fill(0);
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			xHist[x - x0] += table[y]?.[x] ?? 0;
			yHist[y - y0] += table[y]?.[x] ?? 0;
		}
	}
	return [xHist, yHist];
}

function split(
	parent: BlockNode,
	table: number[][],
	x0?: number,
	y0?: number,
	x1?: number,
	y1?: number,
): void {
	let px0 = parent.x0;
	let py0 = parent.y0;
	let px1 = parent.x1;
	let py1 = parent.y1;
	if (x0 !== undefined) px0 = x0;
	if (y0 !== undefined) py0 = y0;
	if (x1 !== undefined) px1 = x1;
	if (y1 !== undefined) py1 = y1;
	if (!(px0 < px1 && py0 < py1)) return;
	if (
		px0 === parent.x0 &&
		py0 === parent.y0 &&
		px1 === parent.x1 &&
		py1 === parent.y1
	) {
		return;
	}
	const child = new BlockNode(px0, py0, px1, py1, parent);
	parent.append(child);
	block_xy_cut(table, child);
}

function split_x(
	parent: BlockNode,
	table: number[][],
	_val: number,
	x_beg: number,
	x_end: number,
): void {
	split(parent, table, parent.x0, parent.y0, x_beg, parent.y1);
	split(parent, table, x_beg, parent.y0, x_end, parent.y1);
	split(parent, table, x_end, parent.y0, parent.x1, parent.y1);
}

function split_y(
	parent: BlockNode,
	table: number[][],
	_val: number,
	y_beg: number,
	y_end: number,
): void {
	split(parent, table, parent.x0, parent.y0, parent.x1, y_beg);
	split(parent, table, parent.x0, y_beg, parent.x1, y_end);
	split(parent, table, parent.x0, y_end, parent.x1, parent.y1);
}

function block_xy_cut(table: number[][], me_node: BlockNode): void {
	const [x0, y0, x1, y1] = me_node.get_coords();
	const [xHist, yHist] = calc_hist(table, x0, y0, x1, y1);
	const [x_beg, x_end, x_val] = calc_min_span(xHist);
	const [y_beg, y_end, y_val] = calc_min_span(yHist);
	const xb = x_beg + x0;
	const xe = x_end + x0;
	const yb = y_beg + y0;
	const ye = y_end + y0;
	if (x0 === xb && x1 === xe && y0 === yb && y1 === ye) return;
	if (y_val < x_val) {
		split_x(me_node, table, x_val, xb, xe);
	} else if (x_val < y_val) {
		split_y(me_node, table, y_val, yb, ye);
	} else if (xe - xb < ye - yb) {
		split_y(me_node, table, y_val, yb, ye);
	} else {
		split_x(me_node, table, x_val, xb, xe);
	}
}

function get_optimal_grid(bboxes: BBox[]): number {
	const num = bboxes.length;
	return 100 * Math.sqrt(num);
}

function normalize_bboxes(
	bboxes: BBox[],
	grid: number,
	scale = 1.0,
	tolerance = 0.25,
): BBox[] {
	const out = bboxes.map((b) => [...b] as BBox);
	for (const b of out) {
		if (b[0] > b[2]) [b[0], b[2]] = [b[2], b[0]];
		if (b[1] > b[3]) [b[1], b[3]] = [b[3], b[1]];
	}
	if (scale !== 1.0) {
		const w = out.map((b) => b[2] - b[0]);
		const h = out.map((b) => b[3] - b[1]);
		const minWh = w.map((wi, i) => Math.min(wi, h[i]));
		const m = median(minWh.filter((v) => v > 0));
		const lower = m * (1 - tolerance);
		const upper = m * (1 + tolerance);
		for (let i = 0; i < out.length; i++) {
			const wi = w[i];
			const hi = h[i];
			if (hi < wi && wi >= lower && wi < upper) {
				const d = Math.floor(((scale - 1) * wi) / 2);
				out[i][0] -= d;
				out[i][2] += d;
			} else if (wi < hi && hi >= lower && hi < upper) {
				const d = Math.floor(((scale - 1) * hi) / 2);
				out[i][1] -= d;
				out[i][3] += d;
			}
		}
	}
	const xMin = Math.min(...out.map((b) => b[0]));
	const yMin = Math.min(...out.map((b) => b[1]));
	const wPage = Math.max(...out.map((b) => b[2])) - xMin;
	const hPage = Math.max(...out.map((b) => b[3])) - yMin;
	const xGrid = wPage < hPage ? grid : (grid * wPage) / hPage;
	const yGrid = hPage < wPage ? grid : (grid * hPage) / wPage;
	for (const b of out) {
		b[0] = Math.max(0, Math.floor(((b[0] - xMin) * xGrid) / wPage));
		b[1] = Math.max(0, Math.floor(((b[1] - yMin) * yGrid) / hPage));
		b[2] = Math.max(0, Math.floor(((b[2] - xMin) * xGrid) / wPage));
		b[3] = Math.max(0, Math.floor(((b[3] - yMin) * yGrid) / hPage));
	}
	return out;
}

function median(arr: number[]): number {
	if (arr.length === 0) return 0;
	const s = [...arr].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	const a = s[m];
	const b = s[m - 1];
	return s.length % 2 && a !== undefined
		? a
		: b !== undefined && a !== undefined
			? (b + a) / 2
			: 0;
}

function make_mesh_table(bboxes: BBox[]): number[][] {
	const xGrid = Math.max(...bboxes.map((b) => b[2])) + 1;
	const yGrid = Math.max(...bboxes.map((b) => b[3])) + 1;
	const table: number[][] = Array.from({ length: yGrid }, () =>
		Array.from({ length: xGrid }, () => 0),
	);
	for (const b of bboxes) {
		const [x0, y0, x1, y1] = b;
		for (let y = y0; y < y1; y++) {
			for (let x = x0; x < x1; x++) {
				if (table[y]) table[y][x] = 1;
			}
		}
	}
	return table;
}

function get_ranking(node: BlockNode, ranks: number[], rank = 0): number {
	for (const i of node.line_idx) {
		ranks[i] = rank;
		rank += 1;
	}
	for (const child of node.children) {
		rank = get_ranking(child, ranks, rank);
	}
	return rank;
}

function calc_iou(box: BBox, boxes: BBox[]): number[] {
	const [bx0, by0, bx1, by1] = box;
	return boxes.map((b) => {
		const x0 = Math.max(bx0, b[0]);
		const y0 = Math.max(by0, b[1]);
		const x1 = Math.min(bx1, b[2]);
		const y1 = Math.min(by1, b[3]);
		const interW = Math.max(0, x1 - x0 + 1);
		const interH = Math.max(0, y1 - y0 + 1);
		const interArea = interW * interH;
		const boxArea = (bx1 - bx0 + 1) * (by1 - by0 + 1);
		const bArea = (b[2] - b[0] + 1) * (b[3] - b[1] + 1);
		return interArea / (boxArea + bArea - interArea);
	});
}

function get_block_node_bboxes(root: BlockNode): [number[][], BBox[]] {
	const bboxes: BBox[] = [];
	const routers: number[][] = [];

	function collect(node: BlockNode, router: number[]) {
		if (node.children.length === 0) {
			bboxes.push(node.get_coords());
			routers.push([...router]);
		}
		for (let i = 0; i < node.children.length; i++) {
			const c = node.children[i];
			if (c) collect(c, router.concat([i]));
		}
	}
	collect(root, []);
	return [routers, bboxes];
}

function route_tree(root: BlockNode, router: number[]): BlockNode {
	let node: BlockNode = root;
	for (const i of router) {
		const next = node.children[i];
		if (!next) break;
		node = next;
	}
	return node;
}

function assign_bbox_to_node(root: BlockNode, bboxes: BBox[]): void {
	const [routers, leaves] = get_block_node_bboxes(root);
	for (let i = 0; i < bboxes.length; i++) {
		const box = bboxes[i];
		if (!box) continue;
		const iou = calc_iou(box, leaves);
		let j = 0;
		let maxIou = -1;
		for (let k = 0; k < iou.length; k++) {
			const v = iou[k];
			if (v !== undefined && Number.isFinite(v) && v > maxIou) {
				maxIou = v;
				j = k;
			}
		}
		const r = routers[j];
		if (r) route_tree(root, r).line_idx.push(i);
	}
}

function sort_nodes(node: BlockNode, bboxes: BBox[]): [number, number] {
	if (node.line_idx.length > 0) {
		const w = node.line_idx.map(
			(i) => (bboxes[i]?.[2] ?? 0) - (bboxes[i]?.[0] ?? 0),
		);
		const h = node.line_idx.map(
			(i) => (bboxes[i]?.[3] ?? 0) - (bboxes[i]?.[1] ?? 0),
		);
		node.num_lines = node.line_idx.length;
		node.num_vertical_lines = w.filter(
			(wi, idx) => (h[idx] ?? 0) > 0 && wi < (h[idx] ?? 0),
		).length;
		if (node.num_lines > 1) {
			const indices = node.line_idx.map((i) => {
				const b = bboxes[i];
				return { i, x0: b?.[0] ?? 0, y0: b?.[1] ?? 0 };
			});
			indices.sort((a, b) => {
				if (node.is_vertical()) {
					if (a.x0 !== b.x0) return b.x0 - a.x0;
					return a.y0 - b.y0;
				}
				if (a.x0 !== b.x0) return a.x0 - b.x0;
				return a.y0 - b.y0;
			});
			node.line_idx = indices.map((x) => x.i);
		}
		return [node.num_lines, node.num_vertical_lines];
	}
	let num = 0;
	let vNum = 0;
	for (const child of node.children) {
		const [n, v] = sort_nodes(child, bboxes);
		num += n;
		vNum += v;
	}
	node.num_lines = num;
	node.num_vertical_lines = vNum;
	if (node.is_x_split() && node.is_vertical()) {
		node.children.reverse();
	}
	return [num, vNum];
}

/**
 * XY-cut で bboxes の読み順（ranks）を算出する。
 * @param bboxes [N,4] の [xmin, ymin, xmax, ymax]（整数）
 * @param grid 省略時は get_optimal_grid で決定
 * @param scale 1.0 でそのまま
 * @returns 長さ N の ranks 配列（0,1,2,... の読み順）
 */
export function solve(bboxes: BBox[], grid?: number, scale = 1.0): number[] {
	if (bboxes.length === 0) return [];
	const g = grid ?? get_optimal_grid(bboxes);
	const norm = normalize_bboxes(bboxes, g, scale);
	const table = make_mesh_table(norm);
	const h = table.length;
	const w = table[0]?.length ?? 0;
	const root = new BlockNode(0, 0, w, h, null);
	block_xy_cut(table, root);
	assign_bbox_to_node(root, norm);
	sort_nodes(root, norm);
	const ranks = new Array(bboxes.length).fill(-1);
	get_ranking(root, ranks);
	return ranks;
}

/**
 * bboxes を ranks の順にソートした新しい配列を返す。
 */
export function sortBboxesByRank<T>(
	bboxes: BBox[],
	items: T[],
	ranks: number[],
): T[] {
	const indexed = items.map((item, i) => ({ rank: ranks[i] ?? 0, item }));
	indexed.sort((a, b) => a.rank - b.rank);
	return indexed.map((x) => x.item);
}
