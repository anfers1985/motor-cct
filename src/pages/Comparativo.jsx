import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { compararInstrumentos } from '../utils/comparacao'
import { gerarExcelComparativo } from '../services/reports/excelReport'
import { gerarPDFComparativo } from '../services/reports/pdfReport'

// Diff palavra por palavra (LCS)
function diffTexto(textoA, textoB) {
  if (!textoA && !textoB) return { html_a: '', html_b: '' }
  if (!textoA) return { html_a: '', html_b: `<mark class="diff-add">${textoB}</mark>` }
  if (!textoB) return { html_a: `<mark class="diff-rem">${textoA}</mark>`, html_b: '' }

  const wordsA = textoA.split(/(\s+)/)
  const wordsB = textoB.split(/(\s+)/)
  const m = wordsA.length, n = wordsB.length
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = wordsA[i-1] === wordsB[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1])

  const ops = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i-1] === wordsB[j-1]) { ops.unshift({ type: 'eq', val: wordsA[i-1] }); i--; j-- }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { ops.unshift({ type: 'add', val: wordsB[j-1] }); j-- }
    else { ops.unshift({ type: 'rem', val: wordsA[i-1] }); i-- }
  }

  let html_a = '', html_b = ''
  for (const op of ops) {
    if (op.type === 'eq')  { html_a += op.val; html_b += op.val }
    else if (op.type === 'rem') html_a += `<mark class="diff-rem">${op.val}</mark>`
    else if (op.type === 'add') html_b += `<mark class="diff-add">${op.val}</mark>`
  }
  return { html_a, html_b }
}

function DiffText({ html }) {
  return <span className="text-xs text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
}

