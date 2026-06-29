import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const NAV = [
  { to: '/', icon: '▦', label: 'Dashboard' },
  { to: '/sindicatos', icon: '🏛', label: 'Sindicatos' },
  { to: '/empresas', icon: '🏢', label: 'Empresas' },
  { to: '/instrumentos', icon: '📄', label: 'Instrumentos' },
  { to: '/clausulas', icon: '🔍', label: 'Consulta de Cláusulas' },
  { to: '/comparativo', icon: '⚖️', label: 'Comparativo' },
  { to: '/negociacao', icon: '🤝', label: 'Negociação Sindical' },
  { to: '/relatorios', icon: '📊', label: 'Relatórios' },
  { to: '/configuracoes', icon: '⚙️', label: 'Configurações' },
]

export default function Sidebar() {
  const { user, signOut } = useAuth()

  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚖️</span>
          <div>
            <p className="font-display font-bold text-brand-700 leading-tight">Motor CCT</p>
            <p className="text-[10px] text-slate-400 leading-tight">Gestão de Normas Coletivas</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="text-base w-5 text-center">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          {user?.user_metadata?.avatar_url && (
            <img src={user.user_metadata.avatar_url} alt="" className="w-8 h-8 rounded-full" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{user?.user_metadata?.full_name || user?.email}</p>
            <p className="text-[10px] text-slate-400">GitHub</p>
          </div>
        </div>
        <button onClick={signOut} className="w-full text-left text-xs text-slate-500 hover:text-red-600 transition-colors">
          Sair →
        </button>
      </div>
    </aside>
  )
}
