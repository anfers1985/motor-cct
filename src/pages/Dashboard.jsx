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

function StatCard({ icon, label, value, color = 'brand' }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
          <p className={`text-3xl font-display font-bold text-${color}-600`}>{value ?? '—'}</p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  )
}

function fmt(v) { return v == null ? '—' : v.toFixed(2).replace('.', ',') + '%' }

// Converte série de variações mensais em acumulado progressivo
// Ex: [0.26, -0.11, 0.48] → [0.26, 0.15, 0.63] (acumulado composto até cada mês)
function serieAcumulada(valores) {
  let fator = 1
  return valores.map(v => {
    if (v == null) return null
    fator *= (1 + v / 100)
    return parseFloat(((fator - 1) * 100).toFixed(4))
  })
}

function acumuladoLabel(valores) {
  const v = acumulado(valores)
  return v == null ? '—' : v.toFixed(2).replace('.', ',') + '%'
}

// Média aritmética simples dos valores não-nulos — usada para o "Reajuste
// médio", que NÃO deve ser calculado como acumulado() composto. Cada reajuste
// vem de um instrumento (CCT/ACT) diferente, aplicado na sua própria data-base,
// sem qualquer relação sequencial entre eles — não é uma série de variações
// mensais consecutivas como IPCA/INPC. Compor (1+a)(1+b)(1+c)-1 entre reajustes
// de instrumentos distintos não tem significado econômico e infla o resultado
// (ex.: 3 reajustes de ~5-7% cada, isolados em meses diferentes, comportavam
// como 16%+ "acumulado" quando o que faz sentido reportar é a média: ~6%).
function mediaSimples(valores) {
  const validos = valores.filter(v => v != null)
  if (!validos.length) return null
  return validos.reduce((a, b) => a + b, 0) / validos.length
}

