/** 组牌对话里工具 / skill 的中文展示名 */

export const ASSISTANT_DISPLAY_NAME = '织咒师'

const TOOL_LABELS: Record<string, string> = {
  get_current_deck: '查看当前卡组',
  validate_current_deck: '校验卡组合法性',
  apply_deck_patch: '写入卡组变更',
  read_file: '读取文件',
  write_file: '写入文件',
  edit_file: '编辑文件',
  grep: '检索知识库',
  glob: '查找文件',
  ls: '列出目录',
  execute: '执行命令',
}

const SKILL_LABELS: Record<string, string> = {
  'wiki-query': '卡牌知识库查询',
  'deck-edit': '改套工作流',
  'coach-intake': '需求澄清',
  'curve-check': '曲线检查',
  'archetype-zee-shaman': '泽萨套牌思路',
  'archetype-face-hunter': 'T7猎套牌思路',
  'archetype-burn-mage': '燃法套牌思路',
  'archetype-void-demon-hunter': '虚空瞎套牌思路',
  'archetype-midrange': '中速套牌思路',
}

function asRecord(args: unknown): Record<string, unknown> {
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>
  }
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      /* ignore */
    }
  }
  return {}
}

function pathFromArgs(args: unknown): string {
  const a = asRecord(args)
  const raw = a.file_path ?? a.path ?? a.filePath ?? ''
  return String(raw)
}

/** 从路径解析 skill 目录名，如 .../archetype-face-hunter/SKILL.md */
export function skillSlugFromPath(path: string): string | null {
  const norm = path.replace(/\\/g, '/')
  const m =
    norm.match(/agent_skills\/(?:builtin|[^/]+)\/([^/]+)\/SKILL\.md$/i) ||
    norm.match(/skill_market\/([^/]+)\/SKILL\.md$/i) ||
    norm.match(/\/([^/]+)\/SKILL\.md$/i)
  if (!m) return null
  const slug = m[1]
  // market dirs may be slug__version
  return slug.split('__')[0] || slug
}

export function skillLabel(slug: string): string {
  if (SKILL_LABELS[slug]) return SKILL_LABELS[slug]
  if (slug.startsWith('archetype-')) {
    return `${slug.replace(/^archetype-/, '')} 套牌思路`
  }
  return `${slug} 技能`
}

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] || name
}

/** 生成思考条标题：调用中 / 结果 */
export function formatAgentActionTitle(
  toolName: string,
  args: unknown,
  phase: 'call' | 'result',
): string {
  const path = pathFromArgs(args)
  const skillSlug = path ? skillSlugFromPath(path) : null

  if ((toolName === 'read_file' || toolName === 'write_file' || toolName === 'edit_file') && skillSlug) {
    const label = skillLabel(skillSlug)
    return phase === 'call' ? `读取技能：${label}` : `已读取技能：${label}`
  }

  if (toolName === 'read_file' && path.includes('/card_wiki/')) {
    const short = path.replace(/^.*\/card_wiki\//, '知识库/')
    return phase === 'call' ? `查阅知识库：${short}` : `已查阅知识库：${short}`
  }

  if (toolName === 'grep' && path.includes('card_wiki')) {
    return phase === 'call' ? '检索卡牌知识库' : '知识库检索完成'
  }

  if (toolName === 'grep') {
    const a = asRecord(args)
    const q = String(a.pattern ?? a.query ?? '').slice(0, 40)
    return phase === 'call'
      ? `检索：${q || '关键词'}`
      : `检索完成：${q || '关键词'}`
  }

  const base = toolLabel(toolName)
  return phase === 'call' ? `正在${base}` : `${base}完成`
}

export function formatAgentActionDetail(toolName: string, args: unknown): string | undefined {
  const path = pathFromArgs(args)
  if (path) {
    const skillSlug = skillSlugFromPath(path)
    if (skillSlug) return skillLabel(skillSlug)
    if (path.includes('/card_wiki/')) return path.replace(/^.*\/card_wiki\//, '')
    return path
  }
  const a = asRecord(args)
  if (toolName === 'apply_deck_patch' && Array.isArray(a.ops)) {
    return `变更 ${a.ops.length} 项`
  }
  if (toolName === 'grep') {
    const q = String(a.pattern ?? a.query ?? '')
    return q ? `关键词：${q}` : undefined
  }
  const keys = Object.keys(a)
  if (!keys.length) return undefined
  try {
    const s = JSON.stringify(a)
    return s.length > 120 ? `${s.slice(0, 120)}…` : s
  } catch {
    return undefined
  }
}
