import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Sindicatos from './pages/Sindicatos'
import Empresas from './pages/Empresas'
import Instrumentos from './pages/Instrumentos'
import Clausulas from './pages/Clausulas'
import Comparativo from './pages/Comparativo'
import Negociacao from './pages/Negociacao'
import Relatorios from './pages/Relatorios'
import Configuracoes from './pages/Configuracoes'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <div className="text-center">
        <p className="text-4xl mb-4">⚖️</p>
        <p className="text-slate-400 text-sm">Carregando Motor CCT...</p>
      </div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function LoginRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/" replace />
  return <Login />
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/sindicatos" element={<ProtectedRoute><Sindicatos /></ProtectedRoute>} />
        <Route path="/empresas" element={<ProtectedRoute><Empresas /></ProtectedRoute>} />
        <Route path="/instrumentos" element={<ProtectedRoute><Instrumentos /></ProtectedRoute>} />
        <Route path="/clausulas" element={<ProtectedRoute><Clausulas /></ProtectedRoute>} />
        <Route path="/comparativo" element={<ProtectedRoute><Comparativo /></ProtectedRoute>} />
        <Route path="/negociacao" element={<ProtectedRoute><Negociacao /></ProtectedRoute>} />
        <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
        <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}