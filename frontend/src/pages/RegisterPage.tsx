import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, setAuth } from '../api'
import brandLogo from '../assets/brand-logo.png'

export function RegisterPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.register(username, password)
      setAuth(res.access_token, res.username)
      navigate('/library')
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-brand">
          <img src={brandLogo} alt="" width={56} height={56} />
          <div className="auth-brand-text">
            <p className="brand">炉之暗语</p>
            <p className="brand-en">ArcaneForge</p>
          </div>
        </div>
        <p className="muted">创建账号，开始查卡与组套</p>
        <form onSubmit={onSubmit}>
          <label>
            用户名
            <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? '注册中…' : '注册'}</button>
        </form>
        <p className="muted" style={{ marginTop: '1rem' }}>
          已有账号？ <Link to="/login">登录</Link>
        </p>
      </div>
    </div>
  )
}
