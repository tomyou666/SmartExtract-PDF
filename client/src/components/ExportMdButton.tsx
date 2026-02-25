import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { API_BASE } from '@/lib/utils'

interface ExportMdButtonProps {
  sessionId: string | null
  sessionTitle: string
}

export function ExportMdButton({ sessionId, sessionTitle }: ExportMdButtonProps) {
  const exportMd = async () => {
    if (!sessionId) return
    const res = await fetch(
      `${API_BASE}/api/chat/sessions/${sessionId}/messages`,
    )
    if (!res.ok) return
    const messages = await res.json()
    const lines: string[] = [`# ${sessionTitle}\n`]
    for (const m of messages) {
      const role = m.role === 'user' ? 'あなた' : 'アシスタント'
      const text =
        m.content_json?.text ??
        (Array.isArray(m.content_json?.parts)
          ? m.content_json.parts
              .filter((p: { type: string }) => p.type === 'text')
              .map((p: { text?: string }) => p.text ?? '')
              .join('')
          : '')
      lines.push(`## ${role}\n\n${text}\n`)
    }
    const md = lines.join('\n')
    await navigator.clipboard.writeText(md)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={exportMd}
      disabled={!sessionId}
      title="会話をMarkdownでコピー"
    >
      <FileDown className="mr-1 h-4 w-4" />
      MDをコピー
    </Button>
  )
}
