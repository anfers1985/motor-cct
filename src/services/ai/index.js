// Roteador de provedores de IA — Motor CCT
export const PROVEDORES = {
  gemini: { label: 'Google Gemini', modelo_padrao: 'gemini-2.0-flash', suporta_pdf_nativo: true },
  claude: { label: 'Anthropic Claude', modelo_padrao: 'claude-haiku-4-5', suporta_pdf_nativo: true },
  openai: { label: 'OpenAI', modelo_padrao: 'gpt-4o-mini', suporta_pdf_nativo: false },
  groq: { label: 'Groq (Llama)', modelo_padrao: 'llama-3.3-70b-versatile', suporta_pdf_nativo: false },
  nvidia: { label: 'NVIDIA NIM', modelo_padrao: 'meta/llama-3.3-70b-instruct', suporta_pdf_nativo: false },
  mistral: { label: 'Mistral', modelo_padrao: 'mistral-small-latest', suporta_pdf_nativo: false },
  cohere: { label: 'Cohere', modelo_padrao: 'command-r', suporta_pdf_nativo: false },
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

const PROMPT_BASE = (texto) => `Você é especialista em direito do trabalho brasileiro com profundo conhecimento em CCT e ACT.

TAREFA: Extraia TODAS as cláusulas do trecho de instrumento coletivo abaixo.

REGRAS OBRIGATÓRIAS:

1. IDENTIFICAR CLÁUSULAS:
   - Cláusulas são identificadas por "CLÁUSULA PRIMEIRA", "CLÁUSULA SEGUNDA" ... "CLÁUSULA SEXAGÉSIMA QUINTA" etc.
   - Também "CLÁUSULA 1a", "CLÁUSULA 2a" (do adendo CCP) são cláusulas válidas
   - Parágrafos (§1º, §2º) e incisos (I, II, III) NÃO são cláusulas separadas — são parte do conteúdo da cláusula

2. CONTEÚDO INTEGRAL OBRIGATÓRIO:
   - Copie o texto COMPLETO de cada cláusula, incluindo todos os §§, incisos, alíneas e tabelas
   - NUNCA resuma, nunca abrevie, nunca corte
   - Se houver tabela de salários/valores, inclua como texto: "CARGO | VALOR\nAuxiliar | R$ 1.664,62"

3. NUMERAÇÃO: use o ordinal exato: "PRIMEIRA", "DÉCIMA SEGUNDA", "1a", "2a" etc.

4. CATEGORIAS (use exatamente uma):
   Remuneração | Jornada de Trabalho | Benefícios | Saúde e Segurança | Estabilidade e Garantias | FGTS e Rescisão | Relações Sindicais | Penalidades | Capacitação | Igualdade e Diversidade | Disposições Gerais

5. SUBCATEGORIA: use uma subcategoria específica e descritiva (ex: "Piso Salarial", "PLR", "Horas Extras", "CIPA")

6. OBSERVAÇÕES: escreva 1-2 frases sobre o impacto prático para o empregador/RH

7. SAÍDA: array JSON válido apenas. Sem markdown, sem texto antes ou depois.
   Campos: numero, titulo, conteudo, categoria, subcategoria, valor_monetario, percentual, vigencia_especifica, observacoes

TRECHO DO DOCUMENTO:
${texto}`

function parseJSON(raw) {
  let text = (raw || '').trim()
  text = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Resposta da IA não contém array JSON válido')
  }
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch(e) {
    try {
      let t = text.slice(start)
      const opens = (t.match(/\{/g) || []).length
      const closes = (t.match(/\}/g) || []).length
      for (let i = 0; i < opens - closes; i++) t += '}'
      if (!t.trim().endsWith(']')) t += ']'
      return JSON.parse(t)
    } catch(e2) {
      throw new Error('Resposta da IA não contém array JSON válido')
    }
  }
}

