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

export function classificarSimilaridade(score) {
  if (score >= 0.95) return { label: 'INALTERADA', cls: 'bg-emerald-100 text-emerald-800', order: 0 }
  if (score >= 0.80) return { label: 'ALTERADA', cls: 'bg-blue-100 text-blue-800', order: 1 }
  if (score >= 0.60) return { label: 'MUITO ALTERADA', cls: 'bg-amber-100 text-amber-800', order: 2 }
  return { label: 'SUBSTITUÍDA', cls: 'bg-red-100 text-red-800', order: 3 }
}

// Remove duplicates by numero+titulo key (handles DB duplicates from retried AI calls)
function deduplicar(clausulas) {
  const seen = new Set()
  return clausulas.filter(c => {
    const key = (c.numero || '').toUpperCase().trim() + '|||' + (c.titulo || '').trim().slice(0, 80)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// CCP adendo clauses: "1a", "2a", ..., "14a"
function isCCP(clausula) {
  return /^\d+a$/i.test((clausula.numero || '').trim())
}

// Global best-match within a group (greedy by score — far better than greedy by order)
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
  // Sort descending so best pairs are consumed first
  pairs.sort((x, y) => y.score - x.score)

  const usedA = new Set()
  const usedB = new Set()
  const matched = []
  for (const { a, b, score } of pairs) {
    if (usedA.has(a.id) || usedB.has(b.id)) continue
    usedA.add(a.id)
    usedB.add(b.id)
    matched.push({ a, b, score })
  }
  return { matched, usedA, usedB }
}

export function compararInstrumentos(clausulasA, clausulasB) {
  // 1. Deduplicate both sides (handles DB duplicates from retried AI processing)
  const dedupA = deduplicar(clausulasA)
  const dedupB = deduplicar(clausulasB)

  const resultado = []
  const globalUsedB = new Set()

  // 2. Stage 1 — CCP adendo clauses match only among themselves
  const ccpA = dedupA.filter(isCCP)
  const ccpB = dedupB.filter(isCCP)
  const { matched: ccpMatched, usedA: ccpUsedA, usedB: ccpUsedB } = matchGrupo(ccpA, ccpB, 0.25)

  for (const { a, b, score } of ccpMatched) {
    globalUsedB.add(b.id)
    resultado.push({ clausulaA: a, clausulaB: b, score, status: classificarSimilaridade(score) })
  }
  for (const c of ccpA) {
    if (!ccpUsedA.has(c.id))
      resultado.push({ clausulaA: c, clausulaB: null, score: 0, status: { label: 'SUPRIMIDA', cls: 'bg-slate-100 text-slate-700', order: 4 } })
  }
  for (const c of ccpB) {
    if (!ccpUsedB.has(c.id))
      resultado.push({ clausulaA: null, clausulaB: c, score: 0, status: { label: 'NOVA', cls: 'bg-purple-100 text-purple-800', order: 5 } })
  }

  // 3. Stage 2 — Regular clauses match only among themselves
  const regA = dedupA.filter(c => !isCCP(c))
  const regB = dedupB.filter(c => !isCCP(c))
  const { matched: regMatched, usedA: regUsedA, usedB: regUsedB } = matchGrupo(regA, regB, 0.30)

  for (const { a, b, score } of regMatched) {
    globalUsedB.add(b.id)
    resultado.push({ clausulaA: a, clausulaB: b, score, status: classificarSimilaridade(score) })
  }
  for (const c of regA) {
    if (!regUsedA.has(c.id))
      resultado.push({ clausulaA: c, clausulaB: null, score: 0, status: { label: 'SUPRIMIDA', cls: 'bg-slate-100 text-slate-700', order: 4 } })
  }
  for (const c of regB) {
    if (!regUsedB.has(c.id))
      resultado.push({ clausulaA: null, clausulaB: c, score: 0, status: { label: 'NOVA', cls: 'bg-purple-100 text-purple-800', order: 5 } })
  }

  return resultado
}
