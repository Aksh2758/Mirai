"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import dynamic from "next/dynamic"
import { motion } from "framer-motion"
import Link from "next/link"
import { usePathname } from "next/navigation"
const CodeEditorPanel = dynamic(() => import("@/components/studio/lab/CodeEditorPanel"), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center bg-[#020308] text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Loading editor…</div>,
})
import AIAssistantSidebar from "@/components/studio/lab/AIAssistantSidebar"
import AlgorithmVisualizer from "@/components/studio/lab/AlgorithmVisualizer"
import { makeSuggestedTasks, TASK_LIBRARY_SIZE, toPythonLiteral, type SuggestedTask, type TaskCategory } from "@/components/studio/lab/taskCatalog"
import { useLabStore } from "@/components/studio/lab/store"
import {
  RUNNABLE_LANGUAGES,
  findFile,
  languageOf,
  openLocalFolder,
  saveFileToComputer,
  saveToDisk,
  addNode,
  createOnDisk,
  hasEntry,
  SCRATCH_LANGUAGES,
  SCRATCH_TEMPLATES,
  type StudioProject,
  type TreeNode,
} from "@/components/studio/lab/projects"
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle, usePanelRef } from "react-resizable-panels"
import { BriefcaseBusiness, Code2, Cpu, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Radar, Trophy, X } from "lucide-react"
import { fetchDashboardSummary, getProject } from "@/lib/api"
import type { DashboardSummary, Project } from "@/lib/types"

const baseName = (path: string) => path.split("/").pop() ?? path

const studioNavigation = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Studio", href: "/studio", icon: Code2 },
  { label: "Internships", href: "/discover/internships", icon: BriefcaseBusiness },
  { label: "Hackathons", href: "/discover/hackathons", icon: Trophy },
  { label: "Tech Radar", href: "/tech-radar", icon: Radar },
]

