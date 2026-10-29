// File and folder helpers used for workspaces opened from the user's computer.

export type FileNode = { type: "file"; name: string; content: string }
export type FolderNode = { type: "folder"; name: string; children: TreeNode[] }
export type TreeNode = FileNode | FolderNode

export interface StudioProject {
  id: string
  name: string
  description: string
  tree: TreeNode[]
  /** Set for folders opened from disk (a FileSystemDirectoryHandle); edits can be written back through it. */
  handle?: any
}

const file = (name: string, content: string): FileNode => ({ type: "file", name, content })
const folder = (name: string, children: TreeNode[]): FolderNode => ({ type: "folder", name, children })

const LANGUAGE_BY_EXT: Record<string, string> = {
  py: "python",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  c: "c",
  h: "c",
  hpp: "cpp",
  txt: "plaintext",
  go: "go",
  rs: "rust",
  php: "php",
  rb: "ruby",
  cs: "csharp",
  kt: "kotlin",
  sh: "shell",
  yml: "yaml",
  yaml: "yaml",
  xml: "xml",
  sql: "sql",
  scss: "scss",
  cpp: "cpp",
  java: "java",
  html: "html",
  css: "css",
  md: "markdown",
}

// Only these have a runner behind the Execute button.
export const RUNNABLE_LANGUAGES = ["python", "javascript", "typescript", "cpp", "java", "html"]

export function languageOf(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
  return LANGUAGE_BY_EXT[ext] ?? "plaintext"
}

export function findFile(tree: TreeNode[], path: string): FileNode | null {
  const [head, ...rest] = path.split("/")
  for (const node of tree) {
    if (node.name !== head) continue
    if (node.type === "file") return rest.length === 0 ? node : null
    if (rest.length > 0) return findFile(node.children, rest.join("/"))
  }
  return null
}

// ---- Opening a folder from the user's disk (File System Access API, Chromium only) ----

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv", "venv"])
const BINARY_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "svgz", "pdf", "zip", "gz", "tar", "rar", "7z",
  "exe", "dll", "so", "dylib", "class", "jar", "o", "obj", "bin", "woff", "woff2", "ttf", "otf", "eot",
  "mp3", "mp4", "mov", "avi", "wav", "pyc", "lock", "map",
])
const MAX_FILES = 250
const MAX_FILE_BYTES = 120_000
const MAX_FOLDER_DEPTH = 10

export function canOpenLocalFolder(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window
}

async function readDirectory(dir: any, budget: { files: number }, depth = 0): Promise<TreeNode[]> {
  if (depth > MAX_FOLDER_DEPTH) return []
  const entries: Array<[string, any]> = []
  for await (const entry of dir.entries()) entries.push(entry)
  // Reading independent files in parallel makes opening ordinary source
  // folders much quicker than waiting on each disk handle one at a time.
  const nodes = await Promise.all(entries.map(async ([name, handle]): Promise<TreeNode | null> => {
    if (handle.kind === "directory") {
      if (SKIP_DIRS.has(name)) return null
      return folder(name, await readDirectory(handle, budget, depth + 1))
    }
    const ext = name.split(".").pop()?.toLowerCase() ?? ""
    if (BINARY_EXTS.has(ext) || budget.files <= 0) return null
    budget.files--
    const f: File = await handle.getFile()
    if (f.size > MAX_FILE_BYTES) return null
    const text = await f.text()
    if (text.slice(0, 2000).includes("\u0000")) return null
    return file(name, text)
  }))
  return nodes.filter((node): node is TreeNode => node !== null)
}

