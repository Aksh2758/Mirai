'use client'

import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { OnMount } from '@monaco-editor/react'
import type { WebContainer, FileSystemTree, WebContainerProcess } from '@webcontainer/api'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { PythonRuntime } from './pythonRuntime'
import { AlertCircle, ChevronDown, ChevronRight, File as FileIcon, FilePlus, Files, Folder, FolderOpen, FolderPlus, Play, Plus, RefreshCw, Save, TerminalSquare, Trash2, X } from 'lucide-react'
import { createStudioFile, deleteStudioFile, duplicateStudioFile, fetchStudioFiles, recordStudioActivity, renameStudioFile, saveStudioFile } from '@/lib/api'
import type { StudioFileRecord } from '@/lib/types'

/* ───────────────────────── types & helpers ───────────────────────── */

type OpenFile = StudioFileRecord & { dirty: boolean; savedContent: string }
type TreeNode = { name: string; path: string; type: 'file' | 'folder'; children: TreeNode[] }
type Editing = { kind: 'new-file' | 'new-folder'; parent: string } | { kind: 'rename'; path: string } | null
type Menu = { x: number; y: number; node: TreeNode } | null

const FOLDER_PLACEHOLDER = '.gitkeep' // empty folders are stored as <folder>/.gitkeep and hidden in the tree

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

const LANGUAGE_LABEL: Record<string, string> = {
  typescript: 'TypeScript', javascript: 'JavaScript', python: 'Python', json: 'JSON',
  css: 'CSS', html: 'HTML', markdown: 'Markdown', plaintext: 'Plain Text',
}

function badgeFor(name: string): { label: string; color: string } | null {
  const lower = name.toLowerCase()
  if (lower === 'package.json') return { label: 'N', color: '#8bc34a' }
  const ext = lower.split('.').pop()
  switch (ext) {
    case 'ts': case 'tsx': return { label: 'TS', color: '#3b9cff' }
    case 'js': case 'jsx': case 'mjs': case 'cjs': return { label: 'JS', color: '#f1e05a' }
    case 'json': return { label: '{}', color: '#cbcb41' }
    case 'py': return { label: 'PY', color: '#5aa9e6' }
    case 'html': return { label: '<>', color: '#e8643c' }
    case 'css': return { label: '#', color: '#9a7bdc' }
    case 'md': return { label: 'M↓', color: '#519aba' }
    default: return null
  }
}

function makeTree(files: StudioFileRecord[]): TreeNode {
  const root: TreeNode = { name: 'workspace', path: '', type: 'folder', children: [] }
  const sort = (node: TreeNode) => node.children.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1)
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean)
    let current = root
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/')
      const isFile = index === parts.length - 1
      if (isFile && part === FOLDER_PLACEHOLDER) return
      let node = current.children.find((child) => child.name === part && child.type === (isFile ? 'file' : 'folder'))
      if (!node) {
        node = { name: part, path, type: isFile ? 'file' : 'folder', children: [] }
        current.children.push(node)
        sort(current)
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

const dirOf = (path: string) => path.split('/').slice(0, -1).join('/')
const baseOf = (path: string) => path.split('/').pop() || path

/* ───────── terminal + problems helpers ───────── */

type TermStatus = 'starting' | 'running' | 'idle' | 'done' | 'failed'
interface TermTab { id: string; title: string; kind: 'shell' | 'run' | 'python'; status: TermStatus }
interface PyState {
  runtime: PythonRuntime
  line: string
  cursor: number
  history: string[]
  histIdx: number
  busy: boolean
  inRepl: boolean
  replMore: boolean
  awaitingInput: boolean
  inputBuf: string
  ranPy: boolean
}
interface Problem { id: string; message: string; source: string; path?: string; line?: number; col?: number }
interface Session {
  term: Terminal
  fit: FitAddon
  observer: ResizeObserver
  title: string
  proc: WebContainerProcess | null
  writer: WritableStreamDefaultWriter<string> | null
  disposables: Array<{ dispose: () => void }>
  tail: string
  lineBuf: string
  lastLoc: { path?: string; line?: number; col?: number; age: number } | null
  py?: PyState
}

const uid = () => Math.random().toString(36).slice(2, 9)
// eslint-disable-next-line no-control-regex
const stripAnsi = (text: string) => text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')

/** Pick a sensible start command from the project's files so "Run" works out of the box. */
function defaultCommandFor(files: StudioFileRecord[]): string {
  const pkg = files.find((f) => f.path === 'package.json')
  if (pkg) {
    try {
      const scripts = (JSON.parse(pkg.content) as { scripts?: Record<string, string> }).scripts || {}
      if (scripts.dev) return 'npm install && npm run dev'
      if (scripts.start) return 'npm install && npm start'
    } catch { /* invalid JSON: fall through */ }
  }
  const entry = ['index.js', 'main.js', 'server.js', 'app.js', 'src/index.js', 'src/main.js'].find((p) => files.some((f) => f.path === p))
  if (entry) return `node ${entry}`
  const pyEntry = ['main.py', 'app.py', 'run.py', 'index.py', 'src/main.py'].find((p) => files.some((f) => f.path === p))
    || files.find((f) => f.path.endsWith('.py'))?.path
  if (pyEntry) {
    const hasReqs = files.some((f) => f.path === 'requirements.txt')
    return `${hasReqs ? 'pip install -r requirements.txt && ' : ''}python ${pyEntry}`
  }
  return 'ls'
}

/** True when a command should run in the Python (Pyodide) terminal. */
function isPythonCommand(command: string) {
  const first = command.trim().split(/\s+/)[0] || ''
  return ['python', 'python3', 'py', 'pip', 'pip3'].includes(first)
}

/** Splits a command line into words, keeping "quoted text" together. */
function tokenize(text: string): string[] {
  const tokens: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) tokens.push(m[1] ?? m[2] ?? m[3])
  return tokens
}

/** Lines of a requirements.txt that pip can install. */
function parseRequirements(content: string): string[] {
  return content.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter((l) => l && !l.startsWith('-'))
}

const PY_HELP = [
  'Built-in commands:',
  '  python file.py          run a project file',
  '  python -c "code"        run a snippet',
  '  python                  start the interactive prompt',
  '  pip install <package>   install a package (pure Python, or built into Pyodide)',
  '  pip install -r requirements.txt',
  '  pip list / pip uninstall <package>',
  '  ls, cat <file>, pwd, clear',
  'Ctrl+C stops a running program. Web servers and native-code packages (torch, tensorflow) do not run in the browser.',
].join('\n') + '\n'

/** Turn a raw error line into a Problem (or null if the line is not an error). */
function parseProblem(line: string, source: string, files: StudioFileRecord[], session: Session): Problem | null {
  const text = line.trim()
  if (!text) return null
  const loc = text.match(/([\w@.\\/-]+\.(?:jsx?|tsx?|mjs|cjs|py|json|css|html)):(\d+)(?::(\d+))?/)
  const pyFrame = text.match(/File "([^"]+\.py)", line (\d+)/)
  let resolved: { path?: string; line?: number; col?: number } | null = null
  if (loc || pyFrame) {
    const rawPath = (pyFrame ? pyFrame[1] : loc![1])
    const clean = rawPath.replace(/^\/home\/project\//, '').replace(/^\.?\//, '')
    const match = files.find((f) => clean === f.path || clean.endsWith(`/${f.path}`) || f.path.endsWith(`/${clean}`))
    resolved = { path: match?.path, line: Number(pyFrame ? pyFrame[2] : loc![2]), col: !pyFrame && loc![3] ? Number(loc![3]) : undefined }
  }
  const isError = (/\b(error|failed|exception|cannot find|not found|missing script|enoent|eaddrinuse|syntaxerror)\b/i.test(text)
    || /\b[A-Za-z_]*(Error|Exception)\b(:|$)/.test(text)) && !/^npm warn/i.test(text) && !pyFrame
  if (!isError) {
    if (resolved?.path) session.lastLoc = { ...resolved, age: 0 }
    else if (session.lastLoc) session.lastLoc.age++
    return null
  }
  let where = resolved
  if (!where && session.lastLoc && session.lastLoc.age < 8) where = session.lastLoc
  session.lastLoc = null
  return { id: uid(), message: text.slice(0, 300), source, path: where?.path, line: where?.line, col: where?.col }
}

