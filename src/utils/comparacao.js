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

export function compararInstrumentos(clausulasA, clausulasB) {
  const resultado = []
  const usadasB = new Set()

  for (const cA of clausulasA) {
    let melhorScore = -1
    let melhorB = null

    for (const cB of clausulasB) {
      if (usadasB.has(cB.id)) continue
      // Compara por título primeiro (peso maior), depois conteúdo
      const scoreTitle = similaridade(cA.titulo, cB.titulo)
      const scoreContent = similaridade(cA.conteudo, cB.conteudo)
      const score = scoreTitle * 0.4 + scoreContent * 0.6
      if (score > melhorScore) {
        melhorScore = score
        melhorB = cB
      }
    }

    if (melhorB && melhorScore > 0.3) {
      usadasB.add(melhorB.id)
      const status = classificarSimilaridade(melhorScore)
      resultado.push({ clausulaA: cA, clausulaB: melhorB, score: melhorScore, status })
    } else {
      resultado.push({
        clausulaA: cA, clausulaB: null, score: 0,
        status: { label: 'SUPRIMIDA', cls: 'bg-slate-100 text-slate-700', order: 4 }
      })
    }
  }

  for (const cB of clausulasB) {
    if (!usadasB.has(cB.id)) {
      resultado.push({
        clausulaA: null, clausulaB: cB, score: 0,
        status: { label: 'NOVA', cls: 'bg-purple-100 text-purple-800', order: 5 }
      })
    }
  }

  return resultado
}
