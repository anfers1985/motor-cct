import * as XLSX from 'xlsx'
import { vigenciaStatus } from '../../utils/formatters'
import { ordenarClausulas } from '../../utils/ordenacao'

function statusVigencia(fim) {
  const s = vigenciaStatus(fim)
  if (s === 'vencido') return 'Vencido'
  if (s === 'alerta') return 'Vence em breve'
  if (s === 'vigente') return 'Vigente'
  return 'Indefinido'
}

// ─── FIX COL M: normaliza número da cláusula para formato curto e consistente ──
const ORDINAIS_NUM = {
  'PRIMEIRA':1,'SEGUNDA':2,'TERCEIRA':3,'QUARTA':4,'QUINTA':5,
  'SEXTA':6,'SÉTIMA':7,'OITAVA':8,'NONA':9,'DÉCIMA':10,
  'DÉCIMA PRIMEIRA':11,'DÉCIMA SEGUNDA':12,'DÉCIMA TERCEIRA':13,
  'DÉCIMA QUARTA':14,'DÉCIMA QUINTA':15,'DÉCIMA SEXTA':16,
  'DÉCIMA SÉTIMA':17,'DÉCIMA OITAVA':18,'DÉCIMA NONA':19,
  'VIGÉSIMA':20,'VIGÉSIMA PRIMEIRA':21,'VIGÉSIMA SEGUNDA':22,
  'VIGÉSIMA TERCEIRA':23,'VIGÉSIMA QUARTA':24,'VIGÉSIMA QUINTA':25,
  'VIGÉSIMA SEXTA':26,'VIGÉSIMA SÉTIMA':27,'VIGÉSIMA OITAVA':28,
  'VIGÉSIMA NONA':29,'TRIGÉSIMA':30,'TRIGÉSIMA PRIMEIRA':31,
  'TRIGÉSIMA SEGUNDA':32,'TRIGÉSIMA TERCEIRA':33,'TRIGÉSIMA QUARTA':34,
  'TRIGÉSIMA QUINTA':35,'TRIGÉSIMA SEXTA':36,'TRIGÉSIMA SÉTIMA':37,
  'TRIGÉSIMA OITAVA':38,'TRIGÉSIMA NONA':39,'QUADRAGÉSIMA':40,
  'QUADRAGÉSIMA PRIMEIRA':41,'QUADRAGÉSIMA SEGUNDA':42,'QUADRAGÉSIMA TERCEIRA':43,
  'QUADRAGÉSIMA QUARTA':44,'QUADRAGÉSIMA QUINTA':45,'QUADRAGÉSIMA SEXTA':46,
  'QUADRAGÉSIMA SÉTIMA':47,'QUADRAGÉSIMA OITAVA':48,'QUADRAGÉSIMA NONA':49,
  'QUINQUAGÉSIMA':50,'QUINQUAGÉSIMA PRIMEIRA':51,'QUINQUAGÉSIMA SEGUNDA':52,
  'QUINQUAGÉSIMA TERCEIRA':53,'QUINQUAGÉSIMA QUARTA':54,'QUINQUAGÉSIMA QUINTA':55,
  'QUINQUAGÉSIMA SEXTA':56,'QUINQUAGÉSIMA SÉTIMA':57,'QUINQUAGÉSIMA OITAVA':58,
  'QUINQUAGÉSIMA NONA':59,'SEXAGÉSIMA':60,'SEXAGÉSIMA PRIMEIRA':61,
  'SEXAGÉSIMA SEGUNDA':62,'SEXAGÉSIMA TERCEIRA':63,'SEXAGÉSIMA QUARTA':64,
  'SEXAGÉSIMA QUINTA':65,'SEXAGÉSIMA SEXTA':66,'SEXAGÉSIMA SÉTIMA':67,
  'SEXAGÉSIMA OITAVA':68,'SEXAGÉSIMA NONA':69,'SEPTUAGÉSIMA':70,
  'SEPTUAGÉSIMA PRIMEIRA':71,'SEPTUAGÉSIMA SEGUNDA':72,'SEPTUAGÉSIMA TERCEIRA':73,
  'SEPTUAGÉSIMA QUARTA':74,'SEPTUAGÉSIMA QUINTA':75,'SEPTUAGÉSIMA SEXTA':76,
  'SEPTUAGÉSIMA SÉTIMA':77,'SEPTUAGÉSIMA OITAVA':78,'SEPTUAGÉSIMA NONA':79,
  'OCTAGÉSIMA':80,'NONAGÉSIMA':90,'CENTÉSIMA':100,
}

