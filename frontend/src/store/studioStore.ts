import { create } from 'zustand'
import type { Project, CopilotMessage, CodeBlock, PsiResult, DeployStep, DeployResult } from '@/lib/types'

// Virtual "pinned" tab id for the Roadmap/Instructions view that lives inside
// the editor's tab strip (like a Welcome tab in VS Code). It is not a real
// file — CodeEditor special-cases this id and renders <RoadmapTab /> instead
// of the Monaco editor. It can never be closed by the user.
export const ROADMAP_TAB_ID = '__roadmap__'

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
  addFile: (filename: string, content?: string) => void
  removeFile: (filename: string) => void
  renameFileInStore: (oldFilename: string, newFilename: string) => void

  // Unsaved tracking — filenames that have changes not yet persisted
  unsavedFiles: Set<string>
  markUnsaved: (filename: string) => void
  markSaved: (filename: string) => void

  // Copilot messages
  messages: CopilotMessage[]
  addMessage: (msg: CopilotMessage) => void
  appendToLastMessage: (content: string) => void          // For streaming
  setLastMessageCodeBlock: (code: string) => void         // Legacy single Apply Fix
  setLastMessageCodeBlocks: (blocks: CodeBlock[]) => void // Multi-file Apply Fix
  clearMessages: () => void                               // Clear chat history

  // UI state
  isStreaming: boolean
  setIsStreaming: (v: boolean) => void
  adaptiveMessage: string | null
  setAdaptiveMessage: (msg: string | null) => void
  showCopilot: boolean
  setShowCopilot: (v: boolean) => void

  // PSI modal
  showPsiModal: boolean
  setShowPsiModal: (v: boolean) => void
  psiResult: PsiResult | null
  setPsiResult: (result: PsiResult | null) => void
  psiLoading: boolean
  setPsiLoading: (v: boolean) => void

  // Deploy modal
  showDeployModal: boolean
  setShowDeployModal: (v: boolean) => void
  deploySteps: DeployStep[]
  setDeploySteps: (steps: DeployStep[]) => void
  updateDeployStep: (id: number, update: Partial<DeployStep>) => void
  deployResult: DeployResult | null
  setDeployResult: (result: DeployResult | null) => void
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
    set({ project, codeFiles, activeFilename: ROADMAP_TAB_ID })
  },

  activeFilename: ROADMAP_TAB_ID,
  setActiveFilename: (filename) => set({ activeFilename: filename }),

  codeFiles: {},
  setFileContent: (filename, content) =>
    set(state => ({ codeFiles: { ...state.codeFiles, [filename]: content } })),
  addFile: (filename, content = '') =>
    set(state => ({
      codeFiles: { ...state.codeFiles, [filename]: content },
      activeFilename: filename,
    })),
  removeFile: (filename) =>
    set(state => {
      const { [filename]: _, ...rest } = state.codeFiles
      const remaining = Object.keys(rest)
      const newActive = filename === state.activeFilename
        ? (remaining[remaining.length - 1] ?? ROADMAP_TAB_ID)
        : state.activeFilename
      const unsaved = new Set(state.unsavedFiles)
      unsaved.delete(filename)
      return { codeFiles: rest, activeFilename: newActive, unsavedFiles: unsaved }
    }),
  renameFileInStore: (oldFilename, newFilename) =>
    set(state => {
      const content = state.codeFiles[oldFilename] ?? ''
      const { [oldFilename]: _, ...rest } = state.codeFiles
      const unsaved = new Set(state.unsavedFiles)
      if (unsaved.has(oldFilename)) {
        unsaved.delete(oldFilename)
        unsaved.add(newFilename)
      }
      return {
        codeFiles: { ...rest, [newFilename]: content },
        activeFilename: state.activeFilename === oldFilename ? newFilename : state.activeFilename,
        unsavedFiles: unsaved,
      }
    }),

  unsavedFiles: new Set<string>(),
  markUnsaved: (filename) =>
    set(state => {
      const s = new Set(state.unsavedFiles)
      s.add(filename)
      return { unsavedFiles: s }
    }),
  markSaved: (filename) =>
    set(state => {
      const s = new Set(state.unsavedFiles)
      s.delete(filename)
      return { unsavedFiles: s }
    }),

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
  setLastMessageCodeBlocks: (blocks) =>
    set(state => {
      const messages = [...state.messages]
      if (messages.length === 0) return state
      const last = { ...messages[messages.length - 1], code_blocks: blocks }
      messages[messages.length - 1] = last
      return { messages }
    }),
  clearMessages: () => set({ messages: [] }),

  isStreaming: false,
  setIsStreaming: (v) => set({ isStreaming: v }),
  adaptiveMessage: null,
  setAdaptiveMessage: (msg) => set({ adaptiveMessage: msg }),
  showCopilot: false, // Default to false per plan
  setShowCopilot: (v) => set({ showCopilot: v }),

  showPsiModal: false,
  setShowPsiModal: (v) => set({ showPsiModal: v }),
  psiResult: null,
  setPsiResult: (result) => set({ psiResult: result }),
  psiLoading: false,
  setPsiLoading: (v) => set({ psiLoading: v }),

  showDeployModal: false,
  setShowDeployModal: (v) => set({ showDeployModal: v }),
  deploySteps: [],
  setDeploySteps: (steps) => set({ deploySteps: steps }),
  updateDeployStep: (id, update) =>
    set(state => ({
      deploySteps: state.deploySteps.map(s => s.id === id ? { ...s, ...update } : s)
    })),
  deployResult: null,
  setDeployResult: (result) => set({ deployResult: result }),
}))
