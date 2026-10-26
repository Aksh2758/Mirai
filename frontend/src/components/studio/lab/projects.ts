// Hard-coded Studio projects. Folders are `children` nodes; files carry their starter `content`.

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

export const STUDIO_PROJECTS: StudioProject[] = [
  {
    id: "playground",
    name: "Playground",
    description: "One starter file per language",
    tree: [
      file("hello.py", 'print("Mirai Subsystem: Python Runtime Connected.")\n'),
      file("app.js", 'console.log("Mirai Engine: Unified Logic Stream Attached.");\n'),
      file("app.ts", 'const engine: string = "Mirai Core";\nconsole.log(`Running on ${engine} v3.0`);\n'),
      file("main.cpp", '#include <iostream>\n\nint main() {\n    std::cout << "Hello from Mirai" << std::endl;\n    return 0;\n}\n'),
      file("Main.java", 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Mirai");\n    }\n}\n'),
      file("index.html", '<html>\n  <body style="background:#011627;color:white;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">\n    <h1>Studio 3.0</h1>\n  </body>\n</html>\n'),
    ],
  },
  {
    id: "algorithms",
    name: "Algorithms",
    description: "Classic DSA practice in Python",
    tree: [
      folder("sorting", [
        file("bubble_sort.py", "def bubble_sort(items):\n    items = list(items)\n    for i in range(len(items)):\n        for j in range(len(items) - i - 1):\n            if items[j] > items[j + 1]:\n                items[j], items[j + 1] = items[j + 1], items[j]\n    return items\n\nprint(bubble_sort([5, 2, 9, 1, 7]))\n"),
        file("README.md", "# Sorting\n\nImplement and compare sorting algorithms.\n"),
      ]),
      folder("searching", [
        file("binary_search.py", "def binary_search(items, target):\n    lo, hi = 0, len(items) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if items[mid] == target:\n            return mid\n        if items[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n\nprint(binary_search([1, 3, 5, 7, 9], 7))\n"),
      ]),
      file("main.py", 'print("Pick an algorithm from the sorting or searching folders.")\n'),
    ],
  },
  {
    id: "web-portfolio",
    name: "Web Portfolio",
    description: "HTML, CSS and JS starter",
    tree: [
      file("index.html", '<html>\n  <body style="font-family:sans-serif;background:#0b1020;color:#e2e8f0;padding:2rem">\n    <h1>My Portfolio</h1>\n    <p>Edit me in the Studio.</p>\n  </body>\n</html>\n'),
      folder("css", [file("style.css", "body {\n  margin: 0;\n  font-family: sans-serif;\n}\n")]),
      folder("js", [file("app.js", 'console.log("Portfolio loaded");\n')]),
    ],
  },
]

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
const MAX_FILES = 500
const MAX_FILE_BYTES = 200_000

export function canOpenLocalFolder(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window
}

async function readDirectory(dir: any, budget: { files: number }): Promise<TreeNode[]> {
  const nodes: TreeNode[] = []
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "directory") {
      if (SKIP_DIRS.has(name)) continue
      nodes.push(folder(name, await readDirectory(handle, budget)))
    } else {
      // Keep any text file; skip known binaries, oversized files and anything with NUL bytes
      const ext = name.split(".").pop()?.toLowerCase() ?? ""
      if (BINARY_EXTS.has(ext) || budget.files <= 0) continue
      const f: File = await handle.getFile()
      if (f.size > MAX_FILE_BYTES) continue
      const text = await f.text()
      if (text.slice(0, 2000).includes("\u0000")) continue
      budget.files--
      nodes.push(file(name, text))
    }
  }
  return nodes
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
