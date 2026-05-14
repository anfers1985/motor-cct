export async function extractExcelText(file) {
  const XLSX = await import('xlsx')
  const arrayBuffer = await file.arrayBuffer()
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  let text = ''
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(ws)
    text += `\n=== Aba: ${sheetName} ===\n${csv}`
  }
  return text
}
