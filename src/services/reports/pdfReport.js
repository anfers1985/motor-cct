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

export function addHeader(doc, title, subtitle = '') {
  doc.setFillColor(26, 79, 255); doc.rect(0, 0, 210, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text('Motor CCT', 14, 11)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize(title, 180), 14, 19)
  if (subtitle) doc.text(subtitle, 14, 26)
  doc.setTextColor(0, 0, 0)
}

export function addFooter(doc, isLandscape) {
  const pageCount = doc.internal.getNumberOfPages()
  const pageH = isLandscape ? 210 : 297
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(160, 160, 160)
    doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' — Motor CCT', 14, pageH - 4)
    doc.text('Pagina ' + i + ' de ' + pageCount, isLandscape ? 283 : 196, pageH - 4, { align: 'right' })
  }
}

export function gerarPDFInstrumento(instrumento, clausulas, empresa, operacao, sLab, sPat) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const status = statusVigencia(instrumento?.vigencia_fim)
  const ordenadas = ordenarClausulas(clausulas)
  addHeader(doc, (instrumento?.tipo || '') + ' — ' + (instrumento?.nome || 'Instrumento Coletivo'),
    'Vigencia: ' + (instrumento?.vigencia_inicio || '?') + ' a ' + (instrumento?.vigencia_fim || '?') + ' | Status: ' + status)
  let y = 38
  doc.setFillColor(248, 250, 252); doc.roundedRect(10, y, 190, 26, 2, 2, 'F'); y += 5; doc.setFontSize(8)
  for (const [l1, v1, l2, v2] of [
    ['Empresa:', (empresa?.razao_social||'—').slice(0,50), 'Operacao:', (operacao?.nome||'—').slice(0,40)],
    ['Sind. Laboral:', (sLab?.razao_social||'—').slice(0,50), 'Sind. Patronal:', (sPat?.razao_social||'—').slice(0,40)],
  ]) {
    doc.setFont('helvetica','bold'); doc.setTextColor(80,80,80); doc.text(l1,14,y)
    doc.setFont('helvetica','normal'); doc.text(String(v1),38,y)
    doc.setFont('helvetica','bold'); doc.text(l2,110,y)
    doc.setFont('helvetica','normal'); doc.text(String(v2),134,y); y+=5
  }
  y += 8
  const grupos = {}
  for (const c of ordenadas) { if (!grupos[c.categoria]) grupos[c.categoria]=[]; grupos[c.categoria].push(c) }
  for (const cat of Object.keys(CATEGORIAS)) {
    const items = grupos[cat]; if (!items?.length) continue
    if (y>265) { doc.addPage(); y=20 }
    doc.setFillColor(26,79,255); doc.rect(10,y,190,7,'F')
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255)
    doc.text(cat.toUpperCase(),14,y+5); doc.setTextColor(0,0,0); y+=11
    for (const c of items) {
      if (y>265) { doc.addPage(); y=20 }
      doc.setFillColor(245,247,250)
      const tl = doc.splitTextToSize(c.numero?'CLÁUSULA '+c.numero+' — '+c.titulo:(c.titulo||''),182)
      doc.rect(10,y-1,190,tl.length*4.5+4,'F')
      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30); doc.text(tl,14,y+3); y+=tl.length*4.5+4
      if (c.observacoes?.trim()) {
        if (y>275) { doc.addPage(); y=20 }
        doc.setFontSize(8); doc.setFont('helvetica','italic'); doc.setTextColor(30,80,180)
        const ol = doc.splitTextToSize('Obs: '+c.observacoes,182); doc.text(ol,14,y); y+=ol.length*4+2
      }
      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(50,50,50)
      for (const line of doc.splitTextToSize(c.conteudo||'',182)) { if (y>280) { doc.addPage(); y=20 } doc.text(line,14,y); y+=4.2 }
      if ((c.tags||[]).length>0) {
        if (y>278) { doc.addPage(); y=20 }
        doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(100,100,100)
        doc.text('Tags: '+c.tags.join(' | '),14,y); y+=4
      }
      y+=5; if (y<280) { doc.setDrawColor(220,220,220); doc.line(14,y-2,196,y-2) }
    }
    y+=4
  }
  addFooter(doc, false)
  doc.save((instrumento?.nome||'instrumento')+'.pdf')
}