// Pré-processa o texto inserindo quebras antes de cada CLÁUSULA
function preProcessarTexto(texto) {
  return texto.replace(
    /(CLÁUSULA\s+(?:[A-ZÁÉÍÓÚÃÕÂÊÔÀÇ\d]+(?:[aº°]|\s+[A-ZÁÉÍÓÚÃÕÂÊÔÀÇ]+)*\s*[-–—]))/g,
    '\n\n$1'
  ).trim()
}

// Divide o texto em chunks respeitando as bordas das cláusulas
function dividirEmChunks(texto, maxChars = 12000) {
  const processado = preProcessarTexto(texto)
  // Divide no início de cada CLÁUSULA
  const blocos = processado.split(/(?=\n\nCLÁUSULA\s+)/)
  const chunks = []
  let chunkAtual = ''
  for (const bloco of blocos) {
    if (chunkAtual.length + bloco.length > maxChars && chunkAtual.length > 0) {
      chunks.push(chunkAtual.trim())
      chunkAtual = bloco
    } else {
      chunkAtual += bloco
    }
  }
  if (chunkAtual.trim()) chunks.push(chunkAtual.trim())
  return chunks
}

async function geminiCall(url, texto) {
  const body = {
    contents: [{ parts: [{ text: PROMPT_BASE(texto) }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 65536 }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const parts = data.candidates?.[0]?.content?.parts || []
  const texts = parts.map(p => p.text || '').filter(Boolean)
  return texts[texts.length - 1] || ''
}

async function callGemini(config, texto) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.modelo}:generateContent?key=${config.chave}`

  // Se o texto for pequeno, processa direto
  if (texto.length <= 12000) {
    return await geminiCall(url, preProcessarTexto(texto))
  }

  // Divide em chunks respeitando bordas de cláusulas
  const chunks = dividirEmChunks(texto)
  console.log(`Dividindo em ${chunks.length} chunks...`)

  let todas = []
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processando chunk ${i + 1} de ${chunks.length} (${chunks[i].length} chars)...`)
    try {
      const raw = await geminiCall(url, chunks[i])
      const clausulas = parseJSON(raw)
      console.log(`  Chunk ${i + 1}: ${clausulas.length} cláusulas extraídas`)
      todas = todas.concat(clausulas)
      // Pausa entre chunks para não exceder rate limit
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 2000))
    } catch(e) {
      console.warn(`Chunk ${i + 1} falhou:`, e.message)
    }
  }

  if (todas.length === 0) throw new Error('Nenhuma cláusula extraída')
  return JSON.stringify(todas)
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
      { type: 'text', text: PROMPT_BASE('(Ver documento PDF anexo acima — extraia TODAS as cláusulas com conteúdo integral)') }
    ]
  } else {
    content = PROMPT_BASE(preProcessarTexto(texto))
  }
  const body = { model: config.modelo, max_tokens: 8192, messages: [{ role: 'user', content }] }
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
      messages: [{ role: 'user', content: PROMPT_BASE(preProcessarTexto(texto)) }],
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
    body: JSON.stringify({ model: config.modelo, message: PROMPT_BASE(preProcessarTexto(texto)), temperature: 0.1 })
  })
  if (!res.ok) throw new Error(`Cohere ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.text || ''
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
        await callOpenAICompat(config, testPrompt, 'https://api.openai.com/v1/chat/completions')
        return { ok: true }
      case 'groq':
        await callOpenAICompat(config, testPrompt, 'https://api.groq.com/openai/v1/chat/completions')
        return { ok: true }
      case 'nvidia':
        await callOpenAICompat(config, testPrompt, 'https://integrate.api.nvidia.com/v1/chat/completions')
        return { ok: true }
      case 'mistral':
        await callOpenAICompat(config, testPrompt, 'https://api.mistral.ai/v1/chat/completions')
        return { ok: true }
      case 'cohere':
        await callCohere(config, testPrompt)
        return { ok: true }
      default:
        throw new Error('Provedor desconhecido')
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