/** Shows the browser's folder picker and returns the folder as a project, or null if cancelled. */
export async function openLocalFolder(): Promise<StudioProject | null> {
  try {
    const dir = await (window as any).showDirectoryPicker({ mode: "readwrite" })
    const tree = await readDirectory(dir, { files: MAX_FILES })
    return {
      id: `local:${dir.name}:${Date.now()}`,
      name: dir.name,
      description: "Opened from your computer",
      tree,
      handle: dir,
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return null
    throw e
  }
}

// ---- Scratchpad: what the editor shows when no file is open ----

export const SCRATCH_LANGUAGES = [
  { id: "html", name: "HTML" },
  { id: "javascript", name: "JavaScript" },
  { id: "typescript", name: "TypeScript" },
  { id: "python", name: "Python" },
  { id: "cpp", name: "C++" },
  { id: "java", name: "Java" },
]

export const SCRATCH_TEMPLATES: Record<string, string> = {
  html: `<html>\n  <head>\n    <style>\n      body { background: #011627; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: 'Inter', sans-serif; }\n      .card { padding: 3rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 2rem; backdrop-filter: blur(20px); text-align: center; }\n      h1 { font-size: 3rem; color: #82aaff; font-weight: 800; }\n      p { color: #4b6479; text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.8rem; }\n    </style>\n  </head>\n  <body>\n    <div class="card">\n      <h1>Studio 3.0</h1>\n      <p>A-B-C Layout Active</p>\n    </div>\n  </body>\n</html>`,
  javascript: 'console.log("Mirai Engine: Unified Logic Stream Attached.");\n',
  typescript: 'const engine: string = "Mirai Core";\nconsole.log(`Running on ${engine} v3.0`);',
  python: 'print("Mirai Subsystem: Python Runtime Connected.")',
  cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello from Mirai" << std::endl;\n    return 0;\n}\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Mirai");\n    }\n}\n',
}

// ---- Creating and saving ----

function childrenAt(tree: TreeNode[], parentPath: string): TreeNode[] | null {
  if (!parentPath) return tree
  const [head, ...rest] = parentPath.split("/")
  const next = tree.find(n => n.type === "folder" && n.name === head)
  return next && next.type === "folder" ? childrenAt(next.children, rest.join("/")) : null
}

export function hasEntry(tree: TreeNode[], parentPath: string, name: string): boolean {
  return !!childrenAt(tree, parentPath)?.some(n => n.name === name)
}

/** Returns a new tree with `node` added inside `parentPath` ("" = project root). */
export function addNode(tree: TreeNode[], parentPath: string, node: TreeNode): TreeNode[] {
  if (!parentPath) return [...tree, node]
  const [head, ...rest] = parentPath.split("/")
  return tree.map(n =>
    n.type === "folder" && n.name === head ? { ...n, children: addNode(n.children, rest.join("/"), node) } : n
  )
}

async function dirAt(root: any, parentPath: string): Promise<any> {
  let dir = root
  for (const seg of parentPath.split("/").filter(Boolean)) dir = await dir.getDirectoryHandle(seg)
  return dir
}

async function writeText(fileHandle: any, content: string) {
  const w = await fileHandle.createWritable()
  await w.write(content)
  await w.close()
}

export async function createOnDisk(root: any, parentPath: string, kind: "file" | "folder", name: string) {
  const dir = await dirAt(root, parentPath)
  if (kind === "folder") await dir.getDirectoryHandle(name, { create: true })
  else await writeText(await dir.getFileHandle(name, { create: true }), "")
}

export async function saveToDisk(root: any, path: string, content: string) {
  const parts = path.split("/")
  const name = parts.pop()!
  const dir = await dirAt(root, parts.join("/"))
  await writeText(await dir.getFileHandle(name, { create: true }), content)
}

/** Save a virtual workspace file to the user's computer. Uses the native Save As
 * picker where available and a normal browser download as a fallback. */
export async function saveFileToComputer(path: string, content: string) {
  const fileName = path.split("/").pop() || "untitled.txt"
  const picker = (window as any).showSaveFilePicker
  if (picker) {
    const handle = await picker({ suggestedName: fileName })
    await writeText(handle, content)
    return
  }
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
