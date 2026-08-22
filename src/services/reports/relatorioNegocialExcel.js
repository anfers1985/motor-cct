import * as XLSX from 'xlsx'
import { DIRECAO_CONFIG, RELEVANCIA_CONFIG } from '../ai/analiseNegocial'

function celulaFonte(c) {
  if (!c) return 'Não prevê / sem correspondência nesta fonte.'
  const cab = (c.numero ? `Nº ${c.numero} — ` : '') + (c.titulo || '')
  let texto = c.conteudo ? `${cab}\n\n${c.conteudo}` : cab
  if (c.motivoIA) texto += `\n\n🤖 PAREAMENTO SUGERIDO POR IA — motivo: ${c.motivoIA}\n(redação muito diferente do casamento automático; confirme se é de fato o mesmo instituto antes de considerar definitivo)`
  return texto
}

function dirTexto(codigo) {
  const cfg = DIRECAO_CONFIG[codigo]
  return cfg ? `${cfg.icone} ${cfg.label}` : codigo || ''
}

function relTexto(codigo) {
  const cfg = RELEVANCIA_CONFIG[codigo]
  return cfg ? `${cfg.icone} ${cfg.label}` : codigo || ''
}

// pontos: [{ id, tituloReferencia, porFonte: { [chave]: {numero,titulo,conteudo} } }]
// classificacoes: Map(id -> { textual, assunto, alteracao_substancial, relacao_alteracao,
//                              responsavel, tipo_alteracao, impacto, direcao, relevancia,
//                              ponto_negociacao })
// fontesInfo: [{ chave, label }] — ordem das colunas de conteúdo
// meta: { titulo, subtitulo }
export function gerarExcelAnaliseNegocial(pontos, classificacoes, fontesInfo, meta = {}) {
  const wb = XLSX.utils.book_new()
  const titulo = meta.titulo || 'MAPA DE PONTOS DE NEGOCIAÇÃO'
  const subtitulo = meta.subtitulo || ''

  const linhas = pontos
    .map(p => ({ p, c: classificacoes.get(p.id) }))
    .filter(x => x.c) // descarta pontos sem classificação da IA (ex.: lote que falhou)

  const substanciais = linhas.filter(x => !x.c.textual)
  const textuais = linhas.filter(x => x.c.textual)

  // ── Aba 1: Análise Negocial ─────────────────────────────────────────────
  const headerFontes = fontesInfo.map(f => f.label)
  const headerRow1 = ['Nº', 'Cláusula / Assunto', ...headerFontes,
    'Alteração Substancial', 'Relação da Alteração', 'Responsável', 'Tipo de Alteração',
    'Impacto', 'Direção', 'Relevância', 'Ponto de Negociação']

  const aoa1 = [
    [titulo],
    [subtitulo],
    [],
    ['LEGENDA:', '🔴 Favorável aos empregados/sindicato', '', '🟢 Favorável à empresa', '', '🟡 Mista / Ponto de atenção', '', '⚪ Neutra'],
    ['Regra de leitura: cada linha representa um PONTO DE NEGOCIAÇÃO SUBSTANCIAL (não uma cláusula inteira). Alterações meramente redacionais estão na aba "Alterações Meramente Textuais".'],
    [],
    headerRow1,
    ...substanciais.map(({ p, c }, i) => [
      i + 1,
      c.assunto || p.tituloReferencia,
      ...fontesInfo.map(f => celulaFonte(p.porFonte[f.chave])),
      c.alteracao_substancial,
      c.relacao_alteracao,
      c.responsavel,
      c.tipo_alteracao,
      c.impacto,
      dirTexto(c.direcao),
      relTexto(c.relevancia),
      c.ponto_negociacao,
    ]),
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(aoa1)
  ws1['!cols'] = [
    { wch: 5 }, { wch: 32 },
    ...fontesInfo.map(() => ({ wch: 55 })),
    { wch: 55 }, { wch: 30 }, { wch: 16 }, { wch: 22 }, { wch: 40 }, { wch: 30 }, { wch: 12 }, { wch: 55 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Análise Negocial')

  // ── Aba 2: Alterações Meramente Textuais ────────────────────────────────
  const aoa2 = [
    ['ALTERAÇÕES MERAMENTE TEXTUAIS (sem efeito prático — histórico de redação)'],
    ['Diferenças de redação, nomenclatura ou organização do texto que NÃO alteram direito, obrigação, valor, prazo, percentual, condição, custo, risco ou efeito prático. Não contaminam a Aba 1.'],
    [],
    ['Cláusula / Assunto', ...headerFontes, 'Observação'],
    ...textuais.map(({ p, c }) => [
      c.assunto || p.tituloReferencia,
      ...fontesInfo.map(f => celulaFonte(p.porFonte[f.chave])),
      c.alteracao_substancial || 'Sem divergência entre as fontes.',
    ]),
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(aoa2)
  ws2['!cols'] = [{ wch: 32 }, ...fontesInfo.map(() => ({ wch: 55 })), { wch: 55 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Alterações Meramente Textuais')

  // ── Aba 3: Resumo Executivo ─────────────────────────────────────────────
  const contarPor = (arr, campo) => arr.reduce((acc, { c }) => {
    const k = c[campo]
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})
  const porRelevancia = contarPor(substanciais, 'relevancia')
  const porResponsavel = contarPor(substanciais, 'responsavel')
  const porDirecao = contarPor(substanciais, 'direcao')

  const altaRelevancia = substanciais
    .filter(({ c }) => c.relevancia === 'ALTA')
    .map(({ p, c }, i) => [
      i + 1, c.assunto || p.tituloReferencia,
      ...fontesInfo.map(f => {
        const cl = p.porFonte[f.chave]
        return cl ? (cl.numero ? `Nº ${cl.numero}` : cl.titulo || '') : '—'
      }),
      c.impacto,
    ])

  const aoa3 = [
    [meta.tituloResumo || `RESUMO EXECUTIVO — ${titulo}`],
    [subtitulo],
    [],
    ['TOTAL DE PONTOS DE NEGOCIAÇÃO'],
    ['Total de alterações substanciais mapeadas', substanciais.length],
    ['🔴 Alta relevância', porRelevancia.ALTA || 0],
    ['🟡 Média relevância', porRelevancia.MEDIA || 0],
    ['🟢 Baixa relevância', porRelevancia.BAIXA || 0],
    [],
    ['POR RESPONSÁVEL PELA PROPOSTA DE ALTERAÇÃO'],
    ...Object.entries(porResponsavel).map(([k, v]) => [k, v]),
    [],
    ['POR DIREÇÃO DO EFEITO (independente de quem propôs)'],
    ...Object.entries(porDirecao).map(([k, v]) => [dirTexto(k), v]),
    [],
    ['ALTERAÇÕES MERAMENTE TEXTUAIS (informativo, fora da contagem acima)', textuais.length],
    [],
    ['PRINCIPAIS PONTOS PARA A MESA DE NEGOCIAÇÃO (relevância alta)'],
    ['Nº', 'Ponto', ...headerFontes, 'Impacto'],
    ...altaRelevancia,
    [],
    ['Metodologia: comparação de conteúdo (não de redação) entre as fontes selecionadas, com pareamento automático de cláusulas por similaridade textual e classificação analítica gerada por IA a partir do texto integral de cada cláusula. Diferenças puramente redacionais constam da aba "Alterações Meramente Textuais". Documento de apoio à negociação — não substitui análise jurídica formal; revise antes de usar em mesa de negociação.'],
  ]
  const ws3 = XLSX.utils.aoa_to_sheet(aoa3)
  ws3['!cols'] = [{ wch: 30 }, { wch: 45 }, ...fontesInfo.map(() => ({ wch: 22 })), { wch: 45 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Resumo Executivo')

  XLSX.writeFile(wb, 'analise_negocial_' + new Date().toISOString().slice(0, 10) + '.xlsx')
}
