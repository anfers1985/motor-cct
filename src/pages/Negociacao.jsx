import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { compararInstrumentosNeg, avaliarSuperioridade, STATUS_CONFIG } from '../utils/comparacao'
import { toNumeroOrdinal } from '../utils/ordenacao'
import CheckList from '../components/UI/CheckList'
import StepCard from '../components/UI/StepCard'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

// ─── Fontes disponíveis ────────────────────────────────────────────────────────
const FONTES_CONFIG = {
  pratica:  { label: 'Prática do Cliente',  icone: '🏢', cor: 'bg-amber-100 text-amber-800 border-amber-300',   tipoInstrumento: 'Prática Interna' },
  act:      { label: 'ACT',                  icone: '📋', cor: 'bg-blue-100 text-blue-800 border-blue-300',       tipoInstrumento: null },
  cct:      { label: 'CCT',                  icone: '📄', cor: 'bg-purple-100 text-purple-800 border-purple-300', tipoInstrumento: null },
  proposta: { label: 'Proposta Sindical',    icone: '✋', cor: 'bg-rose-100 text-rose-800 border-rose-300',       tipoInstrumento: 'Proposta Sindical' },
}

// Fontes que usam instrumento cadastrado (ACT, CCT — e também Prática/Proposta se cadastradas)
const FONTES_COM_INSTRUMENTO = ['pratica', 'act', 'cct', 'proposta']

// ─── Diff palavra por palavra (igual ao Comparativo) ─────────────────────────
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
    if (i > 0 && j > 0 && wA[i-1] === wB[j-1]) { ops.unshift({ t: 'eq', v: wA[i-1] }); i--; j-- }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { ops.unshift({ t: 'add', v: wB[j-1] }); j-- }
    else { ops.unshift({ t: 'rem', v: wA[i-1] }); i-- }
  }
  let ha = '', hb = ''
  for (const op of ops) {
    if (op.t === 'eq') { ha += op.v; hb += op.v }
    else if (op.t === 'rem') ha += `<mark class="diff-rem">${op.v}</mark>`
    else hb += `<mark class="diff-add">${op.v}</mark>`
  }
  return { html_a: ha, html_b: hb }
}

function DiffSpan({ html }) {
  return <span className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: html }} />
}