// ─── LCS diff palavra a palavra ───────────────────────────────────────────
function computeSegmentos(textoA, textoB) {
  if (!textoA && !textoB) return { segsA: [], segsB: [] }
  if (!textoA) return { segsA: [], segsB: [{ text: textoB, type: 'add' }] }
  if (!textoB) return { segsA: [{ text: textoA, type: 'rem' }], segsB: [] }
  const wA = textoA.split(/(\s+)/), wB = textoB.split(/(\s+)/)
  const m = wA.length, n = wB.length
  const dp = Array.from({length:m+1},()=>Array(n+1).fill(0))
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j] = wA[i-1]===wB[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j],dp[i][j-1])
  const ops=[]; let i=m, j=n
  while (i>0||j>0) {
    if (i>0&&j>0&&wA[i-1]===wB[j-1]) { ops.unshift({type:'eq',val:wA[i-1]}); i--;j-- }
    else if (j>0&&(i===0||dp[i][j-1]>=dp[i-1][j])) { ops.unshift({type:'add',val:wB[j-1]}); j-- }
    else { ops.unshift({type:'rem',val:wA[i-1]}); i-- }
  }
  const merge=(ops,keep)=>{ const s=[]; for(const op of ops){ if(!keep.includes(op.type))continue; const l=s[s.length-1]; if(l&&l.type===op.type)l.text+=op.val; else s.push({text:op.val,type:op.type}) }; return s }
  return { segsA: merge(ops,['eq','rem']), segsB: merge(ops,['eq','add']) }
}

// ─── Renderer colorido ────────────────────────────────────────────────────────
// Renderiza segmentos coloridos dentro de uma célula da tabela.
// Funciona tanto para células de página única quanto multi-página:
// em multi-página, renderiza até o final da célula (cellY + cellHeight).
function renderSegmentosColoridos(doc, segs, cellX, cellY, cellW, cellH, fontSize) {
  if (!segs || segs.length === 0) return
  doc.setFontSize(fontSize)
  const pad = 1.5
  const x0 = cellX + pad
  const maxX = cellX + cellW - pad
  // Para células multi-página, cellH pode ser muito grande (toda a altura da página);
  // limitamos ao que cabe na página atual para evitar renderização fora dos limites.
  const pageH = doc.internal.pageSize.getHeight()
  const effectiveMaxY = Math.min(cellY + cellH - 0.5, pageH - 6)
  const lineH = fontSize * 0.42
  let cx = x0
  let cy = cellY + pad + lineH

  for (const seg of segs) {
    if (seg.type === 'add') doc.setTextColor(22, 101, 52)
    else if (seg.type === 'rem') doc.setTextColor(109, 40, 217)
    else doc.setTextColor(40, 40, 40)

    for (const token of seg.text.split(/(\s+)/)) {
      if (!token) continue
      if (cy > effectiveMaxY) break
      const tw = doc.getTextWidth(token)
      const isSpace = /^\s+$/.test(token)
      if (isSpace) {
        if (cx + tw > maxX) { cx = x0; cy += lineH } else cx += tw
        continue
      }
      if (cx + tw > maxX && cx > x0) { cx = x0; cy += lineH }
      if (cy > effectiveMaxY) break
      doc.text(token, cx, cy)
      if (seg.type === 'rem') {
        doc.setDrawColor(109, 40, 217); doc.setLineWidth(0.15)
        doc.line(cx, cy - lineH * 0.4, cx + tw, cy - lineH * 0.4)
        doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2)
      }
      cx += tw
    }
  }
  doc.setTextColor(0, 0, 0)
}

