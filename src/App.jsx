import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useMembro } from './hooks/useMembro'
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
  const { user, loading, signOut } = useAuth()
  const membro = useMembro(user)
  if (loading || (user && membro === null)) return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <div className="text-center">
        <p className="text-4xl mb-4">⚖️</p>
        <p className="text-slate-400 text-sm">Carregando Motor CCT...</p>
      </div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (!membro) return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 p-6">
      <div className="max-w-md bg-white rounded-2xl shadow p-8 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h2 className="font-semibold text-slate-800 text-lg mb-2">Acesso pendente</h2>
        <p className="text-slate-500 text-sm mb-1">Você entrou como:</p>
        <p className="text-slate-800 text-sm font-medium mb-4">{user.email}</p>
        <p className="text-slate-500 text-sm mb-6">
          Este e-mail ainda não foi autorizado. Peça ao administrador para
          liberar o acesso e depois entre novamente.
        </p>
        <button onClick={signOut} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm">Sair</button>
      </div>
    </div>
  )
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