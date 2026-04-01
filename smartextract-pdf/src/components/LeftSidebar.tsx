import { FileText, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePdfApi } from '@/contexts/AppApiContext';
import type { PdfRecord } from '@/lib/ports/pdfApi';
import { cn } from '@/lib/utils';

interface LeftSidebarProps {
	onPdfSelect: (id: number) => void;
	onPdfDelete?: (deletedId: number) => void;
}

export function LeftSidebar({ onPdfSelect, onPdfDelete }: LeftSidebarProps) {
	const pdfApi = usePdfApi();
	const [pdfs, setPdfs] = useState<PdfRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [deletingId, setDeletingId] = useState<number | null>(null);

	useEffect(() => {
		let cancelled = false;
		pdfApi
			.list()
			.then((data) => {
				if (!cancelled) setPdfs(data);
			})
			.catch((e) => {
				console.error('[LeftSidebar] pdfApi.list', e);
				if (!cancelled) {
					toast.error(
						e instanceof Error ? e.message : 'PDF一覧の取得に失敗しました',
					);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [pdfApi]);

	const handleUpload = () => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'application/pdf';
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;
			try {
				const created = await pdfApi.upload(file);
				setPdfs((prev) => [{ ...created, filename: file.name }, ...prev]);
				onPdfSelect(created.id);
			} catch (err) {
				console.error('[LeftSidebar] pdfApi.upload', err);
				toast.error(
					err instanceof Error
						? err.message
						: 'PDFのアップロードに失敗しました',
				);
			}
		};
		input.click();
	};

	const handleDelete = async (e: React.MouseEvent, pdf: PdfRecord) => {
		e.stopPropagation();
		if (deletingId !== null) return;
		if (!confirm(`「${pdf.filename}」を削除してもよろしいですか？`)) return;
		setDeletingId(pdf.id);
		try {
			await pdfApi.remove(pdf.id);
			setPdfs((prev) => prev.filter((p) => p.id !== pdf.id));
			onPdfDelete?.(pdf.id);
		} catch (err) {
			console.error('[LeftSidebar] pdfApi.remove', err);
			toast.error(
				err instanceof Error ? err.message : 'PDFの削除に失敗しました',
			);
		} finally {
			setDeletingId(null);
		}
	};

	return (
		<div className='space-y-2'>
			<h2 className='flex items-center gap-2 text-sm font-semibold'>
				<FileText className='h-4 w-4' />
				保存したPDF
			</h2>
			<Button
				variant='outline'
				size='sm'
				className='w-full'
				onClick={handleUpload}
			>
				<Upload className='h-4 w-4' />
				PDFをアップロード
			</Button>
			{loading ? (
				<p className='text-muted-foreground text-sm'>読み込み中...</p>
			) : (
				<ul className='space-y-1'>
					{pdfs.map((pdf) => (
						<li key={pdf.id} className='flex items-center gap-1'>
							<button
								type='button'
								className={cn(
									'min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
								)}
								onClick={() => onPdfSelect(pdf.id)}
								title={pdf.filename}
							>
								<span className='truncate'>{pdf.filename}</span>
							</button>
							<Button
								type='button'
								variant='ghost'
								size='icon'
								className='h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive'
								onClick={(e) => handleDelete(e, pdf)}
								disabled={deletingId === pdf.id}
								aria-label='PDFを削除'
							>
								<Trash2 className='h-3.5 w-3.5' />
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
