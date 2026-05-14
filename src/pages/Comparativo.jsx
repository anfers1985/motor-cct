import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { compararInstrumentos } from '../utils/comparacao'
import { CATEGORIA_CORES } from '../utils/categorias'
import { gerarExcelComparativo } from '../services/reports/excelReport'
import { gerarPDFComparativo } from '../services/reports/pdfReport'

export default function Comparativo() {
  const { user } = useAuth()
  const [instrumentos, setInstrumentos] = useState([])
  const [instA, setInstA] = useState('')
  const [instB, setInstB] = useState('')
  const [resultado, setResultado] = useState(null)
  const [expandido, setExpandido] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (!user) return
    supabase.from('instrumentos').select('id,nome,tipo').eq('user_id', user.id).eq('status_processamento','processado').order('nome')
      .then(({ data }) => setInstrumentos(data || []))
  }, [user])

  async function comparar() {
    if (!instA || !instB) return alert('Selecione dois instrumentos')
    if (instA === instB) return alert('Selecione instrumentos diferentes')
    setLoading(true); setResultado(null)
    const [{ data: clausA }, { data: clausB }] = await Promise.all([
      supabase.from('clausulas').select('*').eq('instrumento_id', instA).order('numero'),
      supabase.from('clausulas').select('*').eq('instrumento_id', instB).order('numero'),
    ])
    const res = compararInstrumentos(clausA || [], clausB || [])
    setResultado(res)
    setLoading(false)
  }

  const iA = instrumentos.find(i => i.id === instA)
  const iB = instrumentos.find(i => i.id === instB)

  const STATUS_ORDER = ['INALTERADA','ALTERADA','MUITO ALTERADA','SUBSTITUÍDA','SUPRIMIDA','NOVA']

  const filtrado = resultado ? resultado.filter(r => {
    const q = busca.toLowerCase()
    return (!filtroStatus || r.status.label === filtroStatus)
      && (!filtroCategoria || r.clausulaA?.categoria === filtroCategoria || r.clausulaB?.categoria === filtroCategoria)
      && (!q || r.clausulaA?.titulo?.toLowerCase().includes(q) || r.clausulaB?.titulo?.toLowerCase().includes(q))
  }) : []

  // Stats
  const stats = resultado ? resultado.reduce((acc, r) => {
    acc[r.status.label] = (acc[r.status.label] || 0) + 1; return acc
  }, {}) : {}

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-800">Comparativo de Instrumentos</h1>
        <p className="text-slate-500 text-sm">Compare dois instrumentos cláusula a cláusula</p>
      </div>

      {/* Seleção */}
      <div className="card p-5 mb-5">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Instrumento A (referência/anterior)</label>
            <select className="input" value={instA} onChange={e => setInstA(e.target.value)}>
              <option value="">Selecione...</option>
              {instrumentos.map(i => <option key={i.id} value={i.id}>{i.tipo} — {i.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Instrumento B (atual/novo)</label>
            <select className="input" value={instB} onChange={e => setInstB(e.target.value)}>
              <option value="">Selecione...</option>
              {instrumentos.map(i => <option key={i.id} value={i.id}>{i.tipo} — {i.nome}</option>)}
            </select>
          </div>
        </div>
        <button className="btn-primary" onClick={comparar} disabled={loading || !instA || !instB}>
          {loading ? '⏳ Comparando...' : '⚖️ Comparar Instrumentos'}
        </button>
      </div>

      {resultado && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
            {STATUS_ORDER.map(s => (
              <button
                key={s}
                onClick={() => setFiltroStatus(filtroStatus === s ? '' : s)}
                className={`p-2 rounded-lg border text-center transition-all ${filtroStatus === s ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-white hover:bg-surface-50'}`}
              >
                <p className="text-lg font-bold text-slate-700">{stats[s] || 0}</p>
                <p className="text-[10px] text-slate-500 leading-tight">{s}</p>
              </button>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <input className="input max-w-xs" placeholder="Buscar por título..." value={busca} onChange={e => setBusca(e.target.value)} />
            <button className="btn-secondary text-xs" onClick={() => { gerarExcelComparativo(resultado, iA, iB) }}>📊 Exportar Excel</button>
            <button className="btn-secondary text-xs" onClick={() => { gerarPDFComparativo(resultado, iA, iB) }}>📄 Exportar PDF</button>
          </div>

          {/* Tabela */}
          <div className="space-y-2">
            {filtrado.map((r, idx) => (
              <div key={idx} className="card overflow-hidden">
                <button
                  className="w-full text-left p-3 hover:bg-surface-50 transition-colors"
                  onClick={() => setExpandido(expandido === idx ? null : idx)}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${r.status.cls}`}>{r.status.label}</span>
                    <div className="grid grid-cols-2 gap-4 flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">
                        {r.clausulaA ? `${r.clausulaA.numero ? r.clausulaA.numero + ' — ' : ''}${r.clausulaA.titulo}` : <span className="text-slate-400 italic">—</span>}
                      </p>
                      <p className="text-sm text-slate-700 truncate">
                        {r.clausulaB ? `${r.clausulaB.numero ? r.clausulaB.numero + ' — ' : ''}${r.clausulaB.titulo}` : <span className="text-slate-400 italic">—</span>}
                      </p>
                    </div>
                    <span className="text-slate-300 text-sm">{expandido === idx ? '▲' : '▼'}</span>
                  </div>
                </button>
                {expandido === idx && (
                  <div className="border-t border-slate-100 grid grid-cols-2 divide-x divide-slate-100">
                    <div className="p-4">
                      <p className="text-xs font-medium text-slate-400 mb-2">INSTRUMENTO A — {iA?.nome}</p>
                      {r.clausulaA ? (
                        <>
                          <p className="text-xs font-semibold text-slate-700 mb-1">{r.clausulaA.titulo}</p>
                          {r.clausulaA.valor_monetario && <p className="text-xs text-emerald-700 mb-1">{r.clausulaA.valor_monetario}</p>}
                          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{r.clausulaA.conteudo}</p>
                        </>
                      ) : <p className="text-xs text-slate-400 italic">Cláusula não existia no instrumento A</p>}
                    </div>
                    <div className="p-4">
                      <p className="text-xs font-medium text-slate-400 mb-2">INSTRUMENTO B — {iB?.nome}</p>
                      {r.clausulaB ? (
                        <>
                          <p className="text-xs font-semibold text-slate-700 mb-1">{r.clausulaB.titulo}</p>
                          {r.clausulaB.valor_monetario && (
                            <p className={`text-xs mb-1 ${r.clausulaA?.valor_monetario && r.clausulaA.valor_monetario !== r.clausulaB.valor_monetario ? 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium' : 'text-emerald-700'}`}>
                              {r.clausulaB.valor_monetario}
                              {r.clausulaA?.valor_monetario && r.clausulaA.valor_monetario !== r.clausulaB.valor_monetario && ' ⚠️ alterado'}
                            </p>
                          )}
                          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{r.clausulaB.conteudo}</p>
                        </>
                      ) : <p className="text-xs text-slate-400 italic">Cláusula suprimida no instrumento B</p>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
