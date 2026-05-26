export async function extractDOCXText(file) {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  let texto = result.value || ''

  // Pré-processamento crítico para CCTs:
  // Inserir quebra dupla antes de cada "CLÁUSULA XXXX" para que
  // o sistema de chunks nunca corte no meio de uma cláusula
  texto = texto.replace(
    /(CLÁUSULA\s+(?:[A-ZÁÉÍÓÚÃÕÂÊÔÀÇ]+(?:[aº°]|\s+[A-ZÁÉÍÓÚÃÕÂÊÔÀÇ]+)*\s*[-–—]))/g,
    '\n\n$1'
  )

  return texto.trim()
}
