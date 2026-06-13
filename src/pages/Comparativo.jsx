import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { compararInstrumentos } from '../utils/comparacao'
import { toNumeroOrdinal } from '../utils/ordenacao'
import { gerarExcelComparativo } from '../services/reports/excelReport'
import { gerarPDFComparativo } from '../services/reports/pdfReport'

function diffTexto(textoA, textoB) {
  if (!textoA && !textoB) return { html_a: '', html_b: '' }
  if (!textoA) return { html_a: '', html_b: `<mark class="diff-add">${textoB}</mark>` }
  if (!textoB) return { html_a: `<mark class="diff-rem">${textoA}</mark>`, html_b: '' }
  const wA=textoA.split(/(\s+)/), wB=textoB.split(/(\s+)/)
  const m=wA.length, n=wB.length
  const dp=Array.from({length:m+1},()=>Array(n+1).fill(0))
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j]=wA[i-1]===wB[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1])
  const ops=[]; let i=m,j=n
  while(i>0||j>0){
    if(i>0&&j>0&&wA[i-1]===wB[j-1]){ops.unshift({type:'eq',val:wA[i-1]});i--;j--}
    else if(j>0&&(i===0||dp[i][j-1]>=dp[i-1][j])){ops.unshift({type:'add',val:wB[j-1]});j--}
    else{ops.unshift({type:'rem',val:wA[i-1]});i--}
  }
  let ha='',hb=''
  for(const op of ops){
    if(op.type==='eq'){ha+=op.val;hb+=op.val}
    else if(op.type==='rem') ha+=`<mark class="diff-rem">${op.val}</mark>`
    else hb+=`<mark class="diff-add">${op.val}</mark>`
  }
  return {html_a:ha, html_b:hb}
}

function DiffText({html}) {
  return <span className="text-xs text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{__html:html}}/>
}

const STATUS_ORDER = ['INALTERADA','ALTERADA','SUPRIMIDA','NOVA']
const STATUS_ORDER_NUM = {INALTERADA:0,ALTERADA:1,SUPRIMIDA:2,NOVA:3}
const STATUS_CLS = {
  INALTERADA:'bg-emerald-100 text-emerald-800 border-emerald-300',
  ALTERADA:'bg-blue-100 text-blue-800 border-blue-300',
  SUPRIMIDA:'bg-slate-100 text-slate-700 border-slate-300',
  NOVA:'bg-purple-100 text-purple-800 border-purple-300',
}

