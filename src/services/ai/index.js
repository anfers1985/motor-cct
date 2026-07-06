// Motor CCT — Roteador de provedores de IA
// v1.5.1 — Fix: erros visíveis, suporte gemini-2.5-flash (thinking), callback de progresso
// v1.6 — Taxonomia de categorias/subcategorias ampliada + normalização automática da
//        classificação retornada pela IA + suporte a múltiplas classificações por cláusula

import { CATEGORIAS, classificar } from '../../utils/categorias'

export const PROVEDORES = {
  gemini: { label: 'Google Gemini', modelo_padrao: 'gemini-2.5-flash', suporta_pdf_nativo: true },
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

// Monta o bloco "CATEGORIA → subcategorias" a partir da taxonomia canônica única
// (utils/categorias.js), garantindo que o prompt nunca fique dessincronizado do
// vocabulário usado no resto da aplicação (dropdowns, filtros, relatórios).
const VOCABULARIO_TAXONOMIA = Object.entries(CATEGORIAS)
  .map(([categoria, subcats]) => `• ${categoria}:\n  ${subcats.join(' | ')}`)
  .join('\n\n')

const PROMPT_BASE = (texto) => `Você é especialista em direito do trabalho brasileiro com profundo conhecimento em CCT, ACT, práticas internas e propostas sindicais.

TAREFA: Extraia TODAS as cláusulas do trecho de instrumento coletivo abaixo.

REGRAS OBRIGATÓRIAS:

1. IDENTIFICAR CLÁUSULAS:
   - Cláusulas são identificadas por "CLÁUSULA PRIMEIRA", "CLÁUSULA SEGUNDA", "CLÁUSULA DÉCIMA" etc.
   - Também "CLÁUSULA 1a", "CLÁUSULA 2a" (do adendo CCP) são cláusulas válidas
   - Parágrafos (§1º, §2º) e incisos (I, II, III) NÃO são cláusulas — são parte do conteúdo

2. CONTEÚDO INTEGRAL OBRIGATÓRIO:
   - Copie o texto COMPLETO de cada cláusula, incluindo todos os §§, incisos, alíneas e tabelas
   - NUNCA resuma, nunca abrevie, nunca corte
   - Se houver tabela de salários/valores, inclua como texto: "CARGO | VALOR\\nAuxiliar | R$ 1.664,62"

3. NUMERAÇÃO: use o ordinal exato: "PRIMEIRA", "DÉCIMA SEGUNDA", "1a", "2a" etc.

4. CLASSIFICAÇÃO (categoria + subcategoria) — USE SOMENTE O VOCABULÁRIO CONTROLADO ABAIXO.
   NUNCA invente uma categoria ou subcategoria nova, nunca crie variações de grafia
   (singular/plural, com/sem hífen, sinônimos). Se nenhuma opção encaixar perfeitamente,
   escolha a mais próxima semanticamente — nunca deixe em branco e nunca escreva um texto
   fora da lista.

   Vocabulário controlado (categoria → subcategorias válidas):
${VOCABULARIO_TAXONOMIA}

5. CLASSIFICAÇÃO MÚLTIPLA (quando a cláusula trata de mais de um tema central):
   - Preencha "categoria"/"subcategoria" com a classificação PRINCIPAL (o tema predominante).
   - Se — e somente se — a cláusula tratar substantivamente de outro tema além do principal
     (não uma menção de passagem), adicione esse(s) tema(s) extra em "categorias_adicionais",
     usando o MESMO vocabulário controlado acima. Use no máximo 2 itens em
     "categorias_adicionais". Na dúvida, não adicione — prefira deixar só a principal.
   - Exemplo: uma cláusula que reajusta o vale-transporte E também trata de contribuição
     assistencial deve ter categoria/subcategoria principal = Benefícios/Vale-Transporte, e
     categorias_adicionais = [{"categoria":"Relações Sindicais e Representação","subcategoria":"Contribuição Assistencial"}]

6. OBSERVAÇÕES: escreva 1-2 frases sobre o impacto prático para o empregador/RH

7. SAÍDA OBRIGATÓRIA: retorne APENAS um array JSON válido. Absolutamente nenhum texto antes ou depois. Sem markdown. Sem explicações.
   Formato: [{"numero":"PRIMEIRA","titulo":"...","conteudo":"...","categoria":"...","subcategoria":"...","categorias_adicionais":[],"valor_monetario":null,"percentual":null,"vigencia_especifica":null,"observacoes":"..."},...]

TRECHO DO DOCUMENTO:
${texto}`

// Extrai JSON de forma robusta da resposta da IA
function parseJSON(raw) {
  let text = (raw || '').trim()
  // Remove fences markdown
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

  // O array de saida SEMPRE comeca no primeiro '[' da resposta (o modelo ja
  // vem sem texto de raciocinio -- isso e filtrado antes, em geminiCallRaw).
  // Antes usava-se o ULTIMO '[' pensando em pular raciocinio de modelos
  // "thinking", o que causava um bug: uma clausula com
  // "categorias_adicionais": [] perto do fim da resposta tinha seu '['
  // escolhido como inicio do array, gerando uma fatia invalida a partir do
  // meio de um objeto.
  const primeiro = text.indexOf('[')
  if (primeiro === -1) {
    throw new Error(`Resposta da IA não contém JSON válido. Início da resposta: "${text.slice(0, 300)}"`)
  }

  // 1) Tentativa direta: da primeira '[' até a última ']' de todo o texto.
  //    Cobre o caso normal (resposta completa e bem formada).
  const ultimoFecha = text.lastIndexOf(']')
  if (ultimoFecha > primeiro) {
    try { return JSON.parse(text.slice(primeiro, ultimoFecha + 1)) } catch {}
  }

  // 2) Reparo de truncamento real: em vez de cortar pela última ']' do texto
  //    (que pode ser de um array interno vazio e ficar ANTES do fechamento do
  //    objeto atual, zerando tudo), usa-se todo o restante a partir do '[' e
  //    corta no último "}" completo — ou seja, no fim da última cláusula
  //    íntegra — descartando só a cláusula incompleta do final.
  const restante = text.slice(primeiro).replace(/,\s*$/, '')
  const ultimoFechamentoObjeto = restante.lastIndexOf('}')
  if (ultimoFechamentoObjeto !== -1) {
    let reparado = restante.slice(0, ultimoFechamentoObjeto + 1)
    if (!reparado.trim().endsWith(']')) reparado += ']'
    try { return JSON.parse(reparado) } catch {}
  }

  throw new Error(`JSON inválido na resposta da IA. Início da resposta: "${text.slice(primeiro, primeiro + 300)}"`)
}

// Normaliza a(s) classificação(ões) de cada cláusula retornada pela IA contra a taxonomia
// canônica (utils/categorias.js). É a última barreira de defesa antes da tela de revisão:
// mesmo que o provedor de IA não siga o vocabulário controlado à risca, o texto que chega
// no modal de revisão já vem padronizado. Cláusulas cuja subcategoria não seja reconhecível
// ficam com categoria/subcategoria vazias (o modal já sinaliza isso visualmente) em vez de
// entrar no banco com um rótulo inventado.
function normalizarClausulas(lista) {
  return (lista || []).map(c => {
    const principal = classificar(c.categoria, c.subcategoria)
    const adicionais = (c.categorias_adicionais || [])
      .map(a => classificar(a.categoria, a.subcategoria))
      .filter(Boolean)
      // remove duplicatas e qualquer item igual à classificação principal
      .filter((a, i, arr) =>
        !(principal && a.categoria === principal.categoria && a.subcategoria === principal.subcategoria) &&
        arr.findIndex(x => x.categoria === a.categoria && x.subcategoria === a.subcategoria) === i
      )
    return {
      ...c,
      categoria: principal?.categoria || '',
      subcategoria: principal?.subcategoria || '',
      categorias_adicionais: adicionais,
    }
  })
}

// Pré-processa texto inserindo \n\n antes de cada CLÁUSULA
function preProcessarTexto(texto) {
  return texto.replace(
    /(CL[AÁ]USULA\s+(?:[A-ZÁÉÍÓÚÃÕÂÊÔÀÇ0-9]+[aº°]?\s*[-–—]|\d+[aº°]\s*[-–—]))/gi,
    '\n\n$1'
  ).trim()
}

// Divide texto em chunks sempre começando numa CLÁUSULA
function dividirEmChunks(texto, maxChars = 12000) {
  const processado = preProcessarTexto(texto)
  const blocos = processado.split(/(?=\n\nCL[AÁ]USULA\s)/i)
  const chunks = []
  let atual = ''
  for (const bloco of blocos) {
    if (atual.length + bloco.length > maxChars && atual.length > 0) {
      chunks.push(atual.trim())
      atual = bloco
    } else {
      atual += bloco
    }
  }
  if (atual.trim()) chunks.push(atual.trim())
  return chunks.length > 0 ? chunks : [processado.trim()]
}

// Executa uma chamada com retry automático (até 3 tentativas) e backoff para rate limit
async function comRetry(fn, tentativas = 3, onProgress = null, label = '') {
  for (let t = 1; t <= tentativas; t++) {
    try {
      return await fn()
    } catch (e) {
      const isRateLimit = e.message.includes('429') || e.message.toLowerCase().includes('quota') || e.message.toLowerCase().includes('rate')
      const isServidor = e.message.includes('500') || e.message.includes('503')
      const podeRetry = (isRateLimit || isServidor) && t < tentativas

      if (podeRetry) {
        // Rate limit: espera crescente — 30s, 60s
        const espera = isRateLimit ? (t === 1 ? 30000 : 60000) : 5000
        onProgress?.(`⚠️ ${label} — ${isRateLimit ? 'Limite da API atingido' : 'Erro temporário'}. Aguardando ${espera / 1000}s (tentativa ${t}/${tentativas})...`)
        await new Promise(r => setTimeout(r, espera))
      } else {
        throw e
      }
    }
  }
}

// Processa chunks com progresso visível, retry e erros informativos
async function processarEmChunks(texto, callFn, pausaMs = 3000, onProgress = null) {
  if (texto.length <= 12000) {
    onProgress?.('Enviando para IA (1 bloco)...')
    const raw = await comRetry(() => callFn(preProcessarTexto(texto)), 3, onProgress, 'Bloco único')
    const result = parseJSON(raw)
    onProgress?.(`✅ ${result.length} cláusulas extraídas`)
    return result
  }

  const chunks = dividirEmChunks(texto)
  onProgress?.(`Documento dividido em ${chunks.length} blocos para extração completa...`)

  let todas = []
  let primeiroErro = null

  for (let i = 0; i < chunks.length; i++) {
    const label = `Bloco ${i + 1}/${chunks.length}`
    onProgress?.(`Processando ${label}...`)
    try {
      const raw = await comRetry(() => callFn(chunks[i]), 3, onProgress, label)
      const clausulas = parseJSON(raw)
      todas = todas.concat(clausulas)
      onProgress?.(`${label}: ${clausulas.length} cláusulas — total: ${todas.length}`)
      if (i < chunks.length - 1) {
        onProgress?.(`Pausa de ${pausaMs / 1000}s antes do próximo bloco...`)
        await new Promise(r => setTimeout(r, pausaMs))
      }
    } catch (e) {
      console.warn(`Chunk ${i + 1} falhou definitivamente:`, e.message)
      if (!primeiroErro) primeiroErro = e
      onProgress?.(`❌ ${label} falhou: ${e.message.slice(0, 120)}`)
    }
  }

  if (todas.length === 0) {
    throw primeiroErro || new Error('Nenhuma cláusula extraída. Verifique sua chave de API nas Configurações.')
  }
  return todas
}

// ─── GEMINI ────────────────────────────────────────────────────────────────────
async function geminiCallRaw(url, texto, isThinkingModel) {
  const body = {
    contents: [{ parts: [{ text: PROMPT_BASE(texto) }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      // Para modelos thinking (gemini-2.5-x): desativa thinking para evitar consumo de tokens
      ...(isThinkingModel ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const errText = await res.text()
    let msg = `Gemini erro ${res.status}`
    try {
      const errJson = JSON.parse(errText)
      msg = errJson?.error?.message || msg
    } catch {}
    throw new Error(msg)
  }
  const data = await res.json()
  // Gemini 2.5+ retorna partes de thinking + texto — pega apenas o texto final
  const parts = data.candidates?.[0]?.content?.parts || []
  // Filtra partes que não são thinking (sem propriedade 'thought: true')
  const textParts = parts.filter(p => !p.thought && p.text)
  if (textParts.length > 0) return textParts[textParts.length - 1].text
  // Fallback: última parte com texto
  const allText = parts.map(p => p.text || '').filter(Boolean)
  return allText[allText.length - 1] || ''
}

async function callGemini(config, texto, onProgress) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.modelo}:generateContent?key=${config.chave}`
  const isThinkingModel = config.modelo.includes('2.5') || config.modelo.includes('thinking')
  return processarEmChunks(
    texto,
    (chunk) => geminiCallRaw(url, chunk, isThinkingModel),
    3000,
    onProgress
  )
}

// ─── CLAUDE ────────────────────────────────────────────────────────────────────
async function claudeCallRaw(config, texto) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.chave,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.modelo,
      max_tokens: 8192,
      messages: [{ role: 'user', content: PROMPT_BASE(texto) }]
    })
  })
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

async function callClaude(config, texto, isPDF, pdfBase64, onProgress) {
  if (isPDF && pdfBase64) {
    onProgress?.('Enviando PDF para o Claude...')
    const content = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
      { type: 'text', text: PROMPT_BASE('(Ver documento PDF anexo — extraia TODAS as cláusulas com conteúdo integral)') }
    ]
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.chave,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: config.modelo, max_tokens: 8192, messages: [{ role: 'user', content }] })
    })
    if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`)
    const data = await res.json()
    return parseJSON(data.content?.[0]?.text || '')
  }
  return processarEmChunks(texto, (chunk) => claudeCallRaw(config, chunk), 1500, onProgress)
}

// ─── OPENAI COMPAT ────────────────────────────────────────────────────────────
async function openAICompatCallRaw(config, texto, endpoint) {
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
  if (!res.ok) {
    const errText = await res.text()
    let msg = `API erro ${res.status}`
    try { msg = JSON.parse(errText)?.error?.message || msg } catch {}
    throw new Error(msg)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callOpenAICompat(config, texto, endpoint, onProgress) {
  return processarEmChunks(texto, (chunk) => openAICompatCallRaw(config, chunk, endpoint), 2000, onProgress)
}

// ─── COHERE ───────────────────────────────────────────────────────────────────
async function cohereCallRaw(config, texto) {
  const res = await fetch('https://api.cohere.ai/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.chave}` },
    body: JSON.stringify({ model: config.modelo, message: PROMPT_BASE(texto), temperature: 0.1 })
  })
  if (!res.ok) throw new Error(`Cohere ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.text || ''
}

async function callCohere(config, texto, onProgress) {
  return processarEmChunks(texto, (chunk) => cohereCallRaw(config, chunk), 2000, onProgress)
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────
export async function extrairClausulas(texto, { isPDF = false, pdfBase64 = null, onProgress = null } = {}) {
  const config = getAIConfig()
  if (!config?.provedor || !config?.chave) {
    throw new Error('Configure um provedor de IA nas Configurações antes de extrair cláusulas.')
  }

  let resultado
  switch (config.provedor) {
    case 'gemini':
      resultado = await callGemini(config, texto, onProgress)
      break
    case 'claude':
      resultado = await callClaude(config, texto, isPDF, pdfBase64, onProgress)
      break
    case 'openai':
      resultado = await callOpenAICompat(config, texto, 'https://api.openai.com/v1/chat/completions', onProgress)
      break
    case 'groq':
      resultado = await callOpenAICompat(config, texto, 'https://api.groq.com/openai/v1/chat/completions', onProgress)
      break
    case 'nvidia':
      resultado = await callOpenAICompat(config, texto, 'https://integrate.api.nvidia.com/v1/chat/completions', onProgress)
      break
    case 'mistral':
      resultado = await callOpenAICompat(config, texto, 'https://api.mistral.ai/v1/chat/completions', onProgress)
      break
    case 'cohere':
      resultado = await callCohere(config, texto, onProgress)
      break
    default:
      throw new Error(`Provedor desconhecido: ${config.provedor}`)
  }
  // Normaliza categoria/subcategoria (e classificações adicionais) contra a taxonomia
  // canônica, independentemente de qual provedor de IA gerou o resultado.
  return normalizarClausulas(resultado)
}

export async function testarConexao(config) {
  const testPrompt = 'Responda apenas com o número 42.'
  try {
    switch (config.provedor) {
      case 'gemini': {
        const isThinking = config.modelo.includes('2.5') || config.modelo.includes('thinking')
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.modelo}:generateContent?key=${config.chave}`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: testPrompt }] }],
            generationConfig: {
              maxOutputTokens: 10,
              ...(isThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {})
            }
          })
        })
        if (!res.ok) {
          const e = await res.json().catch(() => ({}))
          throw new Error(e?.error?.message || `HTTP ${res.status}`)
        }
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return { ok: true }
      }
      case 'openai':
        await openAICompatCallRaw(config, testPrompt, 'https://api.openai.com/v1/chat/completions')
        return { ok: true }
      case 'groq':
        await openAICompatCallRaw(config, testPrompt, 'https://api.groq.com/openai/v1/chat/completions')
        return { ok: true }
      case 'nvidia':
        await openAICompatCallRaw(config, testPrompt, 'https://integrate.api.nvidia.com/v1/chat/completions')
        return { ok: true }
      case 'mistral':
        await openAICompatCallRaw(config, testPrompt, 'https://api.mistral.ai/v1/chat/completions')
        return { ok: true }
      case 'cohere':
        await cohereCallRaw(config, testPrompt)
        return { ok: true }
      default:
        throw new Error('Provedor desconhecido')
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
