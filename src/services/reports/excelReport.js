import * as XLSX from 'xlsx'

export async function gerarExcelInstrumento(instrumento, clausulas, empresa, operacao, sindicatoLaboral, sindicatoPatronal) {
  const wb = XLSX.utils.book_new()

  // Aba principal — uma linha por cláusula
  const rows = clausulas.map(c => ({
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
    'Vigência Início': instrumento?.vigencia_inicio || '',
    'Vigência Fim': instrumento?.vigencia_fim || '',
    'Nº Cláusula': c.numero || '',
    'Título': c.titulo || '',
    'Categoria': c.categoria || '',
    'Subcategoria': c.subcategoria || '',
    'Valor Monetário': c.valor_monetario || '',
    'Percentual': c.percentual || '',
    'Conteúdo Integral': c.conteudo || '',
    'Tags': (c.tags || []).join(', '),
    'Observações': c.observacoes || '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Cláusulas')

  // Aba resumo
  const cats = {}
  clausulas.forEach(c => { cats[c.categoria] = (cats[c.categoria] || 0) + 1 })
  const resumo = Object.entries(cats).map(([cat, qtd]) => ({ Categoria: cat, 'Qtd. Cláusulas': qtd }))
  const wsR = XLSX.utils.json_to_sheet(resumo)
  XLSX.utils.book_append_sheet(wb, wsR, 'Resumo')

  XLSX.writeFile(wb, `${instrumento?.nome || 'instrumento'}.xlsx`)
}

export async function gerarExcelComparativo(resultado, instrumentoA, instrumentoB) {
  const wb = XLSX.utils.book_new()

  // Aba 1 — Comparativo completo
  const completo = resultado.map(r => ({
    'Status': r.status.label,
    'Categoria A': r.clausulaA?.categoria || '',
    'Nº A': r.clausulaA?.numero || '',
    'Título A': r.clausulaA?.titulo || '',
    'Conteúdo A': r.clausulaA?.conteudo || '',
    'Categoria B': r.clausulaB?.categoria || '',
    'Nº B': r.clausulaB?.numero || '',
    'Título B': r.clausulaB?.titulo || '',
    'Conteúdo B': r.clausulaB?.conteudo || '',
    'Similaridade': r.score ? `${(r.score * 100).toFixed(0)}%` : '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(completo), 'Comparativo Completo')

  // Aba 2 — Alteradas
  const alteradas = resultado
    .filter(r => ['ALTERADA', 'MUITO ALTERADA', 'SUBSTITUÍDA'].includes(r.status.label))
    .map(r => ({
      'Status': r.status.label,
      'Nº A': r.clausulaA?.numero || '',
      'Título A': r.clausulaA?.titulo || '',
      'Conteúdo Antes': r.clausulaA?.conteudo || '',
      'Nº B': r.clausulaB?.numero || '',
      'Título B': r.clausulaB?.titulo || '',
      'Conteúdo Depois': r.clausulaB?.conteudo || '',
    }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(alteradas), 'Cláusulas Alteradas')

  // Aba 3 — Novas e Suprimidas
  const novasSuprimidas = resultado
    .filter(r => ['NOVA', 'SUPRIMIDA'].includes(r.status.label))
    .map(r => ({
      'Status': r.status.label,
      'Nº': (r.clausulaA || r.clausulaB)?.numero || '',
      'Título': (r.clausulaA || r.clausulaB)?.titulo || '',
      'Conteúdo': (r.clausulaA || r.clausulaB)?.conteudo || '',
    }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(novasSuprimidas), 'Novas e Suprimidas')

  // Aba 4 — Resumo
  const contagem = {}
  resultado.forEach(r => { contagem[r.status.label] = (contagem[r.status.label] || 0) + 1 })
  const resumo = [
    { Métrica: 'Instrumento A', Valor: instrumentoA?.nome },
    { Métrica: 'Instrumento B', Valor: instrumentoB?.nome },
    { Métrica: 'Total cláusulas A', Valor: resultado.filter(r => r.clausulaA).length },
    { Métrica: 'Total cláusulas B', Valor: resultado.filter(r => r.clausulaB).length },
    ...Object.entries(contagem).map(([k, v]) => ({ Métrica: k, Valor: v }))
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo Executivo')

  XLSX.writeFile(wb, `comparativo_${(instrumentoA?.nome || 'A')}_vs_${(instrumentoB?.nome || 'B')}.xlsx`)
}
