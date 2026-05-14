import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { CATEGORIAS } from '../../utils/categorias'

function header(doc, title, subtitle = '') {
  doc.setFillColor(26, 79, 255)
  doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Motor CCT', 14, 12)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(title, 14, 20)
  if (subtitle) doc.text(subtitle, 14, 26)
  doc.setTextColor(0, 0, 0)
}

function footer(doc) {
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `Gerado em ${new Date().toLocaleDateString('pt-BR')} — Motor CCT`,
      14, 290
    )
    doc.text(`Página ${i} de ${pageCount}`, 196, 290, { align: 'right' })
  }
}

export function gerarPDFInstrumento(instrumento, clausulas, empresa, operacao, sLab, sPat) {
  const doc = new jsPDF()
  header(doc, instrumento?.nome || 'Instrumento Coletivo', `${instrumento?.tipo || ''} | Vigência: ${instrumento?.vigencia_inicio || ''} a ${instrumento?.vigencia_fim || ''}`)

  let y = 36
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)

  const info = [
    ['Empresa', empresa?.razao_social || '—'],
    ['Operação', operacao?.nome || '—'],
    ['Sindicato Laboral', sLab?.razao_social || '—'],
    ['Sindicato Patronal', sPat?.razao_social || '—'],
  ]
  info.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold')
    doc.text(label + ':', 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(val, 60, y)
    y += 6
  })

  y += 4

  // Agrupar por categoria
  const grupos = {}
  for (const c of clausulas) {
    if (!grupos[c.categoria]) grupos[c.categoria] = []
    grupos[c.categoria].push(c)
  }

  for (const cat of Object.keys(CATEGORIAS)) {
    const items = grupos[cat]
    if (!items?.length) continue

    if (y > 260) { doc.addPage(); y = 20 }
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(26, 79, 255)
    doc.text(cat.toUpperCase(), 14, y)
    y += 6

    for (const c of items) {
      if (y > 260) { doc.addPage(); y = 20 }
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(40, 40, 40)
      doc.text(`${c.numero ? c.numero + ' — ' : ''}${c.titulo}`, 14, y)
      y += 5

      if (c.valor_monetario || c.percentual) {
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(100, 100, 100)
        const extras = [c.valor_monetario, c.percentual].filter(Boolean).join(' | ')
        doc.text(extras, 14, y)
        y += 5
      }

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      const lines = doc.splitTextToSize(c.conteudo || '', 182)
      for (const line of lines) {
        if (y > 274) { doc.addPage(); y = 20 }
        doc.text(line, 14, y)
        y += 4.5
      }
      y += 4
    }
    y += 2
  }

  footer(doc)
  doc.save(`${instrumento?.nome || 'instrumento'}.pdf`)
}

export function gerarPDFComparativo(resultado, instrumentoA, instrumentoB) {
  const doc = new jsPDF({ orientation: 'landscape' })
  header(doc, `Comparativo: ${instrumentoA?.nome} vs ${instrumentoB?.nome}`, '')

  const rows = resultado.map(r => [
    r.status.label,
    r.clausulaA?.numero || '',
    r.clausulaA?.titulo || '',
    (r.clausulaA?.conteudo || '').slice(0, 200),
    r.clausulaB?.numero || '',
    r.clausulaB?.titulo || '',
    (r.clausulaB?.conteudo || '').slice(0, 200),
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
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [26, 79, 255], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 12 },
      2: { cellWidth: 40 },
      3: { cellWidth: 60 },
      4: { cellWidth: 12 },
      5: { cellWidth: 40 },
      6: { cellWidth: 60 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 0) {
        const status = data.cell.raw
        data.cell.styles.fillColor = STATUS_COLORS[status] || [255, 255, 255]
        data.cell.styles.fontStyle = 'bold'
      }
    }
  })

  footer(doc)
  doc.save(`comparativo_${instrumentoA?.nome}_vs_${instrumentoB?.nome}.pdf`)
}
