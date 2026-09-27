'use client'

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { WebContainer, FileSystemTree } from '@webcontainer/api'
import { ChevronDown, ChevronRight, Copy, File, Folder, FolderPlus, Play, Save, TerminalSquare, Trash2, X } from 'lucide-react'
import { createStudioFile, deleteStudioFile, duplicateStudioFile, fetchStudioFiles, recordStudioActivity, renameStudioFile, saveStudioFile } from '@/lib/api'
import type { StudioFileRecord } from '@/lib/types'

type OpenFile = StudioFileRecord & { dirty: boolean; savedContent: string }
type TreeNode = { name: string; path: string; type: 'file' | 'folder'; children: TreeNode[] }

function languageFor(path: string) {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'ts' || ext === 'tsx') return 'typescript'
  if (ext === 'js' || ext === 'jsx') return 'javascript'
  if (ext === 'py') return 'python'
  if (ext === 'json') return 'json'
  if (ext === 'css') return 'css'
  if (ext === 'html') return 'html'
  if (ext === 'md') return 'markdown'
  return 'plaintext'
}

function makeTree(files: StudioFileRecord[]): TreeNode {
  const root: TreeNode = { name: 'workspace', path: '', type: 'folder', children: [] }
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean)
    let current = root
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/')
      const isFile = index === parts.length - 1
      let node = current.children.find((child) => child.name === part && child.type === (isFile ? 'file' : 'folder'))
      if (!node) {
        node = { name: part, path, type: isFile ? 'file' : 'folder', children: [] }
        current.children.push(node)
        current.children.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1)
      }
      current = node
    })
  }
  return root
}

function toWebContainerTree(files: StudioFileRecord[]): FileSystemTree {
  const root: FileSystemTree = {}
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean)
    let current = root
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1
      if (isFile) {
        current[part] = { file: { contents: file.content } }
      } else {
        const existing = current[part]
        if (!existing || !('directory' in existing)) current[part] = { directory: {} }
        current = (current[part] as { directory: FileSystemTree }).directory
      }
    })
  }
  return root
}

