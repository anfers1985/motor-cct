import * as XLSX from 'xlsx'
import { vigenciaStatus } from '../../utils/formatters'
import { ordenarClausulas } from '../../utils/ordenacao'
import { normalizarSubcategoria } from '../../utils/categorias'

function statusVigencia(fim) {
  const s = vigenciaStatus(fim)
  if (s === 'vencido') return 'Vencido'
  if (s === 'alerta') return 'Vence em breve'
  if (s === 'vigente') return 'Vigente'
  return 'Indefinido'
}

// Deduplication by instrumento_id + numero + titulo
function dedupClausulas(clausulas) {
  const seen = new Set()
  return clausulas.filter(c => {
    const key = (c.instrumento_id || '') + '|||' + (c.numero || '').toUpperCase().trim() + '|||' + (c.titulo || '').trim().slice(0, 80)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Build content cell: "CLÁUSULA PRIMEIRA — TÍTULO\n\ntexto integral"
function conteudoCompleto(c) {
  const prefixo = c.numero ? 'CLÁUSULA ' + c.numero + (c.titulo ? ' — ' + c.titulo : '') + '\n\n' : ''
  return prefixo + (c.conteudo || '')
}

// Formata as classificações adicionais (cláusula que trata de mais de um tema) para exibição
// em uma única célula: "Categoria A · Subcategoria A; Categoria B · Subcategoria B"
function categoriasAdicionaisTexto(c) {
  const extras = (c.classificacoes || []).filter(cl => cl.categoria !== c.categoria || cl.subcategoria !== c.subcategoria)
  return extras.map(cl => `${cl.categoria} · ${cl.subcategoria}`).join('; ')
}

export async function gerarExcelInstrumento(instrumento, clausulas, empresa, operacao, sindicatoLaboral, sindicatoPatronal) {
  const wb = XLSX.utils.book_new()
  const status = statusVigencia(instrumento?.vigencia_fim)
  const ordenadas = dedupClausulas(ordenarClausulas(clausulas))

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
    'Subcategoria': normalizarSubcategoria(c.subcategoria) || '',
    'Categorias Adicionais': categoriasAdicionaisTexto(c),
    'Conteúdo Integral da Cláusula': conteudoCompleto(c),
    'Tags': (c.tags || []).join(', '),
    'Observações / Contextualização para o Usuário': c.observacoes || '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 40 }, { wch: 18 }, { wch: 28 }, { wch: 15 }, { wch: 8 },
    { wch: 50 }, { wch: 18 }, { wch: 50 }, { wch: 18 },
    { wch: 28 }, { wch: 22 }, { wch: 12 }, { wch: 40 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 22 }, { wch: 45 }, { wch: 25 }, { wch: 32 }, { wch: 35 },
    { wch: 120 }, { wch: 25 }, { wch: 80 },
  ]
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
    { 'Campo': 'Status', 'Valor': status },
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
  const opMap  = Object.fromEntries((operacoes || []).map(o => [o.id, o]))
  const sindMap = Object.fromEntries((sindicatos || []).map(s => [s.id, s]))
  const instMap = Object.fromEntries((instrumentos || []).map(i => [i.id, i]))

  // Deduplicate before generating report
  const clausulasDedupadas = dedupClausulas(todasClausulas)

  const rows = ordenarClausulas(clausulasDedupadas).map(c => {
    const inst = instMap[c.instrumento_id] || {}
    const emp  = empMap[inst.empresa_id] || {}
    const op   = opMap[inst.operacao_id] || {}
    const sLab = sindMap[inst.sindicato_laboral_id] || {}
    const sPat = sindMap[inst.sindicato_patronal_id] || {}
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
      'Status Vigência': statusVigencia(inst.vigencia_fim),
      'Nº Cláusula': c.numero || '',
      'Título da Cláusula': c.titulo || '',
      'Categoria': c.categoria || '',
      'Subcategoria': normalizarSubcategoria(c.subcategoria) || '',
      'Categorias Adicionais': categoriasAdicionaisTexto(c),
      'Conteúdo Integral da Cláusula': conteudoCompleto(c),
      'Tags': (c.tags || []).join(', '),
      'Observações / Contextualização para o Usuário': c.observacoes || '',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 40 }, { wch: 18 }, { wch: 28 }, { wch: 15 }, { wch: 8 },
    { wch: 50 }, { wch: 50 }, { wch: 12 }, { wch: 40 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 22 }, { wch: 45 }, { wch: 25 }, { wch: 32 }, { wch: 35 },
    { wch: 120 }, { wch: 25 }, { wch: 80 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Cláusulas')

  const porInst = {}
  clausulasDedupadas.forEach(c => {
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
  const nomeA = instrumentoA?.nome || 'Instrumento A'
  const nomeB = instrumentoB?.nome || 'Instrumento B'

  const ws = XLSX.utils.json_to_sheet(resultado.map(r => ({
    'Status': r.status.label,
    ['Nº — ' + nomeA]: r.clausulaA?.numero || '',
    ['Título — ' + nomeA]: r.clausulaA?.titulo || '',
    ['Conteúdo — ' + nomeA]: r.clausulaA?.conteudo || '',
    ['Nº — ' + nomeB]: r.clausulaB?.numero || '',
    ['Título — ' + nomeB]: r.clausulaB?.titulo || '',
    ['Conteúdo — ' + nomeB]: r.clausulaB?.conteudo || '',
    'Similaridade': r.score ? (r.score * 100).toFixed(0) + '%' : '',
    'Pareamento IA': r.origemIA ? `🤖 Sugerido por IA — motivo: ${r.motivoIA || '(sem motivo registrado)'} — confirme se é de fato o mesmo instituto.` : '',
  })))
  ws['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 35 }, { wch: 100 }, { wch: 16 }, { wch: 35 }, { wch: 100 }, { wch: 12 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Comparativo Completo')

  const ws2 = XLSX.utils.json_to_sheet(resultado.filter(r => ['ALTERADA','MUITO ALTERADA','SUBSTITUÍDA'].includes(r.status.label)).map(r => ({
    'Status': r.status.label,
    ['Nº — ' + nomeA]: r.clausulaA?.numero || '',
    ['Título — ' + nomeA]: r.clausulaA?.titulo || '',
    ['Conteúdo Antes — ' + nomeA]: r.clausulaA?.conteudo || '',
    ['Nº — ' + nomeB]: r.clausulaB?.numero || '',
    ['Título — ' + nomeB]: r.clausulaB?.titulo || '',
    ['Conteúdo Depois — ' + nomeB]: r.clausulaB?.conteudo || '',
  })))
  ws2['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 35 }, { wch: 100 }, { wch: 16 }, { wch: 35 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Cláusulas Alteradas')

  const ws3 = XLSX.utils.json_to_sheet(resultado.filter(r => ['NOVA','SUPRIMIDA'].includes(r.status.label)).map(r => ({
    'Status': r.status.label,
    'Nº': (r.clausulaA || r.clausulaB)?.numero || '',
    'Título': (r.clausulaA || r.clausulaB)?.titulo || '',
    'Conteúdo Integral': (r.clausulaA || r.clausulaB)?.conteudo || '',
  })))
  ws3['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 35 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Novas e Suprimidas')

  const contagem = {}
  resultado.forEach(r => { contagem[r.status.label] = (contagem[r.status.label] || 0) + 1 })
  const ws4 = XLSX.utils.json_to_sheet([
    { Métrica: 'Instrumento A', Valor: nomeA },
    { Métrica: 'Status A', Valor: statusVigencia(instrumentoA?.vigencia_fim) },
    { Métrica: 'Instrumento B', Valor: nomeB },
    { Métrica: 'Status B', Valor: statusVigencia(instrumentoB?.vigencia_fim) },
    { Métrica: 'Total cláusulas A', Valor: resultado.filter(r => r.clausulaA).length },
    { Métrica: 'Total cláusulas B', Valor: resultado.filter(r => r.clausulaB).length },
    { Métrica: '', Valor: '' },
    ...Object.entries(contagem).map(([k, v]) => ({ Métrica: k, Valor: v }))
  ])
  ws4['!cols'] = [{ wch: 30 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, ws4, 'Resumo Executivo')

  XLSX.writeFile(wb, 'comparativo_' + nomeA + '_vs_' + nomeB + '.xlsx')
}

export async function gerarExcelClausulas(clausulas, instrumento) {
  const wb = XLSX.utils.book_new()
  const rows = clausulas.map(c => ({
    'Nº Cláusula': c.numero || '',
    'Título': c.titulo || '',
    'Categoria': c.categoria || '',
    'Subcategoria': normalizarSubcategoria(c.subcategoria) || '',
    'Categorias Adicionais': categoriasAdicionaisTexto(c),
    'Conteúdo Integral': conteudoCompleto(c),
    'Tags': (c.tags || []).join(', '),
    'Observações': c.observacoes || '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 18 },{ wch: 45 },{ wch: 25 },{ wch: 25 },{ wch: 35 },{ wch: 100 },{ wch: 25 },{ wch: 60 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Cláusulas')
  XLSX.writeFile(wb, (instrumento?.nome || 'clausulas') + '_clausulas.xlsx')
}
