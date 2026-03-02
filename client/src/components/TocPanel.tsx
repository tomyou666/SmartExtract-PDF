import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { createPdfToc, getPdfToc } from '@/lib/pdfToc';
import type { TocItem } from '@/types/toc';
import { usePdfViewerStore } from '@/stores/pdfViewerStore';

interface TocPanelProps {
	pdfId: string | null;
	bookmarksSlot: React.ReactNode;
}

export function TocPanel({ pdfId, bookmarksSlot }: TocPanelProps) {
	const hasEmbeddedOutline = usePdfViewerStore((s) => s.hasEmbeddedOutline);
	const viewerApi = usePdfViewerStore((s) => s.viewerApi);

	const [apiToc, setApiToc] = useState<TocItem[] | null>(null);
	const [tocLoading, setTocLoading] = useState(false);
	const [tocError, setTocError] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);

	const fetchToc = useCallback(async (id: string) => {
		setTocLoading(true);
		setTocError(null);
		try {
			const res = await getPdfToc(id);
			const items = res?.items ?? (Array.isArray(res) ? res : []);
			setApiToc(items);
		} catch (e) {
			if (e instanceof Error && e.message === 'NOT_FOUND') {
				setApiToc(null);
			} else {
				setTocError(
					e instanceof Error ? e.message : '目次の取得に失敗しました',
				);
			}
		} finally {
			setTocLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!pdfId || hasEmbeddedOutline !== false) {
			setApiToc(null);
			setTocError(null);
			return;
		}
		fetchToc(pdfId);
	}, [pdfId, hasEmbeddedOutline, fetchToc]);

	const handleCreateToc = useCallback(async () => {
		if (!pdfId) return;
		setCreating(true);
		setCreateError(null);
		try {
			await createPdfToc(pdfId);
			await fetchToc(pdfId);
		} catch (e) {
			setCreateError(
				e instanceof Error ? e.message : '目次の作成に失敗しました',
			);
		} finally {
			setCreating(false);
		}
	}, [pdfId, fetchToc]);

	const handleTocItemClick = useCallback(
		(page: number) => {
			viewerApi?.jumpToPage(page - 1);
		},
		[viewerApi],
	);

	if (!pdfId) {
		return (
			<p className='text-muted-foreground py-4 text-center text-sm'>
				PDFを選択すると目次が表示されます
			</p>
		);
	}

	if (hasEmbeddedOutline === true) {
		return (
			<div className='flex flex-1 flex-col overflow-auto'>{bookmarksSlot}</div>
		);
	}

	if (hasEmbeddedOutline === null) {
		return (
			<div className='text-muted-foreground flex flex-1 items-center justify-center py-4'>
				<Loader2 className='h-5 w-5 animate-spin' aria-hidden />
			</div>
		);
	}

	if (tocLoading) {
		return (
			<div className='text-muted-foreground flex flex-1 items-center justify-center py-4'>
				<Loader2 className='h-5 w-5 animate-spin' aria-hidden />
			</div>
		);
	}

	if (tocError) {
		return (
			<p className='text-destructive py-4 px-2 text-center text-sm'>
				{tocError}
			</p>
		);
	}

	if (apiToc && apiToc.length > 0) {
		return (
			<div className='flex flex-1 flex-col overflow-auto p-1'>
				<ul className='space-y-0.5 text-sm'>
					{apiToc.map((item, i) => (
						<li key={`${item.page}-${item.title}-${i}`}>
							<button
								type='button'
								className='w-full rounded px-2 py-1.5 text-left hover:bg-muted'
								style={{
									paddingLeft: `${(item.level - 1) * 12 + 8}px`,
								}}
								onClick={() => handleTocItemClick(item.page)}
							>
								<span className='truncate'>{item.title}</span>
								<span className='text-muted-foreground ml-1 text-xs'>
									{item.page}
								</span>
							</button>
						</li>
					))}
				</ul>
			</div>
		);
	}

	return (
		<div className='flex flex-1 flex-col gap-3 overflow-auto p-2'>
			<p className='text-muted-foreground text-center text-sm'>
				目次がありません。AIで目次を作成できます。
			</p>
			<Button
				type='button'
				onClick={handleCreateToc}
				disabled={creating}
				aria-busy={creating}
				className='w-full'
			>
				{creating ? (
					<>
						<Loader2 className='h-4 w-4 animate-spin' aria-hidden />
						作成中…
					</>
				) : (
					'AIで目次情報を作成する'
				)}
			</Button>
			{createError && (
				<p className='text-destructive text-center text-sm'>{createError}</p>
			)}
		</div>
	);
}