function mediaLabel(valores) {
  const v = mediaSimples(valores)
  return v == null ? '—' : v.toFixed(2).replace('.', ',') + '%'
}

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
  // Controle de visibilidade de cada série no gráfico
  const [seriesVisiveis, setSeriesVisiveis] = useState(new Set(['IPCA acum.', 'INPC acum.', 'Reajuste médio (CCTs)']))

  function toggleSerie(name) {
    setSeriesVisiveis(prev => {
      const s = new Set(prev)
      if (s.has(name)) { s.delete(name) } else { s.add(name) }
      return s
    })
  }

  useEffect(() => {
    if (!user) return
    async function load() {
      const [{ count: totalInst }, { count: totalSind }, { count: totalEmp }, { count: totalClaus }] = await Promise.all([
        supabase.from('instrumentos').select('*', { count: 'exact', head: true }),
        supabase.from('sindicatos').select('*', { count: 'exact', head: true }),
        supabase.from('empresas').select('*', { count: 'exact', head: true }),
        supabase.from('clausulas').select('*', { count: 'exact', head: true }),
      ])
      const { data: instrumentos } = await supabase
        .from('instrumentos')
        .select('id, nome, tipo, vigencia_fim, status_processamento, created_at')
        
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
          .select('percentual, instrumento_id, instrumentos(vigencia_inicio, tipo)')
          .eq('categoria', 'Remuneração e Reajuste')
          .ilike('subcategoria', '%reajuste%')
          ,
      ])
      setApiIndisponivel(apiErr)
      const porMes = {}
      for (const c of clausulas || []) {
        const vig = c.instrumentos?.vigencia_inicio
        const tipo = c.instrumentos?.tipo || ''
        // Prática Interna e Proposta Sindical não entram no gráfico de reajuste
        if (['Prática Interna', 'Proposta Sindical'].includes(tipo)) continue
        const pct = parseFloat(String(c.percentual).replace(',', '.'))
        // Filtra valores inválidos ou fora de intervalo razoável (0–100%)
        if (!vig || isNaN(pct) || pct <= 0 || pct > 100) continue
        const key = vig.slice(0, 7)
        if (!porMes[key]) porMes[key] = []
        porMes[key].push(pct)
      }
      const reajusteMensal = meses.map(m => {
        const vals = porMes[m.key]
        if (!vals?.length) return null
        return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4))
      })

      // Reajuste no gráfico acumulado: cada ponto mostra o reajuste pontual do mês.
      // Não acumulamos compostos entre instrumentos distintos — cada CCT/ACT tem
      // seu próprio percentual, aplicado na sua data-base, sem relação com outros meses.
      // IPCA e INPC acumulam normalmente pois são variações mensais sequenciais.
      const reajusteAcum = reajusteMensal.map(v => v) // valor pontual, sem acumulação composta

      const ipcaMensal  = indices.map(i => i.ipca)
      const inpcMensal  = indices.map(i => i.inpc)

      setChartData({
        labels: indices.map(i => i.label),
        keys: meses.map(m => m.key),
        // Séries mensais (para tabela)
        ipcaMensal,
        inpcMensal,
        reajusteMensal,
        // Séries acumuladas (para gráfico)
        ipcaAcum:     serieAcumulada(ipcaMensal),
        inpcAcum:     serieAcumulada(inpcMensal),
        reajusteAcum, // valor pontual por mês, sem acumulação composta
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
      'IPCA mensal (%)': chartData.ipcaMensal[i] ?? '',
      'INPC mensal (%)': chartData.inpcMensal[i] ?? '',
      'Reajuste médio mensal (%)': chartData.reajusteMensal[i] ?? '',
      'IPCA acumulado (%)': chartData.ipcaAcum[i] ?? '',
      'INPC acumulado (%)': chartData.inpcAcum[i] ?? '',
      'Reajuste médio acumulado (%)': chartData.reajusteAcum[i] ?? '',
    }))
    rows.push({})
    rows.push({
      'Mês': 'ACUMULADO 12m',
      'IPCA mensal (%)': '',
      'INPC mensal (%)': '',
      'Reajuste médio mensal (%)': '',
      'IPCA acumulado (%)': acumulado(chartData.ipcaMensal)?.toFixed(4) ?? '',
      'INPC acumulado (%)': acumulado(chartData.inpcMensal)?.toFixed(4) ?? '',
      'Reajuste médio acumulado (%)': mediaSimples(chartData.reajusteMensal)?.toFixed(4) ?? '',
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Índices')
    XLSX.writeFile(wb, 'indices_economicos.xlsx')
  }

  function exportarPDF() {
    if (!chartData) return
    const doc = new jsPDF()
    doc.setFontSize(14); doc.text('Índices Econômicos — Motor CCT', 14, 18)
    doc.setFontSize(9); doc.setTextColor(120)
    doc.text(
      `IPCA acumulado 12m: ${acumuladoLabel(chartData.ipcaMensal)}   INPC acumulado 12m: ${acumuladoLabel(chartData.inpcMensal)}`,
      14, 26
    )
    doc.setTextColor(0)
    doc.autoTable({
      startY: 32,
      head: [['Mês', 'IPCA mensal', 'INPC mensal', 'Reajuste', 'IPCA acum.', 'INPC acum.', 'Reajuste acum.']],
      body: chartData.labels.map((l, i) => [
        l,
        fmt(chartData.ipcaMensal[i]),
        fmt(chartData.inpcMensal[i]),
        fmt(chartData.reajusteMensal[i]),
        fmt(chartData.ipcaAcum[i]),
        fmt(chartData.inpcAcum[i]),
        fmt(chartData.reajusteAcum[i]),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [26, 79, 255] },
    })
    const finalY = doc.lastAutoTable.finalY + 8
    doc.setFontSize(7); doc.setTextColor(120)
    doc.text('Fonte: Banco Central do Brasil (séries 433 e 188). Reajuste: cláusulas dos instrumentos cadastrados.', 14, finalY, { maxWidth: 180 })
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

          {/* ── Gráfico acumulado ── */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className="font-display font-semibold text-slate-700">📈 Evolução Acumulada — IPCA / INPC vs Reajuste</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Variação acumulada progressiva (%) — últimos 12 meses. Valores exibidos em cada ponto. Clique nas séries para mostrar/ocultar.
                </p>
              </div>
              {!chartLoading && chartData && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-slate-500">
                    IPCA 12m: <span className="font-semibold text-blue-600">{acumuladoLabel(chartData.ipcaMensal)}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    INPC 12m: <span className="font-semibold text-purple-600">{acumuladoLabel(chartData.inpcMensal)}</span>
                  </span>
                  {mediaSimples(chartData.reajusteMensal) != null && (
                    <span className="text-xs text-slate-500">
                      Reajuste médio: <span className="font-semibold text-emerald-600">{mediaLabel(chartData.reajusteMensal)}</span>
                    </span>
                  )}
                  <button onClick={() => setMostrarTabela(v => !v)} className="btn-secondary text-xs py-1">
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
                    { name: 'IPCA acum.',            color: '#2563eb', data: chartData.ipcaAcum    },
                    { name: 'INPC acum.',            color: '#9333ea', data: chartData.inpcAcum    },
                    { name: 'Reajuste médio (CCTs)', color: '#16a34a', data: chartData.reajusteAcum },
                  ]}
                  seriesVisiveis={seriesVisiveis}
                  onToggleSerie={toggleSerie}
                  formatValue={v => v?.toFixed(2).replace('.', ',') + '%'}
                />

                {chartData.reajusteAcum.every(v => v == null) && (
                  <p className="text-xs text-slate-400 text-center mt-2">
                    Nenhuma cláusula de reajuste salarial encontrada nos instrumentos cadastrados para os últimos 12 meses.
                  </p>
                )}

                {/* Tabela de dados */}
                {mostrarTabela && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="text-left py-2 px-3 text-slate-500 font-medium">Mês</th>
                          <th className="text-right py-2 px-3 text-blue-600 font-medium">IPCA<br/><span className="font-normal opacity-70">mensal</span></th>
                          <th className="text-right py-2 px-3 text-blue-700 font-medium">IPCA<br/><span className="font-normal opacity-70">acum.</span></th>
                          <th className="text-right py-2 px-3 text-purple-600 font-medium">INPC<br/><span className="font-normal opacity-70">mensal</span></th>
                          <th className="text-right py-2 px-3 text-purple-700 font-medium">INPC<br/><span className="font-normal opacity-70">acum.</span></th>
                          <th className="text-right py-2 px-3 text-emerald-600 font-medium">Reajuste<br/><span className="font-normal opacity-70">médio acum.</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartData.labels.map((l, i) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-1.5 px-3 capitalize text-slate-600">{l}</td>
                            <td className="py-1.5 px-3 text-right text-blue-600 font-mono">{fmt(chartData.ipcaMensal[i])}</td>
                            <td className="py-1.5 px-3 text-right text-blue-700 font-mono font-semibold">{fmt(chartData.ipcaAcum[i])}</td>
                            <td className="py-1.5 px-3 text-right text-purple-600 font-mono">{fmt(chartData.inpcMensal[i])}</td>
                            <td className="py-1.5 px-3 text-right text-purple-700 font-mono font-semibold">{fmt(chartData.inpcAcum[i])}</td>
                            <td className="py-1.5 px-3 text-right text-emerald-700 font-mono font-semibold">{fmt(chartData.reajusteAcum[i])}</td>
                          </tr>
                        ))}
                        {/* Linha de totais */}
                        <tr className="bg-slate-50 border-t-2 border-slate-300">
                          <td className="py-2 px-3 font-bold text-slate-700">Acumulado 12m</td>
                          <td className="py-2 px-3 text-right text-blue-600 font-mono font-bold">{acumuladoLabel(chartData.ipcaMensal)}</td>
                          <td className="py-2 px-3 text-right text-blue-700 font-mono font-bold">—</td>
                          <td className="py-2 px-3 text-right text-purple-600 font-mono font-bold">{acumuladoLabel(chartData.inpcMensal)}</td>
                          <td className="py-2 px-3 text-right text-purple-700 font-mono font-bold">—</td>
                          <td className="py-2 px-3 text-right text-emerald-700 font-mono font-bold">{mediaLabel(chartData.reajusteMensal)}</td>
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
