import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { API_BASE } from '@/lib/utils'

interface LLMSettingsSheetProps {
  open: boolean
  onClose: () => void
}

export function LLMSettingsSheet({ open, onClose }: LLMSettingsSheetProps) {
  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('gpt-4o')
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch(`${API_BASE}/api/settings/llm`)
      .then((r) => r.json())
      .then((data: { provider: string; model: string; api_key_masked?: boolean }) => {
        setProvider(data.provider ?? 'openai')
        setModel(data.model ?? 'gpt-4o')
        setApiKey(data.api_key_masked ? '********' : '')
      })
      .catch(() => {})
  }, [open])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const body: { provider: string; model: string; api_key?: string } = {
      provider,
      model,
    }
    if (apiKey && apiKey !== '********') body.api_key = apiKey
    const res = await fetch(`${API_BASE}/api/settings/llm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background border-border flex max-h-[90vh] w-full max-w-md flex-col rounded-lg border p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Settings className="h-5 w-5" />
          LLM 設定
        </h3>
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <label className="text-sm font-medium">
            プロバイダー
            <select
              className="border-border bg-background mt-1 w-full rounded border px-2 py-1"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Gemini</option>
              <option value="groq">Groq</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            モデル
            <input
              type="text"
              className="border-border bg-background mt-1 w-full rounded border px-2 py-1"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o"
            />
          </label>
          <label className="text-sm font-medium">
            API キー
            <input
              type="password"
              className="border-border bg-background mt-1 w-full rounded border px-2 py-1"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="設定済みの場合は変更時のみ入力"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="submit">{saved ? '保存しました' : '保存'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
