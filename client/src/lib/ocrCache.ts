import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DB_NAME = 'ndlocr-pdf-cache';
const DB_VERSION = 1;
const LAYOUT_STORE = 'layout';
const OCR_STORE = 'ocr';

export interface LayoutRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** 座標系修正（scaleY・クリップ）を行った結果のみキャッシュを利用する */
export const LAYOUT_CACHE_VERSION = 2;

export interface LayoutCacheValue {
	version?: number;
	orderedRects: LayoutRect[];
	imageWidth?: number;
	imageHeight?: number;
}

export interface OcrLine {
	bbox: { x: number; y: number; w: number; h: number };
	text: string;
}

export interface OcrCacheValue {
	lines: OcrLine[];
	hasEmbeddedText?: boolean;
}

interface NdlOcrDBSchema extends DBSchema {
	[LAYOUT_STORE]: {
		key: string;
		value: LayoutCacheValue;
	};
	[OCR_STORE]: {
		key: string;
		value: OcrCacheValue;
	};
}

function layoutKey(pdfId: string, pageIndex: number): string {
	return `${pdfId}:${pageIndex}`;
}

let dbPromise: Promise<IDBPDatabase<NdlOcrDBSchema>> | null = null;

function getDB(): Promise<IDBPDatabase<NdlOcrDBSchema>> {
	if (!dbPromise) {
		dbPromise = openDB<NdlOcrDBSchema>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(LAYOUT_STORE)) {
					db.createObjectStore(LAYOUT_STORE);
				}
				if (!db.objectStoreNames.contains(OCR_STORE)) {
					db.createObjectStore(OCR_STORE);
				}
			},
		});
	}
	return dbPromise;
}

export async function getLayoutCache(
	pdfId: string,
	pageIndex: number,
): Promise<LayoutCacheValue | undefined> {
	const db = await getDB();
	return db.get(LAYOUT_STORE, layoutKey(pdfId, pageIndex));
}

export async function setLayoutCache(
	pdfId: string,
	pageIndex: number,
	value: LayoutCacheValue,
): Promise<void> {
	const db = await getDB();
	await db.put(LAYOUT_STORE, value, layoutKey(pdfId, pageIndex));
}

export async function getOcrCache(
	pdfId: string,
	pageIndex: number,
): Promise<OcrCacheValue | undefined> {
	const db = await getDB();
	return db.get(OCR_STORE, layoutKey(pdfId, pageIndex));
}

export async function setOcrCache(
	pdfId: string,
	pageIndex: number,
	value: OcrCacheValue,
): Promise<void> {
	const db = await getDB();
	await db.put(OCR_STORE, value, layoutKey(pdfId, pageIndex));
}

export async function deleteLayoutCache(
	pdfId: string,
	pageIndex: number,
): Promise<void> {
	const db = await getDB();
	await db.delete(LAYOUT_STORE, layoutKey(pdfId, pageIndex));
}

export async function deleteOcrCache(
	pdfId: string,
	pageIndex: number,
): Promise<void> {
	const db = await getDB();
	await db.delete(OCR_STORE, layoutKey(pdfId, pageIndex));
}

export async function deleteAllForPdf(pdfId: string): Promise<void> {
	const db = await getDB();
	const layoutTx = db.transaction(LAYOUT_STORE, 'readwrite');
	const ocrTx = db.transaction(OCR_STORE, 'readwrite');
	const layoutKeys = await layoutTx.store.getAllKeys();
	const ocrKeys = await ocrTx.store.getAllKeys();
	const layoutToDelete = layoutKeys.filter((k) =>
		String(k).startsWith(`${pdfId}:`),
	);
	const ocrToDelete = ocrKeys.filter((k) => String(k).startsWith(`${pdfId}:`));
	for (const k of layoutToDelete) {
		await layoutTx.store.delete(k);
	}
	for (const k of ocrToDelete) {
		await ocrTx.store.delete(k);
	}
	await layoutTx.done;
	await ocrTx.done;
}
