import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { CATEGORIAS } from '../../utils/categorias'
import { vigenciaStatus } from '../../utils/formatters'

function statusVigencia(fim) {
  const s = vigenciaStatus(fim)
  if (s === 'vencido') return 'VENCIDO'
  if (s === 'alerta') return 'VENCE EM BREVE'
  if (s === 'vigente') return 'VIGENTE'
  return 'INDEFINIDO'
}

function ordenarClausulas(clausulas) {
  const nums = {
    'PRIMEIRA': 1, 'SEGUNDA': 2, 'TERCEIRA': 3, 'QUARTA': 4, 'QUINTA': 5,
    'SEXTA': 6, 'SÉTIMA': 7, 'OITAVA': 8, 'NONA': 9, 'DÉCIMA': 10,
    'DÉCIMA PRIMEIRA': 11, 'DÉCIMA SEGUNDA': 12, 'DÉCIMA TERCEIRA': 13,
    'DÉCIMA QUARTA': 14, 'DÉCIMA QUINTA': 15, 'DÉCIMA SEXTA': 16,
    'DÉCIMA SÉTIMA': 17, 'DÉCIMA OITAVA': 18, 'DÉCIMA NONA': 19,
    'VIGÉSIMA': 20, 'TRIGÉSIMA': 30, 'QUADRAGÉSIMA': 40, 'QUINQUAGÉSIMA': 50
  }
  const toNum = (n) => {
    if (!n) return 9999
    const upper = String(n).toUpperCase().trim()
    if (nums[upper]) return nums[upper]
    const match = upper.match(/(\d+)/)
    if (match) return parseInt(match[1])
    for (const [key, val] of Object.entries(nums)) {
      if (upper.startsWith(key)) return val
    }
    return 9999
  }
  return [...clausulas].sort((a, b) => toNum(a.numero) - toNum(b.numero))
}

