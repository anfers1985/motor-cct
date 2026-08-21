import * as XLSX from 'xlsx'
import { GRAU_CONFIG } from '../ai/parecerObjetivo'

function celulaFonte(c) {
  if (!c) return 'Não prevê / sem correspondência nesta fonte.'
  const cab = (c.numero ? `Nº ${c.numero} — ` : '') + (c.titulo || '')
  return c.conteudo ? `${cab}\n\n${c.conteudo}` : cab
}

function grauTexto(codigo) {
  const cfg = GRAU_CONFIG[codigo]
  return cfg ? `${cfg.icone} ${cfg.label}` : codigo || ''
}

// pontos: [{ id, tituloReferencia, porFonte: {chave: {numero,titulo,conteudo}} }]
// resultadosDeterministicos: Map(id -> [{ label, status, statusLabel }]) — um item por
//   fonte comparada (Negociação pode ter várias; Comparativo tem uma só)
// classificacoesIA: Map(id -> { parecer, grau })
// fontesInfo: [{ chave, label }] — colunas de conteúdo, na ordem desejada
export function gerarExcelComparativoObjetivo(pontos, resultadosDeterministicos, classificacoesIA, fontesInfo, meta = {}) {
  const wb = XLSX.utils.book_new()
  const titulo = meta.titulo || 'COMPARATIVO OBJETIVO'
  const subtitulo = meta.subtitulo || ''

  const linhas = pontos
    .map(p => ({ p, det: resultadosDeterministicos.get(p.id) || [], ia: classificacoesIA.get(p.id) }))
    .filter(x => x.ia) // descarta pontos sem parecer da IA (ex.: lote que falhou)

  // Nomes das colunas "Resultado" — uma por fonte comparada, na ordem em que aparecem
  const colunasResultado = []
  for (const { det } of linhas) {
    for (const d of det) if (!colunasResultado.includes(d.label)) colunasResultado.push(d.label)
  }

  const headerFontes = fontesInfo.map(f => f.label)
  const headerResultado = colunasResultado.map(l => `Resultado (${l})`)

  const aoa = [
    [titulo],
    [subtitulo],
    [],
    ['Regra de leitura: "Resultado" é o veredito determinístico do motor de comparação (não usa IA). "Parecer" e "Grau" são gerados por IA lendo o conjunto das fontes de cada ponto.'],
    [],
    ['Nº', 'Cláusula / Assunto', ...headerFontes, ...headerResultado, 'Parecer (IA)', 'Grau'],
    ...linhas.map(({ p, det, ia }, i) => {
      const mapaDet = Object.fromEntries(det.map(d => [d.label, d.statusLabel]))
      return [
        i + 1,
        p.tituloReferencia,
        ...fontesInfo.map(f => celulaFonte(p.porFonte[f.chave])),
        ...colunasResultado.map(l => mapaDet[l] || '—'),
        ia.parecer,
        grauTexto(ia.grau),
      ]
    }),
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 5 }, { wch: 30 },
    ...fontesInfo.map(() => ({ wch: 50 })),
    ...colunasResultado.map(() => ({ wch: 20 })),
    { wch: 55 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Comparativo Objetivo')

  XLSX.writeFile(wb, 'comparativo_objetivo_' + new Date().toISOString().slice(0, 10) + '.xlsx')
}
