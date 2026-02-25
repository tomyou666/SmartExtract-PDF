import { create } from 'zustand'

interface ChatSessionStore {
  currentSessionId: string | null
  currentSessionTitle: string
  setCurrentSession: (id: string | null, title: string) => void
}

export const useChatSessionStore = create<ChatSessionStore>((set) => ({
  currentSessionId: null,
  currentSessionTitle: '',
  setCurrentSession: (currentSessionId, currentSessionTitle) =>
    set({ currentSessionId, currentSessionTitle }),
}))