function addHeader(doc, title, subtitle = '') {
  doc.setFillColor(26, 79, 255)
  doc.rect(0, 0, 210, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Motor CCT ⚖️', 14, 11)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(title, 14, 19)
  if (subtitle) doc.text(subtitle, 14, 25)
  doc.setTextColor(0, 0, 0)
}

function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 160)
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} — Motor CCT`, 14, 291)
    doc.text(`Página ${i} de ${pageCount}`, 196, 291, { align: 'right' })
  }
}

function addText(doc, text, x, y, maxWidth, fontSize = 9) {
  doc.setFontSize(fontSize)
  const lines = doc.splitTextToSize(text || '', maxWidth)
  doc.text(lines, x, y)
  return lines.length * (fontSize * 0.4 + 0.5)
}

export function gerarPDFInstrumento(instrumento, clausulas, empresa, operacao, sLab, sPat) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const status = statusVigencia(instrumento?.vigencia_fim)
  const ordenadas = ordenarClausulas(clausulas)

  addHeader(
    doc,
    `${instrumento?.tipo || ''} — ${instrumento?.nome || 'Instrumento Coletivo'}`,
    `Vigência: ${instrumento?.vigencia_inicio || '?'} a ${instrumento?.vigencia_fim || '?'} | Status: ${status}`
  )

  let y = 38

  // Dados gerais
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(10, y, 190, 28, 2, 2, 'F')
  y += 5
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(80, 80, 80)

  const info = [
    ['Empresa:', empresa?.razao_social || '—', 'Operação:', operacao?.nome || '—'],
    ['Sind. Laboral:', sLab?.razao_social || '—', 'Sind. Patronal:', sPat?.razao_social || '—'],
  ]
  for (const row of info) {
    doc.setFont('helvetica', 'bold'); doc.text(row[0], 14, y)
    doc.setFont('helvetica', 'normal'); doc.text(String(row[1]).slice(0, 45), 35, y)
    doc.setFont('helvetica', 'bold'); doc.text(row[2], 110, y)
    doc.setFont('helvetica', 'normal'); doc.text(String(row[3]).slice(0, 45), 132, y)
    y += 5
  }
  y += 8

  // Agrupar por categoria na ordem definida
  const grupos = {}
  for (const c of ordenadas) {
    if (!grupos[c.categoria]) grupos[c.categoria] = []
    grupos[c.categoria].push(c)
  }

  for (const cat of Object.keys(CATEGORIAS)) {
    const items = grupos[cat]
    if (!items?.length) continue

    // Cabeçalho da categoria
    if (y > 265) { doc.addPage(); y = 20 }
    doc.setFillColor(26, 79, 255)
    doc.rect(10, y, 190, 7, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(cat.toUpperCase(), 14, y + 5)
    doc.setTextColor(0, 0, 0)
    y += 11

    for (const c of items) {
      if (y > 265) { doc.addPage(); y = 20 }

      // Número e título
      doc.setFillColor(245, 247, 250)
      doc.rect(10, y - 1, 190, 8, 'F')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      const tituloCompleto = c.numero ? `${c.numero} — ${c.titulo}` : c.titulo
      const tituloLines = doc.splitTextToSize(tituloCompleto, 170)
      doc.text(tituloLines, 14, y + 4)
      y += tituloLines.length * 4.5 + 3

      // Valores monetários e percentual
      if (c.valor_monetario || c.percentual) {
        if (y > 270) { doc.addPage(); y = 20 }
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8)
        doc.setTextColor(20, 120, 60)
        const extras = [
          c.valor_monetario ? `💰 ${c.valor_monetario}` : '',
          c.percentual ? `📊 ${c.percentual}` : ''
        ].filter(Boolean).join('   ')
        doc.text(extras, 14, y)
        y += 5
      }

      // Vigência específica
      if (c.vigencia_especifica) {
        if (y > 270) { doc.addPage(); y = 20 }
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8)
        doc.setTextColor(180, 100, 0)
        doc.text(`⚠️ Vigência específica: ${c.vigencia_especifica}`, 14, y)
        y += 5
      }

      // Observações/Contextualização
      if (c.observacoes) {
        if (y > 270) { doc.addPage(); y = 20 }
        doc.setFontSize(8)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(30, 80, 180)
        const obsLines = doc.splitTextToSize(`💡 ${c.observacoes}`, 182)
        doc.text(obsLines, 14, y)
        y += obsLines.length * 4 + 2
      }

      // Conteúdo INTEGRAL
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(50, 50, 50)
      const conteudoLines = doc.splitTextToSize(c.conteudo || '', 182)
      for (const line of conteudoLines) {
        if (y > 278) { doc.addPage(); y = 20 }
        doc.text(line, 14, y)
        y += 4.2
      }

      // Tags
      if ((c.tags || []).length > 0) {
        if (y > 275) { doc.addPage(); y = 20 }
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(100, 100, 100)
        doc.text('Tags: ' + c.tags.join(' | '), 14, y)
        y += 4
      }

      y += 5
      // Linha divisória entre cláusulas
      if (y < 278) {
        doc.setDrawColor(220, 220, 220)
        doc.line(14, y - 2, 196, y - 2)
      }
    }
    y += 4
  }

  addFooter(doc)
  doc.save(`${instrumento?.nome || 'instrumento'}.pdf`)
}

export function gerarPDFComparativo(resultado, instrumentoA, instrumentoB) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' })

  addHeader(
    doc,
    `Comparativo: ${instrumentoA?.nome} vs ${instrumentoB?.nome}`,
    `Gerado em ${new Date().toLocaleDateString('pt-BR')}`
  )

  const rows = resultado.map(r => [
    r.status.label,
    r.clausulaA?.numero || '',
    r.clausulaA?.titulo || '',
    (r.clausulaA?.conteudo || '').slice(0, 300),
    r.clausulaB?.numero || '',
    r.clausulaB?.titulo || '',
    (r.clausulaB?.conteudo || '').slice(0, 300),
  ])

  const STATUS_COLORS = {
    'INALTERADA': [209, 250, 229],
    'ALTERADA': [219, 234, 254],
    'MUITO ALTERADA': [254, 243, 199],
    'SUBSTITUÍDA': [254, 226, 226],
    'SUPRIMIDA': [241, 245, 249],
    'NOVA': [243, 232, 255],
  }

  doc.autoTable({
    startY: 36,
    head: [['Status', 'Nº A', 'Título A', 'Conteúdo A', 'Nº B', 'Título B', 'Conteúdo B']],
    body: rows,
    styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [26, 79, 255], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 12 },
      2: { cellWidth: 38 },
      3: { cellWidth: 66 },
      4: { cellWidth: 12 },
      5: { cellWidth: 38 },
      6: { cellWidth: 66 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 0) {
        const status = data.cell.raw
        data.cell.styles.fillColor = STATUS_COLORS[status] || [255, 255, 255]
        data.cell.styles.fontStyle = 'bold'
      }
    }
  })

  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 160)
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} — Motor CCT`, 14, 205)
    doc.text(`Página ${i} de ${pageCount}`, 283, 205, { align: 'right' })
  }

  doc.save(`comparativo_${instrumentoA?.nome}_vs_${instrumentoB?.nome}.pdf`)
}