export default function StudioPage() {
  const pathname = usePathname()
  const [routedProjectId, setRoutedProjectId] = useState<string | null>(null)
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [tabs, setTabs] = useState<string[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  // Edited contents, keyed `${projectId}:${path}`; untouched files fall back to their starter content
  const [edits, setEdits] = useState<Record<string, string>>({})

  const { struggleScore, setStruggleScore, executionTrigger, triggerExecution } = useLabStore()
  const [lastKeystrokeTime, setLastKeystrokeTime] = useState(Date.now())
  const [isExecuting, setIsExecuting] = useState(false)
  const outputPanelRef = usePanelRef()

  const [projects, setProjects] = useState<StudioProject[]>([])
  const [workspaceStoreReady, setWorkspaceStoreReady] = useState(false)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [profile, setProfile] = useState<DashboardSummary["user"] | null>(null)
  const [learningMode, setLearningMode] = useState(true)
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(true)
  const [learningXp, setLearningXp] = useState(0)
  const [completedWork, setCompletedWork] = useState<string[]>([])
  const [completionMessage, setCompletionMessage] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<SuggestedTask | null>(null)
  const [customTasks, setCustomTasks] = useState<SuggestedTask[]>([])
  const [selectedBuildProject, setSelectedBuildProject] = useState<BuildProject | null>(null)
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null)
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

  useEffect(() => {
    setRoutedProjectId(new URLSearchParams(window.location.search).get("projectId"))
    setLearningMode(window.localStorage.getItem("mirai-learning-mode") !== "off" && window.localStorage.getItem("mirai-learning-mode") !== "build")
    try {
      const savedProjects = JSON.parse(window.localStorage.getItem("mirai-studio-workspaces") || "[]") as StudioProject[]
      const savedEdits = JSON.parse(window.localStorage.getItem("mirai-studio-edits") || "{}") as Record<string, string>
      const savedCustomTasks = JSON.parse(window.localStorage.getItem("mirai-studio-custom-tasks") || "[]") as SuggestedTask[]
      const savedCompletedWork = JSON.parse(window.localStorage.getItem("mirai-studio-completed-work") || "[]") as string[]
      const savedSelectedTask = JSON.parse(window.localStorage.getItem("mirai-studio-selected-task") || "null") as SuggestedTask | null
      const savedSelectedBuildProject = JSON.parse(window.localStorage.getItem("mirai-studio-selected-build-project") || "null") as BuildProject | null
      setLearningXp(Number(window.localStorage.getItem("mirai-studio-learning-xp") || 0))
      setCompletedWork(savedCompletedWork)
      setSelectedTask(savedSelectedTask)
      setSelectedBuildProject(savedSelectedBuildProject)
      if (savedSelectedTask || savedSelectedBuildProject) setIsSuggestionsOpen(false)
      setProjects(savedProjects.map(project => ({ ...project, handle: undefined })))
      setEdits(savedEdits)
      setCustomTasks(savedCustomTasks)
      setOpenProjectId(window.localStorage.getItem("mirai-studio-open-project"))
      const savedActivePath = window.localStorage.getItem("mirai-studio-active-file")
      setActivePath(savedActivePath)
      setTabs(savedActivePath ? [savedActivePath] : [])
    } catch {
      window.localStorage.removeItem("mirai-studio-workspaces")
      window.localStorage.removeItem("mirai-studio-edits")
    }
    setWorkspaceStoreReady(true)
    fetchDashboardSummary().then(summary => setProfile(summary.user)).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!workspaceStoreReady) return
    window.localStorage.setItem("mirai-studio-workspaces", JSON.stringify(projects.map(({ handle: _handle, ...project }) => project)))
    window.localStorage.setItem("mirai-studio-edits", JSON.stringify(edits))
    window.localStorage.setItem("mirai-studio-custom-tasks", JSON.stringify(customTasks))
    if (openProjectId) window.localStorage.setItem("mirai-studio-open-project", openProjectId)
    if (activePath) window.localStorage.setItem("mirai-studio-active-file", activePath)
  }, [projects, edits, customTasks, openProjectId, activePath, workspaceStoreReady])

  useEffect(() => {
    if (!routedProjectId) return
    setLearningMode(false)
    window.localStorage.setItem("mirai-learning-mode", "build")
    setProjectLoadError(null)
    getProject(routedProjectId).then(project => {
      const workspace = studioProjectFromRoadmap(project)
      setProjects(previous => [...previous.filter(item => item.id !== workspace.id), workspace])
      setOpenProjectId(workspace.id)
      const firstFile = project.code_files[0]?.filename || "index.html"
      setTabs([firstFile])
      setActivePath(firstFile)
      setSelectedTask(null)
      window.localStorage.removeItem("mirai-studio-selected-task")
      const roadmapProject = { title: project.title, brief: project.brief, tech: project.tech_stack, difficulty: project.difficulty, outcome: "Continue the active roadmap in the Studio workspace." }
      setSelectedBuildProject(roadmapProject)
      window.localStorage.setItem("mirai-studio-selected-build-project", JSON.stringify(roadmapProject))
    }).catch(error => setProjectLoadError(error instanceof Error ? error.message : "Could not load this roadmap project"))
  }, [routedProjectId])

  const skillList = Object.values(profile?.skill_scores ?? {}).sort((a, b) => a.score - b.score)
  const gapSkills = skillList.filter(skill => skill.score < 65).slice(0, 3).map(skill => skill.label)
  const psiScore = skillList.length ? Math.round(skillList.reduce((sum, skill) => sum + skill.score, 0) / skillList.length) : null
  const suggestedTasks = [...customTasks, ...makeSuggestedTasks(profile?.role ?? "Software Developer", profile?.level ?? "Beginner")]
  const suggestedProjects = makeBuildProjects(profile?.role ?? "Software Developer", profile?.level ?? "Beginner", skillList)

  const handleSelectTask = (task: SuggestedTask) => {
    setIsSuggestionsOpen(false)
    setSelectedTask(task)
    setSelectedBuildProject(null)
    window.localStorage.setItem("mirai-studio-selected-task", JSON.stringify(task))
    window.localStorage.removeItem("mirai-studio-selected-build-project")
    const filename = task.language === "javascript" ? "solution.js" : "solution.py"
    const starter = task.language === "javascript"
      ? `// ${task.title}\n// Topic: ${task.category} · ${task.skill}\n// Goal: ${task.goal}\n\nfunction solve(input) {\n  // TODO: Write the steps in plain language, then implement one step at a time.\n}\n\nconst input = ${task.example};\nconsole.log(solve(input));\n`
      : `# ${task.title}\n# Topic: ${task.category} · ${task.skill}\n# Goal: ${task.goal}\n\ndef solve(input_data):\n    # TODO: Write the steps in plain language, then implement one step at a time.\n    pass\n\ninput_data = ${toPythonLiteral(task.example)}\nprint(solve(input_data))\n`
    const readme = `# ${task.title}\n\n${task.goal}\n\n## Learn it\n1. Explain the input and expected output in your own words.\n2. Work through this example: ${task.example}.\n3. Implement one small step at a time, then run the file.\n4. Test an empty input and an edge case.\n\n## Hint\n${task.hint}\n\n## Your challenge\nDescribe the time complexity and add one more test case.\n`
    const project: StudioProject = { id: `task:${task.id}`, name: task.title, description: `${task.level} guided task · ${task.skill}`, tree: [{ type: "file", name: "README.md", content: readme }, { type: "file", name: filename, content: starter }] }
    setProjects(previous => previous.some(item => item.id === project.id) ? previous : [...previous, project])
    setOpenProjectId(project.id)
    setTabs([filename])
    setActivePath(filename)
  }

  const handleCreateCustomTopic = (topic: string) => {
    const cleanTopic = topic.trim()
    if (!cleanTopic) return
    const role = profile?.role ?? "Software Developer"
    const language: SuggestedTask["language"] = /data|machine|backend/i.test(role) ? "python" : "javascript"
    const task: SuggestedTask = {
      id: `custom-${Date.now()}`,
      title: `My topic: ${cleanTopic}`,
      skill: cleanTopic,
      level: (profile?.level ?? "Beginner") as SuggestedTask["level"],
      category: "Custom",
      goal: `Learn and practise ${cleanTopic}. Ask the mentor to first define a small exercise at your level, then guide you through the solution one step at a time.`,
      hint: `Start by asking the mentor what the core idea in ${cleanTopic} is. Then ask for a small practice problem, one hint at a time, and a test case.`,
      example: JSON.stringify(cleanTopic),
      language,
    }
    setCustomTasks(previous => [task, ...previous.filter(item => item.title !== task.title)].slice(0, 100))
    handleSelectTask(task)
  }

  const handleSelectBuildProject = (project: BuildProject) => {
    setSelectedTask(null)
    handleStartBuildProject(project)
  }

  const handleOpenFolder = async () => {
    try {
      const project = await openLocalFolder()
      if (!project) return
      setProjects(previous => [...previous.filter(item => item.id !== project.id), project])
      setOpenProjectId(project.id)
      setTabs([])
      setActivePath(null)
      setSelectedTask(null)
      setSelectedBuildProject(null)
      window.localStorage.removeItem("mirai-studio-selected-task")
      window.localStorage.removeItem("mirai-studio-selected-build-project")
    } catch (error) {
      setProjectLoadError(error instanceof Error ? error.message : "Could not open this folder")
    }
  }

  const handleCreateEntry = async (kind: "file" | "folder") => {
    if (!openProject) return
    const name = window.prompt(kind === "file" ? "New file name" : "New folder name", kind === "file" ? "untitled.js" : "src")?.trim()
    if (!name || name.includes("/") || name.includes("\\")) return
    if (hasEntry(openProject.tree, "", name)) {
      setProjectLoadError(`“${name}” already exists in this workspace`)
      return
    }
    try {
      if (openProject.handle) await createOnDisk(openProject.handle, "", kind, name)
      const node: TreeNode = kind === "folder"
        ? { type: "folder", name, children: [] }
        : { type: "file", name, content: "" }
      setProjects(previous => previous.map(project => project.id === openProject.id ? { ...project, tree: addNode(project.tree, "", node) } : project))
      if (kind === "file") handleOpenFile(name)
      setProjectLoadError(null)
    } catch (error) {
      setProjectLoadError(error instanceof Error ? error.message : `Could not create ${kind}`)
    }
  }

  const handleStartBuildProject = (project: BuildProject) => {
    setIsSuggestionsOpen(false)
    window.localStorage.removeItem("mirai-studio-selected-task")
    window.localStorage.setItem("mirai-studio-selected-build-project", JSON.stringify(project))
    const name = project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
    const filename = "index.html"
    const starter = `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${project.title}</title>\n</head>\n<body>\n  <main>\n    <h1>${project.title}</h1>\n    <p>${project.brief}</p>\n    <!-- Ask the mentor to build the first feature with you. -->\n  </main>\n</body>\n</html>\n`
    const guide = `# ${project.title}\n\n${project.brief}\n\n## What to build\n${project.outcome}\n\n## Suggested milestones\n1. Sketch the first screen and identify its users.\n2. Build one useful feature and run it.\n3. Ask the Studio mentor to explain and extend one piece at a time.\n4. Test the result and refine the design.\n\n## Profile fit\n${project.difficulty} · ${project.tech.join(" · ")}\n`
    const workspace: StudioProject = { id: `build:${name}`, name: project.title, description: `${project.difficulty} guided project`, tree: [{ type: "file", name: "README.md", content: guide }, { type: "file", name: filename, content: starter }] }
    setProjects(previous => previous.some(item => item.id === workspace.id) ? previous : [...previous, workspace])
    setOpenProjectId(workspace.id)
    setTabs([filename])
    setActivePath(filename)
    setSelectedBuildProject(project)
  }

  const completionId = selectedTask
    ? `task:${selectedTask.id}`
    : selectedBuildProject && openProject
      ? `project:${openProject.id}`
      : null
  const hasCompletedCurrentWork = completionId ? completedWork.includes(completionId) : false

  const handleMarkWorkComplete = () => {
    if (!completionId || hasCompletedCurrentWork) return
    const points = selectedTask ? 25 : 100
    const updatedCompleted = [...completedWork, completionId]
    const updatedXp = learningXp + points
    setCompletedWork(updatedCompleted)
    setLearningXp(updatedXp)
    window.localStorage.setItem("mirai-studio-completed-work", JSON.stringify(updatedCompleted))
    window.localStorage.setItem("mirai-studio-learning-xp", String(updatedXp))
    setCompletionMessage(`Congratulations! You completed ${selectedTask ? selectedTask.title : selectedBuildProject?.title}. You learned something new and earned +${points} XP!`)
  }

  useEffect(() => {
    if (!completionMessage) return
    const timer = setTimeout(() => setCompletionMessage(null), 6500)
    return () => clearTimeout(timer)
  }, [completionMessage])

  const handleApplyCode = (nextCode: string) => {
    if (isScratch) setScratchCode(nextCode)
    else if (editKey) setEdits(previous => ({ ...previous, [editKey]: nextCode }))
  }

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

  const handleSave = async () => {
    if (!openProject || !activePath) {
      setSaveStatus("Open a file to save")
    } else if (!openProject.handle) {
      try {
        await saveFileToComputer(activePath, code)
        setSaveStatus("Saved to your computer")
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setSaveStatus(`Save failed: ${error instanceof Error ? error.message : "Could not save file"}`)
      }
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
      <div className="h-14 flex-shrink-0 flex items-center px-4 sm:px-8 bg-black/40 backdrop-blur-3xl border-b border-white/5 gap-4 sm:gap-6 z-40 relative">
        <button
          type="button"
          onClick={() => setIsNavigationOpen(open => !open)}
          aria-label={isNavigationOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isNavigationOpen}
          aria-controls="studio-navigation"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          title={isNavigationOpen ? "Close navigation menu" : "Open navigation menu"}
        >
          {isNavigationOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
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

        <div className="ml-auto flex min-w-0 items-center gap-2">
           <button type="button" onClick={() => setIsSuggestionsOpen(open => !open)} aria-expanded={isSuggestionsOpen} aria-label={isSuggestionsOpen ? "Hide suggestions" : `Open ${learningMode ? "tasks" : "projects"}`} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-bold text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200">
             {isSuggestionsOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
             <span className="hidden lg:inline">{isSuggestionsOpen ? "Hide suggestions" : learningMode ? "Open tasks" : "Open projects"}</span>
           </button>
           <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
             <button type="button" onClick={() => { setLearningMode(true); window.localStorage.setItem("mirai-learning-mode", "learn") }} aria-pressed={learningMode} className={`rounded-lg px-3 py-2 text-[10px] font-bold transition ${learningMode ? "bg-emerald-400/15 text-emerald-300" : "text-slate-400 hover:text-white"}`}>Learn Code</button>
             <button type="button" onClick={() => { setLearningMode(false); window.localStorage.setItem("mirai-learning-mode", "build") }} aria-pressed={!learningMode} className={`rounded-lg px-3 py-2 text-[10px] font-bold transition ${!learningMode ? "bg-cyan-400/15 text-cyan-300" : "text-slate-400 hover:text-white"}`}>Build Projects</button>
           </div>
           <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2" title="Average of profile skill scores from your analysis">
             <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">PSI</span>
             <span className="text-sm font-black text-cyan-300">{psiScore === null ? "—" : `${psiScore}%`}</span>
           </div>
           <div className="flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2" title="Learning points earned">
             <Trophy className="h-3.5 w-3.5 text-amber-300" />
             <span className="text-[10px] font-black text-amber-200">{learningXp} XP</span>
           </div>
           {completionId && <button type="button" onClick={handleMarkWorkComplete} disabled={hasCompletedCurrentWork} className="rounded-lg bg-emerald-400 px-3 py-2 text-[10px] font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-default disabled:bg-emerald-400/20 disabled:text-emerald-200" title={selectedTask ? "Mark this task complete and earn 25 XP" : "Mark this project complete and earn 100 XP"}>{hasCompletedCurrentWork ? "Completed ✓" : `Complete · +${selectedTask ? 25 : 100} XP`}</button>}
           <div className="hidden items-center gap-6 pl-8 border-l border-white/5 xl:flex">
              <div className="flex flex-col items-end">
                <span className="text-[8px] font-black uppercase text-slate-500 tracking-[0.2em]">Coding focus</span>
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

      {/* Mode panel + shared editor, output and mentor */}
      <div className="flex-1 flex overflow-hidden relative">
        {completionMessage && <div role="status" className="absolute left-1/2 top-3 z-50 flex max-w-[min(92vw,560px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-emerald-300/30 bg-[#0d1c17] px-4 py-3 text-xs font-semibold text-emerald-100 shadow-2xl"><Trophy className="h-5 w-5 shrink-0 text-amber-300" /><span>{completionMessage}</span><button type="button" onClick={() => setCompletionMessage(null)} aria-label="Dismiss completion message" className="ml-1 rounded p-1 text-emerald-200/70 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div>}
        <aside
          id="studio-navigation"
          aria-label="Main navigation"
          aria-hidden={!isNavigationOpen}
          className={`flex-shrink-0 overflow-hidden border-r border-white/5 bg-[#0b0b0b] transition-[width] duration-200 ${isNavigationOpen ? "w-56" : "w-0 border-r-0"}`}
        >
          <div className="flex h-full w-56 flex-col">
            <div className="flex h-[84px] items-center border-b border-white/[0.07] px-[26px]">
              <div className="text-2xl font-extrabold tracking-tight text-white">
                Nirmaan<span className="text-[#52D273]">.</span>
              </div>
            </div>
            <nav className="flex-1 py-5">
              {studioNavigation.map(({ label, href, icon: Icon }) => {
                const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`))
                return (
                  <Link
                    key={label}
                    href={href}
                    tabIndex={isNavigationOpen ? 0 : -1}
                    className={`mx-3 my-0.5 flex h-11 items-center gap-3.5 rounded-lg px-3.5 text-sm no-underline transition ${active ? "bg-[rgba(82,210,115,0.12)] text-white shadow-[inset_-3px_0_0_#52D273]" : "text-white/75 hover:bg-white/[0.06] hover:text-white"}`}
                  >
                    <Icon className={`h-[18px] w-[18px] ${active ? "text-[#52D273]" : "text-white/55"}`} />
                    <span>{label}</span>
                  </Link>
                )
              })}
            </nav>
          </div>
        </aside>

        {/* The Actual Panel System */}
        <PanelGroup orientation="horizontal" className="flex-1 min-w-0">

          {isSuggestionsOpen && <>
            <Panel defaultSize={openProject ? "23%" : "25%"} minSize="18%" maxSize="34%" id="learning-panel">
              {learningMode
                ? <LearningTaskPanel tasks={suggestedTasks} level={profile?.level ?? "Beginner"} role={profile?.role ?? "Software Developer"} gapSkills={gapSkills} selectedTask={selectedTask} error={projectLoadError} onSelect={handleSelectTask} onOpenFolder={handleOpenFolder} onCreateCustomTopic={handleCreateCustomTopic} />
                : <BuildProjectsPanel projects={suggestedProjects} selected={selectedBuildProject} activeProject={openProject} error={projectLoadError} onSelect={handleSelectBuildProject} onStart={handleStartBuildProject} onOpenFolder={handleOpenFolder} />}
            </Panel>
            <CustomResizeHandle />
          </>}

          {openProject && <>
            <Panel defaultSize={isSuggestionsOpen ? "16%" : "20%"} minSize="11%" maxSize="26%" id="workspace-files-panel">
              <WorkspaceFiles project={openProject} activePath={activePath} onOpenFile={handleOpenFile} onCreateEntry={handleCreateEntry} onSave={handleSave} />
            </Panel>
            <CustomResizeHandle />
          </>}

          {/* Editor on top, output below, with the mentor kept beside it */}
          <Panel defaultSize={openProject ? (isSuggestionsOpen ? "42%" : "58%") : (isSuggestionsOpen ? "53%" : "70%")} minSize="35%" id="editor-panel">
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

          {/* Column C: AI copilot */}
          <CustomResizeHandle />
          <Panel defaultSize={openProject ? (isSuggestionsOpen ? "19%" : "22%") : (isSuggestionsOpen ? "22%" : "30%")} minSize="18%" maxSize="40%" id="copilot-panel">
            <div className="h-full border-l border-white/5 overflow-hidden">
              <AIAssistantSidebar
                code={code}
                language={language}
                fileName={activePath ? baseName(activePath) : "Scratchpad"}
                learningContext={selectedTask ? `Learning task: ${selectedTask.title}. Level: ${selectedTask.level}. Skill focus: ${selectedTask.skill}. Goal: ${selectedTask.goal}. Hint: ${selectedTask.hint}. Teach one step at a time; do not reveal the whole solution unless asked.` : selectedBuildProject ? `Selected project: ${selectedBuildProject.title}. Difficulty: ${selectedBuildProject.difficulty}. Tech: ${selectedBuildProject.tech.join(", ")}. Brief: ${selectedBuildProject.brief}. Teach the user while building. When asked to implement, return a complete replacement for the current file in an apply code block.` : `The user is in ${learningMode ? "Learn Code" : "Build Projects"} mode for ${profile?.role ?? "software development"} at ${profile?.level ?? "Beginner"} level. Let the user ask their own topic or question; teach it with clear small examples.`}
                onApplyCode={handleApplyCode}
              />
            </div>
          </Panel>

        </PanelGroup>
      </div>

    </div>
  )
}

interface BuildProject { title: string; brief: string; tech: string[]; difficulty: string; outcome: string }

function studioProjectFromRoadmap(project: Project): StudioProject {
  const files = project.code_files.length ? project.code_files : [{ filename: "index.html", content: `<!doctype html>\n<title>${project.title}</title>\n<h1>${project.title}</h1>\n` }]
  const activeStep = project.steps[project.current_step]
  const guide = `# ${project.title}\n\n${project.brief}\n\n## Current roadmap step\n${activeStep?.title ?? "Continue building"}\n\n${activeStep?.instructions ?? "Ask the mentor to help plan your next step."}\n`
  return { id: project._id, name: project.title, description: `${project.difficulty} roadmap project`, tree: [{ type: "file", name: "README.md", content: guide }, ...files.map(file => ({ type: "file" as const, name: file.filename, content: file.content }))] }
}

function makeBuildProjects(role: string, level: string, skills: Array<{ label: string; score: number }>): BuildProject[] {
  const roleKey = role.toLowerCase()
  const projectSet = roleKey.includes("data") || roleKey.includes("machine")
    ? ["Personal Data Explorer", "Insight Dashboard", "Prediction Evaluation Lab"]
    : roleKey.includes("frontend")
      ? ["Accessible Learning Portal", "Interactive Internship Finder", "Reusable UI Component Library"]
      : roleKey.includes("backend")
        ? ["Study Planner API", "Secure Task Service", "Rate-Limited Learning Platform"]
        : ["Learning Progress Tracker", "Internship Application Hub", "Collaborative Study Workspace"]
  const known = skills.filter(skill => skill.score >= 65).sort((a, b) => b.score - a.score).slice(0, 2).map(skill => skill.label)
  const gaps = skills.filter(skill => skill.score < 65).sort((a, b) => a.score - b.score).slice(0, 2).map(skill => skill.label)
  const commonStack = [...new Set([...known, ...gaps, ...(roleKey.includes("data") ? ["Python", "Streamlit"] : ["TypeScript", "React"])])].slice(0, 4)
  const difficulty = level === "Beginner" ? ["Beginner", "Intermediate", "Intermediate"] : level === "Intermediate" ? ["Intermediate", "Intermediate", "Advanced"] : ["Advanced", "Advanced", "Advanced"]
  return projectSet.map((title, index) => ({
    title,
    brief: `${index === 0 ? "Start with the core workflow" : index === 1 ? "Add a useful real-world feature" : "Connect the full experience"} for a ${role} project. The build is sized for your ${level.toLowerCase()} level${gaps.length ? ` and practices ${gaps.join(" and ")}` : ""}.`,
    tech: commonStack,
    difficulty: difficulty[index],
    outcome: `A working ${title.toLowerCase()} with clear user flows, thoughtful error handling, and a short explanation of the decisions you made.`,
  }))
}

function LearningTaskPanel({ tasks, level, role, gapSkills, selectedTask, error, onSelect, onOpenFolder, onCreateCustomTopic }: { tasks: SuggestedTask[]; level: string; role: string; gapSkills: string[]; selectedTask: SuggestedTask | null; error: string | null; onSelect: (task: SuggestedTask) => void; onOpenFolder: () => void; onCreateCustomTopic: (topic: string) => void }) {
  const [filter, setFilter] = useState("Recommended")
  const [category, setCategory] = useState("All topics")
  const [query, setQuery] = useState("")
  const [customTopic, setCustomTopic] = useState("")
  const [limit, setLimit] = useState(24)
  useEffect(() => setLimit(24), [filter, category, query])
  const categories = ["All topics", "Language", "DSA", "Frontend", "Backend", "Data", "Testing", "Custom"]
  const matched = tasks.filter(task => {
    const levelMatch = filter === "All levels" || (filter === "Recommended" ? task.level === level : task.level === filter)
    const categoryMatch = category === "All topics" || task.category === category
    const searchMatch = !query.trim() || `${task.title} ${task.skill} ${task.category} ${task.goal}`.toLowerCase().includes(query.trim().toLowerCase())
    return levelMatch && categoryMatch && searchMatch
  })
  const visible = matched.slice(0, limit)
  const submitCustomTopic = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!customTopic.trim()) return
    onCreateCustomTopic(customTopic)
    setCustomTopic("")
  }
  return <aside className="flex h-full min-w-0 flex-col border-r border-white/10 bg-[#080b12]">
    <div className="border-b border-white/10 px-3 py-3"><p className="m-0 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">Learn by building</p><h2 className="mb-1 mt-1.5 text-sm font-bold text-white">A real practice library</h2><p className="m-0 text-[10px] leading-relaxed text-slate-400">{TASK_LIBRARY_SIZE.toLocaleString()}+ guided variations across language, DSA, frontend, backend, data, and testing. Matched to {role} · {level}.</p>{gapSkills.length > 0 && <p className="mb-0 mt-2 text-[9px] leading-relaxed text-emerald-200/70">Your growth focus: {gapSkills.join(" · ")}</p>}</div>
    <form onSubmit={submitCustomTopic} className="border-b border-white/10 p-3"><label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-400" htmlFor="custom-practice-topic">Practice your own topic</label><div className="flex gap-1.5"><input id="custom-practice-topic" value={customTopic} onChange={event => setCustomTopic(event.target.value)} placeholder="e.g. React hooks or recursion" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[10px] text-white outline-none placeholder:text-slate-600 focus:border-emerald-400/40" /><button type="submit" disabled={!customTopic.trim()} className="rounded-lg bg-emerald-400 px-2.5 text-[10px] font-black text-slate-950 disabled:opacity-40">Teach me</button></div><p className="mb-0 mt-1.5 text-[9px] text-slate-600">We’ll open a guided file and your mentor can make a level-matched exercise.</p></form>
    <div className="border-b border-white/10 px-3 py-2"><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${TASK_LIBRARY_SIZE.toLocaleString()} tasks…`} aria-label="Search practice tasks" className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[10px] text-white outline-none placeholder:text-slate-600 focus:border-emerald-400/40" /><div className="mt-2 flex flex-wrap gap-1">{["Recommended", "All levels", "Beginner", "Intermediate", "Advanced"].map(item => <button key={item} onClick={() => setFilter(item)} className={`rounded-full px-2 py-1 text-[9px] ${filter === item ? "bg-emerald-400/15 text-emerald-300" : "text-slate-500 hover:text-white"}`}>{item}</button>)}</div><select value={category} onChange={event => setCategory(event.target.value)} aria-label="Filter by topic" className="mt-2 w-full rounded-lg border border-white/10 bg-[#10151e] px-2 py-1.5 text-[10px] text-slate-300">{categories.map(item => <option key={item}>{item}</option>)}</select><p className="mb-0 mt-1.5 text-[9px] text-slate-500">Showing {visible.length} of {matched.length.toLocaleString()} matching tasks</p></div>
    {selectedTask && <div className="mx-2 mt-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-2.5"><p className="m-0 text-[8px] font-bold uppercase tracking-wider text-emerald-300">Selected task · {selectedTask.level}</p><p className="mb-1 mt-1 text-[10px] font-bold text-white">{selectedTask.title}</p><p className="m-0 text-[9px] leading-relaxed text-slate-400">{selectedTask.goal}</p><p className="mb-0 mt-1 text-[9px] text-slate-500">Hint: {selectedTask.hint}</p></div>}
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 py-2">{visible.map((task, index) => <button key={task.id} onClick={() => onSelect(task)} className={`w-full rounded-lg border p-2.5 text-left transition ${selectedTask?.id === task.id ? "border-emerald-400/40 bg-emerald-400/[0.08]" : "border-white/10 bg-white/[0.025] hover:border-emerald-400/30 hover:bg-emerald-400/[0.05]"}`}><span className="flex items-center justify-between gap-1 text-[8px] uppercase text-slate-500"><span className="truncate">{task.category} · {task.skill}</span><span className="shrink-0">{task.level}</span></span><span className="mt-1.5 block text-[10px] font-bold text-slate-100">{index + 1}. {task.title}</span><span className="mt-1 block text-[9px] leading-relaxed text-slate-400">{task.goal}</span><span className="mt-1.5 block text-[8px] font-bold text-emerald-300">{selectedTask?.id === task.id ? "Selected · open in editor" : "Start guided task →"}</span></button>)}{visible.length === 0 && <p className="px-2 py-5 text-center text-[10px] text-slate-500">No task matches. Try All levels or enter your own topic above.</p>}{visible.length < matched.length && <button onClick={() => setLimit(value => value + 24)} className="w-full rounded-lg border border-white/10 p-2 text-[10px] font-bold text-emerald-300 hover:bg-white/5">Show 24 more tasks</button>}</div>
    {error && <p className="m-0 px-3 py-1 text-[9px] text-rose-300">{error}</p>}
    <button onClick={onOpenFolder} className="mx-3 mb-2 rounded-lg border border-white/10 px-3 py-2 text-left text-[10px] text-slate-400 hover:border-emerald-400/30 hover:text-emerald-200">Open a folder from your computer…</button>
    <p className="m-0 border-t border-white/10 p-2.5 text-[9px] leading-relaxed text-slate-600">Pick a guided challenge or use the mentor chat for any question of your own.</p>
  </aside>
}

function BuildProjectsPanel({ projects, selected, activeProject, error, onSelect, onStart, onOpenFolder }: { projects: BuildProject[]; selected: BuildProject | null; activeProject: StudioProject | null; error: string | null; onSelect: (project: BuildProject) => void; onStart: (project: BuildProject) => void; onOpenFolder: () => void }) {
  return <aside className="flex h-full min-w-0 flex-col border-r border-white/10 bg-[#080b12]">
    <div className="border-b border-white/10 px-4 py-4"><p className="m-0 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">Build a portfolio project</p><h2 className="mb-1 mt-2 text-sm font-bold text-white">Matched to your profile</h2><p className="m-0 text-[10px] text-slate-500">Select a project to see its scope. The mentor can build it with you, one feature at a time.</p></div>
    {error && <p className="m-0 px-4 py-3 text-[10px] text-rose-300">{error}</p>}
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{projects.map(project => <button key={project.title} onClick={() => onSelect(project)} className={`w-full rounded-xl border p-3 text-left transition ${selected?.title === project.title ? "border-cyan-400/40 bg-cyan-400/[0.08]" : "border-white/10 bg-white/[0.025] hover:border-cyan-400/30"}`}><span className="text-[9px] font-bold uppercase text-cyan-300">{project.difficulty} · {project.tech.slice(0, 3).join(" · ")}</span><span className="mt-2 block text-xs font-bold text-white">{project.title}</span><span className="mt-1 block text-[10px] leading-relaxed text-slate-400">{project.brief}</span><span className="mt-2 block text-[9px] text-slate-500">{selected?.title === project.title ? "Selected · details below" : "View project →"}</span></button>)}</div>
    {selected && <div className="border-t border-white/10 bg-black/20 p-4"><p className="m-0 text-[9px] font-bold uppercase tracking-wider text-cyan-300">Project plan</p><h3 className="mb-1 mt-2 text-sm font-bold text-white">{selected.title}</h3><p className="m-0 text-[10px] leading-relaxed text-slate-400">{selected.outcome}</p><p className="mb-3 mt-2 text-[9px] text-slate-500">Profile skills: {selected.tech.join(" · ")}</p><button onClick={() => onStart(selected)} className="w-full rounded-lg bg-cyan-400 px-3 py-2 text-[10px] font-black text-slate-950 transition hover:bg-cyan-300">{activeProject?.name === selected.title ? "Continue this project" : "Start in this Studio"} →</button></div>}
    <button onClick={onOpenFolder} className="mx-3 mb-2 rounded-lg border border-white/10 px-3 py-2 text-left text-[10px] text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200">Open a folder from your computer…</button>
  </aside>
}

function WorkspaceFiles({ project, activePath, onOpenFile, onCreateEntry, onSave }: { project: StudioProject; activePath: string | null; onOpenFile: (path: string) => void; onCreateEntry: (kind: "file" | "folder") => void; onSave: () => void }) {
  const rows: Array<{ path: string; name: string; depth: number; folder: boolean }> = []
  const visit = (nodes: TreeNode[], parent = "", depth = 0) => {
    for (const node of nodes) {
      const path = parent ? `${parent}/${node.name}` : node.name
      rows.push({ path, name: node.name, depth, folder: node.type === "folder" })
      if (node.type === "folder") visit(node.children, path, depth + 1)
    }
  }
  visit(project.tree)
  return <section className="flex h-full min-w-0 flex-col overflow-hidden border-r border-white/10 bg-[#0a0d14]" aria-label="Project files">
    <div className="shrink-0 border-b border-white/10 p-3"><p className="m-0 truncate text-[9px] font-black uppercase tracking-wider text-slate-400">Project files</p><p className="mb-2 mt-1 truncate text-[10px] font-bold text-white">{project.name}</p><div className="flex flex-wrap gap-1"><button aria-label="New file" title="New file" onClick={() => onCreateEntry("file")} className="rounded border border-white/10 px-2 py-1 text-[9px] text-slate-400 hover:text-white">+ File</button><button aria-label="New folder" title="New folder" onClick={() => onCreateEntry("folder")} className="rounded border border-white/10 px-2 py-1 text-[9px] text-slate-400 hover:text-white">+ Folder</button><button onClick={onSave} disabled={!activePath} className="ml-auto rounded bg-emerald-400 px-2 py-1 text-[9px] font-black text-slate-950 disabled:opacity-40">Save file</button></div></div>
    <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">{rows.map(row => row.folder
      ? <div key={row.path} className="truncate py-1 text-[10px] text-slate-500" style={{ paddingLeft: 6 + row.depth * 12 }}>▸ {row.name}</div>
      : <button key={row.path} onClick={() => onOpenFile(row.path)} style={{ paddingLeft: 6 + row.depth * 12 }} className={`block w-full truncate rounded py-1 pr-1 text-left text-[10px] ${activePath === row.path ? "bg-cyan-400/10 text-cyan-200" : "text-slate-400 hover:bg-white/5"}`}>▤ {row.name}</button>)}</div>
  </section>
}

function CustomResizeHandle({ vertical = false }: { vertical?: boolean }) {
  return (
    <PanelResizeHandle
      className={`${vertical ? "h-0.5 w-full" : "w-0.5 h-full"} bg-white/5 hover:bg-indigo-500/30 transition-all duration-300 group relative active:bg-indigo-500`}
    />
  )
}
