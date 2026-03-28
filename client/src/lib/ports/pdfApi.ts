import type { TocResponse } from '@/types/toc';

export interface PdfRecord {
	id: number;
	filename: string;
	created_at: string;
}

export interface PdfApi {
	list(): Promise<PdfRecord[]>;
	upload(file: File): Promise<PdfRecord>;
	remove(id: number): Promise<void>;
	getDocumentUrl(pdfId: number | string): string;
	getToc(pdfId: string): Promise<TocResponse>;
	createToc(pdfId: string): Promise<TocResponse>;
}
