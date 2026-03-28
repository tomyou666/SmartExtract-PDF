import type { PdfApi, PdfRecord } from '@/lib/ports/pdfApi';
import { apiUrl } from '@/lib/ports/urlJoin';
import type { TocResponse } from '@/types/toc';

export function createFetchPdfApi(baseUrl: string): PdfApi {
	return {
		async list(): Promise<PdfRecord[]> {
			try {
				const res = await fetch(apiUrl(baseUrl, '/api/pdfs'));
				if (!res.ok) return [];
				const data = await res.json();
				return Array.isArray(data) ? data : [];
			} catch {
				return [];
			}
		},

		async upload(file: File): Promise<PdfRecord | null> {
			const form = new FormData();
			form.append('file', file);
			const res = await fetch(apiUrl(baseUrl, '/api/pdfs'), {
				method: 'POST',
				body: form,
			});
			if (!res.ok) return null;
			return res.json() as Promise<PdfRecord>;
		},

		async remove(id: number): Promise<boolean> {
			const res = await fetch(apiUrl(baseUrl, `/api/pdfs/${id}`), {
				method: 'DELETE',
			});
			return res.ok;
		},

		getDocumentUrl(pdfId: number | string): string {
			return apiUrl(baseUrl, `/api/pdfs/${pdfId}`);
		},

		async getToc(pdfId: string): Promise<TocResponse> {
			const res = await fetch(apiUrl(baseUrl, `/api/pdfs/${pdfId}/toc`));
			if (!res.ok) {
				if (res.status === 404) throw new Error('NOT_FOUND');
				throw new Error(res.statusText || 'Failed to fetch TOC');
			}
			const data = await res.json();
			if (typeof data === 'string') return JSON.parse(data) as TocResponse;
			if (Array.isArray(data)) return { items: data };
			return data as TocResponse;
		},

		async createToc(pdfId: string): Promise<TocResponse> {
			const res = await fetch(apiUrl(baseUrl, `/api/pdfs/${pdfId}/toc`), {
				method: 'POST',
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || res.statusText || 'Failed to create TOC');
			}
			const data = await res.json();
			return data as TocResponse;
		},
	};
}
