// Motor CCT — Comparativo Objetivo assistida por IA
//
// Versão mais enxuta da Análise Negocial: o "Resultado" de cada linha continua
// sendo o veredito determinístico que utils/comparacao.js já calcula (sem
// custo de IA nenhum) — a IA entra só para dar UM parecer consolidado (leitura
// do conjunto de fontes daquele ponto) e UM grau de atenção/relevância. Por
// pedir bem menos de cada chamada, cabem lotes maiores e o custo/tempo caem.

import { getAIConfig } from './index.js'
import { chamarProvedor, extrairJSON } from './chamada.js'

const MAX_CONTEUDO_PROMPT = 900
const TAMANHO_LOTE = 10
const PAUSA_ENTRE_LOTES_MS = 2000

const GRAUS_VALIDOS = new Set(['ALTA', 'MEDIA', 'BAIXA'])

export const GRAU_CONFIG = {
  ALTA:  { icone: '🔴', label: 'ALTA' },
  MEDIA: { icone: '🟡', label: 'MÉDIA' },
  BAIXA: { icone: '🟢', label: 'BAIXA' },
}

function truncar(texto, max) {
  if (!texto) return ''
  return texto.length > max ? texto.slice(0, max) + '…' : texto
}

function montarPrompt(pontos, fontesInfo) {
  const listaFontes = fontesInfo.map(f => `"${f.label}"`).join(', ')

  const avisosCobertura = fontesInfo.map(f => {
    const comConteudo = pontos.filter(p => p.porFonte[f.chave]).length
    const pct = pontos.length ? comConteudo / pontos.length : 1
    if (pct < 0.4) {
      return `- "${f.label}" só tem conteúdo em ${comConteudo} de ${pontos.length} pontos (${Math.round(pct * 100)}%) — provavelmente é um documento PARCIAL (pauta/rol de reivindicações, memorando), não um instrumento completo. Ausência nessa fonte NÃO é supressão de direito por padrão — o direito segue valendo pela fonte/lei já vigente.`
    }
    return null
  }).filter(Boolean).join('\n')

  const blocos = pontos.map((p, i) => {
    const partesFonte = fontesInfo.map(f => {
      const c = p.porFonte[f.chave]
      if (!c) return `${f.label}: (não prevê / sem correspondência)`
      const cab = (c.numero ? `Nº ${c.numero} — ` : '') + (c.titulo || '')
      return `${f.label} (${cab}):\n${truncar(c.conteudo, MAX_CONTEUDO_PROMPT)}`
    }).join('\n\n')
    return `\n### PONTO ${i} — ${p.tituloReferencia}\n${partesFonte}`
  }).join('\n')

  return `Você é um advogado trabalhista brasileiro experiente em negociação coletiva, lendo um
comparativo entre ${fontesInfo.length} fontes (${listaFontes}). Para CADA ponto abaixo, escreva um
PARECER OBJETIVO curto (2-4 frases, tom técnico e direto, como uma anotação de mesa de negociação)
lendo o conjunto das fontes daquele ponto, e classifique o GRAU de atenção que o ponto merece.

REGRA CRÍTICA — NUNCA ALUCINE RELAÇÃO CAUSAL: só diga que uma fonte "substitui" ou "compensa" algo
de outra se isso estiver EXPLÍCITO no texto. Se os itens pareados nesta linha não tiverem relação
temática clara entre si (ex.: pareamento automático juntou itens de assuntos diferentes), diga isso
no parecer em vez de inventar uma narrativa, e classifique grau "BAIXA".
${avisosCobertura ? `\nCOBERTURA DAS FONTES:\n${avisosCobertura}\n` : ''}
"grau" — um destes exatos: "ALTA" (divergência relevante entre fontes: valor, direito, risco
jurídico ou financeiro significativo), "MEDIA" (divergência real mas de impacto moderado, ou
tema não abordado por fonte parcial com algum risco de gerar dúvida), "BAIXA" (sem divergência
real, mera diferença de redação, ou tema simplesmente não abordado por documento parcial sem risco
aparente).

${blocos}

SAÍDA OBRIGATÓRIA: retorne APENAS um array JSON válido, nenhum texto antes ou depois, sem
markdown. Um item por PONTO acima, na MESMA ordem, incluindo o índice:
[{"ponto":0,"parecer":"...","grau":"ALTA"}]`
}

async function comRetrySimples(fn, tentativas = 3, onProgress = null, label = '') {
  for (let t = 1; t <= tentativas; t++) {
    try {
      return await fn()
    } catch (e) {
      const msg = (e.message || '').toLowerCase()
      const isRateLimit = msg.includes('429') || msg.includes('quota') || msg.includes('rate')
      const isServidor = msg.includes('500') || msg.includes('503')
      const podeRetry = (isRateLimit || isServidor) && t < tentativas
      if (!podeRetry) throw e
      const espera = isRateLimit ? (t === 1 ? 20000 : 40000) : 5000
      onProgress?.(`⚠️ ${label} — ${isRateLimit ? 'limite da API atingido' : 'erro temporário'}. Aguardando ${espera / 1000}s (tentativa ${t}/${tentativas})...`)
      await new Promise(r => setTimeout(r, espera))
    }
  }
}

// pontos: [{ id, tituloReferencia, porFonte: { [chaveFonte]: {numero,titulo,conteudo} } }]
// fontesInfo: [{ chave, label }]
// Retorna Map(id -> { parecer, grau })
export async function gerarParecerObjetivo(pontos, fontesInfo, onProgress = null) {
  if (!pontos?.length) return new Map()
  const config = getAIConfig()
  if (!config?.provedor || !config?.chave) {
    throw new Error('Configure um provedor de IA nas Configurações antes de gerar o parecer objetivo.')
  }

  const resultado = new Map()
  const lotes = []
  for (let i = 0; i < pontos.length; i += TAMANHO_LOTE) lotes.push(pontos.slice(i, i + TAMANHO_LOTE))

  let processados = 0
  for (let li = 0; li < lotes.length; li++) {
    const lote = lotes[li]
    const label = `Lote ${li + 1}/${lotes.length}`
    onProgress?.(`${label} — gerando parecer para ${lote.length} ponto(s)...`)
    try {
      const prompt = montarPrompt(lote, fontesInfo)
      const raw = await comRetrySimples(() => chamarProvedor(config, prompt), 3, onProgress, label)
      const respostas = extrairJSON(raw) || []
      for (const r of respostas) {
        const item = lote[r?.ponto]
        if (!item) continue
        resultado.set(item.id, {
          parecer: (r.parecer || '').trim(),
          grau: GRAUS_VALIDOS.has(r.grau) ? r.grau : 'MEDIA',
        })
      }
      processados += lote.length
      onProgress?.(`${label} concluído — ${processados}/${pontos.length} ponto(s).`)
    } catch (e) {
      onProgress?.(`❌ ${label} falhou: ${e.message.slice(0, 150)}`)
    }
    if (li < lotes.length - 1) await new Promise(r => setTimeout(r, PAUSA_ENTRE_LOTES_MS))
  }

  if (resultado.size === 0) {
    throw new Error('A IA não retornou nenhum parecer válido. Verifique sua chave/provedor nas Configurações e tente novamente.')
  }
  return resultado
}
