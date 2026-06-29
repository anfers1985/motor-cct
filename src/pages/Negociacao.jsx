import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { compararInstrumentos, classificarSimilaridade, similaridade } from '../utils/comparacao'
import { toNumeroOrdinal, ordenarClausulas } from '../utils/ordenacao'
import { normalizarSubcategoria } from '../utils/categorias'
import CheckList from '../components/UI/CheckList'
import StepCard from '../components/UI/StepCard'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

// ─── Diff HTML ────────────────────────────────────────────────────────────────
function diffTexto(textoA, textoB) {
  if (!textoA && !textoB) return { html_a: '', html_b: '' }
  if (!textoA) return { html_a: '', html_b: `<mark class="diff-add">${textoB}</mark>` }
  if (!textoB) return { html_a: `<mark class="diff-rem">${textoA}</mark>`, html_b: '' }
  const wA = textoA.split(/(\s+)/), wB = textoB.split(/(\s+)/)
  const m = wA.length, n = wB.length
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = wA[i-1] === wB[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1])
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

// ─── Fontes disponíveis na negociação ─────────────────────────────────────────
// Cada fonte tem: id, label, cor, tipo ('instrumento' | 'manual')
// Tipo 'instrumento': carrega cláusulas do banco
// Tipo 'manual': o usuário digita/cola o conteúdo (Prática Atual / Proposta Sindical)
const FONTES_CONFIG = [
  { id: 'pratica',   label: 'Prática Atual (Cliente)',  cor: '#f59e0b', tipo: 'manual',      icone: '🏭' },
  { id: 'act',       label: 'ACT',                      cor: '#3b82f6', tipo: 'instrumento', icone: '📋' },
  { id: 'cct',       label: 'CCT',                      cor: '#8b5cf6', tipo: 'instrumento', icone: '📄' },
  { id: 'proposta',  label: 'Proposta Sindical',         cor: '#ef4444', tipo: 'manual',      icone: '🤝' },
]

// Status possíveis na comparação N-fontes
const STATUS_CLS = {
  'INALTERADA':  'bg-emerald-100 text-emerald-800 border-emerald-300',
  'ALTERADA':    'bg-blue-100 text-blue-800 border-blue-300',
  'NOVA':        'bg-purple-100 text-purple-800 border-purple-300',
  'AUSENTE':     'bg-slate-100 text-slate-600 border-slate-300',
}

// ─── Comparação multi-fonte ────────────────────────────────────────────────────
// Agrupa tópicos por título similar entre todas as fontes ativas.
// Retorna linhas: { topico, celulas: { fonteId: { conteudo, titulo, numero } | null } }
function compararMultiFontes(clausulasPorFonte, fontesAtivas) {
  // Coleta todos os tópicos únicos de todas as fontes
  const todosTopicos = []
  const usados = {}
  fontesAtivas.forEach(f => { usados[f.id] = new Set() })

  // Índice de todos os itens por fonte
  const itens = {} // fonteId → [{titulo, conteudo, numero, id}]
  fontesAtivas.forEach(f => {
    itens[f.id] = (clausulasPorFonte[f.id] || []).map((c, idx) => ({
      ...c,
      _idx: idx,
    }))
  })

  // Usa a primeira fonte ativa como âncora para os tópicos
  const ancora = fontesAtivas[0]
  if (!ancora) return []

  const linhas = []
  const itensFonte = itens[ancora.id] || []

  for (const itemRef of itensFonte) {
    const linha = { topico: itemRef.titulo || itemRef.numero || '—', celulas: {} }
    linha.celulas[ancora.id] = itemRef
    usados[ancora.id].add(itemRef._idx)

    // Para cada outra fonte, encontra o melhor match
    for (const f of fontesAtivas.slice(1)) {
      let melhor = null, melhorScore = 0
      for (const item of itens[f.id] || []) {
        if (usados[f.id].has(item._idx)) continue
        const scoreT = similaridade(itemRef.titulo || '', item.titulo || '')
        const scoreC = similaridade(itemRef.conteudo || '', item.conteudo || '')
        const score = scoreT * 0.5 + scoreC * 0.5
        if (score > melhorScore && score > 0.20) { melhor = item; melhorScore = score }
      }
      if (melhor) {
        linha.celulas[f.id] = melhor
        usados[f.id].add(melhor._idx)
      } else {
        linha.celulas[f.id] = null
      }
    }
    linhas.push(linha)
  }

  // Adiciona itens não casados das outras fontes
  for (const f of fontesAtivas.slice(1)) {
    for (const item of itens[f.id] || []) {
      if (!usados[f.id].has(item._idx)) {
        const linha = { topico: item.titulo || item.numero || '—', celulas: {} }
        fontesAtivas.forEach(ff => { linha.celulas[ff.id] = null })
        linha.celulas[f.id] = item
        linhas.push(linha)
      }
    }
  }

  return linhas
}

