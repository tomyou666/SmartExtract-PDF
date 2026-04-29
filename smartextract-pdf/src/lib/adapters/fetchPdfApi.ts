import { ensureOkResponse } from '@/lib/ensureOkResponse';
import type { PdfApi, PdfRecord } from '@/lib/ports/pdfApi';
import { apiUrl } from '@/lib/ports/urlJoin';
import type { TocResponse } from '@/types/toc';

export function createFetchPdfApi(baseUrl: string): PdfApi {
	return {
		async list(): Promise<PdfRecord[]> {
			const res = await fetch(apiUrl(baseUrl, '/api/pdfs'));
			await ensureOkResponse(res, 'PDF一覧の取得に失敗しました');
			const data = await res.json();
			return Array.isArray(data) ? data : [];
		},

		async upload(file: File): Promise<PdfRecord> {
			const form = new FormData();
			form.append('file', file);
			const res = await fetch(apiUrl(baseUrl, '/api/pdfs'), {
				method: 'POST',
				body: form,
			});
			await ensureOkResponse(res, 'PDFのアップロードに失敗しました');
			return res.json() as Promise<PdfRecord>;
		},

		async remove(id: number): Promise<void> {
			const res = await fetch(apiUrl(baseUrl, `/api/pdfs/${id}`), {
				method: 'DELETE',
			});
			await ensureOkResponse(res, 'PDFの削除に失敗しました');
		},

		getDocumentUrl(pdfId: number | string): string {
			return apiUrl(baseUrl, `/api/pdfs/${pdfId}`);
		},

		async getToc(pdfId: string): Promise<TocResponse> {
			const res = await fetch(apiUrl(baseUrl, `/api/pdfs/${pdfId}/toc`));
			if (!res.ok) {
				if (res.status === 404) throw new Error('NOT_FOUND');
				await ensureOkResponse(res, '目次の取得に失敗しました');
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
				throw new Error(
					text.trim() ||
						`目次の作成に失敗しました（HTTP ${res.status} ${res.statusText}）`,
				);
			}
			const data = await res.json();
			return data as TocResponse;
		},
	};
}
