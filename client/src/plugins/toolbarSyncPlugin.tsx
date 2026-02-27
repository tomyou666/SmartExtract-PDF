import type { Plugin } from '@react-pdf-viewer/core';
import { usePdfViewerStore } from '@/stores/pdfViewerStore';

export function toolbarSyncPlugin(): Plugin {
	return {
		install(pluginFunctions) {
			usePdfViewerStore.setState({
				pluginFns: {
					jumpToPage: pluginFunctions.jumpToPage.bind(pluginFunctions),
					jumpToNextPage: pluginFunctions.jumpToNextPage.bind(pluginFunctions),
					jumpToPreviousPage:
						pluginFunctions.jumpToPreviousPage.bind(pluginFunctions),
					zoom: (scale: number) => pluginFunctions.zoom(scale),
					enterFullScreenMode:
						pluginFunctions.enterFullScreenMode.bind(pluginFunctions),
					exitFullScreenMode:
						pluginFunctions.exitFullScreenMode.bind(pluginFunctions),
					getViewerState: () => pluginFunctions.getViewerState(),
				},
			});
		},
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
