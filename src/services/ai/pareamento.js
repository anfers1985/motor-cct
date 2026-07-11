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

LISTA A:
${fmt(leftoverA, 'A')}

LISTA B:
${fmt(leftoverB, 'B')}

SAÍDA OBRIGATÓRIA: retorne APENAS um array JSON válido, nenhum texto antes ou depois, sem
markdown, sem explicação. Use EXATAMENTE os códigos entre colchetes acima (ex.: "A0", "B3") —
não invente, não reproduza título nem texto. Um item por par identificado (pode ser um array
vazio [] se nenhum par for identificado):
[{"idA":"A0","idB":"B3","motivo":"1 frase curta explicando por que é o mesmo instituto"}]`
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
  for (const p of bruto) {
    const mA = /^A(\d+)$/.exec(String(p?.idA || '').trim())
    const mB = /^B(\d+)$/.exec(String(p?.idB || '').trim())
    if (!mA || !mB) continue
    const clausulaA = leftoverA[Number(mA[1])]
    const clausulaB = leftoverB[Number(mB[1])]
    if (!clausulaA || !clausulaB) continue
    pares.push({ idA: clausulaA.id, idB: clausulaB.id, motivo: p.motivo })
  }

  if (pares.length > 0) {
    const porId = new Map([...leftoverA, ...leftoverB].map(c => [c.id, c.titulo]))
    const lista = pares.map(p => `"${porId.get(p.idA) || p.idA}" ↔ "${porId.get(p.idB) || p.idB}"`).join('; ')
    onProgress?.(`IA parou ${pares.length}: ${lista}`)
  } else {
    onProgress?.('IA não encontrou pareamentos adicionais.')
  }
  return pares
}
