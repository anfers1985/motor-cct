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

  // Caixa de dados gerais
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(10, y, 190, 26, 2, 2, 'F')
  y += 5
  doc.setFontSize(8)

  const info = [
    ['Empresa:', (empresa?.razao_social || '—').slice(0, 50), 'Operacao:', (operacao?.nome || '—').slice(0, 40)],
    ['Sind. Laboral:', (sLab?.razao_social || '—').slice(0, 50), 'Sind. Patronal:', (sPat?.razao_social || '—').slice(0, 40)],
  ]
  for (const row of info) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(80, 80, 80)
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

  // Agrupar por categoria mantendo a ordem do CATEGORIAS
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

      // Fundo cinza claro para cabeçalho da cláusula
      doc.setFillColor(245, 247, 250)
      const tituloCompleto = c.numero ? c.numero + ' — ' + c.titulo : (c.titulo || '')
      const tituloLines = doc.splitTextToSize(tituloCompleto, 182)
      doc.rect(10, y - 1, 190, tituloLines.length * 4.5 + 4, 'F')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(tituloLines, 14, y + 3)
      y += tituloLines.length * 4.5 + 4

      // Valores monetários e percentual
      if (c.valor_monetario || c.percentual) {
        if (y > 275) { doc.addPage(); y = 20 }
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8)
        doc.setTextColor(20, 120, 60)
        const extras = [
          c.valor_monetario ? 'Valor: ' + c.valor_monetario : '',
          c.percentual ? 'Percentual: ' + c.percentual : ''
        ].filter(Boolean).join('   |   ')
        doc.text(extras, 14, y)
        y += 5
      }

      // Vigência específica
      if (c.vigencia_especifica) {
        if (y > 275) { doc.addPage(); y = 20 }
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8)
        doc.setTextColor(180, 100, 0)
        const vegLines = doc.splitTextToSize('Vigencia especifica: ' + c.vigencia_especifica, 182)
        doc.text(vegLines, 14, y)
        y += vegLines.length * 4 + 2
      }

      // Observações
      if (c.observacoes && c.observacoes.trim()) {
        if (y > 275) { doc.addPage(); y = 20 }
        doc.setFontSize(8)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(30, 80, 180)
        const obsLines = doc.splitTextToSize('Obs: ' + c.observacoes, 182)
        doc.text(obsLines, 14, y)
        y += obsLines.length * 4 + 2
      }

      // CONTEÚDO INTEGRAL — sem cortes
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(50, 50, 50)
      const conteudo = c.conteudo || ''
      const conteudoLines = doc.splitTextToSize(conteudo, 182)
      for (const line of conteudoLines) {
        if (y > 280) { doc.addPage(); y = 20 }
        doc.text(line, 14, y)
        y += 4.2
      }

      // Tags
      if ((c.tags || []).length > 0) {
        if (y > 278) { doc.addPage(); y = 20 }
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(100, 100, 100)
        doc.text('Tags: ' + c.tags.join(' | '), 14, y)
        y += 4
      }

      y += 5

      // Linha divisória
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

export function gerarPDFComparativo(resultado, instrumentoA, instrumentoB) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' })

  addHeader(
    doc,
    'Comparativo: ' + instrumentoA?.nome + ' vs ' + instrumentoB?.nome,
    'Gerado em ' + new Date().toLocaleDateString('pt-BR')
  )

  const STATUS_COLORS = {
    'INALTERADA': [209, 250, 229], 'ALTERADA': [219, 234, 254],
    'MUITO ALTERADA': [254, 243, 199], 'SUBSTITUÍDA': [254, 226, 226],
    'SUPRIMIDA': [241, 245, 249], 'NOVA': [243, 232, 255],
  }

  doc.autoTable({
    startY: 36,
    head: [['Status', 'Nr A', 'Titulo A', 'Conteudo A', 'Nr B', 'Titulo B', 'Conteudo B']],
    body: resultado.map(r => [
      r.status.label,
      r.clausulaA?.numero || '',
      r.clausulaA?.titulo || '',
      (r.clausulaA?.conteudo || '').slice(0, 400),
      r.clausulaB?.numero || '',
      r.clausulaB?.titulo || '',
      (r.clausulaB?.conteudo || '').slice(0, 400),
    ]),
    styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [26, 79, 255], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 24 }, 1: { cellWidth: 12 }, 2: { cellWidth: 38 },
      3: { cellWidth: 66 }, 4: { cellWidth: 12 }, 5: { cellWidth: 38 }, 6: { cellWidth: 66 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 0) {
        data.cell.styles.fillColor = STATUS_COLORS[data.cell.raw] || [255, 255, 255]
        data.cell.styles.fontStyle = 'bold'
      }
    }
  })

  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 160)
    doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' — Motor CCT', 14, 205)
    doc.text('Pagina ' + i + ' de ' + pageCount, 283, 205, { align: 'right' })
  }

  doc.save('comparativo_' + instrumentoA?.nome + '_vs_' + instrumentoB?.nome + '.pdf')
}
