// ─── Tokenização e similaridade Jaccard ──────────────────────────────────────
const STOPWORDS = new Set([
  'a','o','e','de','do','da','dos','das','em','no','na','nos','nas',
  'que','com','para','por','se','ao','às','um','uma','uns','umas',
  'ou','mas','seu','sua','seus','suas','este','esta','estes','estas',
  'esse','essa','esses','essas','ele','ela','eles','elas','ser','ter',
  'foi','são','está','pelo','pela','pelos','pelas','como','mais','já',
  'não','qual','quais','quando','onde','quem','nos','lhe','lhes',
])

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t))
}

function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return intersection.size / union.size
}

export function similaridade(textoA, textoB) {
  const tA = new Set(tokenize(textoA || ''))
  const tB = new Set(tokenize(textoB || ''))
  return jaccard(tA, tB)
}

// ─── Extração de valores numéricos ───────────────────────────────────────────
// Extrai percentuais e valores monetários de um texto
function extrairNumericos(texto) {
  if (!texto) return { percentuais: [], monetarios: [], todos: [] }
  const t = texto.replace(/\./g, '').replace(/,/g, '.')

  // Percentuais: ex "5,32%", "4.11%"
  const percentuais = [...(t.matchAll(/(\d+(?:\.\d+)?)\s*%/g) || [])]
    .map(m => parseFloat(m[1])).filter(n => !isNaN(n) && n > 0 && n < 200)

  // Valores monetários: ex "R$ 3.190,00", "R$ 30,00"
  const monetarios = [...(texto.matchAll(/R\$\s*([\d.]+(?:,\d{2})?)/g) || [])]
    .map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.')))
    .filter(n => !isNaN(n) && n > 0)

  return { percentuais, monetarios, todos: [...percentuais, ...monetarios] }
}

// ─── Nova terminologia de status ─────────────────────────────────────────────
// Contexto: A é a fonte-base, B é a fonte comparada
// Superior = B tem condição melhor para o trabalhador que A
// Inferior  = B tem condição pior para o trabalhador que A
// Igual     = conteúdo idêntico ou numericamente equivalente
// Modificada = redação diferente mas sem valores para comparar
// Exclusiva  = existe só em um dos instrumentos