export function gerarPDFComparativo(resultado, instrumentoA, instrumentoB) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' })
  const nomeA = instrumentoA?.nome || 'Instrumento A'
  const nomeB = instrumentoB?.nome || 'Instrumento B'
  addHeader(doc, 'Comparativo: ' + nomeA + ' vs ' + nomeB, 'Gerado em ' + new Date().toLocaleDateString('pt-BR'))

  const STATUS_BADGE = {
    'INALTERADA': { fill:[209,250,229], text:[22,101,52]  },
    'ALTERADA':   { fill:[219,234,254], text:[29,78,216]  },
    'SUPRIMIDA':  { fill:[241,245,249], text:[71,85,105]  },
    'NOVA':       { fill:[243,232,255], text:[109,40,217] },
  }
  const FONT_SIZE = 6.5
  const COL_WIDTHS = { 0:22, 1:12, 2:36, 3:65, 4:12, 5:36, 6:65 }

  // Pré-processa: calcula diff para todas as cláusulas ALTERADAS.
  // O renderer colorido agora funciona também em cláusulas multi-página,
  // renderizando os segmentos até o limite visível de cada célula na página atual.
  const linhasProcessadas = resultado.map(r => {
    const hasDiff = r.status.label === 'ALTERADA'
    const tA = r.clausulaA?.conteudo || ''
    const tB = r.clausulaB?.conteudo || ''
    let segsA = null, segsB = null

    if (hasDiff) {
      // Limita LCS a textos de até ~15.000 chars para evitar travamento com textos muito longos
      if (tA.length + tB.length < 15000) {
        ;({ segsA, segsB } = computeSegmentos(tA, tB))
      }
    }
    return { r, tA, tB, segsA, segsB, hasDiff }
  })

  doc.autoTable({
    startY: 36,
    // showHead: 'everyPage' garante cabeçalho em toda página nova
    showHead: 'everyPage',
    head: [[
      'Status', 'Nº',
      nomeA.slice(0, 28) + '\nTítulo',
      nomeA.slice(0, 28) + '\nConteúdo',
      'Nº',
      nomeB.slice(0, 28) + '\nTítulo',
      nomeB.slice(0, 28) + '\nConteúdo',
    ]],
    body: linhasProcessadas.map(({ r, tA, tB, segsA, segsB }) => [
      { content: r.status.label },
      { content: r.clausulaA?.numero || '' },
      { content: r.clausulaA?.titulo || '' },
      // Se tem segs (cabe em 1 página) → texto branco (renderer vai redesenhar colorido)
      // Se não tem segs (quebra páginas) → texto normal com overflow:linebreak do autoTable
      { content: tA, _segs: segsA },
      { content: r.clausulaB?.numero || '' },
      { content: r.clausulaB?.titulo || '' },
      { content: tB, _segs: segsB },
    ]),

    styles: {
      fontSize: FONT_SIZE,
      cellPadding: 1.5,
      overflow: 'linebreak',
      valign: 'top',
    },
    headStyles: { fillColor: [26,79,255], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: COL_WIDTHS[0] },
      1: { cellWidth: COL_WIDTHS[1] },
      2: { cellWidth: COL_WIDTHS[2] },
      3: { cellWidth: COL_WIDTHS[3] },
      4: { cellWidth: COL_WIDTHS[4] },
      5: { cellWidth: COL_WIDTHS[5] },
      6: { cellWidth: COL_WIDTHS[6] },
    },

    didParseCell: (data) => {
      if (data.section !== 'body') return

      // Badge de status
      if (data.column.index === 0) {
        const cor = STATUS_BADGE[data.cell.raw?.content]
        if (cor) {
          data.cell.styles.fillColor = cor.fill
          data.cell.styles.textColor = cor.text
          data.cell.styles.fontStyle = 'bold'
        }
      }

      // Células com diff: oculta texto padrão (o renderer colorido vai redesenhar)
      if ((data.column.index === 3 || data.column.index === 6) && data.cell.raw?._segs) {
        data.cell.styles.textColor = [255, 255, 255]
      }
    },

    didDrawCell: (data) => {
      if (data.section !== 'body') return
      if (data.column.index !== 3 && data.column.index !== 6) return
      const segs = data.cell.raw?._segs
      if (!segs || segs.length === 0) return
      // Renderiza colorido passando cellHeight real — o renderer respeita esse limite
      renderSegmentosColoridos(
        doc, segs,
        data.cell.x, data.cell.y,
        data.cell.width, data.cell.height,
        FONT_SIZE
      )
    },
  })

  // Legenda
  const finalY = doc.lastAutoTable.finalY + 4
  if (finalY < 196) {
    doc.setFontSize(7); doc.setTextColor(80,80,80); doc.text('Legenda: ', 14, finalY)
    doc.setTextColor(109,40,217); doc.text('texto removido (tachado) = estava no instrumento A', 32, finalY)
    doc.setTextColor(22,101,52);  doc.text('texto adicionado (verde) = novo no instrumento B', 14, finalY + 4)
    doc.setTextColor(0,0,0)
  }

  addFooter(doc, true)
  doc.save('comparativo_' + nomeA + '_vs_' + nomeB + '.pdf')
}

