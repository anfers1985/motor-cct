// Motor CCT — Refinamento de vereditos ambíguos assistido por IA
//
// Por quê: avaliarSuperioridade (utils/comparacao.js) resolve automaticamente
// os casos em que o dado numérico da cláusula é claro (um valor no "caput",
// ou uma progressão temporal clara tipo "R$ X a partir de julho... R$ Y a
// partir de setembro"). Quando isso NÃO é suficiente — a cláusula tem mais de
// um valor candidato sem nenhuma estrutura confiável pra dizer qual vale —
// ela devolve status "Ambigua" em vez de arriscar um Math.max() que pode
// misturar categorias diferentes (ver comentário de extrairNumericos).
//
// Isso é especialmente comum em textos que NÃO seguem o padrão CCT/ACT/
// Mediador do MTE — propostas sindicais em negociação e registros de prática
// interna da empresa, que chegam como texto corrido livre, sem "PARÁGRAFO"
// nenhum separando categorias. Pra esses, o recorte por caput não tem sinal
// estrutural pra usar, e é exatamente onde vale a pena gastar uma chamada de
// IA — que consegue ler "para vendedores" / "para supervisores" e entender
// qual valor corresponde a qual categoria, coisa que Jaccard/regex não fazem.
//
// Só roda sobre as linhas já marcadas "Ambigua" pelo passo determinístico
// (nunca sobre a comparação inteira de novo) — mantém o custo/latência de IA
// proporcional ao que realmente precisa de julgamento.

import { getAIConfig } from './index.js'
import { chamarProvedor, extrairJSON } from './chamada.js'

const MAX_CONTEUDO_PROMPT = 1200

function montarPrompt(itens) {
  const blocos = itens.map((it, i) => `
### ITEM ${i} — ${it.titulo}
CANDIDATOS BASE: ${it.candidatos.base.map(v => it.candidatos.tipo === 'monetario' ? `R$ ${v.toFixed(2).replace('.', ',')}` : `${v.toFixed(2).replace('.', ',')}%`).join(', ')}
CANDIDATOS COMPARADA: ${it.candidatos.comparado.map(v => it.candidatos.tipo === 'monetario' ? `R$ ${v.toFixed(2).replace('.', ',')}` : `${v.toFixed(2).replace('.', ',')}%`).join(', ')}

TEXTO BASE:
${(it.textoBase || '').slice(0, MAX_CONTEUDO_PROMPT)}

TEXTO COMPARADO:
${(it.textoComparado || '').slice(0, MAX_CONTEUDO_PROMPT)}`).join('\n')

  return `Você é especialista em direito do trabalho brasileiro, comparando cláusulas de dois
instrumentos/textos (podem ser CCT, ACT, proposta sindical em negociação, ou registro de
prática interna de empresa — nem sempre seguem o padrão formal de CCT/ACT).

Cada item abaixo tem MAIS DE UM valor numérico candidato em pelo menos um dos lados, e não foi
possível determinar automaticamente qual valor corresponde ao caso geral (pode ser categoria,
cargo, faixa ou período diferente). Leia o texto e decida:

1) Os valores candidatos de cada lado são realmente para categorias/situações diferentes (ex.:
   "vendedores" vs "supervisores"), ou o valor mais alto/mais recente é claramente o aplicável
   ao caso geral?
2) Comparando o valor CORRETO de cada lado (mesma categoria/situação em ambos, quando possível),
   a BASE é Superior, Inferior ou Igual à COMPARADA? Se os textos tratam de categorias que não
   têm correspondente clara do outro lado, ou se a informação no texto não é suficiente para
   decidir com segurança, responda "Indeterminado" — não adivinhe.

ATENÇÃO — CONSISTÊNCIA OBRIGATÓRIA entre "status" e "resumo": "status" é sempre do ponto de
vista da BASE (TEXTO BASE), nunca da comparada. Se o seu "resumo" disser que o TEXTO COMPARADO
é mais vantajoso/favorável/alto, o "status" tem que ser "Inferior" (a base é PIOR) — nunca
"Superior". Se disser que o TEXTO BASE é mais vantajoso, "status" é "Superior". Releia sua
própria resposta antes de responder: o adjetivo que você usar no resumo para descrever qual lado
"ganha" tem que apontar para o MESMO lado que o "status" escolhido representa.

${blocos}

SAÍDA OBRIGATÓRIA: retorne APENAS um array JSON válido, nenhum texto antes ou depois, sem
markdown. Um item por ITEM acima, na mesma ordem, incluindo o índice:
[{"item":0,"status":"Superior|Inferior|Igual|Indeterminado","resumo":"1-2 frases explicando qual valor de cada lado foi usado e por quê"}]`
}

