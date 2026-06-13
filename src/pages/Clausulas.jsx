import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { CATEGORIAS, CATEGORIA_CORES, TAGS_PREDEFINIDAS } from '../utils/categorias'
import { ordenarClausulas, toNumeroOrdinal } from '../utils/ordenacao'
import Badge from '../components/UI/Badge'
import { gerarExcelClausulas } from '../services/reports/excelReport'
import { gerarPDFClausulas } from '../services/reports/pdfReport'

export default function Clausulas() {
  const { user } = useAuth()

  // Dados de referência
  const [todosInstrumentos, setTodosInstrumentos] = useState([])
  const [empresas,   setEmpresas]   = useState([])
  const [operacoes,  setOperacoes]  = useState([])
  const [sindicatos, setSindicatos] = useState([])

  // Filtros para encontrar o instrumento
  const [buscaEmpresa,   setBuscaEmpresa]   = useState('')
  const [filtroOperacao, setFiltroOperacao] = useState('')
  const [filtroSindLab,  setFiltroSindLab]  = useState('')
  const [filtroSindPat,  setFiltroSindPat]  = useState('')

  // Filtros dentro do instrumento selecionado
  const [filtros, setFiltros] = useState({ instrumento: '', categoria: '', subcategoria: '', busca: '' })
  const [clausulas, setClausulas] = useState([])
  const [subcatsDisponiveis, setSubcatsDisponiveis] = useState([])
  const [loading, setLoading] = useState(false)

  // Ordenação
  const [ordem, setOrdem] = useState('padrao')

  // Expand/collapse
  const [expandidos,    setExpandidos]    = useState(new Set())
  const [modoExpandido, setModoExpandido] = useState(false)

  // Seleção
  const [selecionados, setSelecionados] = useState(new Set())

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('instrumentos')
        .select('id,nome,tipo,empresa_id,operacao_id,sindicato_laboral_id,sindicato_patronal_id')
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

  // Mapa rápido para lookup
  const empMap = Object.fromEntries(empresas.map(e => [e.id, e]))

  // Instrumentos filtrados pelos critérios de busca
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

  // Se o instrumento selecionado sair da lista filtrada, limpa
  useEffect(() => {
    if (filtros.instrumento && !instrumentosFiltrados.some(i => i.id === filtros.instrumento)) {
      setFiltros(f => ({ ...f, instrumento: '', categoria: '', subcategoria: '' }))
    }
  }, [instrumentosFiltrados.length])

  // Subcategorias disponíveis para categoria selecionada
  useEffect(() => {
    if (!filtros.instrumento || !filtros.categoria) { setSubcatsDisponiveis([]); return }
    supabase.from('clausulas').select('subcategoria')
      .eq('instrumento_id', filtros.instrumento).eq('user_id', user.id).eq('categoria', filtros.categoria)
      .then(({ data }) => {
        setSubcatsDisponiveis([...new Set((data || []).map(c => c.subcategoria).filter(Boolean))].sort())
      })
  }, [filtros.instrumento, filtros.categoria])

  // Buscar cláusulas
  useEffect(() => {
    if (!filtros.instrumento) { setClausulas([]); return }
    setLoading(true)
    let q = supabase.from('clausulas').select('*').eq('instrumento_id', filtros.instrumento).eq('user_id', user.id)
    if (filtros.categoria)    q = q.eq('categoria', filtros.categoria)
    if (filtros.subcategoria) q = q.eq('subcategoria', filtros.subcategoria)
    if (filtros.busca)        q = q.or(`titulo.ilike.%${filtros.busca}%,conteudo.ilike.%${filtros.busca}%`)
    q.then(({ data }) => {
      setClausulas(ordenarClausulas(data || []))
      setLoading(false)
      setSelecionados(new Set())
    })
  }, [filtros])

  const clausulasOrdenadas = (() => {
    if (ordem === 'asc')  return [...clausulas].sort((a,b)=>toNumeroOrdinal(a.numero)-toNumeroOrdinal(b.numero))
    if (ordem === 'desc') return [...clausulas].sort((a,b)=>toNumeroOrdinal(b.numero)-toNumeroOrdinal(a.numero))
    return clausulas
  })()

  async function toggleTag(clausula, tag) {
    const tags = clausula.tags || []
    const novo = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]
    await supabase.from('clausulas').update({ tags: novo }).eq('id', clausula.id)
    setClausulas(cs => cs.map(c => c.id === clausula.id ? { ...c, tags: novo } : c))
  }

  function toggleCard(id) {
    setExpandidos(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleExpandAll() { setModoExpandido(v => !v); setExpandidos(new Set()) }
  const isExpanded = id => modoExpandido ? !expandidos.has(id) : expandidos.has(id)

  function toggleSelecionado(id) {
    setSelecionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const todosSelecionados = clausulasOrdenadas.length > 0 && clausulasOrdenadas.every(c => selecionados.has(c.id))
  function toggleSelecionarTodos() {
    todosSelecionados ? setSelecionados(new Set()) : setSelecionados(new Set(clausulasOrdenadas.map(c => c.id)))
  }

  const instObj = todosInstrumentos.find(i => i.id === filtros.instrumento)
  function exportar(tipo) {
    const itens = selecionados.size > 0
      ? clausulasOrdenadas.filter(c => selecionados.has(c.id))
      : clausulasOrdenadas
    if (tipo === 'excel') gerarExcelClausulas(itens, instObj)
    else gerarPDFClausulas(itens, instObj)
  }

  const temFiltroInstrumento = buscaEmpresa || filtroOperacao || filtroSindLab || filtroSindPat
  function limparFiltrosInstrumento() {
    setBuscaEmpresa(''); setFiltroOperacao(''); setFiltroSindLab(''); setFiltroSindPat('')
  }

  return (
    <div className="pb-24">
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-800">Consulta de Cláusulas</h1>
        <p className="text-slate-500 text-sm">Busque e navegue pelas cláusulas de qualquer instrumento processado</p>
      </div>

      <div className="card p-4 mb-4">
        {/* Filtros para encontrar o instrumento */}
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Encontrar instrumento por</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div className="lg:col-span-2">
            <label className="label">Empresa (nome ou CNPJ)</label>
            <input className="input" placeholder="Ex: Transportadora XYZ ou 12.345.678/0001"
              value={buscaEmpresa} onChange={e => setBuscaEmpresa(e.target.value)}/>
          </div>
          <div>
            <label className="label">Operação</label>
            <select className="input" value={filtroOperacao} onChange={e => setFiltroOperacao(e.target.value)}>
              <option value="">Todas</option>
              {operacoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>
          <div>
            {temFiltroInstrumento && (
              <div className="flex items-end h-full pb-0.5">
                <button className="btn-secondary text-xs w-full" onClick={limparFiltrosInstrumento}>✕ Limpar filtros</button>
              </div>
            )}
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
          {temFiltroInstrumento && (
            <div className="lg:col-span-2 flex items-center">
              <p className="text-xs text-brand-600">{instrumentosFiltrados.length} instrumento(s) encontrado(s)</p>
            </div>
          )}
        </div>

        {/* Filtros dentro do instrumento */}
        <div className="border-t border-slate-100 pt-3 mt-1">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="col-span-2 lg:col-span-1">
              <label className="label">Instrumento</label>
              <select className="input" value={filtros.instrumento}
                onChange={e => setFiltros({ ...filtros, instrumento: e.target.value, categoria: '', subcategoria: '' })}>
                <option value="">Selecione um instrumento...</option>
                {instrumentosFiltrados.map(i => {
                  const emp = empMap[i.empresa_id]
                  return <option key={i.id} value={i.id}>{i.tipo} — {i.nome}{emp ? ` (${emp.razao_social})` : ''}</option>
                })}
              </select>
            </div>
            <div>
              <label className="label">Categoria</label>
              <select className="input" value={filtros.categoria}
                onChange={e => setFiltros({ ...filtros, categoria: e.target.value, subcategoria: '' })}
                disabled={!filtros.instrumento}>
                <option value="">Todas</option>
                {Object.keys(CATEGORIAS).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Subcategoria</label>
              <select className="input" value={filtros.subcategoria}
                onChange={e => setFiltros({ ...filtros, subcategoria: e.target.value })}
                disabled={!filtros.categoria || subcatsDisponiveis.length === 0}>
                <option value="">Todas</option>
                {subcatsDisponiveis.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Busca livre</label>
              <input className="input" placeholder="Palavra no título ou conteúdo..."
                value={filtros.busca} onChange={e => setFiltros({ ...filtros, busca: e.target.value })}/>
            </div>
          </div>
        </div>
      </div>

      {!filtros.instrumento && (
        <div className="card p-10 text-center text-slate-400">
          <p className="text-4xl mb-3">🔍</p>
          <p>Selecione um instrumento para visualizar as cláusulas</p>
        </div>
      )}

      {filtros.instrumento && loading && <p className="text-slate-400 text-sm">Carregando cláusulas...</p>}

      {filtros.instrumento && !loading && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <p className="text-xs text-slate-500 mr-1">{clausulasOrdenadas.length} cláusula(s)</p>
            <select className="input w-auto text-xs" value={ordem} onChange={e => setOrdem(e.target.value)}>
              <option value="padrao">Ordem padrão</option>
              <option value="asc">Nº — crescente</option>
              <option value="desc">Nº — decrescente</option>
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
            <span>{todosSelecionados ? 'Desselecionar tudo' : 'Selecionar tudo'} — {clausulasOrdenadas.length} cláusula(s)</span>
            {selecionados.size > 0 && <span className="ml-auto text-brand-600 font-medium">{selecionados.size} selecionada(s)</span>}
          </div>

          <div className="space-y-2">
            {clausulasOrdenadas.length === 0 && (
              <div className="card p-8 text-center text-slate-400">Nenhuma cláusula encontrada.</div>
            )}
            {clausulasOrdenadas.map(c => (
              <div key={c.id} className={'card overflow-hidden transition-all ' + (selecionados.has(c.id) ? 'ring-2 ring-brand-400' : '')}>
                <div className="w-full text-left p-4 hover:bg-surface-50 transition-colors cursor-pointer"
                  onClick={() => toggleCard(c.id)}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selecionados.has(c.id)}
                      onChange={() => toggleSelecionado(c.id)}
                      onClick={e => e.stopPropagation()}
                      className="mt-0.5 w-4 h-4 flex-shrink-0 cursor-pointer accent-blue-600"/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {c.numero && (
                          <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                            {c.numero}
                          </span>
                        )}
                        <Badge className={CATEGORIA_CORES[c.categoria] || 'bg-slate-100 text-slate-600'}>
                          {c.categoria}
                        </Badge>
                        {c.subcategoria && <span className="text-xs text-slate-400">{c.subcategoria}</span>}
                      </div>
                      <p className="font-medium text-slate-800">{c.titulo}</p>
                      {(c.tags || []).length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {c.tags.map(tag => {
                            const t = TAGS_PREDEFINIDAS.find(tp => tp.label === tag)
                            return (
                              <span key={tag} className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (t?.color || 'bg-slate-100 text-slate-600')}>
                                {tag}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <span className="text-slate-300 text-sm flex-shrink-0">{isExpanded(c.id) ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded(c.id) && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                    {c.vigencia_especifica && (
                      <p className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg mb-3">
                        ⚠️ Vigência específica: {c.vigencia_especifica}
                      </p>
                    )}
                    {c.observacoes && c.observacoes.trim() && (
                      <p className="text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg mb-3">
                        💡 {c.observacoes}
                      </p>
                    )}
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{c.conteudo}</p>
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <p className="text-xs font-medium text-slate-400 mb-2">Etiquetas:</p>
                      <div className="flex gap-2 flex-wrap">
                        {TAGS_PREDEFINIDAS.map(tag => {
                          const ativa = (c.tags || []).includes(tag.label)
                          return (
                            <button key={tag.label} onClick={() => toggleTag(c, tag.label)}
                              className={'text-xs px-2 py-1 rounded-full border transition-all ' + (
                                ativa ? tag.color + ' border-transparent font-medium' : 'border-slate-200 text-slate-400 hover:border-slate-300'
                              )}>
                              {ativa ? '✓ ' : ''}{tag.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
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
