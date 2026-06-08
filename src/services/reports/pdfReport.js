import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { CATEGORIAS } from '../../utils/categorias'
import { vigenciaStatus } from '../../utils/formatters'
import { ordenarClausulas } from '../../utils/ordenacao'

function statusVigencia(fim) {
  const s = vigenciaStatus(fim)
  if (s === 'vencido') return 'VENCIDO'
  if (s === 'alerta') return 'VENCE EM BREVE'
  if (s === 'vigente') return 'VIGENTE'
  return 'INDEFINIDO'
}

function addHeader(doc, title, subtitle = '') {
  doc.setFillColor(26, 79, 255)
  doc.rect(0, 0, 210, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Motor CCT', 14, 11)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const titleLines = doc.splitTextToSize(title, 180)
  doc.text(titleLines, 14, 19)
  if (subtitle) doc.text(subtitle, 14, 26)
  doc.setTextColor(0, 0, 0)
}

function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 160)
    doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' — Motor CCT', 14, 291)
    doc.text('Pagina ' + i + ' de ' + pageCount, 196, 291, { align: 'right' })
  }
}

export function gerarPDFInstrumento(instrumento, clausulas, empresa, operacao, sLab, sPat) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const status = statusVigencia(instrumento?.vigencia_fim)
  const ordenadas = ordenarClausulas(clausulas)

  addHeader(
    doc,
    (instrumento?.tipo || '') + ' — ' + (instrumento?.nome || 'Instrumento Coletivo'),
    'Vigencia: ' + (instrumento?.vigencia_inicio || '?') + ' a ' + (instrumento?.vigencia_fim || '?') + ' | Status: ' + status
  )

  let y = 38

  doc.setFillColor(248, 250, 252)
  doc.roundedRect(10, y, 190, 26, 2, 2, 'F')
  y += 5
  doc.setFontSize(8)

  const info = [
    ['Empresa:', (empresa?.razao_social || '—').slice(0, 50), 'Operacao:', (operacao?.nome || '—').slice(0, 40)],
    ['Sind. Laboral:', (sLab?.razao_social || '—').slice(0, 50), 'Sind. Patronal:', (sPat?.razao_social || '—').slice(0, 40)],
  ]
  for (const row of info) {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80)
    doc.text(row[0], 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(row[1]), 38, y)
    doc.setFont('helvetica', 'bold')
    doc.text(row[2], 110, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(row[3]), 134, y)
    y += 5
  }
  y += 8

  const grupos = {}
  for (const c of ordenadas) {
    if (!grupos[c.categoria]) grupos[c.categoria] = []
    grupos[c.categoria].push(c)
  }

  for (const cat of Object.keys(CATEGORIAS)) {
    const items = grupos[cat]
    if (!items?.length) continue

    if (y > 265) { doc.addPage(); y = 20 }
    doc.setFillColor(26, 79, 255)
    doc.rect(10, y, 190, 7, 'F')
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
    doc.text(cat.toUpperCase(), 14, y + 5)
    doc.setTextColor(0, 0, 0)
    y += 11

    for (const c of items) {
      if (y > 265) { doc.addPage(); y = 20 }

      doc.setFillColor(245, 247, 250)
      const tituloCompleto = c.numero ? 'CLÁUSULA ' + c.numero + ' — ' + c.titulo : (c.titulo || '')
      const tituloLines = doc.splitTextToSize(tituloCompleto, 182)
      doc.rect(10, y - 1, 190, tituloLines.length * 4.5 + 4, 'F')
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30)
      doc.text(tituloLines, 14, y + 3)
      y += tituloLines.length * 4.5 + 4

      if (c.observacoes && c.observacoes.trim()) {
        if (y > 275) { doc.addPage(); y = 20 }
        doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(30, 80, 180)
        const obsLines = doc.splitTextToSize('Obs: ' + c.observacoes, 182)
        doc.text(obsLines, 14, y)
        y += obsLines.length * 4 + 2
      }

      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(50, 50, 50)
      const conteudoLines = doc.splitTextToSize(c.conteudo || '', 182)
      for (const line of conteudoLines) {
        if (y > 280) { doc.addPage(); y = 20 }
        doc.text(line, 14, y)
        y += 4.2
      }

      if ((c.tags || []).length > 0) {
        if (y > 278) { doc.addPage(); y = 20 }
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100)
        doc.text('Tags: ' + c.tags.join(' | '), 14, y)
        y += 4
      }

      y += 5
      if (y < 280) {
        doc.setDrawColor(220, 220, 220)
        doc.line(14, y - 2, 196, y - 2)
      }
    }
    y += 4
  }

  addFooter(doc)
  doc.save((instrumento?.nome || 'instrumento') + '.pdf')
}

