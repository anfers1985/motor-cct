// Motor CCT — Pareamento semântico assistido por IA (aba Negociação)
//
// Por quê: o casamento automático de cláusulas entre instrumentos (ver
// matchGrupoNeg em utils/comparacao.js) usa Jaccard sobre título+conteúdo e
// tem um teto estrutural — quando dois documentos tratam do mesmo tema com
// vocabulário muito diferente (ex.: "Banco de Horas" vs "Regime de
// Compensação Horária"), o score do par genuíno fica na mesma faixa de
// ruído de pares coincidentes sem relação nenhuma (ex.: duas cláusulas que
// só compartilham o número ordinal). Baixar o limiar de corte troca um
// falso-negativo por um falso-positivo em outro lugar — não dá pra resolver
// só com regex. Esta função usa a IA já configurada (Configurações) para
// julgar semanticamente APENAS as cláusulas que sobraram sem par (evita
// gastar tokens comparando o documento inteiro de novo).
//
// Reaproveita o mesmo provedor/chave/modelo configurados em
// services/ai/index.js (getAIConfig) e o mesmo despachante de provedor de
// services/ai/chamada.js — usado também por services/ai/superioridade.js.

import { getAIConfig } from './index.js'
import { chamarProvedor, extrairJSON } from './chamada.js'

const MAX_CONTEUDO_PROMPT = 500 // caracteres de conteúdo por cláusula no prompt (suficiente para julgar o tema)

