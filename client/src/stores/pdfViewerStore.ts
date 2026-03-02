import type { FullScreenPlugin } from '@react-pdf-viewer/full-screen';
import type { RefObject } from 'react';
import { create } from 'zustand';

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

interface PdfViewerState {
	/** ズーム・ページ送り用。PdfViewer マウント時にセット、アンマウントで null */
	viewerApi: PdfViewerApi | null;
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

	setViewerApi: (api: PdfViewerApi | null) => void;
	setViewerContainerRef: (ref: RefObject<HTMLDivElement | null> | null) => void;
	setPageCanvas: (pageIndex: number, canvas: HTMLCanvasElement | null) => void;
	addSelectionRect: (rect: SelectionRect) => void;
	updateSelectionRect: (index: number, rect: SelectionRect) => void;
	removeSelectionRect: (index: number) => void;
	reorderSelectionRects: (fromIndex: number, toIndex: number) => void;
	clearSelectionRects: () => void;
	setSelectionMode: (on: boolean) => void;
	setDrawingMode: (on: boolean) => void;
	setHasEmbeddedOutline: (v: boolean | null) => void;
	reset: () => void;
}

const initialState = {
	viewerApi: null as PdfViewerApi | null,
	pageIndex: 0,
	scale: 1,
	numPages: 0,
	viewerContainerRef: null as RefObject<HTMLDivElement | null> | null,
	pageCanvases: new Map<number, HTMLCanvasElement>(),
	selectionRects: [] as SelectionRect[],
	selectionMode: false,
	isDrawingMode: false,
	hasEmbeddedOutline: null as boolean | null,
};

export const usePdfViewerStore = create<PdfViewerState>((set) => ({
	...initialState,
	setViewerApi: (viewerApi) => set({ viewerApi }),
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
	setSelectionMode: (selectionMode) => set({ selectionMode }),
	setDrawingMode: (isDrawingMode) => set({ isDrawingMode }),
	setHasEmbeddedOutline: (hasEmbeddedOutline) => set({ hasEmbeddedOutline }),
	reset: () =>
		set({
			...initialState,
			viewerApi: null,
			pageCanvases: new Map(),
			selectionRects: [],
			hasEmbeddedOutline: null,
		}),
}));
