import { useEffect, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/utils';

interface PdfItem {
	id: number;
	filename: string;
	created_at: string;
}

interface LeftSidebarProps {
	onPdfSelect: (id: number) => void;
	onPdfDelete?: (deletedId: number) => void;
}

export function LeftSidebar({ onPdfSelect, onPdfDelete }: LeftSidebarProps) {
	const [pdfs, setPdfs] = useState<PdfItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [deletingId, setDeletingId] = useState<number | null>(null);

	useEffect(() => {
		fetch(`${API_BASE}/api/pdfs`)
			.then((r) => r.json())
			.then((data: PdfItem[]) => {
				setPdfs(data);
			})
			.catch(() => setPdfs([]))
			.finally(() => setLoading(false));
	}, []);

	const handleUpload = () => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'application/pdf';
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;
			const form = new FormData();
			form.append('file', file);
			const res = await fetch(`${API_BASE}/api/pdfs`, {
				method: 'POST',
				body: form,
			});
			if (res.ok) {
				const created = await res.json();
				setPdfs((prev) => [{ ...created, filename: file.name }, ...prev]);
				onPdfSelect(created.id);
			}
		};
		input.click();
	};

	const handleDelete = async (e: React.MouseEvent, pdf: PdfItem) => {
		e.stopPropagation();
		if (deletingId !== null) return;
		if (!confirm(`「${pdf.filename}」を削除してもよろしいですか？`)) return;
		setDeletingId(pdf.id);
		try {
			const res = await fetch(`${API_BASE}/api/pdfs/${pdf.id}`, {
				method: 'DELETE',
			});
			if (res.ok) {
				setPdfs((prev) => prev.filter((p) => p.id !== pdf.id));
				onPdfDelete?.(pdf.id);
			}
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