/** Plain-language explanation for the most common failure messages. */
function diagnose(output: string): string[] {
  const text = stripAnsi(output)
  const hints: string[] = []
  const missing = text.match(/Missing script:\s*"?([\w:-]+)"?/i)
  if (missing) hints.push(`package.json has no "${missing[1]}" script. Add one under "scripts", or change the command to something like: node index.js`)
  if (/ENOENT[^\n]*package\.json|Could not read package\.json/i.test(text)) hints.push('There is no package.json in the project root. Run "npm init -y" in a shell tab, or run a file directly: node <file>')
  const module = text.match(/Cannot find module '([^']+)'/)
  if (module) hints.push(`Module "${module[1]}" is missing. Run: npm install ${module[1]}`)
  if (/command not found|not found: (python|pip)|jsh: .*not found/i.test(text)) hints.push('That command is not available. The browser runtime only runs Node.js tools, so python and pip do not work here.')
  if (/EADDRINUSE/i.test(text)) hints.push('That port is already in use. Stop the other terminal that runs a server, or change the port.')
  if (/SharedArrayBuffer|crossOriginIsolated/i.test(text)) hints.push('The page is missing COOP/COEP headers, which WebContainers need.')
  const pyModule = text.match(/ModuleNotFoundError: No module named '([\w.]+)'/)
  if (pyModule) hints.push(`Python module "${pyModule[1].split('.')[0]}" is not installed. Try: pip install ${pyModule[1].split('.')[0]}`)
  if (/Can't find a pure Python 3 wheel/i.test(text)) hints.push('That package needs native code and is not available in the browser Python runtime (for example tensorflow or torch). Try a pure-Python alternative, or a package built into Pyodide such as numpy, pandas or scikit-learn.')
  if (/uvicorn|flask|django|fastapi|socket|address family|errno 5/i.test(text) && /error/i.test(text)) hints.push('Web servers cannot listen on a port in the browser Python runtime. Run scripts and notebooks here; deploy servers with the Deploy button.')
  if (/EOFError/i.test(text)) hints.push('input() needs the COOP/COEP headers to work. Without them Python sees an empty input.')
  return hints
}

const COOP_COEP_HELP = [
  'WebContainers need these response headers on the Studio page (COOP/COEP):',
  '  Cross-Origin-Opener-Policy: same-origin',
  '  Cross-Origin-Embedder-Policy: require-corp',
  'In next.config.js add them under async headers() for source "/studio/:path*".',
]

/* ───────────────────────────── component ───────────────────────────── */