// itensAmbiguos: [{ id, titulo, textoBase, textoComparado, candidatos }] — vem
// das linhas com status.label === 'Ambigua' produzidas por avaliarSuperioridade
// (o campo `candidatos` já vem pronto no resultado, ver comparacao.js).
// Retorna: [{ id, status, resumo, origemIA:true }] — só para os itens em que a
// IA respondeu com confiança (Indeterminado é descartado: a linha continua
// "Ambigua" e pede revisão manual mesmo depois da tentativa de IA).
export async function refinarVereditosAmbiguos(itensAmbiguos, onProgress = null) {
  if (!itensAmbiguos?.length) return []
  const config = getAIConfig()
  if (!config?.provedor || !config?.chave) {
    throw new Error('Configure um provedor de IA nas Configurações para usar o refinamento assistido.')
  }
  onProgress?.(`Analisando ${itensAmbiguos.length} veredito(s) ambíguo(s) com IA...`)
  const prompt = montarPrompt(itensAmbiguos)
  const raw = await chamarProvedor(config, prompt)
  const respostas = extrairJSON(raw) || []
  const STATUS_VALIDOS = new Set(['Superior', 'Inferior', 'Igual'])
  const resultado = []
  for (const r of respostas) {
    const item = itensAmbiguos[r?.item]
    if (!item || !STATUS_VALIDOS.has(r.status)) continue // 'Indeterminado' ou resposta malformada: mantém Ambigua
    resultado.push({ id: item.id, status: r.status, resumo: (r.resumo || '').trim(), origemIA: true })
  }
  onProgress?.(resultado.length > 0
    ? `IA resolveu ${resultado.length} de ${itensAmbiguos.length} veredito(s) ambíguo(s).`
    : 'IA não conseguiu resolver os vereditos ambíguos com segurança.')
  return resultado
}

// ─── Auditoria de "Redação Diferente" ────────────────────────────────────────
// avaliarSuperioridade cai em "Modificada" (Redação Diferente) quando NÃO há
// nenhum valor numérico pra comparar (nem percentual, nem R$) — ou seja, o
// algoritmo não tem NENHUM sinal pra saber se a diferença de redação é só
// estilística ou esconde uma diferença substantiva de direitos/obrigações
// (ex.: um lado exige "comunicação prévia por escrito" e o outro não; um lado
// lista uma condição a mais para exercer um direito). Isso é justamente o
// tipo de leitura que só faz sentido com compreensão de texto — não dá pra
// resolver com regex. Esta auditoria roda a IA sobre cada par "Modificada" e
// pede um veredito qualificado: ou confirma que é só forma (mantém
// "Modificada", mas agora com uma leitura confirmada, não só um score de
// similaridade), ou aponta Superior/Inferior/Igual quando encontra diferença
// substantiva que o algoritmo não via.

const MAX_CONTEUDO_AUDITORIA = 1500

