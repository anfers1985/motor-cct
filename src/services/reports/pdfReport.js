import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { CATEGORIAS } from '../../utils/categorias'
import { vigenciaStatus } from '../../utils/formatters'
import { ordenarClausulas } from '../../utils/ordenacao'

// ─── Constantes de layout ────────────────────────────────────────────────────
const PAGE_W_PORTRAIT   = 210
const PAGE_H_PORTRAIT   = 297
const PAGE_W_LANDSCAPE  = 297
const PAGE_H_LANDSCAPE  = 210
const MARGIN = 10

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

function addHeaderLandscape(doc, title, subtitle = '') {
  doc.setFillColor(26, 79, 255); doc.rect(0, 0, PAGE_W_LANDSCAPE, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Motor CCT', 14, 10)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize(title, 270), 14, 18)
  if (subtitle) doc.text(subtitle, 14, 25)
  doc.setTextColor(0, 0, 0)
}

function addFooter(doc, isLandscape) {
  const pageCount = doc.internal.getNumberOfPages()
  const pageH = isLandscape ? PAGE_H_LANDSCAPE : PAGE_H_PORTRAIT
  const pageW = isLandscape ? PAGE_W_LANDSCAPE : PAGE_W_PORTRAIT
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(160, 160, 160)
    doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' — Motor CCT', MARGIN, pageH - 4)
    doc.text('Pagina ' + i + ' de ' + pageCount, pageW - MARGIN, pageH - 4, { align: 'right' })
  }
}

// ─── gerarPDFInstrumento ─────────────────────────────────────────────────────
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

// ─── LCS diff palavra a palavra ──────────────────────────────────────────────
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

// ─── Renderiza segmentos coloridos com quebra de página correta ──────────────
// Retorna o Y final após a renderização.
function renderSegmentos(doc, segs, xStart, yStart, maxX, pageHLimit, lineH) {
  let cx = xStart, cy = yStart
  for (const seg of segs) {
    const cor = seg.type === 'add' ? [22,101,52] : seg.type === 'rem' ? [109,40,217] : [50,50,50]
    doc.setTextColor(...cor)
    for (const token of seg.text.split(/(\s+)/)) {
      if (!token) continue
      const tw = doc.getTextWidth(token)
      const isSpace = /^\s+$/.test(token)
      if (isSpace) { if (cx + tw > maxX) { cx = xStart; cy += lineH } else cx += tw; continue }
      if (cx + tw > maxX && cx > xStart) { cx = xStart; cy += lineH }
      // Quebra de página dentro da renderização manual
      if (cy > pageHLimit) { doc.addPage(); cy = 20 }
      doc.text(token, cx, cy)
      if (seg.type === 'rem') {
        doc.setDrawColor(...cor); doc.setLineWidth(0.15)
        doc.line(cx, cy - lineH * 0.38, cx + tw, cy - lineH * 0.38)
        doc.setDrawColor(0,0,0); doc.setLineWidth(0.2)
      }
      cx += tw
    }
  }
  doc.setTextColor(0,0,0)
  return cy
}