export default function Comparativo() {
  const { user } = useAuth()

  // Dados de referência
  const [todosInstrumentos, setTodosInstrumentos] = useState([])
  const [empresas,   setEmpresas]   = useState([])
  const [operacoes,  setOperacoes]  = useState([])
  const [sindicatos, setSindicatos] = useState([])

  // Filtros de busca de instrumento
  const [buscaEmpresa,   setBuscaEmpresa]   = useState('')
  const [filtroOperacao, setFiltroOperacao] = useState('')
  const [filtroSindLab,  setFiltroSindLab]  = useState('')
  const [filtroSindPat,  setFiltroSindPat]  = useState('')

  // Seleção dos instrumentos A e B
  const [instA, setInstA] = useState('')
  const [instB, setInstB] = useState('')

  // Resultado e controles
  const [resultado,    setResultado]    = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [busca,        setBusca]        = useState('')
  const [mostrarDiff,  setMostrarDiff]  = useState(true)
  const [ordenacao,    setOrdenacao]    = useState('original')
  const [statusAtivos, setStatusAtivos] = useState(new Set(STATUS_ORDER))
  const [expandidos,   setExpandidos]   = useState(new Set())
  const [modoExpandido,setModoExpandido]= useState(false)
  const [selecionados, setSelecionados] = useState(new Set())

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('instrumentos')
        .select('id,nome,tipo,vigencia_inicio,vigencia_fim,empresa_id,operacao_id,sindicato_laboral_id,sindicato_patronal_id')
        .eq('user_id', user.id).eq('status_processamento', 'processado').order('nome'),
      supabase.from('empresas').select('id,razao_social,cnpj').eq('user_id', user.id).order('razao_social'),
      supabase.from('operacoes').select('id,nome').eq('user_id', user.id).order('nome'),
      supabase.from('sindicatos').select('id,razao_social,sigla,tipo').eq('user_id', user.id).order('razao_social'),
    ]).then(([{data:insts},{data:emps},{data:ops},{data:sinds}]) => {
      setTodosInstrumentos(insts || [])
      setEmpresas(emps || [])
      setOperacoes(ops || [])
      setSindicatos(sinds || [])
    })
  }, [user])

  useEffect(() => setSelecionados(new Set()), [statusAtivos, busca, ordenacao])

  // Mapa rápido para lookup de empresa
  const empMap = Object.fromEntries(empresas.map(e => [e.id, e]))

  // Instrumentos filtrados
  const instrumentosFiltrados = todosInstrumentos.filter(i => {
    if (buscaEmpresa) {
      const emp = empMap[i.empresa_id]
      const q = buscaEmpresa.toLowerCase()
      const cnpjQ = buscaEmpresa.replace(/\D/g, '')
      const nomeMatch = emp?.razao_social?.toLowerCase().includes(q)
      const cnpjMatch = cnpjQ.length >= 3 && (emp?.cnpj || '').replace(/\D/g, '').includes(cnpjQ)
      if (!nomeMatch && !cnpjMatch) return false
    }
    if (filtroOperacao && i.operacao_id !== filtroOperacao) return false
    if (filtroSindLab  && i.sindicato_laboral_id  !== filtroSindLab)  return false
    if (filtroSindPat  && i.sindicato_patronal_id !== filtroSindPat)  return false
    return true
  })

  // Limpa A/B se saírem da lista filtrada
  useEffect(() => {
    if (instA && !instrumentosFiltrados.some(i => i.id === instA)) setInstA('')
    if (instB && !instrumentosFiltrados.some(i => i.id === instB)) setInstB('')
  }, [instrumentosFiltrados.length])

  async function comparar() {
    if (!instA || !instB) return alert('Selecione dois instrumentos')
    if (instA === instB)  return alert('Selecione instrumentos diferentes')
    setLoading(true); setResultado(null); setExpandidos(new Set()); setModoExpandido(false); setSelecionados(new Set())
    const [{data:cA},{data:cB}] = await Promise.all([
      supabase.from('clausulas').select('*').eq('instrumento_id', instA).order('numero'),
      supabase.from('clausulas').select('*').eq('instrumento_id', instB).order('numero'),
    ])
    setResultado(compararInstrumentos(cA || [], cB || []))
    setStatusAtivos(new Set(STATUS_ORDER))
    setLoading(false)
  }

  const iA = todosInstrumentos.find(i => i.id === instA)
  const iB = todosInstrumentos.find(i => i.id === instB)

  // Label do instrumento com empresa
  function instLabel(i) {
    const emp = empMap[i.empresa_id]
    return `${i.tipo} — ${i.nome}${emp ? ` · ${emp.razao_social}` : ''}`
  }

  function sortKey(r, lado) {
    const num = lado === 'B' ? r.clausulaB?.numero : r.clausulaA?.numero
    return toNumeroOrdinal(num || r.clausulaA?.numero || r.clausulaB?.numero)
  }
  const resultadoOrdenado = (() => {
    if (!resultado) return []
    switch(ordenacao) {
      case 'numA_asc':  return [...resultado].sort((a,b)=>sortKey(a,'A')-sortKey(b,'A'))
      case 'numA_desc': return [...resultado].sort((a,b)=>sortKey(b,'A')-sortKey(a,'A'))
      case 'numB_asc':  return [...resultado].sort((a,b)=>sortKey(a,'B')-sortKey(b,'B'))
      case 'numB_desc': return [...resultado].sort((a,b)=>sortKey(b,'B')-sortKey(a,'B'))
      case 'status':    return [...resultado].sort((a,b)=>(STATUS_ORDER_NUM[a.status.label]??9)-(STATUS_ORDER_NUM[b.status.label]??9))
      default:          return resultado
    }
  })()

  const filtrado = resultadoOrdenado.filter(r => {
    const q = busca.toLowerCase()
    return statusAtivos.has(r.status.label)
      && (!q || r.clausulaA?.titulo?.toLowerCase().includes(q) || r.clausulaB?.titulo?.toLowerCase().includes(q))
  })

  const stats = resultado ? resultado.reduce((acc,r) => { acc[r.status.label]=(acc[r.status.label]||0)+1; return acc }, {}) : {}

  function toggleStatus(s) {
    setStatusAtivos(prev => {
      const n = new Set(prev)
      if (n.has(s)) { if (n.size === 1) return n; n.delete(s) } else n.add(s)
      return n
    })
  }

  function toggleCard(idx) {
    setExpandidos(prev => { const n=new Set(prev); n.has(idx)?n.delete(idx):n.add(idx); return n })
  }
  function toggleExpandAll() { setModoExpandido(v => !v); setExpandidos(new Set()) }
  const isExpanded = idx => modoExpandido ? !expandidos.has(idx) : expandidos.has(idx)

  function toggleSelecionado(idx) {
    setSelecionados(prev => { const n=new Set(prev); n.has(idx)?n.delete(idx):n.add(idx); return n })
  }
  const todosSelecionados = filtrado.length > 0 && filtrado.every((_,i) => selecionados.has(i))
  function toggleSelecionarTodos() {
    todosSelecionados ? setSelecionados(new Set()) : setSelecionados(new Set(filtrado.map((_,i) => i)))
  }

  function exportar(tipo) {
    const itens = selecionados.size > 0 ? filtrado.filter((_,i) => selecionados.has(i)) : filtrado
    if (tipo === 'excel') gerarExcelComparativo(itens, iA, iB)
    else gerarPDFComparativo(itens, iA, iB)
  }

  const temFiltro = buscaEmpresa || filtroOperacao || filtroSindLab || filtroSindPat
  function limparFiltros() {
    setBuscaEmpresa(''); setFiltroOperacao(''); setFiltroSindLab(''); setFiltroSindPat('')
  }

  return (
    <div className="pb-24">
      <style>{`
        mark.diff-rem{background:#ede9fe;color:#5b21b6;border-radius:2px;padding:0 1px;text-decoration:line-through;text-decoration-color:#7c3aed}
        mark.diff-add{background:#dcfce7;color:#166534;border-radius:2px;padding:0 1px}
      `}</style>

      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-800">Comparativo de Instrumentos</h1>
        <p className="text-slate-500 text-sm">Compare dois instrumentos cláusula a cláusula — incluindo de empresas ou sindicatos diferentes</p>
      </div>

      {/* Filtros para encontrar instrumentos */}
      <div className="card p-4 mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Encontrar instrumentos por</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <label className="label">Empresa (nome ou CNPJ)</label>
            <input className="input" placeholder="Ex: Transportadora XYZ ou 12.345.678/0001"
              value={buscaEmpresa} onChange={e => { setBuscaEmpresa(e.target.value) }}/>
          </div>
          <div>
            <label className="label">Operação</label>
            <select className="input" value={filtroOperacao} onChange={e => setFiltroOperacao(e.target.value)}>
              <option value="">Todas</option>
              {operacoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            {temFiltro
              ? <button className="btn-secondary text-xs w-full" onClick={limparFiltros}>✕ Limpar filtros</button>
              : <p className="text-xs text-slate-400 pb-2">Sem filtros — todos os instrumentos visíveis</p>
            }
          </div>
          <div>
            <label className="label">Sindicato Laboral</label>
            <select className="input" value={filtroSindLab} onChange={e => setFiltroSindLab(e.target.value)}>
              <option value="">Todos</option>
              {sindicatos.filter(s=>s.tipo==='laboral').map(s => <option key={s.id} value={s.id}>{s.sigla ? s.sigla + ' — ' : ''}{s.razao_social}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Sindicato Patronal</label>
            <select className="input" value={filtroSindPat} onChange={e => setFiltroSindPat(e.target.value)}>
              <option value="">Todos</option>
              {sindicatos.filter(s=>s.tipo==='patronal').map(s => <option key={s.id} value={s.id}>{s.sigla ? s.sigla + ' — ' : ''}{s.razao_social}</option>)}
            </select>
          </div>
          {temFiltro && (
            <div className="lg:col-span-2 flex items-center">
              <p className="text-xs text-brand-600">{instrumentosFiltrados.length} instrumento(s) encontrado(s)</p>
            </div>
          )}
        </div>
      </div>

      {/* Seleção dos instrumentos A e B */}
      <div className="card p-5 mb-5">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Instrumento A — Anterior / Referência</label>
            <select className="input" value={instA} onChange={e => setInstA(e.target.value)}>
              <option value="">Selecione...</option>
              {instrumentosFiltrados.map(i => <option key={i.id} value={i.id}>{instLabel(i)}</option>)}
            </select>
            {iA && <p className="text-xs text-slate-400 mt-1">Vigência: {iA.vigencia_inicio} a {iA.vigencia_fim}</p>}
          </div>
          <div>
            <label className="label">Instrumento B — Atual / Novo</label>
            <select className="input" value={instB} onChange={e => setInstB(e.target.value)}>
              <option value="">Selecione...</option>
              {instrumentosFiltrados.map(i => <option key={i.id} value={i.id}>{instLabel(i)}</option>)}
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
              <input type="checkbox" checked={mostrarDiff} onChange={e => setMostrarDiff(e.target.checked)}/>
              Destacar diferenças (roxo = removido | verde = adicionado)
            </label>
          )}
        </div>
      </div>

      {resultado && (
        <>
          {/* Multi-select status */}
          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-2">Filtrar por tipo (clique para ativar/desativar — múltiplos permitidos):</p>
            <div className="grid grid-cols-4 gap-2">
              {STATUS_ORDER.map(s => (
                <button key={s} onClick={() => toggleStatus(s)}
                  className={'p-2 rounded-lg border-2 text-center transition-all select-none ' + (
                    statusAtivos.has(s) ? STATUS_CLS[s] + ' shadow-sm' : 'border-slate-200 bg-white opacity-40 hover:opacity-60'
                  )}>
                  <p className="text-lg font-bold">{stats[s] || 0}</p>
                  <p className="text-[10px] font-medium leading-tight">{s}</p>
                </button>
              ))}
            </div>
          </div>

          {mostrarDiff && (
            <div className="flex gap-4 mb-3 text-xs text-slate-500">
              <span><mark style={{background:'#ede9fe',color:'#5b21b6',borderRadius:'2px',padding:'0 3px',textDecoration:'line-through'}}>texto removido</mark> = estava no instrumento A</span>
              <span><mark style={{background:'#dcfce7',color:'#166534',borderRadius:'2px',padding:'0 3px'}}>texto adicionado</mark> = é novo no instrumento B</span>
            </div>
          )}

          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <input className="input max-w-xs text-sm" placeholder="Buscar por título..." value={busca} onChange={e => setBusca(e.target.value)}/>
            <select className="input w-auto text-xs" value={ordenacao} onChange={e => setOrdenacao(e.target.value)}>
              <option value="original">Ordem original</option>
              <option value="numA_asc">Nº A — crescente</option>
              <option value="numA_desc">Nº A — decrescente</option>
              <option value="numB_asc">Nº B — crescente</option>
              <option value="numB_desc">Nº B — decrescente</option>
              <option value="status">Por tipo</option>
            </select>
            <button className="btn-secondary text-xs" onClick={toggleExpandAll}>
              {modoExpandido ? '📕 Recolher tudo' : '📖 Expandir tudo'}
            </button>
            <button className="btn-secondary text-xs" onClick={() => exportar('excel')}>
              📊 {selecionados.size > 0 ? `Excel (${selecionados.size})` : 'Excel'}
            </button>
            <button className="btn-secondary text-xs" onClick={() => exportar('pdf')}>
              📄 {selecionados.size > 0 ? `PDF (${selecionados.size})` : 'PDF'}
            </button>
          </div>

          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-slate-50 rounded-lg text-xs text-slate-500">
            <input type="checkbox" checked={todosSelecionados} onChange={toggleSelecionarTodos} className="w-4 h-4 cursor-pointer"/>
            <span>{todosSelecionados ? 'Desselecionar tudo' : 'Selecionar tudo'} — {filtrado.length} visíveis</span>
            {selecionados.size > 0 && <span className="ml-auto text-brand-600 font-medium">{selecionados.size} selecionada(s)</span>}
          </div>

          <div className="space-y-2">
            {filtrado.map((r, idx) => {
              const diff = mostrarDiff && r.status.label === 'ALTERADA'
                ? diffTexto(r.clausulaA?.conteudo || '', r.clausulaB?.conteudo || '')
                : null
              const expanded = isExpanded(idx)
              const selected = selecionados.has(idx)

              return (
                <div key={idx} className={'card overflow-hidden transition-all ' + (selected ? 'ring-2 ring-brand-400' : '')}>
                  <div className="w-full text-left p-3 hover:bg-surface-50 transition-colors cursor-pointer"
                    onClick={() => toggleCard(idx)}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={selected}
                        onChange={() => toggleSelecionado(idx)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 flex-shrink-0 cursor-pointer accent-blue-600"/>
                      <span className={'text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ' + r.status.cls}>{r.status.label}</span>
                      <div className="grid grid-cols-2 gap-4 flex-1 min-w-0">
                        <p className="text-sm text-slate-700 truncate">
                          {r.clausulaA ? (r.clausulaA.numero ? r.clausulaA.numero + ' — ' : '') + r.clausulaA.titulo : <span className="text-slate-400 italic">—</span>}
                        </p>
                        <p className="text-sm text-slate-700 truncate">
                          {r.clausulaB ? (r.clausulaB.numero ? r.clausulaB.numero + ' — ' : '') + r.clausulaB.titulo : <span className="text-slate-400 italic">—</span>}
                        </p>
                      </div>
                      <span className="text-slate-300 text-sm flex-shrink-0">{expanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-slate-100 grid grid-cols-2 divide-x divide-slate-100">
                      <div className="p-4 bg-purple-50/30">
                        <p className="text-xs font-bold text-purple-700 mb-2 uppercase tracking-wide">A — {iA?.nome}</p>
                        {r.clausulaA ? (
                          <>
                            <p className="text-xs font-semibold text-slate-700 mb-2">{r.clausulaA.titulo}</p>
                            {diff ? <DiffText html={diff.html_a}/> : <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{r.clausulaA.conteudo}</p>}
                          </>
                        ) : <p className="text-xs text-slate-400 italic">Cláusula não existia no instrumento A</p>}
                      </div>
                      <div className="p-4 bg-green-50/30">
                        <p className="text-xs font-bold text-green-700 mb-2 uppercase tracking-wide">B — {iB?.nome}</p>
                        {r.clausulaB ? (
                          <>
                            <p className="text-xs font-semibold text-slate-700 mb-2">{r.clausulaB.titulo}</p>
                            {diff ? <DiffText html={diff.html_b}/> : <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{r.clausulaB.conteudo}</p>}
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

      {selecionados.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white rounded-2xl px-5 py-3 flex items-center gap-3 shadow-2xl z-50 border border-slate-700">
          <span className="text-sm font-semibold">{selecionados.size} cláusula(s) selecionada(s)</span>
          <button onClick={() => exportar('excel')} className="text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors">📊 Excel</button>
          <button onClick={() => exportar('pdf')}   className="text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors">📄 PDF</button>
          <button onClick={() => setSelecionados(new Set())} className="text-xs opacity-60 hover:opacity-100 ml-1">✕ Limpar</button>
        </div>
      )}
    </div>
  )
}
