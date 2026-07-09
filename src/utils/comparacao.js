// ─── Tokenização e similaridade Jaccard ──────────────────────────────────────
const STOPWORDS = new Set([
  'a','o','e','de','do','da','dos','das','em','no','na','nos','nas',
  'que','com','para','por','se','ao','às','um','uma','uns','umas',
  'ou','mas','seu','sua','seus','suas','este','esta','estes','estas',
  'esse','essa','esses','essas','ele','ela','eles','elas','ser','ter',
  'foi','são','está','pelo','pela','pelos','pelas','como','mais','já',
  'não','qual','quais','quando','onde','quem','nos','lhe','lhes',
])

// Mapa de sinônimos laborais: normaliza termos equivalentes antes do Jaccard
// (forma canônica: valor do mapa)
const SINONIMOS_LAB = {
  // salário / reajuste
  'reajuste': 'correcao', 'correcao': 'correcao', 'remuneracao': 'correcao', 'salarial': 'correcao',
  // benefício alimentação
  'refeicao': 'refeicao', 'alimentacao': 'refeicao', 'alimentar': 'refeicao', 'ticket': 'refeicao',
  'auxilio': 'vale', 'vale': 'vale',
  // combustível / transporte
  'combustivel': 'combustivel', 'gasolina': 'combustivel', 'transporte': 'transporte',
  // cesta
  'cesta': 'cesta', 'basica': 'cesta',
  // plano variável
  'ppr': 'variavel', 'plr': 'variavel', 'participacao': 'variavel', 'resultado': 'variavel',
  'gratificacao': 'variavel', 'bonus': 'variavel',
  // jornada / banco de horas / compensação — documentos diferentes tratam o
  // mesmo mecanismo (banco de horas) com vocabulário bem diferente: um lado
  // fala em "banco de horas", o outro em "regime de compensação horária".
  // Sem normalizar as duas famílias de termos para a mesma forma canônica,
  // essas cláusulas nunca cruzam o limiar de pareamento e acabam marcadas
  // (erradamente) como exclusivas de cada fonte.
  'banco': 'jornada', 'horas': 'jornada', 'jornada': 'jornada', 'horario': 'jornada',
  'horaria': 'jornada', 'horarios': 'jornada', 'horarias': 'jornada',
  'compensacao': 'jornada', 'compensar': 'jornada', 'compensado': 'jornada',
  'compensada': 'jornada', 'compensatoria': 'jornada', 'compensatorio': 'jornada',
  // vigência
  'vigencia': 'vigencia', 'periodo': 'vigencia', 'abrangencia': 'abrangencia',
}

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t))
}

// tokenize com expansão de sinônimos — usado pelo matching da Negociação
function tokenizeSin(text) {
  return tokenize(text).map(t => SINONIMOS_LAB[t] || t)
}

