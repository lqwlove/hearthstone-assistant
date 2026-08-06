import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { clearAuth, getUsername } from '../api'
import brandLogo from '../assets/brand-logo.png'
import statusDot from '../assets/figma/status-dot.svg'

const NAV = [
  { to: '/decks', label: '组牌', match: (p: string) => p.startsWith('/decks') },
  { to: '/library', label: '牌库', match: (p: string) => p.startsWith('/library') || p.startsWith('/cards/') },
  { to: '/skills', label: '技能市场', match: (p: string) => p.startsWith('/skills') },
]

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const username = getUsername()
  const initial = (username || '?').slice(0, 1).toUpperCase()
  const isBuilder = /^\/decks\/\d+\/build/.test(location.pathname)
  const isLibrary = location.pathname.startsWith('/library')
  const isDecksList = location.pathname === '/decks'
  const flushMain = isBuilder || isLibrary || isDecksList

  return (
    <div
      className={`app-shell ${isBuilder ? 'app-shell-builder' : ''} ${isLibrary ? 'app-shell-library' : ''} ${
        isDecksList ? 'app-shell-decks' : ''
      }`}
    >
      <header className="top-bar">
        <div className="top-brand">
          <img className="top-logo" src={brandLogo} alt="" width={40} height={40} />
          <span className="top-brand-name">ArcaneForge</span>
        </div>

        <nav className="top-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={() => (item.match(location.pathname) ? 'active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="top-user">
          <div className="sync-status" title="已连接后端">
            <img src={statusDot} alt="" width={8} height={8} />
            <span>已连接</span>
          </div>
          <div className="user-profile">
            <div className="avatar" aria-hidden>
              {initial}
            </div>
            <span className="user-name">{username}</span>
          </div>
          <button
            className="ghost top-logout"
            type="button"
            onClick={() => {
              clearAuth()
              navigate('/login')
            }}
          >
            退出
          </button>
        </div>
      </header>

      <main className={`main ${flushMain ? 'main-flush' : ''}`}>
        <Outlet />
      </main>
    </div>
  )
}
