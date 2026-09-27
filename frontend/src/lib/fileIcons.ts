// ─── File-type icon map ───────────────────────────────────────────────────────
const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  py:   { icon: '🐍', color: '#3B82F6' },
  js:   { icon: '⚡', color: '#F59E0B' },
  jsx:  { icon: '⚛',  color: '#61DAFB' },
  ts:   { icon: '🔷', color: '#3178C6' },
  tsx:  { icon: '⚛',  color: '#61DAFB' },
  json: { icon: '{}', color: '#A78BFA' },
  md:   { icon: '📝', color: '#9CA3AF' },
  css:  { icon: '🎨', color: '#F472B6' },
  html: { icon: '🌐', color: '#F97316' },
  yaml: { icon: '⚙',  color: '#FBBF24' },
  yml:  { icon: '⚙',  color: '#FBBF24' },
  sh:   { icon: '💲', color: '#34D399' },
  env:  { icon: '🔑', color: '#6EE7B7' },
  sql:  { icon: '🗄',  color: '#818CF8' },
  go:   { icon: '🐹', color: '#00ADD8' },
  rs:   { icon: '🦀', color: '#CE422B' },
}

export function getFileIcon(filename: string) {
  const base = filename.toLowerCase()
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (base === '.env' || base.startsWith('.env.')) return FILE_ICONS.env
  return FILE_ICONS[ext] ?? { icon: '📄', color: '#9CA3AF' }
}

// ─── Language map ─────────────────────────────────────────────────────────────
export function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const base = filename.toLowerCase()
  if (base === '.env' || base.startsWith('.env.')) return 'plaintext'
  const map: Record<string, string> = {
    py: 'python', ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', css: 'css',
    html: 'html', yaml: 'yaml', yml: 'yaml',
    sh: 'shell', bash: 'shell', sql: 'sql',
    go: 'go', rs: 'rust', toml: 'toml',
    dockerfile: 'dockerfile',
  }
  if (base === 'dockerfile') return 'dockerfile'
  return map[ext] ?? 'plaintext'
}

// ─── Folder-icon (used by FileExplorer tree) ──────────────────────────────────
export const FOLDER_ICON = '📁'
export const FOLDER_ICON_OPEN = '📂'
