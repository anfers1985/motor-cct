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
// services/ai/index.js (getAIConfig), mas com um prompt próprio — as
// funções de chamada aqui são independentes das usadas em extrairClausulas
// para não haver risco de regressão na extração.

import { getAIConfig } from './index.js'

const MAX_CONTEUDO_PROMPT = 500 // caracteres de conteúdo por cláusula no prompt (suficiente para julgar o tema)

function montarPrompt(leftoverA, leftoverB) {
  const fmt = (lista, rotulo) => lista.map(c =>
    `[${rotulo}:${c.id}] ${c.titulo}\n${(c.conteudo || '').slice(0, MAX_CONTEUDO_PROMPT)}`
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
markdown, sem explicação. Um item por par identificado (pode ser um array vazio [] se nenhum
par for identificado):
[{"idA":"<id exato da LISTA A>","idB":"<id exato da LISTA B>","motivo":"1 frase curta explicando por que é o mesmo instituto"}]`
}

function parseParesJSON(raw) {
  let text = (raw || '').trim().replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const inicio = text.indexOf('[')
  const fim = text.lastIndexOf(']')
  if (inicio === -1 || fim <= inicio) return []
  try {
    const arr = JSON.parse(text.slice(inicio, fim + 1))
    return Array.isArray(arr) ? arr.filter(p => p && p.idA && p.idB) : []
  } catch {
    return []
  }
}

async function chamarProvedor(config, prompt) {
  switch (config.provedor) {
    case 'gemini': {
      const isThinking = config.modelo.includes('2.5') || config.modelo.includes('thinking')
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.modelo}:generateContent?key=${config.chave}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            ...(isThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          }
        })
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e?.error?.message || `Gemini erro ${res.status}`)
      }
      const data = await res.json()
      return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || ''
    }
    case 'claude': {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.chave,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: config.modelo, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] })
      })
      if (!res.ok) throw new Error(`Claude erro ${res.status}: ${await res.text()}`)
      const data = await res.json()
      return data.content?.[0]?.text || ''
    }
    case 'openai':
    case 'groq':
    case 'nvidia':
    case 'mistral': {
      const endpoints = {
        openai: 'https://api.openai.com/v1/chat/completions',
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
        mistral: 'https://api.mistral.ai/v1/chat/completions',
      }
      const res = await fetch(endpoints[config.provedor], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.chave}` },
        body: JSON.stringify({ model: config.modelo, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 4096 })
      })
      if (!res.ok) throw new Error(`${config.provedor} erro ${res.status}: ${await res.text()}`)
      const data = await res.json()
      return data.choices?.[0]?.message?.content || ''
    }
    case 'cohere': {
      const res = await fetch('https://api.cohere.ai/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.chave}` },
        body: JSON.stringify({ model: config.modelo, message: prompt, temperature: 0.1 })
      })
      if (!res.ok) throw new Error(`Cohere erro ${res.status}: ${await res.text()}`)
      const data = await res.json()
      return data.text || ''
    }
    default:
      throw new Error(`Provedor desconhecido: ${config.provedor}`)
  }
}

// leftoverA / leftoverB: arrays de cláusulas { id, titulo, conteudo } que ficaram
// sem par (SUPRIMIDA / NOVA) na comparação por Jaccard.
// Retorna: [{ idA, idB, motivo }]  — nunca lança para cima de erro de rede/parse
// isolado (é um refinamento opcional; se falhar, o resultado por Jaccard continua
// valendo). onProgress é opcional, para mostrar status na UI.
export async function sugerirParesSemanticos(leftoverA, leftoverB, onProgress = null) {
  if (!leftoverA?.length || !leftoverB?.length) return []
  const config = getAIConfig()
  if (!config?.provedor || !config?.chave) {
    throw new Error('Configure um provedor de IA nas Configurações para usar o pareamento assistido.')
  }
  onProgress?.(`Analisando ${leftoverA.length} + ${leftoverB.length} cláusulas sem par com IA...`)
  const prompt = montarPrompt(leftoverA, leftoverB)
  const raw = await chamarProvedor(config, prompt)
  const pares = parseParesJSON(raw)
  onProgress?.(pares.length > 0
    ? `IA sugeriu ${pares.length} pareamento(s) adicional(is).`
    : 'IA não encontrou pareamentos adicionais.')
  return pares
}