export default function Comparativo() {
  const { user } = useAuth()

  // Dados brutos
  const [todosInstrumentos, setTodosInstrumentos] = useState([])
  const [empresas, setEmpresas]   = useState([])
  const [operacoes, setOperacoes] = useState([])

  // Filtros de seleção
  const [filtroEmpresa,  setFiltroEmpresa]  = useState('')
  const [filtroOperacao, setFiltroOperacao] = useState('')

  // Instrumentos selecionados para comparar
  const [instA, setInstA] = useState('')
  const [instB, setInstB] = useState('')

  // Resultado
  const [resultado,    setResultado]    = useState(null)
  const [expandido,    setExpandido]    = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [busca,        setBusca]        = useState('')
  const [mostrarDiff,  setMostrarDiff]  = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('instrumentos')
        .select('id,nome,tipo,vigencia_inicio,vigencia_fim,empresa_id,operacao_id')
        .eq('user_id', user.id).eq('status_processamento', 'processado').order('nome'),
      supabase.from('empresas').select('id,razao_social').eq('user_id', user.id).order('razao_social'),
      supabase.from('operacoes').select('id,nome').eq('user_id', user.id).order('nome'),
    ]).then(([{ data: insts }, { data: emps }, { data: ops }]) => {
      setTodosInstrumentos(insts || [])
      setEmpresas(emps || [])
      setOperacoes(ops || [])
    })
  }, [user])

  // Instrumentos filtrados pelos seletores de empresa/operação
  const instrumentosFiltrados = todosInstrumentos.filter(i => {
    if (filtroEmpresa  && i.empresa_id  !== filtroEmpresa)  return false
    if (filtroOperacao && i.operacao_id !== filtroOperacao) return false
    return true
  })

  async function comparar() {
    if (!instA || !instB) return alert('Selecione dois instrumentos')
    if (instA === instB)  return alert('Selecione instrumentos diferentes')
    setLoading(true); setResultado(null)
    const [{ data: clausA }, { data: clausB }] = await Promise.all([
      supabase.from('clausulas').select('*').eq('instrumento_id', instA).order('numero'),
      supabase.from('clausulas').select('*').eq('instrumento_id', instB).order('numero'),
    ])
    const res = compararInstrumentos(clausA || [], clausB || [])
    setResultado(res)
    setLoading(false)
  }

  const iA = todosInstrumentos.find(i => i.id === instA)
  const iB = todosInstrumentos.find(i => i.id === instB)

  const STATUS_ORDER = ['INALTERADA', 'ALTERADA', 'MUITO ALTERADA', 'SUBSTITUÍDA', 'SUPRIMIDA', 'NOVA']

  const filtrado = resultado ? resultado.filter(r => {
    const q = busca.toLowerCase()
    return (!filtroStatus || r.status.label === filtroStatus)
      && (!q || r.clausulaA?.titulo?.toLowerCase().includes(q) || r.clausulaB?.titulo?.toLowerCase().includes(q))
  }) : []

  const stats = resultado ? resultado.reduce((acc, r) => {
    acc[r.status.label] = (acc[r.status.label] || 0) + 1; return acc
  }, {}) : {}

  return (
    <div>
      <style>{`
        mark.diff-rem {
          background-color: #ede9fe; color: #5b21b6;
          border-radius: 2px; padding: 0 1px;
          text-decoration: line-through; text-decoration-color: #7c3aed;
        }
        mark.diff-add {
          background-color: #dcfce7; color: #166534;
          border-radius: 2px; padding: 0 1px;
        }
      `}</style>

      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-800">Comparativo de Instrumentos</h1>
        <p className="text-slate-500 text-sm">Compare dois instrumentos cláusula a cláusula com destaque visual das diferenças</p>
      </div>

      {/* Filtros de empresa / operação */}
      <div className="card p-4 mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Filtrar instrumentos por</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Empresa</label>
            <select className="input" value={filtroEmpresa} onChange={e => { setFiltroEmpresa(e.target.value); setInstA(''); setInstB('') }}>
              <option value="">Todas as empresas</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.razao_social}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Operação</label>
            <select className="input" value={filtroOperacao} onChange={e => { setFiltroOperacao(e.target.value); setInstA(''); setInstB('') }}>
              <option value="">Todas as operações</option>
              {operacoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>
        </div>
        {(filtroEmpresa || filtroOperacao) && (
          <p className="text-xs text-brand-600 mt-2">
            {instrumentosFiltrados.length} instrumento(s) encontrado(s)
            {filtroEmpresa || filtroOperacao ? ' com este filtro' : ''}
            {' '}— <button className="underline" onClick={() => { setFiltroEmpresa(''); setFiltroOperacao(''); setInstA(''); setInstB('') }}>limpar filtros</button>
          </p>
        )}
      </div>

      {/* Seleção dos instrumentos */}
      <div className="card p-5 mb-5">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Instrumento A — Anterior / Referência</label>
            <select className="input" value={instA} onChange={e => setInstA(e.target.value)}>
              <option value="">Selecione...</option>
              {instrumentosFiltrados.map(i => <option key={i.id} value={i.id}>{i.tipo} — {i.nome}</option>)}
            </select>
            {iA && <p className="text-xs text-slate-400 mt-1">Vigência: {iA.vigencia_inicio} a {iA.vigencia_fim}</p>}
          </div>
          <div>
            <label className="label">Instrumento B — Atual / Novo</label>
            <select className="input" value={instB} onChange={e => setInstB(e.target.value)}>
              <option value="">Selecione...</option>
              {instrumentosFiltrados.map(i => <option key={i.id} value={i.id}>{i.tipo} — {i.nome}</option>)}
            </select>
            {iB && <p className="text-xs text-slate-400 mt-1">Vigência: {iB.vigencia_inicio} a {iB.vigencia_fim}</p>}
          </div>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <button className="btn-primary" onClick={comparar} disabled={loading || !instA || !instB}>
            {loading ? '⏳ Comparando...' : '⚖️ Comparar Instrumentos'}
          </button>
          {resultado && (
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={mostrarDiff} onChange={e => setMostrarDiff(e.target.checked)} />
              Destacar diferenças (roxo = removido | verde = adicionado)
            </label>
          )}
        </div>
      </div>

      {resultado && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
            {STATUS_ORDER.map(s => (
              <button key={s}
                onClick={() => setFiltroStatus(filtroStatus === s ? '' : s)}
                className={'p-2 rounded-lg border text-center transition-all ' +
                  (filtroStatus === s ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-white hover:bg-surface-50')}>
                <p className="text-lg font-bold text-slate-700">{stats[s] || 0}</p>
                <p className="text-[10px] text-slate-500 leading-tight">{s}</p>
              </button>
            ))}
          </div>

          {mostrarDiff && (
            <div className="flex gap-4 mb-3 text-xs text-slate-500">
              <span><mark className="diff-rem" style={{background:'#ede9fe',color:'#5b21b6',borderRadius:'2px',padding:'0 3px',textDecoration:'line-through'}}>texto removido</mark> = estava no instrumento A e foi removido</span>
              <span><mark className="diff-add" style={{background:'#dcfce7',color:'#166534',borderRadius:'2px',padding:'0 3px'}}>texto adicionado</mark> = é novo no instrumento B</span>
            </div>
          )}

          {/* Filtros de resultado */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <input className="input max-w-xs" placeholder="Buscar por título..." value={busca} onChange={e => setBusca(e.target.value)} />
            <button className="btn-secondary text-xs" onClick={() => gerarExcelComparativo(resultado, iA, iB)}>📊 Excel</button>
            <button className="btn-secondary text-xs" onClick={() => gerarPDFComparativo(resultado, iA, iB)}>📄 PDF</button>
          </div>

          {/* Resultados */}
          <div className="space-y-2">
            {filtrado.map((r, idx) => {
              const diff = mostrarDiff && ['ALTERADA', 'MUITO ALTERADA', 'SUBSTITUÍDA'].includes(r.status.label)
                ? diffTexto(r.clausulaA?.conteudo || '', r.clausulaB?.conteudo || '')
                : null

              return (
                <div key={idx} className="card overflow-hidden">
                  <button className="w-full text-left p-3 hover:bg-surface-50 transition-colors"
                    onClick={() => setExpandido(expandido === idx ? null : idx)}>
                    <div className="flex items-center gap-3">
                      <span className={'text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ' + r.status.cls}>
                        {r.status.label}
                      </span>
                      <div className="grid grid-cols-2 gap-4 flex-1 min-w-0">
                        <p className="text-sm text-slate-700 truncate">
                          {r.clausulaA
                            ? (r.clausulaA.numero ? r.clausulaA.numero + ' — ' : '') + r.clausulaA.titulo
                            : <span className="text-slate-400 italic">—</span>}
                        </p>
                        <p className="text-sm text-slate-700 truncate">
                          {r.clausulaB
                            ? (r.clausulaB.numero ? r.clausulaB.numero + ' — ' : '') + r.clausulaB.titulo
                            : <span className="text-slate-400 italic">—</span>}
                        </p>
                      </div>
                      <span className="text-slate-300 text-sm">{expandido === idx ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {expandido === idx && (
                    <div className="border-t border-slate-100 grid grid-cols-2 divide-x divide-slate-100">
                      {/* Coluna A */}
                      <div className="p-4 bg-purple-50/30">
                        <p className="text-xs font-bold text-purple-700 mb-2 uppercase tracking-wide">
                          A — {iA?.nome}
                        </p>
                        {r.clausulaA ? (
                          <>
                            <p className="text-xs font-semibold text-slate-700 mb-2">{r.clausulaA.titulo}</p>
                            {r.clausulaA.valor_monetario && (
                              <p className="text-xs text-emerald-700 mb-1">💰 {r.clausulaA.valor_monetario}</p>
                            )}
                            {diff
                              ? <DiffText html={diff.html_a} />
                              : <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{r.clausulaA.conteudo}</p>
                            }
                          </>
                        ) : <p className="text-xs text-slate-400 italic">Cláusula não existia no instrumento A</p>}
                      </div>

                      {/* Coluna B */}
                      <div className="p-4 bg-green-50/30">
                        <p className="text-xs font-bold text-green-700 mb-2 uppercase tracking-wide">
                          B — {iB?.nome}
                        </p>
                        {r.clausulaB ? (
                          <>
                            <p className="text-xs font-semibold text-slate-700 mb-2">{r.clausulaB.titulo}</p>
                            {r.clausulaB.valor_monetario && (
                              <p className={`text-xs mb-1 ${r.clausulaA?.valor_monetario && r.clausulaA.valor_monetario !== r.clausulaB.valor_monetario
                                ? 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium'
                                : 'text-emerald-700'}`}>
                                💰 {r.clausulaB.valor_monetario}
                                {r.clausulaA?.valor_monetario && r.clausulaA.valor_monetario !== r.clausulaB.valor_monetario && ' ⚠️ valor alterado'}
                              </p>
                            )}
                            {diff
                              ? <DiffText html={diff.html_b} />
                              : <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{r.clausulaB.conteudo}</p>
                            }
                          </>
                        ) : <p className="text-xs text-slate-400 italic">Cláusula suprimida no instrumento B</p>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
