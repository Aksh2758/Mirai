import { create } from 'zustand'
import type { Project, RoadmapStep, CodeFile, CopilotMessage } from '@/lib/types'

interface StudioState {
  // Project data (from backend)
  project: Project | null
  setProject: (project: Project) => void

  // Current file in editor
  activeFilename: string
  setActiveFilename: (filename: string) => void

  // Code for each file — synced with Monaco editor
  // Key: filename, Value: current content
  codeFiles: Record<string, string>
  setFileContent: (filename: string, content: string) => void

  // Copilot messages
  messages: CopilotMessage[]
  addMessage: (msg: CopilotMessage) => void
  appendToLastMessage: (content: string) => void    // For streaming
  setLastMessageCodeBlock: (code: string) => void   // For Apply Fix

  // UI state
  isStreaming: boolean
  setIsStreaming: (v: boolean) => void
  adaptiveMessage: string | null
  setAdaptiveMessage: (msg: string | null) => void
  showCopilot: boolean
  setShowCopilot: (v: boolean) => void
}

export const useStudioStore = create<StudioState>((set) => ({
  project: null,
  setProject: (project) => {
    // When project loads, initialize codeFiles from project.code_files
    const codeFiles: Record<string, string> = {}
    project.code_files.forEach(f => {
      codeFiles[f.filename] = f.content
    })
    // If no files yet, use step 0 starter code
    if (project.code_files.length === 0 && project.steps.length > 0) {
      const step0 = project.steps[0]
      codeFiles[step0.starter_filename] = step0.starter_code
    }
    const activeFilename = Object.keys(codeFiles)[0] ?? 'main.py'
    set({ project, codeFiles, activeFilename })
  },

  activeFilename: 'main.py',
  setActiveFilename: (filename) => set({ activeFilename: filename }),

  codeFiles: {},
  setFileContent: (filename, content) =>
    set(state => ({ codeFiles: { ...state.codeFiles, [filename]: content } })),

  messages: [],
  addMessage: (msg) => set(state => ({ messages: [...state.messages, msg] })),
  appendToLastMessage: (content) =>
    set(state => {
      const messages = [...state.messages]
      if (messages.length === 0) return state
      const last = { ...messages[messages.length - 1] }
      last.content += content
      messages[messages.length - 1] = last
      return { messages }
    }),
  setLastMessageCodeBlock: (code) =>
    set(state => {
      const messages = [...state.messages]
      if (messages.length === 0) return state
      const last = { ...messages[messages.length - 1], code_block: code }
      messages[messages.length - 1] = last
      return { messages }
    }),

  isStreaming: false,
  setIsStreaming: (v) => set({ isStreaming: v }),
  adaptiveMessage: null,
  setAdaptiveMessage: (msg) => set({ adaptiveMessage: msg }),
  showCopilot: false, // Default to false per plan
  setShowCopilot: (v) => set({ showCopilot: v }),
}))
