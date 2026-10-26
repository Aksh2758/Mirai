"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import CodeEditorPanel from "@/components/studio/lab/CodeEditorPanel"
import AIAssistantSidebar from "@/components/studio/lab/AIAssistantSidebar"
import AlgorithmVisualizer from "@/components/studio/lab/AlgorithmVisualizer"
import ProjectExplorer from "@/components/studio/lab/ProjectExplorer"
import { useLabStore } from "@/components/studio/lab/store"
import {
  STUDIO_PROJECTS,
  RUNNABLE_LANGUAGES,
  findFile,
  languageOf,
  openLocalFolder,
  addNode,
  hasEntry,
  createOnDisk,
  saveToDisk,
  SCRATCH_LANGUAGES,
  SCRATCH_TEMPLATES,
  type StudioProject,
  type TreeNode,
} from "@/components/studio/lab/projects"
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle, usePanelRef } from "react-resizable-panels"
import { Code2, Cpu } from "lucide-react"

const baseName = (path: string) => path.split("/").pop() ?? path

export default function StudioPage() {
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [tabs, setTabs] = useState<string[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  // Edited contents, keyed `${projectId}:${path}`; untouched files fall back to their starter content
  const [edits, setEdits] = useState<Record<string, string>>({})

  const { struggleScore, setStruggleScore, executionTrigger, triggerExecution } = useLabStore()
  const [lastKeystrokeTime, setLastKeystrokeTime] = useState(Date.now())
  const [isExecuting, setIsExecuting] = useState(false)
  const outputPanelRef = usePanelRef()

  const [projects, setProjects] = useState<StudioProject[]>(STUDIO_PROJECTS)
  const [explorerError, setExplorerError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const openProject = projects.find(p => p.id === openProjectId) ?? null
  const activeNode = openProject && activePath ? findFile(openProject.tree, activePath) : null
  const editKey = openProject && activePath ? `${openProject.id}:${activePath}` : null
  // With no file open the editor is a scratchpad: pick a language, get its starter code
  const [scratchLang, setScratchLang] = useState("html")
  const [scratchCode, setScratchCode] = useState(SCRATCH_TEMPLATES.html)
  const isScratch = !activeNode
  const code = isScratch ? scratchCode : (edits[editKey!] ?? activeNode.content)
  const language = isScratch ? scratchLang : languageOf(activeNode.name)
  const canRun = isScratch || RUNNABLE_LANGUAGES.includes(language)

  const handleScratchLanguage = (id: string) => {
    setScratchLang(id)
    setScratchCode(SCRATCH_TEMPLATES[id] ?? "")
  }

  // Run only when Run is pressed, not for the counter value persisted from a previous session
  const initialTrigger = useRef(executionTrigger)
  useEffect(() => {
    if (executionTrigger > initialTrigger.current) {
      setIsExecuting(true)
    }
  }, [executionTrigger])

  const handleExecutionComplete = useCallback(() => setIsExecuting(false), [])

  const handleRun = () => {
    // A web page needs room; text output is fine in the short strip
    if (language === "html") outputPanelRef.current?.resize("60%")
    triggerExecution()
  }

  const handleOpenProject = (id: string) => {
    if (id === openProjectId) return
    setOpenProjectId(id)
    setTabs([])
    setActivePath(null)
  }

  const handleOpenFolder = async () => {
    setExplorerError(null)
    try {
      const project = await openLocalFolder()
      if (!project) return
      setProjects(prev => [...prev, project])
      handleOpenProject(project.id)
    } catch (e: any) {
      setExplorerError(`Couldn't open folder: ${e.message}`)
    }
  }

  const handleCreateProject = (name: string) => {
    setExplorerError(null)
    if (!name) return
    if (projects.some(p => p.name === name)) {
      setExplorerError(`A project named "${name}" already exists.`)
      return
    }
    const project: StudioProject = { id: `mem:${name}:${Date.now()}`, name, description: "Created in Studio (in the page)", tree: [] }
    setProjects(prev => [...prev, project])
    handleOpenProject(project.id)
  }

  // New file/folder inside the open project; written to disk too when the project came from a real folder
  const handleCreate = async (parentPath: string, kind: "file" | "folder", name: string) => {
    setExplorerError(null)
    if (!openProject || !name) return
    if (/[\\/]/.test(name) || name === "." || name === "..") {
      setExplorerError(`"${name}" isn't a valid name.`)
      return
    }
    if (hasEntry(openProject.tree, parentPath, name)) {
      setExplorerError(`"${name}" already exists there.`)
      return
    }
    try {
      if (openProject.handle) await createOnDisk(openProject.handle, parentPath, kind, name)
      const node: TreeNode = kind === "folder" ? { type: "folder", name, children: [] } : { type: "file", name, content: "" }
      setProjects(prev => prev.map(p => p.id === openProject.id ? { ...p, tree: addNode(p.tree, parentPath, node) } : p))
      if (kind === "file") handleOpenFile(parentPath ? `${parentPath}/${name}` : name)
    } catch (e: any) {
      setExplorerError(`Couldn't create "${name}": ${e.message}`)
    }
  }

  const handleSave = async () => {
    if (!openProject || !activePath) {
      setSaveStatus("Open a file to save")
    } else if (!openProject.handle) {
      setSaveStatus("In-page project: not saved to disk")
    } else {
      try {
        await saveToDisk(openProject.handle, activePath, code)
        setSaveStatus("Saved to disk")
      } catch (e: any) {
        setSaveStatus(`Save failed: ${e.message}`)
      }
    }
  }

  useEffect(() => {
    if (!saveStatus) return
    const timer = setTimeout(() => setSaveStatus(null), 3000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  const handleOpenFile = (path: string) => {
    setTabs(prev => (prev.includes(path) ? prev : [...prev, path]))
    setActivePath(path)
  }

  const handleCloseTab = (path: string) => {
    const idx = tabs.indexOf(path)
    const next = tabs.filter(t => t !== path)
    setTabs(next)
    if (path === activePath) setActivePath(next[Math.min(idx, next.length - 1)] ?? null)
  }

  const handleCodeChange = (val: string | undefined) => {
    if (isScratch) setScratchCode(val ?? "")
    else if (editKey) setEdits(prev => ({ ...prev, [editKey]: val ?? "" }))
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const now = Date.now()
      const latency = now - lastKeystrokeTime
      const original = isScratch ? SCRATCH_TEMPLATES[scratchLang] : activeNode?.content
      if (code.length > 0 && code !== original) {
        if (latency > 5000) {
          setStruggleScore(Math.min(100, struggleScore + 2))
        } else {
          setStruggleScore(Math.max(0, struggleScore - 1))
        }
      }
    }, 2000)
    setLastKeystrokeTime(Date.now())
    return () => clearTimeout(timer)
  }, [code])

  return (
    <div className="flex flex-col w-full h-screen bg-[#09090b] text-[#fafafa] overflow-y-auto lg:overflow-hidden relative">
      {/* Top Breadcrumb Bar */}
      <div className="h-14 flex-shrink-0 flex items-center px-8 bg-black/40 backdrop-blur-3xl border-b border-white/5 gap-6 z-40 relative">
        <div className="flex items-center gap-4">
           <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.1)]">
             <Code2 className="h-5 w-5 text-cyan-400" />
           </div>
           <div className="flex flex-col">
             <span className="text-[10px] font-black uppercase text-white tracking-[0.3em] leading-tight">Studio</span>
             <span className="text-[8px] font-mono text-slate-500 leading-tight uppercase tracking-widest mt-0.5">
               {openProject ? `${openProject.name}${activePath ? ` / ${activePath}` : ""}` : "Scratchpad"}
             </span>
           </div>
        </div>

        <div className="ml-auto flex items-center gap-8">
           <div className="flex items-center gap-6 pl-8 border-l border-white/5">
              <div className="flex flex-col items-end">
                <span className="text-[8px] font-black uppercase text-slate-500 tracking-[0.2em]">Neural Sync State</span>
                <div className="flex items-center gap-3 mt-1">
                  <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full ${struggleScore > 60 ? 'bg-gradient-to-r from-rose-500 to-magenta-500' : 'bg-gradient-to-r from-cyan-500 to-blue-500'}`}
                      animate={{ width: `${struggleScore}%` }}
                      transition={{ type: "spring", stiffness: 50 }}
                    />
                  </div>
                  <span className={`text-[10px] font-mono font-black ${struggleScore > 60 ? 'text-rose-400' : 'text-cyan-400'}`}>
                    {struggleScore}%
                  </span>
                </div>
              </div>
              <div className={`p-2 rounded-lg ${struggleScore > 60 ? 'bg-rose-500/10' : 'bg-cyan-500/10'} transition-colors`}>
                <Cpu className={`h-5 w-5 ${struggleScore > 60 ? 'text-rose-400 animate-pulse' : 'text-cyan-400'}`} />
              </div>
           </div>
        </div>
      </div>

      {/* Vertical Studio Rail + 3-Column Layout */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* The Actual Panel System */}
        <PanelGroup orientation="horizontal" className="flex-1 min-w-0">

          {/* Column A: Projects + file tree */}
          <Panel defaultSize="20%" minSize="14%" maxSize="35%" id="explorer-panel">
            <div className="h-full border-r border-white/5 overflow-hidden">
              <ProjectExplorer
                projects={projects}
                openProject={openProject}
                activePath={activePath}
                error={explorerError}
                onOpenProject={handleOpenProject}
                onOpenFile={handleOpenFile}
                onOpenFolder={handleOpenFolder}
                onCreateProject={handleCreateProject}
                onCreate={handleCreate}
              />
            </div>
          </Panel>

          <CustomResizeHandle />

          {/* Column B: Editor on top, output terminal below */}
          <Panel defaultSize="55%" minSize="30%" id="editor-panel">
            <PanelGroup orientation="vertical" className="h-full">
              <Panel defaultSize="68%" minSize="25%" id="editor-top">
                <div className="h-full bg-[#0a0a0a]/50 flex min-w-0 overflow-hidden">
                  <CodeEditorPanel
                    code={code}
                    language={language}
                    scratch={isScratch ? { languages: SCRATCH_LANGUAGES, onLanguageChange: handleScratchLanguage } : undefined}
                    tabs={tabs.map(path => ({ path, name: baseName(path) }))}
                    activePath={activePath}
                    canRun={canRun}
                    onChange={handleCodeChange}
                    onSelectTab={setActivePath}
                    onCloseTab={handleCloseTab}
                    onRun={handleRun}
                    onSave={handleSave}
                    status={saveStatus}
                  />
                </div>
              </Panel>

              <CustomResizeHandle vertical />

              <Panel defaultSize="32%" minSize="10%" id="output-panel" panelRef={outputPanelRef}>
                <div className="h-full border-t border-white/5 overflow-hidden">
                  <AlgorithmVisualizer
                    code={code}
                    language={language}
                    isExecuting={isExecuting}
                    onExecutionComplete={handleExecutionComplete}
                  />
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          <CustomResizeHandle />

          {/* Column C: AI copilot */}
          <Panel defaultSize="25%" minSize="20%" maxSize="40%" id="copilot-panel">
            <div className="h-full border-l border-white/5 overflow-hidden">
              <AIAssistantSidebar
                code={code}
                language={language}
                fileName={activePath ? baseName(activePath) : "Scratchpad"}
              />
            </div>
          </Panel>

        </PanelGroup>
      </div>

    </div>
  )
}

function CustomResizeHandle({ vertical = false }: { vertical?: boolean }) {
  return (
    <PanelResizeHandle
      className={`${vertical ? "h-0.5 w-full" : "w-0.5 h-full"} bg-white/5 hover:bg-indigo-500/30 transition-all duration-300 group relative active:bg-indigo-500`}
    />
  )
}