export default function StudioIde({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const [files, setFiles] = useState<StudioFileRecord[]>([])
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activePath, setActivePath] = useState<string>('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [runtimeStatus, setRuntimeStatus] = useState('Idle')
  const [command, setCommand] = useState('')
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [termTabs, setTermTabs] = useState<TermTab[]>([])
  const [activeTerm, setActiveTerm] = useState('')
  const [panelView, setPanelView] = useState<'terminal' | 'problems'>('terminal')
  const [problems, setProblems] = useState<Problem[]>([])
  const [newMenu, setNewMenu] = useState(false)

  // VS Code style UI state
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [terminalOpen, setTerminalOpen] = useState(true)
  const [terminalHeight, setTerminalHeight] = useState(240)
  const [explorerHover, setExplorerHover] = useState(false)
  const [hoverTab, setHoverTab] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })

  const webContainerRef = useRef<WebContainer | null>(null)
  const mountedRef = useRef(false)
  const bootingRef = useRef(false)
  const sessions = useRef<Map<string, Session>>(new Map())
  const creating = useRef<Set<string>>(new Set())
  const termEls = useRef<Record<string, HTMLDivElement | null>>({})
  const startQueue = useRef<Map<string, () => void>>(new Map())
  const autoShell = useRef(false)
  const filesRef = useRef<StudioFileRecord[]>([])
  const openFilesRef = useRef<OpenFile[]>([])
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const revealRef = useRef<{ path: string; line: number; col?: number } | null>(null)
  const ideRef = useRef<HTMLDivElement | null>(null)
  const saveRef = useRef<() => void>(() => {})

  const activeFile = openFiles.find((file) => file.path === activePath)
  const tree = useMemo(() => makeTree(files), [files])
  filesRef.current = files
  openFilesRef.current = openFiles

  /* load files */
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const result = await fetchStudioFiles(projectId)
        if (cancelled) return
        setFiles(result.files)
        setCommand(defaultCommandFor(result.files))
        const first = result.files.find((f) => baseOf(f.path) !== FOLDER_PLACEHOLDER)
        if (first) {
          setOpenFiles([{ ...first, dirty: false, savedContent: first.content }])
          setActivePath(first.path)
          expandParents(first.path)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  /* create an xterm instance for every terminal tab that does not have one yet */
  useEffect(() => {
    termTabs.forEach((tab) => {
      if (sessions.current.has(tab.id) || creating.current.has(tab.id)) return
      const el = termEls.current[tab.id]
      if (!el) return
      creating.current.add(tab.id)
      createSession(tab, el)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termTabs])

  /* refit + focus when switching tabs or resizing the panel */
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const s = sessions.current.get(activeTerm)
      try { s?.fit.fit() } catch { /* hidden */ }
      if (panelView === 'terminal' && terminalOpen) s?.term.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [activeTerm, terminalOpen, terminalHeight, sidebarOpen, panelView])

  /* open one shell automatically so the terminal is ready to type in */
  useEffect(() => {
    if (loading || autoShell.current) return
    autoShell.current = true
    newTerminal(isPythonCommand(command) ? 'python' : 'shell')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  /* jump to a line when a problem was clicked */
  useEffect(() => {
    const target = revealRef.current
    const editor = editorRef.current
    if (!target || !editor || target.path !== activePath) return
    editor.revealLineInCenter(target.line)
    editor.setPosition({ lineNumber: target.line, column: target.col || 1 })
    editor.focus()
    revealRef.current = null
  }, [activePath, openFiles.length])

  /* clean up every shell when leaving the page */
  useEffect(() => {
    const all = sessions.current
    return () => {
      all.forEach((s) => {
        try { s.proc?.kill() } catch { /* ignore */ }
        s.py?.runtime.kill()
        s.observer.disconnect()
        s.disposables.forEach((d) => d.dispose())
        s.term.dispose()
      })
      all.clear()
    }
  }, [])

  /* keyboard shortcuts (capture so the browser's own Ctrl+S never fires) */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current() }
      else if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); setSidebarOpen((o) => !o) }
      else if (mod && e.key === '`') { e.preventDefault(); setTerminalOpen((o) => !o) }
      else if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    if (!newMenu) return
    const close = () => setNewMenu(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [newMenu])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu])

  /* ───────── file operations (same API calls as before) ───────── */

  function expandParents(path: string) {
    setExpanded((current) => {
      const next = new Set(current)
      const parts = path.split('/').filter(Boolean)
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'))
      return next
    })
  }

  function toggleFolder(path: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
  }

  function openFile(file: StudioFileRecord) {
    setOpenFiles((current) => current.some((item) => item.path === file.path) ? current : [...current, { ...file, dirty: false, savedContent: file.content }])
    setActivePath(file.path)
  }

  function openByPath(path: string) {
    const file = files.find((item) => item.path === path)
    if (file) openFile(file)
  }

  function updateActiveFile(value: string = '') {
    if (!activePath) return
    setOpenFiles((current) => current.map((file) => file.path === activePath ? { ...file, content: value, dirty: value !== file.savedContent } : file))
  }

  async function saveFile(path = activePath) {
    const file = openFiles.find((item) => item.path === path)
    if (!file || !file.dirty) return
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
  saveRef.current = () => { saveFile().catch(() => null) }

  function startNew(kind: 'new-file' | 'new-folder', parent: string) {
    setSidebarOpen(true)
    setExpanded((current) => new Set(current).add(parent))
    expandParents(parent ? `${parent}/x` : 'x')
    setEditing({ kind, parent })
  }

  async function commitEdit(value: string) {
    const current = editing
    setEditing(null)
    const name = value.trim().replace(/^\/+|\/+$/g, '')
    if (!current || !name) return

    if (current.kind === 'rename') {
      const next = dirOf(current.path) ? `${dirOf(current.path)}/${name}` : name
      if (next === current.path) return
      try {
        const result = await renameStudioFile(projectId, current.path, next)
        await renameInWebContainer(current.path, next)
        setFiles((list) => list.map((file) => file.path === current.path ? result.file : file))
        setOpenFiles((list) => list.map((file) => file.path === current.path ? { ...result.file, dirty: file.dirty, savedContent: result.file.content } : file))
        if (activePath === current.path) setActivePath(result.file.path)
      } catch (error) {
        await emitError(`Rename failed: ${error instanceof Error ? error.message : 'Unknown error'}`, current.path)
        alert(error instanceof Error ? error.message : 'Could not rename file')
      }
      return
    }

    const base = current.parent ? `${current.parent}/${name}` : name
    const path = current.kind === 'new-folder' ? `${base}/${FOLDER_PLACEHOLDER}` : base
    try {
      const result = await createStudioFile(projectId, path, '')
      setFiles((list) => [...list, result.file])
      expandParents(path)
      await writeFileToWebContainer(path, '')
      if (current.kind === 'new-file') openFile(result.file)
      else setExpanded((set) => new Set(set).add(base))
    } catch (error) {
      await emitError(`Create failed: ${error instanceof Error ? error.message : 'Unknown error'}`, path)
      alert(error instanceof Error ? error.message : 'Could not create item')
    }
  }

  async function duplicateFile(path: string) {
    const next = path.replace(/(\.[^/.]+)?$/, '-copy$1')
    try {
      const result = await duplicateStudioFile(projectId, path, next)
      await writeFileToWebContainer(result.file.path, result.file.content)
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
      await removeFromWebContainer(path)
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

  async function refreshFiles() {
    try {
      const latest = await fetchStudioFiles(projectId)
      setFiles(latest.files)
    } catch { /* keep current tree */ }
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

  /* ───────── WebContainer runtime ───────── */

  async function bootWebContainer(term?: Terminal) {
    if (webContainerRef.current) return webContainerRef.current
    if (bootingRef.current) {
      // another terminal is already booting it: wait for it
      for (let i = 0; i < 100 && !webContainerRef.current; i++) await new Promise((r) => setTimeout(r, 150))
      return webContainerRef.current
    }
    bootingRef.current = true
    setRuntimeStatus('Booting...')
    try {
      if (typeof window !== 'undefined' && !window.crossOriginIsolated) {
        COOP_COEP_HELP.forEach((l) => term?.writeln(`\x1b[33m${l}\x1b[0m`))
        throw new Error('Page is not cross-origin isolated (missing COOP/COEP headers)')
      }
      const { WebContainer } = await import('@webcontainer/api')
      const instance = await WebContainer.boot()
      instance.on('server-ready', (_port, url) => setServerUrl(url))
      instance.on('error', (e) => term?.writeln(`\r\n\x1b[31m[runtime error] ${e.message}\x1b[0m`))
      webContainerRef.current = instance
      setRuntimeStatus('Ready')
      return instance
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WebContainer boot failed'
      setRuntimeStatus(message)
      term?.writeln(`\r\n\x1b[31m[boot failed] ${message}\x1b[0m`)
      await emitError(message)
      return null
    } finally {
      bootingRef.current = false
    }
  }

  /** Save edits, boot the runtime and mount the project files (mount happens once; later edits are synced file by file). */
  async function ensureRuntime(term?: Terminal) {
    for (const file of openFiles.filter((f) => f.dirty)) await saveFile(file.path)
    const instance = await bootWebContainer(term)
    if (!instance) return null
    if (!mountedRef.current) {
      const latest = await fetchStudioFiles(projectId)
      setFiles(latest.files)
      await instance.mount(toWebContainerTree(latest.files))
      mountedRef.current = true
      term?.writeln(`\x1b[90mMounted ${latest.files.length} project files.\x1b[0m`)
    }
    return instance
  }

  async function writeFileToWebContainer(path: string, content: string) {
    const instance = webContainerRef.current
    if (!instance) return
    const parent = dirOf(path)
    if (parent) await instance.fs.mkdir(parent, { recursive: true })
    await instance.fs.writeFile(path, content)
  }

  async function renameInWebContainer(from: string, to: string) {
    const instance = webContainerRef.current
    if (!instance) return
    const parent = dirOf(to)
    if (parent) await instance.fs.mkdir(parent, { recursive: true })
    await instance.fs.rename(from, to).catch(() => null)
  }

  async function removeFromWebContainer(path: string) {
    await webContainerRef.current?.fs.rm(path, { force: true }).catch(() => null)
  }

  /* ───────── terminals ───────── */

  function updateTab(id: string, patch: Partial<TermTab>) {
    setTermTabs((tabs) => tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  async function createSession(tab: TermTab, el: HTMLDivElement) {
    const [{ Terminal: XTerm }, { FitAddon: Fit }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')])
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      lineHeight: 1.15,
      scrollback: 5000,
      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
      theme: { background: '#1e1e1e', foreground: '#cccccc', cursor: '#aeafad', selectionBackground: '#264f78' },
    })
    const fit = new Fit()
    term.loadAddon(fit)
    term.open(el)
    try { fit.fit() } catch { /* hidden */ }
    const session: Session = {
      term, fit, title: tab.title, proc: null, writer: null, disposables: [], tail: '', lineBuf: '', lastLoc: null,
      observer: new ResizeObserver(() => {
        try {
          fit.fit()
          session.proc?.resize({ cols: term.cols, rows: term.rows })
        } catch { /* hidden */ }
      }),
    }
    session.observer.observe(el)
    sessions.current.set(tab.id, session)
    creating.current.delete(tab.id)
    startQueue.current.get(tab.id)?.()
    startQueue.current.delete(tab.id)
  }

  /** Collects output so errors can be listed in the Problems tab and explained in plain words. */
  function ingest(session: Session, data: string) {
    session.tail = (session.tail + data).slice(-6000)
    session.lineBuf += data
    const lines = session.lineBuf.split(/\r?\n|\r/)
    session.lineBuf = lines.pop() || ''
    const found: Problem[] = []
    for (const raw of lines) {
      const problem = parseProblem(stripAnsi(raw), session.title, filesRef.current, session)
      if (problem) found.push(problem)
    }
    if (found.length) {
      setProblems((current) => {
        const last = current[current.length - 1]
        const fresh = found.filter((p) => !(last && last.message === p.message && last.path === p.path))
        return [...current, ...fresh].slice(-200)
      })
    }
  }

  async function launch(id: string, kind: 'shell' | 'run', cmd?: string) {
    const session = sessions.current.get(id)
    if (!session) return
    const { term } = session
    const instance = await ensureRuntime(term)
    if (!instance) { updateTab(id, { status: 'failed' }); return }
    try {
      const size = { terminal: { cols: term.cols || 80, rows: term.rows || 24 } }
      const proc = kind === 'shell' ? await instance.spawn('jsh', size) : await instance.spawn('jsh', ['-c', cmd || 'ls'], size)
      session.proc = proc
      const writer = proc.input.getWriter()
      session.writer = writer
      session.disposables.push(term.onData((d) => { writer.write(d).catch(() => null) }))
      proc.output.pipeTo(new WritableStream({ write(data) { term.write(data); ingest(session, data) } })).catch(() => null)
      updateTab(id, { status: 'running' })
      setRuntimeStatus(kind === 'run' ? `Running: ${cmd}` : 'Shell ready')
      if (kind === 'run') await recordStudioActivity({ project_id: projectId, event_type: 'run', message: cmd, metadata: { open_files: openFiles.length } })

      const code = await proc.exit
      session.proc = null
      if (kind === 'run') {
        const ok = code === 0
        term.writeln(`\r\n\x1b[${ok ? 32 : 31}m[Process exited with code ${code}]\x1b[0m`)
        if (!ok) {
          diagnose(session.tail).forEach((hint) => term.writeln(`\x1b[33mHint: ${hint}\x1b[0m`))
          const lastError = stripAnsi(session.tail).split(/\r?\n/).map((l) => l.trim()).filter((l) => /error|ERR!/i.test(l)).pop()
          await emitError(`Run exited with ${code}${lastError ? `: ${lastError.slice(0, 200)}` : ''}`)
        }
        updateTab(id, { status: ok ? 'done' : 'failed' })
        setRuntimeStatus(ok ? 'Finished' : `Exited with ${code}`)
      } else {
        term.writeln('\r\n\x1b[90m[Shell closed]\x1b[0m')
        updateTab(id, { status: 'done' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start process'
      term.writeln(`\r\n\x1b[31m${message}\x1b[0m`)
      updateTab(id, { status: 'failed' })
      await emitError(message)
    }
  }

  function addTerminal(kind: 'shell' | 'run' | 'python', title: string, cmd?: string) {
    const id = uid()
    startQueue.current.set(id, () => { if (kind === 'python') launchPython(id, cmd); else launch(id, kind, cmd) })
    setTermTabs((tabs) => [...tabs, { id, title, kind, status: 'starting' }])
    setActiveTerm(id)
    setPanelView('terminal')
    setTerminalOpen(true)
    return id
  }

  function newTerminal(kind: 'shell' | 'python' = 'shell') {
    const same = termTabs.filter((t) => t.kind === kind).length
    const base = kind === 'python' ? 'python' : 'jsh'
    addTerminal(kind, same ? `${base} (${same + 1})` : base)
  }

  function runProject() {
    const cmd = command.trim()
    if (!cmd) return
    if (isPythonCommand(cmd)) { runInPython(cmd); return }
    addTerminal('run', `run: ${cmd.length > 22 ? `${cmd.slice(0, 22)}...` : cmd}`, cmd)
  }

  /** Runs a command in an idle Python terminal, or opens a new one. */
  function runInPython(cmd: string) {
    const idle = termTabs.find((t) => {
      const py = sessions.current.get(t.id)?.py
      return t.kind === 'python' && py && !py.busy && !py.inRepl
    })
    const session = idle ? sessions.current.get(idle.id) : undefined
    if (idle && session) {
      setActiveTerm(idle.id)
      setPanelView('terminal')
      setTerminalOpen(true)
      session.term.write(`${cmd}\r\n`)
      pyExec(idle.id, session, cmd)
      return
    }
    addTerminal('python', 'python', cmd)
  }

  /* ───────── Python terminal (Pyodide) ───────── */

  const toTerm = (text: string) => text.replace(/\r?\n/g, '\r\n')

  function collectProjectFiles() {
    const open = new Map(openFilesRef.current.map((f) => [f.path, f.content]))
    return filesRef.current
      .filter((f) => baseOf(f.path) !== FOLDER_PLACEHOLDER)
      .map((f) => ({ path: f.path, content: open.get(f.path) ?? f.content }))
  }

  const pyPrompt = (py: PyState) => (py.inRepl ? (py.replMore ? '... ' : '>>> ') : '\x1b[32m$\x1b[0m ')

  function pyShowPrompt(session: Session) {
    session.term.write(pyPrompt(session.py!))
  }

  function pyRedraw(session: Session) {
    const py = session.py!
    const back = py.line.length - py.cursor
    session.term.write(`\r\x1b[K${pyPrompt(py)}${py.line}${back > 0 ? `\x1b[${back}D` : ''}`)
  }

  async function launchPython(id: string, initialCommand?: string) {
    const session = sessions.current.get(id)
    if (!session) return
    const { term } = session
    term.writeln('\x1b[90mStarting Python (Pyodide). The first start downloads about 10 MB, then it is cached.\x1b[0m')
    const runtime = new PythonRuntime({
      onOut: (text) => term.write(toTerm(text)),
      onErr: (text) => { term.write(`\x1b[31m${toTerm(text)}\x1b[0m`); ingest(session, text) },
      onInput: () => { if (session.py) { session.py.awaitingInput = true; session.py.inputBuf = '' } },
    })
    session.py = { runtime, line: '', cursor: 0, history: [], histIdx: 0, busy: true, inRepl: false, replMore: false, awaitingInput: false, inputBuf: '', ranPy: false }
    session.disposables.push(term.onData((data) => { handlePyKey(id, session, data) }))
    try {
      await runtime.start()
      setRuntimeStatus('Python ready')
      term.writeln(`Python ${runtime.version} (Pyodide). Type "help" for commands, or pip install <package>.`)
      session.py.busy = false
      updateTab(id, { status: 'idle' })
      if (initialCommand) {
        term.write(`${pyPrompt(session.py)}${initialCommand}\r\n`)
        await pyExec(id, session, initialCommand)
      } else {
        pyShowPrompt(session)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start Python'
      term.writeln(`\r\n\x1b[31m${message}\x1b[0m`)
      updateTab(id, { status: 'failed' })
      setRuntimeStatus(message)
      await emitError(message)
    }
  }

  /** Keyboard handling for the Python terminal: line editing, history, input() and Ctrl+C. */
  function handlePyKey(id: string, session: Session, data: string) {
    const py = session.py
    if (!py) return
    const { term } = session

    if (data === '\x03') { // Ctrl+C
      if (py.busy) {
        if (py.awaitingInput) { py.awaitingInput = false; py.runtime.provideInput(null) }
        term.write('^C\r\n')
        py.runtime.interrupt()
      } else {
        py.line = ''; py.cursor = 0; py.replMore = false
        term.write('^C\r\n')
        pyShowPrompt(session)
      }
      return
    }

    if (py.awaitingInput) { // the running program called input()
      if (data === '\r') { term.write('\r\n'); py.awaitingInput = false; const text = py.inputBuf; py.inputBuf = ''; py.runtime.provideInput(text) }
      else if (data === '\x04') { py.awaitingInput = false; py.runtime.provideInput(null) }
      else if (data === '\x7f') { if (py.inputBuf) { py.inputBuf = py.inputBuf.slice(0, -1); term.write('\b \b') } }
      else if (!data.startsWith('\x1b') && data >= ' ') { py.inputBuf += data; term.write(data) }
      return
    }
    if (py.busy) return // ignore typing while a program runs

    if (data === '\r') { pySubmit(id, session); return }
    if (data === '\x04') { // Ctrl+D leaves the interactive prompt
      if (py.inRepl && !py.line) { py.inRepl = false; term.write('\r\n'); pyShowPrompt(session) }
      return
    }
    if (data === '\x0c') { term.clear(); pyRedraw(session); return }
    if (data === '\x7f') {
      if (py.cursor > 0) { py.line = py.line.slice(0, py.cursor - 1) + py.line.slice(py.cursor); py.cursor--; pyRedraw(session) }
      return
    }
    if (data === '\x1b[3~') { py.line = py.line.slice(0, py.cursor) + py.line.slice(py.cursor + 1); pyRedraw(session); return }
    if (data === '\x1b[D') { if (py.cursor > 0) { py.cursor--; term.write('\x1b[D') } return }
    if (data === '\x1b[C') { if (py.cursor < py.line.length) { py.cursor++; term.write('\x1b[C') } return }
    if (data === '\x1b[H' || data === '\x01') { py.cursor = 0; pyRedraw(session); return }
    if (data === '\x1b[F' || data === '\x05') { py.cursor = py.line.length; pyRedraw(session); return }
    if (data === '\x1b[A') {
      if (py.histIdx > 0) { py.histIdx--; py.line = py.history[py.histIdx]; py.cursor = py.line.length; pyRedraw(session) }
      return
    }
    if (data === '\x1b[B') {
      if (py.histIdx < py.history.length - 1) { py.histIdx++; py.line = py.history[py.histIdx] }
      else { py.histIdx = py.history.length; py.line = '' }
      py.cursor = py.line.length
      pyRedraw(session)
      return
    }
    if (data.startsWith('\x1b')) return
    const text = data.replace(/[\r\n]+/g, ' ')
    if (text < ' ') return
    py.line = py.line.slice(0, py.cursor) + text + py.line.slice(py.cursor)
    py.cursor += text.length
    pyRedraw(session)
  }

  async function pySubmit(id: string, session: Session) {
    const py = session.py!
    const line = py.line
    py.line = ''
    py.cursor = 0
    session.term.write('\r\n')
    if (line.trim() && py.history[py.history.length - 1] !== line) py.history.push(line)
    py.histIdx = py.history.length

    if (py.inRepl) {
      const t = line.trim()
      if (!py.replMore && ['exit()', 'quit()', 'exit', 'quit'].includes(t)) {
        py.inRepl = false
      } else {
        py.busy = true
        updateTab(id, { status: 'running' })
        try {
          const result = await py.runtime.exec({ op: 'repl', line })
          py.replMore = !!result.more
        } catch (error) {
          session.term.writeln(`\x1b[31m${error instanceof Error ? error.message : 'Python error'}\x1b[0m`)
          py.replMore = false
        } finally {
          py.busy = false
          updateTab(id, { status: 'idle' })
        }
      }
      pyShowPrompt(session)
      return
    }
    if (!line.trim()) { pyShowPrompt(session); return }
    await pyExec(id, session, line)
  }

  /** Runs one command line (with && chaining) and shows the prompt again. */
  async function pyExec(id: string, session: Session, line: string) {
    const py = session.py!
    const { term } = session
    py.busy = true
    py.ranPy = false
    session.tail = ''
    updateTab(id, { status: 'running' })
    let code = 0
    try {
      for (const part of line.split('&&')) {
        const tokens = tokenize(part)
        if (!tokens.length) continue
        code = await runPyTokens(session, tokens)
        if (code !== 0) break
      }
    } catch (error) {
      code = 1
      term.writeln(`\x1b[31m${error instanceof Error ? error.message : 'Python error'}\x1b[0m`)
    } finally {
      py.busy = false
      py.awaitingInput = false
    }
    if (py.ranPy && code !== 0 && code !== 130) {
      diagnose(session.tail).forEach((hint) => term.writeln(`\x1b[33mHint: ${hint}\x1b[0m`))
      const lastError = stripAnsi(session.tail).split(/\r?\n/).map((l) => l.trim()).filter((l) => /Error|Exception|ERROR/.test(l)).pop()
      await emitError(`Python command exited with ${code}${lastError ? `: ${lastError.slice(0, 200)}` : ''}`)
    }
    if (code === 130) term.writeln('\x1b[90m[Interrupted]\x1b[0m')
    updateTab(id, { status: 'idle' })
    setRuntimeStatus(code === 0 ? 'Finished' : `Exited with ${code}`)
    if (!py.inRepl || code !== 0) pyShowPrompt(session)
    else pyShowPrompt(session)
  }

  async function runPyTokens(session: Session, tokens: string[]): Promise<number> {
    const py = session.py!
    const { term } = session
    const out = (text: string) => term.write(toTerm(text))
    const err = (text: string) => term.write(`\x1b[31m${toTerm(text)}\x1b[0m`)
    const [cmd, ...args] = tokens

    switch (cmd) {
      case 'help': out(PY_HELP); return 0
      case 'clear': case 'cls': term.clear(); return 0
      case 'pwd': out('/home/project\n'); return 0
      case 'echo': out(`${args.join(' ')}\n`); return 0
      case 'exit': out('Close this terminal with the X button in the list on the right.\n'); return 0
      case 'cd': err('cd is not supported here. Paths are relative to the project root.\n'); return 1
      case 'node': case 'npm': case 'npx':
        err(`${cmd} runs in a JavaScript terminal. Use + and choose JavaScript (jsh).\n`)
        return 127
      case 'ls': {
        const target = (args.find((a) => !a.startsWith('-')) || '').replace(/^\.?\/?|\/$/g, '')
        const entries = new Map<string, boolean>()
        for (const f of collectProjectFiles()) {
          if (target && f.path === target) { out(`${f.path}\n`); return 0 }
          if (target && !f.path.startsWith(`${target}/`)) continue
          const rest = target ? f.path.slice(target.length + 1) : f.path
          const [first, ...tail] = rest.split('/')
          entries.set(first, tail.length > 0 || entries.get(first) === true)
        }
        if (entries.size === 0 && target) { err(`ls: cannot access '${target}': No such file or directory\n`); return 2 }
        const names = Array.from(entries.entries()).sort((a, b) => a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] ? -1 : 1)
        out(`${names.map(([n, dir]) => (dir ? `\x1b[34m${n}/\x1b[0m` : n)).join('  ')}\n`)
        return 0
      }
      case 'cat': {
        if (!args[0]) { err('cat: missing file name\n'); return 1 }
        const path = args[0].replace(/^\.\//, '')
        const file = collectProjectFiles().find((f) => f.path === path)
        if (!file) { err(`cat: ${args[0]}: No such file or directory\n`); return 1 }
        out(file.content.endsWith('\n') ? file.content : `${file.content}\n`)
        return 0
      }
      case 'python': case 'python3': case 'py': {
        py.ranPy = true
        return runPythonCommand(session, args)
      }
      case 'pip': case 'pip3': {
        py.ranPy = true
        return runPipCommand(session, args)
      }
      default:
        err(`${cmd}: command not found. Type help.\n`)
        return 127
    }
  }

  async function runPythonCommand(session: Session, args: string[]): Promise<number> {
    const py = session.py!
    const rt = py.runtime
    const { term } = session
    const out = (text: string) => term.write(toTerm(text))
    const err = (text: string) => { term.write(`\x1b[31m${toTerm(text)}\x1b[0m`); ingest(session, text) }

    await rt.sync(collectProjectFiles())
    if (args[0] === '-V' || args[0] === '--version') { out(`Python ${rt.version}\n`); return 0 }
    await recordStudioActivity({ project_id: projectId, event_type: 'run', message: `python ${args.join(' ')}`.trim(), metadata: { runtime: 'pyodide' } }).catch(() => null)

    if (args[0] === '-m') {
      const module = args[1]
      if (!module) { err('python: option -m requires an argument\n'); return 2 }
      if (module === 'pip') return runPipCommand(session, args.slice(2))
      const code = `import runpy, sys\nsys.argv = ${JSON.stringify(args.slice(1))}\nrunpy.run_module(${JSON.stringify(module)}, run_name="__main__", alter_sys=True)`
      return (await rt.exec({ op: 'code', code })).code
    }
    if (args[0] === '-c') {
      if (args.length < 2) { err('python: option -c requires an argument\n'); return 2 }
      return (await rt.exec({ op: 'code', code: args[1] })).code
    }
    if (args.length === 0) {
      py.inRepl = true
      py.replMore = false
      out(`Python ${rt.version} (Pyodide). Type exit() or press Ctrl+D to leave.\n`)
      return 0
    }
    const file = args[0].replace(/^\.\//, '')
    if (!collectProjectFiles().some((f) => f.path === file)) {
      err(`python: can't open file '${args[0]}': [Errno 2] No such file or directory\n`)
      return 2
    }
    return (await rt.exec({ op: 'file', path: file, argv: args.slice(1) })).code
  }

  async function runPipCommand(session: Session, args: string[]): Promise<number> {
    const py = session.py!
    const rt = py.runtime
    const { term } = session
    const out = (text: string) => term.write(toTerm(text))
    const err = (text: string) => { term.write(`\x1b[31m${toTerm(text)}\x1b[0m`); ingest(session, text) }
    const [sub, ...rest] = args

    if (!sub || sub === 'help' || sub === '--help') { out('Usage: pip install <package> | pip install -r requirements.txt | pip uninstall <package> | pip list\n'); return 0 }
    if (sub === '--version' || sub === '-V') { out(`pip (micropip) for Python ${rt.version}\n`); return 0 }
    await rt.sync(collectProjectFiles())

    if (sub === 'install') {
      const pkgs: string[] = []
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]
        if (a === '-r' || a === '--requirement') {
          const name = (rest[++i] || '').replace(/^\.\//, '')
          const file = collectProjectFiles().find((f) => f.path === name)
          if (!file) { err(`ERROR: Could not open requirements file: '${name}'\n`); return 1 }
          pkgs.push(...parseRequirements(file.content))
        } else if (!a.startsWith('-')) {
          pkgs.push(a)
        }
      }
      if (pkgs.length === 0) { err('ERROR: You must give at least one requirement to install\n'); return 1 }
      return (await rt.exec({ op: 'pip', action: 'install', pkgs })).code
    }
    if (sub === 'uninstall') {
      const pkgs = rest.filter((a) => !a.startsWith('-'))
      if (pkgs.length === 0) { err('ERROR: You must give at least one requirement to uninstall\n'); return 1 }
      return (await rt.exec({ op: 'pip', action: 'uninstall', pkgs })).code
    }
    if (sub === 'list' || sub === 'freeze') return (await rt.exec({ op: 'pip', action: 'list' })).code
    err(`ERROR: unknown command "${sub}"\n`)
    return 1
  }

  function closeTerminal(id: string) {
    const s = sessions.current.get(id)
    if (s) {
      try { s.proc?.kill() } catch { /* ignore */ }
      s.py?.runtime.kill()
      s.observer.disconnect()
      s.disposables.forEach((d) => d.dispose())
      s.term.dispose()
      sessions.current.delete(id)
    }
    startQueue.current.delete(id)
    delete termEls.current[id]
    setTermTabs((tabs) => {
      const next = tabs.filter((t) => t.id !== id)
      if (activeTerm === id) setActiveTerm(next[next.length - 1]?.id || '')
      return next
    })
  }

  function goToProblem(p: Problem) {
    if (!p.path || !p.line) return
    revealRef.current = { path: p.path, line: p.line, col: p.col }
    if (activePath === p.path) {
      const t = revealRef.current
      editorRef.current?.revealLineInCenter(t.line)
      editorRef.current?.setPosition({ lineNumber: t.line, column: t.col || 1 })
      editorRef.current?.focus()
      revealRef.current = null
    } else {
      openByPath(p.path)
    }
  }

  async function emitError(message: string, path?: string) {
    await recordStudioActivity({ project_id: projectId, event_type: 'error', path, message }).catch(() => null)
  }

  /* drag the divider between editor and terminal */
  function startResize(e: ReactMouseEvent) {
    e.preventDefault()
    const move = (ev: MouseEvent) => {
      const rect = ideRef.current?.getBoundingClientRect()
      if (!rect) return
      setTerminalHeight(Math.max(90, Math.min(rect.bottom - ev.clientY, rect.height - 140)))
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
    editor.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, col: e.position.column }))
  }

  if (loading) return <div style={centerStyle}>Loading Studio files...</div>

  const crumbs = activePath ? activePath.split('/') : []
  const dirtyCount = openFiles.filter((f) => f.dirty).length

  return (
    <div
      ref={ideRef}
      style={{ ...ideStyle, gridTemplateColumns: sidebarOpen ? '48px 250px minmax(0, 1fr)' : '48px 0px minmax(0, 1fr)' }}
    >
      {/* Activity bar */}
      <nav style={activityBarStyle}>
        <ActivityButton title="Explorer (Ctrl+B)" active={sidebarOpen} onClick={() => setSidebarOpen((o) => !o)}><Files size={22} /></ActivityButton>
        <ActivityButton title="Run" active={false} onClick={() => { setTerminalOpen(true); runProject() }}><Play size={22} /></ActivityButton>
        <ActivityButton title="Terminal (Ctrl+`)" active={terminalOpen} onClick={() => setTerminalOpen((o) => !o)}><TerminalSquare size={22} /></ActivityButton>
      </nav>

      {/* Explorer */}
      <aside
        style={{ ...explorerStyle, display: sidebarOpen ? 'flex' : 'none' }}
        onMouseEnter={() => setExplorerHover(true)}
        onMouseLeave={() => setExplorerHover(false)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (!activePath || editing) return
          if (e.key === 'F2') { e.preventDefault(); setEditing({ kind: 'rename', path: activePath }) }
          if (e.key === 'Delete') { e.preventDefault(); removeFile(activePath) }
        }}
      >
        <div style={explorerTitleStyle}>Explorer</div>
        <div style={workspaceRowStyle} onClick={() => toggleFolder('')}>
          {expanded.has('') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectTitle}</span>
          <span style={{ display: 'flex', gap: 2, opacity: explorerHover ? 1 : 0, transition: 'opacity .15s' }} onClick={(e) => e.stopPropagation()}>
            <button style={miniIconStyle} title="New File" onClick={() => startNew('new-file', '')}><FilePlus size={15} /></button>
            <button style={miniIconStyle} title="New Folder" onClick={() => startNew('new-folder', '')}><FolderPlus size={15} /></button>
            <button style={miniIconStyle} title="Refresh Explorer" onClick={refreshFiles}><RefreshCw size={14} /></button>
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
          {expanded.has('') && (
            <TreeRows
              node={tree}
              depth={0}
              ctx={{
                expanded, activePath, editing,
                onToggle: toggleFolder,
                onOpen: openByPath,
                onCommit: commitEdit,
                onCancel: () => setEditing(null),
                onContext: (e, node) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, node }) },
              }}
            />
          )}
        </div>
      </aside>

      {/* Editor + terminal */}
      <section style={{ ...mainColumnStyle, gridTemplateRows: terminalOpen ? `minmax(0, 1fr) ${terminalHeight}px` : 'minmax(0, 1fr)' }}>
        <div style={{ display: 'grid', gridTemplateRows: '35px 22px minmax(0, 1fr)', minHeight: 0 }}>
          {/* Tabs */}
          <div style={tabBarStyle}>
            {openFiles.map((file) => {
              const name = baseOf(file.path)
              const badge = badgeFor(name)
              const isActive = file.path === activePath
              const hovered = hoverTab === file.path
              return (
                <div
                  key={file.path}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', file.path)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => reorderTabs(event.dataTransfer.getData('text/plain'), file.path)}
                  onClick={() => setActivePath(file.path)}
                  onAuxClick={(e) => { if (e.button === 1) closeTab(file.path) }}
                  onMouseEnter={() => setHoverTab(file.path)}
                  onMouseLeave={() => setHoverTab('')}
                  title={file.path}
                  style={{ ...tabStyle, ...(isActive ? activeTabStyle : {}) }}
                >
                  {badge ? <span style={{ color: badge.color, fontSize: 9, fontWeight: 800, width: 16, textAlign: 'center' }}>{badge.label}</span> : <FileIcon size={14} color="#8b949e" />}
                  <span style={{ whiteSpace: 'nowrap' }}>{name}</span>
                  <button onClick={(event) => { event.stopPropagation(); closeTab(file.path) }} style={tabCloseStyle} title="Close">
                    {file.dirty && !hovered ? <span style={{ fontSize: 14, lineHeight: 1 }}>●</span> : <X size={14} />}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Breadcrumbs + status */}
          <div style={breadcrumbStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {crumbs.map((c, i) => (
                <span key={`${c}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4, color: i === crumbs.length - 1 ? '#cccccc' : '#8b8b8b' }}>
                  {i > 0 && <ChevronRight size={12} />}{c}
                </span>
              ))}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#8b8b8b', flexShrink: 0 }}>
              {activeFile && <span>Ln {cursor.line}, Col {cursor.col} · {LANGUAGE_LABEL[languageFor(activeFile.path)]}</span>}
              <button
                onClick={() => saveRef.current()}
                disabled={!activeFile?.dirty || saving}
                title="Save (Ctrl+S)"
                style={{ ...miniIconStyle, opacity: activeFile?.dirty ? 1 : 0.35 }}
              >
                <Save size={14} />
              </button>
            </span>
          </div>

          {/* Editor */}
          <div style={{ minHeight: 0 }}>
            {activeFile ? (
              <Editor
                path={activeFile.path}
                value={activeFile.content}
                language={languageFor(activeFile.path)}
                theme="vs-dark"
                onChange={(value) => updateActiveFile(value || '')}
                onMount={handleMount}
                options={{
                  minimap: { enabled: true, scale: 1, renderCharacters: false },
                  fontSize: 14,
                  fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                  automaticLayout: true,
                  tabSize: 2,
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                  bracketPairColorization: { enabled: true },
                  guides: { indentation: true, bracketPairs: true },
                  renderLineHighlight: 'all',
                  scrollBeyondLastLine: false,
                  padding: { top: 8 },
                }}
              />
            ) : (
              <div style={{ ...centerStyle, flexDirection: 'column', gap: 10, color: '#6a6a6a' }}>
                <Files size={56} strokeWidth={1} />
                <div style={{ fontSize: 13 }}>Open a file from the Explorer to start editing</div>
                <div style={{ fontSize: 12, lineHeight: 1.9, textAlign: 'center' }}>
                  <Kbd>Ctrl</Kbd> + <Kbd>S</Kbd> Save &nbsp; <Kbd>Ctrl</Kbd> + <Kbd>B</Kbd> Sidebar &nbsp; <Kbd>Ctrl</Kbd> + <Kbd>`</Kbd> Terminal
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom panel: Problems + Terminal */}
        <div style={{ ...terminalPanelStyle, display: terminalOpen ? 'grid' : 'none' }}>
          <div style={resizeHandleStyle} onMouseDown={startResize} title="Drag to resize" />
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <button style={{ ...panelTabStyle, ...(panelView === 'problems' ? panelTabActiveStyle : {}) }} onClick={() => setPanelView('problems')}>
                Problems
                {problems.length > 0 && <span style={countBadgeStyle}>{problems.length}</span>}
              </button>
              <button style={{ ...panelTabStyle, ...(panelView === 'terminal' ? panelTabActiveStyle : {}) }} onClick={() => setPanelView('terminal')}>Terminal</button>
              <span style={{ fontSize: 11, color: '#8b8b8b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{runtimeStatus}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#3fb950', fontSize: 12 }}>$</span>
              <input
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runProject() }}
                placeholder="command to run (node, npm, python, pip)"
                spellCheck={false}
                style={commandInputStyle}
              />
              <button onClick={runProject} style={runButtonStyle} title="Run the command in a new terminal tab"><Play size={12} /> Run</button>
              {serverUrl && <a href={serverUrl} target="_blank" rel="noreferrer" style={previewLinkStyle}>Open Preview ↗</a>}
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <button style={miniIconStyle} title="New terminal" onClick={(e) => { e.stopPropagation(); setNewMenu((o) => !o) }}><Plus size={16} /></button>
                {newMenu && (
                  <div style={{ ...menuStyle, position: 'absolute', right: 0, top: 26, minWidth: 170 }} onClick={(e) => e.stopPropagation()}>
                    <MenuItem label="JavaScript (jsh)" onClick={() => { setNewMenu(false); newTerminal('shell') }} />
                    <MenuItem label="Python" onClick={() => { setNewMenu(false); newTerminal('python') }} />
                  </div>
                )}
              </span>
              <button
                style={miniIconStyle}
                title={panelView === 'problems' ? 'Clear problems' : 'Clear terminal'}
                onClick={() => (panelView === 'problems' ? setProblems([]) : sessions.current.get(activeTerm)?.term.clear())}
              >
                <Trash2 size={14} />
              </button>
              <button style={miniIconStyle} title="Close panel (Ctrl+`)" onClick={() => setTerminalOpen(false)}><X size={15} /></button>
            </div>
          </div>

          {/* Problems list */}
          <div style={{ minHeight: 0, overflowY: 'auto', background: '#1e1e1e', display: panelView === 'problems' ? 'block' : 'none' }}>
            {problems.length === 0 ? (
              <div style={{ padding: 16, color: '#8b8b8b', fontSize: 13 }}>No problems detected. Errors printed by your terminals show up here.</div>
            ) : problems.slice().reverse().map((p) => (
              <div
                key={p.id}
                onClick={() => goToProblem(p)}
                style={{ ...problemRowStyle, cursor: p.path ? 'pointer' : 'default' }}
              >
                <AlertCircle size={15} color="#f48771" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{p.message}</span>
                <span style={{ color: '#8b8b8b', fontSize: 12, flexShrink: 0 }}>
                  {p.path ? `${p.path}${p.line ? `:${p.line}` : ''}` : p.source}
                </span>
              </div>
            ))}
          </div>

          {/* Terminals: one xterm per tab, side list to switch between them */}
          <div style={{ minHeight: 0, display: panelView === 'terminal' ? 'grid' : 'none', gridTemplateColumns: 'minmax(0, 1fr) auto', background: '#1e1e1e' }}>
            <div style={{ position: 'relative', minHeight: 0, padding: '4px 0 0 12px' }}>
              {termTabs.length === 0 && <div style={{ padding: 16, color: '#8b8b8b', fontSize: 13 }}>No terminal open. Click + to start a shell.</div>}
              {termTabs.map((tab) => (
                <div
                  key={tab.id}
                  ref={(el) => { termEls.current[tab.id] = el }}
                  style={{ position: 'absolute', inset: '4px 0 0 12px', display: tab.id === activeTerm ? 'block' : 'none' }}
                  onClick={() => sessions.current.get(tab.id)?.term.focus()}
                />
              ))}
            </div>
            {termTabs.length > 0 && (
              <div style={terminalListStyle}>
                {termTabs.map((tab) => (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTerm(tab.id)}
                    style={{ ...terminalListItemStyle, background: tab.id === activeTerm ? '#37373d' : 'transparent', color: tab.id === activeTerm ? '#fff' : '#bbbbbb' }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: tab.status === 'failed' ? '#f14c4c' : tab.status === 'done' || tab.status === 'idle' ? '#3fb950' : tab.status === 'running' ? '#e2c08d' : '#6a6a6a' }} />
                    {tab.kind === 'python'
                      ? <span style={{ color: '#5aa9e6', fontSize: 9, fontWeight: 800, width: 13, textAlign: 'center', flexShrink: 0 }}>PY</span>
                      : <TerminalSquare size={13} style={{ flexShrink: 0 }} />}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.title}</span>
                    <button style={miniIconStyle} title="Kill terminal" onClick={(e) => { e.stopPropagation(); closeTerminal(tab.id) }}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Context menu */}
      {menu && (
        <div style={{ ...menuStyle, left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.node.type === 'folder' ? (
            <>
              <MenuItem label="New File" onClick={() => { setMenu(null); startNew('new-file', menu.node.path) }} />
              <MenuItem label="New Folder" onClick={() => { setMenu(null); startNew('new-folder', menu.node.path) }} />
            </>
          ) : (
            <>
              <MenuItem label="Rename" hint="F2" onClick={() => { setMenu(null); setEditing({ kind: 'rename', path: menu.node.path }) }} />
              <MenuItem label="Duplicate" onClick={() => { setMenu(null); duplicateFile(menu.node.path) }} />
              <MenuItem label="Delete" hint="Del" danger onClick={() => { setMenu(null); removeFile(menu.node.path) }} />
            </>
          )}
        </div>
      )}

      {dirtyCount > 0 && <div style={{ position: 'absolute', left: -9999 }} aria-live="polite">{dirtyCount} unsaved</div>}
    </div>
  )
}

/* ───────────────────────────── tree ───────────────────────────── */

interface TreeCtx {
  expanded: Set<string>
  activePath: string
  editing: Editing
  onToggle: (path: string) => void
  onOpen: (path: string) => void
  onCommit: (value: string) => void
  onCancel: () => void
  onContext: (e: ReactMouseEvent, node: TreeNode) => void
}

function TreeRows({ node, depth, ctx }: { node: TreeNode; depth: number; ctx: TreeCtx }) {
  const creating = ctx.editing && ctx.editing.kind !== 'rename' && ctx.editing.parent === node.path ? ctx.editing : null
  return (
    <div style={{ position: 'relative' }}>
      {depth > 0 && <div style={{ position: 'absolute', left: 14 + (depth - 1) * 12 + 1, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.08)' }} />}
      {creating && creating.kind === 'new-folder' && (
        <InlineInput depth={depth} icon={<Folder size={15} color="#dcb67a" />} initial="" onCommit={ctx.onCommit} onCancel={ctx.onCancel} />
      )}
      {node.children.map((child) => child.type === 'folder'
        ? <FolderRow key={`d-${child.path}`} node={child} depth={depth} ctx={ctx} />
        : <FileRow key={`f-${child.path}`} node={child} depth={depth} ctx={ctx} />)}
      {creating && creating.kind === 'new-file' && (
        <InlineInput depth={depth} icon={<FileIcon size={14} color="#8b949e" />} initial="" onCommit={ctx.onCommit} onCancel={ctx.onCancel} />
      )}
    </div>
  )
}

function FolderRow({ node, depth, ctx }: { node: TreeNode; depth: number; ctx: TreeCtx }) {
  const open = ctx.expanded.has(node.path)
  const [hover, setHover] = useState(false)
  return (
    <div>
      <div
        onClick={() => ctx.onToggle(node.path)}
        onContextMenu={(e) => ctx.onContext(e, node)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ ...rowStyle, paddingLeft: 6 + depth * 12, background: hover ? '#2a2d2e' : 'transparent' }}
      >
        {open ? <ChevronDown size={16} color="#c5c5c5" /> : <ChevronRight size={16} color="#c5c5c5" />}
        {open ? <FolderOpen size={15} color="#dcb67a" /> : <Folder size={15} color="#dcb67a" />}
        <span style={rowLabelStyle}>{node.name}</span>
      </div>
      {open && <TreeRows node={node} depth={depth + 1} ctx={ctx} />}
    </div>
  )
}

function FileRow({ node, depth, ctx }: { node: TreeNode; depth: number; ctx: TreeCtx }) {
  const [hover, setHover] = useState(false)
  const active = ctx.activePath === node.path
  const badge = badgeFor(node.name)
  if (ctx.editing && ctx.editing.kind === 'rename' && ctx.editing.path === node.path) {
    return <InlineInput depth={depth} icon={badge ? <span style={{ color: badge.color, fontSize: 9, fontWeight: 800, width: 15, textAlign: 'center' }}>{badge.label}</span> : <FileIcon size={14} color="#8b949e" />} initial={node.name} onCommit={ctx.onCommit} onCancel={ctx.onCancel} />
  }
  return (
    <div
      onClick={() => ctx.onOpen(node.path)}
      onContextMenu={(e) => ctx.onContext(e, node)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={node.path}
      style={{ ...rowStyle, paddingLeft: 22 + depth * 12, background: active ? '#37373d' : hover ? '#2a2d2e' : 'transparent', color: active ? '#fff' : '#cccccc' }}
    >
      {badge
        ? <span style={{ color: badge.color, fontSize: 9, fontWeight: 800, width: 15, textAlign: 'center', flexShrink: 0 }}>{badge.label}</span>
        : <FileIcon size={14} color="#8b949e" style={{ flexShrink: 0 }} />}
      <span style={rowLabelStyle}>{node.name}</span>
    </div>
  )
}

function InlineInput({ depth, icon, initial, onCommit, onCancel }: { depth: number; icon: ReactNode; initial: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    const dot = initial.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])
  return (
    <div style={{ ...rowStyle, paddingLeft: 22 + depth * 12, cursor: 'text' }}>
      {icon}
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') onCommit(value)
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={onCancel}
        spellCheck={false}
        style={inlineInputStyle}
      />
    </div>
  )
}

/* ───────────────────────── small pieces ───────────────────────── */

function ActivityButton({ title, active, onClick, children }: { title: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{ ...activityButtonStyle, color: active ? '#fff' : '#858585', borderLeft: active ? '2px solid #fff' : '2px solid transparent' }}>
      {children}
    </button>
  )
}

function MenuItem({ label, hint, danger, onClick }: { label: string; hint?: string; danger?: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', justifyContent: 'space-between', gap: 28, padding: '5px 14px', fontSize: 13, cursor: 'pointer', background: hover ? '#094771' : 'transparent', color: danger ? '#f48771' : '#cccccc' }}
    >
      <span>{label}</span>
      {hint && <span style={{ color: '#8b8b8b', fontSize: 12 }}>{hint}</span>}
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd style={{ background: '#2d2d2d', border: '1px solid #3c3c3c', borderRadius: 4, padding: '1px 6px', fontSize: 11, color: '#cccccc', fontFamily: 'inherit' }}>{children}</kbd>
}

/* ───────────────────────────── styles ───────────────────────────── */

const FONT = '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'

const ideStyle: CSSProperties = { position: 'relative', height: '100%', display: 'grid', minHeight: 0, background: '#1e1e1e', fontFamily: FONT, transition: 'grid-template-columns .15s' }
const centerStyle: CSSProperties = { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b8b8b', fontSize: 13, background: '#1e1e1e' }
const activityBarStyle: CSSProperties = { background: '#333333', display: 'flex', flexDirection: 'column', alignItems: 'stretch', paddingTop: 4 }
const activityButtonStyle: CSSProperties = { height: 48, background: 'transparent', border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer' }
const explorerStyle: CSSProperties = { background: '#252526', flexDirection: 'column', minWidth: 0, overflow: 'hidden', outline: 'none', color: '#cccccc' }
const explorerTitleStyle: CSSProperties = { height: 35, display: 'flex', alignItems: 'center', padding: '0 20px', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: '#bbbbbb' }
const workspaceRowStyle: CSSProperties = { height: 22, display: 'flex', alignItems: 'center', gap: 2, padding: '0 8px 0 2px', cursor: 'pointer', color: '#cccccc', background: '#252526', borderTop: '1px solid #2b2b2b' }
const rowStyle: CSSProperties = { height: 22, display: 'flex', alignItems: 'center', gap: 5, paddingRight: 8, cursor: 'pointer', fontSize: 13, color: '#cccccc', userSelect: 'none' }
const rowLabelStyle: CSSProperties = { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const inlineInputStyle: CSSProperties = { flex: 1, minWidth: 0, height: 20, background: '#3c3c3c', color: '#fff', border: '1px solid #007fd4', outline: 'none', fontSize: 13, fontFamily: FONT, padding: '0 4px' }
const miniIconStyle: CSSProperties = { background: 'transparent', border: 'none', color: '#c5c5c5', cursor: 'pointer', display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 4 }
const mainColumnStyle: CSSProperties = { display: 'grid', minWidth: 0, minHeight: 0 }
const tabBarStyle: CSSProperties = { display: 'flex', alignItems: 'stretch', background: '#252526', overflowX: 'auto' }
const tabStyle: CSSProperties = { height: 35, minWidth: 110, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 0 12px', color: '#969696', background: '#2d2d2d', borderRight: '1px solid #252526', borderTop: '1px solid transparent', cursor: 'pointer', fontSize: 13, flexShrink: 0 }
const activeTabStyle: CSSProperties = { background: '#1e1e1e', color: '#ffffff', borderTop: '1px solid #007acc' }
const tabCloseStyle: CSSProperties = { width: 18, height: 18, border: 'none', background: 'transparent', color: 'inherit', display: 'grid', placeItems: 'center', cursor: 'pointer', borderRadius: 4, marginLeft: 4 }
const breadcrumbStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 12px', background: '#1e1e1e', fontSize: 12 }
const terminalPanelStyle: CSSProperties = { position: 'relative', minHeight: 0, borderTop: '1px solid #3c3c3c', background: '#1e1e1e', gridTemplateRows: '35px minmax(0, 1fr)' }
const resizeHandleStyle: CSSProperties = { position: 'absolute', top: -3, left: 0, right: 0, height: 6, cursor: 'row-resize', zIndex: 5 }
const panelHeaderStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 12px', background: '#1e1e1e' }
const panelTabStyle: CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, color: '#8b8b8b', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', height: 34, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: 0 }
const panelTabActiveStyle: CSSProperties = { color: '#e7e7e7', borderBottom: '1px solid #e7e7e7' }
const countBadgeStyle: CSSProperties = { background: '#4d4d4d', color: '#fff', borderRadius: 999, fontSize: 10, padding: '1px 6px', textTransform: 'none' }
const problemRowStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 14px', fontSize: 13, color: '#cccccc', borderBottom: '1px solid #2b2b2b' }
const terminalListStyle: CSSProperties = { width: 170, borderLeft: '1px solid #3c3c3c', overflowY: 'auto', background: '#1e1e1e', paddingTop: 4 }
const terminalListItemStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', fontSize: 12, cursor: 'pointer' }
const commandInputStyle: CSSProperties = { width: 260, height: 24, background: '#3c3c3c', border: '1px solid #3c3c3c', borderRadius: 3, color: '#cccccc', fontSize: 12, fontFamily: 'Menlo, Monaco, Consolas, monospace', padding: '0 8px', outline: 'none' }
const runButtonStyle: CSSProperties = { height: 24, display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', borderRadius: 3, background: '#0e639c', color: '#fff', fontSize: 12, padding: '0 10px', cursor: 'pointer' }
const previewLinkStyle: CSSProperties = { fontSize: 12, color: '#3794ff', textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: 4 }
const menuStyle: CSSProperties = { position: 'fixed', zIndex: 100, minWidth: 190, background: '#252526', border: '1px solid #454545', borderRadius: 5, boxShadow: '0 4px 18px rgba(0,0,0,0.5)', padding: '4px 0', fontFamily: FONT }