function jaccardSin(textA, textB) {
  const tA = new Set(tokenizeSin(textA || ''))
  const tB = new Set(tokenizeSin(textB || ''))
  if (tA.size === 0 && tB.size === 0) return 1
  const inter = new Set([...tA].filter(x => tB.has(x)))
  const union = new Set([...tA, ...tB])
  return inter.size / union.size
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
// Extrai percentuais e valores monetários de um texto.
// IMPORTANTE (percentuaisHeadline / monetariosHeadline): cláusulas longas
// costumam ter vários números incidentais ao longo do texto — multa de
// atraso, juros de mora, teto para categoria diferente (ex.: piso geral vs.
// piso de Supervisor/Gerente definido só num parágrafo à parte) — que nada
// têm a ver com o valor substantivo da cláusula (a alíquota de contribuição,
// o piso salarial geral etc.). Usar o maior valor do texto INTEIRO pode
// comparar, por coincidência ou por mistura de categorias, dois números que
// não representam o mesmo conceito — ex.: comparar o piso de "Supervisor ou
// Gerente" do instrumento A com o piso GERAL do instrumento B.
//
// Por isso extraímos também os valores que aparecem só na "manchete" da
// cláusula — definida como o texto ANTES do primeiro marcador de parágrafo
// ("PARÁGRAFO PRIMEIRO", "PARÁGRAFO ÚNICO" etc.), que normalmente carrega o
// valor geral/principal da cláusula, deixando de fora valores específicos de
// subcategorias, multas e outras exceções tratadas nos parágrafos
// seguintes. Quando a cláusula não tem nenhum marcador de parágrafo (ex.:
// cláusulas curtas de 1-2 frases), a manchete cai de volta para um recorte
// limitado do início do texto.
const CAPUT_MAX = 900

function extrairCaput(texto) {
  const m = texto.match(/PAR[AÁ]GRAFO\s/i)
  const limite = m ? Math.min(m.index, CAPUT_MAX) : CAPUT_MAX
  return texto.slice(0, limite)
}

function extrairNumericos(texto) {
  if (!texto) return { percentuais: [], percentuaisHeadline: [], monetarios: [], monetariosHeadline: [], todos: [] }
  const caput = extrairCaput(texto)
  const t = texto.replace(/\./g, '').replace(/,/g, '.')
  const tCaput = caput.replace(/\./g, '').replace(/,/g, '.')

  // Percentuais: ex "5,32%", "4.11%"
  const percentuais = [...(t.matchAll(/(\d+(?:\.\d+)?)\s*%/g) || [])]
    .map(m => parseFloat(m[1])).filter(n => !isNaN(n) && n > 0 && n < 200)

  const percentuaisHeadline = [...(tCaput.matchAll(/(\d+(?:\.\d+)?)\s*%/g) || [])]
    .map(m => parseFloat(m[1])).filter(n => !isNaN(n) && n > 0 && n < 200)

  // Valores monetários: ex "R$ 3.190,00", "R$ 30,00"
  const monetarios = [...(texto.matchAll(/R\$\s*([\d.]+(?:,\d{2})?)/g) || [])]
    .map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.')))
    .filter(n => !isNaN(n) && n > 0)

  const monetariosHeadline = [...(caput.matchAll(/R\$\s*([\d.]+(?:,\d{2})?)/g) || [])]
    .map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.')))
    .filter(n => !isNaN(n) && n > 0)

  return { percentuais, percentuaisHeadline, monetarios, monetariosHeadline, todos: [...percentuais, ...monetarios] }
}

// ─── Nova terminologia de status ─────────────────────────────────────────────
// Contexto: A é a fonte-base, B é a fonte comparada
// Superior = B tem condição melhor para o trabalhador que A
// Inferior  = B tem condição pior para o trabalhador que A
// Igual     = conteúdo idêntico ou numericamente equivalente
// Modificada = redação diferente mas sem valores para comparar
// Exclusiva  = existe só em um dos instrumentos

// `label`     → texto exibido nos badges e filtros (pode diferir da chave interna)
// `relLabel`  → texto curto usado quando o badge aparece "colado" a uma fonte
//               específica (coluna da comparada), deixando explícito que o
//               julgamento é sobre a BASE em relação àquela fonte — nunca um
//               julgamento sobre a fonte em si.
export const STATUS_CONFIG = {
  Superior:     { cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', order: 0, icone: '▲', label: 'Superior',          relLabel: 'Base superior' },
  Inferior:     { cls: 'bg-red-100 text-red-700 border-red-300',             order: 1, icone: '▼', label: 'Inferior',          relLabel: 'Base inferior' },
  Igual:        { cls: 'bg-slate-100 text-slate-600 border-slate-300',       order: 2, icone: '=', label: 'Igual',             relLabel: 'Igual à base' },
  Modificada:   { cls: 'bg-blue-100 text-blue-800 border-blue-300',          order: 3, icone: '~', label: 'Redação Diferente',  relLabel: 'Redação diferente' },
  'Sem previsão': { cls: 'bg-amber-50 text-amber-700 border-amber-200',      order: 4, icone: '−', label: 'Sem Previsão',      relLabel: 'Sem previsão nesta fonte' },
  Exclusiva:    { cls: 'bg-purple-100 text-purple-800 border-purple-300',    order: 5, icone: '◆', label: 'Exclusiva',         relLabel: 'Exclusiva desta fonte' },
}

// ─── Frase de veredito (headline) por status ─────────────────────────────────
// Gera a frase curta que abre cada bloco do Veredito, deixando explícito o
// sentido da comparação (quem é a base, quem é a fonte comparada) e evitando
// termos que soem como um julgamento sobre a fonte comparada em si.
export function fraseVeredito(status, baseLabel, fonteLabel, temBaseClausula = true) {
  if (status === 'Exclusiva' && !temBaseClausula) return `${fonteLabel} tem cláusula exclusiva (sem correspondência na ${baseLabel})`
  switch (status) {
    case 'Superior':   return `${baseLabel} é superior à ${fonteLabel}`
    case 'Inferior':   return `${baseLabel} é inferior à ${fonteLabel}`
    case 'Igual':      return `${baseLabel} é igual à ${fonteLabel}`
    case 'Modificada': return `Redação diferente entre ${baseLabel} e ${fonteLabel}`
    case 'Sem previsão': return `${fonteLabel} não possui previsão equivalente à cláusula da ${baseLabel}`
    default: return `${baseLabel} vs ${fonteLabel}: ${status}`
  }
}

// ─── Formata texto de vigência para o resumo ─────────────────────────────────
function formatarVigencia(vig) {
  if (!vig || (!vig.inicio && !vig.fim)) return ''
  const fmt = d => {
    if (!d) return '?'
    const [y, m, day] = d.split('-')
    return `${day}/${m}/${y}`
  }
  const hoje = new Date().toISOString().slice(0, 10)
  const vencido = vig.fim && vig.fim < hoje
  const periodo = `${fmt(vig.inicio)} a ${fmt(vig.fim)}`
  return vencido ? `${periodo}, vencida` : `${periodo}, vigente`
}

// ─── Extrai trechos concretos de diferença (para status Modificada) ──────────
// Usa o mesmo diff palavra-a-palavra usado na UI, mas retorna apenas as
// primeiras N trocas relevantes como pares "removido → adicionado"
function extrairDiferencasConcretas(textoA, textoB, maxTrocas = 3) {
  const wA = (textoA || '').split(/\s+/).filter(Boolean)
  const wB = (textoB || '').split(/\s+/).filter(Boolean)
  const m = wA.length, n = wB.length
  if (m === 0 || n === 0) return []
  // Limita o tamanho para não travar em cláusulas muito longas
  const capM = Math.min(m, 400), capN = Math.min(n, 400)
  const dp = Array.from({ length: capM + 1 }, () => Array(capN + 1).fill(0))
  for (let i = 1; i <= capM; i++) for (let j = 1; j <= capN; j++)
    dp[i][j] = wA[i-1] === wB[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1])
  const ops = []; let i = capM, j = capN
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wA[i-1] === wB[j-1]) { ops.unshift({ t: 'eq', v: wA[i-1] }); i--; j-- }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { ops.unshift({ t: 'add', v: wB[j-1] }); j-- }
    else { ops.unshift({ t: 'rem', v: wA[i-1] }); i-- }
  }
  // Agrupa sequências consecutivas de rem/add em blocos, formando pares de troca
  const blocos = []
  let atual = null
  for (const op of ops) {
    if (op.t === 'eq') { atual = null; continue }
    if (!atual || atual.t !== op.t) { atual = { t: op.t, palavras: [op.v] }; blocos.push(atual) }
    else atual.palavras.push(op.v)
  }
  // Junta blocos rem seguidos de add em trocas, ou lista isoladamente
  const trocas = []
  for (let k = 0; k < blocos.length && trocas.length < maxTrocas; k++) {
    const b = blocos[k]
    const texto = b.palavras.slice(0, 8).join(' ') + (b.palavras.length > 8 ? '…' : '')
    if (b.t === 'rem' && blocos[k + 1]?.t === 'add') {
      const next = blocos[++k]
      const textoNext = next.palavras.slice(0, 8).join(' ') + (next.palavras.length > 8 ? '…' : '')
      trocas.push(`"${texto}" → "${textoNext}"`)
    } else if (b.t === 'rem') {
      trocas.push(`removido: "${texto}"`)
    } else {
      trocas.push(`adicionado: "${texto}"`)
    }
  }
  return trocas
}

