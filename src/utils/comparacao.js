// Algoritmo de comparação de cláusulas — Motor CCT
// Usa Jaccard ponderado (título 40% + conteúdo 60%) com matching global (dois estágios)

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

// Detecta se uma cláusula é do tipo CCP (ex: "1a", "2a", "10a")
function isCCP(numero) {
  return /^\d+[aº°]/i.test(String(numero || '').trim())
}

// Calcula score combinado título + conteúdo
function calcScore(cA, cB) {
  const scoreTitle = similaridade(cA.titulo, cB.titulo)
  const scoreContent = similaridade(cA.conteudo, cB.conteudo)
  return scoreTitle * 0.4 + scoreContent * 0.6
}

// Matching em dois estágios para evitar que cláusulas CCP "roubem" matches de cláusulas regulares:
// 1º) CCP-A só faz match com CCP-B
// 2º) Regulares-A fazem match com Regulares-B restantes
// Isso corrige o bug onde "12a" (CCP) era matched com "QUADRAGÉSIMA SÉTIMA" (regular)
// por similaridade de conteúdo, impedindo o match correto com QUINQUAGÉSIMA QUARTA
export function compararInstrumentos(clausulasA, clausulasB) {
  const resultado = []
  const usadasB = new Set()

  // Separa CCP e regulares
  const ccpA = clausulasA.filter(c => isCCP(c.numero))
  const regA = clausulasA.filter(c => !isCCP(c.numero))
  const ccpB = clausulasB.filter(c => isCCP(c.numero))
  const regB = clausulasB.filter(c => !isCCP(c.numero))

  // Função de matching greedy com melhor score global
  function matchGrupo(listaA, listaB) {
    // Calcula todos os scores para encontrar o melhor match global
    // (evita greedy que pode pegar um match fraco impedindo um match forte)
    const scores = []
    for (const cA of listaA) {
      for (const cB of listaB) {
        scores.push({ cA, cB, score: calcScore(cA, cB) })
      }
    }
    // Ordena do maior para o menor score
    scores.sort((a, b) => b.score - a.score)

    const usadasBLocal = new Set()
    const usadasALocal = new Set()
    const matches = []

    for (const { cA, cB, score } of scores) {
      if (usadasBLocal.has(cB.id) || usadasALocal.has(cA.id)) continue
      if (score < 0.30) break // abaixo do threshold, para
      usadasBLocal.add(cB.id)
      usadasALocal.add(cA.id)
      usadasB.add(cB.id)
      matches.push({ cA, cB, score })
    }

    return { matches, usadasA: usadasALocal }
  }

  // 1º estágio: CCP vs CCP
  const { matches: matchesCCP, usadasA: usadasACCP } = matchGrupo(ccpA, ccpB)
  for (const { cA, cB, score } of matchesCCP) {
    resultado.push({ clausulaA: cA, clausulaB: cB, score, status: classificarSimilaridade(score) })
  }
  for (const cA of ccpA) {
    if (!usadasACCP.has(cA.id)) {
      resultado.push({ clausulaA: cA, clausulaB: null, score: 0,
        status: { label: 'SUPRIMIDA', cls: 'bg-slate-100 text-slate-700', order: 4 } })
    }
  }

  // 2º estágio: Regulares vs Regulares (CCP-B já marcadas como usadas)
  const { matches: matchesReg, usadasA: usadasAReg } = matchGrupo(regA, regB)
  for (const { cA, cB, score } of matchesReg) {
    resultado.push({ clausulaA: cA, clausulaB: cB, score, status: classificarSimilaridade(score) })
  }
  for (const cA of regA) {
    if (!usadasAReg.has(cA.id)) {
      resultado.push({ clausulaA: cA, clausulaB: null, score: 0,
        status: { label: 'SUPRIMIDA', cls: 'bg-slate-100 text-slate-700', order: 4 } })
    }
  }

  // NOVA: cláusulas de B não usadas
  for (const cB of clausulasB) {
    if (!usadasB.has(cB.id)) {
      resultado.push({ clausulaA: null, clausulaB: cB, score: 0,
        status: { label: 'NOVA', cls: 'bg-purple-100 text-purple-800', order: 5 } })
    }
  }

  return resultado
}
