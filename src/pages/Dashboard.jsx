import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { vigenciaStatus, formatDate } from '../utils/formatters'
import { Link } from 'react-router-dom'

function StatCard({ icon, label, value, sub, color = 'brand' }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
          <p className={`text-3xl font-display font-bold text-${color}-600`}>{value ?? '—'}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({})
  const [alertas, setAlertas] = useState([])
  const [recentes, setRecentes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function load() {
      const [{ count: totalInst }, { count: totalSind }, { count: totalEmp }, { count: totalClaus }] = await Promise.all([
        supabase.from('instrumentos').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('sindicatos').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('empresas').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('clausulas').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      ])

      const { data: instrumentos } = await supabase
        .from('instrumentos')
        .select('id, nome, tipo, vigencia_fim, status_processamento, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      let vigentes = 0, vencidos = 0, alerta = 0
      const alertaList = []
      for (const inst of instrumentos || []) {
        const s = vigenciaStatus(inst.vigencia_fim)
        if (s === 'vigente') vigentes++
        else if (s === 'vencido') vencidos++
        else if (s === 'alerta') { alerta++; alertaList.push(inst) }
        else if (s === 'vencido') alertaList.push(inst)
      }

      setStats({ totalInst, totalSind, totalEmp, totalClaus, vigentes, vencidos, alerta })
      setAlertas([...alertaList, ...(instrumentos || []).filter(i => vigenciaStatus(i.vigencia_fim) === 'vencido')].slice(0, 8))
      setRecentes((instrumentos || []).slice(0, 5))
      setLoading(false)
    }
    load()
  }, [user])

  const nome = user?.user_metadata?.name || user?.user_metadata?.full_name || 'Anderson'

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl text-slate-800">Olá, {nome.split(' ')[0]} 👋</h1>
        <p className="text-slate-500 text-sm mt-1">Aqui está um resumo do seu escritório</p>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Carregando...</p>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard icon="📄" label="Instrumentos" value={stats.totalInst} />
            <StatCard icon="🏛" label="Sindicatos" value={stats.totalSind} />
            <StatCard icon="🏢" label="Empresas" value={stats.totalEmp} />
            <StatCard icon="📋" label="Cláusulas Extraídas" value={stats.totalClaus} color="emerald" />
          </div>

          {/* Vigência resumo */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="card p-4 border-l-4 border-l-emerald-400">
              <p className="text-xs text-slate-500">Vigentes</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.vigentes ?? 0}</p>
            </div>
            <div className="card p-4 border-l-4 border-l-amber-400">
              <p className="text-xs text-slate-500">Vencem em 60 dias</p>
              <p className="text-2xl font-bold text-amber-600">{stats.alerta ?? 0}</p>
            </div>
            <div className="card p-4 border-l-4 border-l-red-400">
              <p className="text-xs text-slate-500">Vencidos</p>
              <p className="text-2xl font-bold text-red-600">{stats.vencidos ?? 0}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Alertas */}
            <div className="card p-5">
              <h2 className="font-display font-semibold text-slate-700 mb-4 flex items-center gap-2">
                🔔 Alertas de Vigência
              </h2>
              {alertas.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum alerta no momento.</p>
              ) : (
                <ul className="space-y-2">
                  {alertas.map(inst => {
                    const s = vigenciaStatus(inst.vigencia_fim)
                    return (
                      <li key={inst.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 truncate">{inst.nome}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${s === 'vencido' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {s === 'vencido' ? 'Vencido' : `Vence ${formatDate(inst.vigencia_fim)}`}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Recentes */}
            <div className="card p-5">
              <h2 className="font-display font-semibold text-slate-700 mb-4 flex items-center gap-2">
                🕐 Atividade Recente
              </h2>
              {recentes.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-slate-400 mb-3">Nenhum instrumento cadastrado ainda.</p>
                  <Link to="/instrumentos" className="btn-primary text-xs">
                    Cadastrar primeiro instrumento →
                  </Link>
                </div>
              ) : (
                <ul className="space-y-2">
                  {recentes.map(inst => (
                    <li key={inst.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700 truncate">{inst.nome}</span>
                      <span className="text-xs text-slate-400 ml-2 flex-shrink-0">{formatDate(inst.created_at?.split('T')[0])}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
