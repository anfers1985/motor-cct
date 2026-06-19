// Serviço de índices econômicos: IPCA e INPC via API do Banco Central (SGS)
// com fallback para valores inseridos manualmente em Configurações (localStorage).

const BCB_IPCA_CODE = 433 // IPCA - variação mensal (%)
const BCB_INPC_CODE = 188 // INPC - variação mensal (%)
const MANUAL_KEY = 'motor_cct_indices_manuais'

// Retorna os últimos N meses no formato { ano, mes, label } — mes 1-12
// Começa do mês ANTERIOR ao atual, pois o IBGE/BCB só divulga dados de M no mês M+1.
// Ex: em junho/26, retorna jun/25 a mai/26 (12 meses com dados disponíveis).
export function ultimosMeses(n = 12) {
  const out = []
  const hoje = new Date()
  // offset = 1 desloca o início para o mês anterior
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1 - i, 1)
    out.push({
      ano: d.getFullYear(),
      mes: d.getMonth() + 1,
      label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''),
      key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
    })
  }
  return out
}

// Busca uma série SGS do BCB. Retorna array [{data: 'dd/MM/yyyy', valor: 'x.xx'}] ou null em caso de erro
async function fetchSGS(codigo, n) {
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/${n}?formato=json`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data)) return null
    return data
  } catch {
    return null
  }
}

// Converte série SGS [{data:'01/05/2025', valor:'0.45'}] em mapa { 'YYYY-MM': valor(number) }
function sgsParaMapa(serie) {
  const mapa = {}
  for (const item of serie) {
    const [dia, mes, ano] = item.data.split('/')
    mapa[`${ano}-${mes}`] = parseFloat(item.valor.replace(',', '.'))
  }
  return mapa
}

// Lê valores manuais salvos em Configurações
export function getIndicesManuais() {
  try {
    const raw = localStorage.getItem(MANUAL_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function setIndicesManuais(dados) {
  localStorage.setItem(MANUAL_KEY, JSON.stringify(dados))
}

// Busca IPCA e INPC dos últimos N meses (variação mensal %).
// Tenta a API do BCB primeiro; usa valores manuais como fallback por mês individual.
export async function buscarIndices(n = 12) {
  const meses = ultimosMeses(n)
  const manuais = getIndicesManuais()

  const [ipcaSerie, inpcSerie] = await Promise.all([
    fetchSGS(BCB_IPCA_CODE, n + 1),
    fetchSGS(BCB_INPC_CODE, n + 1),
  ])

  const ipcaMapa = ipcaSerie ? sgsParaMapa(ipcaSerie) : {}
  const inpcMapa = inpcSerie ? sgsParaMapa(inpcSerie) : {}

  const apiIndisponivel = !ipcaSerie && !inpcSerie

  const resultado = meses.map(m => {
    const ipcaAPI = ipcaMapa[m.key]
    const inpcAPI = inpcMapa[m.key]
    const manual = manuais[m.key] || {}
    return {
      ...m,
      ipca: ipcaAPI ?? manual.ipca ?? null,
      inpc: inpcAPI ?? manual.inpc ?? null,
      ipcaFonte: ipcaAPI != null ? 'api' : (manual.ipca != null ? 'manual' : null),
      inpcFonte: inpcAPI != null ? 'api' : (manual.inpc != null ? 'manual' : null),
    }
  })

  return { meses: resultado, apiIndisponivel }
}

// Calcula a variação acumulada (%) de uma série de variações mensais
export function acumulado(valores) {
  const validos = valores.filter(v => v != null)
  if (!validos.length) return null
  let fator = 1
  for (const v of validos) fator *= (1 + v / 100)
  return (fator - 1) * 100
}
