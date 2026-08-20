// Motor CCT — Análise Negocial assistida por IA (Comparativo Sindical + Negociação)
//
// Por quê: o comparativo determinístico (Jaccard + extração numérica, ver
// utils/comparacao.js) já resolve o PAREAMENTO de cláusulas entre fontes e um
// veredito básico (Superior/Inferior/Igual/Modificada/Sem Previsão/Exclusiva).
// O que falta para chegar no nível de um "Mapa de Pontos de Negociação" (tipo
// de alteração, quem propôs, direção do efeito, relevância e a orientação de
// mesa) é uma LEITURA do conteúdo — exatamente o tipo de julgamento que só
// faz sentido com compreensão de texto, não com regex/Jaccard.
//
// Esta função NUNCA re-pareia cláusulas — ela recebe os pontos já pareados
// (um "ponto de negociação" = uma cláusula-base + suas correspondentes em
// cada fonte comparada, incluindo o caso de 2 fontes do Comparativo simples)
// e pede à IA apenas os campos analíticos/narrativos. O conteúdo integral das
// cláusulas continua vindo direto do banco — a IA nunca precisa reescrevê-lo.
//
// Reaproveita o mesmo roteador de provedores (chamarProvedor/extrairJSON) já
// usado por pareamento.js e superioridade.js.

import { getAIConfig } from './index.js'
import { chamarProvedor, extrairJSON } from './chamada.js'

const MAX_CONTEUDO_PROMPT = 1100 // caracteres de conteúdo por cláusula/fonte no prompt
const TAMANHO_LOTE = 5 // pontos por chamada — equilibra tamanho do prompt/resposta com nº de chamadas
const PAUSA_ENTRE_LOTES_MS = 2500

const DIRECOES_VALIDAS = new Set(['FAVORAVEL_EMPREGADOS', 'FAVORAVEL_EMPRESA', 'MISTA', 'NEUTRA'])
const RELEVANCIAS_VALIDAS = new Set(['ALTA', 'MEDIA', 'BAIXA'])

export const DIRECAO_CONFIG = {
  FAVORAVEL_EMPREGADOS: { icone: '🔴', label: 'Favorável aos empregados/sindicato' },
  FAVORAVEL_EMPRESA:    { icone: '🟢', label: 'Favorável à empresa' },
  MISTA:                { icone: '🟡', label: 'Mista / Ponto de atenção' },
  NEUTRA:               { icone: '⚪', label: 'Neutra' },
}

export const RELEVANCIA_CONFIG = {
  ALTA:  { icone: '🔴', label: 'ALTA' },
  MEDIA: { icone: '🟡', label: 'MÉDIA' },
  BAIXA: { icone: '🟢', label: 'BAIXA' },
}

// Trunca preservando início (onde normalmente está o caput/regra geral)
function truncar(texto, max) {
  if (!texto) return ''
  return texto.length > max ? texto.slice(0, max) + '…' : texto
}

