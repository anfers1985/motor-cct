import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { CATEGORIAS, CATEGORIA_CORES, TAGS_PREDEFINIDAS } from '../utils/categorias'
import { ordenarClausulas } from '../utils/ordenacao'
import Badge from '../components/UI/Badge'

export default function Clausulas() {
  const { user } = useAuth()
  const [instrumentos, setInstrumentos] = useState([])
  const [clausulas, setClausulas] = useState([])
  const [filtros, setFiltros] = useState({ instrumento: '', categoria: '', subcategoria: '', busca: '' })
  const [expandido, setExpandido] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('instrumentos').select('id,nome,tipo')
      .eq('user_id', user.id).eq('status_processamento', 'processado').order('nome')
      .then(({ data }) => setInstrumentos(data || []))
  }, [user])

  useEffect(() => {
    if (!filtros.instrumento) { setClausulas([]); return }
    setLoading(true)
    let q = supabase.from('clausulas').select('*')
      .eq('instrumento_id', filtros.instrumento).eq('user_id', user.id)
    if (filtros.categoria) q = q.eq('categoria', filtros.categoria)
    if (filtros.subcategoria) q = q.eq('subcategoria', filtros.subcategoria)
    if (filtros.busca) q = q.or(`titulo.ilike.%${filtros.busca}%,conteudo.ilike.%${filtros.busca}%`)
    q.then(({ data }) => {
      setClausulas(ordenarClausulas(data || []))
      setLoading(false)
    })
  }, [filtros])

  async function toggleTag(clausula, tag) {
    const tags = clausula.tags || []
    const novo = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]
    await supabase.from('clausulas').update({ tags: novo }).eq('id', clausula.id)
    setClausulas(cs => cs.map(c => c.id === clausula.id ? { ...c, tags: novo } : c))
  }

  const subcats = filtros.categoria ? (CATEGORIAS[filtros.categoria] || []) : []

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-800">Consulta de Cláusulas</h1>
        <p className="text-slate-500 text-sm">Busque e navegue pelas cláusulas de qualquer instrumento processado</p>
      </div>

      <div className="card p-4 mb-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="col-span-2 lg:col-span-1">
            <label className="label">Instrumento</label>
            <select className="input" value={filtros.instrumento}
              onChange={e => setFiltros({ ...filtros, instrumento: e.target.value, categoria: '', subcategoria: '' })}>
              <option value="">Selecione um instrumento...</option>
              {instrumentos.map(i => <option key={i.id} value={i.id}>{i.tipo} — {i.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={filtros.categoria}
              onChange={e => setFiltros({ ...filtros, categoria: e.target.value, subcategoria: '' })}>
              <option value="">Todas</option>
              {Object.keys(CATEGORIAS).map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Subcategoria</label>
            <select className="input" value={filtros.subcategoria}
              onChange={e => setFiltros({ ...filtros, subcategoria: e.target.value })}
              disabled={!filtros.categoria}>
              <option value="">Todas</option>
              {subcats.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Busca livre</label>
            <input className="input" placeholder="Palavra no título ou conteúdo..."
              value={filtros.busca} onChange={e => setFiltros({ ...filtros, busca: e.target.value })} />
          </div>
        </div>
      </div>

      {!filtros.instrumento && (
        <div className="card p-10 text-center text-slate-400">
          <p className="text-4xl mb-3">🔍</p>
          <p>Selecione um instrumento para visualizar as cláusulas</p>
        </div>
      )}

      {filtros.instrumento && loading && <p className="text-slate-400 text-sm">Carregando cláusulas...</p>}

      {filtros.instrumento && !loading && (
        <>
          <p className="text-xs text-slate-500 mb-3">
            {clausulas.length} cláusula{clausulas.length !== 1 ? 's' : ''} encontrada{clausulas.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {clausulas.length === 0 && (
              <div className="card p-8 text-center text-slate-400">Nenhuma cláusula encontrada.</div>
            )}
            {clausulas.map(c => (
              <div key={c.id} className="card overflow-hidden">
                <button className="w-full text-left p-4 hover:bg-surface-50 transition-colors"
                  onClick={() => setExpandido(expandido === c.id ? null : c.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {c.numero && (
                          <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                            {c.numero}
                          </span>
                        )}
                        <Badge className={CATEGORIA_CORES[c.categoria] || 'bg-slate-100 text-slate-600'}>
                          {c.categoria}
                        </Badge>
                        {c.subcategoria && <span className="text-xs text-slate-400">{c.subcategoria}</span>}
                        {c.valor_monetario && (
                          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            {c.valor_monetario}
                          </span>
                        )}
                        {c.percentual && (
                          <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                            {c.percentual}
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-slate-800">{c.titulo}</p>
                      {(c.tags || []).length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {c.tags.map(tag => {
                            const t = TAGS_PREDEFINIDAS.find(tp => tp.label === tag)
                            return (
                              <span key={tag}
                                className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (t?.color || 'bg-slate-100 text-slate-600')}>
                                {tag}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <span className="text-slate-300 text-sm flex-shrink-0">{expandido === c.id ? '▲' : '▼'}</span>
                  </div>
                </button>

                {expandido === c.id && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                    {c.vigencia_especifica && (
                      <p className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg mb-3">
                        ⚠️ Vigência específica: {c.vigencia_especifica}
                      </p>
                    )}
                    {c.observacoes && c.observacoes.trim() && (
                      <p className="text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg mb-3">
                        💡 {c.observacoes}
                      </p>
                    )}
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{c.conteudo}</p>

                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <p className="text-xs font-medium text-slate-400 mb-2">Etiquetas:</p>
                      <div className="flex gap-2 flex-wrap">
                        {TAGS_PREDEFINIDAS.map(tag => {
                          const ativa = (c.tags || []).includes(tag.label)
                          return (
                            <button key={tag.label} onClick={() => toggleTag(c, tag.label)}
                              className={'text-xs px-2 py-1 rounded-full border transition-all ' +
                                (ativa ? tag.color + ' border-transparent font-medium' : 'border-slate-200 text-slate-400 hover:border-slate-300')}>
                              {ativa ? '✓ ' : ''}{tag.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
