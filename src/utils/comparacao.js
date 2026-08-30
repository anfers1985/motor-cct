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
  'bonus': 'variavel',
  // NOTA: "gratificacao" NÃO entra aqui de propósito. "Gratificação de Férias"
  // é um instituto FIXO (1/3 constitucional), completamente diferente de PPR/
  // PLR (remuneração variável ligada a resultado). Incluir "gratificacao" no
  // mesmo grupo de "variavel" já causou um pareamento errado confirmado
  // (Gratificação de Férias × "PPR 5%"/"PTS5%" de uma pauta de reivindicação)
  // — qualquer cláusula com "gratificação" no título ficava com overlap de
  // sinônimo artificial com qualquer cláusula de PPR/PLR/bônus, mesmo sendo
  // institutos totalmente diferentes.
  // jornada / banco
  'banco': 'jornada', 'horas': 'jornada', 'jornada': 'jornada', 'horario': 'jornada',
  // vigência
  'vigencia': 'vigencia', 'periodo': 'vigencia', 'abrangencia': 'abrangencia',
}

// Lematização leve de conjugações comuns em CCT/ACT — bounded e explícita de
// propósito (evita o risco de um stemmer genérico colidir com palavras não
// relacionadas, ex.: "câmara" virando "câm" por engano). Cobre exatamente o
// tipo de ruído que faz duas cláusulas SUBSTANCIALMENTE IGUAIS caírem em
// lados opostos do corte de 95% de similaridade só por causa de concordância
// singular/plural ou conjugação verbal ("a EMPRESA pagará" vs "as empresas
// pagarão") — sem isso, o mesmo tipo de diferença puramente gramatical produz
// vereditos diferentes ("Igual" vs "Modificada") dependendo só do tamanho do
// texto, o que é o comportamento reportado como "não passa segurança".
const LEMA_VERBAL = {
  fica: 'fic', ficam: 'fic', ficara: 'fic', ficarao: 'fic', ficando: 'fic', ficou: 'fic', ficaram: 'fic',
  paga: 'pag', pagam: 'pag', pagara: 'pag', pagarao: 'pag', pagando: 'pag', pagou: 'pag', pagaram: 'pag', pago: 'pag', pagos: 'pag',
  deve: 'dev', devem: 'dev', devera: 'dev', deverao: 'dev', devendo: 'dev', deveu: 'dev', deveram: 'dev',
  pode: 'pod', podem: 'pod', podera: 'pod', poderao: 'pod', podendo: 'pod',
  garante: 'garant', garantem: 'garant', garantira: 'garant', garantirao: 'garant', garantido: 'garant', garantida: 'garant', garantidos: 'garant', garantidas: 'garant',
  mantem: 'mant', mantera: 'mant', manterao: 'mant', mantido: 'mant', mantida: 'mant', mantidos: 'mant', mantidas: 'mant', manter: 'mant',
  assegura: 'assegur', asseguram: 'assegur', assegurara: 'assegur', assegurarao: 'assegur', assegurado: 'assegur', assegurada: 'assegur', assegurados: 'assegur', asseguradas: 'assegur',
  concede: 'conced', concedem: 'conced', concedera: 'conced', concederao: 'conced', concedido: 'conced', concedida: 'conced', concedidos: 'conced', concedidas: 'conced',
  obrigado: 'obrig', obrigada: 'obrig', obrigados: 'obrig', obrigadas: 'obrig', obriga: 'obrig', obrigam: 'obrig',
  sera: 'ser', serao: 'ser', foi: 'ser', foram: 'ser', sao: 'ser',
  empresa: 'empresa', empresas: 'empresa',
  empregado: 'empregado', empregados: 'empregado',
  trabalhador: 'trabalhador', trabalhadores: 'trabalhador',
  dependente: 'dependente', dependentes: 'dependente',
  beneficio: 'beneficio', beneficios: 'beneficio',
}

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t))
    .map(t => LEMA_VERBAL[t] || t)
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

