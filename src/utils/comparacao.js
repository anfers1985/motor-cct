// Algoritmo de comparação de cláusulas — Motor CCT
// Matching em dois estágios: CCP vs CCP primeiro, regulares vs regulares depois.
// Isso evita que cláusulas do adendo CCP (1a, 2a...) "roubem" matches de cláusulas
// principais que têm conteúdo similar (ex: 12a sobre contribuição sindical vs QUINQUAGÉSIMA QUARTA).

const STOPWORDS = new Set([
  'a','o','e','de','do','da','dos','das','em','no','na','nos','nas',
  'que','com','para','por','se','ao','às','um','uma','uns','umas',
  'ou','mas','seu','sua','seus','suas','este','esta','estes','estas',
  'esse','essa','esses','essas','ele','ela','eles','elas','ser','ter',
  'foi','são','está','pelo','pela','pelos','pelas','como','mais','já',
  'não','qual','quais','quando','onde','quem','nos','lhe','lhes',
])

function tokenize(text) {
  return new Set(
    (text || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOPWORDS.has(t))
  )
}

function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1
  let inter = 0
  setA.forEach(x => { if (setB.has(x)) inter++ })
  return inter / (setA.size + setB.size - inter)
}

export function similaridade(textoA, textoB) {
  return jaccard(tokenize(textoA), tokenize(textoB))
}

export function classificarSimilaridade(score) {
  if (score >= 0.95) return { label: 'INALTERADA',    cls: 'bg-emerald-100 text-emerald-800', order: 0 }
  if (score >= 0.80) return { label: 'ALTERADA',      cls: 'bg-blue-100 text-blue-800',       order: 1 }
  if (score >= 0.60) return { label: 'MUITO ALTERADA',cls: 'bg-amber-100 text-amber-800',     order: 2 }
  return               { label: 'SUBSTITUÍDA',        cls: 'bg-red-100 text-red-800',         order: 3 }
}

function isCCP(numero) {
  return /^\d+[aº°]/i.test(String(numero || '').trim())
}

function calcScore(cA, cB) {
  const tTitle = jaccard(tokenize(cA.titulo), tokenize(cB.titulo))
  const tContent = jaccard(tokenize(cA.conteudo), tokenize(cB.conteudo))
  return tTitle * 0.4 + tContent * 0.6
}

// Matching global (melhor score primeiro) dentro de um grupo
function matchGrupo(listaA, listaB, usadasBGlobal) {
  const scores = []
  for (const cA of listaA) {
    for (const cB of listaB) {
      scores.push({ cA, cB, s: calcScore(cA, cB) })
    }
  }
  scores.sort((a, b) => b.s - a.s)

  const usadasB = new Set()
  const usadasA = new Set()
  const matches = []

  for (const { cA, cB, s } of scores) {
    if (usadasB.has(cB.id) || usadasA.has(cA.id)) continue
    if (s < 0.30) break
    usadasB.add(cB.id)
    usadasA.add(cA.id)
    usadasBGlobal.add(cB.id)
    matches.push({ cA, cB, score: s })
  }

  return { matches, usadasA }
}

export function compararInstrumentos(clausulasA, clausulasB) {
  const resultado = []
  const usadasBGlobal = new Set()

  // Separa CCP (adendo) e regulares
  const ccpA = clausulasA.filter(c => isCCP(c.numero))
  const regA = clausulasA.filter(c => !isCCP(c.numero))
  const ccpB = clausulasB.filter(c => isCCP(c.numero))
  const regB = clausulasB.filter(c => !isCCP(c.numero))

  // Estágio 1: CCP vs CCP
  const { matches: mCCP, usadasA: uACCP } = matchGrupo(ccpA, ccpB, usadasBGlobal)
  for (const { cA, cB, score } of mCCP) {
    resultado.push({ clausulaA: cA, clausulaB: cB, score, status: classificarSimilaridade(score) })
  }
  for (const cA of ccpA) {
    if (!uACCP.has(cA.id)) {
      resultado.push({ clausulaA: cA, clausulaB: null, score: 0,
        status: { label: 'SUPRIMIDA', cls: 'bg-slate-100 text-slate-700', order: 4 } })
    }
  }

  // Estágio 2: Regulares vs Regulares
  const { matches: mReg, usadasA: uAReg } = matchGrupo(regA, regB, usadasBGlobal)
  for (const { cA, cB, score } of mReg) {
    resultado.push({ clausulaA: cA, clausulaB: cB, score, status: classificarSimilaridade(score) })
  }
  for (const cA of regA) {
    if (!uAReg.has(cA.id)) {
      resultado.push({ clausulaA: cA, clausulaB: null, score: 0,
        status: { label: 'SUPRIMIDA', cls: 'bg-slate-100 text-slate-700', order: 4 } })
    }
  }

  // Novas: cláusulas B não usadas
  for (const cB of clausulasB) {
    if (!usadasBGlobal.has(cB.id)) {
      resultado.push({ clausulaA: null, clausulaB: cB, score: 0,
        status: { label: 'NOVA', cls: 'bg-purple-100 text-purple-800', order: 5 } })
    }
  }

  return resultado
}
