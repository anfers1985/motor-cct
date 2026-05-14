export function formatCNPJ(v = '') {
  return v.replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18)
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('pt-BR')
}

export function vigenciaStatus(fim) {
  if (!fim) return 'indefinido'
  const hoje = new Date()
  const fimDate = new Date(fim + 'T00:00:00')
  const diff = (fimDate - hoje) / (1000 * 60 * 60 * 24)
  if (diff < 0) return 'vencido'
  if (diff <= 60) return 'alerta'
  return 'vigente'
}

export function vigenciaBadge(fim) {
  const s = vigenciaStatus(fim)
  if (s === 'vencido') return { cls: 'bg-red-100 text-red-700 border border-red-200', label: 'Vencido' }
  if (s === 'alerta') return { cls: 'bg-amber-100 text-amber-700 border border-amber-200', label: 'Vence em breve' }
  return { cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200', label: 'Vigente' }
}

export function truncate(str, n = 120) {
  if (!str) return ''
  return str.length > n ? str.slice(0, n) + '…' : str
}
