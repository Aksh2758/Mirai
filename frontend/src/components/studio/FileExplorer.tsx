'use client'
import { useMemo, useState } from 'react'
import { getFileIcon, FOLDER_ICON, FOLDER_ICON_OPEN } from '@/lib/fileIcons'
import { useStudioStore, ROADMAP_TAB_ID } from '@/store/studioStore'

interface TreeNode {
  name: string
  path: string
  isFile: boolean
  children: Map<string, TreeNode>
}

function buildTree(filenames: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isFile: false, children: new Map() }
  for (const filename of filenames) {
    const parts = filename.split('/')
    let node = root
    let pathSoFar = ''
    parts.forEach((part, i) => {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part
      const isFile = i === parts.length - 1
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: pathSoFar, isFile, children: new Map() })
      }
      node = node.children.get(part)!
    })
  }
  return root
}

interface RowProps {
  node: TreeNode
  depth: number
  projectName: string
}

function FileRow({ node, depth, projectName }: RowProps) {
  const { activeFilename, setActiveFilename, unsavedFiles } = useStudioStore()
  const [collapsed, setCollapsed] = useState(false)

  if (node.isFile) {
    const isActive = node.path === activeFilename
    const isUnsaved = unsavedFiles.has(node.path)
    const { icon } = getFileIcon(node.name)
    return (
      <div
        onClick={() => setActiveFilename(node.path)}
        title={node.path}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: `4px 10px 4px ${12 + depth * 14}px`,
          cursor: 'pointer',
          background: isActive ? 'rgba(74,222,128,0.10)' : 'transparent',
          borderLeft: isActive ? '2px solid #4ADE80' : '2px solid transparent',
        }}
        onMouseOver={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
        onMouseOut={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ fontSize: 11, flexShrink: 0 }}>{icon}</span>
        <span style={{
          fontSize: 11.5, fontFamily: 'monospace', flex: 1, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
          fontWeight: isActive ? 600 : 400,
        }}>
          {node.name}
        </span>
        {isUnsaved && (
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F87171', flexShrink: 0 }} />
        )}
      </div>
    )
  }

  // Folder row
  const children = Array.from(node.children.values()).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
    return a.name.localeCompare(b.name)
  })

  return (
    <div>
      {depth > 0 && (
        <div
          onClick={() => setCollapsed(c => !c)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            padding: `4px 10px 4px ${12 + (depth - 1) * 14}px`,
          }}
          onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ fontSize: 11 }}>{collapsed ? FOLDER_ICON : FOLDER_ICON_OPEN}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.2 }}>
            {node.name}
          </span>
        </div>
      )}
      {!collapsed && children.map(child => (
        <FileRow key={child.path} node={child} depth={depth + 1} projectName={projectName} />
      ))}
    </div>
  )
}

interface Props {
  projectTitle: string
}

export default function FileExplorer({ projectTitle }: Props) {
  const { codeFiles, activeFilename, setActiveFilename } = useStudioStore()
  const filenames = Object.keys(codeFiles)
  const tree = useMemo(() => buildTree(filenames), [filenames.join('|')])
  const rootChildren = Array.from(tree.children.values()).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
    return a.name.localeCompare(b.name)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* EXPLORER header */}
      <div style={{ padding: '14px 14px 8px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
          Explorer
        </div>
      </div>

      {/* Pinned Roadmap entry — always visible above the file tree */}
      <div
        onClick={() => setActiveFilename(ROADMAP_TAB_ID)}
        title="Project roadmap & instructions"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 14px',
          margin: '0 0 6px',
          cursor: 'pointer',
          background: activeFilename === ROADMAP_TAB_ID ? 'rgba(74,222,128,0.10)' : 'transparent',
          borderLeft: activeFilename === ROADMAP_TAB_ID ? '2px solid #4ADE80' : '2px solid transparent',
        }}
        onMouseOver={e => { if (activeFilename !== ROADMAP_TAB_ID) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
        onMouseOut={e => { if (activeFilename !== ROADMAP_TAB_ID) e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ fontSize: 11 }}>📋</span>
        <span style={{
          fontSize: 11.5, fontWeight: 600, letterSpacing: 0.2,
          color: activeFilename === ROADMAP_TAB_ID ? '#4ADE80' : 'rgba(255,255,255,0.55)',
        }}>
          Roadmap
        </span>
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 0 6px' }} />

      {/* File tree */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
        {/* Project root folder label (cosmetic, matches VS Code's workspace-root row) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}>
          <span style={{ fontSize: 11 }}>{FOLDER_ICON_OPEN}</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
            {projectTitle}
          </span>
        </div>
        {rootChildren.map(child => (
          <FileRow key={child.path} node={child} depth={1} projectName={projectTitle} />
        ))}
      </div>
    </div>
  )
}
