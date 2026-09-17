'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { useStudioStore, ROADMAP_TAB_ID } from '@/store/studioStore'
import { saveCode, createFile, deleteFile, renameFile } from '@/lib/api'
import { getFileIcon, getLanguage } from '@/lib/fileIcons'
import RoadmapTab from './RoadmapTab'
import type { Project } from '@/lib/types'

// ─── Cursor position state ────────────────────────────────────────────────────
interface CursorPos { line: number; col: number }

interface Props {
  projectId: string
  project: Project
  adaptiveMessage: string | null
  onCompleteStep: () => void
  completingStep: boolean
}

export default function CodeEditor({ projectId, project, adaptiveMessage, onCompleteStep, completingStep }: Props) {
  const {
    activeFilename, setActiveFilename,
    codeFiles, setFileContent,
    addFile, removeFile, renameFileInStore,
    unsavedFiles, markUnsaved, markSaved,
    setShowCopilot, showCopilot,
  } = useStudioStore()

  const editorRef       = useRef<any>(null)
  const monacoRef       = useRef<any>(null)
  const saveTimerRef    = useRef<NodeJS.Timeout | null>(null)
  const [cursorPos, setCursorPos]         = useState<CursorPos>({ line: 1, col: 1 })
  const [saveStatus, setSaveStatus]       = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [newFileMode, setNewFileMode]     = useState(false)
  const [newFileName, setNewFileName]     = useState('')
  const [newFileError, setNewFileError]   = useState('')
  const [renameMode, setRenameMode]       = useState<string | null>(null)  // filename being renamed
  const [renameValue, setRenameValue]     = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // All filenames — from codeFiles store (always up to date)
  const filenames = Object.keys(codeFiles)
  const currentContent = codeFiles[activeFilename] ?? ''

  // ── Monaco mount ─────────────────────────────────────────────────────────
  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Expose globally for CopilotPane Apply Fix
    ;(window as any).__nirmaanEditor     = editor
    ;(window as any).__nirmaanActiveFile = activeFilename

    // Cursor position tracking
    editor.onDidChangeCursorPosition((e: any) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column })
    })

    // Ctrl+S / Cmd+S → immediate save
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => {
        const content = editor.getValue()
        const filename = (window as any).__nirmaanActiveFile
        if (!filename) return
        setSaveStatus('saving')
        saveCode(projectId, filename, content)
          .then(() => { markSaved(filename); setSaveStatus('saved') })
          .catch(() => setSaveStatus('unsaved'))
      }
    )

    // Configure Monaco theme extras
    monaco.editor.defineTheme('nirmaan-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',    foreground: '4B5563', fontStyle: 'italic' },
        { token: 'keyword',    foreground: 'C084FC' },
        { token: 'string',     foreground: '86EFAC' },
        { token: 'number',     foreground: 'FCA5A5' },
        { token: 'function',   foreground: '60A5FA' },
        { token: 'type',       foreground: 'FBBF24' },
        { token: 'variable',   foreground: 'E5E7EB' },
      ],
      colors: {
        'editor.background':           '#0f0f0f',
        'editor.foreground':           '#E5E7EB',
        'editorLineNumber.foreground': '#374151',
        'editorLineNumber.activeForeground': '#6B7280',
        'editor.lineHighlightBackground': '#161616',
        'editor.selectionBackground':  '#1A4060',
        'editorCursor.foreground':     '#4ADE80',
        'editor.findMatchBackground':  '#3B1F00',
        'editorGutter.background':     '#0f0f0f',
        'editorWidget.background':     '#161616',
        'editorWidget.border':         '#2D2D2D',
        'editorSuggestWidget.background': '#141414',
        'editorSuggestWidget.border':  '#2D2D2D',
        'editorSuggestWidget.selectedBackground': '#1A3A2A',
        'input.background':            '#1a1a1a',
        'focusBorder':                 '#4ADE80',
        'scrollbarSlider.background':  '#2D2D2D',
        'scrollbarSlider.hoverBackground': '#3D3D3D',
        'scrollbarSlider.activeBackground': '#4D4D4D',
      }
    })
    monaco.editor.setTheme('nirmaan-dark')

    // Focus
    editor.focus()
  }, [projectId, activeFilename, markSaved])

  // ── File switch helper exposed globally for CopilotPane ─────────────────
  const switchToFile = useCallback((filename: string) => {
    if (codeFiles[filename] !== undefined) {
      setActiveFilename(filename)
      ;(window as any).__nirmaanActiveFile = filename
    }
  }, [codeFiles, setActiveFilename])

  useEffect(() => {
    ;(window as any).__nirmaanSwitchFile = switchToFile
    ;(window as any).__nirmaanActiveFile = activeFilename
  }, [switchToFile, activeFilename])

  // ── Content change → store + debounced autosave ─────────────────────────
  const handleChange = useCallback((value: string | undefined) => {
    if (value === undefined) return
    setFileContent(activeFilename, value)
    markUnsaved(activeFilename)
    setSaveStatus('unsaved')

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await saveCode(projectId, activeFilename, value)
        markSaved(activeFilename)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('unsaved')
      }
    }, 1500)
  }, [activeFilename, projectId, setFileContent, markUnsaved, markSaved])

  // ── Reset save indicator when switching files ────────────────────────────
  useEffect(() => {
    setSaveStatus(unsavedFiles.has(activeFilename) ? 'unsaved' : 'saved')
  }, [activeFilename, unsavedFiles])

  // ── Create new file ─────────────────────────────────────────────────────
  async function handleCreateFile() {
    const name = newFileName.trim()
    if (!name) { setNewFileError('Enter a filename'); return }
    if (!/^[\w.\-/]+$/.test(name)) { setNewFileError('Invalid characters in filename'); return }
    if (codeFiles[name] !== undefined) { setNewFileError('File already exists'); return }

    try {
      await createFile(projectId, name, '')
      addFile(name, '')
      setNewFileMode(false)
      setNewFileName('')
      setNewFileError('')
    } catch (e: any) {
      setNewFileError(e.message)
    }
  }

  // ── Delete file ─────────────────────────────────────────────────────────
  async function handleDeleteFile(filename: string) {
    if (filenames.length <= 1) return  // Guard
    try {
      await deleteFile(projectId, filename)
      removeFile(filename)
      setConfirmDelete(null)
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`)
    }
  }

  // ── Rename file ─────────────────────────────────────────────────────────
  async function handleRenameFile() {
    if (!renameMode) return
    const newName = renameValue.trim()
    if (!newName || newName === renameMode) { setRenameMode(null); return }
    if (codeFiles[newName] !== undefined) { alert('File already exists'); return }
    try {
      await renameFile(projectId, renameMode, newName)
      renameFileInStore(renameMode, newName)
      setRenameMode(null)
    } catch (e: any) {
      alert(`Rename failed: ${e.message}`)
    }
  }

  // ── Tab keyboard handling ────────────────────────────────────────────────
  function handleTabKeyDown(e: React.KeyboardEvent, filename: string) {
    if (e.key === 'F2') {
      e.preventDefault()
      setRenameMode(filename)
      setRenameValue(filename)
    }
  }

  const saveIndicator = {
    saved:   { text: '●', color: '#4ADE80', title: 'All changes saved' },
    saving:  { text: '◌', color: '#FBBF24', title: 'Saving...' },
    unsaved: { text: '●', color: '#F87171', title: 'Unsaved changes (Ctrl+S to save)' },
  }[saveStatus]

  const lang = getLanguage(activeFilename)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#0f0f0f' }}>

      {/* ── Tab Bar ───────────────────────────────────────────────────────── */}
      <div style={{
        background: '#141414',
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        overflowX: 'auto',
        flexShrink: 0,
        scrollbarWidth: 'none',
        minHeight: 38,
      }}>
        {/* ── Pinned Roadmap tab — always first, can never be closed ── */}
        <div
          onClick={() => setActiveFilename(ROADMAP_TAB_ID)}
          role="tab"
          aria-selected={activeFilename === ROADMAP_TAB_ID}
          title="Project roadmap & instructions (pinned)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 14px 0 12px',
            cursor: 'pointer',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            borderBottom: activeFilename === ROADMAP_TAB_ID ? '2px solid #4ADE80' : '2px solid transparent',
            background: activeFilename === ROADMAP_TAB_ID ? '#0f0f0f' : 'transparent',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11 }}>📋</span>
          <span style={{
            fontSize: 11,
            fontFamily: 'monospace',
            color: activeFilename === ROADMAP_TAB_ID ? '#fff' : 'rgba(255,255,255,0.4)',
            fontWeight: activeFilename === ROADMAP_TAB_ID ? 600 : 500,
          }}>
            Roadmap
          </span>
          {/* Pin icon instead of a close button — signals this tab can't be closed */}
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }} title="Pinned">📌</span>
        </div>

        {filenames.map(name => {
          const isActive  = name === activeFilename
          const isUnsaved = unsavedFiles.has(name)
          const { icon, color } = getFileIcon(name)

          return (
            <div
              key={name}
              onClick={() => setActiveFilename(name)}
              onKeyDown={(e) => handleTabKeyDown(e, name)}
              tabIndex={0}
              role="tab"
              aria-selected={isActive}
              title={`${name}${isUnsaved ? ' — unsaved changes' : ''} (F2 to rename)`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 14px 0 12px',
                cursor: 'pointer',
                borderRight: '1px solid rgba(255,255,255,0.04)',
                borderBottom: isActive ? '2px solid #4ADE80' : '2px solid transparent',
                background: isActive ? '#0f0f0f' : 'transparent',
                minWidth: 0,
                userSelect: 'none',
                outline: 'none',
                transition: 'background 0.15s',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              {/* File type icon */}
              <span style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>

              {/* Filename or rename input */}
              {renameMode === name ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={handleRenameFile}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRenameFile()
                    if (e.key === 'Escape') setRenameMode(null)
                    e.stopPropagation()
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: '#1a2a1a',
                    border: '1px solid #4ADE80',
                    borderRadius: 4,
                    color: '#fff',
                    fontSize: 11,
                    padding: '1px 6px',
                    outline: 'none',
                    fontFamily: 'monospace',
                    width: Math.max(80, renameValue.length * 7),
                  }}
                />
              ) : (
                <span style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.35)',
                  fontWeight: isActive ? 600 : 400,
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {name}
                </span>
              )}

              {/* Unsaved dot */}
              {isUnsaved && renameMode !== name && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F87171', flexShrink: 0 }} title="Unsaved" />
              )}

              {/* Close button — only shown on hover via CSS, always visible on active */}
              {filenames.length > 1 && renameMode !== name && (
                <button
                  onClick={e => {
                    e.stopPropagation()
                    if (isUnsaved) {
                      setConfirmDelete(name)
                    } else {
                      handleDeleteFile(name)
                    }
                  }}
                  title="Close file"
                  className="tab-close-btn"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.2)',
                    cursor: 'pointer',
                    fontSize: 14,
                    lineHeight: 1,
                    padding: '0 0 0 2px',
                    display: isActive ? 'flex' : 'none',
                    alignItems: 'center',
                    flexShrink: 0,
                    borderRadius: 3,
                    transition: 'color 0.1s',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}

        {/* ── New File button ── */}
        {newFileMode ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
            <input
              autoFocus
              value={newFileName}
              onChange={e => { setNewFileName(e.target.value); setNewFileError('') }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateFile()
                if (e.key === 'Escape') { setNewFileMode(false); setNewFileName(''); setNewFileError('') }
              }}
              placeholder="filename.py"
              style={{
                background: '#1a2a1a',
                border: `1px solid ${newFileError ? '#F87171' : '#4ADE80'}`,
                borderRadius: 5,
                color: '#fff',
                fontSize: 11,
                padding: '3px 8px',
                outline: 'none',
                fontFamily: 'monospace',
                width: 120,
              }}
            />
            <button onClick={handleCreateFile} style={{ background: '#4ADE80', color: '#0D0D0D', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Create
            </button>
            <button onClick={() => { setNewFileMode(false); setNewFileName(''); setNewFileError('') }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14 }}>
              ×
            </button>
            {newFileError && (
              <span style={{ fontSize: 10, color: '#F87171' }}>{newFileError}</span>
            )}
          </div>
        ) : (
          <button
            onClick={() => setNewFileMode(true)}
            title="New file"
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.2)',
              cursor: 'pointer',
              fontSize: 16,
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s',
              flexShrink: 0,
            }}
            onMouseOver={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
          >
            +
          </button>
        )}

        {/* ── Copilot toggle button (right side) ── */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingRight: 12, flexShrink: 0, gap: 8 }}>
          {/* PSI hint — click to run PSI */}
          <button
            onClick={() => useStudioStore.getState().setShowPsiModal(true)}
            title="Run PSI analysis on your code"
            style={{
              background: 'rgba(255,87,51,0.1)',
              color: '#FF5733',
              border: '1px solid rgba(255,87,51,0.2)',
              borderRadius: 6,
              padding: '4px 9px',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}
          >
            ⚡ PSI
          </button>
          <button
            onClick={() => setShowCopilot(!showCopilot)}
            title="Toggle Copilot (AI assistant)"
            style={{
              background: showCopilot ? 'rgba(74,222,128,0.1)' : 'none',
              color: showCopilot ? '#4ADE80' : 'rgba(255,255,255,0.3)',
              border: `1px solid ${showCopilot ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 6,
              padding: '4px 9px',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: 0.5,
              transition: 'all 0.15s',
            }}
          >
            ✦ Copilot
          </button>
        </div>
      </div>

      {/* ── Roadmap tab OR Monaco Editor ────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {activeFilename === ROADMAP_TAB_ID ? (
          <RoadmapTab
            project={project}
            adaptiveMessage={adaptiveMessage}
            onComplete={onCompleteStep}
            completing={completingStep}
          />
        ) : (
        <Editor
          key={activeFilename}         // Force remount on file switch for correct model
          height="100%"
          language={lang}
          value={currentContent}
          onChange={handleChange}
          onMount={handleEditorMount}
          theme="nirmaan-dark"
          options={{
            fontSize: 13.5,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            lineNumbers: 'on',
            lineNumbersMinChars: 3,
            renderLineHighlight: 'gutter',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 16, bottom: 16 },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            cursorStyle: 'line',
            cursorWidth: 2,
            tabSize: 2,
            insertSpaces: true,
            detectIndentation: true,
            trimAutoWhitespace: true,
            autoIndent: 'full',
            formatOnPaste: true,
            formatOnType: false,
            snippetSuggestions: 'top',
            suggest: { showKeywords: true, showSnippets: true },
            quickSuggestions: { other: true, comments: false, strings: false },
            parameterHints: { enabled: true },
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
            },
            renderWhitespace: 'none',
            scrollbar: {
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
              arrowSize: 0,
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            folding: true,
            foldingHighlight: false,
            showFoldingControls: 'mouseover',
            contextmenu: true,
            mouseWheelZoom: true,
            accessibilitySupport: 'off',
            // Wrapping indent for readability
            wrappingIndent: 'indent',
          }}
        />
        )}
      </div>

      {/* ── Status Bar ──────────────────────────────────────────────────── */}
      <div style={{
        background: '#0a0a0a',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: '3px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexShrink: 0,
        fontSize: 10,
        color: 'rgba(255,255,255,0.25)',
        letterSpacing: 0.3,
        fontFamily: 'monospace',
      }}>
        {activeFilename === ROADMAP_TAB_ID ? (
          <>
            <span>📋 Roadmap</span>
            <span style={{ color: 'rgba(255,255,255,0.08)' }}>|</span>
            <span>Step {project.current_step + 1} of {project.steps.length}</span>
            <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.12)' }}>
              {filenames.length} file{filenames.length !== 1 ? 's' : ''} in project
            </span>
          </>
        ) : (
          <>
            {/* Save status */}
            <span title={saveIndicator.title} style={{ color: saveIndicator.color, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 8 }}>{saveIndicator.text}</span>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>
                {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
              </span>
            </span>

            <span style={{ color: 'rgba(255,255,255,0.08)' }}>|</span>

            {/* Language */}
            <span style={{ textTransform: 'capitalize' }}>
              {lang === 'plaintext' ? 'Text' : lang}
            </span>

            <span style={{ color: 'rgba(255,255,255,0.08)' }}>|</span>

            {/* Cursor position */}
            <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>

            <span style={{ color: 'rgba(255,255,255,0.08)' }}>|</span>

            {/* File count */}
            <span>{filenames.length} file{filenames.length !== 1 ? 's' : ''}</span>

            {/* Keyboard shortcut hint */}
            <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.12)' }}>
              Ctrl+S to save  ·  F2 to rename  ·  Ctrl+scroll to zoom
            </span>
          </>
        )}
      </div>

      {/* ── Confirm Delete Modal ────────────────────────────────────────── */}
      {confirmDelete && (
        <div
          style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12, padding: '24px 28px', maxWidth: 340,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
              Delete {confirmDelete}?
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 20, lineHeight: 1.6 }}>
              This file has unsaved changes. Deleting will permanently remove it from your project.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteFile(confirmDelete)}
                style={{ flex: 1, background: '#EF4444', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* Show close button on tab hover */
        div[role="tab"]:hover .tab-close-btn {
          display: flex !important;
        }
        /* Tab bar scrollbar */
        div::-webkit-scrollbar { height: 3px; background: transparent; }
        div::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
    </div>
  )
}
