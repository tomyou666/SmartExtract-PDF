import type { FullScreenPlugin } from '@react-pdf-viewer/full-screen';
import type { RefObject } from 'react';
import { create } from 'zustand';

/** PDF ドキュメント参照（getTextContent スキップ判定用）。react-pdf-viewer の props.doc をそのまま渡す。 */
export interface PdfDocRef {
	getPage: (
		pageIndex: number,
	) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>;
	numPages: number;
}

/** ツールバーからビューアを操作するための API（PdfViewer がセットする） */
export interface PdfViewerApi {
	zoomTo: (scale: number) => void;
	jumpToPage: (pageIndex: number) => void;
	jumpToNextPage: () => void;
	jumpToPreviousPage: () => void;
	fullScreenPlugin: FullScreenPlugin | null;
}

export interface SelectionRect {
	pageIndex: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

/** OCR 結果（1ページ分）。OcrTextLayer で表示する。 */
export interface OcrPageResult {
	lines: Array<{
		bbox: { x: number; y: number; w: number; h: number };
		text: string;
	}>;
	hasEmbeddedText?: boolean;
}

interface PdfViewerState {
	/** ズーム・ページ送り用。PdfViewer マウント時にセット、アンマウントで null */
	viewerApi: PdfViewerApi | null;
	/** 現在表示中の PDF の ID（OCR キー・キャッシュ用）。PdfViewer でセット、reset で null */
	pdfId: string | null;
	/** 現在表示中の PDF ドキュメント（getTextContent スキップ判定・OCR 用）。onDocumentLoad でセット、reset で null */
	pdfDoc: PdfDocRef | null;
	pageIndex: number;
	scale: number;
	numPages: number;
	viewerContainerRef: RefObject<HTMLDivElement | null> | null;
	pageCanvases: Map<number, HTMLCanvasElement>;
	selectionRects: SelectionRect[];
	selectionMode: boolean;
	isDrawingMode: boolean;
	/** PDF埋め込みアウトラインの有無。null=未判定、true=あり、false=なし */
	hasEmbeddedOutline: boolean | null;
	/** 自動矩形選択で得たブロック矩形（ページごと）。2回目以降の押下で再利用 */
	lastAutoOrderedRectsByPage: Record<number, SelectionRect[]>;
	/** OCR 結果。キー `${pdfId}:${pageIndex}` */
	ocrResults: Record<string, OcrPageResult>;
	/** OCR 機能の ON/OFF。false のときは enqueue しない */
	ocrEnabled: boolean;
	/** OCR キュー進捗（実行中・待機数・実行中ページ）。表示用 */
	ocrProgress: {
		running: number;
		pending: number;
		/** 実行中タスクのページ（0-based）。実行中でないときは undefined */
		currentPageIndex?: number;
	};

