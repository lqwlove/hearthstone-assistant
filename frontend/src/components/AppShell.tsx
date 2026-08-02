import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearAuth, getUsername } from '../api'

export function AppShell() {
  const navigate = useNavigate()
  const username = getUsername()

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <p className="brand">炉石助手</p>
        <nav>
          <NavLink to="/library" className={({ isActive }) => (isActive ? 'active' : '')}>
            牌库
          </NavLink>
          <NavLink to="/decks" className={({ isActive }) => (isActive ? 'active' : '')}>
            我的卡组
          </NavLink>
        </nav>
        <div style={{ marginTop: '2rem' }}>
          <div className="muted" style={{ marginBottom: '0.5rem' }}>{username}</div>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              clearAuth()
              navigate('/login')
            }}
          >
            退出
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
