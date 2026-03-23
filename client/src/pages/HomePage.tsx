import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Layout } from '@/components/Layout';
import { PdfAppLayout } from '@/components/PdfAppLayout';
import { apiUrl, authFetch } from '@/lib/api';

export function HomePage() {
	const [, setLocation] = useLocation();

	useEffect(() => {
		authFetch(apiUrl('/api/pdfs'))
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