	setViewerApi: (api: PdfViewerApi | null) => void;
	setPdfId: (id: string | null) => void;
	setPdfDoc: (doc: PdfDocRef | null) => void;
	setViewerContainerRef: (ref: RefObject<HTMLDivElement | null> | null) => void;
	setPageCanvas: (pageIndex: number, canvas: HTMLCanvasElement | null) => void;
	addSelectionRect: (rect: SelectionRect) => void;
	updateSelectionRect: (index: number, rect: SelectionRect) => void;
	removeSelectionRect: (index: number) => void;
	reorderSelectionRects: (fromIndex: number, toIndex: number) => void;
	clearSelectionRects: () => void;
	replaceSelectionRectsForPage: (
		pageIndex: number,
		rects: SelectionRect[],
	) => void;
	setSelectionMode: (on: boolean) => void;
	setDrawingMode: (on: boolean) => void;
	setHasEmbeddedOutline: (v: boolean | null) => void;
	setLastAutoOrderedRects: (pageIndex: number, rects: SelectionRect[]) => void;
	setOcrResult: (key: string, result: OcrPageResult | null) => void;
	setOcrEnabled: (on: boolean) => void;
	setOcrProgress: (v: {
		running: number;
		pending: number;
		currentPageIndex?: number;
	}) => void;
	reset: () => void;
}

const initialState = {
	viewerApi: null as PdfViewerApi | null,
	pdfId: null as string | null,
	pdfDoc: null as PdfDocRef | null,
	pageIndex: 0,
	scale: 1,
	numPages: 0,
	viewerContainerRef: null as RefObject<HTMLDivElement | null> | null,
	pageCanvases: new Map<number, HTMLCanvasElement>(),
	selectionRects: [] as SelectionRect[],
	selectionMode: false,
	isDrawingMode: false,
	hasEmbeddedOutline: null as boolean | null,
	lastAutoOrderedRectsByPage: {} as Record<number, SelectionRect[]>,
	ocrResults: {} as Record<string, OcrPageResult>,
	ocrEnabled: true,
	ocrProgress: { running: 0, pending: 0, currentPageIndex: undefined },
};

export const usePdfViewerStore = create<PdfViewerState>((set) => ({
	...initialState,
	setViewerApi: (viewerApi) => set({ viewerApi }),
	setPdfId: (pdfId) =>
		set({
			pdfId,
			ocrProgress: { running: 0, pending: 0, currentPageIndex: undefined },
		}),
	setPdfDoc: (pdfDoc) => set({ pdfDoc }),
	setViewerContainerRef: (viewerContainerRef) => set({ viewerContainerRef }),
	setPageCanvas: (pageIndex, canvas) =>
		set((s) => {
			const next = new Map(s.pageCanvases);
			if (canvas) next.set(pageIndex, canvas);
			else next.delete(pageIndex);
			return { pageCanvases: next };
		}),
	addSelectionRect: (rect) =>
		set((s) => ({ selectionRects: [...s.selectionRects, rect] })),
	updateSelectionRect: (index, rect) =>
		set((s) => {
			const next = [...s.selectionRects];
			if (index >= 0 && index < next.length) next[index] = rect;
			return { selectionRects: next };
		}),
	removeSelectionRect: (index) =>
		set((s) => ({
			selectionRects: s.selectionRects.filter((_, i) => i !== index),
		})),
	reorderSelectionRects: (fromIndex, toIndex) =>
		set((s) => {
			const arr = [...s.selectionRects];
			const [removed] = arr.splice(fromIndex, 1);
			arr.splice(toIndex, 0, removed);
			return { selectionRects: arr };
		}),
	clearSelectionRects: () => set({ selectionRects: [] }),
	replaceSelectionRectsForPage: (pageIndex, rects) =>
		set((s) => ({
			selectionRects: [
				...s.selectionRects.filter((r) => r.pageIndex !== pageIndex),
				...rects.map((r) => ({ ...r, pageIndex })),
			],
		})),
	setSelectionMode: (selectionMode) => set({ selectionMode }),
	setDrawingMode: (isDrawingMode) => set({ isDrawingMode }),
	setHasEmbeddedOutline: (hasEmbeddedOutline) => set({ hasEmbeddedOutline }),
	setLastAutoOrderedRects: (pageIndex, rects) =>
		set((s) => ({
			lastAutoOrderedRectsByPage: {
				...s.lastAutoOrderedRectsByPage,
				[pageIndex]: rects,
			},
		})),
	setOcrResult: (key, result) =>
		set((s) => {
			const next = { ...s.ocrResults };
			if (result === null) delete next[key];
			else next[key] = result;
			return { ocrResults: next };
		}),
	setOcrEnabled: (ocrEnabled) => set({ ocrEnabled }),
	setOcrProgress: (ocrProgress) => set({ ocrProgress }),
	reset: () =>
		set({
			...initialState,
			viewerApi: null,
			pdfId: null,
			pdfDoc: null,
			pageCanvases: new Map(),
			selectionRects: [],
			hasEmbeddedOutline: null,
			lastAutoOrderedRectsByPage: {},
			ocrResults: {},
			ocrProgress: { running: 0, pending: 0, currentPageIndex: undefined },
		}),
}));