// Determina o status de uma linha comparada (INALTERADA, ALTERADA, etc.)
function statusDaLinha(celulas, fontesAtivas) {
  const presentes = fontesAtivas.filter(f => celulas[f.id])
  if (presentes.length === 0) return 'AUSENTE'
  if (presentes.length === 1) {
    const fIdx = fontesAtivas.indexOf(presentes[0])
    return fIdx === 0 ? 'AUSENTE' : 'NOVA'
  }
  // Compara conteúdos das fontes presentes
  const textos = presentes.map(f => celulas[f.id]?.conteudo || '')
  const allEqual = textos.every(t => similaridade(t, textos[0]) >= 0.92)
  return allEqual ? 'INALTERADA' : 'ALTERADA'
}

// ─── Avalia superioridade de cada fonte ────────────────────────────────────────
// "Superior" = a cláusula desta fonte é mais favorável ao trabalhador.
// Critério simplificado: comparamos valores numéricos (percentuais, R$, dias).
// Superior = maiores valores numéricos para benefícios positivos.
function avaliarSuperioridade(celulas, fontesAtivas) {
  // Extrai todos os números de um texto
  const numeros = (t = '') => {
    const matches = t.match(/\d+[.,]\d+|\d+/g) || []
    return matches.map(n => parseFloat(n.replace(',', '.')))
  }
  const resultados = {}
  fontesAtivas.forEach(f => {
    const cel = celulas[f.id]
    if (!cel) { resultados[f.id] = null; return }
    const nums = numeros(cel.conteudo || '')
    resultados[f.id] = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
  })
  const scores = fontesAtivas.map(f => resultados[f.id]).filter(v => v != null)
  if (scores.length === 0) return {}
  const maxScore = Math.max(...scores)
  const minScore = Math.min(...scores)
  const diff = maxScore - minScore
  const avaliacao = {}
  fontesAtivas.forEach(f => {
    const v = resultados[f.id]
    if (v == null) { avaliacao[f.id] = null; return }
    if (diff < 0.01) avaliacao[f.id] = 'igual'
    else if (v >= maxScore * 0.98) avaliacao[f.id] = 'superior'
    else if (v <= minScore * 1.02) avaliacao[f.id] = 'inferior'
    else avaliacao[f.id] = 'intermediário'
  })
  return avaliacao
}

