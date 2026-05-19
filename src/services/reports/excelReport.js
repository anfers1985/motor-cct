import * as XLSX from 'xlsx'
import { vigenciaStatus } from '../utils/formatters'

function statusVigencia(fim) {
  const s = vigenciaStatus(fim)
  if (s === 'vencido') return 'Vencido'
  if (s === 'alerta') return 'Vence em breve'
  if (s === 'vigente') return 'Vigente'
  return 'Indefinido'
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

export async function gerarExcelInstrumento(instrumento, clausulas, empresa, operacao, sindicatoLaboral, sindicatoPatronal) {
  const wb = XLSX.utils.book_new()
  const status = statusVigencia(instrumento?.vigencia_fim)
  const ordenadas = ordenarClausulas(clausulas)

  const rows = ordenadas.map(c => ({
    'Empresa': empresa?.razao_social || '',
    'CNPJ Empresa': empresa?.cnpj || '',
    'Operação': operacao?.nome || '',
    'Código Operação': operacao?.codigo || '',
    'UF Operação': operacao?.estado || '',
    'Sindicato Laboral': sindicatoLaboral?.razao_social || '',
    'CNPJ Sind. Lab.': sindicatoLaboral?.cnpj || '',
    'Sindicato Patronal': sindicatoPatronal?.razao_social || '',
    'CNPJ Sind. Pat.': sindicatoPatronal?.cnpj || '',
    'Federação': sindicatoLaboral?.federacao || '',
    'Confederação': sindicatoLaboral?.confederacao || '',
    'Tipo Instrumento': instrumento?.tipo || '',
    'Nome Instrumento': instrumento?.nome || '',
    'Vigência Início': instrumento?.vigencia_inicio || '',
    'Vigência Fim': instrumento?.vigencia_fim || '',
    'Status Vigência': status,
    'Nº Cláusula': c.numero || '',
    'Título da Cláusula': c.titulo || '',
    'Categoria': c.categoria || '',
    'Subcategoria': c.subcategoria || '',
    'Valor Monetário (referência)': c.valor_monetario || '',
    'Percentual (referência)': c.percentual || '',
    'Vigência Específica da Cláusula': c.vigencia_especifica || '',
    'Conteúdo Integral da Cláusula': c.conteudo || '',
    'Tags': (c.tags || []).join(', '),
    'Observações / Contextualização': c.observacoes || '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)

  // Ajustar largura das colunas
  ws['!cols'] = [
    { wch: 35 }, { wch: 18 }, { wch: 25 }, { wch: 15 }, { wch: 8 },
    { wch: 45 }, { wch: 18 }, { wch: 45 }, { wch: 18 },
    { wch: 25 }, { wch: 20 }, { wch: 12 }, { wch: 35 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 18 }, { wch: 40 }, { wch: 22 }, { wch: 28 },
    { wch: 30 }, { wch: 20 }, { wch: 20 },
    { wch: 80 }, { wch: 25 }, { wch: 60 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Cláusulas')

  // Aba resumo
  const cats = {}
  ordenadas.forEach(c => { cats[c.categoria] = (cats[c.categoria] || 0) + 1 })
  const resumo = [
    { 'Campo': 'Instrumento', 'Valor': instrumento?.nome || '' },
    { 'Campo': 'Tipo', 'Valor': instrumento?.tipo || '' },
    { 'Campo': 'Empresa', 'Valor': empresa?.razao_social || '' },
    { 'Campo': 'Operação', 'Valor': operacao?.nome || '' },
    { 'Campo': 'Sindicato Laboral', 'Valor': sindicatoLaboral?.razao_social || '' },
    { 'Campo': 'Sindicato Patronal', 'Valor': sindicatoPatronal?.razao_social || '' },
    { 'Campo': 'Vigência', 'Valor': `${instrumento?.vigencia_inicio || ''} a ${instrumento?.vigencia_fim || ''}` },
    { 'Campo': 'Status', 'Valor': status },
    { 'Campo': 'Total de Cláusulas', 'Valor': ordenadas.length },
    { 'Campo': '', 'Valor': '' },
    { 'Campo': '--- POR CATEGORIA ---', 'Valor': '' },
    ...Object.entries(cats).map(([cat, qtd]) => ({ 'Campo': cat, 'Valor': qtd }))
  ]
  const wsR = XLSX.utils.json_to_sheet(resumo)
  wsR['!cols'] = [{ wch: 30 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, wsR, 'Resumo')

  XLSX.writeFile(wb, `${instrumento?.nome || 'instrumento'}.xlsx`)
}

export async function gerarExcelMultiplo(instrumentos, todasClausulas, empresas, operacoes, sindicatos) {
  const wb = XLSX.utils.book_new()

  // Mapa para lookup rápido
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
    const status = statusVigencia(inst.vigencia_fim)

    return {
      'Empresa': emp.razao_social || '',
      'CNPJ Empresa': emp.cnpj || '',
      'Operação': op.nome || '',
      'Código Operação': op.codigo || '',
      'UF Operação': op.estado || '',
      'Sindicato Laboral': sLab.razao_social || '',
      'Sindicato Patronal': sPat.razao_social || '',
      'Tipo Instrumento': inst.tipo || '',
      'Nome Instrumento': inst.nome || '',
      'Vigência Início': inst.vigencia_inicio || '',
      'Vigência Fim': inst.vigencia_fim || '',
      'Status Vigência': status,
      'Nº Cláusula': c.numero || '',
      'Título da Cláusula': c.titulo || '',
      'Categoria': c.categoria || '',
      'Subcategoria': c.subcategoria || '',
      'Valor Monetário (referência)': c.valor_monetario || '',
      'Percentual (referência)': c.percentual || '',
      'Vigência Específica da Cláusula': c.vigencia_especifica || '',
      'Conteúdo Integral da Cláusula': c.conteudo || '',
      'Tags': (c.tags || []).join(', '),
      'Observações / Contextualização': c.observacoes || '',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 35 }, { wch: 18 }, { wch: 25 }, { wch: 15 }, { wch: 8 },
    { wch: 45 }, { wch: 45 }, { wch: 12 }, { wch: 35 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 18 }, { wch: 40 }, { wch: 22 }, { wch: 28 },
    { wch: 30 }, { wch: 20 }, { wch: 20 },
    { wch: 80 }, { wch: 25 }, { wch: 60 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Cláusulas')

  // Resumo por instrumento
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
  wsR['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 28 }, { wch: 8 }]
  XLSX.utils.book_append_sheet(wb, wsR, 'Resumo por Instrumento')

  const nome = `relatorio_motor_cct_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, nome)
}

export async function gerarExcelComparativo(resultado, instrumentoA, instrumentoB) {
  const wb = XLSX.utils.book_new()

  const completo = resultado.map(r => ({
    'Status': r.status.label,
    'Categoria A': r.clausulaA?.categoria || '',
    'Nº A': r.clausulaA?.numero || '',
    'Título A': r.clausulaA?.titulo || '',
    'Conteúdo Integral A': r.clausulaA?.conteudo || '',
    'Categoria B': r.clausulaB?.categoria || '',
    'Nº B': r.clausulaB?.numero || '',
    'Título B': r.clausulaB?.titulo || '',
    'Conteúdo Integral B': r.clausulaB?.conteudo || '',
    'Similaridade': r.score ? `${(r.score * 100).toFixed(0)}%` : '',
  }))
  const ws = XLSX.utils.json_to_sheet(completo)
  ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 35 }, { wch: 80 }, { wch: 22 }, { wch: 16 }, { wch: 35 }, { wch: 80 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Comparativo Completo')

  const alteradas = resultado
    .filter(r => ['ALTERADA', 'MUITO ALTERADA', 'SUBSTITUÍDA'].includes(r.status.label))
    .map(r => ({
      'Status': r.status.label,
      'Nº A': r.clausulaA?.numero || '',
      'Título A': r.clausulaA?.titulo || '',
      'Conteúdo Antes (Integral)': r.clausulaA?.conteudo || '',
      'Nº B': r.clausulaB?.numero || '',
      'Título B': r.clausulaB?.titulo || '',
      'Conteúdo Depois (Integral)': r.clausulaB?.conteudo || '',
    }))
  const ws2 = XLSX.utils.json_to_sheet(alteradas)
  ws2['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 35 }, { wch: 80 }, { wch: 16 }, { wch: 35 }, { wch: 80 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Cláusulas Alteradas')

  const novasSuprimidas = resultado
    .filter(r => ['NOVA', 'SUPRIMIDA'].includes(r.status.label))
    .map(r => ({
      'Status': r.status.label,
      'Nº': (r.clausulaA || r.clausulaB)?.numero || '',
      'Título': (r.clausulaA || r.clausulaB)?.titulo || '',
      'Conteúdo Integral': (r.clausulaA || r.clausulaB)?.conteudo || '',
    }))
  const ws3 = XLSX.utils.json_to_sheet(novasSuprimidas)
  ws3['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 35 }, { wch: 80 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Novas e Suprimidas')

  const contagem = {}
  resultado.forEach(r => { contagem[r.status.label] = (contagem[r.status.label] || 0) + 1 })
  const resumo = [
    { Métrica: 'Instrumento A', Valor: instrumentoA?.nome },
    { Métrica: 'Status Instrumento A', Valor: statusVigencia(instrumentoA?.vigencia_fim) },
    { Métrica: 'Instrumento B', Valor: instrumentoB?.nome },
    { Métrica: 'Status Instrumento B', Valor: statusVigencia(instrumentoB?.vigencia_fim) },
    { Métrica: 'Total cláusulas A', Valor: resultado.filter(r => r.clausulaA).length },
    { Métrica: 'Total cláusulas B', Valor: resultado.filter(r => r.clausulaB).length },
    { Métrica: '', Valor: '' },
    ...Object.entries(contagem).map(([k, v]) => ({ Métrica: k, Valor: v }))
  ]
  const ws4 = XLSX.utils.json_to_sheet(resumo)
  ws4['!cols'] = [{ wch: 28 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, ws4, 'Resumo Executivo')

  XLSX.writeFile(wb, `comparativo_${instrumentoA?.nome}_vs_${instrumentoB?.nome}.xlsx`)
}
