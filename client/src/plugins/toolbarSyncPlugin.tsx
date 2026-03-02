import type { Plugin } from '@react-pdf-viewer/core';
import type { RefObject } from 'react';
import { useEffect } from 'react';
import { createElement, Fragment } from 'react';
import { SelectionOverlay } from '@/components/SelectionOverlay';
import { usePdfViewerStore } from '@/stores/pdfViewerStore';

/**
 * ビューアのスクロールコンテナ（inner-pages）の ref をストアに渡し、
 * 矩形オーバーレイをその子として描画してスクロール追従させる。
 */
function PagesContainerRefSync({
	pagesContainerRef,
}: {
	pagesContainerRef: RefObject<HTMLDivElement | null>;
}) {
	const setViewerContainerRef = usePdfViewerStore(
		(s) => s.setViewerContainerRef,
	);
	useEffect(() => {
		setViewerContainerRef(pagesContainerRef);
		return () => setViewerContainerRef(null);
	}, [pagesContainerRef, setViewerContainerRef]);
	return null;
}

/**
 * ビューアの状態（ページ・倍率・キャンバス）のみストアに同期するプラグイン。
 * ズーム・ページ移動・フルスクリーンは @react-pdf-viewer/zoom, page-navigation, full-screen を利用する。
 * 矩形オーバーレイを inner-pages 内に描画し、PDF スクロールに追従させる。
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
			props.doc
				.getOutline()
				.then((outline) => {
					const has = Array.isArray(outline) && outline.length > 0;
					usePdfViewerStore.getState().setHasEmbeddedOutline(has);
				})
				.catch(() => {
					usePdfViewerStore.getState().setHasEmbeddedOutline(false);
				});
		},
		onCanvasLayerRender(props) {
			usePdfViewerStore.getState().setPageCanvas(props.pageIndex, props.ele);
		},
		renderViewer(props) {
			const slot = props.slot;
			const subSlot = slot.subSlot;
			if (!subSlot) return slot;
			return {
				...slot,
				subSlot: {
					...subSlot,
					children: createElement(
						Fragment,
						null,
						createElement(PagesContainerRefSync, {
							pagesContainerRef: props.pagesContainerRef,
						}),
						subSlot.children,
						createElement(SelectionOverlay),
					),
				},
			};
		},
	};
}
