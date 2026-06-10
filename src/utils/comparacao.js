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

// Detecta mudanças em valores numéricos (preços, percentuais, datas)
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

// Apenas INALTERADA ou ALTERADA — grau de modificação não importa
export function classificarSimilaridade(score, textoA, textoB) {
  if (score >= 0.95 && !temMudancaNumerica(textoA, textoB))
    return { label: 'INALTERADA', cls: 'bg-emerald-100 text-emerald-800', order: 0 }
  return { label: 'ALTERADA', cls: 'bg-blue-100 text-blue-800', order: 1 }
}

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
