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
  doc.setFillColor(26, 79, 255); doc.rect(0, 0, 210, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text('Motor CCT', 14, 11)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize(title, 180), 14, 19)
  if (subtitle) doc.text(subtitle, 14, 26)
  doc.setTextColor(0, 0, 0)
}

function addFooter(doc, isLandscape) {
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

// Renderiza segmentos coloridos dentro de uma célula jsPDF
function renderSegmentosColoridos(doc, segs, cellX, cellY, cellW, cellH, fontSize) {
  if (!segs||segs.length===0) return
  doc.setFontSize(fontSize)
  const pad=1.5, x0=cellX+pad, maxX=cellX+cellW-pad, maxY=cellY+cellH-0.5
  const lineH=fontSize*0.42
  let cx=x0, cy=cellY+pad+lineH
  for (const seg of segs) {
    if (cy>maxY) break
    if (seg.type==='add') doc.setTextColor(22,101,52)
    else if (seg.type==='rem') doc.setTextColor(109,40,217)
    else doc.setTextColor(40,40,40)
    for (const token of seg.text.split(/(\s+)/)) {
      if (!token) continue
      const tw=doc.getTextWidth(token), isSpace=/^\s+$/.test(token)
      if (isSpace) { if(cx+tw>maxX){cx=x0;cy+=lineH}else cx+=tw; continue }
      if (cx+tw>maxX&&cx>x0) { cx=x0; cy+=lineH }
      if (cy>maxY) break
      doc.text(token,cx,cy)
      if (seg.type==='rem') {
        doc.setDrawColor(109,40,217); doc.setLineWidth(0.15)
        doc.line(cx,cy-lineH*0.4,cx+tw,cy-lineH*0.4)
      }
      cx+=tw
    }
    if (cy>maxY) break
  }
  doc.setTextColor(0,0,0); doc.setDrawColor(0,0,0); doc.setLineWidth(0.2)
}

export function gerarPDFComparativo(resultado, instrumentoA, instrumentoB) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' })
  const nomeA = instrumentoA?.nome || 'Instrumento A'
  const nomeB = instrumentoB?.nome || 'Instrumento B'
  addHeader(doc, 'Comparativo: ' + nomeA + ' vs ' + nomeB, 'Gerado em ' + new Date().toLocaleDateString('pt-BR'))

  const STATUS_BADGE = {
    'INALTERADA':{ fill:[209,250,229], text:[22,101,52]  },
    'ALTERADA':  { fill:[219,234,254], text:[29,78,216]  },
    'SUPRIMIDA': { fill:[241,245,249], text:[71,85,105]  },
    'NOVA':      { fill:[243,232,255], text:[109,40,217] },
  }
  const FONT_SIZE = 6.5

  // ── Armazena segs DENTRO do objeto célula para evitar dependência de índice de linha
  const body = resultado.map(r => {
    const hasDiff = r.status.label === 'ALTERADA'
    let segsA = null, segsB = null
    if (hasDiff) {
      const tA = (r.clausulaA?.conteudo||'').slice(0,500)
      const tB = (r.clausulaB?.conteudo||'').slice(0,500)
      ;({ segsA, segsB } = computeSegmentos(tA, tB))
    }
    return [
      { content: r.status.label },
      { content: r.clausulaA?.numero || '' },
      { content: r.clausulaA?.titulo || '' },
      { content: (r.clausulaA?.conteudo||'').slice(0,500), _segs: segsA },
      { content: r.clausulaB?.numero || '' },
      { content: r.clausulaB?.titulo || '' },
      { content: (r.clausulaB?.conteudo||'').slice(0,500), _segs: segsB },
    ]
  })

  doc.autoTable({
    startY: 36,
    head: [['Status','Nº',nomeA.slice(0,28)+'\nTítulo',nomeA.slice(0,28)+'\nConteúdo','Nº',nomeB.slice(0,28)+'\nTítulo',nomeB.slice(0,28)+'\nConteúdo']],
    body,
    styles: { fontSize: FONT_SIZE, cellPadding: 1.5, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [26,79,255], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    columnStyles: { 0:{cellWidth:22}, 1:{cellWidth:12}, 2:{cellWidth:36}, 3:{cellWidth:65}, 4:{cellWidth:12}, 5:{cellWidth:36}, 6:{cellWidth:65} },

    didParseCell: (data) => {
      if (data.section !== 'body') return
      if (data.column.index === 0) {
        const cor = STATUS_BADGE[data.cell.raw?.content]
        if (cor) { data.cell.styles.fillColor=cor.fill; data.cell.styles.textColor=cor.text; data.cell.styles.fontStyle='bold' }
      }
      // Torna o texto original invisível para células com diff — o didDrawCell reescreve colorido
      if ((data.column.index===3||data.column.index===6) && data.cell.raw?._segs) {
        data.cell.styles.textColor = [255,255,255]
      }
    },

    didDrawCell: (data) => {
      if (data.section !== 'body') return
      if (data.column.index!==3 && data.column.index!==6) return
      const segs = data.cell.raw?._segs
      if (!segs||segs.length===0) return
      renderSegmentosColoridos(doc, segs, data.cell.x, data.cell.y, data.cell.width, data.cell.height, FONT_SIZE)
    },
  })

  const finalY = doc.lastAutoTable.finalY + 4
  if (finalY < 200) {
    doc.setFontSize(7); doc.setTextColor(80,80,80); doc.text('Legenda: ',14,finalY)
    doc.setTextColor(109,40,217); doc.text('texto removido (tachado) = estava no instrumento A',32,finalY)
    doc.setTextColor(22,101,52); doc.text('texto adicionado (verde) = novo no instrumento B',14,finalY+4)
    doc.setTextColor(0,0,0)
  }

  addFooter(doc, true)
  doc.save('comparativo_' + nomeA + '_vs_' + nomeB + '.pdf')
}
