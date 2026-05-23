// Roteador de provedores de IA
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

const PROMPT_BASE = (texto) => `Você é especialista em direito do trabalho brasileiro com profundo conhecimento em Convenções Coletivas de Trabalho (CCT) e Acordos Coletivos de Trabalho (ACT).

TAREFA: Extraia TODAS as cláusulas do instrumento coletivo abaixo, seguindo rigorosamente as instruções.

INSTRUÇÕES CRÍTICAS:

1. IDENTIFICAÇÃO DE CLÁUSULAS:
   - Cláusulas são identificadas por "CLÁUSULA PRIMEIRA", "CLÁUSULA SEGUNDA", "CLÁUSULA TERCEIRA"... até "CLÁUSULA CENTÉSIMA" ou mais
   - Também aceite numeração ordinal sem a palavra "CLÁUSULA": PRIMEIRA, SEGUNDA, TERCEIRA, etc.
   - NÃO confunda ARTIGOS de adendos/regulamentos (numerados em algarismos arábicos: Art. 1°, Art. 2°, Artigo 1, 1., 2.) com CLÁUSULAS da CCT/ACT
   - Se o documento contiver múltiplos instrumentos (ex: CCT principal + Adendo de Comissão de Conciliação), extraia as cláusulas de TODOS os instrumentos, identificando cada uma corretamente
   - Parágrafos (§1º, §2º, §3º, etc.) NÃO são cláusulas — são parte do conteúdo da cláusula que os contém

2. CONTEÚDO INTEGRAL:
   - O campo "conteudo" deve conter o texto COMPLETO da cláusula, incluindo todos os parágrafos (§), incisos (I, II, III), alíneas (a, b, c) e tabelas que façam parte dela
   - NUNCA resuma, abrevie ou corte o conteúdo
   - Inclua tabelas como texto estruturado (ex: "CARGO | SALÁRIO\\nAuxiliar | R$ 1.664,62")

3. NUMERAÇÃO:
   - Use o número ordinal exato como aparece no documento: "PRIMEIRA", "DÉCIMA SEGUNDA", "QUADRAGÉSIMA TERCEIRA", etc.
   - Se a cláusula não tiver número explícito, use "Não numerada"

4. CLASSIFICAÇÃO (use EXATAMENTE uma das 11 categorias):
   - Remuneração: pisos, reajustes, PLR, adiantamentos, horas extras, prêmios, adicional noturno, insalubridade/periculosidade quando monetária
   - Jornada de Trabalho: banco de horas, escalas, intervalos, controle de jornada, horas extras (regras), sobreaviso, jornada reduzida
   - Benefícios: alimentação, transporte, saúde, odontológico, farmácia, auxílio filho excepcional, auxílio funeral, PAT, pernoite
   - Saúde e Segurança: EPI, CIPA, atestados médicos, condições de trabalho, ergonomia, uniformes
   - Estabilidade e Garantias: gestante, acidentado, pré-aposentadoria, dirigente sindical, CIPEIRO
   - FGTS e Rescisão: verbas rescisórias, homologação, dispensa coletiva, justa causa, carta de referência, contrato de experiência
   - Relações Sindicais: contribuições sindicais, liberação sindical, quadro de avisos, comissão de conciliação, mensalidades, compromissos sindicais
   - Penalidades: multas por descumprimento
   - Capacitação: treinamento, qualificação, educação
   - Igualdade e Diversidade: gênero, raça, PCD, união homoafetiva
   - Disposições Gerais: vigência, abrangência, documentos admissionais, arquivos eletrônicos, condições gerais

5. CAMPOS ESPECIAIS:
   - "valor_monetario": extraia TODOS os valores em R$ mencionados (ex: "R$ 1.664,62; R$ 2.336,97")
   - "percentual": extraia percentuais (ex: "6%", "40%", "50%")
   - "observacoes": escreva uma observação prática de 1-2 frases explicando o impacto/contexto da cláusula para o empregador (ex: "Reajuste obrigatório de 6% para salários até R$5.000. Verificar se já foram concedidas antecipações compensáveis.")

6. FORMATO DE SAÍDA:
   - Retorne SOMENTE um array JSON válido
   - Sem texto antes ou depois, sem markdown, sem crases
   - Comece diretamente com [ e termine com ]
   - Cada objeto deve ter: numero, titulo, conteudo, categoria, subcategoria, valor_monetario, percentual, vigencia_especifica, observacoes

DOCUMENTO:
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

  if (texto.length <= 20000) {
    return await geminiCall(url, texto)
  }

  // Divide em chunks respeitando quebras de cláusula
  const MAX_CHARS = 8000
  const paragrafos = texto.split(/\n+/)
  const chunks = []
  let chunk = ''
  for (const p of paragrafos) {
    if ((chunk + '\n' + p).length > MAX_CHARS && chunk.length > 0) {
      chunks.push(chunk.trim())
      chunk = p
    } else {
      chunk += '\n' + p
    }
  }
  if (chunk.trim()) chunks.push(chunk.trim())

  let todas = []
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processando chunk ${i + 1} de ${chunks.length}...`)
    try {
      const raw = await geminiCall(url, chunks[i])
      const clausulas = parseJSON(raw)
      todas = todas.concat(clausulas)
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 1000))
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
      { type: 'text', text: PROMPT_BASE('(Ver documento PDF anexo acima)') }
    ]
  } else {
    content = PROMPT_BASE(texto)
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
    body: JSON.stringify({ model: config.modelo, message: PROMPT_BASE(texto), temperature: 0.1 })
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