export default function StudioIde({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const [files, setFiles] = useState<StudioFileRecord[]>([])
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activePath, setActivePath] = useState<string>('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [runtimeStatus, setRuntimeStatus] = useState('WebContainer idle')
  const [command, setCommand] = useState('npm install && npm run dev')
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const webContainerRef = useRef<WebContainer | null>(null)
  const terminalDivRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<import('@xterm/xterm').Terminal | null>(null)
  const bootingRef = useRef(false)

  const activeFile = openFiles.find((file) => file.path === activePath)
  const tree = useMemo(() => makeTree(files), [files])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const result = await fetchStudioFiles(projectId)
        if (cancelled) return
        setFiles(result.files)
        const first = result.files[0]
        if (first) {
          setOpenFiles([{ ...first, dirty: false, savedContent: first.content }])
          setActivePath(first.path)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  useEffect(() => {
    let disposed = false
    async function initTerminal() {
      if (!terminalDivRef.current || terminalRef.current) return
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])
      if (disposed || !terminalDivRef.current) return
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 12,
        fontFamily: 'Menlo, Monaco, Consolas, monospace',
        theme: { background: '#0f0f0f', foreground: '#d4d4d4', cursor: '#58a6ff' },
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(terminalDivRef.current)
      fit.fit()
      term.writeln(`Nirmaan WebContainer terminal · ${projectTitle}`)
      term.writeln('Files are mounted in-browser. Run npm install && npm run dev, node main.js, etc.')
      terminalRef.current = term
    }
    initTerminal()
    return () => { disposed = true; terminalRef.current?.dispose(); terminalRef.current = null }
  }, [projectTitle])

  async function openFile(file: StudioFileRecord) {
    setOpenFiles((current) => current.some((item) => item.path === file.path) ? current : [...current, { ...file, dirty: false, savedContent: file.content }])
    setActivePath(file.path)
  }

  function updateActiveFile(value: string = '') {
    if (!activePath) return
    setOpenFiles((current) => current.map((file) => file.path === activePath ? { ...file, content: value, dirty: value !== file.savedContent } : file))
  }

  async function saveFile(path = activePath) {
    const file = openFiles.find((item) => item.path === path)
    if (!file) return
    setSaving(true)
    try {
      const result = await saveStudioFile(projectId, file.path, file.content)
      setFiles((current) => current.map((item) => item.path === file.path ? result.file : item))
      setOpenFiles((current) => current.map((item) => item.path === file.path ? { ...result.file, dirty: false, savedContent: result.file.content } : item))
      await writeFileToWebContainer(file.path, file.content)
    } catch (error) {
      await emitError(`Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`, file.path)
      throw error
    } finally {
      setSaving(false)
    }
  }

  async function createFile(parentPath = '') {
    const value = window.prompt('New file path', parentPath ? `${parentPath}/index.js` : 'src/index.js')
    if (!value) return
    try {
      const result = await createStudioFile(projectId, value, '')
      setFiles((current) => [...current, result.file])
      openFile(result.file)
    } catch (error) {
      await emitError(`Create file failed: ${error instanceof Error ? error.message : 'Unknown error'}`, value)
      alert(error instanceof Error ? error.message : 'Could not create file')
    }
  }

  async function renameFile(path: string) {
    const next = window.prompt('Rename file', path)
    if (!next || next === path) return
    try {
      const result = await renameStudioFile(projectId, path, next)
      setFiles((current) => current.map((file) => file.path === path ? result.file : file))
      setOpenFiles((current) => current.map((file) => file.path === path ? { ...result.file, dirty: file.dirty, savedContent: result.file.content } : file))
      if (activePath === path) setActivePath(result.file.path)
    } catch (error) {
      await emitError(`Rename failed: ${error instanceof Error ? error.message : 'Unknown error'}`, path)
      alert(error instanceof Error ? error.message : 'Could not rename file')
    }
  }

  async function duplicateFile(path: string) {
    const base = path.replace(/(\.[^/.]+)?$/, '-copy$1')
    const next = window.prompt('Duplicate as', base)
    if (!next) return
    try {
      const result = await duplicateStudioFile(projectId, path, next)
      setFiles((current) => [...current, result.file])
      openFile(result.file)
    } catch (error) {
      await emitError(`Duplicate failed: ${error instanceof Error ? error.message : 'Unknown error'}`, path)
      alert(error instanceof Error ? error.message : 'Could not duplicate file')
    }
  }

  async function removeFile(path: string) {
    if (!window.confirm(`Delete ${path}?`)) return
    try {
      await deleteStudioFile(projectId, path)
      setFiles((current) => current.filter((file) => file.path !== path))
      setOpenFiles((current) => {
        const next = current.filter((file) => file.path !== path)
        if (activePath === path) setActivePath(next[0]?.path || '')
        return next
      })
    } catch (error) {
      await emitError(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`, path)
      alert(error instanceof Error ? error.message : 'Could not delete file')
    }
  }

  function closeTab(path: string) {
    const target = openFiles.find((file) => file.path === path)
    if (target?.dirty && !window.confirm(`${path} has unsaved changes. Close anyway?`)) return
    setOpenFiles((current) => {
      const next = current.filter((file) => file.path !== path)
      if (activePath === path) setActivePath(next[0]?.path || '')
      return next
    })
  }

  function reorderTabs(sourcePath: string, targetPath: string) {
    if (sourcePath === targetPath) return
    setOpenFiles((current) => {
      const sourceIndex = current.findIndex((file) => file.path === sourcePath)
      const targetIndex = current.findIndex((file) => file.path === targetPath)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const next = [...current]
      const [removed] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, removed)
      return next
    })
  }

  async function bootWebContainer() {
    if (webContainerRef.current) return webContainerRef.current
    if (bootingRef.current) return null
    bootingRef.current = true
    setRuntimeStatus('Booting WebContainer...')
    try {
      const { WebContainer } = await import('@webcontainer/api')
      const instance = await WebContainer.boot()
      instance.on('server-ready', (_port, url) => setServerUrl(url))
      webContainerRef.current = instance
      setRuntimeStatus('WebContainer ready')
      return instance
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WebContainer boot failed'
      setRuntimeStatus(message)
      await emitError(message)
      return null
    } finally {
      bootingRef.current = false
    }
  }

  async function mountFiles() {
    const unsaved = openFiles.filter((file) => file.dirty)
    for (const file of unsaved) await saveFile(file.path)
    const instance = await bootWebContainer()
    if (!instance) return null
    const latest = await fetchStudioFiles(projectId)
    setFiles(latest.files)
    await instance.mount(toWebContainerTree(latest.files))
    terminalRef.current?.writeln(`\r\nMounted ${latest.files.length} files into WebContainer.`)
    return instance
  }

  async function writeFileToWebContainer(path: string, content: string) {
    const instance = webContainerRef.current
    if (!instance) return
    const parent = path.split('/').slice(0, -1).join('/')
    if (parent) await instance.fs.mkdir(parent, { recursive: true })
    await instance.fs.writeFile(path, content)
  }

  async function runProject() {
    const term = terminalRef.current
    try {
      const instance = await mountFiles()
      if (!instance) return
      setRuntimeStatus(`Running: ${command}`)
      await recordStudioActivity({ project_id: projectId, event_type: 'run', message: command, metadata: { open_files: openFiles.length } })
      term?.writeln(`\r\n$ ${command}`)
      const process = await instance.spawn('jsh', ['-c', command])
      process.output.pipeTo(new WritableStream({ write(data) { term?.write(data) } }))
      const exitCode = await process.exit
      setRuntimeStatus(`Process exited with ${exitCode}`)
      term?.writeln(`\r\nProcess exited with ${exitCode}`)
      if (exitCode !== 0) await emitError(`Run exited with ${exitCode}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Run failed'
      setRuntimeStatus(message)
      terminalRef.current?.writeln(`\r\n${message}`)
      await emitError(message)
    }
  }

  async function emitError(message: string, path?: string) {
    await recordStudioActivity({ project_id: projectId, event_type: 'error', path, message }).catch(() => null)
  }

  if (loading) return <div style={centerStyle}>Loading Studio files...</div>

  return (
    <div style={ideStyle}>
      <aside style={explorerStyle}>
        <div style={explorerHeaderStyle}>
          <span>Explorer</span>
          <button onClick={() => createFile()} style={iconButtonStyle} title="New file"><FolderPlus size={14} /></button>
        </div>
        <TreeView node={tree} expanded={expanded} setExpanded={setExpanded} files={files} activePath={activePath} onOpen={openFile} onCreate={createFile} onRename={renameFile} onDuplicate={duplicateFile} onDelete={removeFile} />
      </aside>

      <section style={editorShellStyle}>
        <div style={tabBarStyle}>
          {openFiles.map((file) => (
            <div
              key={file.path}
              draggable
              onDragStart={(event) => event.dataTransfer.setData('text/plain', file.path)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => reorderTabs(event.dataTransfer.getData('text/plain'), file.path)}
              onClick={() => setActivePath(file.path)}
              style={{ ...tabStyle, ...(file.path === activePath ? activeTabStyle : {}) }}
            >
              <span>{file.dirty ? '● ' : ''}{file.path.split('/').pop()}</span>
              <button onClick={(event) => { event.stopPropagation(); closeTab(file.path) }} style={tabCloseStyle}><X size={12} /></button>
            </div>
          ))}
        </div>
        <div style={editorAreaStyle}>
          {activeFile ? (
            <Editor
              path={activeFile.path}
              value={activeFile.content}
              language={languageFor(activeFile.path)}
              theme="vs-dark"
              onChange={(value) => updateActiveFile(value || '')}
              options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: 'Menlo, Monaco, Consolas, monospace', automaticLayout: true, tabSize: 2 }}
            />
          ) : <div style={centerStyle}>Open a file from Explorer</div>}
        </div>
      </section>

      <section style={terminalPanelStyle}>
        <div style={terminalHeaderStyle}>
          <span><TerminalSquare size={14} /> Terminal</span>
          <span>{runtimeStatus}</span>
        </div>
        <div style={terminalControlsStyle}>
          <input value={command} onChange={(event) => setCommand(event.target.value)} style={commandInputStyle} />
          <button onClick={() => saveFile()} disabled={!activeFile || saving} style={smallButtonStyle}><Save size={13} /> {saving ? 'Saving' : 'Save'}</button>
          <button onClick={runProject} style={runButtonStyle}><Play size={13} /> Run</button>
          {serverUrl && <a href={serverUrl} target="_blank" rel="noreferrer" style={previewLinkStyle}>Preview</a>}
        </div>
        <div ref={terminalDivRef} style={terminalBodyStyle} />
      </section>
    </div>
  )
}