function formatarNumeroClausula(numero) {
  if (!numero) return ''
  const s = String(numero).trim()
  // Cláusula CCP (adendo): 1a, 2a, 10a, 1º → "Adendo 1a"
  if (/^\d+[aº°]/i.test(s)) return `Adendo ${s}`
  // Ordinal por extenso → número ordinal: "PRIMEIRA" → "1ª"
  const n = ORDINAIS_NUM[s.toUpperCase()]
  if (n) return `${n}ª`
  // Romano ou arábico puro
  const arab = s.match(/^(\d+)/)
  if (arab) return `${arab[1]}ª`
  return s
}

// ─── FIX COL Q: formata valor monetário legível ────────────────────────────────
function formatarValorMonetario(valor) {
  if (!valor && valor !== 0) return ''
  const s = String(valor).trim()
  if (!s || s === 'null') return ''
  try {
    // JSON dict: {"Auxiliar de Escritório":1664.62,...}
    if (s.startsWith('{')) {
      const obj = JSON.parse(s)
      return Object.entries(obj)
        .map(([k, v]) => `${k}: R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
        .join(' | ')
    }
    // JSON array: ["R$ 1.200,00","R$ 600,00"]
    if (s.startsWith('[')) {
      const arr = JSON.parse(s)
      return Array.isArray(arr) ? arr.join(' | ') : s
    }
    // Número simples: 1570.4
    const n = parseFloat(s)
    if (!isNaN(n) && s === String(n)) {
      return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    }
    // Texto com R$: "R$ 1.450,00"
    return s
  } catch {
    return s
  }
}

// ─── FIX COL T: prefixa conteúdo com identificador da cláusula ────────────────
function formatarConteudo(numero, titulo, conteudo) {
  const prefixo = numero ? `CLÁUSULA ${numero} — ${titulo || ''}\n\n` : ''
  return prefixo + (conteudo || '')
}

// ─── Monta uma linha do relatório ─────────────────────────────────────────────
function montarLinha(c, inst, emp, op, sLab, sPat) {
  const status = statusVigencia(inst?.vigencia_fim)
  return {
    'Empresa': emp?.razao_social || '',
    'CNPJ Empresa': emp?.cnpj || '',
    'Operação': op?.nome || '',
    'Código Operação': op?.codigo || '',
    'UF Operação': op?.estado || '',
    'Sindicato Laboral': sLab?.razao_social || '',
    'Sindicato Patronal': sPat?.razao_social || '',
    'Tipo Instrumento': inst?.tipo || '',
    'Nome Instrumento': inst?.nome || '',
    'Vigência Início': inst?.vigencia_inicio || '',
    'Vigência Fim': inst?.vigencia_fim || '',
    'Status Vigência': status,
    // FIX M: número padronizado
    'Nº Cláusula': formatarNumeroClausula(c.numero),
    'Título da Cláusula': c.titulo || '',
    'Categoria': c.categoria || '',
    'Subcategoria': c.subcategoria || '',
    // FIX Q: valor formatado legível
    'Valor Monetário': formatarValorMonetario(c.valor_monetario),
    // COL R: percentual (mantido como número para facilitar filtros)
    'Percentual (%)': c.percentual || '',
    // FIX S: header mais claro + mantém conteúdo original
    'Data/Prazo Específico da Cláusula': c.vigencia_especifica || '',
    // FIX T: conteúdo com identificador no início
    'Conteúdo Integral da Cláusula': formatarConteudo(c.numero, c.titulo, c.conteudo),
    'Tags': (c.tags || []).join(', '),
    'Observações Práticas (RH/Gestão)': c.observacoes || '',
  }
}

const COLS_WIDTHS = [
  { wch: 40 }, { wch: 18 }, { wch: 28 }, { wch: 15 }, { wch: 8 },
  { wch: 50 }, { wch: 50 }, { wch: 12 }, { wch: 40 },
  { wch: 14 }, { wch: 14 }, { wch: 14 },
  { wch: 10 }, { wch: 45 }, { wch: 25 }, { wch: 32 },
  { wch: 50 }, { wch: 14 }, { wch: 35 },
  { wch: 100 }, { wch: 25 }, { wch: 80 },
]

export async function gerarExcelInstrumento(instrumento, clausulas, empresa, operacao, sindicatoLaboral, sindicatoPatronal) {
  const wb = XLSX.utils.book_new()
  const ordenadas = ordenarClausulas(clausulas)

  const rows = ordenadas.map(c =>
    montarLinha(c, instrumento, empresa, operacao, sindicatoLaboral, sindicatoPatronal)
  )

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = COLS_WIDTHS
  XLSX.utils.book_append_sheet(wb, ws, 'Cláusulas')

  const cats = {}
  ordenadas.forEach(c => { cats[c.categoria] = (cats[c.categoria] || 0) + 1 })
  const resumo = [
    { 'Campo': 'Instrumento', 'Valor': instrumento?.nome || '' },
    { 'Campo': 'Tipo', 'Valor': instrumento?.tipo || '' },
    { 'Campo': 'Empresa', 'Valor': empresa?.razao_social || '' },
    { 'Campo': 'Operação', 'Valor': operacao?.nome || '' },
    { 'Campo': 'Sindicato Laboral', 'Valor': sindicatoLaboral?.razao_social || '' },
    { 'Campo': 'Sindicato Patronal', 'Valor': sindicatoPatronal?.razao_social || '' },
    { 'Campo': 'Vigência', 'Valor': (instrumento?.vigencia_inicio || '') + ' a ' + (instrumento?.vigencia_fim || '') },
    { 'Campo': 'Status', 'Valor': statusVigencia(instrumento?.vigencia_fim) },
    { 'Campo': 'Total de Cláusulas', 'Valor': ordenadas.length },
    { 'Campo': '', 'Valor': '' },
    { 'Campo': '--- CLÁUSULAS POR CATEGORIA ---', 'Valor': '' },
    ...Object.entries(cats).map(([cat, qtd]) => ({ 'Campo': cat, 'Valor': qtd }))
  ]
  const wsR = XLSX.utils.json_to_sheet(resumo)
  wsR['!cols'] = [{ wch: 35 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, wsR, 'Resumo')

  XLSX.writeFile(wb, (instrumento?.nome || 'instrumento') + '.xlsx')
}

export async function gerarExcelMultiplo(instrumentos, todasClausulas, empresas, operacoes, sindicatos) {
  const wb = XLSX.utils.book_new()

  const empMap = Object.fromEntries((empresas || []).map(e => [e.id, e]))
  const opMap = Object.fromEntries((operacoes || []).map(o => [o.id, o]))
  const sindMap = Object.fromEntries((sindicatos || []).map(s => [s.id, s]))
  const instMap = Object.fromEntries((instrumentos || []).map(i => [i.id, i]))

  const rows = ordenarClausulas(todasClausulas).map(c => {
    const inst = instMap[c.instrumento_id] || {}
    const emp = empMap[inst.empresa_id] || {}
    const op = opMap[inst.operacao_id] || {}
    const sLab = sindMap[inst.sindicato_laboral_id] || {}
    const sPat = sindMap[inst.sindicato_patronal_id] || {}
    return montarLinha(c, inst, emp, op, sLab, sPat)
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = COLS_WIDTHS
  XLSX.utils.book_append_sheet(wb, ws, 'Cláusulas')

  const porInst = {}
  todasClausulas.forEach(c => {
    const inst = instMap[c.instrumento_id]
    if (!inst) return
    if (!porInst[inst.id]) porInst[inst.id] = { inst, count: 0, cats: {} }
    porInst[inst.id].count++
    porInst[inst.id].cats[c.categoria] = (porInst[inst.id].cats[c.categoria] || 0) + 1
  })

  const resumo = Object.values(porInst).flatMap(({ inst, count, cats }) => [
    { 'Instrumento': inst.nome, 'Status': statusVigencia(inst.vigencia_fim), 'Categoria': '--- TOTAL ---', 'Qtd': count },
    ...Object.entries(cats).map(([cat, qtd]) => ({ 'Instrumento': inst.nome, 'Status': statusVigencia(inst.vigencia_fim), 'Categoria': cat, 'Qtd': qtd })),
    { 'Instrumento': '', 'Status': '', 'Categoria': '', 'Qtd': '' },
  ])
  const wsR = XLSX.utils.json_to_sheet(resumo)
  wsR['!cols'] = [{ wch: 45 }, { wch: 14 }, { wch: 30 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, wsR, 'Resumo por Instrumento')

  XLSX.writeFile(wb, 'relatorio_motor_cct_' + new Date().toISOString().slice(0, 10) + '.xlsx')
}

export async function gerarExcelComparativo(resultado, instrumentoA, instrumentoB) {
  const wb = XLSX.utils.book_new()

  const ws = XLSX.utils.json_to_sheet(resultado.map(r => ({
    'Status': r.status.label,
    'Nº A': formatarNumeroClausula(r.clausulaA?.numero),
    'Título A': r.clausulaA?.titulo || '',
    'Conteúdo Integral A': formatarConteudo(r.clausulaA?.numero, r.clausulaA?.titulo, r.clausulaA?.conteudo),
    'Nº B': formatarNumeroClausula(r.clausulaB?.numero),
    'Título B': r.clausulaB?.titulo || '',
    'Conteúdo Integral B': formatarConteudo(r.clausulaB?.numero, r.clausulaB?.titulo, r.clausulaB?.conteudo),
    'Similaridade': r.score ? (r.score * 100).toFixed(0) + '%' : '',
  })))
  ws['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 35 }, { wch: 100 }, { wch: 10 }, { wch: 35 }, { wch: 100 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Comparativo Completo')

  const ws2 = XLSX.utils.json_to_sheet(resultado.filter(r => ['ALTERADA', 'MUITO ALTERADA', 'SUBSTITUÍDA'].includes(r.status.label)).map(r => ({
    'Status': r.status.label,
    'Nº A': formatarNumeroClausula(r.clausulaA?.numero),
    'Título A': r.clausulaA?.titulo || '',
    'Conteúdo Antes': formatarConteudo(r.clausulaA?.numero, r.clausulaA?.titulo, r.clausulaA?.conteudo),
    'Nº B': formatarNumeroClausula(r.clausulaB?.numero),
    'Título B': r.clausulaB?.titulo || '',
    'Conteúdo Depois': formatarConteudo(r.clausulaB?.numero, r.clausulaB?.titulo, r.clausulaB?.conteudo),
  })))
  ws2['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 35 }, { wch: 100 }, { wch: 10 }, { wch: 35 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Cláusulas Alteradas')

  const ws3 = XLSX.utils.json_to_sheet(resultado.filter(r => ['NOVA', 'SUPRIMIDA'].includes(r.status.label)).map(r => ({
    'Status': r.status.label,
    'Nº': formatarNumeroClausula((r.clausulaA || r.clausulaB)?.numero),
    'Título': (r.clausulaA || r.clausulaB)?.titulo || '',
    'Conteúdo Integral': formatarConteudo(
      (r.clausulaA || r.clausulaB)?.numero,
      (r.clausulaA || r.clausulaB)?.titulo,
      (r.clausulaA || r.clausulaB)?.conteudo
    ),
  })))
  ws3['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 35 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Novas e Suprimidas')

  const contagem = {}
  resultado.forEach(r => { contagem[r.status.label] = (contagem[r.status.label] || 0) + 1 })
  const ws4 = XLSX.utils.json_to_sheet([
    { Métrica: 'Instrumento A', Valor: instrumentoA?.nome },
    { Métrica: 'Status A', Valor: statusVigencia(instrumentoA?.vigencia_fim) },
    { Métrica: 'Instrumento B', Valor: instrumentoB?.nome },
    { Métrica: 'Status B', Valor: statusVigencia(instrumentoB?.vigencia_fim) },
    { Métrica: 'Total cláusulas A', Valor: resultado.filter(r => r.clausulaA).length },
    { Métrica: 'Total cláusulas B', Valor: resultado.filter(r => r.clausulaB).length },
    { Métrica: '', Valor: '' },
    ...Object.entries(contagem).map(([k, v]) => ({ Métrica: k, Valor: v }))
  ])
  ws4['!cols'] = [{ wch: 30 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, ws4, 'Resumo Executivo')

  XLSX.writeFile(wb, 'comparativo_' + instrumentoA?.nome + '_vs_' + instrumentoB?.nome + '.xlsx')
}