// IMPORTANTE: nunca pedimos para a IA repetir o id real da cláusula (costuma ser
// um UUID do banco). Modelos — sobretudo os mais rápidos/baratos — erram
// reproduzir strings opacas longas com frequência: troca um caractere, corta um
// pedaço. Se isso acontecesse, a comparação exata em aplicarParesSugeridosIA
// falharia e a sugestão seria descartada em silêncio, sem erro nenhum. Por
// isso usamos apelidos curtos e sequenciais (A0, A1, B0...) só para o prompt,
// e traduzimos de volta para o id real no nosso próprio código — a IA nunca
// precisa saber (nem reproduzir) o UUID de verdade.
function montarPrompt(leftoverA, leftoverB) {
  const fmt = (lista, prefixo) => lista.map((c, i) =>
    `[${prefixo}${i}] ${c.titulo}\n${(c.conteudo || '').slice(0, MAX_CONTEUDO_PROMPT)}`
  ).join('\n\n')

  return `Você é especialista em direito do trabalho brasileiro (CCTs e ACTs).

TAREFA: abaixo estão duas listas de cláusulas de dois instrumentos coletivos diferentes que o
pareamento automático por similaridade textual NÃO conseguiu casar (por terem títulos/redação
muito diferentes). Isso NÃO significa que sejam todas exclusivas — algumas tratam do MESMO
tema/obrigação com vocabulário diferente (ex.: "Banco de Horas" e "Regime de Compensação
Horária" são a mesma coisa; "Ajuda de Custo para Refeição" e "Ressarcimento de Despesas com
Alimentação" também podem ser a mesma coisa).

Aponte APENAS os pares em que uma cláusula da LISTA A e uma da LISTA B tratam do MESMO
instituto/obrigação jurídica — mesmo com redação, estrutura ou nome diferentes. NÃO aponte
pares que só tangenciam o mesmo assunto genérico (ex.: duas cláusulas sobre "jornada de
trabalho" só devem ser pareadas se tratarem do MESMO mecanismo específico). Na dúvida, não
pareie — é preferível deixar como exclusiva do que criar um par forçado.

ATENÇÃO A UM ERRO ESPECÍFICO E COMUM: cláusulas de contribuição/taxa sindical usam vocabulário
muito parecido (contribuição, taxa, sindicato, empresa, recolhimento, desconto) mesmo quando são
INSTITUTOS COMPLETAMENTE DIFERENTES. Antes de parear qualquer cláusula desse tipo, confirme que
o BENEFICIÁRIO e o PAGADOR são os mesmos dos dois lados:
- Contribuição/Taxa em favor do SINDICATO PROFISSIONAL (dos empregados/trabalhadores), descontada
  do salário do EMPREGADO — ex.: "Taxa Negocial", "Contribuição Assistencial dos Empregados",
  "Mensalidade Associativa".
- Contribuição em favor do SINDICATO PATRONAL (das empresas), paga pela PRÓPRIA EMPRESA com
  recursos próprios (não descontada de empregado) — ex.: "Contribuição Confederativa Patronal",
  "Contribuição Assistencial Patronal", "Taxa de Contribuição Permanente" (quando paga pela
  empresa ao sindicato patronal).
Essas duas famílias NUNCA são o mesmo instituto, mesmo com vocabulário parecido — palavras como
"categoria econômica"/"patronal" de um lado e "empregados"/"trabalhador" do outro são um sinal
forte de que são famílias diferentes. Se não tiver certeza absoluta de qual sindicato/categoria
cada cláusula beneficia, NÃO pareie.

ATENÇÃO A ITENS CURTOS/FRAGMENTADOS: pautas de reivindicação, rascunhos e textos com OCR
malfeito costumam trazer itens muito curtos e sem contexto (ex.: "PTS 5%", uma sigla solta, um
percentual sem explicação do que se refere). Para esses, NÃO tente adivinhar a que instituto
jurídico o item se refere só pela proximidade de posição/número ou por semelhança superficial de
formato (ex.: "tem um percentual, a cláusula do outro lado também tem um percentual, então deve
ser a mesma coisa" — isso é um raciocínio INVÁLIDO). Só pareie um item curto/fragmentado se o
texto contiver uma palavra-chave que identifique claramente o MESMO instituto da cláusula do
outro lado (ex.: "auxílio combustível" só pareia com cláusula que já fala de combustível). Sem
essa palavra-chave, trate como dado insuficiente e NÃO pareie — é preferível reportar como
"sem previsão"/exclusiva do que inventar uma correlação.

EXEMPLOS REAIS DE ERROS JÁ COMETIDOS — NÃO REPITA:
- ERRADO: parear "Feriados" (pagamento em dobro de horas trabalhadas em feriado) com "Variável
  por Nota Entregue" (remuneração variável por produtividade) com a justificativa de que "ambas
  tratam de remuneração variável ou adicional por desempenho". Isso é um raciocínio genérico
  demais — os institutos são completamente diferentes (um é pagamento de hora trabalhada em dia
  específico; o outro é comissão por produção). Quando a única coisa em comum entre duas
  cláusulas é uma categoria abstrata como "remuneração variável" ou "benefício", isso NÃO é
  suficiente para parear — o mecanismo/gatilho concreto tem que ser o mesmo.
- ERRADO: parear "Taxa Negocial" (desconto do salário do empregado em favor do sindicato
  profissional) com "Contribuição Confederativa Patronal" (contribuição da empresa ao sindicato
  patronal) só porque ambas mencionam "contribuição"/"sindicato"/valores em dinheiro.

Quando a lista A tiver MUITO mais itens do que sobraram na lista B (comum quando se compara um
instrumento completo com uma pauta de reivindicações curta), é NORMAL e ESPERADO que a maioria
dos itens da lista A fique sem par — não é sinal de que algo está errado, e não é motivo para
forçar pareamentos só para "usar" todos os itens da lista B.

Para CADA par que você apontar, avalie sua própria confiança com honestidade: "confianca" deve
ser "alta" (você tem certeza de que é o mesmo instituto jurídico, não uma categoria genérica em
comum), "media" (provável, mas com alguma diferença de mecanismo que vale revisão humana) ou
"baixa" (você não tem certeza — nesse caso, é preferível não incluir o par de jeito nenhum, mas
se ainda assim incluir, marque "baixa" honestamente em vez de omitir a dúvida).

LISTA A:
${fmt(leftoverA, 'A')}

LISTA B:
${fmt(leftoverB, 'B')}

SAÍDA OBRIGATÓRIA: retorne APENAS um array JSON válido, nenhum texto antes ou depois, sem
markdown, sem explicação. Use EXATAMENTE os códigos entre colchetes acima (ex.: "A0", "B3") —
não invente, não reproduza título nem texto. Um item por par identificado (pode ser um array
vazio [] se nenhum par for identificado):
[{"idA":"A0","idB":"B3","motivo":"1 frase curta explicando por que é o mesmo instituto","confianca":"alta"}]`
}

const MARCADORES_PATRONAL = /\bpatronal\b|categoria\s+econ[oô]mica|sindicato\s+(das\s+)?empresas/i
const MARCADORES_PROFISSIONAL = /categoria\s+profissional|sindicato\s+profissional|desconto\s+d[oa]s?\s+sal[aá]rio|do\s+empregado/i

// Trava determinística (não depende da IA seguir instrução): contribuições
// sindicais patronais (pagas pela empresa ao sindicato PATRONAL) e
// profissionais/laborais (descontadas do empregado em favor do sindicato
// PROFISSIONAL) usam vocabulário parecido (contribuição, taxa, sindicato,
// valores) mas NUNCA são o mesmo instituto. A IA já errou esse pareamento
// mais de uma vez mesmo com instrução explícita no prompt — por isso este
// bloqueio roda de qualquer forma, depois da resposta da IA, e nunca deixa
// esse tipo de par passar independente do que o modelo disser.
function familiasIncompativeis(textoA, textoB) {
  const aPatronal = MARCADORES_PATRONAL.test(textoA), aProfissional = MARCADORES_PROFISSIONAL.test(textoA)
  const bPatronal = MARCADORES_PATRONAL.test(textoB), bProfissional = MARCADORES_PROFISSIONAL.test(textoB)
  return (aPatronal && bProfissional && !bPatronal) || (bPatronal && aProfissional && !aPatronal)
}

