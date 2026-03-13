import { useCallback } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Layout } from '@/components/Layout';
import { PdfAppLayout } from '@/components/PdfAppLayout';
import { PdfViewer } from '@/components/PdfViewer';
import { PdfSidebarProvider } from '@/contexts/PdfSidebarContext';

export function PdfViewPage() {
	const [, params] = useRoute('/pdf/:id');
	const [, setLocation] = useLocation();
	const id = params?.id ?? null;

	const handlePdfSelect = useCallback(
		(numId: number) => {
			setLocation(`/pdf/${numId}`);
		},
		[setLocation],
	);

	const handlePdfDelete = useCallback(
		(deletedId: number) => {
			if (id !== null && String(deletedId) === id) {
				setLocation('/');
			}
		},
		[id, setLocation],
	);

	return (
		<Layout>
			<PdfSidebarProvider>
				<PdfAppLayout
					pdfArea={<PdfViewer pdfId={id} />}
					pdfId={id}
					onPdfSelect={handlePdfSelect}
					onPdfDelete={handlePdfDelete}
				/>
			</PdfSidebarProvider>
		</Layout>
	);
}