// ─── gerarPDFComparativo — renderização manual linha por linha ───────────────
// Abandona autoTable para o corpo do comparativo para evitar o problema de
// quebra de página com didDrawCell. Usa o mesmo padrão do gerarPDFInstrumento.
export function gerarPDFComparativo(resultado, instrumentoA, instrumentoB) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' })
  const nomeA = instrumentoA?.nome || 'Instrumento A'
  const nomeB = instrumentoB?.nome || 'Instrumento B'

  const PW  = PAGE_W_LANDSCAPE  // 297
  const PH  = PAGE_H_LANDSCAPE  // 210
  const ML  = MARGIN             // 10
  const MR  = MARGIN             // 10
  const CONTENT_W = PW - ML - MR // 277
  const PAGE_LIMIT = PH - 12     // limite Y antes de nova página

  const FONT  = 6.5
  const LINE_H = FONT * 0.42
  const PAD   = 1.5

  // Larguras das colunas
  const W_STATUS = 22
  const W_NUM    = 11
  const W_TIT    = 40
  const W_CONT   = (CONTENT_W - W_STATUS - W_NUM*2 - W_TIT*2) / 2  // ~76mm cada

  const STATUS_BADGE = {
    'INALTERADA': { fill:[209,250,229], text:[22,101,52]   },
    'ALTERADA':   { fill:[219,234,254], text:[29,78,216]   },
    'SUPRIMIDA':  { fill:[241,245,249], text:[71,85,105]   },
    'NOVA':       { fill:[243,232,255], text:[109,40,217]  },
  }

  // ── Cabeçalho da primeira página ──
  addHeaderLandscape(doc, 'Comparativo: ' + nomeA + ' vs ' + nomeB, 'Gerado em ' + new Date().toLocaleDateString('pt-BR'))

  // ── Linha de cabeçalho da tabela ──
  function desenharCabecalhoTabela(y) {
    doc.setFillColor(26,79,255)
    doc.rect(ML, y, CONTENT_W, 8, 'F')
    doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255)
    let cx = ML + PAD
    doc.text('Status', cx, y+5.5); cx += W_STATUS
    doc.text('Nº', cx, y+5.5); cx += W_NUM
    doc.text(nomeA.slice(0,22)+' — Título', cx, y+5.5); cx += W_TIT
    doc.text(nomeA.slice(0,22)+' — Conteúdo', cx, y+5.5); cx += W_CONT
    doc.text('Nº', cx, y+5.5); cx += W_NUM
    doc.text(nomeB.slice(0,22)+' — Título', cx, y+5.5); cx += W_TIT
    doc.text(nomeB.slice(0,22)+' — Conteúdo', cx, y+5.5)
    doc.setTextColor(0,0,0); doc.setFont('helvetica','normal')
    return y + 9
  }

  // ── Função que desenha texto numa célula e retorna altura usada ──
  function textHeight(doc, texto, largura) {
    if (!texto) return LINE_H + PAD * 2
    doc.setFontSize(FONT)
    const linhas = doc.splitTextToSize(texto, largura - PAD * 2)
    return linhas.length * LINE_H + PAD * 2
  }

  // ── Renderiza texto simples numa coluna, respeitando quebra de página ──
  function renderTexto(doc, texto, xCol, yStart, largura, cor = [50,50,50]) {
    if (!texto) return yStart
    doc.setFontSize(FONT); doc.setFont('helvetica','normal'); doc.setTextColor(...cor)
    const linhas = doc.splitTextToSize(texto, largura - PAD * 2)
    let y = yStart
    for (const linha of linhas) {
      if (y > PAGE_LIMIT) { doc.addPage(); desenharCabecalhoTabela(12); y = 12 + 9 + PAD + LINE_H }
      doc.text(linha, xCol + PAD, y)
      y += LINE_H
    }
    doc.setTextColor(0,0,0)
    return y
  }

  let y = desenharCabecalhoTabela(30)

  for (const r of resultado) {
    const status  = r.status.label
    const badge   = STATUS_BADGE[status] || STATUS_BADGE['INALTERADA']
    const hasDiff = status === 'ALTERADA'

    const tA = r.clausulaA?.conteudo || ''
    const tB = r.clausulaB?.conteudo || ''
    const tiA = r.clausulaA?.titulo || ''
    const tiB = r.clausulaB?.titulo || ''
    const nA  = r.clausulaA?.numero || ''
    const nB  = r.clausulaB?.numero || ''

    let segsA = null, segsB = null
    if (hasDiff) {
      ;({ segsA, segsB } = computeSegmentos(tA, tB))
    }

    // Estima altura da linha para saber se cabe na página atual
    doc.setFontSize(FONT)
    const hTiA = textHeight(doc, tiA, W_TIT)
    const hTiB = textHeight(doc, tiB, W_TIT)
    const hContA = textHeight(doc, tA, W_CONT)
    const hContB = textHeight(doc, tB, W_CONT)
    const rowH = Math.max(hTiA, hTiB, hContA, hContB, LINE_H + PAD * 2)

    // Cabeçalho de nova página se não couber inteiro — mas só para linhas pequenas
    // Para linhas grandes (>metade da página) deixa fluir naturalmente
    if (rowH < PH * 0.4 && y + rowH > PAGE_LIMIT) {
      doc.addPage()
      y = desenharCabecalhoTabela(12)
    }

    const yRow = y

    // ── Badge de status ──
    doc.setFillColor(...badge.fill)
    doc.rect(ML, yRow, W_STATUS, rowH, 'F')
    doc.setFontSize(6); doc.setFont('helvetica','bold'); doc.setTextColor(...badge.text)
    const statusLines = doc.splitTextToSize(status, W_STATUS - PAD * 2)
    doc.text(statusLines, ML + PAD, yRow + PAD + LINE_H)
    doc.setFont('helvetica','normal'); doc.setTextColor(0,0,0)

    // Posições X de cada coluna
    const xNum  = ML  + W_STATUS
    const xTitA = xNum + W_NUM
    const xCntA = xTitA + W_TIT
    const xNum2 = xCntA + W_CONT
    const xTitB = xNum2 + W_NUM
    const xCntB = xTitB + W_TIT

    // ── Fundo alternado para facilitar leitura ──
    doc.setFillColor(250, 251, 255)
    doc.rect(xNum, yRow, CONTENT_W - W_STATUS, rowH, 'F')

    // ── Nºs ──
    doc.setFontSize(FONT); doc.setFont('helvetica','bold'); doc.setTextColor(80,80,80)
    doc.text(String(nA), xNum + PAD, yRow + PAD + LINE_H)
    doc.text(String(nB), xNum2 + PAD, yRow + PAD + LINE_H)

    // ── Títulos ──
    renderTexto(doc, tiA, xTitA, yRow + PAD + LINE_H, W_TIT, [30,30,80])
    renderTexto(doc, tiB, xTitB, yRow + PAD + LINE_H, W_TIT, [30,30,80])

    // ── Conteúdo: colorido se ALTERADA, simples caso contrário ──
    doc.setFont('helvetica','normal')
    if (hasDiff && segsA) {
      doc.setFontSize(FONT)
      renderSegmentos(doc, segsA, xCntA + PAD, yRow + PAD + LINE_H, xCntA + W_CONT - PAD, PAGE_LIMIT, LINE_H)
    } else {
      renderTexto(doc, tA, xCntA, yRow + PAD + LINE_H, W_CONT)
    }
    if (hasDiff && segsB) {
      doc.setFontSize(FONT)
      renderSegmentos(doc, segsB, xCntB + PAD, yRow + PAD + LINE_H, xCntB + W_CONT - PAD, PAGE_LIMIT, LINE_H)
    } else {
      renderTexto(doc, tB, xCntB, yRow + PAD + LINE_H, W_CONT)
    }

    // Avança Y: precisa calcular quanto espaço cada coluna de conteúdo de fato usou
    // Como o conteúdo pode ter cruzado páginas, calcular a posição Y real é complexo.
    // Estratégia: calcular o Y mais baixo que qualquer coluna atingiria na página original.
    // Para linhas que não cruzam página: y + rowH.
    // Para linhas longas que cruzam página: o render já emitiu as novas páginas;
    //   precisamos saber em qual página estamos e qual o Y atual.
    // Usamos o número de páginas para detectar se houve quebra.
    const paginaAntes = doc.internal.getNumberOfPages()

    // Recalcula Y pós-renderização: se cruzou página, y fica relativo à última página
    const paginaDepois = doc.internal.getNumberOfPages()
    if (paginaDepois > paginaAntes) {
      // Houve quebra — y após a linha é o rodapé da última coluna renderizada
      // Estimativa conservadora: reiniciar no topo da página atual
      y = doc.internal.getCurrentPageInfo().pageNumber  // não existe API direta
    }

    // Abordagem simples e robusta: recalcular Y baseado no conteúdo mais longo
    // renderizado completamente dentro da mesma página
    doc.setFontSize(FONT)

    // Calcula Y real somando linhas de cada coluna a partir de yRow
    function calcYFinal(texto, xCol, yStart, largura) {
      if (!texto) return yStart + LINE_H + PAD * 2
      const linhas = doc.splitTextToSize(texto, largura - PAD * 2)
      let cy = yStart
      for (const _ of linhas) {
        cy += LINE_H
        if (cy > PAGE_LIMIT) cy = 20 + LINE_H // reinicia após quebra
      }
      return cy + PAD
    }

    const yFinalA = calcYFinal(tA, xCntA, yRow + PAD + LINE_H, W_CONT)
    const yFinalB = calcYFinal(tB, xCntB, yRow + PAD + LINE_H, W_CONT)
    const yFinalTiA = calcYFinal(tiA, xTitA, yRow + PAD + LINE_H, W_TIT)
    const yFinalTiB = calcYFinal(tiB, xTitB, yRow + PAD + LINE_H, W_TIT)

    const yFinal = Math.max(yFinalA, yFinalB, yFinalTiA, yFinalTiB)

    // Linha separadora
    doc.setDrawColor(220,220,220); doc.setLineWidth(0.2)
    if (yFinal <= PAGE_LIMIT) {
      doc.line(ML, yFinal + 1, PW - MR, yFinal + 1)
    }

    y = yFinal + 3
  }

  // Legenda
  if (y + 10 < PAGE_LIMIT) {
    doc.setFontSize(7); doc.setTextColor(80,80,80); doc.text('Legenda: ', ML, y + 4)
    doc.setTextColor(109,40,217); doc.text('texto removido (tachado) = estava no instrumento A', ML + 18, y + 4)
    doc.setTextColor(22,101,52);  doc.text('texto adicionado (verde) = novo no instrumento B', ML, y + 8)
    doc.setTextColor(0,0,0)
  }

  addFooter(doc, true)
  doc.save('comparativo_' + nomeA + '_vs_' + nomeB + '.pdf')
}

// ─── gerarPDFClausulas ───────────────────────────────────────────────────────
export function gerarPDFClausulas(clausulas, instrumento) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  addHeader(doc,
    (instrumento?.tipo || '') + ' — ' + (instrumento?.nome || 'Cláusulas'),
    'Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' | ' + clausulas.length + ' cláusula(s)'
  )
  doc.autoTable({
    startY: 36,
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