// Trava determinística nº 2: se o "motivo" da IA afirma que AMBAS as cláusulas
// tratam de percentual (ou de valor monetário), mas uma delas não tem NENHUM
// "%" (ou "R$") no texto, é sinal de alucinação — a IA inventou que aquele
// dado existe do lado que na verdade não tem (caso real confirmado: "ambas
// tratam do adicional noturno, com percentual de 20%" citado para uma
// cláusula que era, na verdade, sobre quadro de avisos e não tinha percentual
// nenhum). Não exige que seja o MESMO número dos dois lados — só que a
// categoria de dado (percentual/monetário) realmente exista nas duas.
function motivoTemNumeroFabricado(motivo, textoA, textoB) {
  if (!motivo) return false
  if (/%/.test(motivo) && !(/%/.test(textoA) && /%/.test(textoB))) return true
  if (/R\$/.test(motivo) && !(/R\$/.test(textoA) && /R\$/.test(textoB))) return true
  return false
}

// leftoverA / leftoverB: arrays de cláusulas { id, titulo, conteudo } que ficaram
// sem par (SUPRIMIDA / NOVA) na comparação por Jaccard.
// Retorna: [{ idA, idB, motivo }]
// NÃO engole erro: se a chamada de rede falhar (HTTP não-OK) ou a chave/provedor
// não estiver configurado, a exceção sobe para quem chamou tratar (a tela
// Negociação já captura isso em try/catch e mostra em setErro). Só o parse da
// resposta em JSON é tolerante a falha (retorna [] se não conseguir extrair).
export async function sugerirParesSemanticos(leftoverA, leftoverB, onProgress = null) {
  if (!leftoverA?.length || !leftoverB?.length) return []
  const config = getAIConfig()
  if (!config?.provedor || !config?.chave) {
    throw new Error('Configure um provedor de IA nas Configurações para usar o pareamento assistido.')
  }
  onProgress?.(`Analisando ${leftoverA.length} + ${leftoverB.length} cláusulas sem par com IA...`)
  const prompt = montarPrompt(leftoverA, leftoverB)
  const raw = await chamarProvedor(config, prompt)
  const bruto = extrairJSON(raw) || []

  // Traduz os apelidos "A0"/"B3" de volta para os ids reais das cláusulas.
  // Se a IA devolver um apelido fora do padrão ou de índice inexistente
  // (alucinação), o item é descartado silenciosamente aqui — não é erro de
  // rede, é resposta malformada, e o comportamento seguro é ignorar.
  const pares = []
  let rejeitadosConfianca = 0, rejeitadosFamilia = 0, rejeitadosNumeroFabricado = 0
  for (const p of bruto) {
    const mA = /^A(\d+)$/.exec(String(p?.idA || '').trim())
    const mB = /^B(\d+)$/.exec(String(p?.idB || '').trim())
    if (!mA || !mB) continue
    const clausulaA = leftoverA[Number(mA[1])]
    const clausulaB = leftoverB[Number(mB[1])]
    if (!clausulaA || !clausulaB) continue
    if (String(p?.confianca || '').toLowerCase() === 'baixa') { rejeitadosConfianca++; continue }
    const textoA = `${clausulaA.titulo} ${clausulaA.conteudo || ''}`
    const textoB = `${clausulaB.titulo} ${clausulaB.conteudo || ''}`
    if (familiasIncompativeis(textoA, textoB)) { rejeitadosFamilia++; continue }
    if (motivoTemNumeroFabricado(p.motivo, textoA, textoB)) { rejeitadosNumeroFabricado++; continue }
    pares.push({ idA: clausulaA.id, idB: clausulaB.id, motivo: p.motivo })
  }

  const avisos = []
  if (rejeitadosConfianca) avisos.push(`${rejeitadosConfianca} descartado(s) por confiança baixa`)
  if (rejeitadosFamilia) avisos.push(`${rejeitadosFamilia} descartado(s) por conflito patronal/profissional`)
  if (rejeitadosNumeroFabricado) avisos.push(`${rejeitadosNumeroFabricado} descartado(s) por número citado no motivo não encontrado no texto`)
  if (pares.length > 0) {
    const porId = new Map([...leftoverA, ...leftoverB].map(c => [c.id, c.titulo]))
    const lista = pares.map(p => `"${porId.get(p.idA) || p.idA}" ↔ "${porId.get(p.idB) || p.idB}"`).join('; ')
    onProgress?.(`IA parou ${pares.length}: ${lista}${avisos.length ? ` (${avisos.join(', ')})` : ''}`)
  } else {
    onProgress?.(`IA não encontrou pareamentos adicionais.${avisos.length ? ` (${avisos.join(', ')})` : ''}`)
  }
  return pares
}
