/** 目次1項目（API形式: page は1始まり、level は1〜6） */
export interface TocItem {
	title: string;
	page: number;
	level: number;
}

/** GET /api/pdfs/{id}/toc の応答 */
export interface TocResponse {
	items: TocItem[];
}