function TreeView({ node, expanded, setExpanded, files, activePath, onOpen, onCreate, onRename, onDuplicate, onDelete }: {
  node: TreeNode
  expanded: Set<string>
  setExpanded: (next: Set<string>) => void
  files: StudioFileRecord[]
  activePath: string
  onOpen: (file: StudioFileRecord) => void
  onCreate: (parentPath: string) => void
  onRename: (path: string) => void
  onDuplicate: (path: string) => void
  onDelete: (path: string) => void
}) {
  return <div>{node.children.map((child) => <TreeNodeRow key={`${child.type}-${child.path}`} node={child} depth={0} {...{ expanded, setExpanded, files, activePath, onOpen, onCreate, onRename, onDuplicate, onDelete }} />)}</div>
}

function TreeNodeRow(props: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  setExpanded: (next: Set<string>) => void
  files: StudioFileRecord[]
  activePath: string
  onOpen: (file: StudioFileRecord) => void
  onCreate: (parentPath: string) => void
  onRename: (path: string) => void
  onDuplicate: (path: string) => void
  onDelete: (path: string) => void
}) {
  const { node, depth, expanded, setExpanded, files, activePath, onOpen, onCreate, onRename, onDuplicate, onDelete } = props
  const isOpen = expanded.has(node.path)
  if (node.type === 'folder') {
    return (
      <div>
        <div style={{ ...treeRowStyle, paddingLeft: 8 + depth * 12 }} onClick={() => { const next = new Set(expanded); if (isOpen) next.delete(node.path); else next.add(node.path); setExpanded(next) }}>
          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} <Folder size={13} /> <span>{node.name}</span>
          <button onClick={(event) => { event.stopPropagation(); onCreate(node.path) }} style={treeActionStyle}>+</button>
        </div>
        {isOpen && node.children.map((child) => <TreeNodeRow key={`${child.type}-${child.path}`} {...props} node={child} depth={depth + 1} />)}
      </div>
    )
  }
  const file = files.find((item) => item.path === node.path)
  return (
    <div style={{ ...treeRowStyle, ...(activePath === node.path ? activeTreeRowStyle : {}), paddingLeft: 22 + depth * 12 }} onClick={() => file && onOpen(file)}>
      <File size={13} /> <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
      <button onClick={(event) => { event.stopPropagation(); onDuplicate(node.path) }} style={treeActionStyle}><Copy size={12} /></button>
      <button onClick={(event) => { event.stopPropagation(); onRename(node.path) }} style={treeActionStyle}>✎</button>
      <button onClick={(event) => { event.stopPropagation(); onDelete(node.path) }} style={treeActionStyle}><Trash2 size={12} /></button>
    </div>
  )
}

