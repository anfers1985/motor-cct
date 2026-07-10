// Motor CCT — Chamada genérica a um provedor de IA com prompt arbitrário
//
// Fatorado de services/ai/pareamento.js para ser reaproveitado também por
// services/ai/superioridade.js (refinamento de vereditos ambíguos), evitando
// duplicar a lógica de despacho por provedor duas vezes.
//
// IMPORTANTE: lança exceção (não engole) em qualquer resposta HTTP não-OK de
// qualquer provedor — quem chama esta função é responsável por capturar o
// erro (try/catch) se quiser tratar falha de rede/autenticação sem propagar.

export async function chamarProvedor(config, prompt) {
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

// Extrai o primeiro array ou objeto JSON válido de uma resposta de texto,
// tolerando cercas de markdown (```json ... ```) e texto antes/depois.
export function extrairJSON(raw) {
  const text = (raw || '').trim().replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const aberturas = { '[': ']', '{': '}' }
  const primeiroChar = [...text].find(c => c === '[' || c === '{')
  if (!primeiroChar) return null
  const inicio = text.indexOf(primeiroChar)
  const fechamento = aberturas[primeiroChar]
  const fim = text.lastIndexOf(fechamento)
  if (fim <= inicio) return null
  try {
    return JSON.parse(text.slice(inicio, fim + 1))
  } catch {
    return null
  }
}
