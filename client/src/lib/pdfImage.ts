import type { SelectionRect } from '@/stores/pdfViewerStore'

export function getCurrentPageImageDataUrl(
  pageCanvases: Map<number, HTMLCanvasElement>,
  pageIndex: number,
): string | null {
  const canvas = pageCanvases.get(pageIndex)
  if (!canvas) return null
  return canvas.toDataURL('image/png')
}

/**
 * Crop rectangles from page canvases and stack them vertically (left-aligned).
 * Returns a single image as data URL.
 */
export function getSelectionImageDataUrl(
  pageCanvases: Map<number, HTMLCanvasElement>,
  rects: SelectionRect[],
): string | null {
  if (rects.length === 0) return null
  const totalHeight = rects.reduce((acc, r) => acc + r.h, 0)
  const maxWidth = Math.max(...rects.map((r) => r.w))
  const combined = document.createElement('canvas')
  combined.width = maxWidth
  combined.height = totalHeight
  const ctx = combined.getContext('2d')
  if (!ctx) return null
  let y = 0
  for (const rect of rects) {
    const canvas = pageCanvases.get(rect.pageIndex)
    if (!canvas) continue
    ctx.drawImage(
      canvas,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      0,
      y,
      rect.w,
      rect.h,
    )
    y += rect.h
  }
  return combined.toDataURL('image/png')
}

/** Copy an image data URL to the clipboard as PNG. */
export async function copyImageDataUrlToClipboard(dataUrl: string): Promise<void> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const type = blob.type || 'image/png'
  await navigator.clipboard.write([new ClipboardItem({ [type]: blob })])
}
