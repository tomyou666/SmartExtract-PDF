import { useEffect, useRef } from 'react';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import { API_BASE } from '@/lib/utils';
import { usePdfViewerStore } from '@/stores/pdfViewerStore';
import { toolbarSyncPlugin } from '@/plugins/toolbarSyncPlugin';
import { SelectionOverlay } from '@/components/SelectionOverlay';

// 公式推奨: インストールした pdfjs-dist の worker をバンドルから参照（外部 CDN を使わない）
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';

interface PdfViewerProps {
	pdfId: string | null;
}

export function PdfViewer({ pdfId }: PdfViewerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const setViewerContainerRef = usePdfViewerStore(
		(s) => s.setViewerContainerRef,
	);
	const reset = usePdfViewerStore((s) => s.reset);
	const selectionMode = usePdfViewerStore((s) => s.selectionMode);

	useEffect(() => {
		setViewerContainerRef(containerRef);
		return () => {
			reset();
			setViewerContainerRef(null);
		};
	}, [setViewerContainerRef, reset]);

	const url = pdfId ? `${API_BASE}/api/pdfs/${pdfId}` : null;

	if (!url) {
		return (
			<div className='flex h-full items-center justify-center text-muted-foreground'>
				PDFを選択してください
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className='flex h-full flex-col overflow-auto bg-muted/30'
		>
			<div className='relative w-full'>
				<Worker workerUrl={workerSrc}>
					<Viewer fileUrl={url} plugins={[toolbarSyncPlugin()]} />
				</Worker>
				{selectionMode && <SelectionOverlay />}
			</div>
		</div>
	);
}
