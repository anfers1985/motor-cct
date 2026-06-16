// Lista com busca por nome/CNPJ e seleção via checkbox (múltipla)
export default function CheckList({ opcoes, selecionados, onChange, busca, onBusca, maxHeight = 168 }) {
  const q = busca.toLowerCase()
  const cnpjQ = busca.replace(/\D/g, '')
  const filtrados = busca
    ? opcoes.filter(o =>
        o.label.toLowerCase().includes(q) ||
        (cnpjQ.length >= 3 && (o.cnpj || '').replace(/\D/g, '').includes(cnpjQ))
      )
    : opcoes

  return (
    <div>
      <input className="input text-sm mb-2" placeholder="Buscar por nome ou CNPJ..."
        value={busca} onChange={e => onBusca(e.target.value)}/>
      <div className="border border-slate-200 rounded-lg overflow-y-auto" style={{ maxHeight }}>
        {filtrados.length === 0 && (
          <p className="text-xs text-slate-400 p-3 italic">Nenhuma opção disponível</p>
        )}
        {filtrados.map(o => (
          <label key={o.value}
            className="flex items-start gap-3 px-3 py-2.5 hover:bg-surface-50 cursor-pointer border-b border-slate-100 last:border-0">
            <input type="checkbox" className="mt-0.5 accent-blue-600 flex-shrink-0"
              checked={selecionados.includes(o.value)}
              onChange={e => e.target.checked
                ? onChange([...selecionados, o.value])
                : onChange(selecionados.filter(id => id !== o.value))}/>
            <div className="min-w-0">
              <p className="text-sm text-slate-700 leading-tight">{o.label}</p>
              {o.cnpj && <p className="text-xs text-slate-400 mt-0.5">{o.cnpj}</p>}
            </div>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
        <button className="hover:text-slate-600 transition-colors"
          onClick={() => onChange(filtrados.map(o => o.value))}>Selecionar todos</button>
        <span>·</span>
        <button className="hover:text-slate-600 transition-colors"
          onClick={() => onChange([])}>Limpar</button>
        <span className="ml-auto font-medium text-slate-500">
          {selecionados.length === 0
            ? 'Todos (' + opcoes.length + ')'
            : selecionados.length + ' selecionado(s)'}
        </span>
      </div>
    </div>
  )
}
