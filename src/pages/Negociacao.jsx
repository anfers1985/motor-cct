import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { compararInstrumentosNeg, avaliarSuperioridade, aplicarParesSugeridosIA, STATUS_CONFIG, fraseVeredito, resultadoTexto } from '../utils/comparacao'
import { getAIConfig } from '../services/ai/index'
import { sugerirParesSemanticos } from '../services/ai/pareamento'
import { refinarVereditosAmbiguos, auditarRedacaoDiferente } from '../services/ai/superioridade'
import { toNumeroOrdinal } from '../utils/ordenacao'
import CheckList from '../components/UI/CheckList'
import StepCard from '../components/UI/StepCard'
import * as XLSX from 'xlsx'
import { gerarPDFNegociacao } from '../services/reports/pdfReport'
import { gerarAnaliseNegocial } from '../services/ai/analiseNegocial'
import { gerarExcelAnaliseNegocial } from '../services/reports/relatorioNegocialExcel'
import { gerarParecerObjetivo } from '../services/ai/parecerObjetivo'
import { gerarExcelComparativoObjetivo } from '../services/reports/comparativoObjetivoExcel'

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
      {cfg.icone} {cfg.label || status}
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
  const [verificandoIA, setVerificandoIA] = useState(false)
  const [statusVerificacaoIA, setStatusVerificacaoIA] = useState('')
  const [pareamentosPendentes, setPareamentosPendentes] = useState(null) // null = nada pendente; array = aguardando revisão
  const [decisoesPareamento, setDecisoesPareamento] = useState({}) // índice -> true (aceito) / false (rejeitado)
  const [expandidoPareamento, setExpandidoPareamento] = useState({}) // índice -> true (mostrando texto completo das cláusulas)
  const [gerandoAnaliseIA, setGerandoAnaliseIA] = useState(false)
  const [statusAnaliseIA, setStatusAnaliseIA] = useState('')
  const [gerandoParecerIA, setGerandoParecerIA] = useState(false)
  const [statusParecerIA, setStatusParecerIA] = useState('')
  const [overridesAmbiguidadeIA, setOverridesAmbiguidadeIA] = useState({}) // chave: `${idClausulaBase}|${fonteComparada}`

  // Controles da tabela
  const [fonteBase, setFonteBase] = useState('')
  const [busca, setBusca] = useState('')
  // Filtro por status — agora um Set POR FONTE COMPARADA (não mais um único
  // agregado), pois o "pior status" agregado escondia, por exemplo, quantas
  // cláusulas tinham "Redação Diferente" especificamente na CCT vs na Proposta.
  // undefined/ausente para uma fonte = todos os status ativos para ela.
  const [statusFiltroPorFonte, setStatusFiltroPorFonte] = useState({})
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
        .eq('status_processamento', 'processado').order('nome'),
      supabase.from('empresas').select('id,razao_social,cnpj').order('razao_social'),
      supabase.from('operacoes').select('id,nome,codigo').order('nome'),
      supabase.from('sindicatos').select('id,razao_social,sigla,tipo,cnpj').order('razao_social'),
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
      setStatusFiltroPorFonte({})
    } catch (e) {
      setErro('Erro ao comparar: ' + e.message)
    }
    setLoading(false)
  }

  // ─── Verificação Completa com IA (botão único) ─────────────────────────────
  // Encadeia os 3 passos que antes eram botões separados — pareamento dos
  // "sem par" (Sem Previsão/Exclusiva), refinamento dos "Ambígua" e auditoria
  // dos "Redação Diferente" — numa única chamada. Cada passo só atua sobre o
  // que sobrou determinístico/sem solução automática; nunca reprocessa o que
  // já saiu resolvido. IMPORTANTE: como os passos dependem uns dos outros
  // (pareamento pode criar novos pares que entram no refinamento/auditoria
  // seguintes) e o estado do React não atualiza de forma síncrona, cada passo
  // recalcula as linhas localmente a partir do resultado ainda não commitado
  // no state — só fazemos `setResultado`/`setOverridesAmbiguidadeIA` UMA vez
  // no final, com o resultado consolidado de todos os passos.
  function computarLinhasParaVerificacao(res) {
    const { clausulasPorFonte, comparativos, baseEfetiva, comparadas } = res
    const clausulasBase = clausulasPorFonte[baseEfetiva] || []
    const vigenciaPorFonte = {}
    for (const f of res.fontesLista) {
      const inst = todosInstrumentos.find(i => i.id === instSelecionado[f])
      vigenciaPorFonte[f] = inst ? { inicio: inst.vigencia_inicio, fim: inst.vigencia_fim } : null
    }
    return clausulasBase.map(cb => {
      const pares = {}; const avaliacoes = {}
      for (const fc of comparadas) {
        const comp = comparativos[fc] || []
        const par = comp.find(r => r.clausulaA?.id === cb.id)
        pares[fc] = par || null
        avaliacoes[fc] = avaliarSuperioridade(
          cb.conteudo, par?.clausulaB?.conteudo, cb.titulo,
          vigenciaPorFonte[baseEfetiva], vigenciaPorFonte[fc]
        )
      }
      return { clausulaBase: cb, pares, avaliacoes }
    })
  }

  // ─── Fase 1: pareamento — gera lista PENDENTE, não aplica nada ainda ───────
  async function iniciarVerificacaoIA() {
    if (!resultado) return
    const config = getAIConfig()
    if (!config?.provedor || !config?.chave) {
      return setErro('Configure um provedor de IA nas Configurações para usar a verificação assistida.')
    }
    setVerificandoIA(true); setErro(''); setStatusVerificacaoIA('Etapa 1/3 — pareando cláusulas sem correspondência...')
    try {
      const pendentes = []
      for (const fc of resultado.comparadas) {
        const comp = resultado.comparativos[fc] || []
        const leftoverA = comp.filter(r => r.status.label === 'SUPRIMIDA').map(r => r.clausulaA)
        const leftoverB = comp.filter(r => r.status.label === 'NOVA').map(r => r.clausulaB)
        if (!leftoverA.length || !leftoverB.length) continue
        const sugestoes = await sugerirParesSemanticos(leftoverA, leftoverB, setStatusVerificacaoIA)
        for (const s of sugestoes) {
          const clausulaA = leftoverA.find(c => c.id === s.idA)
          const clausulaB = leftoverB.find(c => c.id === s.idB)
          if (clausulaA && clausulaB) pendentes.push({ fc, idA: s.idA, idB: s.idB, motivo: s.motivo, clausulaA, clausulaB })
        }
      }
      if (!pendentes.length) {
        setStatusVerificacaoIA('Nenhum pareamento novo sugerido — seguindo para refinamento/auditoria...')
        await continuarRefinamentoEAuditoria(resultado)
      } else {
        // Marca conflito quando a mesma cláusula (de A ou de B) foi sugerida
        // como par de mais de uma cláusula do outro lado, dentro da mesma
        // fonte comparada — sinal forte de que pelo menos uma das sugestões
        // está errada (duas cláusulas não podem legitimamente corresponder
        // ao mesmo par). Caso real confirmado: "Ressarcimento Refeições e
        // Hospedagem" sugerido tanto para "Refeição" quanto para "Reuniões e
        // Convenções" ao mesmo tempo — só um dos dois é o instituto certo.
        const contagemA = {}, contagemB = {}
        for (const p of pendentes) {
          const chaveA = `${p.fc}|A|${p.idA}`, chaveB = `${p.fc}|B|${p.idB}`
          contagemA[chaveA] = (contagemA[chaveA] || 0) + 1
          contagemB[chaveB] = (contagemB[chaveB] || 0) + 1
        }
        for (const p of pendentes) {
          p.conflito = contagemA[`${p.fc}|A|${p.idA}`] > 1 || contagemB[`${p.fc}|B|${p.idB}`] > 1
        }
        setPareamentosPendentes(pendentes)
        setExpandidoPareamento({})
        // default: aceito, exceto quando em conflito — nesse caso força revisão manual (começa desmarcado)
        setDecisoesPareamento(Object.fromEntries(pendentes.map((p, i) => [i, !p.conflito])))
        setVerificandoIA(false)
      }
    } catch (e) {
      setErro('Erro no pareamento por IA: ' + e.message)
      setVerificandoIA(false)
    }
  }

  // ─── Fase 2: usuário confirma/rejeita cada pareamento pendente ─────────────
  async function confirmarPareamentosEContinuar() {
    if (!pareamentosPendentes) return
    setVerificandoIA(true); setStatusVerificacaoIA('Aplicando pareamentos confirmados...')
    const novosComparativos = { ...resultado.comparativos }
    const porFonte = {}
    pareamentosPendentes.forEach((p, i) => {
      if (!decisoesPareamento[i]) return // rejeitado — não aplica
      porFonte[p.fc] = porFonte[p.fc] || []
      porFonte[p.fc].push({ idA: p.idA, idB: p.idB, motivo: p.motivo })
    })
    for (const fc of Object.keys(porFonte)) {
      novosComparativos[fc] = aplicarParesSugeridosIA(novosComparativos[fc] || [], porFonte[fc])
    }
    const resultadoAtual = { ...resultado, comparativos: novosComparativos }
    setResultado(resultadoAtual)
    const aceitos = Object.values(decisoesPareamento).filter(Boolean).length
    const rejeitados = pareamentosPendentes.length - aceitos
    setPareamentosPendentes(null)
    setDecisoesPareamento({})
    setExpandidoPareamento({})
    await continuarRefinamentoEAuditoria(resultadoAtual, `${aceitos} pareamento(s) aceito(s), ${rejeitados} rejeitado(s). `)
  }

  function cancelarRevisaoPareamento() {
    setPareamentosPendentes(null)
    setDecisoesPareamento({})
    setExpandidoPareamento({})
    setVerificandoIA(false)
    setStatusVerificacaoIA('Revisão de pareamento cancelada — nenhum pareamento novo foi aplicado.')
  }

  // ─── Fase 3: refinamento de ambíguos + auditoria de redação diferente ──────
  async function continuarRefinamentoEAuditoria(resultadoAtual, prefixoStatus = '') {
    try {
      const linhasAtuais = computarLinhasParaVerificacao(resultadoAtual)
      let overridesAtuais = { ...overridesAmbiguidadeIA }

      setStatusVerificacaoIA(prefixoStatus + 'Etapa 2/3 — refinando vereditos ambíguos...')
      const itensAmbiguos = []
      for (const linha of linhasAtuais) {
        if (!linha.clausulaBase) continue
        for (const fc of resultadoAtual.comparadas) {
          const av = linha.avaliacoes[fc]
          if (av?.status === 'Ambigua' && av.candidatos) {
            itensAmbiguos.push({
              id: `${linha.clausulaBase.id}|${fc}`,
              titulo: linha.clausulaBase.titulo,
              textoBase: linha.clausulaBase.conteudo,
              textoComparado: linha.pares[fc]?.clausulaB?.conteudo,
              candidatos: av.candidatos,
            })
          }
        }
      }
      if (itensAmbiguos.length) {
        const resolucoes = await refinarVereditosAmbiguos(itensAmbiguos, setStatusVerificacaoIA)
        for (const r of resolucoes) overridesAtuais[r.id] = r
      }

      setStatusVerificacaoIA(prefixoStatus + 'Etapa 3/3 — auditando cláusulas de redação diferente...')
      const itensModificados = []
      for (const linha of linhasAtuais) {
        if (!linha.clausulaBase) continue
        for (const fc of resultadoAtual.comparadas) {
          const av = linha.avaliacoes[fc]
          if (av?.status === 'Modificada' && linha.pares[fc]?.clausulaB) {
            itensModificados.push({
              id: `${linha.clausulaBase.id}|${fc}`,
              titulo: linha.clausulaBase.titulo,
              textoBase: linha.clausulaBase.conteudo,
              textoComparado: linha.pares[fc].clausulaB.conteudo,
            })
          }
        }
      }
      if (itensModificados.length) {
        const resolucoes = await auditarRedacaoDiferente(itensModificados, setStatusVerificacaoIA)
        for (const r of resolucoes) overridesAtuais[r.id] = r
      }

      setOverridesAmbiguidadeIA(overridesAtuais)
      setStatusVerificacaoIA(`✅ ${prefixoStatus}${itensAmbiguos.length} ambígua(s) e ${itensModificados.length} redação(ões) diferente(s) revisadas por IA.`)
    } catch (e) {
      setErro('Erro na verificação por IA: ' + e.message)
    }
    setVerificandoIA(false)
  }

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
        const avaliacaoBase = avaliarSuperioridade(
          cb.conteudo, par?.clausulaB?.conteudo, cb.titulo,
          vigenciaPorFonte[baseEfetiva], vigenciaPorFonte[fc]
        )
        const elegivelAOverride = avaliacaoBase.status === 'Ambigua' || avaliacaoBase.status === 'Modificada'
        const override = elegivelAOverride ? overridesAmbiguidadeIA[`${cb.id}|${fc}`] : null
        avaliacoes[fc] = override
          ? { status: override.status, resumo: override.resumo, origemIA: true, veredictoOriginal: avaliacaoBase }
          : avaliacaoBase
      }
      // Status geral da linha: status mais "acionável" entre todas as comparadas.
      // IMPORTANTE: "Sem previsão" não é um veredito sobre a base — é apenas a
      // ausência de conteúdo NAQUELA fonte comparada. Por isso fica por último
      // na prioridade: só vira o status geral quando NENHUMA outra fonte trouxe
      // uma comparação de fato (ex.: se a CCT diverge na redação mas a Proposta
      // simplesmente não trata do tema, o status geral deve refletir a CCT).
      const statusOrder = ['Ambigua', 'Inferior', 'Modificada', 'Superior', 'Igual', 'Sem previsão']
      let statusGeral = 'Sem previsão'
      for (const fc of comparadas) {
        const s = avaliacoes[fc].status
        if (statusOrder.indexOf(s) < statusOrder.indexOf(statusGeral)) statusGeral = s
      }
      // Quais fontes efetivamente "causaram" o status geral (para exibir a
      // atribuição junto ao badge e evitar a leitura de que ele descreve a base)
      const fontesStatusGeral = comparadas.filter(fc => avaliacoes[fc].status === statusGeral)
      return { clausulaBase: cb, pares, avaliacoes, statusGeral, fontesStatusGeral, idx }
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
  function isFonteStatusAtivo(fc, status) {
    const set = statusFiltroPorFonte[fc]
    return !set || set.has(status)
  }
  const filtrado = linhasResultado.filter(r => {
    // Uma linha só aparece se, para CADA fonte comparada, o status dela
    // (quando aplicável a esta linha) estiver entre os ativos no filtro
    // daquela fonte especificamente.
    for (const fc of resultado?.comparadas || []) {
      const av = r.avaliacoes?.[fc]
      if (av && !isFonteStatusAtivo(fc, av.status)) return false
    }
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
    // Ordenação numérica por fonte: num_{fonte}_asc / num_{fonte}_desc
    if (ordenacao.startsWith('num_') && resultado) {
      const parts = ordenacao.replace(/^num_/, '').split('_')
      const dir2 = parts.pop()   // 'asc' ou 'desc'
      const fonteNum = parts.join('_') // 'act', 'cct', 'proposta', etc.
      const getNum = r => {
        let numero
        if (fonteNum === resultado.baseEfetiva) {
          numero = r.clausulaBase?.numero
        } else {
          const par = r.pares?.[fonteNum]
          const clausB = par?.clausulaB || r.clausulaNova
          numero = clausB?.numero
        }
        const n = toNumeroOrdinal(numero)
        return n === 9999 ? null : n // null = sem número nesta fonte
      }
      return arr.sort((a, b) => {
        const na = getNum(a), nb = getNum(b)
        // Sem número sempre vai para o final, em qualquer direção
        if (na === null && nb === null) return 0
        if (na === null) return 1
        if (nb === null) return -1
        return dir2 === 'desc' ? nb - na : na - nb
      })
    }
    switch (ordenacao) {
      case 'status':      return arr.sort((a, b) => ord.indexOf(statusKey(a)) - ord.indexOf(statusKey(b)))
      case 'status_desc': return arr.sort((a, b) => ord.indexOf(statusKey(b)) - ord.indexOf(statusKey(a)))
      default: return arr
    }
  })()

  // Estatísticas POR FONTE COMPARADA — cada fonte tem sua própria contagem de
  // Superior/Inferior/Igual/Redação Diferente/Sem Previsão/Exclusiva, contada
  // apenas sobre as linhas em que aquela fonte tem avaliação (rows exclusivas
  // de outra fonte não entram na contagem desta).
  const statsStatusPorFonte = {}
  for (const fc of resultado?.comparadas || []) {
    statsStatusPorFonte[fc] = linhasResultado.reduce((acc, r) => {
      const st = r.avaliacoes?.[fc]?.status
      if (st) acc[st] = (acc[st] || 0) + 1
      return acc
    }, {})
  }

  function toggleFonteStatus(fc, status) {
    setStatusFiltroPorFonte(prev => {
      const allKeys = Object.keys(STATUS_CONFIG)
      const current = prev[fc] ? new Set(prev[fc]) : new Set(allKeys)
      if (current.has(status)) {
        if (current.size === 1) return prev // mantém ao menos um ativo
        current.delete(status)
      } else {
        current.add(status)
      }
      return { ...prev, [fc]: current }
    })
  }
  function limparFiltrosFonte() { setStatusFiltroPorFonte({}) }
  const temFiltroFonteAtivo = Object.values(statusFiltroPorFonte).some(set => set && set.size < Object.keys(STATUS_CONFIG).length)

  function toggleCard(idx) { setExpandidos(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n }) }
  function toggleExpandAll() { setModoExpandido(v => !v); setExpandidos(new Set()) }
  const isExpanded = idx => modoExpandido ? !expandidos.has(idx) : expandidos.has(idx)
  function toggleSel(idx) { setSelecionados(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n }) }
  const todosSel = filtradoOrdenado.length > 0 && filtradoOrdenado.every((_, i) => selecionados.has(i))
  function toggleSelTodos() { todosSel ? setSelecionados(new Set()) : setSelecionados(new Set(filtradoOrdenado.map((_, i) => i))) }

  // ─── Exportações ─────────────────────────────────────────────────────────────
  // Uma coluna por fonte (base + cada comparada) e UMA coluna "Resultado"
  // consolidada — exatamente a estrutura visual do painel (ACT | CCT | Proposta
  // | Veredito), sem repetir Nº/Título/Conteúdo/Resultado/Veredito em colunas
  // separadas por fonte.
  function exportarExcel() {
    if (!resultado) return
    const itens = selecionados.size > 0 ? filtradoOrdenado.filter((_, i) => selecionados.has(i)) : filtradoOrdenado
    const { comparadas, baseEfetiva } = resultado
    const fBase = FONTES_CONFIG[baseEfetiva]?.label || baseEfetiva

    const celulaFonte = (clausula, motivoIA) => {
      if (!clausula) return ''
      const cab = (clausula.numero ? `Nº ${clausula.numero} — ` : '') + (clausula.titulo || '')
      let texto = clausula.conteudo ? `${cab}\n\n${clausula.conteudo}` : cab
      if (motivoIA) texto += `\n\n🤖 PAREAMENTO SUGERIDO POR IA — motivo: ${motivoIA}\n(redação muito diferente do casamento automático; confirme se é de fato o mesmo instituto antes de considerar definitivo)`
      return texto
    }

    const wb = XLSX.utils.book_new()
    const rows = itens.map(r => {
      const row = {
        [`${fBase} (base)`]: r.clausulaBase
          ? celulaFonte(r.clausulaBase)
          : '— exclusiva da(s) fonte(s) comparada(s) —',
      }
      const resultadoPartes = []
      for (const fc of comparadas) {
        const par = r.pares[fc]
        const av = r.avaliacoes?.[fc] || {}
        const fl = FONTES_CONFIG[fc]?.label || fc
        row[fl] = par?.clausulaB
          ? celulaFonte(par.clausulaB, par.motivoIA)
          : (av.status === 'Exclusiva' ? celulaFonte(r.clausulaNova) : 'Não encontrado nesta fonte')
        if (av.status) {
          resultadoPartes.push(resultadoTexto(av, fBase, fl, !!r.clausulaBase))
        }
      }
      row['Resultado'] = resultadoPartes.join('\n\n')
      return row
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const headers = Object.keys(rows[0] || {})
    ws['!cols'] = headers.map(h => ({ wch: h === 'Resultado' ? 55 : 45 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Negociação')
    XLSX.writeFile(wb, 'negociacao_sindical_' + new Date().toISOString().slice(0, 10) + '.xlsx')
  }

  // PDF no mesmo estilo do Comparativo: uma tabela única, texto completo (sem
  // corte) e cor aplicada só ao pequeno selo de "Resultado" — não à linha toda.
  function exportarPDF() {
    if (!resultado) return
    const itens = selecionados.size > 0 ? filtradoOrdenado.filter((_, i) => selecionados.has(i)) : filtradoOrdenado
    const { comparadas, baseEfetiva } = resultado
    const fBase = FONTES_CONFIG[baseEfetiva]?.label || baseEfetiva
    gerarPDFNegociacao({ itens, baseLabel: fBase, comparadas, FONTES_CONFIG, STATUS_CONFIG, fraseVeredito })
  }

  // Monta { fontesInfo, itens, pontos, resultadosDeterministicos } reaproveitados
  // pelos dois botões de IA — nunca re-pareia cláusulas, só reorganiza o que
  // linhasResultado/resultado já calcularam.
  function montarPontosNegociacao() {
    const { comparadas, baseEfetiva } = resultado
    const fBase = FONTES_CONFIG[baseEfetiva]?.label || baseEfetiva
    const fontesInfo = [
      { chave: baseEfetiva, label: FONTES_CONFIG[baseEfetiva]?.label || baseEfetiva },
      ...comparadas.map(fc => ({ chave: fc, label: FONTES_CONFIG[fc]?.label || fc })),
    ]
    const itens = selecionados.size > 0 ? filtradoOrdenado.filter((_, i) => selecionados.has(i)) : filtradoOrdenado
    const resultadosDeterministicos = new Map()
    const pontos = itens.map((r, i) => {
      const porFonte = { [baseEfetiva]: r.clausulaBase || null }
      const id = r.clausulaBase?.id || r.clausulaNova?.id || `linha-${r.idx ?? i}`
      const det = []
      for (const fc of comparadas) {
        const par = r.pares?.[fc]
        const clausula = par?.clausulaB || (fc === r.fontaExclusiva ? r.clausulaNova : null)
        porFonte[fc] = clausula ? { ...clausula, motivoIA: par?.motivoIA } : null
        const av = r.avaliacoes?.[fc]
        if (av?.status) {
          const fl = FONTES_CONFIG[fc]?.label || fc
          det.push({ label: fl, statusLabel: resultadoTexto(av, fBase, fl, !!r.clausulaBase) })
        }
      }
      resultadosDeterministicos.set(id, det)
      return { id, tituloReferencia: r.clausulaBase?.titulo || r.clausulaNova?.titulo || 'Sem título', porFonte }
    })
    return { fontesInfo, itens, pontos, resultadosDeterministicos }
  }

  // ─── Análise Negocial assistida por IA (Mapa de Pontos de Negociação) ──────
  // Reaproveita o pareamento já calculado em linhasResultado — só pede à IA os
  // campos analíticos/narrativos (tipo de alteração, responsável, direção,
  // relevância, orientação de mesa). Nunca re-pareia cláusulas.
  async function gerarRelatorioNegocialIA() {
    if (!resultado) return
    const config = getAIConfig()
    if (!config?.provedor || !config?.chave) {
      return setErro('Configure um provedor de IA nas Configurações para gerar a análise negocial.')
    }
    const { fontesInfo, itens, pontos } = montarPontosNegociacao()
    if (!itens.length) return setErro('Nenhuma cláusula para analisar com os filtros/seleção atuais.')

    setGerandoAnaliseIA(true); setErro(''); setStatusAnaliseIA('')
    try {
      const classificacoes = await gerarAnaliseNegocial(pontos, fontesInfo, setStatusAnaliseIA)
      gerarExcelAnaliseNegocial(pontos, classificacoes, fontesInfo, {
        titulo: 'MAPA DE PONTOS DE NEGOCIAÇÃO — ' + fontesInfo.map(f => f.label).join(' × '),
        subtitulo: `Gerado em ${new Date().toLocaleDateString('pt-BR')} — Motor CCT`,
      })
      setStatusAnaliseIA(`✅ Relatório gerado — ${classificacoes.size} de ${pontos.length} ponto(s) analisados.`)
    } catch (e) {
      setErro('Erro ao gerar análise negocial: ' + e.message)
    }
    setGerandoAnaliseIA(false)
  }

  // ─── Comparativo Objetivo assistido por IA (aba única, mais enxuto) ────────
  async function gerarRelatorioObjetivoIA() {
    if (!resultado) return
    const config = getAIConfig()
    if (!config?.provedor || !config?.chave) {
      return setErro('Configure um provedor de IA nas Configurações para gerar o comparativo objetivo.')
    }
    const { fontesInfo, itens, pontos, resultadosDeterministicos } = montarPontosNegociacao()
    if (!itens.length) return setErro('Nenhuma cláusula para analisar com os filtros/seleção atuais.')

    setGerandoParecerIA(true); setErro(''); setStatusParecerIA('')
    try {
      const classificacoes = await gerarParecerObjetivo(pontos, fontesInfo, setStatusParecerIA)
      gerarExcelComparativoObjetivo(pontos, resultadosDeterministicos, classificacoes, fontesInfo, {
        titulo: 'COMPARATIVO OBJETIVO — ' + fontesInfo.map(f => f.label).join(' × '),
        subtitulo: `Gerado em ${new Date().toLocaleDateString('pt-BR')} — Motor CCT`,
      })
      setStatusParecerIA(`✅ Relatório gerado — ${classificacoes.size} de ${pontos.length} ponto(s) analisados.`)
    } catch (e) {
      setErro('Erro ao gerar comparativo objetivo: ' + e.message)
    }
    setGerandoParecerIA(false)
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {Object.entries(FONTES_CONFIG).map(([chave, cfg]) => {
            const ativo = fontesAtivas.has(chave)
            const opcoesInst = instsParaFonte(chave)
            const inst = ativo ? todosInstrumentos.find(i => i.id === instSelecionado[chave]) : null
            return (
              <div key={chave} className={`rounded-lg border p-2.5 transition-all ${ativo ? 'border-brand-400 bg-brand-50/30' : 'border-slate-200 bg-white opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-base flex-shrink-0">{cfg.icone}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold truncate leading-tight ${ativo ? 'text-slate-800' : 'text-slate-500'}`}>{cfg.label}</p>
                    {!ativo && <p className="text-[10px] text-slate-400 truncate leading-tight">{cfg.tipoInstrumento || 'Instrumento coletivo'}</p>}
                  </div>
                  <label className="flex items-center gap-1 cursor-pointer select-none flex-shrink-0" title={ativo ? 'Ativo' : 'Inativo'}>
                    <input type="checkbox" checked={ativo} onChange={() => toggleFonte(chave)} className="w-3.5 h-3.5 accent-brand-600" />
                  </label>
                </div>
                {ativo && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <select className="input text-xs py-1 flex-1" value={instSelecionado[chave]} onChange={e => setInstSelecionado(p => ({ ...p, [chave]: e.target.value }))}>
                      <option value="">Selecione o instrumento...</option>
                      {opcoesInst.map(i => <option key={i.id} value={i.id}>{instLabel(i)}</option>)}
                    </select>
                  </div>
                )}
                {ativo && opcoesInst.length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-1 leading-tight">⚠️ Nenhum instrumento do tipo "{cfg.tipoInstrumento || (chave === 'act' ? 'ACT' : 'CCT')}" encontrado. Cadastre na aba Instrumentos.</p>
                )}
                {ativo && inst && (
                  <p className="text-[10px] text-slate-400 mt-1 leading-tight">Vigência: {inst.vigencia_inicio} a {inst.vigencia_fim}</p>
                )}
              </div>
            )
          })}
        </div>

        {fontesAtivas.size >= 2 && (
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <label className="label text-xs">📌 Fonte-base para comparação</label>
              <select className="input text-xs py-1" value={fonteBase} onChange={e => setFonteBase(e.target.value)}>
                <option value="">Automática (primeira fonte ativa)</option>
                {[...fontesAtivas].map(f => <option key={f} value={f}>{FONTES_CONFIG[f]?.icone} {FONTES_CONFIG[f]?.label}</option>)}
              </select>
              <p className="text-[10px] text-slate-400 mt-0.5">As demais fontes serão avaliadas em relação à base</p>
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
            <div className="flex gap-2 items-center flex-wrap justify-end">
              {statusVerificacaoIA && <span className="text-[10px] text-slate-400 max-w-[220px] truncate" title={statusVerificacaoIA}>{statusVerificacaoIA}</span>}
              <button onClick={iniciarVerificacaoIA} disabled={verificandoIA} className="btn-secondary text-xs py-1"
                title="Roda em sequência: (1) pareamento das cláusulas sem correspondência, (2) refinamento dos vereditos 'Ambígua' e (3) auditoria das cláusulas 'Redação Diferente' — tudo com a IA configurada, num único clique.">
                {verificandoIA ? '⏳ Verificando...' : '🤖 Verificação Completa com IA'}
              </button>
              <button onClick={exportarExcel} className="btn-secondary text-xs py-1">📊 {selecionados.size > 0 ? `Excel (${selecionados.size})` : 'Excel'}</button>
              <button onClick={exportarPDF}   className="btn-secondary text-xs py-1">📄 {selecionados.size > 0 ? `PDF (${selecionados.size})` : 'PDF'}</button>
              {statusAnaliseIA && <span className="text-[10px] text-slate-400 max-w-[220px] truncate" title={statusAnaliseIA}>{statusAnaliseIA}</span>}
              <button onClick={gerarRelatorioNegocialIA} disabled={gerandoAnaliseIA} className="btn-secondary text-xs py-1"
                title="Gera um Mapa de Pontos de Negociação (Excel, 3 abas: Análise Negocial, Alterações Meramente Textuais, Resumo Executivo) — a IA lê o conteúdo de cada cláusula pareada e classifica tipo de alteração, responsável, direção do efeito, relevância e orientação de mesa.">
                {gerandoAnaliseIA ? '⏳ Gerando análise...' : `🧠 Análise Negocial (IA)${selecionados.size > 0 ? ` (${selecionados.size})` : ''}`}
              </button>
              {statusParecerIA && <span className="text-[10px] text-slate-400 max-w-[220px] truncate" title={statusParecerIA}>{statusParecerIA}</span>}
              <button onClick={gerarRelatorioObjetivoIA} disabled={gerandoParecerIA} className="btn-secondary text-xs py-1"
                title="Gera uma aba única (Excel) com o conteúdo de cada fonte, o Resultado determinístico já calculado (sem IA) e, por IA, um Parecer objetivo curto + Grau (ALTA/MÉDIA/BAIXA) por ponto.">
                {gerandoParecerIA ? '⏳ Gerando parecer...' : `📋 Comparativo Objetivo (IA)${selecionados.size > 0 ? ` (${selecionados.size})` : ''}`}
              </button>
            </div>
          </div>

          {/* ── Fila de confirmação de pareamento por IA ──────────────────────
              A IA sugere, mas nada é aplicado ao resultado até o usuário
              confirmar item a item. Isso existe porque testes reais mostraram
              a IA "forçando" correspondências sem base real (ex.: cláusulas
              completamente diferentes pareadas por semelhança superficial de
              vocabulário) — travas automáticas reduzem a frequência, mas não
              eliminam; a revisão humana aqui é a rede de segurança final. */}
          {pareamentosPendentes && (
            <div className="card p-4 mb-4 border-2 border-indigo-300 bg-indigo-50/50">
              <p className="text-sm font-semibold text-indigo-800 mb-1">
                🤖 A IA sugeriu {pareamentosPendentes.length} pareamento(s) novo(s) — revise antes de aplicar
              </p>
              <p className="text-xs text-indigo-600 mb-3">
                Desmarque qualquer sugestão que não pareça o mesmo instituto jurídico. Nada é aplicado ao resultado até você confirmar.
              </p>
              <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
                {pareamentosPendentes.map((p, i) => (
                  <div key={i} className={`rounded-lg border transition-colors ${p.conflito ? 'bg-amber-50 border-amber-300' : (decisoesPareamento[i] ? 'bg-white border-indigo-200' : 'bg-slate-100 border-slate-200 opacity-60')}`}>
                    <label className="flex gap-3 items-start p-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!decisoesPareamento[i]}
                        onChange={() => setDecisoesPareamento(d => ({ ...d, [i]: !d[i] }))}
                        className="mt-1 flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-700 flex flex-wrap items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded-full border ${FONTES_CONFIG[p.fc]?.cor}`}>{FONTES_CONFIG[resultado.baseEfetiva]?.label}</span>
                          <span>{p.clausulaA.titulo}</span>
                          <span className="text-indigo-400">↔</span>
                          <span className={`px-1.5 py-0.5 rounded-full border ${FONTES_CONFIG[p.fc]?.cor}`}>{FONTES_CONFIG[p.fc]?.label}</span>
                          <span>{p.clausulaB.titulo}</span>
                        </p>
                        {p.conflito && (
                          <p className="text-[11px] font-semibold text-amber-700 mt-1">
                            ⚠️ Conflito: esta cláusula foi sugerida como par de mais de uma correspondência ao mesmo tempo — provavelmente só uma está certa. Revise o texto com atenção antes de aceitar.
                          </p>
                        )}
                        {p.motivo && <p className="text-[11px] text-slate-500 mt-1">Motivo da IA: "{p.motivo}"</p>}
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setExpandidoPareamento(x => ({ ...x, [i]: !x[i] })) }}
                          className="text-[11px] text-indigo-500 hover:text-indigo-700 underline mt-1"
                        >
                          {expandidoPareamento[i] ? '▲ ocultar texto das cláusulas' : '▼ ver texto das cláusulas'}
                        </button>
                        {expandidoPareamento[i] && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            <div className="text-[11px] bg-slate-50 border border-slate-200 rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                              <span className="font-semibold text-slate-600">{FONTES_CONFIG[resultado.baseEfetiva]?.label} — {p.clausulaA.titulo}:</span>{'\n'}{p.clausulaA.conteudo}
                            </div>
                            <div className="text-[11px] bg-slate-50 border border-slate-200 rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                              <span className="font-semibold text-slate-600">{FONTES_CONFIG[p.fc]?.label} — {p.clausulaB.titulo}:</span>{'\n'}{p.clausulaB.conteudo}
                            </div>
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <button onClick={confirmarPareamentosEContinuar} disabled={verificandoIA} className="btn-primary text-xs py-1.5">
                  {verificandoIA ? '⏳ Aplicando...' : `✅ Confirmar seleção e continuar (${Object.values(decisoesPareamento).filter(Boolean).length}/${pareamentosPendentes.length} aceitos)`}
                </button>
                <button onClick={() => setDecisoesPareamento(Object.fromEntries(pareamentosPendentes.map((_, i) => [i, true])))} className="btn-secondary text-xs py-1.5">Marcar todos</button>
                <button onClick={() => setDecisoesPareamento(Object.fromEntries(pareamentosPendentes.map((_, i) => [i, false])))} className="btn-secondary text-xs py-1.5">Desmarcar todos</button>
                <button onClick={cancelarRevisaoPareamento} className="text-xs text-slate-400 hover:text-slate-600 py-1.5 ml-auto">Cancelar (não aplicar nenhum)</button>
              </div>
            </div>
          )}

          {/* Cards de status — um grupo POR FONTE COMPARADA, para refletir de
              fato a situação de cada fonte frente à base e permitir filtrar
              por fonte (ex.: só as cláusulas em que a CCT está "Redação
              Diferente", independente do que a Proposta Sindical mostra). */}
          <div className="mb-4 space-y-2">
            {resultado.comparadas.map(fc => (
              <div key={fc} className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-slate-500 w-32 flex-shrink-0 truncate">
                  {FONTES_CONFIG[fc]?.icone} {FONTES_CONFIG[fc]?.label}
                </span>
                {Object.entries(STATUS_CONFIG).map(([s, cfg]) => {
                  const count = statsStatusPorFonte[fc]?.[s] || 0
                  const ativo = isFonteStatusAtivo(fc, s)
                  return (
                    <button key={s} onClick={() => toggleFonteStatus(fc, s)}
                      title={`${cfg.label}: ${count} cláusula(s) — clique para incluir/excluir do filtro`}
                      className={`px-2 py-1 rounded-md border text-center transition-all select-none ${ativo ? cfg.cls + ' shadow-sm' : 'border-slate-200 bg-white opacity-40 hover:opacity-60'}`}>
                      <span className="text-xs font-bold">{count}</span>
                      <span className="text-[10px] font-medium ml-1">{cfg.icone} {cfg.label || s}</span>
                    </button>
                  )
                })}
              </div>
            ))}
            {temFiltroFonteAtivo && (
              <button onClick={limparFiltrosFonte} className="text-[11px] text-brand-600 hover:underline">↺ Limpar filtros por fonte</button>
            )}
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

              return (
                <div key={idx} className={`card overflow-hidden transition-all ${selected ? 'ring-2 ring-brand-400' : ''}`}>
                  {/* Cabeçalho do card */}
                  <div className="w-full text-left p-3 hover:bg-surface-50 transition-colors cursor-pointer"
                    onClick={() => toggleCard(idx)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="checkbox" checked={selected}
                        onChange={() => toggleSel(idx)} onClick={e => e.stopPropagation()}
                        className="w-4 h-4 flex-shrink-0 cursor-pointer accent-blue-600" />
                      <p className="text-sm text-slate-700 flex-1 min-w-0 truncate font-medium">
                        {r.clausulaBase
                          ? (r.clausulaBase.numero ? r.clausulaBase.numero + ' — ' : '') + r.clausulaBase.titulo
                          : <span className="text-slate-400 italic">Exclusiva: {r.clausulaNova?.titulo || '—'}</span>}
                      </p>
                      {/* Badges por fonte comparada — sempre com o rótulo relacional
                          (ex.: "Base inferior"), nunca o status "solto", para deixar
                          claro que o julgamento é sobre a BASE e não sobre a fonte.
                          IMPORTANTE: nenhum selo de resultado fica ao lado do nome
                          da cláusula-base — o resultado só aparece nestes badges
                          (por fonte comparada) e no bloco de Veredito abaixo. */}
                      <div className="flex gap-1 flex-shrink-0 flex-wrap">
                        {comparadas.map(fc => {
                          const av = r.avaliacoes?.[fc] || {}
                          const cfg2 = STATUS_CONFIG[av.status] || {}
                          return (
                            <span key={fc} title={av.origemIA ? `Resolvido por IA — ${av.resumo}` : av.resumo}
                              className={`text-xs px-1.5 py-0.5 rounded-full font-medium border ${cfg2.cls || 'bg-slate-100 text-slate-500'}`}>
                              {FONTES_CONFIG[fc]?.icone} {cfg2.icone} {cfg2.relLabel || av.status || '—'}{av.origemIA && ' 🤖'}
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
                      style={{ gridTemplateColumns: `repeat(${2 + comparadas.length}, minmax(0, 1fr))` }}>
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
                                {par?.clausulaB?.numero && <span className="font-normal normal-case text-slate-400"> · Nº {par.clausulaB.numero}</span>}
                                {par?.origemIA && (
                                  <span title={par.motivoIA ? `Motivo da IA: ${par.motivoIA}` : 'Este pareamento foi sugerido pela IA (redação muito diferente para o casamento automático por similaridade) — revise antes de considerar definitivo.'} className="ml-1 font-normal normal-case text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">🤖 pareado por IA</span>
                                )}
                              </p>
                              <span title={av.origemIA ? `Revisado por IA — ${av.resumo}` : av.resumo} className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg2.cls || 'bg-slate-100 text-slate-500'}`}>
                                {cfg2.icone} {cfg2.relLabel || av.status || '—'}{av.origemIA && ' 🤖'}
                              </span>
                            </div>
                            {par?.origemIA && par?.motivoIA && (
                              <p className="text-[10px] text-indigo-600 -mt-1 mb-2">
                                🤖 Pareado por IA — motivo: "{par.motivoIA}". Confirme se de fato é o mesmo instituto antes de considerar definitivo.
                              </p>
                            )}
                            {av.origemIA && (
                              <p className="text-[10px] text-indigo-600 -mt-1 mb-2">
                                🤖 Veredito original era "{STATUS_CONFIG[av.veredictoOriginal?.status]?.label || av.veredictoOriginal?.status}" e foi revisado por IA — revise antes de considerar definitivo.
                              </p>
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

                      {/* Coluna Veredito — resumo comparativo consolidado, citando os nomes reais das fontes */}
                      <div className="p-4 bg-slate-50/60">
                        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">⚖️ Veredito</p>
                        <div className="space-y-2">
                          {comparadas.map(fc => {
                            const av = r.avaliacoes?.[fc]
                            if (!av?.status) return null // linha "Nova/Exclusiva": só a fonte que originou a cláusula tem avaliação
                            const cfg2 = STATUS_CONFIG[av.status] || {}
                            const baseLabel = FONTES_CONFIG[resultado.baseEfetiva]?.label
                            const fonteLabel = FONTES_CONFIG[fc]?.label
                            return (
                              <div key={fc} className={`text-xs rounded-lg px-2.5 py-2 border ${cfg2.cls || 'bg-slate-50 text-slate-600'}`}>
                                <p className="font-semibold mb-0.5">
                                  {cfg2.icone} {fraseVeredito(av.status, baseLabel, fonteLabel, !!r.clausulaBase)}
                                </p>
                                {av.resumo && <p className="font-normal opacity-90">{av.resumo}</p>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
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
          <button onClick={gerarRelatorioNegocialIA} disabled={gerandoAnaliseIA} className="text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg">
            {gerandoAnaliseIA ? '⏳ Gerando...' : '🧠 Análise Negocial (IA)'}
          </button>
          <button onClick={gerarRelatorioObjetivoIA} disabled={gerandoParecerIA} className="text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg">
            {gerandoParecerIA ? '⏳ Gerando...' : '📋 Comparativo Objetivo (IA)'}
          </button>
          <button onClick={() => setSelecionados(new Set())} className="text-xs opacity-60 hover:opacity-100 ml-1">✕</button>
        </div>
      )}
    </div>
  )
}
