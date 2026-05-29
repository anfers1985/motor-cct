// Extrator DOCX que preserva estrutura de parágrafos — essencial para CCTs
// Usa XML interno via JSZip para garantir que cada parágrafo = uma linha
// Isso permite chunking correto que nunca corta no meio de uma cláusula

export async function extractDOCXText(file) {
  try {
    return await extractViaZip(file)
  } catch (e) {
    console.warn('JSZip falhou, usando mammoth:', e.message)
    return await extractViaMammoth(file)
  }
}

async function extractViaZip(file) {
  const { default: JSZip } = await import(
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
  )
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const xmlContent = await zip.file('word/document.xml').async('text')

  // Extrai parágrafos preservando cada um em linha separada
  const linhas = []
  const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g
  let paraMatch
  while ((paraMatch = paraRegex.exec(xmlContent)) !== null) {
    const paraXml = paraMatch[0]
    let texto = ''
    const tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g
    let tMatch
    while ((tMatch = tRe.exec(paraXml)) !== null) {
      texto += tMatch[1]
    }
    if (texto.trim()) linhas.push(texto.trim())
  }

  if (linhas.length === 0) throw new Error('Sem texto via JSZip')

  // Monta texto com quebra dupla antes de cada CLÁUSULA
  let resultado = ''
  for (const linha of linhas) {
    if (/^CLÁUSULA\s+/i.test(linha)) {
      resultado += '\n\n' + linha
    } else {
      resultado += '\n' + linha
    }
  }
  return resultado.trim()
}

async function extractViaMammoth(file) {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  let texto = result.value || ''
  texto = texto.replace(
    /(CLÁUSULA\s+(?:[A-ZÁÉÍÓÚÃÕÂÊÔÀÇ\d]+(?:[aº°]|\s+[A-ZÁÉÍÓÚÃÕÂÊÔÀÇ]+)*\s*[-–—]))/g,
    '\n\n$1'
  )
  return texto.trim()
}
