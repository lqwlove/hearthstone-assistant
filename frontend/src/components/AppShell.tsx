import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearAuth, getUsername } from '../api'

export function AppShell() {
  const navigate = useNavigate()
  const username = getUsername()
  const initial = (username || '?').slice(0, 1).toUpperCase()

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="brand-block">
          <p className="brand-kicker">Hearthstone</p>
          <p className="brand">炉石助手</p>
          <p className="brand-sub">余烬典藏 · 构筑与检索</p>
        </div>
        <nav>
          <NavLink to="/library" className={({ isActive }) => (isActive ? 'active' : '')}>
            牌库
          </NavLink>
          <NavLink to="/decks" className={({ isActive }) => (isActive ? 'active' : '')}>
            我的卡组
          </NavLink>
          <NavLink to="/skills" className={({ isActive }) => (isActive ? 'active' : '')}>
            技能市场
          </NavLink>
        </nav>
        <div className="side-nav-foot">
          <div className="user-chip">
            <div className="avatar" aria-hidden>
              {initial}
            </div>
            <div>
              <div className="user-name">{username}</div>
              <div className="user-role">收藏家</div>
            </div>
          </div>
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
