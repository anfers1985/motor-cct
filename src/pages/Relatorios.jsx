import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { vigenciaStatus } from '../utils/formatters'
import { CATEGORIAS } from '../utils/categorias'
import { gerarExcelMultiplo, gerarExcelInstrumento } from '../services/reports/excelReport'
import { gerarPDFInstrumento } from '../services/reports/pdfReport'
import CheckList from '../components/UI/CheckList'
import StepCard from '../components/UI/StepCard'

// ── Relatórios ────────────────────────────────────────────────────────────────
export default function Relatorios() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)

  // Dados brutos
  const [todasEmpresas,     setTodasEmpresas]     = useState([])
  const [todasOperacoes,    setTodasOperacoes]     = useState([])
  const [todosSindicatos,   setTodosSindicatos]    = useState([])
  const [todosInstrumentos, setTodosInstrumentos]  = useState([])

  // Passo atual (1-4), passos confirmados
  const [stepAtivo,       setStepAtivo]       = useState(1)
  const [confirmados,     setConfirmados]     = useState(new Set())

  // Seleções de cada nível
  const [sels, setSels] = useState({
    empresas: [], operacoes: [], sindicatosLab: [], sindicatosPat: [],
    instrumentos: [], vigencia: '', categorias: [], subcategorias: [],
  })

  // Buscas locais por nível
  const [buscas, setBuscas] = useState({ emp: '', op: '', sindLab: '', sindPat: '', inst: '' })

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('empresas').select('id,razao_social,cnpj').eq('user_id', user.id).order('razao_social'),
      supabase.from('operacoes').select('id,nome,codigo').eq('user_id', user.id).order('nome'),
      supabase.from('sindicatos').select('id,razao_social,sigla,tipo,cnpj').eq('user_id', user.id).order('razao_social'),
      supabase.from('instrumentos')
        .select('id,nome,tipo,vigencia_inicio,vigencia_fim,empresa_id,operacao_id,sindicato_laboral_id,sindicato_patronal_id')
        .eq('user_id', user.id).eq('status_processamento', 'processado').order('nome'),
    ]).then(([{ data: e }, { data: o }, { data: s }, { data: i }]) => {
      setTodasEmpresas(e || [])
      setTodasOperacoes(o || [])
      setTodosSindicatos(s || [])
      setTodosInstrumentos(i || [])
    })
  }, [user])

  // ── Mapas rápidos para labels ────────────────────────────────────────────
  const empMap  = Object.fromEntries(todasEmpresas.map(e => [e.id, e]))
  const opMap   = Object.fromEntries(todasOperacoes.map(o => [o.id, o]))
  const sindMap = Object.fromEntries(todosSindicatos.map(s => [s.id, s]))
  const instMap = Object.fromEntries(todosInstrumentos.map(i => [i.id, i]))

  const laboral  = todosSindicatos.filter(s => s.tipo === 'laboral')
  const patronal = todosSindicatos.filter(s => s.tipo === 'patronal')

  // ── Cascade: opções filtradas por seleções anteriores ───────────────────
  const instsPorEmpresa = sels.empresas.length > 0
    ? todosInstrumentos.filter(i => sels.empresas.includes(i.empresa_id))
    : todosInstrumentos

  const opcoesOp = todasOperacoes.filter(o => instsPorEmpresa.some(i => i.operacao_id === o.id))

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
    value: i.id,
    label: i.tipo + ' — ' + i.nome,
    cnpj: '',
  }))

  const subcatsDisponiveis = sels.categorias.length > 0
    ? [...new Set(sels.categorias.flatMap(cat => CATEGORIAS[cat] || []))]
    : [...new Set(Object.values(CATEGORIAS).flat())]

  // ── Confirmar / editar passos ────────────────────────────────────────────
  function confirmar(step, pularTodos = false) {
    if (pularTodos) {
      const clearMap = { 1: ['operacoes','sindicatosLab','sindicatosPat','instrumentos'], 2: ['sindicatosLab','sindicatosPat','instrumentos'], 3: ['instrumentos'] }
      const clear = clearMap[step] || []
      const patch = {}; clear.forEach(k => { patch[k] = [] })
      const empresasPatch = step === 1 ? { empresas: [] } : {}
      const opsPatch = step === 2 ? { operacoes: [] } : {}
      const sindPatch = step === 3 ? { sindicatosLab: [], sindicatosPat: [] } : {}
      setSels(prev => ({ ...prev, ...empresasPatch, ...opsPatch, ...sindPatch, ...patch }))
    }
    const novos = new Set(confirmados)
    novos.add(step)
    // limpa confirmações downstream
    for (let s = step + 1; s <= 4; s++) novos.delete(s)
    setConfirmados(novos)
    setStepAtivo(step + 1)
    setPreview(null)
  }

  function editar(step) {
    setStepAtivo(step)
    const novos = new Set(confirmados)
    for (let s = step; s <= 4; s++) novos.delete(s)
    setConfirmados(novos)
    // limpa seleções downstream ao editar
    if (step <= 1) setSels(prev => ({ ...prev, operacoes: [], sindicatosLab: [], sindicatosPat: [], instrumentos: [] }))
    else if (step === 2) setSels(prev => ({ ...prev, sindicatosLab: [], sindicatosPat: [], instrumentos: [] }))
    else if (step === 3) setSels(prev => ({ ...prev, instrumentos: [] }))
    setPreview(null)
  }

  // ── Resumo de cada passo (colapsado) ────────────────────────────────────
  function resumo(step) {
    const { empresas, operacoes, sindicatosLab, sindicatosPat, instrumentos } = sels
    const label2 = (arr, map, fn) => {
      if (!arr.length) return null
      const nomes = arr.slice(0, 2).map(id => fn(map[id])).filter(Boolean)
      return nomes.join(' · ') + (arr.length > 2 ? ` +${arr.length - 2}` : '')
    }
    switch (step) {
      case 1: return empresas.length === 0
        ? 'Todas as empresas incluídas'
        : label2(empresas, empMap, e => e?.razao_social)
      case 2: return operacoes.length === 0
        ? 'Todas as operações incluídas'
        : label2(operacoes, opMap, o => o?.nome)
      case 3: {
        const lab = sindicatosLab.length === 0 ? 'Todos os laborais' : label2(sindicatosLab, sindMap, s => s?.sigla || s?.razao_social)
        const pat = sindicatosPat.length === 0 ? 'Todos os patronais' : label2(sindicatosPat, sindMap, s => s?.sigla || s?.razao_social)
        return lab + ' | ' + pat
      }
      case 4: return instrumentos.length === 0
        ? 'Todos os instrumentos incluídos (' + instsPorSind.length + ')'
        : label2(instrumentos, instMap, i => i?.nome)
      default: return ''
    }
  }

  // ── Filtrar para exportar ────────────────────────────────────────────────
  function filtrarParaExportar() {
    let arr = [...instsPorSind]
    if (sels.instrumentos.length > 0) arr = arr.filter(i => sels.instrumentos.includes(i.id))
    if (sels.vigencia === 'vigente')  arr = arr.filter(i => vigenciaStatus(i.vigencia_fim) === 'vigente')
    else if (sels.vigencia === 'vencido') arr = arr.filter(i => vigenciaStatus(i.vigencia_fim) === 'vencido')
    else if (sels.vigencia === 'alerta')  arr = arr.filter(i => vigenciaStatus(i.vigencia_fim) === 'alerta')
    else if (sels.vigencia === 'ultimo_vigente') {
      const grupos = {}
      for (const i of arr) {
        const key = (i.empresa_id||'') + (i.operacao_id||'') + (i.sindicato_laboral_id||'')
        if (!grupos[key]) grupos[key] = []
        grupos[key].push(i)
      }
      arr = Object.values(grupos).map(g => {
        const vig = g.filter(i => vigenciaStatus(i.vigencia_fim) === 'vigente')
        return (vig.length > 0 ? vig : g).sort((a, b) => new Date(b.vigencia_fim||0) - new Date(a.vigencia_fim||0))[0]
      })
    }
    return arr
  }

  async function calcularPreview() {
    const insts = filtrarParaExportar()
    if (!insts.length) { setPreview({ count: 0, n: 0 }); return }
    let total = 0
    for (const inst of insts) {
      const { count } = await supabase.from('clausulas').select('*', { count: 'exact', head: true })
        .eq('instrumento_id', inst.id).eq('user_id', user.id)
      total += count || 0
    }
    setPreview({ count: total, n: insts.length })
  }

  // Busca as cláusulas dos instrumentos selecionados e aplica o filtro de categoria/
  // subcategoria considerando TODAS as classificações de cada cláusula (principal +
  // adicionais, vindas de clausula_categorias) — não só a coluna categoria/subcategoria
  // da cláusula. Assim uma cláusula que trata de dois temas aparece nos dois filtros.
  // Como o dicionário canônico (utils/categorias.js) já é a única fonte de vocabulário
  // usada em toda a aplicação, não é mais necessário "expandir variações conhecidas".
  async function buscarDados() {
    const insts = filtrarParaExportar()
    if (!insts.length) return { insts: [], clausulas: [] }

    const temFiltro = sels.categorias.length > 0 || sels.subcategorias.length > 0

    let clausulas = []
    for (const inst of insts) {
      const { data } = await supabase.from('clausulas').select('*').eq('instrumento_id', inst.id).eq('user_id', user.id)
      const base = data || []
      const ids = base.map(c => c.id)

      // Busca sempre as classificações completas — usadas tanto para filtrar (quando há
      // filtro de categoria/subcategoria) quanto para exibir "Categorias Adicionais" no
      // relatório final (mesmo sem filtro).
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
        // Fallback para cláusulas ainda não migradas para clausula_categorias
        classificacoes: classifsPorClausula[c.id]?.length
          ? classifsPorClausula[c.id]
          : (c.categoria ? [{ categoria: c.categoria, subcategoria: c.subcategoria }] : []),
      }))

      const filtradas = temFiltro
        ? comClassificacoes.filter(c => c.classificacoes.some(cl =>
            (sels.categorias.length === 0 || sels.categorias.includes(cl.categoria)) &&
            (sels.subcategorias.length === 0 || sels.subcategorias.includes(cl.subcategoria))
          ))
        : comClassificacoes

      clausulas = clausulas.concat(filtradas)
    }
    return { insts, clausulas }
  }

  async function exportarExcel() {
    setLoading(true)
    try {
      const { insts, clausulas } = await buscarDados()
      if (!clausulas.length) { alert('Nenhuma cláusula encontrada.'); return }
      if (insts.length === 1) {
        const inst = insts[0]
        const [{ data: emp },{ data: op },{ data: sLab },{ data: sPat }] = await Promise.all([
          inst.empresa_id ? supabase.from('empresas').select('*').eq('id',inst.empresa_id).single() : {data:null},
          inst.operacao_id ? supabase.from('operacoes').select('*').eq('id',inst.operacao_id).single() : {data:null},
          inst.sindicato_laboral_id ? supabase.from('sindicatos').select('*').eq('id',inst.sindicato_laboral_id).single() : {data:null},
          inst.sindicato_patronal_id ? supabase.from('sindicatos').select('*').eq('id',inst.sindicato_patronal_id).single() : {data:null},
        ])
        await gerarExcelInstrumento(inst, clausulas, emp, op, sLab, sPat)
      } else {
        const [{ data: emps },{ data: ops },{ data: sinds }] = await Promise.all([
          supabase.from('empresas').select('*').eq('user_id',user.id),
          supabase.from('operacoes').select('*').eq('user_id',user.id),
          supabase.from('sindicatos').select('*').eq('user_id',user.id),
        ])
        await gerarExcelMultiplo(insts, clausulas, emps, ops, sinds)
      }
    } catch (e) { alert('Erro: ' + e.message) }
    setLoading(false)
  }

  async function exportarPDF() {
    setLoading(true)
    try {
      const { insts, clausulas } = await buscarDados()
      if (!clausulas.length) { alert('Nenhuma cláusula encontrada.'); return }
      for (const inst of insts) {
        const clausulasInst = clausulas.filter(c => c.instrumento_id === inst.id)
        if (!clausulasInst.length) continue
        const [{ data: emp },{ data: op },{ data: sLab },{ data: sPat }] = await Promise.all([
          inst.empresa_id ? supabase.from('empresas').select('*').eq('id',inst.empresa_id).single() : {data:null},
          inst.operacao_id ? supabase.from('operacoes').select('*').eq('id',inst.operacao_id).single() : {data:null},
          inst.sindicato_laboral_id ? supabase.from('sindicatos').select('*').eq('id',inst.sindicato_laboral_id).single() : {data:null},
          inst.sindicato_patronal_id ? supabase.from('sindicatos').select('*').eq('id',inst.sindicato_patronal_id).single() : {data:null},
        ])
        gerarPDFInstrumento(inst, clausulasInst, emp, op, sLab, sPat)
        if (insts.length > 1) await new Promise(r => setTimeout(r, 600))
      }
    } catch (e) { alert('Erro: ' + e.message) }
    setLoading(false)
  }

  const instsParaExportar = filtrarParaExportar()
  const tudo4Confirmado   = confirmados.has(1)

  const S = sels

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-800">Relatórios</h1>
          <p className="text-slate-500 text-sm">Selecione os filtros em 4 passos e gere relatórios em Excel ou PDF</p>
        </div>
        {confirmados.size > 0 && (
          <button onClick={() => {
            setSels({ empresas:[],operacoes:[],sindicatosLab:[],sindicatosPat:[],instrumentos:[],vigencia:'',categorias:[],subcategorias:[] })
            setConfirmados(new Set()); setStepAtivo(1)
            setBuscas({ emp:'',op:'',sindLab:'',sindPat:'',inst:'' }); setPreview(null)
          }} className="btn-secondary text-xs py-1.5 flex-shrink-0 mt-1">
            ↺ Recomeçar
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Coluna principal — Stepper */}
        <div className="lg:col-span-2">
          <div className="card p-4 mb-4">
            <h2 className="font-medium text-slate-700 text-sm mb-1">🔍 Filtros do Relatório</h2>
            <p className="text-xs text-slate-400">Complete os passos abaixo. Deixe sem seleção para incluir todos do nível e avançar.</p>
          </div>

          {/* Passo 1 — Empresa */}
          <StepCard number="1" title="Empresa" subtitle="Busque por nome ou CNPJ"
            active={stepAtivo === 1} done={confirmados.has(1)} locked={false}
            summary={resumo(1)}
            onEdit={() => editar(1)}
            onConfirm={() => confirmar(1)}
            onSkip={() => confirmar(1, true)}>
            <CheckList
              opcoes={todasEmpresas.map(e => ({ value: e.id, label: e.razao_social, cnpj: e.cnpj || '' }))}
              selecionados={S.empresas}
              onChange={v => setSels(prev => ({ ...prev, empresas: v }))}
              busca={buscas.emp}
              onBusca={v => setBuscas(b => ({ ...b, emp: v }))}/>
          </StepCard>

          {/* Passo 2 — Operação */}
          <StepCard number="2" title="Operação"
            subtitle={opcoesOp.length + ' operação(ões) disponível(is) para a seleção acima'}
            active={stepAtivo === 2} done={confirmados.has(2)} locked={stepAtivo < 2 && !confirmados.has(1)}
            summary={resumo(2)}
            onEdit={() => editar(2)}
            onConfirm={() => confirmar(2)}
            onSkip={() => confirmar(2, true)}>
            <CheckList
              opcoes={opcoesOp.map(o => ({ value: o.id, label: o.nome + (o.codigo ? ' (' + o.codigo + ')' : ''), cnpj: '' }))}
              selecionados={S.operacoes}
              onChange={v => setSels(prev => ({ ...prev, operacoes: v }))}
              busca={buscas.op}
              onBusca={v => setBuscas(b => ({ ...b, op: v }))}/>
          </StepCard>

          {/* Passo 3 — Sindicatos */}
          <StepCard number="3" title="Sindicatos"
            subtitle="Laboral e patronal disponíveis para a seleção acima"
            active={stepAtivo === 3} done={confirmados.has(3)} locked={stepAtivo < 3 && !confirmados.has(2)}
            summary={resumo(3)}
            onEdit={() => editar(3)}
            onConfirm={() => confirmar(3)}
            onSkip={() => confirmar(3, true)}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1.5">Sindicato Laboral</p>
                <CheckList
                  opcoes={opcoesLab.map(s => ({ value: s.id, label: (s.sigla ? s.sigla + ' — ' : '') + s.razao_social, cnpj: s.cnpj || '' }))}
                  selecionados={S.sindicatosLab}
                  onChange={v => setSels(prev => ({ ...prev, sindicatosLab: v }))}
                  busca={buscas.sindLab}
                  onBusca={v => setBuscas(b => ({ ...b, sindLab: v }))}/>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1.5">Sindicato Patronal</p>
                <CheckList
                  opcoes={opcoesPat.map(s => ({ value: s.id, label: (s.sigla ? s.sigla + ' — ' : '') + s.razao_social, cnpj: s.cnpj || '' }))}
                  selecionados={S.sindicatosPat}
                  onChange={v => setSels(prev => ({ ...prev, sindicatosPat: v }))}
                  busca={buscas.sindPat}
                  onBusca={v => setBuscas(b => ({ ...b, sindPat: v }))}/>
              </div>
            </div>
          </StepCard>

          {/* Passo 4 — Instrumento + Vigência */}
          <StepCard number="4" title="Instrumento e Vigência"
            subtitle={opcoesInst.length + ' instrumento(s) disponível(is) para a seleção acima'}
            active={stepAtivo === 4} done={confirmados.has(4)} locked={stepAtivo < 4 && !confirmados.has(3)}
            summary={resumo(4)}
            onEdit={() => editar(4)}
            onConfirm={() => confirmar(4)}
            onSkip={() => confirmar(4, true)}>
            <CheckList
              opcoes={opcoesInst}
              selecionados={S.instrumentos}
              onChange={v => setSels(prev => ({ ...prev, instrumentos: v }))}
              busca={buscas.inst}
              onBusca={v => setBuscas(b => ({ ...b, inst: v }))}/>
            <div className="mt-3">
              <label className="label">Vigência</label>
              <select className="input" value={S.vigencia}
                onChange={e => setSels(prev => ({ ...prev, vigencia: e.target.value }))}>
                <option value="">Todos (vigentes e vencidos)</option>
                <option value="vigente">Somente vigentes</option>
                <option value="alerta">Vence em 60 dias</option>
                <option value="vencido">Somente vencidos</option>
                <option value="ultimo_vigente">Último por operação (vigente ou mais recente)</option>
              </select>
            </div>
          </StepCard>

          {/* Filtro de cláusulas — opcional, sempre visível */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 text-sm font-medium flex items-center justify-center flex-shrink-0">+</div>
              <div>
                <p className="font-medium text-sm text-slate-600">Filtro de Cláusulas</p>
                <p className="text-xs text-slate-400">Opcional — deixe em branco para exportar todas as categorias</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Categoria(s)</label>
                <select multiple className="input text-xs" style={{ height: 120 }}
                  value={S.categorias}
                  onChange={e => setSels(prev => ({ ...prev, categorias: [...e.target.selectedOptions].map(o => o.value), subcategorias: [] }))}>
                  {Object.keys(CATEGORIAS).map(c => <option key={c}>{c}</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Ctrl+clique para múltiplos. {S.categorias.length === 0 ? 'Todas' : S.categorias.length + ' selecionada(s)'}
                </p>
              </div>
              <div>
                <label className="label">Subcategoria(s)</label>
                <select multiple className="input text-xs" style={{ height: 120 }}
                  value={S.subcategorias}
                  onChange={e => setSels(prev => ({ ...prev, subcategorias: [...e.target.selectedOptions].map(o => o.value) }))}>
                  {subcatsDisponiveis.map(s => <option key={s}>{s}</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Ctrl+clique para múltiplos. {S.subcategorias.length === 0 ? 'Todas' : S.subcategorias.length + ' selecionada(s)'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna lateral — Resumo + Exportar */}
        <div>
          <div className="card p-4 sticky top-4">
            <h3 className="font-medium text-slate-700 text-sm mb-3">Resumo da seleção</h3>

            <div className="space-y-2 mb-4 text-xs">
              {[
                { label: 'Empresa', val: resumo(1), done: confirmados.has(1) },
                { label: 'Operação', val: resumo(2), done: confirmados.has(2) },
                { label: 'Sindicatos', val: resumo(3), done: confirmados.has(3) },
                { label: 'Instrumento', val: resumo(4), done: confirmados.has(4) },
              ].map(({ label, val, done }) => (
                <div key={label} className="flex items-start gap-2">
                  <span className={'w-3.5 h-3.5 rounded-full mt-0.5 flex-shrink-0 ' + (done ? 'bg-emerald-400' : 'bg-slate-200')}/>
                  <div className="min-w-0">
                    <span className="font-medium text-slate-600">{label}:</span>{' '}
                    <span className={'text-slate-500 ' + (!done ? 'italic' : '')}>{done ? val : '—'}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-surface-50 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-slate-700">
                {instsParaExportar.length} instrumento(s)
                {preview ? ' · ' + preview.count + ' cláusula(s)' : ''}
              </p>
              {instsParaExportar.length > 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  {instsParaExportar.slice(0, 2).map(i => i.nome).join(', ')}
                  {instsParaExportar.length > 2 && ` +${instsParaExportar.length - 2}`}
                </p>
              )}
            </div>

            {!tudo4Confirmado && (
              <p className="text-xs text-slate-400 italic mb-3 text-center">Complete ao menos o passo 1 para exportar</p>
            )}

            <div className="space-y-2">
              <button className="btn-secondary text-xs w-full py-1.5" onClick={calcularPreview}>
                Calcular prévia de cláusulas
              </button>
              <button className="btn-primary w-full"
                onClick={exportarExcel}
                disabled={loading || instsParaExportar.length === 0 || !tudo4Confirmado}>
                {loading ? '⏳ Gerando...' : '📊 Exportar Excel'}
              </button>
              <button className="btn-secondary w-full"
                onClick={exportarPDF}
                disabled={loading || instsParaExportar.length === 0 || !tudo4Confirmado}>
                {loading ? '⏳ Gerando...' : '📄 Exportar PDF'}
              </button>
              <button className="text-xs text-slate-400 hover:text-slate-600 w-full py-1 transition-colors"
                onClick={() => {
                  setSels({ empresas:[], operacoes:[], sindicatosLab:[], sindicatosPat:[], instrumentos:[], vigencia:'', categorias:[], subcategorias:[] })
                  setConfirmados(new Set())
                  setStepAtivo(1)
                  setBuscas({ emp:'', op:'', sindLab:'', sindPat:'', inst:'' })
                  setPreview(null)
                }}>
                ↺ Reiniciar filtros
              </button>
            </div>
          </div>

          <div className="card p-4 mt-3 border-2 border-dashed border-slate-200">
            <h3 className="font-medium text-slate-600 text-sm mb-1">⚖️ Relatório Comparativo</h3>
            <p className="text-xs text-slate-400 mb-3">Para comparar dois instrumentos use a página de Comparativo — o export está disponível lá.</p>
            <a href="#/comparativo" className="btn-secondary text-xs">Ir para Comparativo →</a>
          </div>
        </div>

      </div>
    </div>
  )
}
