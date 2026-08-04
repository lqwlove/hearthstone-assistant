import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import type { SkillPack } from '../types'

const SAMPLE_MD = `---
name: my-skill
description: 简短说明此技能何时使用
---

# 我的技能

在合适时机给出简洁建议。
`

export function SkillsPage() {
  const [mine, setMine] = useState<SkillPack[]>([])
  const [publicPacks, setPublicPacks] = useState<SkillPack[]>([])
  const [slug, setSlug] = useState('my-skill')
  const [name, setName] = useState('我的技能')
  const [description, setDescription] = useState('')
  const [skillMd, setSkillMd] = useState(SAMPLE_MD)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  async function reload() {
    const [m, p] = await Promise.all([api.listMySkillPacks(), api.listPublicSkillPacks()])
    setMine(m)
    setPublicPacks(p)
  }

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setStatus('')
    try {
      await api.submitSkillPack({ slug, name, description, skill_md: skillMd })
      setStatus('已提交，等待审核')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
    }
  }

  return (
    <div className="page">
      <h1>技能市场</h1>
      <p className="muted">提交 SKILL.md 知识包；审核通过后进入公共池供组牌 Agent 加载。不做订阅。</p>
      {error && <p className="error">{error}</p>}
      {status && <p className="ok">{status}</p>}

      <form className="stack" onSubmit={onSubmit} style={{ maxWidth: 720, marginBottom: 32 }}>
        <label>
          slug
          <input value={slug} onChange={(e) => setSlug(e.target.value)} required pattern="[a-z0-9][a-z0-9\-]*" />
        </label>
        <label>
          名称
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          简介
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          SKILL.md
          <textarea rows={12} value={skillMd} onChange={(e) => setSkillMd(e.target.value)} required />
        </label>
        <button type="submit">提交审核</button>
      </form>

      <h2>我的提交</h2>
      <ul>
        {mine.map((p) => (
          <li key={p.id}>
            {p.name} ({p.slug}@{p.version}) — {p.status}
          </li>
        ))}
        {mine.length === 0 && <li className="muted">暂无</li>}
      </ul>

      <h2>已上架</h2>
      <ul>
        {publicPacks.map((p) => (
          <li key={p.id}>
            {p.name} ({p.slug}@{p.version})
          </li>
        ))}
        {publicPacks.length === 0 && <li className="muted">暂无已上架技能</li>}
      </ul>
    </div>
  )
}
