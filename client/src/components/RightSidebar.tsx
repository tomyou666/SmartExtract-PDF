import { ChatPanel } from './ChatPanel'
import { PdfImageToolbar } from './PdfImageToolbar'
import { ExportMdButton } from './ExportMdButton'
import { useChatSessionStore } from '@/stores/chatSessionStore'

interface RightSidebarProps {
  pdfId: string | null
}

export function RightSidebarHeader() {
  const currentSessionId = useChatSessionStore((s) => s.currentSessionId)
  const currentSessionTitle = useChatSessionStore((s) => s.currentSessionTitle)
  return (
    <span className="flex items-center gap-1 text-sm font-medium">
      <ExportMdButton
        sessionId={currentSessionId}
        sessionTitle={currentSessionTitle}
      />
    </span>
  )
}

export function RightSidebar({ pdfId }: RightSidebarProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-2 py-2">
        <PdfImageToolbar pdfId={pdfId} />
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatPanel pdfId={pdfId} />
      </div>
    </div>
  )
}
