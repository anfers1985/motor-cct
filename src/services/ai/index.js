// Roteador de provedores de IA
// Lê a configuração salva e despacha para o módulo correto

export const PROVEDORES = {
  gemini: {
    label: 'Google Gemini',
    modelo_padrao: 'gemini-1.5-flash',
    suporta_pdf_nativo: true,
  },
  claude: {
    label: 'Anthropic Claude',
    modelo_padrao: 'claude-haiku-4-5',
    suporta_pdf_nativo: true,
  },
  openai: {
    label: 'OpenAI',
    modelo_padrao: 'gpt-4o-mini',
    suporta_pdf_nativo: false,
  },
  groq: {
    label: 'Groq (Llama)',
    modelo_padrao: 'llama-3.3-70b-versatile',
    suporta_pdf_nativo: false,
  },
  nvidia: {
    label: 'NVIDIA NIM',
    modelo_padrao: 'meta/llama-3.3-70b-instruct',
    suporta_pdf_nativo: false,
  },
  mistral: {
    label: 'Mistral',
    modelo_padrao: 'mistral-small-latest',
    suporta_pdf_nativo: false,
  },
  cohere: {
    label: 'Cohere',
    modelo_padrao: 'command-r',
    suporta_pdf_nativo: false,
  },
}

export function getAIConfig() {
  try {
    const raw = localStorage.getItem('motor_cct_ai_config')
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

export function saveAIConfig(config) {
  localStorage.setItem('motor_cct_ai_config', JSON.stringify(config))
}

const PROMPT_BASE = (texto) => `Você é especialista em direito do trabalho brasileiro. Analise o instrumento coletivo (ACT/CCT) abaixo e extraia TODAS as cláusulas, sem exceção e sem resumir o conteúdo.

Para cada cláusula, retorne um objeto JSON com os campos: numero, titulo, conteudo (texto integral), categoria (use exatamente uma das 11 categorias fornecidas), subcategoria, valor_monetario (se houver, senão string vazia), percentual (se houver, senão string vazia), vigencia_especifica (se diferente da vigência geral, senão string vazia), observacoes (string vazia se não houver).

Retorne SOMENTE um array JSON válido. Sem texto antes, sem markdown, sem explicações.

Categorias permitidas: Remuneração, Jornada de Trabalho, Benefícios, Saúde e Segurança, Estabilidade e Garantias, FGTS e Rescisão, Relações Sindicais, Penalidades, Capacitação, Igualdade e Diversidade, Disposições Gerais.

DOCUMENTO:
${texto}`

async function callGemini(config, texto) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.modelo}:generateContent?key=${config.chave}`
  
  // Divide o texto em chunks de ~15000 caracteres se for muito grande
  const MAX_CHARS = 15000
  const chunks = []
  if (texto.length > MAX_CHARS) {
    // Divide por parágrafos para não cortar no meio de uma cláusula
    const paragrafos = texto.split(/\n{2,}/)
    let chunk = ''
    for (const p of paragrafos) {
      if ((chunk + p).length > MAX_CHARS && chunk.length > 0) {
        chunks.push(chunk)
        chunk = p
      } else {
        chunk += '\n\n' + p
      }
    }
    if (chunk) chunks.push(chunk)
  } else {
    chunks.push(texto)
  }

  // Processa cada chunk e junta os resultados
  let todasClausulas = []
  for (const chunk of chunks) {
    const body = {
      contents: [{ parts: [{ text: PROMPT_BASE(chunk) }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 65536 }
    }
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
    const data = await res.json()
    const parts = data.candidates?.[0]?.content?.parts || []
    const texts = parts.map(p => p.text || '').filter(Boolean)
    const raw = texts[texts.length - 1] || ''
    try {
      const clausulas = parseJSON(raw)
      todasClausulas = todasClausulas.concat(clausulas)
    } catch(e) {
      console.warn('Chunk ignorado por erro de parse:', e.message)
    }
  }
  
  if (todasClausulas.length === 0) throw new Error('Nenhuma cláusula extraída')
  return JSON.stringify(todasClausulas)
}

async function callClaude(config, texto, isPDF, pdfBase64) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.chave,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
  let content
  if (isPDF && pdfBase64) {
    content = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
      { type: 'text', text: PROMPT_BASE('(Ver documento PDF anexo acima)') }
    ]
  } else {
    content = PROMPT_BASE(texto)
  }
  const body = {
    model: config.modelo,
    max_tokens: 8192,
    messages: [{ role: 'user', content }]
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers, body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

async function callOpenAICompat(config, texto, endpoint) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.chave}` },
    body: JSON.stringify({
      model: config.modelo,
      messages: [{ role: 'user', content: PROMPT_BASE(texto) }],
      temperature: 0.1,
      max_tokens: 8192,
    })
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callCohere(config, texto) {
  const res = await fetch('https://api.cohere.ai/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.chave}` },
    body: JSON.stringify({
      model: config.modelo,
      message: PROMPT_BASE(texto),
      temperature: 0.1,
    })
  })
  if (!res.ok) throw new Error(`Cohere ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.text || ''
}

function parseJSON(raw) {
  let text = (raw || '').trim()
  // Remove markdown fences de qualquer posição
  text = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  // Encontra o array JSON
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Resposta da IA não contém array JSON válido')
  }
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch(e) {
    // Tenta corrigir JSON truncado adicionando fechamento
    try {
      let truncado = text.slice(start)
      // Fecha objetos e array abertos
      const opens = (truncado.match(/\{/g) || []).length
      const closes = (truncado.match(/\}/g) || []).length
      for (let i = 0; i < opens - closes; i++) truncado += '}'
      if (!truncado.trim().endsWith(']')) truncado += ']'
      return JSON.parse(truncado)
    } catch(e2) {
      throw new Error('Resposta da IA não contém array JSON válido')
    }
  }
}
export async function extrairClausulas(texto, { isPDF = false, pdfBase64 = null } = {}) {
  const config = getAIConfig()
  if (!config?.provedor || !config?.chave) {
    throw new Error('Configure um provedor de IA nas Configurações antes de extrair cláusulas.')
  }

  let raw = ''
  switch (config.provedor) {
    case 'gemini':
      raw = await callGemini(config, texto)
      break
    case 'claude':
      raw = await callClaude(config, texto, isPDF, pdfBase64)
      break
    case 'openai':
      raw = await callOpenAICompat(config, texto, 'https://api.openai.com/v1/chat/completions')
      break
    case 'groq':
      raw = await callOpenAICompat(config, texto, 'https://api.groq.com/openai/v1/chat/completions')
      break
    case 'nvidia':
      raw = await callOpenAICompat(config, texto, 'https://integrate.api.nvidia.com/v1/chat/completions')
      break
    case 'mistral':
      raw = await callOpenAICompat(config, texto, 'https://api.mistral.ai/v1/chat/completions')
      break
    case 'cohere':
      raw = await callCohere(config, texto)
      break
    default:
      throw new Error(`Provedor desconhecido: ${config.provedor}`)
  }

  return parseJSON(raw)
}

export async function testarConexao(config) {
  const testPrompt = 'Responda apenas com o número 42.'
  const mock = { ...config }
  try {
    switch (config.provedor) {
      case 'gemini': {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.modelo}:generateContent?key=${config.chave}`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: testPrompt }] }] })
        })
        if (!res.ok) throw new Error(`${res.status}`)
        return { ok: true }
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
          body: JSON.stringify({ model: config.modelo, max_tokens: 10, messages: [{ role: 'user', content: testPrompt }] })
        })
        if (!res.ok) throw new Error(`${res.status}`)
        return { ok: true }
      }
      case 'openai':
        await callOpenAICompat(mock, testPrompt, 'https://api.openai.com/v1/chat/completions')
        return { ok: true }
      case 'groq':
        await callOpenAICompat(mock, testPrompt, 'https://api.groq.com/openai/v1/chat/completions')
        return { ok: true }
      case 'nvidia':
        await callOpenAICompat(mock, testPrompt, 'https://integrate.api.nvidia.com/v1/chat/completions')
        return { ok: true }
      case 'mistral':
        await callOpenAICompat(mock, testPrompt, 'https://api.mistral.ai/v1/chat/completions')
        return { ok: true }
      case 'cohere':
        await callCohere(mock, testPrompt)
        return { ok: true }
      default:
        throw new Error('Provedor desconhecido')
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
