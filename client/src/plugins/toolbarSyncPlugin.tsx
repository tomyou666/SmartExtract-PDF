import type { Plugin } from '@react-pdf-viewer/core';
import { usePdfViewerStore } from '@/stores/pdfViewerStore';

/**
 * ビューアの状態（ページ・倍率・キャンバス）のみストアに同期するプラグイン。
 * ズーム・ページ移動・フルスクリーンは @react-pdf-viewer/zoom, page-navigation, full-screen を利用する。
 */
export function toolbarSyncPlugin(): Plugin {
	return {
		onViewerStateChange(viewerState) {
			usePdfViewerStore.setState({
				pageIndex: viewerState.pageIndex,
				scale: viewerState.scale,
			});
			return viewerState;
		},
		onDocumentLoad(props) {
			usePdfViewerStore.setState({ numPages: props.doc.numPages });
		},
		onCanvasLayerRender(props) {
			usePdfViewerStore.getState().setPageCanvas(props.pageIndex, props.ele);
		},
	};
}
