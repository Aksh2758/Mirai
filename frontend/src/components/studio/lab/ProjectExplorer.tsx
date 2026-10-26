"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, FileCode2, FilePlus, Folder, FolderOpen, FolderGit2, FolderPlus } from "lucide-react"
import { canOpenLocalFolder, type StudioProject, type TreeNode } from "./projects"

type CreateKind = "file" | "folder" | "project"
type Creating = { parentPath: string; kind: CreateKind } | null

interface ProjectExplorerProps {
  projects: StudioProject[]
  openProject: StudioProject | null
  activePath: string | null
  error: string | null
  onOpenProject: (id: string) => void
  onOpenFile: (path: string) => void
  onOpenFolder: () => void
  onCreateProject: (name: string) => void
  onCreate: (parentPath: string, kind: "file" | "folder", name: string) => void
}

export default function ProjectExplorer({ projects, openProject, activePath, error, onOpenProject, onOpenFile, onOpenFolder, onCreateProject, onCreate }: ProjectExplorerProps) {
  // Checked after mount so server and client render the same markup
  const [folderSupported, setFolderSupported] = useState(false)
  useEffect(() => setFolderSupported(canOpenLocalFolder()), [])
  const [creating, setCreating] = useState<Creating>(null)

  const submit = (name: string) => {
    if (!creating) return
    if (creating.kind === "project") onCreateProject(name)
    else onCreate(creating.parentPath, creating.kind, name)
    setCreating(null)
  }

  return (
    <div className="flex flex-col h-full bg-[#020308] min-w-0 overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">
        <span>Projects</span>
        <span className="flex items-center gap-1 normal-case tracking-normal">
          <button
            onClick={() => setCreating({ parentPath: "", kind: "project" })}
            title="New project (in the page)"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-emerald-400 hover:bg-emerald-500/10 font-semibold text-[11px]"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New
          </button>
          <button
            onClick={onOpenFolder}
            disabled={!folderSupported}
            title={folderSupported ? "Open a folder from your computer" : "Needs Chrome or Edge"}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-30 disabled:cursor-not-allowed font-semibold text-[11px]"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Open
          </button>
        </span>
      </div>
      {error && <p className="px-5 pb-2 text-[11px] text-rose-400">{error}</p>}
      <div className="px-3 pb-3 space-y-1 border-b border-white/5 max-h-[40%] overflow-y-auto scrollbar-hide">
        {creating?.kind === "project" && (
          <NameInput placeholder="Project name" onSubmit={submit} onCancel={() => setCreating(null)} />
        )}
        {projects.map(p => {
          const isOpen = openProject?.id === p.id
          return (
            <button
              key={p.id}
              onClick={() => onOpenProject(p.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                isOpen ? "bg-cyan-500/10 border border-cyan-500/20" : "border border-transparent hover:bg-white/5"
              }`}
            >
              <FolderGit2 className={`h-4 w-4 shrink-0 ${isOpen ? "text-cyan-400" : "text-slate-500"}`} />
              <span className="min-w-0">
                <span className={`block text-[12px] font-semibold truncate ${isOpen ? "text-white" : "text-slate-300"}`}>{p.name}</span>
                <span className="block text-[10px] text-slate-500 truncate">{p.description}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">
        <span className="truncate">{openProject ? `Files — ${openProject.name}` : "Files"}</span>
        {openProject && (
          <span className="flex items-center gap-0.5 shrink-0">
            <IconButton label="New file" onClick={() => setCreating({ parentPath: "", kind: "file" })}><FilePlus className="h-3.5 w-3.5" /></IconButton>
            <IconButton label="New folder" onClick={() => setCreating({ parentPath: "", kind: "folder" })}><FolderPlus className="h-3.5 w-3.5" /></IconButton>
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-hide">
        {openProject ? (
          <Tree
            nodes={openProject.tree}
            parentPath=""
            depth={0}
            activePath={activePath}
            creating={creating}
            onOpenFile={onOpenFile}
            onStartCreate={setCreating}
            onSubmit={submit}
            onCancel={() => setCreating(null)}
          />
        ) : (
          <p className="px-3 text-[11px] text-slate-600 leading-relaxed">Pick a project above, create one with New, or use Open to load a folder from your computer.</p>
        )}
      </div>
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={label}
      aria-label={label}
      className="p-1 rounded text-slate-500 hover:text-white hover:bg-white/10"
    >
      {children}
    </button>
  )
}

function NameInput({ placeholder, depth = 0, onSubmit, onCancel }: {
  placeholder: string
  depth?: number
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  return (
    <div style={{ paddingLeft: 12 + depth * 14 }} className="py-1 pr-2">
      <input
        autoFocus
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit(e.currentTarget.value.trim())
          if (e.key === "Escape") onCancel()
        }}
        onBlur={onCancel}
        className="w-full px-2 py-1 text-[12px] bg-[#050508] border border-cyan-500/40 rounded outline-none text-white placeholder:text-slate-600"
      />
    </div>
  )
}

interface TreeProps {
  nodes: TreeNode[]
  parentPath: string
  depth: number
  activePath: string | null
  creating: Creating
  onOpenFile: (path: string) => void
  onStartCreate: (c: Creating) => void
  onSubmit: (name: string) => void
  onCancel: () => void
}

function Tree({ nodes, parentPath, depth, activePath, creating, onOpenFile, onStartCreate, onSubmit, onCancel }: TreeProps) {
  // VS Code order: folders first, then files, each alphabetical
  const sorted = [...nodes].sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1
  )
  const creatingHere = creating && creating.kind !== "project" && creating.parentPath === parentPath
  return (
    <ul>
      {creatingHere && (
        <li>
          <NameInput placeholder={creating.kind === "folder" ? "Folder name" : "File name"} depth={depth} onSubmit={onSubmit} onCancel={onCancel} />
        </li>
      )}
      {sorted.map(node => {
        const path = parentPath ? `${parentPath}/${node.name}` : node.name
        return node.type === "folder" ? (
          <FolderRow
            key={path}
            node={node}
            path={path}
            depth={depth}
            activePath={activePath}
            creating={creating}
            onOpenFile={onOpenFile}
            onStartCreate={onStartCreate}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        ) : (
          <li key={path}>
            <button
              onClick={() => onOpenFile(path)}
              style={{ paddingLeft: 12 + depth * 14 }}
              className={`w-full flex items-center gap-2 py-1 pr-3 rounded text-left text-[12px] transition-colors ${
                activePath === path ? "bg-cyan-500/15 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="truncate">{node.name}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function FolderRow({ node, path, depth, activePath, creating, onOpenFile, onStartCreate, onSubmit, onCancel }: Omit<TreeProps, "nodes" | "parentPath"> & {
  node: Extract<TreeNode, { type: "folder" }>
  path: string
}) {
  const [expanded, setExpanded] = useState(true)
  const creatingInside = creating && creating.kind !== "project" && creating.parentPath === path
  const startCreate = (kind: "file" | "folder") => {
    setExpanded(true)
    onStartCreate({ parentPath: path, kind })
  }
  return (
    <li>
      <div className="group flex items-center pr-2 rounded hover:bg-white/5">
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ paddingLeft: 4 + depth * 14 }}
          className="flex-1 min-w-0 flex items-center gap-1.5 py-1 text-left text-[12px] text-slate-300"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          {expanded ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-cyan-400/70" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-cyan-400/70" />}
          <span className="truncate">{node.name}</span>
        </button>
        <span className="hidden group-hover:flex items-center shrink-0">
          <IconButton label="New file here" onClick={() => startCreate("file")}><FilePlus className="h-3.5 w-3.5" /></IconButton>
          <IconButton label="New folder here" onClick={() => startCreate("folder")}><FolderPlus className="h-3.5 w-3.5" /></IconButton>
        </span>
      </div>
      {expanded && (node.children.length === 0 && !creatingInside ? (
        <p style={{ paddingLeft: 36 + depth * 14 }} className="py-1 text-[11px] italic text-slate-600">Empty</p>
      ) : (
        <Tree
          nodes={node.children}
          parentPath={path}
          depth={depth + 1}
          activePath={activePath}
          creating={creating}
          onOpenFile={onOpenFile}
          onStartCreate={onStartCreate}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      ))}
    </li>
  )
}