// ─── PDF da aba Negociação Sindical ──────────────────────────────────────────
// Mesmo espírito visual do gerarPDFComparativo: cabeçalho azul, UMA tabela
// única, texto integral (sem corte) e cor aplicada apenas a um selo estreito
// de "Resultado" — nunca à linha inteira — para não poluir a leitura.
export function gerarPDFNegociacao({ itens, baseLabel, comparadas, FONTES_CONFIG, STATUS_CONFIG, fraseVeredito }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  addHeader(
    doc,
    'Negociação Sindical — Comparativo de Fontes',
    `Base: ${baseLabel}  ·  Comparadas: ${comparadas.map(f => FONTES_CONFIG[f]?.label).join(', ')}  ·  ` +
    `Gerado em ${new Date().toLocaleDateString('pt-BR')}  ·  ${itens.length} cláusula(s)`
  )

  const STATUS_BADGE = {}
  for (const [k, cfg] of Object.entries(STATUS_CONFIG)) {
    // Cores derivadas da paleta Tailwind já usada nos badges da tela (100/700-800)
    STATUS_BADGE[k] = {
      Superior:       { fill: [209, 250, 229], text: [22, 101, 52] },
      Inferior:       { fill: [254, 226, 226], text: [185, 28, 28] },
      Igual:          { fill: [241, 245, 249], text: [71, 85, 105] },
      Modificada:     { fill: [219, 234, 254], text: [30, 64, 175] },
      'Sem previsão': { fill: [254, 249, 195], text: [146, 105, 0] },
      Exclusiva:      { fill: [243, 232, 255], text: [109, 40, 217] },
    }[k]
  }

  const numColsFonte = 1 + comparadas.length // base + cada comparada
  const FONT_SIZE = 7

  const head = [[
    'Resultado',
    `${baseLabel} (base)`,
    ...comparadas.map(fc => FONTES_CONFIG[fc]?.label || fc),
    'Veredito',
  ]]

  const body = itens.map(r => {
    const numero = r.clausulaBase?.numero || r.clausulaNova?.numero || ''
    const titulo = r.clausulaBase?.titulo || r.clausulaNova?.titulo || '—'
    const cabecalho = (numero ? `Nº ${numero} — ` : '') + titulo

    const colBase = r.clausulaBase
      ? `${cabecalho}\n\n${r.clausulaBase.conteudo || ''}`
      : `${titulo}\n\n— exclusiva da(s) fonte(s) comparada(s) —`

    const colsComparadas = comparadas.map(fc => {
      const par = r.pares?.[fc]
      const av = r.avaliacoes?.[fc]
      if (!par?.clausulaB) {
        if (av?.status === 'Exclusiva' && r.clausulaNova) {
          const cn = r.clausulaNova
          return `${cn.numero ? `Nº ${cn.numero} — ` : ''}${cn.titulo || ''}\n\n${cn.conteudo || ''}`
        }
        return 'Não encontrado nesta fonte'
      }
      const num = par.clausulaB.numero ? `Nº ${par.clausulaB.numero} — ` : ''
      return `${num}${par.clausulaB.titulo || ''}\n\n${par.clausulaB.conteudo || ''}`
    })

    const veredito = comparadas.map(fc => {
      const av = r.avaliacoes?.[fc]
      if (!av?.status) return null
      const fl = FONTES_CONFIG[fc]?.label || fc
      const cfg = STATUS_CONFIG[av.status] || {}
      const headline = fraseVeredito(av.status, baseLabel, fl, !!r.clausulaBase)
      return `[${cfg.label || av.status}] ${headline}${av.resumo ? '\n' + av.resumo : ''}`
    }).filter(Boolean).join('\n\n')

    const cfgGeral = STATUS_CONFIG[r.statusGeral] || {}
    return {
      cells: [
        { content: `${cfgGeral.icone || ''} ${cfgGeral.label || r.statusGeral}`, _status: r.statusGeral },
        colBase,
        ...colsComparadas,
        veredito,
      ],
    }
  })

  const usableWidth = 277 // A4 paisagem, margens de 10mm de cada lado
  const colResultado = 20
  const colVeredito = 62
  const restante = usableWidth - colResultado - colVeredito
  const colBaseW = Math.max(45, Math.floor(restante / (numColsFonte + 0.6)))
  const colComparadaW = Math.max(38, Math.floor((restante - colBaseW) / Math.max(1, comparadas.length)))

  const columnStyles = { 0: { cellWidth: colResultado, halign: 'center' }, 1: { cellWidth: colBaseW } }
  comparadas.forEach((_, i) => { columnStyles[2 + i] = { cellWidth: colComparadaW } })
  columnStyles[2 + comparadas.length] = { cellWidth: colVeredito, fontSize: 6.5 }

  doc.autoTable({
    startY: 34,
    showHead: 'everyPage',
    head,
    body: body.map(b => b.cells),
    margin: { left: 10, right: 10 },
    styles: { fontSize: FONT_SIZE, cellPadding: 1.6, valign: 'top', overflow: 'linebreak', lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: [26, 79, 255], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    columnStyles,
    didParseCell: (data) => {
      if (data.section !== 'body') return
      // Único elemento colorido: o pequeno selo de Resultado (coluna 0) —
      // o resto da linha permanece em branco/preto para manter a leitura limpa.
      if (data.column.index === 0) {
        const statusVal = data.cell.raw?._status
        const cor = STATUS_BADGE[statusVal]
        if (cor) {
          data.cell.styles.fillColor = cor.fill
          data.cell.styles.textColor = cor.text
          data.cell.styles.fontStyle = 'bold'
        }
      }
    },
  })

  addFooter(doc, true)
  doc.save('negociacao_sindical_' + new Date().toISOString().slice(0, 10) + '.pdf')
}

export function gerarPDFClausulas(clausulas, instrumento) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  addHeader(doc,
    (instrumento?.tipo || '') + ' — ' + (instrumento?.nome || 'Cláusulas'),
    'Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' | ' + clausulas.length + ' cláusula(s)'
  )
  doc.autoTable({
    startY: 36,
    showHead: 'everyPage',
    head: [['Nº', 'Título', 'Categoria', 'Conteúdo']],
    body: clausulas.map(c => [
      c.numero || '',
      c.titulo || '',
      c.categoria || '',
      c.conteudo || '',
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [26, 79, 255], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 45 }, 2: { cellWidth: 30 }, 3: { cellWidth: 97 } },
  })
  addFooter(doc, false)
  doc.save((instrumento?.nome || 'clausulas') + '_clausulas.pdf')
}