// ─── Badge de status com cor ──────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['Modificada']
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg.cls}`}>
      {cfg.icone} {status}
    </span>
  )
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

  // Fontes
  const [fontesAtivas, setFontesAtivas] = useState(new Set(['act', 'cct']))
  const [instSelecionado, setInstSelecionado] = useState({ pratica: '', act: '', cct: '', proposta: '' })
  const [clausulasCache, setClausulasCache] = useState({})

  // Resultado
  const [resultado, setResultado] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  // Controles da tabela
  const [fonteBase, setFonteBase] = useState('')
  const [busca, setBusca] = useState('')
  const [statusAtivos, setStatusAtivos] = useState(new Set(Object.keys(STATUS_CONFIG)))
  const [mostrarDiff, setMostrarDiff] = useState(true)
  const [ordenacao, setOrdenacao] = useState('original')
  const [fonteOrdenacao, setFonteOrdenacao] = useState('') // qual fonte usar como referência ao ordenar por status
  const [expandidos, setExpandidos] = useState(new Set())
  const [modoExpandido, setModoExpandido] = useState(false)
  const [selecionados, setSelecionados] = useState(new Set())

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
  const instsPorEmpresa = sels.empresas.length > 0 ? todosInstrumentos.filter(i => sels.empresas.includes(i.empresa_id)) : todosInstrumentos
  const opcoesOp = operacoes.filter(o => instsPorEmpresa.some(i => i.operacao_id === o.id))
  const instsPorOp = sels.operacoes.length > 0 ? instsPorEmpresa.filter(i => sels.operacoes.includes(i.operacao_id)) : instsPorEmpresa
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
    return `${i.tipo} — ${i.nome}${emp ? ' · ' + emp.razao_social : ''}`
  }

  // Stepper
  function confirmar(step, pular = false) {
    if (pular) {
      if (step === 1) setSels(p => ({ ...p, empresas: [] }))
      if (step === 2) setSels(p => ({ ...p, operacoes: [] }))
      if (step === 3) setSels(p => ({ ...p, sindicatosLab: [], sindicatosPat: [] }))
    }
    const n = new Set(confirmados); n.add(step)
    for (let s = step + 1; s <= 3; s++) n.delete(s)
    setConfirmados(n); setStepAtivo(step + 1); setResultado(null)
  }

  function editar(step) {
    setStepAtivo(step)
    const n = new Set(confirmados)
    for (let s = step; s <= 3; s++) n.delete(s)
    setConfirmados(n)
    if (step <= 1) setSels(p => ({ ...p, operacoes: [], sindicatosLab: [], sindicatosPat: [] }))
    else if (step === 2) setSels(p => ({ ...p, sindicatosLab: [], sindicatosPat: [] }))
    setResultado(null)
  }

  function resumoStep(step) {
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

  const buscarClausulas = useCallback(async (instId) => {
    if (!instId) return []
    if (clausulasCache[instId]) return clausulasCache[instId]
    const { data } = await supabase.from('clausulas').select('*').eq('instrumento_id', instId).order('numero')
    const result = data || []
    setClausulasCache(prev => ({ ...prev, [instId]: result }))
    return result
  }, [clausulasCache])

  function toggleFonte(fonte) {
    setFontesAtivas(prev => {
      const n = new Set(prev)
      if (n.has(fonte)) { if (n.size === 1) return n; n.delete(fonte) } else n.add(fonte)
      return n
    })
    setResultado(null)
  }

  function resetar() {
    setStepAtivo(1); setConfirmados(new Set())
    setSels({ empresas: [], operacoes: [], sindicatosLab: [], sindicatosPat: [] })
    setBuscas({ emp: '', op: '', sindLab: '', sindPat: '' })
    setFontesAtivas(new Set(['act', 'cct']))
    setInstSelecionado({ pratica: '', act: '', cct: '', proposta: '' })
    setResultado(null); setSelecionados(new Set()); setExpandidos(new Set()); setModoExpandido(false)
    setBusca(''); setFonteBase(''); setOrdenacao('original'); setFonteOrdenacao('')
  }


  function instsParaFonte(chave) {
    const cfg = FONTES_CONFIG[chave]
    if (!cfg) return instsPorSind
    if (chave === 'act') return instsPorSind.filter(i => i.tipo === 'ACT')
    if (chave === 'cct') return instsPorSind.filter(i => i.tipo === 'CCT' || i.tipo === 'Aditivo' || i.tipo === 'Acordo Extrajudicial')
    if (cfg.tipoInstrumento) return instsPorSind.filter(i => i.tipo === cfg.tipoInstrumento)
    return instsPorSind
  }

  async function comparar() {
    const fontesLista = [...fontesAtivas]
    if (fontesLista.length < 2) return setErro('Selecione ao menos 2 fontes para comparar.')
    for (const f of fontesLista) {
      if (!instSelecionado[f]) return setErro(`Selecione o instrumento para "${FONTES_CONFIG[f].label}" ou desative a fonte.`)
    }
    setLoading(true); setErro(''); setResultado(null)
    setExpandidos(new Set()); setModoExpandido(false); setSelecionados(new Set())
    try {
      const clausulasPorFonte = {}
      for (const f of fontesLista) {
        clausulasPorFonte[f] = await buscarClausulas(instSelecionado[f])
      }
      const baseEfetiva = fontesLista.includes(fonteBase) ? fonteBase : fontesLista[0]
      const comparadas = fontesLista.filter(f => f !== baseEfetiva)
      setFonteBase(baseEfetiva)
      const comparativos = {}
      for (const fc of comparadas) {
        comparativos[fc] = compararInstrumentosNeg(clausulasPorFonte[baseEfetiva], clausulasPorFonte[fc])
      }
      setResultado({ clausulasPorFonte, comparativos, baseEfetiva, comparadas, fontesLista })
      setStatusAtivos(new Set(Object.keys(STATUS_CONFIG)))
    } catch (e) {
      setErro('Erro ao comparar: ' + e.message)
    }
    setLoading(false)
  }

  // ─── Monta as linhas do comparativo ──────────────────────────────────────────
  const linhasResultado = (() => {
    if (!resultado) return []
    const { clausulasPorFonte, comparativos, baseEfetiva, comparadas } = resultado
    const clausulasBase = clausulasPorFonte[baseEfetiva] || []

    // Vigência de cada instrumento selecionado, por fonte
    const vigenciaPorFonte = {}
    for (const f of resultado.fontesLista) {
      const inst = todosInstrumentos.find(i => i.id === instSelecionado[f])
      vigenciaPorFonte[f] = inst ? { inicio: inst.vigencia_inicio, fim: inst.vigencia_fim } : null
    }

    const linhas = clausulasBase.map((cb, idx) => {
      const pares = {}
      const avaliacoes = {}
      for (const fc of comparadas) {
        const comp = comparativos[fc] || []
        const par = comp.find(r => r.clausulaA?.id === cb.id)
        pares[fc] = par || null
        avaliacoes[fc] = avaliarSuperioridade(
          cb.conteudo, par?.clausulaB?.conteudo, cb.titulo,
          vigenciaPorFonte[baseEfetiva], vigenciaPorFonte[fc]
        )
      }
      // Status geral da linha: pior status entre todas as comparadas
      const statusOrder = ['Exclusiva', 'Inferior', 'Superior', 'Modificada', 'Igual']
      let statusGeral = 'Igual'
      for (const fc of comparadas) {
        const s = avaliacoes[fc].status
        if (statusOrder.indexOf(s) < statusOrder.indexOf(statusGeral)) statusGeral = s
      }
      return { clausulaBase: cb, pares, avaliacoes, statusGeral, idx }
    })

    // Cláusulas exclusivas da comparada (não existem na base)
    const novas = []
    for (const fc of comparadas) {
      const comp = comparativos[fc] || []
      comp.filter(r => r.status.label === 'NOVA').forEach(r => {
        novas.push({
          clausulaBase: null,
          pares: { [fc]: r },
          avaliacoes: { [fc]: { status: 'Exclusiva', resumo: `Cláusula exclusiva da fonte ${FONTES_CONFIG[fc]?.label} — não existe na base.` } },
          statusGeral: 'Exclusiva',
          fontaExclusiva: fc,
          clausulaNova: r.clausulaB,
          idx: linhas.length + novas.length,
        })
      })
    }
    return [...linhas, ...novas]
  })()

  // Filtro e ordenação
  const filtrado = linhasResultado.filter(r => {
    if (!statusAtivos.has(r.statusGeral)) return false
    const q = busca.toLowerCase()
    if (q) {
      const titulo = r.clausulaBase?.titulo || r.clausulaNova?.titulo || ''
      if (!titulo.toLowerCase().includes(q)) return false
    }
    return true
  })

  const filtradoOrdenado = (() => {
    const arr = [...filtrado]
    const ord = Object.keys(STATUS_CONFIG)
    const statusKey = r => {
      if (fonteOrdenacao && r.avaliacoes?.[fonteOrdenacao]) return r.avaliacoes[fonteOrdenacao].status
      return r.statusGeral
    }
    // Ordenação numérica por fonte: numFonte_asc / numFonte_desc
    if (ordenacao.startsWith('num_') && resultado) {
      const [, , fonte, dir] = ordenacao.split('_') // 'num_act_asc' → ['num','','act','asc'] ... na verdade 'num_act_asc'
      // Extrair fonte e direção da string "num_{fonte}_{dir}"
      const parts = ordenacao.replace(/^num_/, '').split('_')
      const dir2 = parts.pop()   // 'asc' ou 'desc'
      const fonteNum = parts.join('_') // 'act', 'cct', 'proposta', etc.
      const getNum = r => {
        if (!resultado) return 9999
        if (fonteNum === resultado.baseEfetiva) {
          return toNumeroOrdinal(r.clausulaBase?.numero)
        }
        const par = r.pares?.[fonteNum]
        const clausB = par?.clausulaB || r.clausulaNova
        return toNumeroOrdinal(clausB?.numero)
      }
      return dir2 === 'desc'
        ? arr.sort((a, b) => getNum(b) - getNum(a))
        : arr.sort((a, b) => getNum(a) - getNum(b))
    }
    switch (ordenacao) {
      case 'status':      return arr.sort((a, b) => ord.indexOf(statusKey(a)) - ord.indexOf(statusKey(b)))
      case 'status_desc': return arr.sort((a, b) => ord.indexOf(statusKey(b)) - ord.indexOf(statusKey(a)))
      default: return arr
    }
  })()

  const statsStatus = linhasResultado.reduce((acc, r) => { acc[r.statusGeral] = (acc[r.statusGeral] || 0) + 1; return acc }, {})

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
  const todosSel = filtradoOrdenado.length > 0 && filtradoOrdenado.every((_, i) => selecionados.has(i))
  function toggleSelTodos() { todosSel ? setSelecionados(new Set()) : setSelecionados(new Set(filtradoOrdenado.map((_, i) => i))) }

  // ─── Exportações ─────────────────────────────────────────────────────────────
  function exportarExcel() {
    if (!resultado) return
    const itens = selecionados.size > 0 ? filtradoOrdenado.filter((_, i) => selecionados.has(i)) : filtradoOrdenado
    const { comparadas, baseEfetiva } = resultado
    const fBase = FONTES_CONFIG[baseEfetiva]?.label || baseEfetiva
    const wb = XLSX.utils.book_new()
    const rows = itens.map(r => {
      const row = {
        'Status Geral': r.statusGeral,
        [`Nº (${fBase})`]: r.clausulaBase?.numero || '',
        [`Título (${fBase})`]: r.clausulaBase?.titulo || r.clausulaNova?.titulo || '',
        [`Conteúdo (${fBase})`]: r.clausulaBase?.conteudo || '',
      }
      for (const fc of comparadas) {
        const par = r.pares[fc]
        const av = r.avaliacoes?.[fc] || {}
        const fl = FONTES_CONFIG[fc]?.label || fc
        row[`Conteúdo (${fl})`] = par?.clausulaB?.conteudo || ''
        row[`Resultado vs ${fl}`] = av.status || '—'
        row[`Resumo vs ${fl}`] = av.resumo || ''
      }
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    // Larguras automáticas
    ws['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 40 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Negociação')
    XLSX.writeFile(wb, 'negociacao_sindical_' + new Date().toISOString().slice(0, 10) + '.xlsx')
  }

  function exportarPDF() {
    if (!resultado) return
    const itens = selecionados.size > 0 ? filtradoOrdenado.filter((_, i) => selecionados.has(i)) : filtradoOrdenado
    const { comparadas, baseEfetiva } = resultado
    const fBase = FONTES_CONFIG[baseEfetiva]?.label || baseEfetiva
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

    const STATUS_COLOR = {
      Superior:   [220, 252, 231],
      Inferior:   [254, 226, 226],
      Igual:      [241, 245, 249],
      Modificada: [219, 234, 254],
      Exclusiva:  [243, 232, 255],
    }
    const STATUS_TEXT_COLOR = {
      Superior:   [22, 101, 52],
      Inferior:   [185, 28, 28],
      Igual:      [71, 85, 105],
      Modificada: [30, 64, 175],
      Exclusiva:  [107, 33, 168],
    }

    doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text('Negociação Sindical — Comparativo de Fontes', 14, 14)
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100)
    doc.text(`Base: ${fBase}  ·  Comparadas: ${comparadas.map(f => FONTES_CONFIG[f]?.label).join(', ')}`, 14, 20)
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}  ·  Total: ${itens.length} cláusulas`, 14, 25)
    doc.setTextColor(0)

    // Monta uma seção (tabela autoTable) por fonte comparada — garante quebra de
    // página confiável e cada cláusula vira uma linha com: nº, título, conteúdo
    // base, conteúdo comparado, RESULTADO (status) e RESUMO explicativo.
    let startY = 30
    for (let ci = 0; ci < comparadas.length; ci++) {
      const fc = comparadas[ci]
      const cfgFonte = FONTES_CONFIG[fc]

      if (ci > 0) { doc.addPage(); startY = 16 }

      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
      doc.text(`${fBase} (base)  vs  ${cfgFonte?.label || fc}`, 14, startY)
      startY += 5

      const head = [['Nº', 'Título', `${fBase} (base)`, cfgFonte?.label || fc, 'Resultado', 'Resumo da análise']]
      const body = itens.map(r => {
        const par = r.pares?.[fc]
        const av = r.avaliacoes?.[fc] || {}
        const numero = r.clausulaBase?.numero || r.clausulaNova?.numero || '—'
        const titulo = r.clausulaBase?.titulo || r.clausulaNova?.titulo || '—'
        const conteudoBase = r.clausulaBase?.conteudo || '— exclusiva da fonte comparada —'
        const conteudoComp = par?.clausulaB?.conteudo || '— não encontrado nesta fonte —'
        return [numero, titulo, conteudoBase, conteudoComp, av.status || '—', av.resumo || '']
      })

      doc.autoTable({
        startY,
        head,
        body,
        margin: { left: 14, right: 14 },
        styles: { fontSize: 7, cellPadding: 1.8, valign: 'top', overflow: 'linebreak' },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 12 },
          1: { cellWidth: 32 },
          2: { cellWidth: 70 },
          3: { cellWidth: 70 },
          4: { cellWidth: 20, fontStyle: 'bold' },
          5: { cellWidth: 'auto', fontSize: 6.5, fontStyle: 'italic' },
        },
        didParseCell: (data) => {
          // Colore a linha inteira conforme o status (coluna 4 = Resultado)
          const statusVal = data.row.raw?.[4]
          const cor = STATUS_COLOR[statusVal]
          const corTexto = STATUS_TEXT_COLOR[statusVal]
          if (cor && data.section === 'body') {
            data.cell.styles.fillColor = cor
            if (data.column.index === 4 && corTexto) data.cell.styles.textColor = corTexto
          }
        },
      })

      startY = doc.lastAutoTable.finalY + 10
    }

    doc.save('negociacao_' + new Date().toISOString().slice(0, 10) + '.pdf')
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="pb-24">
      <style>{`
        mark.diff-rem{background:#ede9fe;color:#5b21b6;border-radius:2px;padding:0 1px;text-decoration:line-through;text-decoration-color:#7c3aed}
        mark.diff-add{background:#dcfce7;color:#166534;border-radius:2px;padding:0 1px}
      `}</style>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-800">🤝 Negociação Sindical</h1>
          <p className="text-slate-500 text-sm mt-1">Compare ACTs, CCTs, prática interna e propostas sindicais — avalie superioridade cláusula a cláusula</p>
        </div>
        {confirmados.size > 0 && (
          <button onClick={resetar} className="btn-secondary text-xs py-1.5 flex-shrink-0 mt-1">
            ↺ Recomeçar
          </button>
        )}
      </div>

      {/* ── Passos de filtro ── */}
      <StepCard number="1" title="Empresa" subtitle="Filtre por empresa" active={stepAtivo === 1} done={confirmados.has(1)} locked={false} summary={resumoStep(1)} onEdit={() => editar(1)} onConfirm={() => confirmar(1)} onSkip={() => confirmar(1, true)}>
        <CheckList opcoes={empresas.map(e => ({ value: e.id, label: e.razao_social, cnpj: e.cnpj || '' }))} selecionados={sels.empresas} onChange={v => setSels(p => ({ ...p, empresas: v }))} busca={buscas.emp} onBusca={v => setBuscas(b => ({ ...b, emp: v }))} />
      </StepCard>
      <StepCard number="2" title="Operação" subtitle={opcoesOp.length + ' operação(ões)'} active={stepAtivo === 2} done={confirmados.has(2)} locked={stepAtivo < 2 && !confirmados.has(1)} summary={resumoStep(2)} onEdit={() => editar(2)} onConfirm={() => confirmar(2)} onSkip={() => confirmar(2, true)}>
        <CheckList opcoes={opcoesOp.map(o => ({ value: o.id, label: o.nome + (o.codigo ? ` (${o.codigo})` : '') }))} selecionados={sels.operacoes} onChange={v => setSels(p => ({ ...p, operacoes: v }))} busca={buscas.op} onBusca={v => setBuscas(b => ({ ...b, op: v }))} />
      </StepCard>
      <StepCard number="3" title="Sindicatos" subtitle="Laboral e patronal" active={stepAtivo === 3} done={confirmados.has(3)} locked={stepAtivo < 3 && !confirmados.has(2)} summary={resumoStep(3)} onEdit={() => editar(3)} onConfirm={() => confirmar(3)} onSkip={() => confirmar(3, true)}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">Sindicato Laboral</p>
            <CheckList opcoes={opcoesLab.map(s => ({ value: s.id, label: (s.sigla ? s.sigla + ' — ' : '') + s.razao_social }))} selecionados={sels.sindicatosLab} onChange={v => setSels(p => ({ ...p, sindicatosLab: v }))} busca={buscas.sindLab} onBusca={v => setBuscas(b => ({ ...b, sindLab: v }))} />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">Sindicato Patronal</p>
            <CheckList opcoes={opcoesPat.map(s => ({ value: s.id, label: (s.sigla ? s.sigla + ' — ' : '') + s.razao_social }))} selecionados={sels.sindicatosPat} onChange={v => setSels(p => ({ ...p, sindicatosPat: v }))} busca={buscas.sindPat} onBusca={v => setBuscas(b => ({ ...b, sindPat: v }))} />
          </div>
        </div>
      </StepCard>

      {/* ── Configuração de fontes ── */}
      <div className="card p-5 mt-4">
        <h2 className="font-semibold text-slate-700 text-sm mb-1">⚙️ Fontes para comparação</h2>
        <p className="text-xs text-slate-400 mb-4">Selecione as fontes (mínimo 2) e o instrumento correspondente para cada uma. Prática Interna e Proposta Sindical devem estar cadastradas na aba Instrumentos.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(FONTES_CONFIG).map(([chave, cfg]) => {
            const ativo = fontesAtivas.has(chave)
            const opcoesInst = instsParaFonte(chave)
            return (
              <div key={chave} className={`rounded-xl border-2 p-4 transition-all ${ativo ? 'border-brand-400 bg-brand-50/30' : 'border-slate-200 bg-white opacity-60'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{cfg.icone}</span>
                    <div>
                      <p className={`text-sm font-semibold ${ativo ? 'text-slate-800' : 'text-slate-500'}`}>{cfg.label}</p>
                      <p className="text-xs text-slate-400">{cfg.tipoInstrumento ? `Tipo: ${cfg.tipoInstrumento}` : 'Instrumento coletivo'}</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={ativo} onChange={() => toggleFonte(chave)} className="w-4 h-4 accent-brand-600" />
                    <span className="text-xs text-slate-500">{ativo ? 'Ativo' : 'Inativo'}</span>
                  </label>
                </div>
                {ativo && (
                  <div>
                    <label className="label text-xs">Instrumento</label>
                    <select className="input text-xs" value={instSelecionado[chave]} onChange={e => setInstSelecionado(p => ({ ...p, [chave]: e.target.value }))}>
                      <option value="">Selecione...</option>
                      {opcoesInst.map(i => <option key={i.id} value={i.id}>{instLabel(i)}</option>)}
                    </select>
                    {opcoesInst.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">⚠️ Nenhum instrumento do tipo "{cfg.tipoInstrumento || (chave === 'act' ? 'ACT' : 'CCT')}" encontrado. Cadastre na aba Instrumentos.</p>
                    )}
                    {instSelecionado[chave] && (() => {
                      const inst = todosInstrumentos.find(i => i.id === instSelecionado[chave])
                      return inst ? <p className="text-xs text-slate-400 mt-1">Vigência: {inst.vigencia_inicio} a {inst.vigencia_fim}</p> : null
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {fontesAtivas.size >= 2 && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label className="label text-xs">📌 Fonte-base para comparação</label>
              <select className="input text-xs" value={fonteBase} onChange={e => setFonteBase(e.target.value)}>
                <option value="">Automática (primeira fonte ativa)</option>
                {[...fontesAtivas].map(f => <option key={f} value={f}>{FONTES_CONFIG[f]?.icone} {FONTES_CONFIG[f]?.label}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-0.5">As demais fontes serão avaliadas em relação à base</p>
            </div>
            <button className="btn-primary w-full" onClick={comparar} disabled={loading}>
              {loading ? '⏳ Comparando...' : '⚖️ Gerar comparativo'}
            </button>
          </div>
        )}
        {erro && <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2"><p className="text-xs text-red-700">⚠️ {erro}</p></div>}
      </div>

      {/* ── Resultado ── */}
      {resultado && (
        <div className="mt-4">
          {/* Cabeçalho */}
          <div className="card p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">
                📊 Comparativo — base:&nbsp;
                <span className={`text-xs px-2 py-0.5 rounded-full border ${FONTES_CONFIG[resultado.baseEfetiva]?.cor}`}>
                  {FONTES_CONFIG[resultado.baseEfetiva]?.icone} {FONTES_CONFIG[resultado.baseEfetiva]?.label}
                </span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Comparadas: {resultado.comparadas.map(fc => (
                  <span key={fc} className={`text-xs px-1.5 py-0.5 rounded-full border mr-1 ${FONTES_CONFIG[fc]?.cor}`}>{FONTES_CONFIG[fc]?.icone} {FONTES_CONFIG[fc]?.label}</span>
                ))}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={exportarExcel} className="btn-secondary text-xs py-1">📊 {selecionados.size > 0 ? `Excel (${selecionados.size})` : 'Excel'}</button>
              <button onClick={exportarPDF}   className="btn-secondary text-xs py-1">📄 {selecionados.size > 0 ? `PDF (${selecionados.size})` : 'PDF'}</button>
            </div>
          </div>

          {/* Cards de status */}
          <div className="grid grid-cols-5 gap-2 mb-4">
            {Object.entries(STATUS_CONFIG).map(([s, cfg]) => (
              <button key={s} onClick={() => toggleStatus(s)}
                className={`p-2 rounded-lg border-2 text-center transition-all select-none ${statusAtivos.has(s) ? cfg.cls + ' shadow-sm' : 'border-slate-200 bg-white opacity-40 hover:opacity-60'}`}>
                <p className="text-lg font-bold">{statsStatus[s] || 0}</p>
                <p className="text-[10px] font-medium leading-tight">{cfg.icone} {s}</p>
              </button>
            ))}
          </div>

          {/* Barra de controles */}
          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <input className="input max-w-xs text-sm" placeholder="Buscar por título..." value={busca} onChange={e => setBusca(e.target.value)} />
            <select className="input w-auto text-xs" value={ordenacao} onChange={e => { setOrdenacao(e.target.value); setFonteOrdenacao('') }}>
              <option value="original">Ordem original</option>
              <option value="status">Por resultado (melhor → pior)</option>
              <option value="status_desc">Por resultado (pior → melhor)</option>
              <optgroup label="Nº por fonte — crescente">
                {resultado.fontesLista.map(fc => (
                  <option key={`num_${fc}_asc`} value={`num_${fc}_asc`}>Nº {FONTES_CONFIG[fc]?.label} ↑</option>
                ))}
              </optgroup>
              <optgroup label="Nº por fonte — decrescente">
                {resultado.fontesLista.map(fc => (
                  <option key={`num_${fc}_desc`} value={`num_${fc}_desc`}>Nº {FONTES_CONFIG[fc]?.label} ↓</option>
                ))}
              </optgroup>
            </select>
            {ordenacao.startsWith('status') && resultado.comparadas.length > 1 && (
              <select className="input w-auto text-xs" value={fonteOrdenacao} onChange={e => setFonteOrdenacao(e.target.value)}>
                <option value="">Considerar pior resultado entre as fontes</option>
                {resultado.comparadas.map(fc => (
                  <option key={fc} value={fc}>Ordenar pelo resultado vs {FONTES_CONFIG[fc]?.label}</option>
                ))}
              </select>
            )}
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
            <span>{todosSel ? 'Desselecionar tudo' : 'Selecionar tudo'} — {filtradoOrdenado.length} visíveis</span>
            {selecionados.size > 0 && <span className="ml-auto text-brand-600 font-medium">{selecionados.size} selecionada(s)</span>}
          </div>

          {/* Cards */}
          <div className="space-y-2">
            {filtradoOrdenado.map((r, idx) => {
              const expanded = isExpanded(idx)
              const selected = selecionados.has(idx)
              const { comparadas } = resultado
              const cfgStatus = STATUS_CONFIG[r.statusGeral] || {}

              return (
                <div key={idx} className={`card overflow-hidden transition-all ${selected ? 'ring-2 ring-brand-400' : ''}`}>
                  {/* Cabeçalho do card */}
                  <div className="w-full text-left p-3 hover:bg-surface-50 transition-colors cursor-pointer"
                    onClick={() => toggleCard(idx)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="checkbox" checked={selected}
                        onChange={() => toggleSel(idx)} onClick={e => e.stopPropagation()}
                        className="w-4 h-4 flex-shrink-0 cursor-pointer accent-blue-600" />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border flex-shrink-0 ${cfgStatus.cls}`}>
                        {cfgStatus.icone} {r.statusGeral}
                      </span>
                      <p className="text-sm text-slate-700 flex-1 min-w-0 truncate font-medium">
                        {r.clausulaBase
                          ? (r.clausulaBase.numero ? r.clausulaBase.numero + ' — ' : '') + r.clausulaBase.titulo
                          : <span className="text-slate-400 italic">Exclusiva: {r.clausulaNova?.titulo || '—'}</span>}
                      </p>
                      {/* Badges por fonte comparada */}
                      <div className="flex gap-1 flex-shrink-0 flex-wrap">
                        {comparadas.map(fc => {
                          const av = r.avaliacoes?.[fc] || {}
                          const cfg2 = STATUS_CONFIG[av.status] || {}
                          return (
                            <span key={fc} title={av.resumo}
                              className={`text-xs px-1.5 py-0.5 rounded-full font-medium border ${cfg2.cls || 'bg-slate-100 text-slate-500'}`}>
                              {FONTES_CONFIG[fc]?.icone} {cfg2.icone} {av.status || '—'}
                            </span>
                          )
                        })}
                      </div>
                      <span className="text-slate-300 text-sm flex-shrink-0">{expanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Corpo expandido */}
                  {expanded && (() => {
                    // Diff da base é calculado em relação à PRIMEIRA fonte comparada
                    // (referência visual principal); as demais colunas recalculam
                    // o diff individualmente contra a base.
                    const fcReferencia = comparadas[0]
                    const parReferencia = fcReferencia ? r.pares[fcReferencia] : null
                    const diffBase = mostrarDiff && parReferencia?.clausulaB && r.clausulaBase
                      ? diffTexto(r.clausulaBase.conteudo || '', parReferencia.clausulaB.conteudo || '')
                      : null

                    return (
                    <div className="border-t border-slate-100 grid divide-x divide-slate-100"
                      style={{ gridTemplateColumns: `repeat(${1 + comparadas.length}, minmax(0, 1fr))` }}>
                      {/* Coluna base */}
                      <div className="p-4 bg-amber-50/20">
                        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                          {FONTES_CONFIG[resultado.baseEfetiva]?.icone} {FONTES_CONFIG[resultado.baseEfetiva]?.label} <span className="text-slate-400 font-normal normal-case">(base)</span>
                        </p>
                        {r.clausulaBase ? (
                          <>
                            <p className="text-xs font-semibold text-slate-700 mb-1">{r.clausulaBase.titulo}</p>
                            {diffBase
                              ? <DiffSpan html={diffBase.html_a} />
                              : <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{r.clausulaBase.conteudo}</p>}
                            {comparadas.length > 1 && (
                              <p className="text-xs text-slate-400 italic mt-2">Destaque calculado em relação a {FONTES_CONFIG[fcReferencia]?.label}.</p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Cláusula não existe na fonte base</p>
                        )}
                      </div>

                      {/* Colunas comparadas */}
                      {comparadas.map(fc => {
                        const par = r.pares[fc]
                        const av = r.avaliacoes?.[fc] || {}
                        const cfg2 = STATUS_CONFIG[av.status] || {}
                        const cfgFonte = FONTES_CONFIG[fc]
                        const diff = mostrarDiff && par?.clausulaB && r.clausulaBase
                          ? diffTexto(r.clausulaBase.conteudo || '', par.clausulaB.conteudo || '')
                          : null

                        return (
                          <div key={fc} className="p-4">
                            {/* Header da coluna */}
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                                {cfgFonte?.icone} {cfgFonte?.label}
                              </p>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg2.cls || 'bg-slate-100 text-slate-500'}`}>
                                {cfg2.icone} {av.status || '—'}
                              </span>
                            </div>
                            {/* Resumo explicativo — sempre visível ao expandir */}
                            {av.resumo && (
                              <div className={`text-xs rounded-lg px-2.5 py-2 mb-2 border ${cfg2.cls || 'bg-slate-50 text-slate-600'}`}>
                                <p className="font-medium mb-0.5">📝 Análise automática</p>
                                <p className="font-normal opacity-90">{av.resumo}</p>
                              </div>
                            )}
                            {/* Conteúdo */}
                            {par?.clausulaB ? (
                              <>
                                <p className="text-xs font-semibold text-slate-700 mb-1">{par.clausulaB.titulo}</p>
                                {diff
                                  ? <DiffSpan html={diff.html_b} />
                                  : <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{par.clausulaB.conteudo}</p>}
                              </>
                            ) : (
                              <p className="text-xs text-slate-400 italic">Não encontrado nesta fonte</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
          {filtradoOrdenado.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">Nenhuma cláusula com os filtros aplicados.</p>
          )}
        </div>
      )}

      {/* Floating bar */}
      {selecionados.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white rounded-2xl px-5 py-3 flex items-center gap-3 shadow-2xl z-50 border border-slate-700">
          <span className="text-sm font-semibold">{selecionados.size} cláusula(s)</span>
          <button onClick={exportarExcel} className="text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg">📊 Excel</button>
          <button onClick={exportarPDF}   className="text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg">📄 PDF</button>
          <button onClick={() => setSelecionados(new Set())} className="text-xs opacity-60 hover:opacity-100 ml-1">✕</button>
        </div>
      )}
    </div>
  )
}