// ─── LCS diff (word-level) ─────────────────────────────────────────────────
function computeSegmentos(textoA, textoB) {
  if (!textoA && !textoB) return { segsA: [], segsB: [] }
  if (!textoA) return { segsA: [], segsB: [{ text: textoB, type: 'add' }] }
  if (!textoB) return { segsA: [{ text: textoA, type: 'rem' }], segsB: [] }

  const wordsA = textoA.split(/(\s+)/)
  const wordsB = textoB.split(/(\s+)/)
  const m = wordsA.length, n = wordsB.length

  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = wordsA[i-1] === wordsB[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1])

  const ops = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i-1] === wordsB[j-1]) { ops.unshift({ type: 'eq', val: wordsA[i-1] }); i--; j-- }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { ops.unshift({ type: 'add', val: wordsB[j-1] }); j-- }
    else { ops.unshift({ type: 'rem', val: wordsA[i-1] }); i-- }
  }

  function mergeOps(ops, keepTypes) {
    const segs = []
    for (const op of ops) {
      if (!keepTypes.includes(op.type)) continue
      const last = segs[segs.length - 1]
      if (last && last.type === op.type) last.text += op.val
      else segs.push({ text: op.val, type: op.type })
    }
    return segs
  }

  return {
    segsA: mergeOps(ops, ['eq', 'rem']),
    segsB: mergeOps(ops, ['eq', 'add']),
  }
}

// Render colored segments into a PDF cell at given position
function renderSegmentosColoridos(doc, segs, cellX, cellY, cellW, cellH, fontSize) {
  if (!segs || segs.length === 0) return
  doc.setFontSize(fontSize)
  const pad = 1.5
  const x0 = cellX + pad
  const maxX = cellX + cellW - pad
  const maxY = cellY + cellH - pad
  const lineH = fontSize * 0.42
  let cx = x0
  let cy = cellY + pad + lineH

  for (const seg of segs) {
    if (seg.type === 'add')      doc.setTextColor(22, 101, 52)   // verde
    else if (seg.type === 'rem') doc.setTextColor(109, 40, 217)  // roxo
    else                          doc.setTextColor(40, 40, 40)    // preto

    const tokens = seg.text.split(/(?=\s)|(?<=\s)/)
    for (const token of tokens) {
      if (!token) continue
      const tw = doc.getTextWidth(token)
      if (cx + tw > maxX && cx > x0) { cx = x0; cy += lineH }
      if (cy > maxY) break
      doc.text(token, cx, cy)
      if (seg.type === 'rem') {
        doc.setDrawColor(109, 40, 217)
        doc.setLineWidth(0.15)
        doc.line(cx, cy - lineH * 0.35, cx + doc.getTextWidth(token.trim()), cy - lineH * 0.35)
      }
      cx += tw
    }
    if (cy > maxY) break
  }

  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.2)
}