// ─── Travas semânticas anti-falso-positivo (casamento automático) ────────────
// Historicamente essas travas só existiam do lado do pareamento por IA
// (services/ai/pareamento.js), porque os casos confirmados de erro vinham de
// lá. O mesmo tipo de erro é PLAUSÍVEL no casamento puramente lexical
// (Jaccard/matchGrupo*): duas cláusulas de institutos DIFERENTES cruzando o
// limiar de similaridade só por compartilharem uma palavra ambígua ou um termo
// jurídico genérico demais. Isto NÃO foi observado num caso real até o momento
// (25-26/08/2026) — é uma blindagem preventiva, não a correção de um bug
// confirmado. Motivo pra manter mesmo assim: com centenas de instrumentos de
// setores diferentes, o volume de dados aumenta a chance de colisão lexical
// desse tipo; e testada contra todos os pares reais processados até aqui, a
// trava não bloqueou nenhum pareamento legítimo (ver comparacao.test.js).
// Por isso as duas travas abaixo agora são exportadas e usadas tanto aqui
// (matchGrupo/matchGrupoNeg) quanto em services/ai/pareamento.js — uma única
// fonte de verdade em vez de duas implementações que podem divergir.

const MARCADORES_PATRONAL = /\bpatronal\b|categoria\s+econ[oô]mica|sindicato\s+(das\s+)?empresas/i
const MARCADORES_PROFISSIONAL = /categoria\s+profissional|sindicato\s+profissional|desconto\s+d[oa]s?\s+sal[aá]rio|do\s+empregado/i

// Contribuições/taxas sindicais patronais e profissionais usam vocabulário
// parecido (contribuição, taxa, sindicato, desconto, valores) mas NUNCA são o
// mesmo instituto — ver histórico completo em services/ai/pareamento.js.
export function familiasIncompativeis(textoA, textoB) {
  const a = textoA || '', b = textoB || ''
  const aPatronal = MARCADORES_PATRONAL.test(a), aProfissional = MARCADORES_PROFISSIONAL.test(a)
  const bPatronal = MARCADORES_PATRONAL.test(b), bProfissional = MARCADORES_PROFISSIONAL.test(b)
  return (aPatronal && bProfissional && !bPatronal) || (bPatronal && aProfissional && !aPatronal)
}

// Termos jurídico-trabalhistas comuns demais para, SOZINHOS, provarem que duas
// cláusulas tratam do mesmo instituto (mesma razão pela qual "gratificação"
// foi tirada do mapa de sinônimos acima: uma palavra genérica em comum não é
// evidência de mesmo instituto). Se o único token compartilhado entre dois
// títulos pertencer a este conjunto, isso não deve, sozinho, empurrar um par
// para cima do limiar de similaridade.
const TERMOS_GENERICOS_DEMAIS = new Set([
  'compensacao', 'salario', 'beneficio', 'contribuicao', 'adicional',
  'auxilio', 'taxa', 'vale', 'plano', 'seguro', 'licenca', 'assistencia',
])

