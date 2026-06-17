import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { vigenciaStatus, formatDate } from '../utils/formatters'
import { Link } from 'react-router-dom'
import { buscarIndices, ultimosMeses, acumulado } from '../services/indices'
import LineChart from '../components/charts/LineChart'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

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

function acumuladoLabel(valores) {
  const v = acumulado(valores)
  return v == null ? '—' : v.toFixed(2).replace('.', ',') + '%'
}

function fmt(v) { return v == null ? '—' : v.toFixed(2).replace('.', ',') + '%' }

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({})
  const [alertas, setAlertas] = useState([])
  const [recentes, setRecentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState(null)
  const [chartLoading, setChartLoading] = useState(true)
  const [apiIndisponivel, setApiIndisponivel] = useState(false)
  const [mostrarTabela, setMostrarTabela] = useState(false)

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
      }
      setStats({ totalInst, totalSind, totalEmp, totalClaus, vigentes, vencidos, alerta })
      setAlertas([...alertaList, ...(instrumentos || []).filter(i => vigenciaStatus(i.vigencia_fim) === 'vencido')].slice(0, 8))
      setRecentes((instrumentos || []).slice(0, 5))
      setLoading(false)
    }
    load()
  }, [user])

  useEffect(() => {
    if (!user) return
    async function loadChart() {
      const meses = ultimosMeses(12)
      const [{ meses: indices, apiIndisponivel: apiErr }, { data: clausulas }] = await Promise.all([
        buscarIndices(12),
        supabase.from('clausulas')
          .select('percentual, instrumento_id, instrumentos(vigencia_inicio)')
          .eq('categoria', 'Remuneração')
          .ilike('subcategoria', '%reajuste%')
          .eq('user_id', user.id),
      ])
      setApiIndisponivel(apiErr)
      const porMes = {}
      for (const c of clausulas || []) {
        const vig = c.instrumentos?.vigencia_inicio
        const pct = parseFloat(String(c.percentual).replace(',', '.'))
        if (!vig || isNaN(pct)) continue
        const key = vig.slice(0, 7)
        if (!porMes[key]) porMes[key] = []
        porMes[key].push(pct)
      }
      const reajusteMedio = meses.map(m => {
        const vals = porMes[m.key]
        if (!vals?.length) return null
        return vals.reduce((a, b) => a + b, 0) / vals.length
      })
      setChartData({
        labels: indices.map(i => i.label),
        keys: meses.map(m => m.key),
        ipca: indices.map(i => i.ipca),
        inpc: indices.map(i => i.inpc),
        reajuste: reajusteMedio,
      })
      setChartLoading(false)
    }
    loadChart()
  }, [user])

  function exportarExcel() {
    if (!chartData) return
    const wb = XLSX.utils.book_new()
    const rows = chartData.labels.map((l, i) => ({
      'Mês': l,
      'IPCA (% mensal)': chartData.ipca[i] ?? '',
      'INPC (% mensal)': chartData.inpc[i] ?? '',
      'Reajuste médio CCTs (%)': chartData.reajuste[i] ?? '',
    }))
    rows.push({})
    rows.push({ 'Mês': 'ACUMULADO 12m', 'IPCA (% mensal)': acumulado(chartData.ipca)?.toFixed(2) ?? '', 'INPC (% mensal)': acumulado(chartData.inpc)?.toFixed(2) ?? '', 'Reajuste médio CCTs (%)': '' })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 24 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Índices')
    XLSX.writeFile(wb, 'indices_economicos.xlsx')
  }

  function exportarPDF() {
    if (!chartData) return
    const doc = new jsPDF()
    doc.setFontSize(14); doc.text('Índices Econômicos vs Reajuste — Motor CCT', 14, 18)
    doc.setFontSize(9); doc.setTextColor(120)
    doc.text(`IPCA acumulado 12m: ${acumuladoLabel(chartData.ipca)}   INPC acumulado 12m: ${acumuladoLabel(chartData.inpc)}`, 14, 26)
    doc.setTextColor(0)
    doc.autoTable({
      startY: 32,
      head: [['Mês', 'IPCA (%)', 'INPC (%)', 'Reajuste Médio (%)']],
      body: chartData.labels.map((l, i) => [
        l,
        fmt(chartData.ipca[i]),
        fmt(chartData.inpc[i]),
        fmt(chartData.reajuste[i]),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [26, 79, 255] },
    })
    const finalY = doc.lastAutoTable.finalY + 8
    doc.setFontSize(8); doc.setTextColor(120)
    doc.text('Fonte IPCA/INPC: Banco Central do Brasil (séries 433 e 188). Reajuste: cláusulas de reajuste salarial dos instrumentos cadastrados.', 14, finalY, { maxWidth: 180 })
    doc.save('indices_economicos.pdf')
  }

  const nome = user?.user_metadata?.name || user?.user_metadata?.full_name || ''

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl text-slate-800">
          {nome ? `Olá, ${nome.split(' ')[0]} 👋` : 'Dashboard'}
        </h1>
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

          {/* Alertas + Recentes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="card p-5">
              <h2 className="font-display font-semibold text-slate-700 mb-4">🔔 Alertas de Vigência</h2>
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
            <div className="card p-5">
              <h2 className="font-display font-semibold text-slate-700 mb-4">🕐 Atividade Recente</h2>
              {recentes.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-slate-400 mb-3">Nenhum instrumento cadastrado ainda.</p>
                  <Link to="/instrumentos" className="btn-primary text-xs">Cadastrar primeiro instrumento →</Link>
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

          {/* Gráfico: IPCA, INPC vs Reajuste médio — abaixo dos alertas */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className="font-display font-semibold text-slate-700">📈 Evolução de Índices vs Reajuste Médio</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  IPCA e INPC (variação mensal %) comparados ao reajuste salarial médio dos instrumentos cadastrados — últimos 12 meses
                </p>
              </div>
              {!chartLoading && chartData && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-slate-500">
                    IPCA 12m: <span className="font-semibold text-blue-600">{acumuladoLabel(chartData.ipca)}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    INPC 12m: <span className="font-semibold text-purple-600">{acumuladoLabel(chartData.inpc)}</span>
                  </span>
                  <button onClick={() => setMostrarTabela(v => !v)}
                    className="btn-secondary text-xs py-1">
                    {mostrarTabela ? '📊 Ocultar dados' : '📋 Ver dados'}
                  </button>
                  <button onClick={exportarExcel} className="btn-secondary text-xs py-1">📥 Excel</button>
                  <button onClick={exportarPDF}   className="btn-secondary text-xs py-1">📄 PDF</button>
                </div>
              )}
            </div>

            {apiIndisponivel && (
              <p className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg mb-3">
                ⚠️ API do Banco Central indisponível. Usando valores manuais de Configurações quando disponíveis.
              </p>
            )}

            {chartLoading ? (
              <p className="text-slate-400 text-sm py-8 text-center">Carregando índices...</p>
            ) : (
              <>
                <LineChart
                  labels={chartData.labels}
                  series={[
                    { name: 'IPCA', color: '#2563eb', data: chartData.ipca },
                    { name: 'INPC', color: '#9333ea', data: chartData.inpc },
                    { name: 'Reajuste médio (CCTs)', color: '#16a34a', data: chartData.reajuste },
                  ]}
                />

                {chartData.reajuste.every(v => v == null) && (
                  <p className="text-xs text-slate-400 text-center mt-2">
                    Nenhuma cláusula de reajuste encontrada nos instrumentos cadastrados para os últimos 12 meses.
                  </p>
                )}

                {/* Tabela de dados detalhados */}
                {mostrarTabela && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-500">
                          <th className="py-2 pr-4 font-medium">Mês</th>
                          <th className="py-2 pr-4 font-medium text-blue-600">IPCA (%)</th>
                          <th className="py-2 pr-4 font-medium text-purple-600">INPC (%)</th>
                          <th className="py-2 font-medium text-emerald-600">Reajuste Médio (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartData.labels.map((l, i) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-1.5 pr-4 text-slate-600 capitalize">{l}</td>
                            <td className="py-1.5 pr-4 text-blue-700 font-mono">{fmt(chartData.ipca[i])}</td>
                            <td className="py-1.5 pr-4 text-purple-700 font-mono">{fmt(chartData.inpc[i])}</td>
                            <td className="py-1.5 text-emerald-700 font-mono">{fmt(chartData.reajuste[i])}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-semibold">
                          <td className="py-2 pr-4 text-slate-700">Acumulado 12m</td>
                          <td className="py-2 pr-4 text-blue-700 font-mono">{acumuladoLabel(chartData.ipca)}</td>
                          <td className="py-2 pr-4 text-purple-700 font-mono">{acumuladoLabel(chartData.inpc)}</td>
                          <td className="py-2 text-slate-400 text-xs italic">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            <p className="text-xs text-slate-400 mt-3">
              Fonte: Banco Central do Brasil (IPCA série 433, INPC série 188). Valores ausentes podem ser preenchidos em{' '}
              <Link to="/configuracoes" className="text-brand-600 hover:underline">Configurações</Link>.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
