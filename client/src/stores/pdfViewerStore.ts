import type { RefObject } from 'react';
import { create } from 'zustand';

export interface PluginFns {
	jumpToPage: (pageIndex: number) => Promise<void>;
	jumpToNextPage: () => Promise<void>;
	jumpToPreviousPage: () => Promise<void>;
	zoom: (scale: number) => void;
	enterFullScreenMode: (target: HTMLElement) => void;
	exitFullScreenMode: () => void;
	getViewerState: () => { pageIndex: number; scale: number };
}

export interface SelectionRect {
	pageIndex: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

interface PdfViewerState {
	pluginFns: PluginFns | null;
	pageIndex: number;
	scale: number;
	numPages: number;
	viewerContainerRef: RefObject<HTMLDivElement | null> | null;
	pageCanvases: Map<number, HTMLCanvasElement>;
	selectionRects: SelectionRect[];
	selectionMode: boolean;
	isDrawingMode: boolean;
	setPluginFns: (fns: PluginFns | null) => void;
	setViewerState: (pageIndex: number, scale: number) => void;
	setNumPages: (n: number) => void;
	setViewerContainerRef: (ref: RefObject<HTMLDivElement | null> | null) => void;
	setPageCanvas: (pageIndex: number, canvas: HTMLCanvasElement | null) => void;
	addSelectionRect: (rect: SelectionRect) => void;
	updateSelectionRect: (index: number, rect: SelectionRect) => void;
	removeSelectionRect: (index: number) => void;
	reorderSelectionRects: (fromIndex: number, toIndex: number) => void;
	clearSelectionRects: () => void;
	setSelectionMode: (on: boolean) => void;
	setDrawingMode: (on: boolean) => void;
	reset: () => void;
}

const initialState = {
	pluginFns: null as PluginFns | null,
	pageIndex: 0,
	scale: 1,
	numPages: 0,
	viewerContainerRef: null as RefObject<HTMLDivElement | null> | null,
	pageCanvases: new Map<number, HTMLCanvasElement>(),
	selectionRects: [] as SelectionRect[],
	selectionMode: false,
	isDrawingMode: false,
};

export const usePdfViewerStore = create<PdfViewerState>((set) => ({
	...initialState,
	setPluginFns: (pluginFns) => set({ pluginFns }),
	setViewerState: (pageIndex, scale) => set({ pageIndex, scale }),
	setNumPages: (numPages) => set({ numPages }),
	setViewerContainerRef: (
		viewerContainerRef: RefObject<HTMLDivElement | null> | null,
	) => set({ viewerContainerRef }),
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
	reset: () =>
		set({
			...initialState,
			pageCanvases: new Map(),
			selectionRects: [],
			isDrawingMode: false,
		}),
}));