function montarPrompt(pontos, fontesInfo) {
  const listaFontes = fontesInfo.map(f => `"${f.label}"`).join(', ')

  // Sinal de cobertura por fonte: uma fonte que só tem conteúdo numa fatia
  // pequena dos pontos é, com grande probabilidade, um documento PARCIAL
  // (pauta/rol de reivindicações, memorando, lista de pedidos) — não um
  // instrumento coletivo completo. Isso muda a leitura correta de "ausência":
  // não é supressão de direito, é só um tema que aquele documento não versa.
  const avisosCobertura = fontesInfo.map(f => {
    const comConteudo = pontos.filter(p => p.porFonte[f.chave]).length
    const pct = pontos.length ? comConteudo / pontos.length : 1
    if (pct < 0.4) {
      return `- "${f.label}": possui conteúdo em apenas ${comConteudo} de ${pontos.length} pontos (${Math.round(pct * 100)}%). Isso indica FORTEMENTE que "${f.label}" é um documento PARCIAL (pauta/rol de reivindicações, memorando ou lista de pedidos pontuais), NÃO um instrumento coletivo completo. Para esta fonte, a ausência de um tema NUNCA deve ser classificada como "SUPRESSÃO" — use "TEMA NÃO ABORDADO NA PAUTA", salvo se o próprio texto desta fonte disser explicitamente que remove/revoga aquele direito.`
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

  return `Você é um advogado trabalhista brasileiro extremamente experiente em negociação coletiva,
lendo um comparativo entre ${fontesInfo.length} fontes (${listaFontes}) — podem ser CCT, ACT,
minuta/proposta sindical, proposta da empresa ou prática interna. Seu trabalho é o mesmo de quem
prepara um "Mapa de Pontos de Negociação" para a mesa de negociação: para cada PONTO abaixo, leia
o conteúdo de cada fonte e produza uma análise objetiva e tecnicamente precisa.

REGRA CRÍTICA — NUNCA ALUCINE RELAÇÃO CAUSAL: só descreva uma fonte como "substituindo",
"trocando" ou "compensando" um direito por outro se ISSO ESTIVER EXPLÍCITO no texto de alguma das
fontes. Se o pareamento automático agrupou dois itens que não têm relação temática clara entre si
(ex.: um item de pauta truncado/ambíguo por OCR, sem menção ao mesmo instituto jurídico das
demais fontes), NÃO invente uma narrativa de causa-efeito — diga isso explicitamente em
"alteracao_substancial" (ex.: "Não há relação clara entre os itens pareados nesta linha; revisão
humana recomendada.") e marque "relevancia" como "BAIXA" nesse caso de incerteza.
${avisosCobertura ? `\nCOBERTURA DAS FONTES NESTA ANÁLISE:\n${avisosCobertura}\n` : ''}
Para CADA ponto, decida:

1) "textual": true se a ÚNICA diferença entre as fontes é redação/nomenclatura/organização do
   texto, SEM qualquer efeito prático (não muda direito, obrigação, valor, prazo, percentual,
   condição, custo, risco). Caso contrário, false. Na dúvida entre "só forma" e "efeito real",
   prefira false (mais seguro pedir revisão humana do que esconder uma diferença real).

2) "assunto": nome curto do tema (ex.: "Piso Salarial", "Hora Extra", "Gratificação por
   Aposentadoria") — não repita o título completo da cláusula.

3) "alteracao_substancial": 1-3 frases objetivas descrevendo CONCRETAMENTE o que muda entre as
   fontes (valores, percentuais, prazos, condições) — no estilo "Bora Brasil suprime o direito
   garantido de X, substituindo por Y". Se não houver diferença real entre nenhuma fonte, diga
   "Sem divergência entre as fontes.". Se o tema simplesmente não é abordado por uma fonte parcial
   (ver aviso de cobertura acima), diga isso nesses termos — não descreva como perda de direito.

4) "relacao_alteracao": indique resumidamente o sentido da mudança usando os nomes reais das
   fontes, ex.: "CCT → Proposta Sindical" ou "CCT → Proposta Sindical + CCT → Bora Brasil" (uma
   seta por fonte que se afasta de outra usada como referência/piso legal, se fizer sentido; caso
   não haja uma fonte de referência clara, apenas descreva quem diverge de quem, ex.: "Proposta
   Sindical × Proposta Bora Brasil").

5) "responsavel": qual fonte(s) propuseram a alteração em relação às demais — use o nome exato de
   uma das fontes (${listaFontes}), ou "AMBOS" se mais de uma fonte convergiu na mesma mudança em
   relação a uma referência comum, ou "N/A" se não houver alteração real ou se for apenas "tema
   não abordado" por uma fonte parcial.

6) "tipo_alteracao": classifique em UMA das categorias (escolha a mais adequada, maiúsculas):
   ALTERAÇÃO DE VALOR | ALTERAÇÃO DE PERCENTUAL | ALTERAÇÃO DE PRAZO | ALTERAÇÃO DE CRITÉRIO |
   ALTERAÇÃO DE CONDIÇÃO | ALTERAÇÃO DE PERIODICIDADE | SUPRESSÃO | REDUÇÃO DE OBRIGAÇÃO |
   AMPLIAÇÃO DE DIREITO | CRIAÇÃO DE OBRIGAÇÃO | INOVAÇÃO | TEMA NÃO ABORDADO NA PAUTA |
   SEM ALTERAÇÃO
   Use "SUPRESSÃO" APENAS quando (a) o texto de alguma fonte remove/revoga explicitamente um
   direito antes existente, OU (b) a fonte que omite o tema é comprovadamente um instrumento
   coletivo completo (regula o mesmo capítulo/matéria extensamente) que conspicuamente pula
   aquela cláusula específica. Se a fonte que omite for parcial (ver aviso de cobertura), use
   "TEMA NÃO ABORDADO NA PAUTA" em vez de "SUPRESSÃO".

7) "impacto": 1 frase indicando a natureza do impacto — comece com uma ou mais destas etiquetas
   separadas por " / ": FINANCEIRO, JURÍDICO-TRABALHISTA, OPERACIONAL, SINDICAL — seguida de uma
   frase curta explicando (ex.: "FINANCEIRO: +R$ 100/empregado/mês.").

8) "direcao": UM destes códigos exatos, do ponto de vista de quem é mais favorecido pelo RESULTADO
   final (não por quem propôs): "FAVORAVEL_EMPREGADOS" (mais favorável aos empregados/sindicato),
   "FAVORAVEL_EMPRESA" (mais favorável à empresa), "MISTA" (ganhos e perdas para ambos os lados, ou
   convergência que troca uma proteção por outra), "NEUTRA" (sem favorecimento claro a nenhum
   lado — inclui, em regra, "TEMA NÃO ABORDADO NA PAUTA", pois o direito continua vigendo pelo
   instrumento/lei já em vigor até que se decida o contrário).

9) "relevancia": "ALTA", "MEDIA" ou "BAIXA" — considere magnitude financeira, risco jurídico e
   quantos empregados afeta. Pontos sem alteração real ("SEM ALTERAÇÃO") são sempre "BAIXA".
   Pontos "TEMA NÃO ABORDADO NA PAUTA" são em regra "BAIXA" (o direito segue vigente por padrão),
   suba para "MEDIA" apenas se houver risco concreto de a lacuna gerar disputa na negociação.

10) "ponto_negociacao": 1-2 frases de orientação prática para a mesa de negociação — o que
    negociar, ou, se já convergido entre as fontes, o que confirmar/atentar. Para "TEMA NÃO
    ABORDADO NA PAUTA", oriente a confirmar que o direito permanece vigente pelo instrumento
    atual/lei, não a "negociar a reinserção" de algo que nunca foi removido.

${blocos}

SAÍDA OBRIGATÓRIA: retorne APENAS um array JSON válido, nenhum texto antes ou depois, sem
markdown, sem explicações. Um item por PONTO acima, na MESMA ordem, incluindo o índice:
[{"ponto":0,"textual":false,"assunto":"...","alteracao_substancial":"...","relacao_alteracao":"...","responsavel":"...","tipo_alteracao":"...","impacto":"...","direcao":"FAVORAVEL_EMPRESA","relevancia":"ALTA","ponto_negociacao":"..."}]`
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

// pontos: [{ id, tituloReferencia, porFonte: { [chaveFonte]: { numero, titulo, conteudo } | undefined } }]
// fontesInfo: [{ chave, label }] — ordem em que as fontes devem aparecer no prompt/relatório
// Retorna: Map(id -> classificação), na mesma ordem/tamanho de `pontos` (itens que a IA não
// respondeu, ou respondeu de forma inválida, ficam de fora do Map — quem chama decide o fallback).
export async function gerarAnaliseNegocial(pontos, fontesInfo, onProgress = null) {
  if (!pontos?.length) return new Map()
  const config = getAIConfig()
  if (!config?.provedor || !config?.chave) {
    throw new Error('Configure um provedor de IA nas Configurações antes de gerar a análise negocial.')
  }

  const resultado = new Map()
  const lotes = []
  for (let i = 0; i < pontos.length; i += TAMANHO_LOTE) lotes.push(pontos.slice(i, i + TAMANHO_LOTE))

  let processados = 0
  for (let li = 0; li < lotes.length; li++) {
    const lote = lotes[li]
    const label = `Lote ${li + 1}/${lotes.length}`
    onProgress?.(`${label} — analisando ${lote.length} ponto(s) de negociação com IA...`)
    try {
      const prompt = montarPrompt(lote, fontesInfo)
      const raw = await comRetrySimples(() => chamarProvedor(config, prompt), 3, onProgress, label)
      const respostas = extrairJSON(raw) || []
      for (const r of respostas) {
        const item = lote[r?.ponto]
        if (!item) continue
        const direcao = DIRECOES_VALIDAS.has(r.direcao) ? r.direcao : 'MISTA'
        const relevancia = RELEVANCIAS_VALIDAS.has(r.relevancia) ? r.relevancia : 'MEDIA'
        resultado.set(item.id, {
          textual: !!r.textual,
          assunto: (r.assunto || item.tituloReferencia || '').trim(),
          alteracao_substancial: (r.alteracao_substancial || '').trim(),
          relacao_alteracao: (r.relacao_alteracao || '').trim(),
          responsavel: (r.responsavel || 'N/A').trim(),
          tipo_alteracao: (r.tipo_alteracao || '').trim(),
          impacto: (r.impacto || '').trim(),
          direcao,
          relevancia,
          ponto_negociacao: (r.ponto_negociacao || '').trim(),
        })
      }
      processados += lote.length
      onProgress?.(`${label} concluído — ${processados}/${pontos.length} ponto(s) analisados.`)
    } catch (e) {
      onProgress?.(`❌ ${label} falhou: ${e.message.slice(0, 150)}`)
    }
    if (li < lotes.length - 1) await new Promise(r => setTimeout(r, PAUSA_ENTRE_LOTES_MS))
  }

  if (resultado.size === 0) {
    throw new Error('A IA não retornou nenhuma análise válida. Verifique sua chave/provedor nas Configurações e tente novamente.')
  }
  return resultado
}
