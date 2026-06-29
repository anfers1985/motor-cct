// RevisaoExtracao.jsx
// Tela de revisão das cláusulas extraídas pela IA antes de salvar no banco.
// Também reutilizada para edição posterior de instrumentos já processados.
import { useState, useMemo } from 'react'
import { CATEGORIAS, SUBCATEGORIA_NORMALIZACAO, normalizarSubcategoria } from '../../utils/categorias'

// Todas as subcategorias canônicas em ordem única
const TODAS_SUBCATS = (() => {
  const set = new Set()
  Object.values(CATEGORIAS).forEach(arr => arr.forEach(s => set.add(s)))
  // Adiciona canônicos do mapa de normalização
  Object.values(SUBCATEGORIA_NORMALIZACAO).forEach(s => set.add(s))
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
})()

// Subcategorias filtradas pela categoria selecionada (usa CATEGORIAS como vocabulário)
function subcatsPorCategoria(cat) {
  if (!cat || !CATEGORIAS[cat]) return TODAS_SUBCATS
  return CATEGORIAS[cat]
}

export default function RevisaoExtracao({
  clausulas,           // array inicial vindo da IA ou do banco
  onConfirmar,         // fn(clausulasEditadas) — chamada ao clicar "Confirmar e Salvar"
  onCancelar,          // fn() — cancelar sem salvar
  titulo = 'Revisar Cláusulas Extraídas',
  subtitulo = 'Verifique e corrija as informações antes de salvar no banco.',
  salvarLabel = 'Confirmar e Salvar',
  loading = false,
}) {
  // Estado local das cláusulas (cópia editável)
  const [linhas, setLinhas] = useState(() =>
    (clausulas || []).map((c, i) => ({
      ...c,
      _key: c.id || `novo_${i}`,
      subcategoria: normalizarSubcategoria(c.subcategoria) || c.subcategoria || '',
    }))
  )

  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [editando, setEditando] = useState(null) // _key da linha em modo edição expandida
  const [editForm, setEditForm] = useState({})

  // ── Edição inline ──────────────────────────────────────────────────────────
  function abrirEdicao(linha) {
    setEditando(linha._key)
    setEditForm({ ...linha })
  }

  function fecharEdicao(salvar = false) {
    if (salvar) {
      setLinhas(prev => prev.map(l => l._key === editando ? { ...editForm, _key: l._key } : l))
    }
    setEditando(null)
    setEditForm({})
  }

  function atualizarForm(campo, valor) {
    setEditForm(prev => {
      const novo = { ...prev, [campo]: valor }
      // Ao mudar categoria, limpa subcategoria se não pertencer à nova categoria
      if (campo === 'categoria') {
        const subcats = subcatsPorCategoria(valor)
        if (!subcats.includes(prev.subcategoria)) novo.subcategoria = ''
      }
      return novo
    })
  }

  // Edição rápida direta (sem abrir painel — para campos simples)
  function atualizarLinha(key, campo, valor) {
    setLinhas(prev => prev.map(l => {
      if (l._key !== key) return l
      const novo = { ...l, [campo]: valor }
      if (campo === 'categoria') {
        const subcats = subcatsPorCategoria(valor)
        if (!subcats.includes(l.subcategoria)) novo.subcategoria = ''
      }
      return novo
    }))
  }

  function removerLinha(key) {
    if (!confirm('Remover esta cláusula da revisão?')) return
    setLinhas(prev => prev.filter(l => l._key !== key))
  }

  function adicionarLinha() {
    const key = `novo_${Date.now()}`
    setLinhas(prev => [...prev, {
      _key: key, numero: '', titulo: '', categoria: 'Disposições Gerais',
      subcategoria: 'Outras', conteudo: '', observacoes: '',
      valor_monetario: null, percentual: null, vigencia_especifica: null,
    }])
    setTimeout(() => abrirEdicao({ _key: key, numero: '', titulo: '', categoria: 'Disposições Gerais', subcategoria: 'Outras', conteudo: '', observacoes: '' }), 50)
  }

  // ── Filtros ────────────────────────────────────────────────────────────────
  const visiveis = useMemo(() => {
    const q = busca.toLowerCase()
    return linhas.filter(l =>
      (!filtroCategoria || l.categoria === filtroCategoria) &&
      (!q || l.numero?.toLowerCase().includes(q) || l.titulo?.toLowerCase().includes(q) || l.conteudo?.toLowerCase().includes(q))
    )
  }, [linhas, busca, filtroCategoria])

  // ── Confirmar ──────────────────────────────────────────────────────────────
  function confirmar() {
    // Normaliza subcategorias antes de salvar
    const final = linhas.map(({ _key, ...rest }) => ({
      ...rest,
      subcategoria: normalizarSubcategoria(rest.subcategoria) || rest.subcategoria,
    }))
    onConfirmar(final)
  }

  // ── Estatísticas ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const cats = {}
    linhas.forEach(l => { cats[l.categoria] = (cats[l.categoria] || 0) + 1 })
    return cats
  }, [linhas])

  const CORES_CAT = {
    'Remuneração': 'bg-emerald-100 text-emerald-700',
    'Jornada de Trabalho': 'bg-blue-100 text-blue-700',
    'Benefícios': 'bg-purple-100 text-purple-700',
    'Saúde e Segurança': 'bg-red-100 text-red-700',
    'Estabilidade e Garantias': 'bg-amber-100 text-amber-700',
    'FGTS e Rescisão': 'bg-orange-100 text-orange-700',
    'Relações Sindicais': 'bg-sky-100 text-sky-700',
    'Penalidades': 'bg-rose-100 text-rose-700',
    'Disposições Gerais': 'bg-slate-100 text-slate-600',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho fixo */}
      <div className="flex-shrink-0 pb-4 border-b border-slate-100 mb-4">
        <h2 className="font-display font-bold text-lg text-slate-800">{titulo}</h2>
        <p className="text-slate-500 text-sm mt-0.5">{subtitulo}</p>

        {/* Stats por categoria */}
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {Object.entries(stats).map(([cat, n]) => (
            <span key={cat} className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer border ${filtroCategoria === cat ? 'ring-2 ring-brand-400' : ''} ${CORES_CAT[cat] || 'bg-slate-100 text-slate-600'}`}
              onClick={() => setFiltroCategoria(prev => prev === cat ? '' : cat)}>
              {cat}: {n}
            </span>
          ))}
          {filtroCategoria && (
            <button className="text-xs text-slate-400 hover:text-slate-600 px-1" onClick={() => setFiltroCategoria('')}>✕ limpar filtro</button>
          )}
        </div>

        {/* Filtros e ações */}
        <div className="flex gap-2 mt-3 flex-wrap items-center">
          <input className="input max-w-xs text-sm" placeholder="Buscar por número, título ou conteúdo..."
            value={busca} onChange={e => setBusca(e.target.value)} />
          <span className="text-xs text-slate-400">{visiveis.length}/{linhas.length} cláusula(s)</span>
          <button className="btn-secondary text-xs ml-auto" onClick={adicionarLinha}>+ Adicionar cláusula</button>
        </div>
      </div>

      {/* Tabela de cláusulas */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="text-xs text-slate-500 font-semibold">
              <th className="text-left px-3 py-2 w-24 border-b border-slate-200">Nº</th>
              <th className="text-left px-3 py-2 w-56 border-b border-slate-200">Título</th>
              <th className="text-left px-3 py-2 w-44 border-b border-slate-200">Categoria</th>
              <th className="text-left px-3 py-2 w-48 border-b border-slate-200">Subcategoria</th>
              <th className="text-left px-3 py-2 border-b border-slate-200">Conteúdo (prévia)</th>
              <th className="text-left px-3 py-2 w-20 border-b border-slate-200">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((linha) => {
              const isEdit = editando === linha._key
              return (
                <>
                  {/* Linha compacta */}
                  <tr key={linha._key}
                    className={`border-b border-slate-100 transition-colors ${isEdit ? 'bg-brand-50/60' : 'hover:bg-slate-50'}`}>
                    <td className="px-3 py-2 align-top">
                      <input className="input text-xs w-20 py-1"
                        value={linha.numero}
                        onChange={e => atualizarLinha(linha._key, 'numero', e.target.value)}
                        placeholder="Ex: PRIMEIRA" />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input className="input text-xs w-52 py-1"
                        value={linha.titulo}
                        onChange={e => atualizarLinha(linha._key, 'titulo', e.target.value)}
                        placeholder="Título da cláusula" />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select className="input text-xs w-40 py-1"
                        value={linha.categoria}
                        onChange={e => atualizarLinha(linha._key, 'categoria', e.target.value)}>
                        {Object.keys(CATEGORIAS).map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select className="input text-xs w-44 py-1"
                        value={linha.subcategoria}
                        onChange={e => atualizarLinha(linha._key, 'subcategoria', e.target.value)}>
                        <option value="">— Selecionar —</option>
                        {subcatsPorCategoria(linha.categoria).map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <p className="text-xs text-slate-500 line-clamp-2 max-w-xs">
                        {linha.conteudo?.slice(0, 160) || <span className="italic text-slate-300">vazio</span>}
                        {linha.conteudo?.length > 160 ? '…' : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex gap-1">
                        <button
                          onClick={() => isEdit ? fecharEdicao(false) : abrirEdicao(linha)}
                          className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                          title={isEdit ? 'Fechar painel' : 'Editar conteúdo completo'}>
                          {isEdit ? '▲' : '✏️'}
                        </button>
                        <button
                          onClick={() => removerLinha(linha._key)}
                          className="text-xs text-red-400 hover:text-red-600 ml-1"
                          title="Remover esta cláusula">
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Painel de edição expandida (conteúdo completo) */}
                  {isEdit && (
                    <tr key={linha._key + '_edit'}>
                      <td colSpan={6} className="bg-brand-50/40 border-b-2 border-brand-200 px-3 py-4">
                        <div className="space-y-3">
                          <div className="grid grid-cols-4 gap-3">
                            <div>
                              <label className="label text-xs">Nº da Cláusula</label>
                              <input className="input text-xs py-1.5"
                                value={editForm.numero || ''}
                                onChange={e => atualizarForm('numero', e.target.value)}
                                placeholder="Ex: PRIMEIRA, DÉCIMA SEGUNDA" />
                            </div>
                            <div className="col-span-3">
                              <label className="label text-xs">Título</label>
                              <input className="input text-xs py-1.5"
                                value={editForm.titulo || ''}
                                onChange={e => atualizarForm('titulo', e.target.value)} />
                            </div>
                            <div>
                              <label className="label text-xs">Categoria</label>
                              <select className="input text-xs py-1.5"
                                value={editForm.categoria || ''}
                                onChange={e => atualizarForm('categoria', e.target.value)}>
                                {Object.keys(CATEGORIAS).map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="label text-xs">Subcategoria</label>
                              <select className="input text-xs py-1.5"
                                value={editForm.subcategoria || ''}
                                onChange={e => atualizarForm('subcategoria', e.target.value)}>
                                <option value="">— Selecionar —</option>
                                {subcatsPorCategoria(editForm.categoria).map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="label text-xs">Vigência específica da cláusula</label>
                              <input className="input text-xs py-1.5"
                                value={editForm.vigencia_especifica || ''}
                                onChange={e => atualizarForm('vigencia_especifica', e.target.value)}
                                placeholder="Ex: 01/05/2026 a 30/04/2027" />
                            </div>
                            <div>
                              <label className="label text-xs">Percentual (%)</label>
                              <input className="input text-xs py-1.5" type="number" step="0.01"
                                value={editForm.percentual || ''}
                                onChange={e => atualizarForm('percentual', e.target.value ? parseFloat(e.target.value) : null)}
                                placeholder="Ex: 6.79" />
                            </div>
                          </div>

                          <div>
                            <label className="label text-xs">Conteúdo Integral da Cláusula</label>
                            <textarea className="input text-xs py-2 resize-y font-mono leading-relaxed" rows={10}
                              value={editForm.conteudo || ''}
                              onChange={e => atualizarForm('conteudo', e.target.value)} />
                          </div>

                          <div>
                            <label className="label text-xs">Observações / Contextualização (impacto para RH/empregador)</label>
                            <textarea className="input text-xs py-1.5 resize-none" rows={2}
                              value={editForm.observacoes || ''}
                              onChange={e => atualizarForm('observacoes', e.target.value)} />
                          </div>

                          <div className="flex gap-2">
                            <button className="btn-primary text-xs py-1.5 px-4"
                              onClick={() => fecharEdicao(true)}>
                              ✓ Aplicar edições
                            </button>
                            <button className="btn-secondary text-xs py-1.5"
                              onClick={() => fecharEdicao(false)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>

        {visiveis.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">
            Nenhuma cláusula encontrada com os filtros aplicados.
          </div>
        )}
      </div>

      {/* Rodapé fixo */}
      <div className="flex-shrink-0 pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          {linhas.length} cláusula(s) total · {Object.keys(stats).length} categoria(s)
        </p>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={onCancelar} disabled={loading}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={confirmar} disabled={loading}>
            {loading ? '⏳ Salvando...' : `💾 ${salvarLabel}`}
          </button>
        </div>
      </div>
    </div>
  )
}
