import { useEffect } from 'react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import { Layout } from '@/components/Layout';
import { PdfAppLayout } from '@/components/PdfAppLayout';
import { usePdfApi } from '@/contexts/AppApiContext';

export function HomePage() {
	const [, setLocation] = useLocation();
	const pdfApi = usePdfApi();

	useEffect(() => {
		pdfApi
			.list()
			.then((pdfs) => {
				if (pdfs.length > 0) {
					setLocation(`/pdf/${pdfs[0].id}`);
				}
			})
			.catch((e) => {
				console.error('[HomePage] pdfApi.list', e);
				toast.error(
					e instanceof Error ? e.message : 'PDF一覧の取得に失敗しました',
				);
			});
	}, [setLocation, pdfApi]);

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
