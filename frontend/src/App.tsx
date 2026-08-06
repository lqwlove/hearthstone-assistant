import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { getToken } from './api'
import { AppShell } from './components/AppShell'
import { BuilderPage } from './pages/BuilderPage'
import { CardDetailPage } from './pages/CardDetailPage'
import { DecksPage } from './pages/DecksPage'
import { LibraryPage } from './pages/LibraryPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { SkillsPage } from './pages/SkillsPage'

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/cards/:id" element={<CardDetailPage />} />
        <Route path="/decks" element={<DecksPage />} />
        <Route path="/decks/:id/build" element={<BuilderPage />} />
        <Route path="/skills" element={<SkillsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/library" replace />} />
    </Routes>
  )
}
