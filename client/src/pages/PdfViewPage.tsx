import { useLocation, useRoute } from 'wouter';
import { Layout } from '@/components/Layout';
import { PdfAppLayout } from '@/components/PdfAppLayout';
import { PdfViewer } from '@/components/PdfViewer';

export function PdfViewPage() {
	const [, params] = useRoute('/pdf/:id');
	const [, setLocation] = useLocation();
	const id = params?.id ?? null;

	return (
		<Layout>
			<PdfAppLayout
				pdfArea={<PdfViewer pdfId={id} />}
				pdfId={id}
				onPdfSelect={(numId) => setLocation(`/pdf/${numId}`)}
				onPdfDelete={(deletedId) => {
					if (id !== null && String(deletedId) === id) setLocation('/');
				}}
			/>
		</Layout>
	);
}
