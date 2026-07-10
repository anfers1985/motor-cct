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