// true quando TODO token em comum entre os dois títulos é genérico demais
// (nenhuma palavra específica o suficiente para confirmar o mesmo instituto).
export function tituloApenasGenerico(tituloA, tituloB) {
  const tA = new Set(tokenizeSin(tituloA || ''))
  const tB = new Set(tokenizeSin(tituloB || ''))
  const overlap = [...tA].filter(t => tB.has(t))
  if (overlap.length === 0) return false
  return overlap.every(t => TERMOS_GENERICOS_DEMAIS.has(t))
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

// IMPORTANTE: o corte por CAPUT_MAX só se aplica quando NÃO existe nenhum
// marcador de PARÁGRAFO no texto (cláusula corrida, sem essa estrutura) — aí
// sim limitamos a janela pra não escanear um texto gigante sem estrutura
// nenhuma pra confiar. Quando EXISTE um marcador de PARÁGRAFO, o caput real é
// tudo antes dele, não importa o tamanho: alguns instrumentos (comum em CCTs
// que anexam um preâmbulo de justificativa jurídica, ex. "Considerando que...")
// têm um caput de bem mais de 900 caracteres antes do valor operativo (%, R$)
// aparecer. Aplicar o corte também nesse caso cortava o percentual/valor real
// fora da janela analisada, fazendo a cláusula cair (erradamente) na
// comparação textual pura por "falta" de número, quando o número está lá,
// só que depois do corte artificial.
//
// O marcador de parágrafo aceita tanto a palavra por extenso ("PARÁGRAFO
// PRIMEIRO") quanto o símbolo "§" (ex.: "§ 1º", "§1º-"), muito comum em CCTs —
// sem reconhecer o símbolo, um texto inteiro dividido em "§ 1º", "§ 2º"...
// era tratado como SEM estrutura nenhuma, e todos os percentuais/valores de
// TODAS as seções acabavam despejados juntos no "caput", criando ambiguidade
// artificial onde na verdade o documento está bem estruturado — só que com
// outro símbolo.
const MARCADOR_PARAGRAFO = /PAR[AÁ]GRAFO\s|§\s?\d/i

function extrairCaput(texto) {
  const m = texto.match(MARCADOR_PARAGRAFO)
  const limite = m ? m.index : CAPUT_MAX
  return texto.slice(0, limite)
}

// ─── Faixas salariais mistas (% para uma faixa, R$ fixo para outra) ─────────
// Caso real confirmado (negociacao_sindical + comparativo_objetivo,
// 25/08/2026): cláusula de reajuste
// com "a) até R$ 9.000,00: 4,11%" / "b) acima de R$ 9.000,01: R$ 369,90 fixo".
// A extração de manchete (percentuaisHeadline) pega só o 4,11% — o valor de
// R$ 369,90 da segunda faixa nunca entra na comparação. Isso não é pareamento
// errado, é uma cláusula condicional (o reajuste depende da remuneração do
// empregado) que o motor não modela faixa a faixa. Detectar esse padrão e
// avisar no resultado evita reportar "a base prevê 4,11%" como se isso
// valesse pra toda a categoria, quando na verdade só vale pra quem ganha até
// o teto — quem ganha mais recebe um valor fixo, não percentual.
const REGEX_FAIXA_LIMITE = /\b(at[ée]|acima de|superior a|inferior a)\s+R\$\s*[\d.,]+/gi

function temFaixasSalariaisMistas(texto) {
  if (!texto) return false
  const caput = extrairCaput(texto)
  const faixas = caput.match(REGEX_FAIXA_LIMITE) || []
  if (faixas.length < 2) return false
  const temPercentual = /\d+(?:,\d+)?\s?%/.test(caput)
  const totalMonetarios = (caput.match(/R\$\s*[\d.,]+/g) || []).length
  // Precisa de percentual E de mais valores em R$ do que só os limites das
  // faixas (senão os R$ encontrados são só os tetos, não um valor fixo real)
  return temPercentual && totalMonetarios > faixas.length
}

function extrairNumericos(texto) {
  if (!texto) return { percentuais: [], percentuaisHeadline: [], monetarios: [], monetariosHeadline: [], todos: [], estruturado: false, ambiguoPercentual: false, ambiguoMonetario: false }
  const estruturado = MARCADOR_PARAGRAFO.test(texto)
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

  // ── Progressão temporal vs. ambiguidade de categoria ───────────────────────
  // "R$ 1.800 a partir de julho/2025 ... R$ 1.872 a partir de setembro/2025"
  // tem 2 valores no caput, mas NÃO é ambiguidade — é reajuste escalonado no
  // tempo, e o valor vigente é o mais recente (último do texto). Isso é bem
  // diferente de "R$ X para vendedores e R$ Y para supervisores", que são
  // categorias distintas de verdade. Distinguimos de duas formas — se
  // QUALQUER uma bater, tratamos como progressão (não ambiguidade):
  //
  // 1) Âncora temporal: o MAIOR valor distinto do caput tem uma referência de
  //    data grudada do lado ("a partir de", "a contar de", "desde") nas ~100
  //    posições vizinhas — o padrão típico de reajuste é "valor antigo, novo
  //    valor a partir de [data]"; só o valor mais recente costuma repetir a
  //    data.
  // 2) Âncora de total: o texto anuncia explicitamente que os valores se
  //    somam ("perfazendo um total de X%", "totalizando R$ X") — comum em
  //    reajustes salariais partidos em duas parcelas no mesmo período (ex.:
  //    "6% + 1% = 7%"). Nesse caso o valor "total" declarado é o que vale,
  //    não o maior individual.
  //
  // Funciona igual para valores em R$ e em % — por isso os grupos de captura
  // cobrem os dois formatos.
  const ANCORA_TEMPORAL = /(?:(?:a\s+partir\s+de|a\s+contar\s+de|desde)\s+[^.;]{0,100}?(?:R\$\s*([\d.]+(?:,\d{2})?)|([\d]+(?:,\d+)?)\s*%))|(?:(?:R\$\s*([\d.]+(?:,\d{2})?)|([\d]+(?:,\d+)?)\s*%)[^.;]{0,60}?(?:a\s+partir\s+de|a\s+contar\s+de|desde))/gi
  const ANCORA_TOTAL = /(?:total|totalizando|perfazendo)[^.;]{0,40}?(?:de\s+)?(?:R\$\s*([\d.]+(?:,\d{2})?)|([\d]+(?:,\d+)?)\s*%)/gi
  function ehProgressaoTemporal(caputOriginal, valoresDistintos) {
    if (valoresDistintos.length < 2) return false
    const extrairValoresAncora = regex => [...caputOriginal.matchAll(regex)]
      .map(m => parseFloat((m[1] || m[2] || m[3] || m[4] || '').replace(/\./g, '').replace(',', '.')))
      .filter(v => !isNaN(v))
    const valoresAncorados = [...extrairValoresAncora(ANCORA_TEMPORAL), ...extrairValoresAncora(ANCORA_TOTAL)]
    if (valoresAncorados.length === 0) return false
    const maiorValor = Math.max(...valoresDistintos)
    return valoresAncorados.some(v => Math.abs(v - maiorValor) < 0.01)
  }
  const progressaoMonetaria = ehProgressaoTemporal(
    caput,
    [...new Set(monetariosHeadline.map(n => n.toFixed(2)))].map(Number)
  )
  const progressaoPercentual = ehProgressaoTemporal(
    caput,
    [...new Set(percentuaisHeadline.map(n => n.toFixed(2)))].map(Number)
  )

  // ── Ambiguidade ──────────────────────────────────────────────────────────
  // Dois cenários em que "o maior valor" não é uma leitura confiável, mesmo
  // depois do recorte por caput:
  //
  // 1) O PRÓPRIO caput já traz mais de um valor distinto (ex.: "R$ X para a
  //    categoria A e R$ Y para a categoria B", tudo antes de qualquer
  //    PARÁGRAFO). O recorte por caput não separa isso — só ajuda quando a
  //    convenção é "caput geral + PARÁGRAFO = exceção/subcategoria".
  //
  // 2) Não existe NENHUM marcador estrutural de parágrafo no texto E o texto
  //    inteiro tem mais de um valor. Isso cobre tanto instrumentos que usam
  //    "Inciso I/II" ou "alínea a) b)" em vez de "PARÁGRAFO" (o regex não
  //    reconhece esses marcadores), quanto — mais importante — textos que não
  //    seguem NENHUM padrão de CCT/ACT/Mediador do MTE: propostas sindicais
  //    e registros de prática interna da empresa, que chegam como texto
  //    corrido livre. Para esses, não há sinal estrutural nenhum para confiar
  //    — é justamente onde o Math.max() tem mais chance de misturar categorias.
  //
  // IMPORTANTE: mesmo quando isso dá "ambíguo" aqui, avaliarSuperioridade()
  // tenta ANTES uma comparação por categoria paralela (ver
  // compararCategoriasParalelas) usando o `caput` retornado abaixo — só cai
  // de fato em "Ambigua" quando essa tentativa também não resolve.
  const distintos = arr => new Set(arr.map(n => n.toFixed(2))).size
  const ambiguoPercentual = !progressaoPercentual && (
    distintos(percentuaisHeadline) > 1
    || (!estruturado && distintos(percentuais) > 1)
  )
  const ambiguoMonetario = !progressaoMonetaria && (
    distintos(monetariosHeadline) > 1
    || (!estruturado && distintos(monetarios) > 1)
  )

  return {
    percentuais, percentuaisHeadline, monetarios, monetariosHeadline,
    todos: [...percentuais, ...monetarios], estruturado, ambiguoPercentual, ambiguoMonetario,
    progressaoMonetaria, progressaoPercentual, caput,
  }
}

// ── Comparação por categoria paralela ────────────────────────────────────────
// Quando o caput lista MÚLTIPLOS valores para MÚLTIPLAS categorias na mesma
// cláusula (ex.: "R$ 35,00 para almoço, R$ 35,00 para jantar, R$ 15,00 para
// café, R$ 15,00 para pernoite"), usar Math.max() sozinho mistura categorias
// diferentes. Mas se AMBAS as fontes têm exatamente a MESMA QUANTIDADE de
// valores no caput (mesma estrutura de categorias, o que é o normal quando
// se compara duas revisões do mesmo instrumento/mesma família de cláusula),
// dá pra comparar posição a posição — cada categoria contra ela mesma — em
// vez de descartar tudo como "Ambígua". Só aplicamos quando o resultado é
// CONSISTENTE (todas as categorias sobem, todas descem, ou todas iguais); se
// for misto (algumas sobem, outras descem), a ambiguidade É real — mantemos
// "Ambigua" porque de fato não existe uma resposta única de "quem é melhor".
function extrairValoresOrdenados(caputTexto) {
  return [...(caputTexto || '').matchAll(/R\$\s*([\d.]+(?:,\d{2})?)/g)]
    .map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.')))
    .filter(n => !isNaN(n) && n > 0)
}

function extrairPercentuaisOrdenados(caputTexto) {
  const t = (caputTexto || '').replace(/\./g, '').replace(/,/g, '.')
  return [...t.matchAll(/(\d+(?:\.\d+)?)\s*%/g)]
    .map(m => parseFloat(m[1]))
    .filter(n => !isNaN(n) && n > 0 && n < 200)
}

function compararCategoriasParalelas(caputBase, caputComp, tipo = 'monetario') {
  const extrair = tipo === 'percentual' ? extrairPercentuaisOrdenados : extrairValoresOrdenados
  const valoresBase = extrair(caputBase)
  const valoresComp = extrair(caputComp)
  if (valoresBase.length < 2 || valoresBase.length !== valoresComp.length) return null
  const diffs = valoresBase.map((v, i) => valoresComp[i] - v)
  const positivos = diffs.filter(d => d >= 0.01).length
  const negativos = diffs.filter(d => d <= -0.01).length
  if (positivos > 0 && negativos > 0) return null // misto — ambiguidade real, não resolver automaticamente
  return { direcao: positivos > 0 ? 1 : (negativos > 0 ? -1 : 0), valoresBase, valoresComp }
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
  Igual:        { cls: 'bg-slate-100 text-slate-600 border-slate-300',       order: 2, icone: '=', label: 'Equivalente',       relLabel: 'Equivalente à base' },
  Modificada:   { cls: 'bg-blue-100 text-blue-800 border-blue-300',          order: 3, icone: '~', label: 'Redação Diferente',  relLabel: 'Redação diferente' },
  'Sem previsão': { cls: 'bg-amber-50 text-amber-700 border-amber-200',      order: 4, icone: '−', label: 'Sem Previsão',      relLabel: 'Sem previsão nesta fonte' },
  Exclusiva:    { cls: 'bg-purple-100 text-purple-800 border-purple-300',    order: 5, icone: '◆', label: 'Exclusiva',         relLabel: 'Exclusiva desta fonte' },
  // Vários valores numéricos candidatos e nenhuma estrutura confiável (caput/
  // PARÁGRAFO) pra saber qual é o principal — ver extrairNumericos(). Em vez
  // de "chutar" com Math.max() e arriscar comparar categorias diferentes,
  // fica marcado explicitamente para revisão manual ou refinamento por IA.
  Ambigua:      { cls: 'bg-orange-100 text-orange-800 border-orange-300',   order: 6, icone: '?', label: 'Ambígua',           relLabel: 'Vários valores — requer revisão' },
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
    case 'Igual':      return `${baseLabel} é equivalente à ${fonteLabel} no dado comparado`
    case 'Modificada': return `Redação diferente entre ${baseLabel} e ${fonteLabel}`
    case 'Ambigua':    return `${baseLabel} vs ${fonteLabel}: vários valores candidatos, requer confirmação`
    case 'Sem previsão': return `${fonteLabel} não possui previsão equivalente à cláusula da ${baseLabel}`
    default: return `${baseLabel} vs ${fonteLabel}: ${status}`
  }
}

