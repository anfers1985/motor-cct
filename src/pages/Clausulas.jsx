import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { CATEGORIAS, CATEGORIA_CORES, TAGS_PREDEFINIDAS } from '../utils/categorias'
import { ordenarClausulas, toNumeroOrdinal } from '../utils/ordenacao'
import Badge from '../components/UI/Badge'
import CheckList from '../components/UI/CheckList'
import StepCard from '../components/UI/StepCard'
import { gerarExcelClausulas } from '../services/reports/excelReport'
import { gerarPDFClausulas } from '../services/reports/pdfReport'

export default function Clausulas() {
  const { user } = useAuth()

  // Dados de referência
  const [todosInstrumentos, setTodosInstrumentos] = useState([])
  const [empresas,   setEmpresas]   = useState([])
  const [operacoes,  setOperacoes]  = useState([])
  const [sindicatos, setSindicatos] = useState([])

  // Stepper
  const [stepAtivo,   setStepAtivo]   = useState(1)
  const [confirmados, setConfirmados] = useState(new Set())
  const [sels, setSels] = useState({
    empresas: [], operacoes: [], sindicatosLab: [], sindicatosPat: [],
    instrumento: '', categoria: '', subcategoria: '', busca: '',
  })
  const [buscas, setBuscas] = useState({ emp: '', op: '', sindLab: '', sindPat: '', inst: '' })

  // Resultado
  const [clausulas, setClausulas] = useState([])
  const [loading, setLoading] = useState(false)
  const [ordem, setOrdem] = useState('padrao')
  const [expandidos, setExpandidos] = useState(new Set())
  const [modoExpandido, setModoExpandido] = useState(false)
  const [selecionados, setSelecionados] = useState(new Set())

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('instrumentos')
        .select('id,nome,tipo,empresa_id,operacao_id,sindicato_laboral_id,sindicato_patronal_id')
        .eq('status_processamento', 'processado').order('nome'),
      supabase.from('empresas').select('id,razao_social,cnpj').order('razao_social'),
      supabase.from('operacoes').select('id,nome,codigo').order('nome'),
      supabase.from('sindicatos').select('id,razao_social,sigla,tipo,cnpj').order('razao_social'),
    ]).then(([{data:insts},{data:emps},{data:ops},{data:sinds}]) => {
      setTodosInstrumentos(insts || [])
      setEmpresas(emps || [])
      setOperacoes(ops || [])
      setSindicatos(sinds || [])
    })
  }, [user])

  const empMap  = Object.fromEntries(empresas.map(e => [e.id, e]))
  const opMap   = Object.fromEntries(operacoes.map(o => [o.id, o]))
  const sindMap = Object.fromEntries(sindicatos.map(s => [s.id, s]))

  const laboral  = sindicatos.filter(s => s.tipo === 'laboral')
  const patronal = sindicatos.filter(s => s.tipo === 'patronal')

  // ── Cascade de opções ────────────────────────────────────────────────────
  const instsPorEmpresa = sels.empresas.length > 0
    ? todosInstrumentos.filter(i => sels.empresas.includes(i.empresa_id))
    : todosInstrumentos

  const opcoesOp = operacoes.filter(o => instsPorEmpresa.some(i => i.operacao_id === o.id))

  const instsPorOp = sels.operacoes.length > 0
    ? instsPorEmpresa.filter(i => sels.operacoes.includes(i.operacao_id))
    : instsPorEmpresa

  const opcoesLab = laboral.filter(s  => instsPorOp.some(i => i.sindicato_laboral_id  === s.id))
  const opcoesPat = patronal.filter(s => instsPorOp.some(i => i.sindicato_patronal_id === s.id))

  const instsPorSind = (() => {
    let arr = instsPorOp
    if (sels.sindicatosLab.length > 0) arr = arr.filter(i => sels.sindicatosLab.includes(i.sindicato_laboral_id))
    if (sels.sindicatosPat.length > 0) arr = arr.filter(i => sels.sindicatosPat.includes(i.sindicato_patronal_id))
    return arr
  })()

  const opcoesInst = instsPorSind.map(i => ({
    value: i.id, label: i.tipo + ' — ' + i.nome + (empMap[i.empresa_id] ? ` (${empMap[i.empresa_id].razao_social})` : ''),
  }))

  // ── Confirmar / editar ────────────────────────────────────────────────────
  function confirmar(step, pularTodos = false) {
    if (pularTodos) {
      if (step === 1) setSels(prev => ({ ...prev, empresas: [] }))
      if (step === 2) setSels(prev => ({ ...prev, operacoes: [] }))
      if (step === 3) setSels(prev => ({ ...prev, sindicatosLab: [], sindicatosPat: [] }))
    }
    const novos = new Set(confirmados)
    novos.add(step)
    for (let s = step + 1; s <= 4; s++) novos.delete(s)
    setConfirmados(novos)
    setStepAtivo(step + 1)
  }

  function editar(step) {
    setStepAtivo(step)
    const novos = new Set(confirmados)
    for (let s = step; s <= 4; s++) novos.delete(s)
    setConfirmados(novos)
    if (step <= 1) setSels(prev => ({ ...prev, operacoes: [], sindicatosLab: [], sindicatosPat: [], instrumento: '' }))
    else if (step === 2) setSels(prev => ({ ...prev, sindicatosLab: [], sindicatosPat: [], instrumento: '' }))
    else if (step === 3) setSels(prev => ({ ...prev, instrumento: '' }))
  }

  function resetar() {
    setStepAtivo(1)
    setConfirmados(new Set())
    setSels({ empresas:[], operacoes:[], sindicatosLab:[], sindicatosPat:[], instrumento:'', categoria:'', subcategoria:'', busca:'' })
    setBuscas({ emp:'', op:'', sindLab:'', sindPat:'', inst:'' })
    setClausulas([]); setSelecionados(new Set()); setExpandidos(new Set()); setModoExpandido(false)
  }

  function resumo(step) {
    const label2 = (arr, map, fn) => {
      if (!arr.length) return null
      const nomes = arr.slice(0, 2).map(id => fn(map[id])).filter(Boolean)
      return nomes.join(' · ') + (arr.length > 2 ? ` +${arr.length - 2}` : '')
    }
    switch (step) {
      case 1: return sels.empresas.length === 0 ? 'Todas as empresas' : label2(sels.empresas, empMap, e => e?.razao_social)
      case 2: return sels.operacoes.length === 0 ? 'Todas as operações' : label2(sels.operacoes, opMap, o => o?.nome)
      case 3: {
        const lab = sels.sindicatosLab.length === 0 ? 'Todos laborais' : label2(sels.sindicatosLab, sindMap, s => s?.sigla || s?.razao_social)
        const pat = sels.sindicatosPat.length === 0 ? 'Todos patronais' : label2(sels.sindicatosPat, sindMap, s => s?.sigla || s?.razao_social)
        return lab + ' | ' + pat
      }
      case 4: {
        const inst = todosInstrumentos.find(i => i.id === sels.instrumento)
        return inst ? inst.tipo + ' — ' + inst.nome : ''
      }
      default: return ''
    }
  }

  // Se o instrumento selecionado sair da lista filtrada, limpa
  useEffect(() => {
    if (sels.instrumento && !instsPorSind.some(i => i.id === sels.instrumento)) {
      setSels(prev => ({ ...prev, instrumento: '', categoria: '', subcategoria: '' }))
    }
  }, [instsPorSind.length])

  // Buscar cláusulas — o filtro de categoria/subcategoria é aplicado considerando TODAS as
  // classificações da cláusula (principal + adicionais, vindas de clausula_categorias), não
  // só a coluna clausulas.categoria/subcategoria. Isso é o que permite uma mesma cláusula
  // aparecer em mais de um filtro quando ela trata de mais de um tema.
  useEffect(() => {
    if (!sels.instrumento) { setClausulas([]); return }
    setLoading(true)
    let q = supabase.from('clausulas').select('*').eq('instrumento_id', sels.instrumento)
    if (sels.busca) q = q.or(`titulo.ilike.%${sels.busca}%,conteudo.ilike.%${sels.busca}%`)
    q.then(async ({ data }) => {
      const base = data || []
      const ids = base.map(c => c.id)
      let classifsPorClausula = {}
      if (ids.length > 0) {
        const { data: classifs } = await supabase
          .from('clausula_categorias')
          .select('clausula_id, categoria, subcategoria')
          .in('clausula_id', ids)
        for (const cl of (classifs || [])) {
          if (!classifsPorClausula[cl.clausula_id]) classifsPorClausula[cl.clausula_id] = []
          classifsPorClausula[cl.clausula_id].push({ categoria: cl.categoria, subcategoria: cl.subcategoria })
        }
      }
      const comClassificacoes = base.map(c => ({
        ...c,
        // Fallback para cláusulas ainda não migradas para clausula_categorias: usa a
        // classificação da própria coluna categoria/subcategoria.
        classificacoes: classifsPorClausula[c.id]?.length
          ? classifsPorClausula[c.id]
          : (c.categoria ? [{ categoria: c.categoria, subcategoria: c.subcategoria }] : []),
      }))
      const filtradas = comClassificacoes.filter(c => {
        if (!sels.categoria) return true
        return c.classificacoes.some(cl =>
          cl.categoria === sels.categoria && (!sels.subcategoria || cl.subcategoria === sels.subcategoria)
        )
      })
      setClausulas(ordenarClausulas(filtradas))
      setLoading(false)
      setSelecionados(new Set())
    })
  }, [sels.instrumento, sels.categoria, sels.subcategoria, sels.busca])

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

  const instObj = todosInstrumentos.find(i => i.id === sels.instrumento)
  function exportar(tipo) {
    const itens = selecionados.size > 0
      ? clausulasOrdenadas.filter(c => selecionados.has(c.id))
      : clausulasOrdenadas
    if (tipo === 'excel') gerarExcelClausulas(itens, instObj)
    else gerarPDFClausulas(itens, instObj)
  }

  const passo4Liberado = confirmados.has(3)

  return (
    <div className="pb-24">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-800">Consulta de Cláusulas</h1>
          <p className="text-slate-500 text-sm">Busque e navegue pelas cláusulas de qualquer instrumento processado</p>
        </div>
        {confirmados.size > 0 && (
          <button onClick={resetar} className="btn-secondary text-xs py-1.5 flex-shrink-0 mt-1">
            ↺ Recomeçar
          </button>
        )}
      </div>

      {/* Stepper */}
      <StepCard number="1" title="Empresa" subtitle="Busque por nome ou CNPJ"
        active={stepAtivo === 1} done={confirmados.has(1)} locked={false}
        summary={resumo(1)} onEdit={() => editar(1)}
        onConfirm={() => confirmar(1)} onSkip={() => confirmar(1, true)}>
        <CheckList
          opcoes={empresas.map(e => ({ value: e.id, label: e.razao_social, cnpj: e.cnpj || '' }))}
          selecionados={sels.empresas}
          onChange={v => setSels(prev => ({ ...prev, empresas: v }))}
          busca={buscas.emp} onBusca={v => setBuscas(b => ({ ...b, emp: v }))}/>
      </StepCard>

      <StepCard number="2" title="Operação"
        subtitle={opcoesOp.length + ' operação(ões) disponível(is)'}
        active={stepAtivo === 2} done={confirmados.has(2)} locked={stepAtivo < 2 && !confirmados.has(1)}
        summary={resumo(2)} onEdit={() => editar(2)}
        onConfirm={() => confirmar(2)} onSkip={() => confirmar(2, true)}>
        <CheckList
          opcoes={opcoesOp.map(o => ({ value: o.id, label: o.nome + (o.codigo ? ' (' + o.codigo + ')' : '') }))}
          selecionados={sels.operacoes}
          onChange={v => setSels(prev => ({ ...prev, operacoes: v }))}
          busca={buscas.op} onBusca={v => setBuscas(b => ({ ...b, op: v }))}/>
      </StepCard>

      <StepCard number="3" title="Sindicatos" subtitle="Laboral e patronal disponíveis para a seleção acima"
        active={stepAtivo === 3} done={confirmados.has(3)} locked={stepAtivo < 3 && !confirmados.has(2)}
        summary={resumo(3)} onEdit={() => editar(3)}
        onConfirm={() => confirmar(3)} onSkip={() => confirmar(3, true)}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">Sindicato Laboral</p>
            <CheckList
              opcoes={opcoesLab.map(s => ({ value: s.id, label: (s.sigla?s.sigla+' — ':'')+s.razao_social, cnpj: s.cnpj||'' }))}
              selecionados={sels.sindicatosLab}
              onChange={v => setSels(prev => ({ ...prev, sindicatosLab: v }))}
              busca={buscas.sindLab} onBusca={v => setBuscas(b => ({ ...b, sindLab: v }))}/>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">Sindicato Patronal</p>
            <CheckList
              opcoes={opcoesPat.map(s => ({ value: s.id, label: (s.sigla?s.sigla+' — ':'')+s.razao_social, cnpj: s.cnpj||'' }))}
              selecionados={sels.sindicatosPat}
              onChange={v => setSels(prev => ({ ...prev, sindicatosPat: v }))}
              busca={buscas.sindPat} onBusca={v => setBuscas(b => ({ ...b, sindPat: v }))}/>
          </div>
        </div>
      </StepCard>

      <StepCard number="4" title="Instrumento e Filtros de Cláusulas"
        subtitle={opcoesInst.length + ' instrumento(s) disponível(is)'}
        active={stepAtivo === 4} done={confirmados.has(4)} locked={stepAtivo < 4 && !passo4Liberado}
        summary={resumo(4)} onEdit={() => editar(4)}
        onConfirm={() => confirmar(4)}>
        <div className="mb-4">
          <label className="label">Instrumento</label>
          <select className="input" value={sels.instrumento}
            onChange={e => setSels(prev => ({ ...prev, instrumento: e.target.value, categoria: '', subcategoria: '' }))}>
            <option value="">Selecione um instrumento...</option>
            {opcoesInst.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={sels.categoria}
              onChange={e => setSels(prev => ({ ...prev, categoria: e.target.value, subcategoria: '' }))}
              disabled={!sels.instrumento}>
              <option value="">Todas</option>
              {Object.keys(CATEGORIAS).map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Subcategoria</label>
            <select className="input" value={sels.subcategoria}
              onChange={e => setSels(prev => ({ ...prev, subcategoria: e.target.value }))}
              disabled={!sels.categoria}>
              <option value="">Todas</option>
              {(CATEGORIAS[sels.categoria] || []).map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Busca livre</label>
            <input className="input" placeholder="Palavra no título ou conteúdo..."
              value={sels.busca} onChange={e => setSels(prev => ({ ...prev, busca: e.target.value }))}/>
          </div>
        </div>
      </StepCard>

      {/* Resultado */}
      {confirmados.has(4) && !sels.instrumento && (
        <div className="card p-10 text-center text-slate-400 mt-4">
          <p className="text-4xl mb-3">🔍</p>
          <p>Selecione um instrumento no passo 4 para visualizar as cláusulas</p>
        </div>
      )}

      {sels.instrumento && loading && <p className="text-slate-400 text-sm mt-4">Carregando cláusulas...</p>}

      {sels.instrumento && !loading && (
        <div className="mt-4">
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
                        {(c.classificacoes || []).filter(cl => cl.categoria !== c.categoria || cl.subcategoria !== c.subcategoria).map((cl, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-slate-200">
                            + {cl.categoria} · {cl.subcategoria}
                          </span>
                        ))}
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
        </div>
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
