'use client'
import { useRef, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { useStudioStore } from '@/store/studioStore'
import { saveCode } from '@/lib/api'

interface Props {
  projectId: string
}

export default function CodeEditor({ projectId }: Props) {
  const { activeFilename, codeFiles, setFileContent, project, setShowCopilot, setActiveFilename } = useStudioStore()
  const editorRef = useRef<any>(null)
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Get all filenames for tabs
  const filenames = project?.code_files.map(f => f.filename) ?? Object.keys(codeFiles)
  const currentContent = codeFiles[activeFilename] ?? ''

  function handleEditorMount(editor: any) {
    editorRef.current = editor
    // Expose editor globally so CopilotPane can call applyFix
    ;(window as any).__nirmaanEditor = editor
  }

  const handleChange = useCallback((value: string | undefined) => {
    if (value === undefined) return
    setFileContent(activeFilename, value)

    // Debounced autosave — 2 seconds after last keystroke
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveCode(projectId, activeFilename, value).catch(console.error)
    }, 2000)
  }, [activeFilename, projectId, setFileContent])

  // Detect language from filename
  function getLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = {
      py: 'python', ts: 'typescript', tsx: 'typescript', js: 'javascript',
      jsx: 'javascript', json: 'json', md: 'markdown', css: 'css',
      html: 'html', yaml: 'yaml', yml: 'yaml', sh: 'shell',
    }
    return map[ext ?? ''] ?? 'plaintext'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#1E1E1E' }}>
      {/* File tabs */}
      <div style={{ background: '#252525', display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto', flexShrink: 0 }}>
        {filenames.map(name => (
          <button
            key={name}
            onClick={() => setActiveFilename(name)}
            style={{
              padding: '10px 18px', fontSize: 11, border: 'none', cursor: 'pointer',
              borderRight: '1px solid rgba(255,255,255,0.06)',
              fontFamily: 'monospace',
              background: name === activeFilename ? '#1E1E1E' : 'transparent',
              color: name === activeFilename ? '#4ADE80' : 'rgba(255,255,255,0.3)',
              transition: 'all 0.2s',
            }}
          >
            {name}
          </button>
        ))}
        {/* Open Copilot button */}
        <button
          onClick={() => setShowCopilot(true)}
          style={{ marginLeft: 'auto', padding: '0 16px', fontSize: 11, border: 'none', cursor: 'pointer', background: 'transparent', color: '#4ADE80', fontWeight: 600 }}
        >
          ✦ Copilot
        </button>
      </div>

      {/* Monaco Editor */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Editor
          height="100%"
          language={getLanguage(activeFilename)}
          value={currentContent}
          onChange={handleChange}
          onMount={handleEditorMount}
          theme="vs-dark"
          options={{
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            minimap: { enabled: false },
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 20 },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
          }}
        />
      </div>
    </div>
  )
}
