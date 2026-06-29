import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { compararInstrumentos } from '../utils/comparacao'
import { toNumeroOrdinal } from '../utils/ordenacao'
import CheckList from '../components/UI/CheckList'
import StepCard from '../components/UI/StepCard'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

// ─── Constantes ───────────────────────────────────────────────────────────────
const FONTES_CONFIG = {
  pratica:   { label: 'Prática do Cliente',    cor: 'bg-amber-100 text-amber-800 border-amber-300',   icone: '🏢', descricao: 'Regras/condições praticadas internamente hoje' },
  act:       { label: 'ACT',                   cor: 'bg-blue-100 text-blue-800 border-blue-300',       icone: '📋', descricao: 'Acordo Coletivo de Trabalho vigente com sindicato local' },
  cct:       { label: 'CCT',                   cor: 'bg-purple-100 text-purple-800 border-purple-300', icone: '📄', descricao: 'Convenção Coletiva de Trabalho da categoria' },
  proposta:  { label: 'Proposta Sindical',     cor: 'bg-rose-100 text-rose-800 border-rose-300',       icone: '✋', descricao: 'Proposta apresentada pelo sindicato na negociação' },
}

const STATUS_ORDER = ['INALTERADA', 'ALTERADA', 'SUPRIMIDA', 'NOVA']
const STATUS_CLS = {
  INALTERADA: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ALTERADA:   'bg-blue-100 text-blue-800 border-blue-200',
  SUPRIMIDA:  'bg-slate-100 text-slate-600 border-slate-200',
  NOVA:       'bg-purple-100 text-purple-800 border-purple-200',
}

const NIVEL_CLS = {
  superior:  'bg-emerald-100 text-emerald-800',
  inferior:  'bg-red-100 text-red-700',
  igual:     'bg-slate-100 text-slate-600',
  sem_base:  'bg-slate-50 text-slate-400',
}
const NIVEL_LABEL = {
  superior: '▲ Superior',
  inferior: '▼ Inferior',
  igual:    '= Igual',
  sem_base: '— N/A',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function diffTexto(textoA, textoB) {
  if (!textoA && !textoB) return { html_a: '', html_b: '' }
  if (!textoA) return { html_a: '', html_b: `<mark class="diff-add">${textoB}</mark>` }
  if (!textoB) return { html_a: `<mark class="diff-rem">${textoA}</mark>`, html_b: '' }
  const wA = textoA.split(/(\s+)/), wB = textoB.split(/(\s+)/)
  const m = wA.length, n = wB.length
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = wA[i-1] === wB[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1])
  const ops = []; let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wA[i-1] === wB[j-1]) { ops.unshift({ type: 'eq', val: wA[i-1] }); i--; j-- }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { ops.unshift({ type: 'add', val: wB[j-1] }); j-- }
    else { ops.unshift({ type: 'rem', val: wA[i-1] }); i-- }
  }
  let ha = '', hb = ''
  for (const op of ops) {
    if (op.type === 'eq') { ha += op.val; hb += op.val }
    else if (op.type === 'rem') ha += `<mark class="diff-rem">${op.val}</mark>`
    else hb += `<mark class="diff-add">${op.val}</mark>`
  }
  return { html_a: ha, html_b: hb }
}

function DiffText({ html }) {
  return <span className="text-xs text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
}

// Detecta se um texto tem conteúdo melhor (numérico/percentual) que outro
function avaliarSuperioridade(textoBase, textoAlvo) {
  if (!textoBase && !textoAlvo) return 'sem_base'
  if (!textoBase) return 'sem_base'
  if (!textoAlvo) return 'sem_base'
  if (textoBase.trim() === textoAlvo.trim()) return 'igual'
  // Tenta extrair percentuais e valores monetários
  const extrairNums = t => {
    const matches = t.match(/(\d+[.,]\d+|\d+)%?/g) || []
    return matches.map(n => parseFloat(n.replace(',', '.')))
  }
  const numsBase = extrairNums(textoBase).filter(n => !isNaN(n))
  const numsAlvo = extrairNums(textoAlvo).filter(n => !isNaN(n))
  if (numsBase.length > 0 && numsAlvo.length > 0) {
    const maxBase = Math.max(...numsBase)
    const maxAlvo = Math.max(...numsAlvo)
    if (maxAlvo > maxBase) return 'superior'
    if (maxAlvo < maxBase) return 'inferior'
    return 'igual'
  }
  return 'sem_base'
}