export const STATUS_CONFIG = {
  Superior:   { cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', order: 0, icone: '▲' },
  Inferior:   { cls: 'bg-red-100 text-red-700 border-red-300',             order: 1, icone: '▼' },
  Igual:      { cls: 'bg-slate-100 text-slate-600 border-slate-300',       order: 2, icone: '=' },
  Modificada: { cls: 'bg-blue-100 text-blue-800 border-blue-300',          order: 3, icone: '~' },
  Exclusiva:  { cls: 'bg-purple-100 text-purple-800 border-purple-300',    order: 4, icone: '◆' },
}

// ─── Avaliação de superioridade com resumo ────────────────────────────────────
// Retorna { status, resumo } onde status é um dos termos acima
// e resumo é uma string explicando o motivo

export function avaliarSuperioridade(textoBase, textoComparado, tituloClausula = '') {
  if (!textoBase && !textoComparado) return { status: 'Exclusiva', resumo: 'Cláusula sem conteúdo em ambas as fontes.' }
  if (!textoBase) return { status: 'Exclusiva', resumo: 'Cláusula presente apenas na fonte comparada (nova em relação à base).' }
  if (!textoComparado) return { status: 'Exclusiva', resumo: 'Cláusula presente apenas na fonte base (não encontrada na comparada).' }

  const numBase = extrairNumericos(textoBase)
  const numComp = extrairNumericos(textoComparado)

  // ── Comparação numérica ──
  // Prioridade 1: percentuais (reajuste, adicional, etc.)
  if (numBase.percentuais.length > 0 && numComp.percentuais.length > 0) {
    const maxBase = Math.max(...numBase.percentuais)
    const maxComp = Math.max(...numComp.percentuais)
    const diff = maxComp - maxBase
    const diffPct = Math.abs(diff).toFixed(2).replace('.', ',')
    if (Math.abs(diff) < 0.01) {
      return {
        status: 'Igual',
        resumo: `Percentual idêntico em ambas as fontes: ${maxBase.toFixed(2).replace('.', ',')}%.`,
      }
    }
    if (diff > 0) {
      return {
        status: 'Superior',
        resumo: `A fonte comparada prevê ${maxComp.toFixed(2).replace('.', ',')}% contra ${maxBase.toFixed(2).replace('.', ',')}% da base — diferença de +${diffPct} p.p. em favor da comparada.`,
      }
    }
    return {
      status: 'Inferior',
      resumo: `A fonte comparada prevê ${maxComp.toFixed(2).replace('.', ',')}% contra ${maxBase.toFixed(2).replace('.', ',')}% da base — diferença de −${diffPct} p.p. desfavorável à comparada.`,
    }
  }

  // Prioridade 2: valores monetários
  if (numBase.monetarios.length > 0 && numComp.monetarios.length > 0) {
    const maxBase = Math.max(...numBase.monetarios)
    const maxComp = Math.max(...numComp.monetarios)
    const diff = maxComp - maxBase
    const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (Math.abs(diff) < 0.01) {
      return {
        status: 'Igual',
        resumo: `Valor idêntico em ambas as fontes: ${fmt(maxBase)}.`,
      }
    }
    if (diff > 0) {
      return {
        status: 'Superior',
        resumo: `A fonte comparada prevê ${fmt(maxComp)} contra ${fmt(maxBase)} da base — diferença de +${fmt(diff)} em favor da comparada.`,
      }
    }
    return {
      status: 'Inferior',
      resumo: `A fonte comparada prevê ${fmt(maxComp)} contra ${fmt(maxBase)} da base — diferença de −${fmt(Math.abs(diff))} desfavorável à comparada.`,
    }
  }

  // ── Comparação textual ──
  const sim = similaridade(textoBase, textoComparado)
  if (sim >= 0.95) {
    return {
      status: 'Igual',
      resumo: 'Conteúdo praticamente idêntico nas duas fontes (sem diferenças relevantes detectadas).',
    }
  }
  return {
    status: 'Modificada',
    resumo: `Redação diferente entre as fontes (similaridade textual: ${(sim * 100).toFixed(0)}%). Sem valores numéricos para determinar superioridade automaticamente — análise jurídica recomendada.`,
  }
}

// ─── Detecção de mudança numérica (para compatibilidade com Comparativo) ─────
function temMudancaNumerica(textoA, textoB) {
  const extrair = t => new Set(
    (t || '').replace(/[.,]/g, '').match(/\b\d{2,}\b/g) || []
  )
  const nA = extrair(textoA)
  const nB = extrair(textoB)
  if (nA.size !== nB.size) return true
  for (const n of nA) if (!nB.has(n)) return true
  return false
}

// ─── Classificação para aba Comparativo (mantém compatibilidade) ──────────────
export function classificarSimilaridade(score, textoA, textoB) {
  if (score >= 0.95 && !temMudancaNumerica(textoA, textoB))
    return { label: 'INALTERADA', cls: 'bg-emerald-100 text-emerald-800', order: 0 }
  return { label: 'ALTERADA', cls: 'bg-blue-100 text-blue-800', order: 1 }
}

// ─── Deduplicação ─────────────────────────────────────────────────────────────
function deduplicar(clausulas) {
  const seen = new Set()
  return clausulas.filter(c => {
    const key = (c.numero || '').toUpperCase().trim() + '|||' + (c.titulo || '').trim().slice(0, 80)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isCCP(clausula) {
  return /^\d+a$/i.test((clausula.numero || '').trim())
}

function matchGrupo(grupoA, grupoB, threshold) {
  const pairs = []
  for (const a of grupoA) {
    for (const b of grupoB) {
      const scoreTitle   = similaridade(a.titulo, b.titulo)
      const scoreContent = similaridade(a.conteudo, b.conteudo)
      const score = scoreTitle * 0.4 + scoreContent * 0.6
      if (score > threshold) pairs.push({ a, b, score })
    }
  }
  pairs.sort((x, y) => y.score - x.score)
  const usedA = new Set(), usedB = new Set()
  const matched = []
  for (const { a, b, score } of pairs) {
    if (usedA.has(a.id) || usedB.has(b.id)) continue
    usedA.add(a.id); usedB.add(b.id)
    matched.push({ a, b, score })
  }
  return { matched, usedA, usedB }
}

// ─── Comparação principal (usada pelo Comparativo e pela Negociação) ──────────
export function compararInstrumentos(clausulasA, clausulasB) {
  const dedupA = deduplicar(clausulasA)
  const dedupB = deduplicar(clausulasB)
  const resultado = []

  // Estágio 1 — cláusulas CCP adendo (1a–14a)
  const ccpA = dedupA.filter(isCCP), ccpB = dedupB.filter(isCCP)
  const { matched: ccpMatched, usedA: ccpUsedA, usedB: ccpUsedB } = matchGrupo(ccpA, ccpB, 0.25)
  for (const { a, b, score } of ccpMatched)
    resultado.push({ clausulaA: a, clausulaB: b, score, status: classificarSimilaridade(score, a.conteudo, b.conteudo) })
  for (const c of ccpA)
    if (!ccpUsedA.has(c.id))
      resultado.push({ clausulaA: c, clausulaB: null, score: 0, status: { label: 'SUPRIMIDA', cls: 'bg-slate-100 text-slate-700', order: 2 } })
  for (const c of ccpB)
    if (!ccpUsedB.has(c.id))
      resultado.push({ clausulaA: null, clausulaB: c, score: 0, status: { label: 'NOVA', cls: 'bg-purple-100 text-purple-800', order: 3 } })

  // Estágio 2 — cláusulas regulares
  const regA = dedupA.filter(c => !isCCP(c)), regB = dedupB.filter(c => !isCCP(c))
  const { matched: regMatched, usedA: regUsedA, usedB: regUsedB } = matchGrupo(regA, regB, 0.30)
  for (const { a, b, score } of regMatched)
    resultado.push({ clausulaA: a, clausulaB: b, score, status: classificarSimilaridade(score, a.conteudo, b.conteudo) })
  for (const c of regA)
    if (!regUsedA.has(c.id))
      resultado.push({ clausulaA: c, clausulaB: null, score: 0, status: { label: 'SUPRIMIDA', cls: 'bg-slate-100 text-slate-700', order: 2 } })
  for (const c of regB)
    if (!regUsedB.has(c.id))
      resultado.push({ clausulaA: null, clausulaB: c, score: 0, status: { label: 'NOVA', cls: 'bg-purple-100 text-purple-800', order: 3 } })

  return resultado
}
