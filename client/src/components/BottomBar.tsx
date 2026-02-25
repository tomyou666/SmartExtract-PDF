import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Maximize, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePdfViewerStore } from '@/stores/pdfViewerStore'
import { API_BASE } from '@/lib/utils'

interface BottomBarProps {
  pdfId: string | null
}

export function BottomBar({ pdfId }: BottomBarProps) {
  const pluginFns = usePdfViewerStore((s) => s.pluginFns)
  const pageIndex = usePdfViewerStore((s) => s.pageIndex)
  const scale = usePdfViewerStore((s) => s.scale)
  const numPages = usePdfViewerStore((s) => s.numPages)
  const viewerContainerRef = usePdfViewerStore((s) => s.viewerContainerRef)

  const currentPage = pageIndex + 1
  const pageCount = numPages

  const onZoomIn = () => pluginFns?.zoom(scale + 0.25)
  const onZoomOut = () => pluginFns?.zoom(Math.max(0.5, scale - 0.25))
  const onPagePrev = () => pluginFns?.jumpToPreviousPage()
  const onPageNext = () => pluginFns?.jumpToNextPage()
  const onFullscreen = () => {
    const el = viewerContainerRef?.current
    if (el) pluginFns?.enterFullScreenMode(el)
  }
  const onDownload = () => {
    if (!pdfId) return
    const url = `${API_BASE}/api/pdfs/${pdfId}`
    window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="flex h-12 items-center justify-between gap-2 border-t border-border bg-background px-4">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onZoomOut} disabled={!pdfId || !pluginFns}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="min-w-[4rem] text-center text-sm">{Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="icon" onClick={onZoomIn} disabled={!pdfId || !pluginFns}>
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPagePrev}
          disabled={!pdfId || !pluginFns || currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[5rem] text-center text-sm">
          {currentPage} / {pageCount || '-'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onPageNext}
          disabled={!pdfId || !pluginFns || currentPage >= pageCount}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onFullscreen}
          disabled={!pdfId || !pluginFns || !viewerContainerRef?.current}
        >
          <Maximize className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDownload} disabled={!pdfId}>
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
