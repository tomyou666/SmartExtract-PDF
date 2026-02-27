import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Layout } from '@/components/Layout';
import { LeftSidebar } from '@/components/LeftSidebar';
import { PdfAppLayout } from '@/components/PdfAppLayout';
import { API_BASE } from '@/lib/utils';

export function HomePage() {
	const [, setLocation] = useLocation();

	useEffect(() => {
		fetch(`${API_BASE}/api/pdfs`)
			.then((r) => r.json())
			.then((pdfs: { id: number }[]) => {
				if (pdfs.length > 0) {
					setLocation(`/pdf/${pdfs[0].id}`);
				}
			})
			.catch(() => {});
	}, [setLocation]);

	return (
		<Layout>
			<PdfAppLayout
				pdfArea={
					<div className='flex h-full items-center justify-center text-muted-foreground'>
						<p>PDFをアップロードするか、左の一覧から選択してください。</p>
					</div>
				}
				pdfId={null}
				onPdfSelect={(id) => setLocation(`/pdf/${id}`)}
			/>
		</Layout>
	);
}