const ideStyle: CSSProperties = { height: '100%', display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', gridTemplateRows: 'minmax(0, 1fr) 220px', minHeight: 0, background: '#1e1e1e' }
const explorerStyle: CSSProperties = { gridRow: '1 / span 2', background: '#181818', borderRight: '1px solid #2b2b2b', overflow: 'auto' }
const explorerHeaderStyle: CSSProperties = { height: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px', color: '#e6edf3', fontSize: 11, fontWeight: 900, letterSpacing: 1.1, textTransform: 'uppercase', borderBottom: '1px solid #2b2b2b' }
const editorShellStyle: CSSProperties = { minWidth: 0, minHeight: 0, display: 'grid', gridTemplateRows: '36px minmax(0, 1fr)' }
const tabBarStyle: CSSProperties = { display: 'flex', alignItems: 'stretch', background: '#252526', borderBottom: '1px solid #2b2b2b', overflowX: 'auto' }
const tabStyle: CSSProperties = { height: 36, minWidth: 120, maxWidth: 210, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', padding: '0 8px 0 12px', color: '#a6a6a6', background: '#2d2d2d', borderRight: '1px solid #1f1f1f', cursor: 'pointer', fontSize: 12 }
const activeTabStyle: CSSProperties = { background: '#1e1e1e', color: '#fff' }
const tabCloseStyle: CSSProperties = { border: 'none', background: 'transparent', color: 'inherit', display: 'grid', placeItems: 'center', cursor: 'pointer' }
const editorAreaStyle: CSSProperties = { minHeight: 0 }
const terminalPanelStyle: CSSProperties = { minHeight: 0, borderTop: '1px solid #2b2b2b', background: '#0f0f0f', display: 'grid', gridTemplateRows: '30px 38px minmax(0, 1fr)' }
const terminalHeaderStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px', color: '#c9d1d9', fontSize: 12, borderBottom: '1px solid #242424' }
const terminalControlsStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid #242424' }
const commandInputStyle: CSSProperties = { flex: 1, background: '#181818', border: '1px solid #333', color: '#d4d4d4', borderRadius: 6, padding: '7px 9px', fontSize: 12, outline: 'none' }
const smallButtonStyle: CSSProperties = { height: 28, border: '1px solid #444', background: '#1f1f1f', color: '#d4d4d4', borderRadius: 6, display: 'inline-flex', gap: 5, alignItems: 'center', padding: '0 10px', cursor: 'pointer' }
const runButtonStyle: CSSProperties = { ...smallButtonStyle, background: '#238636', borderColor: '#238636', color: '#fff' }
const previewLinkStyle: CSSProperties = { ...smallButtonStyle, textDecoration: 'none' }
const terminalBodyStyle: CSSProperties = { minHeight: 0, padding: 8, overflow: 'hidden' }
const treeRowStyle: CSSProperties = { height: 28, display: 'flex', alignItems: 'center', gap: 6, color: '#c9d1d9', fontSize: 12, cursor: 'pointer', userSelect: 'none' }
const activeTreeRowStyle: CSSProperties = { background: '#04395e', color: '#fff' }
const treeActionStyle: CSSProperties = { marginLeft: 'auto', border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer', display: 'grid', placeItems: 'center' }
const iconButtonStyle: CSSProperties = { border: '1px solid #444', background: '#1f1f1f', color: '#d4d4d4', borderRadius: 5, height: 24, width: 26, display: 'grid', placeItems: 'center', cursor: 'pointer' }
const centerStyle: CSSProperties = { height: '100%', display: 'grid', placeItems: 'center', color: '#8b949e', background: '#1e1e1e' }