// Cria cláusulas sintéticas a partir de texto livre (Prática / Proposta)
function textoParaClausulas(textoDoc) {
  if (!textoDoc || !textoDoc.trim()) return []
  const linhas = textoDoc.split(/\n+/).map(l => l.trim()).filter(Boolean)
  const clausulas = []
  let num = 1
  for (const linha of linhas) {
    clausulas.push({
      id: `synth-${num}`,
      numero: String(num),
      titulo: linha.length > 80 ? linha.slice(0, 80) + '…' : linha,
      conteudo: linha,
      categoria: null,
      subcategoria: null,
    })
    num++
  }
  return clausulas
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Negociacao() {
  const { user } = useAuth()

  // Dados de referência
  const [todosInstrumentos, setTodosInstrumentos] = useState([])
  const [empresas, setEmpresas] = useState([])
  const [operacoes, setOperacoes] = useState([])
  const [sindicatos, setSindicatos] = useState([])

  // Stepper
  const [stepAtivo, setStepAtivo] = useState(1)
  const [confirmados, setConfirmados] = useState(new Set())
  const [sels, setSels] = useState({ empresas: [], operacoes: [], sindicatosLab: [], sindicatosPat: [] })
  const [buscas, setBuscas] = useState({ emp: '', op: '', sindLab: '', sindPat: '' })

  // Fontes selecionadas e documentos
  const [fontesAtivas, setFontesAtivas] = useState(new Set(['act', 'cct']))
  const [instSelecionado, setInstSelecionado] = useState({ pratica: '', act: '', cct: '', proposta: '' })
  const [textoDoc, setTextoDoc] = useState({ pratica: '', proposta: '' })
  const [clausulasCache, setClausulasCache] = useState({})

  // Resultado e controles de exibição
  const [resultado, setResultado] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  // Controles da tabela
  const [fonteBase, setFonteBase] = useState('')
  const [fontesComparadas, setFontesComparadas] = useState([])
  const [busca, setBusca] = useState('')
  const [statusAtivos, setStatusAtivos] = useState(new Set(STATUS_ORDER))
  const [mostrarDiff, setMostrarDiff] = useState(true)
  const [ordenacao, setOrdenacao] = useState('original')
  const [expandidos, setExpandidos] = useState(new Set())
  const [modoExpandido, setModoExpandido] = useState(false)
  const [selecionados, setSelecionados] = useState(new Set())
  const [filtroNivel, setFiltroNivel] = useState('todos') // todos | superior | inferior | igual

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('instrumentos')
        .select('id,nome,tipo,vigencia_inicio,vigencia_fim,empresa_id,operacao_id,sindicato_laboral_id,sindicato_patronal_id')
        .eq('user_id', user.id).eq('status_processamento', 'processado').order('nome'),
      supabase.from('empresas').select('id,razao_social,cnpj').eq('user_id', user.id).order('razao_social'),
      supabase.from('operacoes').select('id,nome,codigo').eq('user_id', user.id).order('nome'),
      supabase.from('sindicatos').select('id,razao_social,sigla,tipo,cnpj').eq('user_id', user.id).order('razao_social'),
    ]).then(([{ data: insts }, { data: emps }, { data: ops }, { data: sinds }]) => {
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

  // Cascade de filtros
  const instsPorEmpresa = sels.empresas.length > 0
    ? todosInstrumentos.filter(i => sels.empresas.includes(i.empresa_id))
    : todosInstrumentos
  const opcoesOp = operacoes.filter(o => instsPorEmpresa.some(i => i.operacao_id === o.id))
  const instsPorOp = sels.operacoes.length > 0
    ? instsPorEmpresa.filter(i => sels.operacoes.includes(i.operacao_id))
    : instsPorEmpresa
  const opcoesLab = laboral.filter(s => instsPorOp.some(i => i.sindicato_laboral_id === s.id))
  const opcoesPat = patronal.filter(s => instsPorOp.some(i => i.sindicato_patronal_id === s.id))
  const instsPorSind = (() => {
    let arr = instsPorOp
    if (sels.sindicatosLab.length > 0) arr = arr.filter(i => sels.sindicatosLab.includes(i.sindicato_laboral_id))
    if (sels.sindicatosPat.length > 0) arr = arr.filter(i => sels.sindicatosPat.includes(i.sindicato_patronal_id))
    return arr
  })()

  function instLabel(i) {
    const emp = empMap[i.empresa_id]
    return `${i.tipo} — ${i.nome}${emp ? ` · ${emp.razao_social}` : ''}`
  }

  // Stepper
  function confirmar(step, pularTodos = false) {
    if (pularTodos) {
      if (step === 1) setSels(prev => ({ ...prev, empresas: [] }))
      if (step === 2) setSels(prev => ({ ...prev, operacoes: [] }))
      if (step === 3) setSels(prev => ({ ...prev, sindicatosLab: [], sindicatosPat: [] }))
    }
    const novos = new Set(confirmados)
    novos.add(step)
    for (let s = step + 1; s <= 3; s++) novos.delete(s)
    setConfirmados(novos)
    setStepAtivo(step + 1)
    setResultado(null)
  }

  function editar(step) {
    setStepAtivo(step)
    const novos = new Set(confirmados)
    for (let s = step; s <= 3; s++) novos.delete(s)
    setConfirmados(novos)
    if (step <= 1) setSels(prev => ({ ...prev, operacoes: [], sindicatosLab: [], sindicatosPat: [] }))
    else if (step === 2) setSels(prev => ({ ...prev, sindicatosLab: [], sindicatosPat: [] }))
    setResultado(null)
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
      default: return ''
    }
  }

  // Busca cláusulas de um instrumento (com cache)
  const buscarClausulas = useCallback(async (instId) => {
    if (!instId || clausulasCache[instId]) return clausulasCache[instId] || []
    const { data } = await supabase.from('clausulas').select('*').eq('instrumento_id', instId).order('numero')
    const result = data || []
    setClausulasCache(prev => ({ ...prev, [instId]: result }))
    return result
  }, [clausulasCache])

  // Toggle fontes ativas
  function toggleFonte(fonte) {
    setFontesAtivas(prev => {
      const n = new Set(prev)
      if (n.has(fonte)) { if (n.size === 1) return n; n.delete(fonte) } else n.add(fonte)
      return n
    })
    setResultado(null)
  }

  // Fontes disponíveis para selecionar instrumento (cadastradas no sistema)
  const fontesComInstrumento = ['act', 'cct']
  // Fontes com texto livre
  const fontesComTexto = ['pratica', 'proposta']

  // Gera o comparativo multi-fonte
  async function comparar() {
    const fontesLista = [...fontesAtivas]
    if (fontesLista.length < 2) return setErro('Selecione ao menos 2 fontes para comparar.')

    // Valida que cada fonte ativa tem dados
    for (const f of fontesLista) {
      if (fontesComTexto.includes(f) && !textoDoc[f]?.trim()) {
        return setErro(`A fonte "${FONTES_CONFIG[f].label}" está ativa mas sem conteúdo. Insira o texto ou desative a fonte.`)
      }
      if (fontesComInstrumento.includes(f) && !instSelecionado[f]) {
        return setErro(`Selecione o instrumento para "${FONTES_CONFIG[f].label}" ou desative a fonte.`)
      }
    }

    setLoading(true); setErro(''); setResultado(null)
    setExpandidos(new Set()); setModoExpandido(false); setSelecionados(new Set())

    try {
      // Carrega cláusulas de cada fonte
      const clausulasPorFonte = {}
      for (const f of fontesLista) {
        if (fontesComTexto.includes(f)) {
          clausulasPorFonte[f] = textoParaClausulas(textoDoc[f])
        } else {
          clausulasPorFonte[f] = await buscarClausulas(instSelecionado[f])
        }
      }

      // Define base e comparados (base = primeiro da lista por padrão, ou fonteBase escolhida)
      const baseEfetiva = fontesLista.includes(fonteBase) ? fonteBase : fontesLista[0]
      const comparadas = fontesLista.filter(f => f !== baseEfetiva)

      setFonteBase(baseEfetiva)
      setFontesComparadas(comparadas)

      // Para cada par (base × comparada), calcula comparativo
      const comparativos = {}
      for (const fc of comparadas) {
        comparativos[fc] = compararInstrumentos(clausulasPorFonte[baseEfetiva], clausulasPorFonte[fc])
      }

      setResultado({ clausulasPorFonte, comparativos, baseEfetiva, comparadas, fontesLista })
      setStatusAtivos(new Set(STATUS_ORDER))
    } catch (e) {
      setErro('Erro ao comparar: ' + e.message)
    }
    setLoading(false)
  }

  // Linhas mescladas do resultado (baseado nos itens da fonte base)
  const linhasResultado = (() => {
    if (!resultado) return []
    const { clausulasPorFonte, comparativos, baseEfetiva, comparadas } = resultado
    const clausulasBase = clausulasPorFonte[baseEfetiva] || []

    // Para cada cláusula da base, encontra correspondência em cada comparada
    return clausulasBase.map((cb, idx) => {
      const pares = {}
      let statusGeral = 'INALTERADA'

      for (const fc of comparadas) {
        const comp = comparativos[fc] || []
        // Encontra o par que tem clausulaA correspondente a cb
        const par = comp.find(r => r.clausulaA?.id === cb.id)
        pares[fc] = par || null
        if (par) {
          if (par.status.label === 'ALTERADA') statusGeral = 'ALTERADA'
          else if (par.status.label === 'SUPRIMIDA' && statusGeral !== 'ALTERADA') statusGeral = 'SUPRIMIDA'
        } else {
          statusGeral = 'SUPRIMIDA'
        }
      }

      return { clausulaBase: cb, pares, statusGeral, idx }
    })
  })()

  // Cláusulas novas em comparadas (não existem na base)
  const novasNasComparadas = (() => {
    if (!resultado) return []
    const { comparativos, comparadas } = resultado
    const novas = []
    for (const fc of comparadas) {
      const comp = comparativos[fc] || []
      comp.filter(r => r.status.label === 'NOVA').forEach(r => {
        novas.push({ clausulaBase: null, fonte: fc, clausulaNova: r.clausulaB, statusGeral: 'NOVA', pares: {} })
      })
    }
    return novas
  })()

  const todasLinhas = [...linhasResultado, ...novasNasComparadas]

  // Filtro e ordenação
  function sortKey(r) {
    return toNumeroOrdinal(r.clausulaBase?.numero || r.clausulaNova?.numero || String(r.idx || 0))
  }

  const linhasOrdenadas = (() => {
    const arr = [...todasLinhas]
    switch (ordenacao) {
      case 'num_asc':  return arr.sort((a, b) => sortKey(a) - sortKey(b))
      case 'num_desc': return arr.sort((a, b) => sortKey(b) - sortKey(a))
      case 'status':   return arr.sort((a, b) => STATUS_ORDER.indexOf(a.statusGeral) - STATUS_ORDER.indexOf(b.statusGeral))
      default: return arr
    }
  })()

  const filtrado = linhasOrdenadas.filter(r => {
    if (!statusAtivos.has(r.statusGeral)) return false
    const q = busca.toLowerCase()
    if (q) {
      const titulo = r.clausulaBase?.titulo || r.clausulaNova?.titulo || ''
      if (!titulo.toLowerCase().includes(q)) return false
    }
    if (filtroNivel !== 'todos' && resultado) {
      // Verifica se alguma comparação tem esse nível
      const temNivel = Object.entries(r.pares).some(([fc, par]) => {
        if (!par) return false
        const nivel = avaliarSuperioridade(r.clausulaBase?.conteudo, par.clausulaB?.conteudo)
        return nivel === filtroNivel
      })
      if (!temNivel) return false
    }
    return true
  })

  const statsStatus = todasLinhas.reduce((acc, r) => { acc[r.statusGeral] = (acc[r.statusGeral] || 0) + 1; return acc }, {})

  function toggleStatus(s) {
    setStatusAtivos(prev => {
      const n = new Set(prev)
      if (n.has(s)) { if (n.size === 1) return n; n.delete(s) } else n.add(s)
      return n
    })
  }

  function toggleCard(idx) { setExpandidos(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n }) }
  function toggleExpandAll() { setModoExpandido(v => !v); setExpandidos(new Set()) }
  const isExpanded = idx => modoExpandido ? !expandidos.has(idx) : expandidos.has(idx)
  function toggleSel(idx) { setSelecionados(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n }) }
  const todosSel = filtrado.length > 0 && filtrado.every((_, i) => selecionados.has(i))
  function toggleSelTodos() { todosSel ? setSelecionados(new Set()) : setSelecionados(new Set(filtrado.map((_, i) => i))) }

  // ─── Exportação ────────────────────────────────────────────────────────────
  function exportarExcel() {
    if (!resultado) return
    const itens = selecionados.size > 0 ? filtrado.filter((_, i) => selecionados.has(i)) : filtrado
    const wb = XLSX.utils.book_new()
    const { comparadas, baseEfetiva } = resultado
    const fBase = FONTES_CONFIG[baseEfetiva]?.label || baseEfetiva

    const rows = itens.map(r => {
      const row = {
        'Status': r.statusGeral,
        [`Nº (${fBase})`]: r.clausulaBase?.numero || '',
        [`Título (${fBase})`]: r.clausulaBase?.titulo || r.clausulaNova?.titulo || '',
        [`Conteúdo (${fBase})`]: r.clausulaBase?.conteudo || '',
      }
      for (const fc of comparadas) {
        const par = r.pares[fc]
        const fl = FONTES_CONFIG[fc]?.label || fc
        row[`Nº (${fl})`] = par?.clausulaB?.numero || ''
        row[`Conteúdo (${fl})`] = par?.clausulaB?.conteudo || ''
        row[`Nível vs ${fl}`] = NIVEL_LABEL[avaliarSuperioridade(r.clausulaBase?.conteudo, par?.clausulaB?.conteudo)] || '—'
      }
      return row
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Negociação')
    XLSX.writeFile(wb, 'negociacao_sindical_' + new Date().toISOString().slice(0, 10) + '.xlsx')
  }

  function exportarPDF() {
    if (!resultado) return
    const itens = selecionados.size > 0 ? filtrado.filter((_, i) => selecionados.has(i)) : filtrado
    const { comparadas, baseEfetiva } = resultado
    const fBase = FONTES_CONFIG[baseEfetiva]?.label || baseEfetiva
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(13); doc.text('Negociação Sindical — Comparativo de Fontes', 14, 16)
    doc.setFontSize(8); doc.setTextColor(100)
    doc.text(`Base: ${fBase}  ·  Comparadas: ${comparadas.map(f => FONTES_CONFIG[f]?.label).join(', ')}`, 14, 22)
    doc.setTextColor(0)
    const head = [['Status', `Nº (${fBase})`, `Título (${fBase})`, ...comparadas.flatMap(fc => [`${FONTES_CONFIG[fc]?.label}`, `Nível`])]]
    const body = itens.map(r => [
      r.statusGeral,
      r.clausulaBase?.numero || '',
      (r.clausulaBase?.titulo || r.clausulaNova?.titulo || '').slice(0, 50),
      ...comparadas.flatMap(fc => {
        const par = r.pares[fc]
        return [
          (par?.clausulaB?.conteudo || '').slice(0, 120),
          NIVEL_LABEL[avaliarSuperioridade(r.clausulaBase?.conteudo, par?.clausulaB?.conteudo)] || '—',
        ]
      }),
    ])
    doc.autoTable({ startY: 28, head, body, styles: { fontSize: 6 }, headStyles: { fillColor: [79, 70, 229] } })
    doc.save('negociacao_' + new Date().toISOString().slice(0, 10) + '.pdf')
  }

  // ─── Renderização ──────────────────────────────────────────────────────────
  return (
    <div className="pb-24">
      <style>{`
        mark.diff-rem{background:#ede9fe;color:#5b21b6;border-radius:2px;padding:0 1px;text-decoration:line-through;text-decoration-color:#7c3aed}
        mark.diff-add{background:#dcfce7;color:#166534;border-radius:2px;padding:0 1px}
      `}</style>

      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-800">🤝 Negociação Sindical</h1>
        <p className="text-slate-500 text-sm mt-1">
          Compare a prática do cliente, ACTs, CCTs e propostas sindicais — identifique divergências e avalie superioridade cláusula a cláusula
        </p>
      </div>

      {/* ── Passo 1-3: Filtros de contexto ── */}
      <StepCard number="1" title="Empresa"
        subtitle="Filtre os instrumentos por empresa"
        active={stepAtivo === 1} done={confirmados.has(1)} locked={false}
        summary={resumo(1)} onEdit={() => editar(1)}
        onConfirm={() => confirmar(1)} onSkip={() => confirmar(1, true)}>
        <CheckList
          opcoes={empresas.map(e => ({ value: e.id, label: e.razao_social, cnpj: e.cnpj || '' }))}
          selecionados={sels.empresas}
          onChange={v => setSels(prev => ({ ...prev, empresas: v }))}
          busca={buscas.emp} onBusca={v => setBuscas(b => ({ ...b, emp: v }))} />
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
          busca={buscas.op} onBusca={v => setBuscas(b => ({ ...b, op: v }))} />
      </StepCard>

      <StepCard number="3" title="Sindicatos"
        subtitle="Laboral e patronal disponíveis"
        active={stepAtivo === 3} done={confirmados.has(3)} locked={stepAtivo < 3 && !confirmados.has(2)}
        summary={resumo(3)} onEdit={() => editar(3)}
        onConfirm={() => confirmar(3)} onSkip={() => confirmar(3, true)}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">Sindicato Laboral</p>
            <CheckList
              opcoes={opcoesLab.map(s => ({ value: s.id, label: (s.sigla ? s.sigla + ' — ' : '') + s.razao_social, cnpj: s.cnpj || '' }))}
              selecionados={sels.sindicatosLab}
              onChange={v => setSels(prev => ({ ...prev, sindicatosLab: v }))}
              busca={buscas.sindLab} onBusca={v => setBuscas(b => ({ ...b, sindLab: v }))} />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">Sindicato Patronal</p>
            <CheckList
              opcoes={opcoesPat.map(s => ({ value: s.id, label: (s.sigla ? s.sigla + ' — ' : '') + s.razao_social, cnpj: s.cnpj || '' }))}
              selecionados={sels.sindicatosPat}
              onChange={v => setSels(prev => ({ ...prev, sindicatosPat: v }))}
              busca={buscas.sindPat} onBusca={v => setBuscas(b => ({ ...b, sindPat: v }))} />
          </div>
        </div>
      </StepCard>

      {/* ── Configuração das fontes ── */}
      <div className="card p-5 mt-4">
        <h2 className="font-display font-semibold text-slate-700 mb-1 text-sm">⚙️ Fontes para comparação</h2>
        <p className="text-xs text-slate-400 mb-4">
          Selecione quais fontes deseja comparar (mínimo 2). Para ACT e CCT, escolha o instrumento já cadastrado.
          Para Prática do Cliente e Proposta Sindical, insira o conteúdo em texto livre.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(FONTES_CONFIG).map(([chave, cfg]) => {
            const ativo = fontesAtivas.has(chave)
            return (
              <div key={chave} className={`rounded-xl border-2 p-4 transition-all ${ativo ? 'border-brand-400 bg-brand-50/30' : 'border-slate-200 bg-white opacity-60'}`}>
                {/* Header da fonte */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{cfg.icone}</span>
                    <div>
                      <p className={`text-sm font-semibold ${ativo ? 'text-slate-800' : 'text-slate-500'}`}>{cfg.label}</p>
                      <p className="text-xs text-slate-400">{cfg.descricao}</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={ativo}
                      onChange={() => toggleFonte(chave)}
                      className="w-4 h-4 accent-brand-600" />
                    <span className="text-xs text-slate-500">{ativo ? 'Ativo' : 'Inativo'}</span>
                  </label>
                </div>

                {/* Controles específicos por tipo */}
                {ativo && (
                  <>
                    {fontesComInstrumento.includes(chave) && (
                      <div>
                        <label className="label text-xs">Instrumento ({cfg.label})</label>
                        <select className="input text-xs"
                          value={instSelecionado[chave]}
                          onChange={e => setInstSelecionado(prev => ({ ...prev, [chave]: e.target.value }))}>
                          <option value="">Selecione um instrumento...</option>
                          {instsPorSind
                            .filter(i => chave === 'act' ? i.tipo === 'ACT' : i.tipo === 'CCT' || i.tipo !== 'ACT')
                            .map(i => (
                              <option key={i.id} value={i.id}>{instLabel(i)}</option>
                            ))}
                        </select>
                        {instSelecionado[chave] && (() => {
                          const inst = todosInstrumentos.find(i => i.id === instSelecionado[chave])
                          return inst ? <p className="text-xs text-slate-400 mt-1">Vigência: {inst.vigencia_inicio} a {inst.vigencia_fim}</p> : null
                        })()}
                      </div>
                    )}

                    {fontesComTexto.includes(chave) && (
                      <div>
                        <label className="label text-xs">
                          {chave === 'pratica' ? 'Condições praticadas hoje' : 'Proposta do sindicato'}
                          <span className="font-normal text-slate-400 ml-1">(uma condição por linha)</span>
                        </label>
                        <textarea
                          className="input text-xs resize-y"
                          rows={5}
                          placeholder={chave === 'pratica'
                            ? 'Ex:\nReajuste anual de 3%\nVale-alimentação R$ 25,00/dia\nJornada 44h semanais\n...'
                            : 'Ex:\nReajuste de 6,5%\nAumento do vale-refeição para R$ 35,00\nRedução da jornada para 40h\n...'}
                          value={textoDoc[chave]}
                          onChange={e => setTextoDoc(prev => ({ ...prev, [chave]: e.target.value }))}
                        />
                        <p className="text-xs text-slate-400 mt-0.5">
                          {textoDoc[chave].split('\n').filter(l => l.trim()).length} item(ns)
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Seleção da fonte-base */}
        {fontesAtivas.size >= 2 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="label text-xs">📌 Fonte-base para comparação</label>
                <select className="input text-xs"
                  value={fonteBase}
                  onChange={e => setFonteBase(e.target.value)}>
                  <option value="">Automática (primeira fonte ativa)</option>
                  {[...fontesAtivas].map(f => (
                    <option key={f} value={f}>{FONTES_CONFIG[f]?.icone} {FONTES_CONFIG[f]?.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-0.5">
                  As demais fontes serão comparadas contra a fonte-base
                </p>
              </div>
              <button
                className="btn-primary w-full"
                onClick={comparar}
                disabled={loading}>
                {loading ? '⏳ Comparando...' : '⚖️ Gerar comparativo'}
              </button>
            </div>
          </div>
        )}

        {erro && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            <p className="text-xs text-red-700">⚠️ {erro}</p>
          </div>
        )}
      </div>

      {/* ── Resultado ── */}
      {resultado && (
        <div className="mt-4">
          {/* Cabeçalho do resultado */}
          <div className="card p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  📊 Comparativo gerado — base:&nbsp;
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${FONTES_CONFIG[resultado.baseEfetiva]?.cor}`}>
                    {FONTES_CONFIG[resultado.baseEfetiva]?.icone} {FONTES_CONFIG[resultado.baseEfetiva]?.label}
                  </span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Comparadas:{' '}
                  {resultado.comparadas.map(fc => (
                    <span key={fc} className={`text-xs px-1.5 py-0.5 rounded-full border mr-1 ${FONTES_CONFIG[fc]?.cor}`}>
                      {FONTES_CONFIG[fc]?.icone} {FONTES_CONFIG[fc]?.label}
                    </span>
                  ))}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={exportarExcel} className="btn-secondary text-xs py-1">
                  📊 {selecionados.size > 0 ? `Excel (${selecionados.size})` : 'Excel'}
                </button>
                <button onClick={exportarPDF} className="btn-secondary text-xs py-1">
                  📄 {selecionados.size > 0 ? `PDF (${selecionados.size})` : 'PDF'}
                </button>
              </div>
            </div>
          </div>

          {/* Filtros de status */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {STATUS_ORDER.map(s => (
              <button key={s} onClick={() => toggleStatus(s)}
                className={'p-2 rounded-lg border-2 text-center transition-all select-none ' + (
                  statusAtivos.has(s) ? STATUS_CLS[s] + ' shadow-sm' : 'border-slate-200 bg-white opacity-40 hover:opacity-60'
                )}>
                <p className="text-lg font-bold">{statsStatus[s] || 0}</p>
                <p className="text-[10px] font-medium leading-tight">{s}</p>
              </button>
            ))}
          </div>

          {/* Barra de controles */}
          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <input className="input max-w-xs text-sm" placeholder="Buscar por título..."
              value={busca} onChange={e => setBusca(e.target.value)} />
            <select className="input w-auto text-xs" value={ordenacao} onChange={e => setOrdenacao(e.target.value)}>
              <option value="original">Ordem original</option>
              <option value="num_asc">Nº — crescente</option>
              <option value="num_desc">Nº — decrescente</option>
              <option value="status">Por tipo</option>
            </select>
            <select className="input w-auto text-xs" value={filtroNivel} onChange={e => setFiltroNivel(e.target.value)}>
              <option value="todos">Todos os níveis</option>
              <option value="superior">▲ Superior</option>
              <option value="inferior">▼ Inferior</option>
              <option value="igual">= Igual</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={mostrarDiff} onChange={e => setMostrarDiff(e.target.checked)} />
              Destacar diferenças
            </label>
            <button className="btn-secondary text-xs" onClick={toggleExpandAll}>
              {modoExpandido ? '📕 Recolher tudo' : '📖 Expandir tudo'}
            </button>
          </div>

          {/* Seleção em massa */}
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-slate-50 rounded-lg text-xs text-slate-500">
            <input type="checkbox" checked={todosSel} onChange={toggleSelTodos} className="w-4 h-4 cursor-pointer" />
            <span>{todosSel ? 'Desselecionar tudo' : 'Selecionar tudo'} — {filtrado.length} visíveis</span>
            {selecionados.size > 0 && <span className="ml-auto text-brand-600 font-medium">{selecionados.size} selecionada(s)</span>}
          </div>

          {/* Cards de cláusulas */}
          <div className="space-y-2">
            {filtrado.map((r, idx) => {
              const expanded = isExpanded(idx)
              const selected = selecionados.has(idx)
              const { comparadas } = resultado

              return (
                <div key={idx} className={'card overflow-hidden transition-all ' + (selected ? 'ring-2 ring-brand-400' : '')}>
                  {/* Cabeçalho do card */}
                  <div className="w-full text-left p-3 hover:bg-surface-50 transition-colors cursor-pointer"
                    onClick={() => toggleCard(idx)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="checkbox" checked={selected}
                        onChange={() => toggleSel(idx)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 flex-shrink-0 cursor-pointer accent-blue-600" />
                      <span className={'text-xs px-2 py-0.5 rounded-full font-medium border flex-shrink-0 ' + STATUS_CLS[r.statusGeral]}>
                        {r.statusGeral}
                      </span>
                      <p className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                        {r.clausulaBase
                          ? (r.clausulaBase.numero ? r.clausulaBase.numero + ' — ' : '') + r.clausulaBase.titulo
                          : <span className="text-slate-400 italic">Nova em {FONTES_CONFIG[r.fonte]?.label}</span>}
                      </p>
                      {/* Badges de nível por fonte comparada */}
                      <div className="flex gap-1 flex-shrink-0 flex-wrap">
                        {comparadas.map(fc => {
                          const par = r.pares[fc]
                          const nivel = par
                            ? avaliarSuperioridade(r.clausulaBase?.conteudo, par.clausulaB?.conteudo)
                            : 'sem_base'
                          return (
                            <span key={fc} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${NIVEL_CLS[nivel]}`}
                              title={`${FONTES_CONFIG[fc]?.label}: ${NIVEL_LABEL[nivel]}`}>
                              {FONTES_CONFIG[fc]?.icone} {NIVEL_LABEL[nivel]}
                            </span>
                          )
                        })}
                      </div>
                      <span className="text-slate-300 text-sm flex-shrink-0">{expanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Corpo expandido */}
                  {expanded && (
                    <div className={`border-t border-slate-100 grid divide-x divide-slate-100`}
                      style={{ gridTemplateColumns: `repeat(${1 + comparadas.length}, minmax(0, 1fr))` }}>
                      {/* Coluna da base */}
                      <div className="p-4 bg-amber-50/20">
                        <p className="text-xs font-bold text-amber-700 mb-2 uppercase tracking-wide">
                          {FONTES_CONFIG[resultado.baseEfetiva]?.icone} {FONTES_CONFIG[resultado.baseEfetiva]?.label} (base)
                        </p>
                        {r.clausulaBase ? (
                          <>
                            <p className="text-xs font-semibold text-slate-700 mb-1">{r.clausulaBase.titulo}</p>
                            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{r.clausulaBase.conteudo}</p>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Cláusula nova — não existe na fonte base</p>
                        )}
                      </div>

                      {/* Colunas das comparadas */}
                      {comparadas.map(fc => {
                        const par = r.pares[fc]
                        const cfg = FONTES_CONFIG[fc]
                        const nivel = par
                          ? avaliarSuperioridade(r.clausulaBase?.conteudo, par.clausulaB?.conteudo)
                          : 'sem_base'
                        const diff = mostrarDiff && par?.status?.label === 'ALTERADA'
                          ? diffTexto(r.clausulaBase?.conteudo || '', par.clausulaB?.conteudo || '')
                          : null

                        return (
                          <div key={fc} className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                                {cfg?.icone} {cfg?.label}
                              </p>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${NIVEL_CLS[nivel]}`}>
                                {NIVEL_LABEL[nivel]}
                              </span>
                            </div>
                            {par?.clausulaB ? (
                              <>
                                <p className="text-xs font-semibold text-slate-700 mb-1">{par.clausulaB.titulo}</p>
                                {diff
                                  ? <DiffText html={diff.html_b} />
                                  : <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{par.clausulaB.conteudo}</p>}
                              </>
                            ) : (
                              <p className="text-xs text-slate-400 italic">Não encontrado nesta fonte</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {filtrado.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">Nenhuma cláusula encontrada com os filtros aplicados.</p>
          )}
        </div>
      )}

      {/* Floating bar de seleção */}
      {selecionados.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white rounded-2xl px-5 py-3 flex items-center gap-3 shadow-2xl z-50 border border-slate-700">
          <span className="text-sm font-semibold">{selecionados.size} cláusula(s) selecionada(s)</span>
          <button onClick={exportarExcel} className="text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors">📊 Excel</button>
          <button onClick={exportarPDF}   className="text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors">📄 PDF</button>
          <button onClick={() => setSelecionados(new Set())} className="text-xs opacity-60 hover:opacity-100 ml-1">✕ Limpar</button>
        </div>
      )}
    </div>
  )
}
