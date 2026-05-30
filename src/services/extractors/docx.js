// Extrator DOCX para CCTs — Motor CCT v1.5
// Trata <w:br/> como separador de linha E divide parágrafos grandes que contêm múltiplas cláusulas

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

  // Coleta linhas de texto respeitando <w:br/> como quebra dentro do parágrafo
  const linhas = []

  const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g
  let paraMatch
  while ((paraMatch = paraRegex.exec(xmlContent)) !== null) {
    const paraXml = paraMatch[0]

    // Divide o parágrafo em segmentos separados por <w:br/>
    // Cada <w:br/> é uma quebra de linha visual dentro do mesmo <w:p>
    const segmentos = paraXml.split(/<w:br\s*\/>/)

    for (const seg of segmentos) {
      let texto = ''
      const tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g
      let tMatch
      while ((tMatch = tRe.exec(seg)) !== null) {
        texto += tMatch[1]
      }
      texto = texto.trim()
      if (texto) linhas.push(texto)
    }
  }

  if (linhas.length === 0) throw new Error('Sem texto via JSZip')

  // Monta texto com quebra dupla antes de cada CLÁUSULA
  // Inclui cláusulas que não estão no início da linha (ex: no preâmbulo)
  let resultado = ''
  for (const linha of linhas) {
    // Se a linha contém "CLÁUSULA X" mas não começa com isso,
    // quebra antes da palavra CLÁUSULA
    const partes = linha.split(/(CL[AÁ]USULA\s+(?:[A-ZÁÉÍÓÚÃÕÂÊÔÀÇ0-9]+[aº°]?\s*[-–—]|\d+[aº°]\s*[-–—]))/i)
    if (partes.length > 1) {
      for (let i = 0; i < partes.length; i++) {
        const parte = partes[i].trim()
        if (!parte) continue
        if (/^CL[AÁ]USULA\s+/i.test(parte)) {
          resultado += '\n\n' + parte
        } else {
          resultado += '\n' + parte
        }
      }
    } else {
      if (/^CL[AÁ]USULA\s+/i.test(linha)) {
        resultado += '\n\n' + linha
      } else {
        resultado += '\n' + linha
      }
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
    /(CL[AÁ]USULA\s+(?:[A-ZÁÉÍÓÚÃÕÂÊÔÀÇ\d]+(?:[aº°]|\s+[A-ZÁÉÍÓÚÃÕÂÊÔÀÇ]+)*\s*[-–—]))/gi,
    '\n\n$1'
  )
  return texto.trim()
}