// Texto legível completo de um veredito: "[Label] frase-resumo do fraseVeredito
// — resumo detalhado". Usado tanto no export simples de Negociação quanto no
// Comparativo Objetivo (via Negociacao.jsx/Comparativo.jsx) — existir só aqui
// evita que os dois caminhos divirjam de novo. Foi exatamente essa duplicação
// (cada export com sua própria cópia da lógica) que causou o bug confirmado em
// 28/08/2026: o Comparativo Objetivo mostrava "? Ambígua" sem nenhuma
// explicação em 3 células, enquanto o export simples (mesma base de dados)
// sempre trazia o texto completo — porque só ele concatenava av.resumo.
export function resultadoTexto(av, baseLabel, fonteLabel, temBaseClausula = true) {
  if (!av?.status) return null
  const cfg = STATUS_CONFIG[av.status] || {}
  const headline = fraseVeredito(av.status, baseLabel, fonteLabel, temBaseClausula)
  return `[${cfg.label || av.status}] ${headline}${av.resumo ? ' — ' + av.resumo : ''}`
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

    // Faixas salariais mistas: ver temFaixasSalariaisMistas acima. Isso roda
    // ANTES da comparação por percentual — se a cláusula tem faixa por
    // remuneração com tipos de valor diferentes (% numa faixa, R$ fixo
    // noutra), reportar só a manchete percentual seria enganoso.
    const baseTemFaixas = temFaixasSalariaisMistas(textoBase)
    const compTemFaixas = temFaixasSalariaisMistas(textoComparado)
    if (baseTemFaixas || compTemFaixas) {
      const qual = baseTemFaixas && compTemFaixas ? 'Ambas as fontes têm' : (baseTemFaixas ? 'A base tem' : 'A comparada tem')
      return {
        status: 'Ambigua',
        resumo: `${qual} faixas salariais distintas (percentual para uma faixa de remuneração, valor fixo em R$ para outra) — a comparação automática não modela faixa a faixa e reportar apenas o percentual da primeira faixa seria incompleto. Requer confirmação manual, comparando cada faixa de remuneração separadamente.${contextoVigencia}`,
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
    if (numBase.ambiguoPercentual || numComp.ambiguoPercentual) {
      const paralelo = compararCategoriasParalelas(numBase.caput, numComp.caput, 'percentual')
      if (paralelo) {
        const fmt = v => v.toFixed(2).replace('.', ',') + '%'
        const pares = paralelo.valoresBase.map((v, i) => `${fmt(v)} → ${fmt(paralelo.valoresComp[i])}`).join('; ')
        if (paralelo.direcao === 0) {
          return {
            status: 'Igual',
            resumo: `Mesmos percentuais em todas as ${paralelo.valoresBase.length} categorias identificadas no caput (${pares}).${contextoVigencia}`,
          }
        }
        return {
          status: paralelo.direcao > 0 ? 'Inferior' : 'Superior',
          resumo: `Todos os ${paralelo.valoresBase.length} percentuais no caput ${paralelo.direcao > 0 ? 'aumentaram' : 'diminuíram'} na fonte comparada em relação à base, na mesma direção em cada um (${pares}) — comparação por categoria (posição a posição), não pelo maior valor isolado.${contextoVigencia}`,
        }
      }
      const listar = arr => [...new Set(arr.map(n => n.toFixed(2).replace('.', ',') + '%'))].join(', ')
      return {
        status: 'Ambigua',
        resumo: `Mais de um percentual candidato encontrado (base: ${listar(percBaseUsar)}; comparada: ${listar(percCompUsar)}) e não há estrutura confiável (ex.: "PARÁGRAFO") para saber qual se aplica ao caso geral — pode ser categoria diferente, e não o mesmo dado. Requer confirmação manual ou refinamento por IA.${contextoVigencia}`,
        candidatos: { tipo: 'percentual', base: percBaseUsar, comparado: percCompUsar },
      }
    }
    const temPercHeadlineAmbos = numBase.percentuaisHeadline.length > 0 && numComp.percentuaisHeadline.length > 0
    const valorRepresentativoPerc = (arr, num) =>
      (temPercHeadlineAmbos && num.progressaoPercentual) ? arr[arr.length - 1] : Math.max(...arr)
    const maxBase = valorRepresentativoPerc(percBaseUsar, numBase)
    const maxComp = valorRepresentativoPerc(percCompUsar, numComp)
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
    if (numBase.ambiguoMonetario || numComp.ambiguoMonetario) {
      const paralelo = compararCategoriasParalelas(numBase.caput, numComp.caput)
      if (paralelo) {
        const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        const pares = paralelo.valoresBase.map((v, i) => `${fmt(v)} → ${fmt(paralelo.valoresComp[i])}`).join('; ')
        if (paralelo.direcao === 0) {
          return {
            status: 'Igual',
            resumo: `Mesmos valores em todas as ${paralelo.valoresBase.length} categorias identificadas no caput (${pares}).${contextoVigencia}`,
          }
        }
        // direcao > 0: comparada maior em todas as categorias → base inferior
        // direcao < 0: comparada menor em todas as categorias → base superior
        return {
          status: paralelo.direcao > 0 ? 'Inferior' : 'Superior',
          resumo: `Todas as ${paralelo.valoresBase.length} categorias de valor no caput ${paralelo.direcao > 0 ? 'aumentaram' : 'diminuíram'} na fonte comparada em relação à base, na mesma direção em cada uma (${pares}) — comparação por categoria (posição a posição), não pelo maior valor isolado.${contextoVigencia}`,
        }
      }
      const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const listar = arr => [...new Set(arr.map(n => fmt(n)))].join(', ')
      return {
        status: 'Ambigua',
        resumo: `Mais de um valor candidato encontrado (base: ${listar(monetBaseUsar)}; comparada: ${listar(monetCompUsar)}) e não há estrutura confiável (ex.: "PARÁGRAFO") para saber qual se aplica ao caso geral — pode ser categoria/faixa diferente, e não o mesmo dado. Requer confirmação manual ou refinamento por IA.${contextoVigencia}`,
        candidatos: { tipo: 'monetario', base: monetBaseUsar, comparado: monetCompUsar },
      }
    }
    const valorRepresentativo = (arr, num) =>
      (temMonetHeadlineAmbos && num.progressaoMonetaria) ? arr[arr.length - 1] : Math.max(...arr)
    const maxBase = valorRepresentativo(monetBaseUsar, numBase)
    const maxComp = valorRepresentativo(monetCompUsar, numComp)
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
      if (familiasIncompativeis(`${a.titulo} ${a.conteudo || ''}`, `${b.titulo} ${b.conteudo || ''}`)) continue
      const scoreTitle   = similaridade(a.titulo, b.titulo)
      const scoreContent = similaridade(a.conteudo, b.conteudo)
      const score = scoreTitle * 0.4 + scoreContent * 0.6
      if (score <= threshold) continue
      // Se o par só cruzou o limiar por causa de uma palavra genérica demais
      // em comum no título (ex.: "compensação", "salário") e o conteúdo em si
      // tem pouquíssima relação, exige uma barra maior antes de aceitar —
      // blindagem preventiva (não corresponde a um caso confirmado nos dados
      // vistos até agora, ver nota em TERMOS_GENERICOS_DEMAIS acima).
      if (tituloApenasGenerico(a.titulo, b.titulo) && scoreContent < 0.15) continue
      pairs.push({ a, b, score })
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
      if (familiasIncompativeis(`${a.titulo} ${a.conteudo || ''}`, `${b.titulo} ${b.conteudo || ''}`)) continue
      const tokConteudoB = tokenize(b.conteudo || '')
      const curto = Math.min(tokConteudoA.length, tokConteudoB.length) < 10

      const scoreTitulo   = jaccardSin(a.titulo, b.titulo)
      const scoreConteudo = similaridade(a.conteudo, b.conteudo)

      if (curto) {
        // Exige ao menos 1 token (normalizado por sinônimo) em comum entre os
        // títulos — evita parear temas totalmente distintos (ex: "Gratificação
        // de Férias" com "PPR") só porque ambos têm conteúdo curto. Mas um
        // único token genérico demais (ex.: "salário", "compensação") também
        // não basta sozinho — precisa ser específico o bastante pra identificar
        // o MESMO instituto — exemplo hipotético: "Salário Ingresso" ×
        // "Salário Substituição" seriam institutos diferentes que só
        // compartilhariam a palavra "salário" (blindagem preventiva, sem
        // caso confirmado nos dados vistos até agora).
        const tokTituloBSin = new Set(tokenizeSin(b.titulo || ''))
        const overlapTokens = [...tokTituloASin].filter(t => tokTituloBSin.has(t))
        if (overlapTokens.length === 0) continue
        if (overlapTokens.every(t => TERMOS_GENERICOS_DEMAIS.has(t))) continue
      }

      // Para textos curtos usa apenas título (com sinônimos); caso contrário, combinado
      const score = curto ? scoreTitulo : (scoreTitulo * 0.4 + scoreConteudo * 0.6)
      const threshold = curto ? 0.25 : 0.30

      if (score <= threshold) continue
      if (!curto && tituloApenasGenerico(a.titulo, b.titulo) && scoreConteudo < 0.15) continue
      pairs.push({ a, b, score })
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
  for (const { idA, idB, motivo } of sugestoes) {
    const idxA = resultado.findIndex(r => r.clausulaA?.id === idA && !r.clausulaB && r.status.label === 'SUPRIMIDA')
    const idxB = resultado.findIndex(r => r.clausulaB?.id === idB && !r.clausulaA && r.status.label === 'NOVA')
    if (idxA === -1 || idxB === -1) continue // sugestão aponta para algo já usado ou inexistente — ignora com segurança
    const a = resultado[idxA].clausulaA
    const b = resultado[idxB].clausulaB
    const score = similaridade(a.conteudo, b.conteudo)
    const status = { ...classificarSimilaridade(score, a.conteudo, b.conteudo), label: 'ALTERADA' }
    const merged = { clausulaA: a, clausulaB: b, score, status, origemIA: true, motivoIA: motivo }
    // Remove as duas linhas soltas e insere a linha mesclada no lugar da primeira
    const menor = Math.min(idxA, idxB), maior = Math.max(idxA, idxB)
    resultado.splice(maior, 1)
    resultado.splice(menor, 1, merged)
  }
  return resultado
}