// ─── Avaliação de superioridade com resumo ────────────────────────────────────
// Retorna { status, resumo } onde status é um dos termos acima
// e resumo é uma string explicando o motivo.
// vigenciaBase/vigenciaComparada: { inicio, fim } — usados apenas para
// enriquecer o resumo com contexto temporal (qual instrumento está vigente).

export function avaliarSuperioridade(textoBase, textoComparado, tituloClausula = '', vigenciaBase = null, vigenciaComparada = null) {
  if (!textoBase && !textoComparado) return { status: 'Sem previsão', resumo: 'Cláusula sem conteúdo em ambas as fontes.' }
  if (!textoBase) return { status: 'Exclusiva', resumo: 'Cláusula presente apenas na fonte comparada (nova em relação à base).' }
  if (!textoComparado) return { status: 'Sem previsão', resumo: 'Esta fonte não possui previsão equivalente à cláusula da base.' }

  const vigBaseTxt = formatarVigencia(vigenciaBase)
  const vigCompTxt = formatarVigencia(vigenciaComparada)
  const contextoVigencia = (vigBaseTxt || vigCompTxt)
    ? ` (base: ${vigBaseTxt || 'vigência não informada'}; comparada: ${vigCompTxt || 'vigência não informada'})`
    : ''

  const numBase = extrairNumericos(textoBase)
  const numComp = extrairNumericos(textoComparado)

  // ── Caso especial: cláusulas de reajuste/correção salarial ──
  // Aqui dois fatores tornam a comparação numérica simples (% vs %) enganosa:
  //
  // 1) Fórmula indexada: "INPC + 5%" não é "5%" — é a inflação (variável,
  //    tipicamente positiva) somada a 5 p.p. fixos. Extrair só o "5" e comparar
  //    como se fosse o valor total subestima sistematicamente essa proposta.
  // 2) Vigência vencida: se a cláusula-base já venceu, o percentual dela era o
  //    reajuste do período ANTERIOR (já aplicado/consumido nos salários). Uma
  //    cláusula comparada com vigência atual representa um reajuste NOVO para
  //    o período corrente — não é uma disputa do "mesmo bolo", e a base não
  //    tem nada vigente a oferecer para o novo período.
  const ehReajuste = /reajuste|corre[cç][aã]o salarial/i.test(tituloClausula || '')
  if (ehReajuste) {
    const REGEX_INDICE = /\b(INPC|IPCA|IGP[-\s]?M|ICV|dissídio)\b/i
    const compTemIndice = REGEX_INDICE.test(textoComparado)
    const baseTemIndice = REGEX_INDICE.test(textoBase)

    if (compTemIndice && !baseTemIndice) {
      return {
        status: 'Inferior',
        resumo: `A comparada vincula o reajuste a um índice de inflação (fórmula indexada) somado a um adicional fixo, o que tende a superar o percentual fixo da base ao longo da vigência — a base não acompanha a inflação.${contextoVigencia}`,
      }
    }

    const baseVencida = vigenciaBase?.fim && vigenciaBase.fim < new Date().toISOString().slice(0, 10)
    const compVigente = !vigenciaComparada?.fim || vigenciaComparada.fim >= new Date().toISOString().slice(0, 10)
    if (baseVencida && compVigente) {
      return {
        status: 'Inferior',
        resumo: `A cláusula da base refere-se a um reajuste de período já encerrado (vencida) — já aplicado e consumido nos salários. A comparada trata de um reajuste para o período vigente, não havendo reajuste correspondente ativo na base para o novo período.${contextoVigencia}`,
      }
    }
  }

  // ── Comparação numérica ──
  // Prioridade 1: percentuais (reajuste, adicional, etc.) — mas SÓ quando não
  // há valores monetários divergentes disponíveis. Isso evita que um percentual
  // incidental e idêntico nos dois textos (ex: desconto de 20% do PAT, presente
  // tanto na cláusula de Auxílio Refeição do ACT quanto da CCT) mascare uma
  // diferença real no valor em R$ do benefício, que é o dado substantivo.
  //
  // Além disso, só usamos os percentuais como critério quando AMBOS os textos
  // trazem um percentual na "manchete" (início da cláusula) — se um dos lados
  // só tem percentuais incidentais (multa de atraso, juros de mora) espalhados
  // no meio de um texto longo, comparar por "maior percentual do texto inteiro"
  // pode coincidentemente casar duas multas de mesmo valor e declarar "Igual"
  // sem nunca ter olhado o dado que de fato importa na cláusula.
  const temHeadlineAmbos = numBase.percentuaisHeadline.length > 0 && numComp.percentuaisHeadline.length > 0
  const percBaseUsar = temHeadlineAmbos ? numBase.percentuaisHeadline : numBase.percentuais
  const percCompUsar = temHeadlineAmbos ? numComp.percentuaisHeadline : numComp.percentuais

  const percDiferem = percBaseUsar.length > 0 && percCompUsar.length > 0
    && Math.abs(Math.max(...percBaseUsar) - Math.max(...percCompUsar)) >= 0.01
  const monetDisponveis = numBase.monetarios.length > 0 && numComp.monetarios.length > 0

  if (temHeadlineAmbos && percBaseUsar.length > 0 && percCompUsar.length > 0 && (percDiferem || !monetDisponveis)) {
    const maxBase = Math.max(...percBaseUsar)
    const maxComp = Math.max(...percCompUsar)
    const diff = maxComp - maxBase
    const diffPct = Math.abs(diff).toFixed(2).replace('.', ',')
    if (Math.abs(diff) < 0.01) {
      return {
        status: 'Igual',
        resumo: `Percentual idêntico em ambas as fontes: ${maxBase.toFixed(2).replace('.', ',')}%.${contextoVigencia}`,
      }
    }
    if (diff > 0) {
      // comparada tem mais → base é inferior
      return {
        status: 'Inferior',
        resumo: `A base prevê ${maxBase.toFixed(2).replace('.', ',')}% e a comparada exige ${maxComp.toFixed(2).replace('.', ',')}% — diferença de +${diffPct} p.p. desfavorável à base.${contextoVigencia}`,
      }
    }
    // comparada tem menos → base é superior
    return {
      status: 'Superior',
      resumo: `A base prevê ${maxBase.toFixed(2).replace('.', ',')}% e a comparada indica ${maxComp.toFixed(2).replace('.', ',')}% — diferença de +${diffPct} p.p. em favor da base.${contextoVigencia}`,
    }
  }

  // Prioridade 2: valores monetários
  // Mesma lógica do headline usado para percentuais (ver extrairNumericos):
  // quando a cláusula reúne valores de categorias diferentes (ex.: piso
  // geral vs. piso de Supervisor/Gerente, previsto só num parágrafo à
  // parte), usar o maior valor do texto INTEIRO compararia acidentalmente
  // dois números que não representam o mesmo conceito. O valor do "caput"
  // (antes do primeiro PARÁGRAFO) costuma ser o valor geral/substantivo da
  // cláusula — por isso tem prioridade quando presente nos dois lados.
  const temMonetHeadlineAmbos = numBase.monetariosHeadline.length > 0 && numComp.monetariosHeadline.length > 0
  const monetBaseUsar = temMonetHeadlineAmbos ? numBase.monetariosHeadline : numBase.monetarios
  const monetCompUsar = temMonetHeadlineAmbos ? numComp.monetariosHeadline : numComp.monetarios

  if (monetBaseUsar.length > 0 && monetCompUsar.length > 0) {
    const maxBase = Math.max(...monetBaseUsar)
    const maxComp = Math.max(...monetCompUsar)
    const diff = maxComp - maxBase
    const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (Math.abs(diff) < 0.01) {
      return {
        status: 'Igual',
        resumo: `Valor idêntico em ambas as fontes: ${fmt(maxBase)}.${contextoVigencia}`,
      }
    }
    if (diff > 0) {
      // comparada tem mais → base é inferior
      return {
        status: 'Inferior',
        resumo: `A base prevê ${fmt(maxBase)} e a comparada exige ${fmt(maxComp)} — diferença de +${fmt(diff)} desfavorável à base.${contextoVigencia}`,
      }
    }
    // comparada tem menos → base é superior
    return {
      status: 'Superior',
      resumo: `A base prevê ${fmt(maxBase)} e a comparada indica ${fmt(Math.abs(maxComp))} — diferença de +${fmt(Math.abs(diff))} em favor da base.${contextoVigencia}`,
    }
  }

  // ── Comparação textual ──
  const sim = similaridade(textoBase, textoComparado)
  if (sim >= 0.95) {
    return {
      status: 'Igual',
      resumo: `Conteúdo praticamente idêntico nas duas fontes (sem diferenças relevantes detectadas).${contextoVigencia}`,
    }
  }
  const trocas = extrairDiferencasConcretas(textoBase, textoComparado, 3)
  const trocasTxt = trocas.length > 0
    ? ` Principais diferenças: ${trocas.join('; ')}.`
    : ''
  return {
    status: 'Modificada',
    resumo: `Redação diferente entre as fontes (similaridade textual: ${(sim * 100).toFixed(0)}%).${trocasTxt} Sem valores numéricos para determinar superioridade automaticamente — análise jurídica recomendada.${contextoVigencia}`,
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

// ─── Comparação para Negociação Sindical ─────────────────────────────────────
// Variante de compararInstrumentos otimizada para comparar ACT/CCT com
// Prática Interna e Proposta Sindical, que costumam ter cláusulas com
// conteúdo curto (ex: "Vale Refeição R$ 40,00" cadastradas como resumo).
//
// Diferenças em relação à versão padrão:
// 1. Usa sinônimos laborais na comparação de títulos (jaccardSin)
// 2. Quando o texto da comparada é curto (< 10 tokens), usa só o score de
//    título (evitando que sc ≈ 0 rebaixe o score combinado)
// 3. Threshold menor para textos curtos (0.25 vs 0.30)

function matchGrupoNeg(grupoA, grupoB) {
  const pairs = []
  for (const a of grupoA) {
    const tokConteudoA = tokenize(a.conteudo || '')
    const tokTituloASin = new Set(tokenizeSin(a.titulo || ''))
    for (const b of grupoB) {
      const tokConteudoB = tokenize(b.conteudo || '')
      const curto = Math.min(tokConteudoA.length, tokConteudoB.length) < 10

      const scoreTitulo   = jaccardSin(a.titulo, b.titulo)
      const scoreConteudo = similaridade(a.conteudo, b.conteudo)

      if (curto) {
        // Exige ao menos 1 token (normalizado por sinônimo) em comum entre os
        // títulos — evita parear temas totalmente distintos (ex: "Gratificação
        // de Férias" com "PPR") só porque ambos têm conteúdo curto.
        const tokTituloBSin = new Set(tokenizeSin(b.titulo || ''))
        const overlap = [...tokTituloASin].some(t => tokTituloBSin.has(t))
        if (!overlap) continue
      }

      // Para textos curtos usa apenas título (com sinônimos); caso contrário, combinado
      const score = curto ? scoreTitulo : (scoreTitulo * 0.4 + scoreConteudo * 0.6)
      const threshold = curto ? 0.25 : 0.30

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

export function compararInstrumentosNeg(clausulasA, clausulasB) {
  const dedupA = deduplicar(clausulasA)
  const dedupB = deduplicar(clausulasB)
  const resultado = []

  // Estágio 1 — cláusulas CCP adendo (1a–14a)
  const ccpA = dedupA.filter(isCCP), ccpB = dedupB.filter(isCCP)
  const { matched: ccpMatched, usedA: ccpUsedA, usedB: ccpUsedB } = matchGrupoNeg(ccpA, ccpB)
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
  const { matched: regMatched, usedA: regUsedA, usedB: regUsedB } = matchGrupoNeg(regA, regB)
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

// ─── Pareamento assistido por IA (pós-processamento opcional) ────────────────
// O casamento por Jaccard (matchGrupoNeg) tem um teto estrutural: quando dois
// instrumentos tratam da MESMA cláusula com vocabulário muito diferente (ex.:
// "Banco de Horas" vs "Regime de Compensação Horária"), o score fica na faixa
// de ruído — próximo ou abaixo de comparações genuinamente sem relação (ex.:
// duas cláusulas que só coincidem por compartilhar o mesmo número ordinal).
// Baixar o limiar de corte troca um falso-negativo por um falso-positivo em
// outro par, então não é seguro resolver isso só com regex/Jaccard.
//
// Esta função aplica sugestões de pareamento vindas de uma IA (ver
// services/ai/pareamento.js) sobre o resultado de compararInstrumentosNeg,
// substituindo os pares SUPRIMIDA/NOVA indicados por uma linha comparada de
// verdade — marcada com origemIA:true para que a interface deixe claro que
// aquele pareamento foi sugerido por IA, não por correspondência textual.
export function aplicarParesSugeridosIA(comparativo, sugestoes) {
  if (!sugestoes?.length) return comparativo
  const resultado = [...comparativo]
  for (const { idA, idB } of sugestoes) {
    const idxA = resultado.findIndex(r => r.clausulaA?.id === idA && !r.clausulaB && r.status.label === 'SUPRIMIDA')
    const idxB = resultado.findIndex(r => r.clausulaB?.id === idB && !r.clausulaA && r.status.label === 'NOVA')
    if (idxA === -1 || idxB === -1) continue // sugestão aponta para algo já usado ou inexistente — ignora com segurança
    const a = resultado[idxA].clausulaA
    const b = resultado[idxB].clausulaB
    const score = similaridade(a.conteudo, b.conteudo)
    const status = { ...classificarSimilaridade(score, a.conteudo, b.conteudo), label: 'ALTERADA' }
    const merged = { clausulaA: a, clausulaB: b, score, status, origemIA: true }
    // Remove as duas linhas soltas e insere a linha mesclada no lugar da primeira
    const menor = Math.min(idxA, idxB), maior = Math.max(idxA, idxB)
    resultado.splice(maior, 1)
    resultado.splice(menor, 1, merged)
  }
  return resultado
}