export function gerarPDFComparativo(resultado, instrumentoA, instrumentoB) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' })
  const nomeA = instrumentoA?.nome || 'Instrumento A'
  const nomeB = instrumentoB?.nome || 'Instrumento B'
  const nomeACurto = nomeA.slice(0, 30)
  const nomeBCurto = nomeB.slice(0, 30)

  addHeader(
    doc,
    'Comparativo: ' + nomeA + ' vs ' + nomeB,
    'Gerado em ' + new Date().toLocaleDateString('pt-BR')
  )

  // Cores de fundo por status
  const STATUS_ROW_COLORS = {
    'INALTERADA':    [209, 250, 229],  // verde claro
    'ALTERADA':      [219, 234, 254],  // azul claro
    'MUITO ALTERADA':[254, 243, 199],  // âmbar claro
    'SUBSTITUÍDA':   [254, 226, 226],  // vermelho claro
    'SUPRIMIDA':     [241, 245, 249],  // cinza claro
    'NOVA':          [243, 232, 255],  // roxo claro
  }

  const DIFF_STATUS = new Set(['ALTERADA', 'MUITO ALTERADA', 'SUBSTITUÍDA'])

  // Pre-compute diffs para linhas alteradas (limitar a 500 chars para performance)
  const diffsMap = new Map()
  resultado.forEach((r, idx) => {
    if (DIFF_STATUS.has(r.status.label)) {
      const tA = (r.clausulaA?.conteudo || '').slice(0, 500)
      const tB = (r.clausulaB?.conteudo || '').slice(0, 500)
      diffsMap.set(idx, computeSegmentos(tA, tB))
    }
  })

  // Construir corpo da tabela — células de conteúdo diff ficam vazias (serão desenhadas no hook)
  const body = resultado.map((r, idx) => {
    const hasDiff = diffsMap.has(idx)
    return [
      r.status.label,
      r.clausulaA?.numero || '',
      r.clausulaA?.titulo || '',
      hasDiff ? '' : (r.clausulaA?.conteudo || '').slice(0, 500),
      r.clausulaB?.numero || '',
      r.clausulaB?.titulo || '',
      hasDiff ? '' : (r.clausulaB?.conteudo || '').slice(0, 500),
    ]
  })

  const FONT_SIZE = 6.5
  const COL_WIDTHS = { 0: 22, 1: 12, 2: 36, 3: 64, 4: 12, 5: 36, 6: 64 }

  doc.autoTable({
    startY: 36,
    head: [[
      'Status',
      'Nº',
      nomeACurto + '\nTítulo',
      nomeACurto + '\nConteúdo',
      'Nº',
      nomeBCurto + '\nTítulo',
      nomeBCurto + '\nConteúdo',
    ]],
    body,
    styles: { fontSize: FONT_SIZE, cellPadding: 1.5, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [26, 79, 255], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    columnStyles: Object.fromEntries(
      Object.entries(COL_WIDTHS).map(([k, v]) => [k, { cellWidth: v }])
    ),

    // Colorir linha inteira pelo status
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const status = data.row.cells[0]?.raw || ''
      const cor = STATUS_ROW_COLORS[status]
      if (cor) {
        data.cell.styles.fillColor = cor
        if (data.column.index === 0) data.cell.styles.fontStyle = 'bold'
      }
    },

    // Desenhar texto colorido nas células de conteúdo (colunas 3 e 6) para linhas com diff
    didDrawCell: (data) => {
      if (data.section !== 'body') return
      const idx = data.row.index
      if (!diffsMap.has(idx)) return
      const isContA = data.column.index === 3
      const isContB = data.column.index === 6
      if (!isContA && !isContB) return

      const { segsA, segsB } = diffsMap.get(idx)
      const segs = isContA ? segsA : segsB
      renderSegmentosColoridos(
        doc, segs,
        data.cell.x, data.cell.y,
        data.cell.width, data.cell.height,
        FONT_SIZE
      )
    },
  })

  // Rodapé com paginação landscape (297 x 210 mm)
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 160)
    doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' — Motor CCT', 14, 205)
    doc.text('Pagina ' + i + ' de ' + pageCount, 283, 205, { align: 'right' })
  }

  doc.save('comparativo_' + nomeA + '_vs_' + nomeB + '.pdf')
}
