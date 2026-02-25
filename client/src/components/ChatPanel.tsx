import { useCallback, useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { Streamdown } from 'streamdown'
import 'streamdown/styles.css'
import { Copy, Send, PlusCircle, X, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { API_BASE } from '@/lib/utils'
import { useChatImageStore } from '@/stores/chatImageStore'
import { useChatSessionStore } from '@/stores/chatSessionStore'

interface Session {
  id: string
  pdf_id: number | null
  title: string
  created_at: string
  updated_at: string
}

interface ChatPanelProps {
  pdfId: string | null
}

export function ChatPanel({ pdfId }: ChatPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [pendingFirstMessage, setPendingFirstMessage] = useState<{
    text: string
    attachments?: { url: string; contentType: string }[]
  } | null>(null)
  const pendingImages = useChatImageStore((s) => s.pendingImages)
  const addImage = useChatImageStore((s) => s.addImage)
  const removeImage = useChatImageStore((s) => s.removeImage)
  const clearImages = useChatImageStore((s) => s.clearImages)
  const setCurrentSession = useChatSessionStore((s) => s.setCurrentSession)

  const apiUrl =
    currentSessionId && typeof API_BASE === 'string'
      ? `${API_BASE}/api/chat/sessions/${currentSessionId}/messages`
      : '/api/chat/sessions/__placeholder__/messages'

  const [titleGeneratedForSessionId, setTitleGeneratedForSessionId] = useState<
    string | null
  >(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const editTitleInputRef = useRef<HTMLInputElement>(null)

  const {
    messages,
    append,
    setMessages,
    status,
    error,
    setInput,
    input,
  } = useChat({
    api: apiUrl,
    id: currentSessionId ?? undefined,
    streamProtocol: 'text',
    initialMessages: [],
    onFinish: async () => {
      if (
        !currentSessionId ||
        titleGeneratedForSessionId === currentSessionId
      )
        return
      try {
        const res = await fetch(
          `${API_BASE}/api/chat/sessions/${currentSessionId}/title`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          },
        )
        if (res.ok) {
          setTitleGeneratedForSessionId(currentSessionId)
          const { title } = await res.json()
          await fetch(
            `${API_BASE}/api/chat/sessions/${currentSessionId}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title }),
            },
          )
          fetchSessions()
        }
      } catch {
        // ignore
      }
    },
  })

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/sessions`)
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
      }
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    if (currentSessionId) {
      const s = sessions.find((x) => x.id === currentSessionId)
      setCurrentSession(currentSessionId, s?.title ?? '新規チャット')
    } else {
      setCurrentSession(null, '')
    }
  }, [currentSessionId, sessions, setCurrentSession])

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const saveTitle = useCallback(async () => {
    if (!currentSessionId || editTitleValue.trim() === '') {
      setEditingTitle(false)
      return
    }
    const newTitle = editTitleValue.trim()
    try {
      const res = await fetch(
        `${API_BASE}/api/chat/sessions/${currentSessionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        },
      )
      if (res.ok) {
        setEditingTitle(false)
        setCurrentSession(currentSessionId, newTitle)
        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId ? { ...s, title: newTitle } : s,
          ),
        )
      }
    } catch {
      setEditingTitle(false)
    }
  }, [currentSessionId, editTitleValue, setCurrentSession])

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!confirm('この会話セッションを削除しますか？')) return
      try {
        const res = await fetch(
          `${API_BASE}/api/chat/sessions/${sessionId}`,
          { method: 'DELETE' },
        )
        if (!res.ok) return
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
        if (currentSessionId === sessionId) {
          const remaining = sessions.filter((s) => s.id !== sessionId)
          const nextId = remaining[0]?.id ?? null
          const nextTitle = remaining[0]?.title ?? ''
          setCurrentSessionId(nextId)
          setCurrentSession(nextId, nextTitle)
        }
      } catch {
        // ignore
      }
    },
    [currentSessionId, sessions, setCurrentSession],
  )

  useEffect(() => {
    if (editingTitle) {
      setEditTitleValue(currentSession?.title ?? '')
      editTitleInputRef.current?.focus()
    }
  }, [editingTitle])

  useEffect(() => {
    if (pendingFirstMessage && currentSessionId && messages.length === 0) {
      const { text, attachments } = pendingFirstMessage
      setPendingFirstMessage(null)
      if (attachments) clearImages()
      append(
        {
          role: 'user',
          content: text || '(画像のみ)',
          experimental_attachments: attachments,
        },
        { body: {} },
      )
    }
  }, [currentSessionId, pendingFirstMessage, messages.length, append, clearImages])

  useEffect(() => {
    if (!currentSessionId) {
      setMessages([])
      return
    }
    let cancelled = false
    fetch(`${API_BASE}/api/chat/sessions/${currentSessionId}/messages`)
      .then((r) => r.json())
      .then((msgs: { role: string; content_json: { text?: string; parts?: unknown[] } }[]) => {
        if (cancelled) return
        const uiMessages = msgs.map((m, i) => ({
          id: `loaded-${i}`,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content_json?.text ?? '',
          parts:
            m.content_json?.parts ??
            (m.content_json?.text
              ? [{ type: 'text' as const, text: m.content_json.text }]
              : []),
        }))
        setMessages(uiMessages)
        if (msgs.length > 0) setTitleGeneratedForSessionId(currentSessionId)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [currentSessionId, setMessages])

  const createSession = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_id: pdfId ? Number(pdfId) : null, title: '新規チャット' }),
      })
      if (res.ok) {
        const session = await res.json()
        setSessions((prev) => [session, ...prev])
        setCurrentSessionId(session.id)
        setCurrentSession(session.id, session.title)
      }
    } catch {
      // ignore
    }
  }

  const copyMessage = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const formRef = useRef<HTMLFormElement>(null)

  const sendWithAttachments = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = (e.target as HTMLFormElement).querySelector('textarea')?.value?.trim() ?? input.trim()
    const attachments =
      pendingImages.length > 0
        ? pendingImages.map((url) => ({ url, contentType: 'image/png' as const }))
        : undefined
    setInput('')
    if (!currentSessionId) {
      setPendingFirstMessage({ text, attachments })
      await createSession()
      return
    }
    if (attachments) clearImages()
    await append(
      {
        role: 'user',
        content: text || '(画像のみ)',
        experimental_attachments: attachments,
      },
      { body: {} },
    )
  }

  const isLoading = status === 'submitted' || status === 'streaming'

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (!item.type.startsWith('image/')) continue
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result
          if (typeof dataUrl === 'string') addImage(dataUrl)
        }
        reader.readAsDataURL(file)
        break
      }
    },
    [addImage],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
        <span className="text-muted-foreground text-xs">セッション</span>
        <Button variant="ghost" size="sm" onClick={createSession}>
          <PlusCircle className="h-4 w-4" />
          新規
        </Button>
      </div>
      {loadingSessions ? (
        <p className="text-muted-foreground p-2 text-sm">読み込み中...</p>
      ) : (
        <div className="space-y-1 px-2">
          <div className="flex items-center gap-1">
            {editingTitle && currentSessionId ? (
              <input
                ref={editTitleInputRef}
                type="text"
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    saveTitle()
                  }
                  if (e.key === 'Escape') {
                    setEditingTitle(false)
                    setEditTitleValue(currentSession?.title ?? '')
                  }
                }}
                className="border-border bg-background text-foreground flex-1 rounded border px-2 py-1 text-sm"
                placeholder="タイトル"
              />
            ) : (
              <>
                <select
                  className="border-border bg-background text-foreground min-w-0 flex-1 rounded border px-2 py-1 text-sm"
                  value={currentSessionId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value || null
                    setCurrentSessionId(id)
                    setEditingTitle(false)
                    const s = sessions.find((x) => x.id === id)
                    setCurrentSession(id, s?.title ?? '')
                  }}
                >
                  <option value="">選択してください</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                {currentSessionId && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      aria-label="タイトルを編集"
                      onClick={() => setEditingTitle(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="セッションを削除"
                      onClick={() => deleteSession(currentSessionId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-2">
        {messages.map((msg) => {
          const isLastAssistant =
            msg.role === 'assistant' && msg.id === messages[messages.length - 1]?.id
          const streaming = isLastAssistant && status === 'streaming'
          const textFromParts =
            msg.parts
              ?.filter((p: { type: string }) => p.type === 'text')
              .map((p: { text?: string }) => p.text ?? '')
              .join('') ?? msg.content ?? ''
          const assistantText = textFromParts
          const userText = textFromParts
          return (
            <div
              key={msg.id}
              className={`mb-3 rounded-lg p-2 ${
                msg.role === 'user'
                  ? 'bg-primary/10 ml-4'
                  : 'bg-muted/50 mr-4'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-muted-foreground text-xs font-medium">
                  {msg.role === 'user' ? 'あなた' : 'アシスタント'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    const text =
                      msg.parts
                        ?.map((p: { type: string; text?: string }) =>
                          p.type === 'text' ? p.text : '',
                        )
                        .filter(Boolean)
                        .join('') ?? msg.content ?? ''
                    if (text) copyMessage(text)
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              {msg.role === 'assistant' ? (
                <Streamdown
                  mode={streaming ? 'streaming' : 'static'}
                  isAnimating={streaming}
                >
                  {assistantText}
                </Streamdown>
              ) : msg.role === 'user' ? (
                <p className="whitespace-pre-wrap text-sm">{userText}</p>
              ) : null}
            </div>
          )
        })}
      </div>

      {error && (
        <p className="text-destructive px-2 text-sm">{error.message}</p>
      )}

      <form ref={formRef} onSubmit={sendWithAttachments} className="border-t border-border p-2">
        {pendingImages.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1">
            {pendingImages.map((url, i) => (
              <div key={i} className="relative shrink-0">
                <img
                  src={url}
                  alt=""
                  className="h-12 w-12 rounded object-cover"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute -right-1 -top-1 h-5 w-5 rounded-full border border-border shadow"
                  aria-label="画像を削除"
                  onClick={() => removeImage(i)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                formRef.current?.requestSubmit()
              }
            }}
            placeholder="メッセージを入力..."
            className="border-border bg-background text-foreground min-h-[40px] flex-1 resize-none rounded border px-2 py-1 text-sm"
            rows={2}
          />
          <Button type="submit" size="icon" disabled={isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  )
}