// ─── Componente principal ──────────────────────────────────────────────────────
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

  // Configuração das fontes — quais estão ativas e qual instrumento selecionado
  const [fontesAtivas, setFontesAtivas] = useState(['pratica', 'act', 'cct', 'proposta'])
  const [instPorFonte, setInstPorFonte] = useState({ act: '', cct: '' }) // fontes tipo instrumento

  // Conteúdo das fontes manuais (prática e proposta): lista de itens {titulo, conteudo}
  const [conteudoManual, setConteudoManual] = useState({
    pratica: [],
    proposta: [],
  })
  const [editandoManual, setEditandoManual] = useState(null) // {fonteId, idx} | null
  const [novoItem, setNovoItem] = useState({ titulo: '', conteudo: '' })

  // Resultado da comparação
  const [clausulasPorFonte, setClausulasPorFonte] = useState({})
  const [linhasComparadas, setLinhasComparadas] = useState([])
  const [loading, setLoading] = useState(false)
  const [comparado, setComparado] = useState(false)

  // Filtros e visualização
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState(new Set(['INALTERADA', 'ALTERADA', 'NOVA', 'AUSENTE']))
  const [ordenacao, setOrdenacao] = useState('original')
  const [mostrarDiff, setMostrarDiff] = useState(true)
  const [expandidos, setExpandidos] = useState(new Set())
  const [modoExpandido, setModoExpandido] = useState(false)
  const [selecionados, setSelecionados] = useState(new Set())
  const [fontesRef, setFontesRef] = useState('act') // fonte base para ordenação e superioridade

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

  // Cascade de instrumentos
  const instsPorEmpresa = sels.empresas.length > 0 ? todosInstrumentos.filter(i => sels.empresas.includes(i.empresa_id)) : todosInstrumentos
  const opcoesOp = operacoes.filter(o => instsPorEmpresa.some(i => i.operacao_id === o.id))
  const instsPorOp = sels.operacoes.length > 0 ? instsPorEmpresa.filter(i => sels.operacoes.includes(i.operacao_id)) : instsPorEmpresa
  const opcoesLab = laboral.filter(s => instsPorOp.some(i => i.sindicato_laboral_id === s.id))
  const opcoesPat = patronal.filter(s => instsPorOp.some(i => i.sindicato_patronal_id === s.id))
  const instsFiltrados = (() => {
    let arr = instsPorOp
    if (sels.sindicatosLab.length > 0) arr = arr.filter(i => sels.sindicatosLab.includes(i.sindicato_laboral_id))
    if (sels.sindicatosPat.length > 0) arr = arr.filter(i => sels.sindicatosPat.includes(i.sindicato_patronal_id))
    return arr
  })()

  // ACTs e CCTs separados para os selects
  const acts = instsFiltrados.filter(i => i.tipo?.toUpperCase() === 'ACT')
  const ccts = instsFiltrados.filter(i => i.tipo?.toUpperCase() === 'CCT')

  function instLabel(i) {
    const emp = empMap[i.empresa_id]
    return `${i.nome}${emp ? ` · ${emp.razao_social}` : ''}` + (i.vigencia_inicio ? ` (${i.vigencia_inicio?.slice(0,7)})` : '')
  }

  // ── Stepper ──────────────────────────────────────────────────────────────
  function confirmar(step, pularTodos = false) {
    if (pularTodos) {
      if (step === 1) setSels(prev => ({ ...prev, empresas: [] }))
      if (step === 2) setSels(prev => ({ ...prev, operacoes: [] }))
      if (step === 3) setSels(prev => ({ ...prev, sindicatosLab: [], sindicatosPat: [] }))
    }
    const novos = new Set(confirmados); novos.add(step)
    for (let s = step + 1; s <= 4; s++) novos.delete(s)
    setConfirmados(novos); setStepAtivo(step + 1); setComparado(false)
  }

  function editar(step) {
    setStepAtivo(step)
    const novos = new Set(confirmados)
    for (let s = step; s <= 4; s++) novos.delete(s)
    setConfirmados(novos)
    if (step <= 1) setSels(prev => ({ ...prev, operacoes: [], sindicatosLab: [], sindicatosPat: [] }))
    else if (step === 2) setSels(prev => ({ ...prev, sindicatosLab: [], sindicatosPat: [] }))
    setComparado(false)
  }

  function resetar() {
    setStepAtivo(1); setConfirmados(new Set())
    setSels({ empresas: [], operacoes: [], sindicatosLab: [], sindicatosPat: [] })
    setBuscas({ emp: '', op: '', sindLab: '', sindPat: '' })
    setInstPorFonte({ act: '', cct: '' })
    setConteudoManual({ pratica: [], proposta: [] })
    setLinhasComparadas([]); setClausulasPorFonte({})
    setComparado(false); setExpandidos(new Set()); setSelecionados(new Set())
  }

  function resumo(step) {
    const label2 = (arr, map, fn) => {
      if (!arr.length) return null
      return arr.slice(0, 2).map(id => fn(map[id])).filter(Boolean).join(' · ') + (arr.length > 2 ? ` +${arr.length - 2}` : '')
    }
    switch (step) {
      case 1: return sels.empresas.length === 0 ? 'Todas as empresas' : label2(sels.empresas, empMap, e => e?.razao_social)
      case 2: return sels.operacoes.length === 0 ? 'Todas as operações' : label2(sels.operacoes, opMap, o => o?.nome)
      case 3: {
        const lab = sels.sindicatosLab.length === 0 ? 'Todos laborais' : label2(sels.sindicatosLab, sindMap, s => s?.sigla || s?.razao_social)
        const pat = sels.sindicatosPat.length === 0 ? 'Todos patronais' : label2(sels.sindicatosPat, sindMap, s => s?.sigla || s?.razao_social)
        return lab + ' | ' + pat
      }
      case 4: return `${fontesAtivas.length} fonte(s) configurada(s)`
      default: return ''
    }
  }

  // ── Itens manuais ────────────────────────────────────────────────────────
  function adicionarItemManual(fonteId) {
    if (!novoItem.titulo && !novoItem.conteudo) return
    setConteudoManual(prev => ({
      ...prev,
      [fonteId]: [...(prev[fonteId] || []), { ...novoItem, numero: String((prev[fonteId]?.length || 0) + 1) }],
    }))
    setNovoItem({ titulo: '', conteudo: '' })
    setEditandoManual(null)
  }

  function removerItemManual(fonteId, idx) {
    setConteudoManual(prev => ({
      ...prev,
      [fonteId]: prev[fonteId].filter((_, i) => i !== idx),
    }))
  }

  // ── Comparar ─────────────────────────────────────────────────────────────
  async function comparar() {
    const fontesConfigs = FONTES_CONFIG.filter(f => fontesAtivas.includes(f.id))
    if (fontesConfigs.length < 2) return alert('Ative pelo menos 2 fontes para comparar.')

    setLoading(true); setComparado(false); setExpandidos(new Set()); setSelecionados(new Set())
    const clausulas = {}

    for (const fonte of fontesConfigs) {
      if (fonte.tipo === 'instrumento') {
        const instId = instPorFonte[fonte.id]
        if (!instId) { clausulas[fonte.id] = []; continue }
        const { data } = await supabase.from('clausulas').select('*').eq('instrumento_id', instId).eq('user_id', user.id).order('numero')
        clausulas[fonte.id] = (data || []).map(c => ({ ...c, subcategoria: normalizarSubcategoria(c.subcategoria) }))
      } else {
        // Manual: usa conteúdo digitado
        clausulas[fonte.id] = (conteudoManual[fonte.id] || []).map((item, idx) => ({
          id: `manual_${fonte.id}_${idx}`,
          numero: item.numero || String(idx + 1),
          titulo: item.titulo,
          conteudo: item.conteudo,
          categoria: item.categoria || '',
          subcategoria: item.subcategoria || '',
        }))
      }
    }

    setClausulasPorFonte(clausulas)
    const linhas = compararMultiFontes(clausulas, fontesConfigs)
    setLinhasComparadas(linhas)
    setLoading(false); setComparado(true)
    setStatusFiltro(new Set(['INALTERADA', 'ALTERADA', 'NOVA', 'AUSENTE']))
  }

  // ── Ordenação e filtro ────────────────────────────────────────────────────
  const fontesConfigsAtivas = FONTES_CONFIG.filter(f => fontesAtivas.includes(f.id))

  const linhasProcessadas = useMemo(() => {
    return linhasComparadas.map(linha => ({
      ...linha,
      status: statusDaLinha(linha.celulas, fontesConfigsAtivas),
      superioridade: avaliarSuperioridade(linha.celulas, fontesConfigsAtivas),
    }))
  }, [linhasComparadas, fontesConfigsAtivas])

  const filtradas = useMemo(() => {
    const q = busca.toLowerCase()
    return linhasProcessadas.filter(l =>
      statusFiltro.has(l.status) &&
      (!q || l.topico?.toLowerCase().includes(q) ||
        fontesConfigsAtivas.some(f => l.celulas[f.id]?.titulo?.toLowerCase().includes(q) || l.celulas[f.id]?.conteudo?.toLowerCase().includes(q)))
    )
  }, [linhasProcessadas, statusFiltro, busca, fontesConfigsAtivas])

  const filtradaOrdenada = useMemo(() => {
    if (ordenacao === 'status') return [...filtradas].sort((a, b) => {
      const ordem = { 'INALTERADA': 0, 'ALTERADA': 1, 'NOVA': 2, 'AUSENTE': 3 }
      return (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9)
    })
    if (ordenacao === 'crescente') return [...filtradas].sort((a, b) => {
      const nA = toNumeroOrdinal(a.celulas[fontesRef]?.numero)
      const nB = toNumeroOrdinal(b.celulas[fontesRef]?.numero)
      return nA - nB
    })
    if (ordenacao === 'decrescente') return [...filtradas].sort((a, b) => {
      const nA = toNumeroOrdinal(a.celulas[fontesRef]?.numero)
      const nB = toNumeroOrdinal(b.celulas[fontesRef]?.numero)
      return nB - nA
    })
    return filtradas
  }, [filtradas, ordenacao, fontesRef])

  const statsStatus = useMemo(() => {
    return linhasProcessadas.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc }, {})
  }, [linhasProcessadas])

  function toggleStatus(s) {
    setStatusFiltro(prev => {
      const n = new Set(prev)
      if (n.has(s)) { if (n.size === 1) return n; n.delete(s) } else n.add(s)
      return n
    })
  }

  function toggleCard(idx) { setExpandidos(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n }) }
  function toggleExpandAll() { setModoExpandido(v => !v); setExpandidos(new Set()) }
  const isExpanded = idx => modoExpandido ? !expandidos.has(idx) : expandidos.has(idx)
  function toggleSelecionado(idx) { setSelecionados(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n }) }
  const todosSelecionados = filtradaOrdenada.length > 0 && filtradaOrdenada.every((_, i) => selecionados.has(i))
  function toggleSelecionarTodos() { todosSelecionados ? setSelecionados(new Set()) : setSelecionados(new Set(filtradaOrdenada.map((_, i) => i))) }

  // ── Exportação ────────────────────────────────────────────────────────────
  function exportarExcel() {
    const itens = selecionados.size > 0 ? filtradaOrdenada.filter((_, i) => selecionados.has(i)) : filtradaOrdenada
    const wb = XLSX.utils.book_new()
    const rows = itens.map(l => {
      const row = { 'Tópico': l.topico, 'Status': l.status }
      fontesConfigsAtivas.forEach(f => {
        const cel = l.celulas[f.id]
        row[`${f.label} — Título`] = cel?.titulo || '—'
        row[`${f.label} — Conteúdo`] = cel?.conteudo || '(ausente)'
        const sup = l.superioridade?.[f.id]
        row[`${f.label} — Avaliação`] = sup ? sup.charAt(0).toUpperCase() + sup.slice(1) : '—'
      })
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 40 }, { wch: 14 }, ...fontesConfigsAtivas.flatMap(() => [{ wch: 40 }, { wch: 80 }, { wch: 16 }])]
    XLSX.utils.book_append_sheet(wb, ws, 'Negociação')
    XLSX.writeFile(wb, 'negociacao_sindical_' + new Date().toISOString().slice(0, 10) + '.xlsx')
  }

  function exportarPDF() {
    const itens = selecionados.size > 0 ? filtradaOrdenada.filter((_, i) => selecionados.has(i)) : filtradaOrdenada
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(13)
    doc.text('Negociação Sindical — Motor CCT', 14, 16)
    doc.setFontSize(8); doc.setTextColor(120)
    doc.text(`Fontes: ${fontesConfigsAtivas.map(f => f.label).join(' | ')}   Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 22)
    doc.setTextColor(0)
    const colunas = [
      { header: 'Tópico', dataKey: 'topico' },
      { header: 'Status', dataKey: 'status' },
      ...fontesConfigsAtivas.flatMap(f => [
        { header: f.label, dataKey: `conteudo_${f.id}` },
        { header: `Avaliação (${f.icone})`, dataKey: `aval_${f.id}` },
      ]),
    ]
    const body = itens.map(l => {
      const row = { topico: l.topico, status: l.status }
      fontesConfigsAtivas.forEach(f => {
        const cel = l.celulas[f.id]
        row[`conteudo_${f.id}`] = cel ? (cel.titulo ? cel.titulo + '\n' : '') + (cel.conteudo || '') : '(ausente)'
        const sup = l.superioridade?.[f.id]
        row[`aval_${f.id}`] = sup ? sup.charAt(0).toUpperCase() + sup.slice(1) : '—'
      })
      return row
    })
    doc.autoTable({
      startY: 26,
      columns: colunas,
      body,
      styles: { fontSize: 6.5, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 64, 175], fontSize: 7 },
      columnStyles: {
        topico: { cellWidth: 35 },
        status: { cellWidth: 20 },
      },
    })
    doc.save('negociacao_sindical_' + new Date().toISOString().slice(0, 10) + '.pdf')
  }

  // ── Ícone de superioridade ────────────────────────────────────────────────
  function iconeSup(val) {
    if (!val) return null
    if (val === 'superior') return <span className="text-emerald-600 font-bold" title="Superior às demais fontes">▲</span>
    if (val === 'inferior') return <span className="text-red-500 font-bold" title="Inferior às demais fontes">▼</span>
    if (val === 'igual') return <span className="text-slate-400" title="Igual às demais fontes">═</span>
    return <span className="text-amber-500 font-bold" title="Intermediário">◈</span>
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="pb-24">
      <style>{`
        mark.diff-rem{background:#ede9fe;color:#5b21b6;border-radius:2px;padding:0 1px;text-decoration:line-through;text-decoration-color:#7c3aed}
        mark.diff-add{background:#dcfce7;color:#166534;border-radius:2px;padding:0 1px}
      `}</style>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-800">🤝 Negociação Sindical</h1>
          <p className="text-slate-500 text-sm">Compare prática atual, ACT, CCT e proposta sindical — identifique diferenças e avalie superioridade</p>
        </div>
        {confirmados.size > 0 && (
          <button onClick={resetar} className="btn-secondary text-xs py-1.5 flex-shrink-0 mt-1">↺ Recomeçar</button>
        )}
      </div>

      {/* ── Step 1 — Empresa ── */}
      <StepCard number="1" title="Empresa" subtitle="Selecione a empresa do cliente"
        active={stepAtivo === 1} done={confirmados.has(1)} locked={false}
        summary={resumo(1)} onEdit={() => editar(1)}
        onConfirm={() => confirmar(1)} onSkip={() => confirmar(1, true)}>
        <CheckList
          opcoes={empresas.map(e => ({ value: e.id, label: e.razao_social, cnpj: e.cnpj || '' }))}
          selecionados={sels.empresas}
          onChange={v => setSels(prev => ({ ...prev, empresas: v }))}
          busca={buscas.emp} onBusca={v => setBuscas(b => ({ ...b, emp: v }))} />
      </StepCard>

      {/* ── Step 2 — Operação ── */}
      <StepCard number="2" title="Operação"
        subtitle={opcoesOp.length + ' operação(ões) disponível(is)'}
        active={stepAtivo === 2} done={confirmados.has(2)} locked={stepAtivo < 2 && !confirmados.has(1)}
        summary={resumo(2)} onEdit={() => editar(2)}
        onConfirm={() => confirmar(2)} onSkip={() => confirmar(2, true)}>
        <CheckList
          opcoes={opcoesOp.map(o => ({ value: o.id, label: o.nome + (o.codigo ? ` (${o.codigo})` : '') }))}
          selecionados={sels.operacoes}
          onChange={v => setSels(prev => ({ ...prev, operacoes: v }))}
          busca={buscas.op} onBusca={v => setBuscas(b => ({ ...b, op: v }))} />
      </StepCard>

      {/* ── Step 3 — Sindicatos ── */}
      <StepCard number="3" title="Sindicatos" subtitle="Laboral e patronal"
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

      {/* ── Step 4 — Configurar fontes ── */}
      <StepCard number="4" title="Configurar Fontes de Comparação"
        subtitle="Ative as fontes desejadas e selecione os instrumentos"
        active={stepAtivo === 4} done={confirmados.has(4)} locked={stepAtivo < 4 && !confirmados.has(3)}
        summary={resumo(4)} onEdit={() => editar(4)}
        confirmLabel="⚖️ Comparar agora"
        onConfirm={comparar}>

        <div className="space-y-4">
          {FONTES_CONFIG.map(fonte => {
            const ativo = fontesAtivas.includes(fonte.id)
            return (
              <div key={fonte.id} className={`rounded-xl border-2 transition-all ${ativo ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200 bg-white opacity-60'}`}>
                <div className="flex items-center gap-3 p-3">
                  <input type="checkbox" checked={ativo}
                    onChange={e => {
                      if (e.target.checked) setFontesAtivas(prev => [...prev, fonte.id])
                      else setFontesAtivas(prev => prev.filter(id => id !== fonte.id))
                    }}
                    className="w-4 h-4 accent-blue-600 cursor-pointer" />
                  <span className="text-lg">{fonte.icone}</span>
                  <span className="font-medium text-sm text-slate-700" style={{ color: fonte.cor }}>{fonte.label}</span>
                  <span className="text-xs text-slate-400 ml-auto">
                    {fonte.tipo === 'instrumento' ? 'Instrumento cadastrado' : 'Conteúdo manual'}
                  </span>
                </div>

                {ativo && (
                  <div className="px-4 pb-4">
                    {fonte.tipo === 'instrumento' && (
                      <div>
                        <label className="label text-xs">
                          Selecione o {fonte.label} ({fonte.id === 'act' ? acts.length : ccts.length} disponível(is))
                        </label>
                        <select className="input text-sm"
                          value={instPorFonte[fonte.id] || ''}
                          onChange={e => setInstPorFonte(prev => ({ ...prev, [fonte.id]: e.target.value }))}>
                          <option value="">— Nenhum (não incluir) —</option>
                          {(fonte.id === 'act' ? acts : ccts).map(i => (
                            <option key={i.id} value={i.id}>{instLabel(i)}</option>
                          ))}
                          {/* Também mostra outros instrumentos quando não há ACT/CCT específico */}
                          {(fonte.id === 'act' ? acts : ccts).length === 0 && instsFiltrados.map(i => (
                            <option key={i.id} value={i.id}>{instLabel(i)}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {fonte.tipo === 'manual' && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500">
                          {fonte.id === 'pratica'
                            ? 'Insira os benefícios/práticas atuais do cliente (salários, jornada, benefícios, etc.)'
                            : 'Insira a proposta apresentada pelo sindicato na mesa de negociação'}
                        </p>
                        {(conteudoManual[fonte.id] || []).map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2 bg-white rounded-lg border border-slate-200 p-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-700 truncate">{item.titulo || `Item ${idx + 1}`}</p>
                              <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{item.conteudo}</p>
                            </div>
                            <button onClick={() => removerItemManual(fonte.id, idx)}
                              className="text-slate-300 hover:text-red-500 transition-colors text-sm flex-shrink-0">✕</button>
                          </div>
                        ))}
                        {editandoManual?.fonteId === fonte.id ? (
                          <div className="bg-white rounded-lg border-2 border-brand-300 p-3 space-y-2">
                            <input className="input text-xs" placeholder="Título do item (ex: Reajuste Salarial)"
                              value={novoItem.titulo}
                              onChange={e => setNovoItem(prev => ({ ...prev, titulo: e.target.value }))} />
                            <textarea className="input text-xs resize-none" rows={4}
                              placeholder="Conteúdo / condição atual ou proposta..."
                              value={novoItem.conteudo}
                              onChange={e => setNovoItem(prev => ({ ...prev, conteudo: e.target.value }))} />
                            <div className="flex gap-2">
                              <button onClick={() => adicionarItemManual(fonte.id)}
                                className="btn-primary text-xs py-1 flex-1">+ Adicionar</button>
                              <button onClick={() => { setEditandoManual(null); setNovoItem({ titulo: '', conteudo: '' }) }}
                                className="btn-secondary text-xs py-1">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setEditandoManual({ fonteId: fonte.id }); setNovoItem({ titulo: '', conteudo: '' }) }}
                            className="btn-secondary text-xs py-1.5 w-full mt-1">
                            + Adicionar item em "{fonte.label}"
                          </button>
                        )}
                        {(conteudoManual[fonte.id] || []).length === 0 && (
                          <p className="text-xs text-slate-400 italic">
                            Sem itens adicionados — esta fonte será incluída como "ausente" em todos os tópicos.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {loading && <p className="text-slate-400 text-sm py-2 mt-3">⏳ Comparando fontes...</p>}
      </StepCard>

      {/* ── Resultado ── */}
      {comparado && (
        <div className="mt-4">
          {/* Resumo de status */}
          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-2">Filtrar por tipo:</p>
            <div className="grid grid-cols-4 gap-2">
              {['INALTERADA', 'ALTERADA', 'NOVA', 'AUSENTE'].map(s => (
                <button key={s} onClick={() => toggleStatus(s)}
                  className={`p-2 rounded-lg border-2 text-center transition-all select-none ${statusFiltro.has(s) ? STATUS_CLS[s] + ' shadow-sm' : 'border-slate-200 bg-white opacity-40 hover:opacity-60'}`}>
                  <p className="text-lg font-bold">{statsStatus[s] || 0}</p>
                  <p className="text-[10px] font-medium leading-tight">{s}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Legenda superioridade */}
          <div className="flex gap-4 mb-3 text-xs text-slate-500 flex-wrap">
            <span><span className="text-emerald-600 font-bold">▲</span> Superior às demais</span>
            <span><span className="text-red-500 font-bold">▼</span> Inferior às demais</span>
            <span><span className="text-amber-500 font-bold">◈</span> Intermediário</span>
            <span><span className="text-slate-400">═</span> Igual às demais</span>
            {mostrarDiff && <>
              <span><mark style={{ background: '#ede9fe', color: '#5b21b6', borderRadius: '2px', padding: '0 3px', textDecoration: 'line-through' }}>removido</mark></span>
              <span><mark style={{ background: '#dcfce7', color: '#166534', borderRadius: '2px', padding: '0 3px' }}>adicionado</mark></span>
            </>}
          </div>

          {/* Controles */}
          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <input className="input max-w-xs text-sm" placeholder="Buscar por tópico ou conteúdo..."
              value={busca} onChange={e => setBusca(e.target.value)} />
            <select className="input w-auto text-xs" value={ordenacao} onChange={e => setOrdenacao(e.target.value)}>
              <option value="original">Ordem original</option>
              <option value="crescente">Crescente (nº cláusula)</option>
              <option value="decrescente">Decrescente (nº cláusula)</option>
              <option value="status">Por tipo</option>
            </select>
            {ordenacao !== 'original' && ordenacao !== 'status' && (
              <select className="input w-auto text-xs" value={fontesRef} onChange={e => setFontesRef(e.target.value)}>
                <option value="">Fonte base p/ ordenação</option>
                {fontesConfigsAtivas.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            )}
            <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={mostrarDiff} onChange={e => setMostrarDiff(e.target.checked)} />
              Destacar diferenças
            </label>
            <button className="btn-secondary text-xs" onClick={toggleExpandAll}>
              {modoExpandido ? '📕 Recolher tudo' : '📖 Expandir tudo'}
            </button>
            <button className="btn-secondary text-xs" onClick={exportarExcel}>
              📊 {selecionados.size > 0 ? `Excel (${selecionados.size})` : 'Excel'}
            </button>
            <button className="btn-secondary text-xs" onClick={exportarPDF}>
              📄 {selecionados.size > 0 ? `PDF (${selecionados.size})` : 'PDF'}
            </button>
          </div>

          {/* Seleção total */}
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-slate-50 rounded-lg text-xs text-slate-500">
            <input type="checkbox" checked={todosSelecionados} onChange={toggleSelecionarTodos} className="w-4 h-4 cursor-pointer" />
            <span>{todosSelecionados ? 'Desselecionar tudo' : 'Selecionar tudo'} — {filtradaOrdenada.length} visíveis</span>
            {selecionados.size > 0 && <span className="ml-auto text-brand-600 font-medium">{selecionados.size} selecionada(s)</span>}
          </div>

          {/* Cabeçalho das colunas */}
          <div className={`hidden md:grid gap-2 px-3 py-2 bg-slate-100 rounded-lg text-xs font-semibold text-slate-600 mb-2`}
            style={{ gridTemplateColumns: `32px 120px ${fontesConfigsAtivas.map(() => '1fr').join(' ')}` }}>
            <span />
            <span>Tópico / Status</span>
            {fontesConfigsAtivas.map(f => (
              <span key={f.id} style={{ color: f.cor }}>{f.icone} {f.label}</span>
            ))}
          </div>

          {/* Linhas */}
          <div className="space-y-2">
            {filtradaOrdenada.map((linha, idx) => {
              const expanded = isExpanded(idx)
              const selected = selecionados.has(idx)
              const statusCls = STATUS_CLS[linha.status] || 'bg-slate-100 text-slate-700 border-slate-300'

              return (
                <div key={idx} className={`card overflow-hidden transition-all ${selected ? 'ring-2 ring-brand-400' : ''}`}>
                  {/* Header da linha */}
                  <div className="p-3 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => toggleCard(idx)}>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={selected}
                        onChange={() => toggleSelecionado(idx)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 flex-shrink-0 cursor-pointer accent-blue-600 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 border ${statusCls}`}>{linha.status}</span>
                          <span className="text-sm font-medium text-slate-700 truncate">{linha.topico}</span>
                        </div>
                        {/* Preview resumido das fontes */}
                        {!expanded && (
                          <div className="flex gap-3 mt-1 flex-wrap">
                            {fontesConfigsAtivas.map(f => {
                              const cel = linha.celulas[f.id]
                              const sup = linha.superioridade?.[f.id]
                              return (
                                <div key={f.id} className="flex items-center gap-1">
                                  <span className="text-[10px] font-semibold" style={{ color: f.cor }}>{f.icone}</span>
                                  <span className="text-[10px] text-slate-500 max-w-[120px] truncate">
                                    {cel ? (cel.titulo || cel.conteudo?.slice(0, 40) + '...') : '—'}
                                  </span>
                                  {sup && <span className="text-[10px]">{iconeSup(sup)}</span>}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      <span className="text-slate-300 text-sm flex-shrink-0">{expanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Conteúdo expandido — grade de fontes */}
                  {expanded && (
                    <div className="border-t border-slate-100">
                      <div className={`grid divide-x divide-slate-100`}
                        style={{ gridTemplateColumns: fontesConfigsAtivas.map(() => '1fr').join(' ') }}>
                        {fontesConfigsAtivas.map((f, fi) => {
                          const cel = linha.celulas[f.id]
                          const sup = linha.superioridade?.[f.id]
                          // Diff em relação à primeira fonte ativa que existe
                          const refId = fontesConfigsAtivas.find(ff => linha.celulas[ff.id] && ff.id !== f.id)?.id
                          const diff = mostrarDiff && cel && refId && linha.celulas[refId]
                            ? diffTexto(linha.celulas[refId].conteudo || '', cel.conteudo || '')
                            : null

                          return (
                            <div key={f.id} className="p-3" style={{ background: `${f.cor}08` }}>
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="text-sm">{f.icone}</span>
                                <span className="text-xs font-bold" style={{ color: f.cor }}>{f.label}</span>
                                {sup && (
                                  <span className="ml-auto flex items-center gap-0.5 text-xs">
                                    {iconeSup(sup)}
                                    <span className="text-slate-500">{sup}</span>
                                  </span>
                                )}
                              </div>
                              {cel ? (
                                <>
                                  {cel.titulo && cel.titulo !== cel.conteudo && (
                                    <p className="text-xs font-semibold text-slate-700 mb-1">{cel.titulo}</p>
                                  )}
                                  {diff
                                    ? <DiffText html={fi === 0 ? diff.html_a : diff.html_b} />
                                    : <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{cel.conteudo}</p>
                                  }
                                </>
                              ) : (
                                <p className="text-xs text-slate-400 italic">Não consta nesta fonte</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {filtradaOrdenada.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <p className="text-2xl mb-2">🔍</p>
                <p className="text-sm">Nenhum tópico encontrado com os filtros aplicados.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barra flutuante de exportação */}
      {selecionados.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white rounded-2xl px-5 py-3 flex items-center gap-3 shadow-2xl z-50 border border-slate-700">
          <span className="text-sm font-semibold">{selecionados.size} item(s) selecionado(s)</span>
          <button onClick={exportarExcel} className="text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors">📊 Excel</button>
          <button onClick={exportarPDF}   className="text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors">📄 PDF</button>
          <button onClick={() => setSelecionados(new Set())} className="text-xs opacity-60 hover:opacity-100 ml-1">✕ Limpar</button>
        </div>
      )}
    </div>
  )
}
