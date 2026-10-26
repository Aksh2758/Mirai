"use client"

import Editor from "@monaco-editor/react"
import { Cpu, Play, X, Zap, FileCode2 } from "lucide-react"
import { useLabStore } from "./store"
import { motion } from "framer-motion"
import { useRef, useState } from "react"

export interface EditorTab {
  path: string
  name: string
}

interface CodeEditorPanelProps {
  code: string;
  language: string;
  // Set while no file is open: the editor acts as a scratchpad with its own language picker
  scratch?: { languages: { id: string; name: string }[]; onLanguageChange: (id: string) => void };
  tabs: EditorTab[];
  activePath: string | null;
  canRun: boolean;
  onChange: (value: string | undefined) => void;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onRun: () => void;
  onSave: () => void;
  status: string | null;
}

export default function CodeEditorPanel({ code, language, scratch, tabs, activePath, canRun, onChange, onSelectTab, onCloseTab, onRun, onSave, status }: CodeEditorPanelProps) {
  const saveRef = useRef(onSave)
  saveRef.current = onSave
  const { personality, struggleScore, logKeyPress, logDelete, setLastAction } = useLabStore()
  const [currentLine, setCurrentLine] = useState(1)

  const handleEditorChange = (value: string | undefined) => {
    setLastAction(currentLine, Date.now())
    if (value) {
      if (value.length < code.length) logDelete()
      else logKeyPress(Date.now())
    }
    onChange(value)
  }

  const handleEditorDidMount = (editor: any, monaco: any) => {
    // Ctrl/Cmd+S saves to disk (for projects opened from a real folder)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current())
    editor.onDidChangeCursorPosition((e: any) => {
      const newLine = e.position.lineNumber
      setCurrentLine(newLine)
      setLastAction(newLine, Date.now())
    })
  }

  const beforeMount = (monaco: any) => {
    monaco.editor.defineTheme('neural-catalyst', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '637777', fontStyle: 'italic' },
        { token: 'keyword', foreground: '06b6d4' },
        { token: 'operator', foreground: 'd946ef' },
        { token: 'string', foreground: 'eab308' },
        { token: 'function', foreground: '3b82f6' },
        { token: 'number', foreground: 'f43f5e' },
        { token: 'tag', foreground: '10b981' },
      ],
      colors: {
        'editor.background': '#020308',
        'editor.foreground': '#e2e8f0',
        'editor.lineHighlightBackground': '#080a12',
        'editorCursor.foreground': '#06b6d4',
        'editorLineNumber.foreground': '#334155',
        'editor.selectionBackground': 'rgba(6, 182, 212, 0.2)',
        'editorIndentGuide.background': 'rgba(255, 255, 255, 0.05)',
      }
    });
  }

  return (
    <div className="flex flex-col h-full bg-[#020308] relative overflow-hidden w-full min-w-0">
      {/* Tab bar + toolbar */}
      <div className="h-11 flex items-stretch justify-between border-b border-white/5 bg-[#020308]/60 flex-shrink-0 z-30">
        <div className="flex items-stretch overflow-x-auto scrollbar-hide min-w-0">
          {scratch && (
            <div className="flex items-center gap-3 px-4 text-[12px] text-white border-t-2 border-t-cyan-400">
              <span>Scratchpad</span>
              <select
                value={language}
                onChange={(e) => scratch.onLanguageChange(e.target.value)}
                aria-label="Scratchpad language"
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] font-black uppercase tracking-widest cursor-pointer outline-none"
              >
                {scratch.languages.map(l => <option key={l.id} value={l.id} className="bg-[#0b2942]">{l.name}</option>)}
              </select>
            </div>
          )}
          {tabs.map(tab => (
            <div
              key={tab.path}
              onClick={() => onSelectTab(tab.path)}
              className={`group flex items-center gap-2 pl-4 pr-2 text-[12px] cursor-pointer border-r border-white/5 whitespace-nowrap ${
                tab.path === activePath ? "bg-[#020308] text-white border-t-2 border-t-cyan-400" : "text-slate-500 hover:text-slate-300 border-t-2 border-t-transparent"
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5 shrink-0" />
              <span>{tab.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onCloseTab(tab.path) }}
                aria-label={`Close ${tab.name}`}
                className="p-1 rounded hover:bg-white/10 opacity-60 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 px-4 flex-shrink-0">
          {struggleScore > 70 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full">
              <Zap className="h-3 w-3 text-rose-500 fill-rose-500 animate-pulse" />
              <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Cognitive Peak</span>
            </div>
          )}
          <div className="hidden xl:flex items-center gap-2 text-[9px] text-slate-500 font-black tracking-[0.2em] uppercase">
            <Cpu className="h-3.5 w-3.5 text-magenta-400/60" />
            <span className="text-magenta-400">{personality}</span>
          </div>
          {status && <span className="text-[10px] text-emerald-400 whitespace-nowrap">{status}</span>}
          <div className="text-[9px] font-mono text-slate-500">
            Ln <span className="text-white">{currentLine}</span>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onRun}
            disabled={!canRun}
            title={canRun ? "Run the open file" : "This file type can't be run"}
            className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500 text-black rounded-lg text-[10px] font-black uppercase tracking-[0.2em] hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="h-3.5 w-3.5 fill-black" />
            Run
          </motion.button>
        </div>
      </div>

      <div className="flex-1 w-full relative z-20 min-h-0">
        {
          <Editor
            height="100%"
            language={language}
            path={activePath ?? `scratch.${language}`}
            value={code}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
            theme="neural-catalyst"
            beforeMount={beforeMount}
            loading={<div className="h-full w-full flex items-center justify-center text-slate-500 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Synchronizing Neural Logic...</div>}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              roundedSelection: true,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 16 },
              fontFamily: "'JetBrains Mono', monospace",
              renderLineHighlight: 'all',
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              cursorStyle: 'line',
              scrollbar: {
                vertical: 'visible',
                horizontal: 'visible',
                useShadows: false,
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
              }
            }}
          />
        }
      </div>
    </div>
  )
}
