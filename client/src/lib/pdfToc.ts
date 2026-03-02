import { API_BASE } from '@/lib/utils';
import type { TocResponse } from '@/types/toc';

export async function getPdfToc(pdfId: string): Promise<TocResponse> {
	const res = await fetch(`${API_BASE}/api/pdfs/${pdfId}/toc`);
	if (!res.ok) {
		if (res.status === 404) throw new Error('NOT_FOUND');
		throw new Error(res.statusText || 'Failed to fetch TOC');
	}
	const data = await res.json();
	if (typeof data === 'string') return JSON.parse(data) as TocResponse;
	if (Array.isArray(data)) return { items: data };
	return data as TocResponse;
}

export async function createPdfToc(pdfId: string): Promise<TocResponse> {
	const res = await fetch(`${API_BASE}/api/pdfs/${pdfId}/toc`, {
		method: 'POST',
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || res.statusText || 'Failed to create TOC');
	}
	const data = await res.json();
	return data as TocResponse;
}