function montarPromptAuditoria(itens) {
  const blocos = itens.map((it, i) => `
### ITEM ${i} — ${it.titulo}

TEXTO BASE:
${(it.textoBase || '').slice(0, MAX_CONTEUDO_AUDITORIA)}

TEXTO COMPARADO:
${(it.textoComparado || '').slice(0, MAX_CONTEUDO_AUDITORIA)}`).join('\n')

  return `Você é especialista em direito do trabalho brasileiro, auditando um comparativo automático
entre cláusulas de dois instrumentos/textos (podem ser CCT, ACT, proposta sindical em negociação,
ou registro de prática interna de empresa).

Cada item abaixo foi marcado pelo algoritmo como "redação diferente" porque não encontrou NENHUM
valor numérico (percentual ou R$) para comparar diretamente — a única coisa que o algoritmo sabe é
que o texto é diferente, ele NÃO leu o conteúdo. Sua tarefa é ler os dois textos e verificar se essa
classificação está certa ou se está mascarando algo mais importante:

1) A diferença de redação é só estilística/formal (sinônimos, ordem das palavras, estrutura), sem
   mudança real de direitos, obrigações, prazos ou condições? Se sim, responda status "Modificada"
   mesmo assim — confirma que não há problema.
2) Ou existe uma diferença SUBSTANTIVA que o algoritmo não conseguiu ver por não ter valor numérico
   pra comparar (ex.: uma condição extra que só um lado exige, um direito que só um lado garante,
   uma obrigação mais rigorosa de um lado)? Se sim, responda Superior (BASE mais favorável),
   Inferior (BASE menos favorável) ou Igual (mesma substância, apesar de redação diferente),
   explicando a diferença concreta encontrada.
3) Se o texto não for suficiente pra decidir com segurança, responda "Indeterminado" — não force
   uma conclusão.

ATENÇÃO — CONSISTÊNCIA OBRIGATÓRIA entre "status" e "resumo": "status" é sempre do ponto de
vista do TEXTO BASE, nunca do comparado. Se o seu "resumo" disser que o TEXTO COMPARADO é mais
vantajoso/detalhado/favorável/completo, o "status" tem que ser "Inferior" (a base é PIOR nesse
ponto) — nunca "Superior". Se disser que o TEXTO BASE é mais vantajoso, "status" é "Superior".
Releia sua própria resposta antes de responder: o lado que seu resumo descreve como "melhor" tem
que ser o MESMO lado que o "status" escolhido representa — uma contradição entre os dois é pior
do que responder "Indeterminado".

${blocos}

SAÍDA OBRIGATÓRIA: retorne APENAS um array JSON válido, nenhum texto antes ou depois, sem
markdown. Um item por ITEM acima, na mesma ordem, incluindo o índice:
[{"item":0,"status":"Superior|Inferior|Igual|Modificada|Indeterminado","resumo":"1-2 frases: qual diferença concreta foi encontrada (ou confirmação de que é só forma)"}]`
}

// itensModificados: [{ id, titulo, textoBase, textoComparado }] — vem das
// linhas com status.label === 'Modificada' (Redação Diferente).
// Retorna: [{ id, status, resumo, origemIA:true }] — inclui também os itens
// confirmados como "Modificada" (diferente de refinarVereditosAmbiguos, aqui
// uma confirmação também é um resultado útil: "revisado por IA, é só forma").
// 'Indeterminado' é descartado — a linha permanece como estava, sem selo de IA.
export async function auditarRedacaoDiferente(itensModificados, onProgress = null) {
  if (!itensModificados?.length) return []
  const config = getAIConfig()
  if (!config?.provedor || !config?.chave) {
    throw new Error('Configure um provedor de IA nas Configurações para usar a auditoria assistida.')
  }
  onProgress?.(`Auditando ${itensModificados.length} cláusula(s) "Redação Diferente" com IA...`)
  const prompt = montarPromptAuditoria(itensModificados)
  const raw = await chamarProvedor(config, prompt)
  const respostas = extrairJSON(raw) || []
  const STATUS_VALIDOS = new Set(['Superior', 'Inferior', 'Igual', 'Modificada'])
  const resultado = []
  for (const r of respostas) {
    const item = itensModificados[r?.item]
    if (!item || !STATUS_VALIDOS.has(r.status)) continue
    resultado.push({ id: item.id, status: r.status, resumo: (r.resumo || '').trim(), origemIA: true })
  }
  const divergentes = resultado.filter(r => r.status !== 'Modificada').length
  onProgress?.(resultado.length > 0
    ? `IA revisou ${resultado.length} de ${itensModificados.length} — ${divergentes} com diferença substantiva encontrada.`
    : 'IA não conseguiu concluir a auditoria com segurança.')
  return resultado
}
