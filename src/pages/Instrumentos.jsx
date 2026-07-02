import { useState, useEffect, useRef } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { vigenciaBadge, formatDate } from '../utils/formatters'
import { extrairClausulas, getAIConfig } from '../services/ai'
import { extractPDFText, getPDFBase64 } from '../services/extractors/pdf'
import { extractDOCXText } from '../services/extractors/docx'
import { extractExcelText } from '../services/extractors/excel'
import { CATEGORIAS, classificar } from '../utils/categorias'
import Modal from '../components/UI/Modal'

const TIPOS = ['ACT','CCT','Aditivo','Acordo Extrajudicial','Prática Interna','Proposta Sindical']
// Tipos que não entram no gráfico de reajuste do Dashboard
const TIPOS_SEM_REAJUSTE = ['Prática Interna', 'Proposta Sindical']
const EMPTY = { tipo: 'CCT', nome: '', empresa_id: '', operacao_id: '', sindicato_laboral_id: '', sindicato_patronal_id: '', vigencia_inicio: '', vigencia_fim: '' }

// Converte string vazia em null para campos FK
function limparFK(val) { return val === '' ? null : val }

// ── Modal de Revisão de Cláusulas ─────────────────────────────────────────────
function ModalRevisao({ open, onClose, clausulas: inicial, onConfirmar, instNome }) {
  const [clausulas, setClausulas] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [expandidos, setExpandidos] = useState(new Set())
  const [expandidosTudo, setExpandidosTudo] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroCat, setFiltroCat] = useState('')

  useEffect(() => {
    if (open && inicial) {
      setClausulas(inicial.map((c, i) => ({
        ...c,
        categorias_adicionais: c.categorias_adicionais || [],
        _idx: i,
      })))
      setExpandidos(new Set())
      setExpandidosTudo(false)
    }
  }, [open, inicial])

  function toggleExpandido(idx) {
    setExpandidos(prev => {
      const n = new Set(prev)
      n.has(idx) ? n.delete(idx) : n.add(idx)
      return n
    })
  }

  function toggleExpandirTudo() {
    setExpandidosTudo(v => !v)
    setExpandidos(new Set())
  }

  // Se expandidosTudo=true, a lógica se inverte: expandidos contém os RECOLHIDOS
  const isExpanded = idx => expandidosTudo ? !expandidos.has(idx) : expandidos.has(idx)

  function atualizar(idx, campo, valor) {
    setClausulas(prev => prev.map(c =>
      c._idx === idx
        ? { ...c, [campo]: valor, ...(campo === 'categoria' ? { subcategoria: '' } : {}) }
        : c
    ))
  }

  // ── Classificações adicionais (cláusula que trata de mais de um tema) ──
  function adicionarClassificacao(idx) {
    setClausulas(prev => prev.map(c =>
      c._idx === idx
        ? { ...c, categorias_adicionais: [...(c.categorias_adicionais || []), { categoria: '', subcategoria: '' }] }
        : c
    ))
  }

  function atualizarClassificacaoAdicional(idx, i, campo, valor) {
    setClausulas(prev => prev.map(c => {
      if (c._idx !== idx) return c
      const lista = [...(c.categorias_adicionais || [])]
      lista[i] = { ...lista[i], [campo]: valor, ...(campo === 'categoria' ? { subcategoria: '' } : {}) }
      return { ...c, categorias_adicionais: lista }
    }))
  }

  function removerClassificacaoAdicional(idx, i) {
    setClausulas(prev => prev.map(c => {
      if (c._idx !== idx) return c
      const lista = [...(c.categorias_adicionais || [])]
      lista.splice(i, 1)
      return { ...c, categorias_adicionais: lista }
    }))
  }

  async function confirmar() {
    setSalvando(true)
    await onConfirmar(clausulas)
    setSalvando(false)
  }

  const categorias = Object.keys(CATEGORIAS)
  const todasSubcats = (cat) => CATEGORIAS[cat] || []

  const filtradas = clausulas.filter(c => {
    const q = busca.toLowerCase()
    const passaBusca = !q || c.titulo?.toLowerCase().includes(q) || c.numero?.toLowerCase().includes(q)
    const passaCat = !filtroCat || c.categoria === filtroCat
    return passaBusca && passaCat
  })

  // Contagem de cláusulas sem categoria definida
  const semCategoria = clausulas.filter(c => !c.categoria).length

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-display font-semibold text-slate-800">
              📋 Revisar Cláusulas — {instNome}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {clausulas.length} cláusulas extraídas pela IA.
              Revise e corrija categoria, subcategoria, título e conteúdo antes de salvar.
              {semCategoria > 0 && (
                <span className="ml-2 text-amber-600 font-medium">⚠️ {semCategoria} sem categoria definida</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleExpandirTudo}
              className="text-xs btn-secondary py-1 px-3"
            >
              {expandidosTudo ? '📕 Recolher tudo' : '📖 Expandir tudo'}
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
          </div>
        </div>

        {/* Barra de filtros */}
        <div className="px-6 py-3 border-b border-slate-100 flex gap-3 flex-wrap flex-shrink-0">
          <input
            className="input max-w-xs text-sm"
            placeholder="Buscar por nº ou título..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
          <select className="input w-auto text-sm" value={filtroCat} onChange={e => setFiltroCat(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c}>{c}</option>)}
            <option value="__sem__">Sem categoria</option>
          </select>
          <span className="text-xs text-slate-400 self-center">
            {filtradas.length} de {clausulas.length} visíveis
          </span>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="border-b border-slate-200">
                <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-16">Nº</th>
                <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-56">Título</th>
                <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-44">Categoria</th>
                <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-52">Subcategoria</th>
                <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-24">% / Valor</th>
                <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-16">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => {
                const aberto = isExpanded(c._idx)
                const subcats = todasSubcats(c.categoria)
                const semCat = !c.categoria
                return (
                  <>
                    <tr
                      key={c._idx}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${semCat ? 'bg-amber-50/40' : ''}`}
                    >
                      {/* Número */}
                      <td className="px-3 py-2 text-slate-500 font-mono">{c.numero || '—'}</td>

                      {/* Título editável */}
                      <td className="px-3 py-2">
                        <input
                          className="w-full text-xs border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1.5 py-1 bg-transparent focus:bg-white outline-none transition-colors"
                          value={c.titulo || ''}
                          onChange={e => atualizar(c._idx, 'titulo', e.target.value)}
                        />
                      </td>

                      {/* Categoria — dropdown */}
                      <td className="px-3 py-2">
                        <select
                          className={`w-full text-xs border rounded px-1.5 py-1 outline-none transition-colors ${
                            semCat
                              ? 'border-amber-400 bg-amber-50 text-amber-800'
                              : 'border-slate-200 bg-white text-slate-700 focus:border-brand-400'
                          }`}
                          value={c.categoria || ''}
                          onChange={e => atualizar(c._idx, 'categoria', e.target.value)}
                        >
                          <option value="">— selecione —</option>
                          {categorias.map(cat => <option key={cat}>{cat}</option>)}
                        </select>
                      </td>

                      {/* Subcategoria — dropdown dependente da categoria */}
                      <td className="px-3 py-2">
                        <select
                          className="w-full text-xs border border-slate-200 bg-white text-slate-700 rounded px-1.5 py-1 focus:border-brand-400 outline-none transition-colors"
                          value={c.subcategoria || ''}
                          onChange={e => atualizar(c._idx, 'subcategoria', e.target.value)}
                          disabled={!c.categoria}
                        >
                          <option value="">— selecione —</option>
                          {subcats.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </td>

                      {/* Percentual / valor monetário */}
                      <td className="px-3 py-2">
                        <input
                          className="w-full text-xs border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1.5 py-1 bg-transparent focus:bg-white outline-none transition-colors font-mono"
                          value={c.percentual || c.valor_monetario || ''}
                          placeholder="—"
                          onChange={e => atualizar(c._idx, 'percentual', e.target.value)}
                        />
                      </td>

                      {/* Expandir conteúdo */}
                      <td className="px-3 py-2 text-center">
                        <button
                          className="text-brand-500 hover:text-brand-700 transition-colors text-xs px-2 py-0.5 rounded border border-brand-200 hover:bg-brand-50"
                          onClick={() => toggleExpandido(c._idx)}
                        >
                          {aberto ? 'fechar' : 'ver'}
                        </button>
                      </td>
                    </tr>

                    {/* Linha de conteúdo expandido */}
                    {aberto && (
                      <tr key={`${c._idx}-exp`} className="bg-slate-50/80 border-b border-slate-200">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-medium text-slate-500 mb-1">Conteúdo integral</p>
                              <textarea
                                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-brand-400 outline-none resize-y leading-relaxed"
                                rows={8}
                                value={c.conteudo || ''}
                                onChange={e => atualizar(c._idx, 'conteudo', e.target.value)}
                              />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-500 mb-1">Observações / Contextualização</p>
                              <textarea
                                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-brand-400 outline-none resize-y leading-relaxed"
                                rows={4}
                                value={c.observacoes || ''}
                                onChange={e => atualizar(c._idx, 'observacoes', e.target.value)}
                              />
                              <p className="text-xs font-medium text-slate-500 mt-3 mb-1">Vigência específica</p>
                              <input
                                className="input text-xs"
                                value={c.vigencia_especifica || ''}
                                onChange={e => atualizar(c._idx, 'vigencia_especifica', e.target.value)}
                              />
                            </div>
                          </div>

                          {/* Classificações adicionais — quando a cláusula trata de mais de um tema */}
                          <div className="mt-4 pt-3 border-t border-slate-200">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-medium text-slate-500">
                                Classificações adicionais <span className="text-slate-400 font-normal">(opcional — use se a cláusula tratar de mais de um tema)</span>
                              </p>
                              <button
                                type="button"
                                className="text-xs text-brand-600 hover:underline"
                                onClick={() => adicionarClassificacao(c._idx)}
                              >
                                + adicionar classificação
                              </button>
                            </div>
                            {(c.categorias_adicionais || []).length === 0 && (
                              <p className="text-xs text-slate-300">Nenhuma classificação adicional.</p>
                            )}
                            <div className="space-y-2">
                              {(c.categorias_adicionais || []).map((extra, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                  <select
                                    className="flex-1 text-xs border border-slate-200 bg-white text-slate-700 rounded px-1.5 py-1 focus:border-brand-400 outline-none"
                                    value={extra.categoria || ''}
                                    onChange={e => atualizarClassificacaoAdicional(c._idx, i, 'categoria', e.target.value)}
                                  >
                                    <option value="">— categoria —</option>
                                    {categorias.map(cat => <option key={cat}>{cat}</option>)}
                                  </select>
                                  <select
                                    className="flex-1 text-xs border border-slate-200 bg-white text-slate-700 rounded px-1.5 py-1 focus:border-brand-400 outline-none"
                                    value={extra.subcategoria || ''}
                                    onChange={e => atualizarClassificacaoAdicional(c._idx, i, 'subcategoria', e.target.value)}
                                    disabled={!extra.categoria}
                                  >
                                    <option value="">— subcategoria —</option>
                                    {todasSubcats(extra.categoria).map(s => <option key={s}>{s}</option>)}
                                  </select>
                                  <button
                                    type="button"
                                    className="text-xs text-red-500 hover:underline px-1"
                                    onClick={() => removerClassificacaoAdicional(c._idx, i)}
                                  >
                                    remover
                                  </button>
                                </div>
                              ))}
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

          {filtradas.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-12">Nenhuma cláusula encontrada com esses filtros.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-4 flex-shrink-0 bg-white">
          <div className="text-xs text-slate-400">
            {semCategoria > 0
              ? <span className="text-amber-600">⚠️ {semCategoria} cláusula(s) ainda sem categoria. Você pode salvar assim, mas revise depois.</span>
              : <span className="text-emerald-600">✅ Todas as cláusulas com categoria definida</span>
            }
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary" onClick={onClose} disabled={salvando}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={confirmar} disabled={salvando}>
              {salvando ? '⏳ Salvando...' : `✅ Confirmar e Salvar ${clausulas.length} cláusulas`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function Instrumentos() {
  const { user } = useAuth()
  const [lista, setLista] = useState([])
  const [empresas, setEmpresas] = useState([])
  const [operacoes, setOperacoes] = useState([])
  const [sindicatos, setSindicatos] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [arquivo, setArquivo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [processando, setProcessando] = useState({})
  const [log, setLog] = useState({})
  const [filtros, setFiltros] = useState({ tipo: '', status: '', busca: '' })

  // Estado do modal de revisão
  const [revisao, setRevisao] = useState({ open: false, clausulas: [], instId: null, instNome: '' })

  const fileRef = useRef()

  async function carregar() {
    const { data } = await supabase.from('instrumentos').select(`
      *,
      empresa:empresa_id(razao_social, cnpj),
      operacao:operacao_id(nome, codigo, estado),
      sindicato_laboral:sindicato_laboral_id(razao_social, sigla),
      sindicato_patronal:sindicato_patronal_id(razao_social, sigla)
    `).eq('user_id', user.id).order('created_at', { ascending: false })
    setLista(data || [])
  }

  useEffect(() => {
    if (!user) return
    carregar()
    supabase.from('empresas').select('id,razao_social').eq('user_id', user.id).order('razao_social').then(({ data }) => setEmpresas(data || []))
    supabase.from('sindicatos').select('id,razao_social,sigla,tipo').eq('user_id', user.id).order('razao_social').then(({ data }) => setSindicatos(data || []))
  }, [user])

  async function onEmpresaChange(empresaId) {
    setForm(f => ({ ...f, empresa_id: empresaId, operacao_id: '' }))
    if (!empresaId) { setOperacoes([]); return }
    const { data } = await supabase.from('operacoes').select('id,nome,codigo,sindicato_laboral_id,sindicato_patronal_id').eq('empresa_id', empresaId).eq('user_id', user.id)
    setOperacoes(data || [])
  }

  function onOperacaoChange(opId) {
    const op = operacoes.find(o => o.id === opId)
    setForm(f => ({
      ...f,
      operacao_id: opId,
      sindicato_laboral_id: op?.sindicato_laboral_id || f.sindicato_laboral_id,
      sindicato_patronal_id: op?.sindicato_patronal_id || f.sindicato_patronal_id,
    }))
  }

  // ── Salvar / editar instrumento (bug fix: preserva status e converte FK vazias) ──
  async function salvar() {
    if (!form.nome.trim()) return alert('Nome obrigatório')
    setLoading(true)
    let arquivoUrl = null, arquivoNome = null

    if (arquivo) {
      const ext = arquivo.name.split('.').pop()
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('instrumentos').upload(path, arquivo)
      if (!error) {
        const { data: urlData } = supabase.storage.from('instrumentos').getPublicUrl(path)
        arquivoUrl = urlData.publicUrl
        arquivoNome = arquivo.name
      }
    }

    // Campos FK: converte string vazia em null
    const fkLimpos = {
      empresa_id:             limparFK(form.empresa_id),
      operacao_id:            limparFK(form.operacao_id),
      sindicato_laboral_id:   limparFK(form.sindicato_laboral_id),
      sindicato_patronal_id:  limparFK(form.sindicato_patronal_id),
    }

    if (editId) {
      // Edição: preserva status_processamento atual, só atualiza arquivo se enviou novo
      const upd = {
        tipo:              form.tipo,
        nome:              form.nome,
        vigencia_inicio:   form.vigencia_inicio || null,
        vigencia_fim:      form.vigencia_fim    || null,
        ...fkLimpos,
      }
      if (arquivo) {
        upd.arquivo_url  = arquivoUrl
        upd.arquivo_nome = arquivoNome
        upd.status_processamento = 'aguardando' // novo arquivo → reprocessar
      }
      const { error } = await supabase.from('instrumentos').update(upd).eq('id', editId)
      if (error) {
        setLoading(false)
        alert('Erro ao salvar instrumento: ' + error.message + '\n\nSe o erro mencionar "tipo_check" ou "constraint", é necessário rodar a migração SQL em sql_updates/001_add_tipos_instrumento.sql no Supabase.')
        return
      }
    } else {
      // Inserção: status começa como aguardando
      const payload = {
        ...form,
        ...fkLimpos,
        user_id:               user.id,
        status_processamento:  'aguardando',
        arquivo_url:           arquivoUrl,
        arquivo_nome:          arquivoNome,
        vigencia_inicio:       form.vigencia_inicio || null,
        vigencia_fim:          form.vigencia_fim    || null,
      }
      const { error } = await supabase.from('instrumentos').insert(payload)
      if (error) {
        setLoading(false)
        alert('Erro ao salvar instrumento: ' + error.message + '\n\nSe o erro mencionar "tipo_check" ou "constraint", é necessário rodar a migração SQL em sql_updates/001_add_tipos_instrumento.sql no Supabase.')
        return
      }
    }

    setModal(false); setArquivo(null); setLoading(false); carregar()
  }

  // ── Extração com IA → abre revisão em vez de salvar direto ──
  async function extrair(inst) {
    const aiCfg = getAIConfig()
    if (!aiCfg?.chave) return alert('Configure um provedor de IA nas Configurações antes de extrair cláusulas.')

    const { count } = await supabase.from('clausulas').select('*', { count: 'exact', head: true }).eq('instrumento_id', inst.id)
    if (count > 0) {
      if (!confirm(`Este instrumento já tem ${count} cláusulas extraídas. Deseja reprocessar e substituir tudo?`)) return
      await supabase.from('clausulas').delete().eq('instrumento_id', inst.id)
    }

    setProcessando(p => ({ ...p, [inst.id]: true }))
    setLog(l => ({ ...l, [inst.id]: 'Iniciando extração...' }))
    await supabase.from('instrumentos').update({ status_processamento: 'processando' }).eq('id', inst.id)

    try {
      if (!inst.arquivo_url && !inst.arquivo_nome) throw new Error('Nenhum arquivo vinculado a este instrumento')

      setLog(l => ({ ...l, [inst.id]: 'Baixando arquivo...' }))
      let texto = '', isPDF = false, pdfBase64 = null
      const resp = await fetch(inst.arquivo_url)
      const blob = await resp.blob()
      const file = new File([blob], inst.arquivo_nome, { type: blob.type })
      const ext = inst.arquivo_nome.split('.').pop().toLowerCase()

      if (ext === 'pdf') {
        isPDF = true
        if (aiCfg.provedor === 'claude' || aiCfg.provedor === 'gemini') {
          pdfBase64 = await getPDFBase64(file)
          texto = '(PDF enviado nativamente)'
          setLog(l => ({ ...l, [inst.id]: 'Enviando PDF para a IA...' }))
        } else {
          setLog(l => ({ ...l, [inst.id]: 'Extraindo texto do PDF...' }))
          texto = await extractPDFText(file)
        }
      } else if (ext === 'docx' || ext === 'doc') {
        setLog(l => ({ ...l, [inst.id]: 'Lendo arquivo DOCX...' }))
        texto = await extractDOCXText(file)
      } else if (ext === 'xlsx' || ext === 'xls') {
        setLog(l => ({ ...l, [inst.id]: 'Lendo planilha Excel...' }))
        texto = await extractExcelText(file)
      } else {
        texto = await file.text()
      }

      const onProgress = (msg) => setLog(l => ({ ...l, [inst.id]: msg }))
      onProgress('Enviando para IA...')
      const clausulas = await extrairClausulas(texto, { isPDF, pdfBase64, onProgress })

      // Em vez de salvar direto, abre o modal de revisão
      setLog(l => ({ ...l, [inst.id]: `✅ ${clausulas.length} cláusulas extraídas. Aguardando revisão...` }))
      await supabase.from('instrumentos').update({ status_processamento: 'aguardando' }).eq('id', inst.id)
      setRevisao({ open: true, clausulas, instId: inst.id, instNome: inst.nome })

    } catch (e) {
      await supabase.from('instrumentos').update({ status_processamento: 'erro' }).eq('id', inst.id)
      setLog(l => ({ ...l, [inst.id]: `❌ Erro: ${e.message}` }))
    }

    setProcessando(p => ({ ...p, [inst.id]: false }))
    carregar()
  }

  // ── Abrir revisão de instrumento já processado ──
  // Recarrega também as classificações adicionais (tabela clausula_categorias), se existirem.
  async function abrirRevisao(inst) {
    setLog(l => ({ ...l, [inst.id]: 'Carregando cláusulas...' }))
    const { data: clausulasData } = await supabase.from('clausulas').select('*').eq('instrumento_id', inst.id).order('numero')
    const ids = (clausulasData || []).map(c => c.id)

    let extrasPorClausula = {}
    if (ids.length > 0) {
      const { data: classifs } = await supabase
        .from('clausula_categorias')
        .select('clausula_id, categoria, subcategoria')
        .in('clausula_id', ids)
        .eq('principal', false)
      for (const cl of (classifs || [])) {
        if (!extrasPorClausula[cl.clausula_id]) extrasPorClausula[cl.clausula_id] = []
        extrasPorClausula[cl.clausula_id].push({ categoria: cl.categoria, subcategoria: cl.subcategoria })
      }
    }

    const comExtras = (clausulasData || []).map(c => ({ ...c, categorias_adicionais: extrasPorClausula[c.id] || [] }))
    setLog(l => ({ ...l, [inst.id]: '' }))
    setRevisao({ open: true, clausulas: comExtras, instId: inst.id, instNome: inst.nome })
  }

  // ── Confirmar revisão e salvar no banco ──
  // Salva a classificação principal em clausulas.categoria/subcategoria (cache, compatível
  // com telas antigas) e TODAS as classificações (principal + adicionais) em clausula_categorias,
  // que é a fonte usada por filtros/relatórios para permitir 1 cláusula em várias categorias.
  async function confirmarRevisao(clausulasRevisadas) {
    const { instId } = revisao

    // Apaga cláusulas antigas — clausula_categorias é apagada em cascata (FK on delete cascade)
    await supabase.from('clausulas').delete().eq('instrumento_id', instId)

    const rows = clausulasRevisadas.map(({ _idx, categorias_adicionais, ...c }) => ({
      ...c,
      instrumento_id: instId,
      user_id: user.id,
      tags: c.tags || [],
    }))
    const { data: inseridas, error: insertError } = await supabase.from('clausulas').insert(rows).select('id')
    if (insertError) {
      alert('Erro ao salvar cláusulas: ' + insertError.message)
      return
    }

    // Monta as linhas de clausula_categorias (principal + adicionais) na mesma ordem do insert
    const classifRows = []
    clausulasRevisadas.forEach((c, i) => {
      const clausulaId = inseridas?.[i]?.id
      if (!clausulaId) return
      if (c.categoria) {
        classifRows.push({ clausula_id: clausulaId, user_id: user.id, categoria: c.categoria, subcategoria: c.subcategoria || '', principal: true })
      }
      ;(c.categorias_adicionais || []).forEach(extra => {
        if (extra.categoria && extra.subcategoria) {
          classifRows.push({ clausula_id: clausulaId, user_id: user.id, categoria: extra.categoria, subcategoria: extra.subcategoria, principal: false })
        }
      })
    })
    if (classifRows.length > 0) {
      const { error: classifError } = await supabase.from('clausula_categorias').insert(classifRows)
      if (classifError) {
        alert('Cláusulas salvas, mas houve erro ao salvar as classificações adicionais (rode a migração sql_updates/002_multi_categoria.sql se ainda não rodou): ' + classifError.message)
      }
    }

    const { error: updError } = await supabase.from('instrumentos').update({ status_processamento: 'processado' }).eq('id', instId)
    if (updError) {
      alert('Cláusulas salvas, mas houve erro ao atualizar o status do instrumento: ' + updError.message)
    }

    setRevisao({ open: false, clausulas: [], instId: null, instNome: '' })
    setLog(l => ({ ...l, [instId]: `✅ ${rows.length} cláusulas salvas após revisão.` }))
    carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir instrumento e todas as suas cláusulas?')) return
    await supabase.from('clausulas').delete().eq('instrumento_id', id)
    await supabase.from('instrumentos').delete().eq('id', id)
    carregar()
  }

  function abrir(inst = null) {
    setForm(inst ? {
      tipo: inst.tipo,
      nome: inst.nome,
      empresa_id: inst.empresa_id || '',
      operacao_id: inst.operacao_id || '',
      sindicato_laboral_id: inst.sindicato_laboral_id || '',
      sindicato_patronal_id: inst.sindicato_patronal_id || '',
      vigencia_inicio: inst.vigencia_inicio || '',
      vigencia_fim: inst.vigencia_fim || '',
    } : EMPTY)
    setEditId(inst?.id || null)
    setArquivo(null)
    setModal(true)
    if (inst?.empresa_id) onEmpresaChange(inst.empresa_id)
  }

  const STATUS_CLS = {
    aguardando: 'bg-slate-100 text-slate-600',
    processando: 'bg-blue-100 text-blue-700',
    processado: 'bg-emerald-100 text-emerald-700',
    erro: 'bg-red-100 text-red-700',
  }
  const STATUS_LABEL = {
    aguardando: 'Aguardando',
    processando: 'Processando...',
    processado: 'Processado',
    erro: 'Erro',
  }

  const filtrados = lista.filter(i => {
    const q = filtros.busca.toLowerCase()
    return (!filtros.tipo || i.tipo === filtros.tipo)
      && (!filtros.status || i.status_processamento === filtros.status)
      && (!q || i.nome?.toLowerCase().includes(q) || i.empresa?.razao_social?.toLowerCase().includes(q))
  })

  const laboral  = sindicatos.filter(s => s.tipo === 'laboral')
  const patronal = sindicatos.filter(s => s.tipo === 'patronal')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-800">Instrumentos Coletivos</h1>
          <p className="text-slate-500 text-sm">{lista.length} instrumento{lista.length !== 1 ? 's' : ''} cadastrado{lista.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => abrir()}>+ Novo Instrumento</button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input className="input max-w-xs" placeholder="Buscar..." value={filtros.busca} onChange={e => setFiltros({...filtros, busca: e.target.value})} />
        <select className="input max-w-[140px]" value={filtros.tipo} onChange={e => setFiltros({...filtros, tipo: e.target.value})}>
          <option value="">Todos os tipos</option>
          {TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="input max-w-[160px]" value={filtros.status} onChange={e => setFiltros({...filtros, status: e.target.value})}>
          <option value="">Todos os status</option>
          <option value="aguardando">Aguardando</option>
          <option value="processando">Processando</option>
          <option value="processado">Processado</option>
          <option value="erro">Erro</option>
        </select>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {filtrados.length === 0 && (
          <div className="card p-8 text-center text-slate-400 text-sm">Nenhum instrumento encontrado</div>
        )}
        {filtrados.map(inst => {
          const vb = vigenciaBadge(inst.vigencia_fim)
          const jaProcessado = inst.status_processamento === 'processado'
          return (
            <div key={inst.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded">{inst.tipo}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLS[inst.status_processamento]}`}>{STATUS_LABEL[inst.status_processamento]}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${vb.cls}`}>{vb.label}</span>
                  </div>
                  <p className="font-medium text-slate-800 truncate">{inst.nome}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {inst.empresa?.razao_social || '—'} · {inst.operacao?.nome || '—'} · {inst.sindicato_laboral?.sigla || '—'} × {inst.sindicato_patronal?.sigla || '—'}
                  </p>
                  <p className="text-xs text-slate-400">Vigência: {formatDate(inst.vigencia_inicio)} a {formatDate(inst.vigencia_fim)}</p>
                  {log[inst.id] && <p className="text-xs mt-1 text-slate-500 italic">{log[inst.id]}</p>}
                </div>

                <div className="flex flex-col gap-2 items-end flex-shrink-0">
                  <div className="flex gap-2">
                    <button onClick={() => abrir(inst)} className="text-xs text-brand-600 hover:underline">Editar</button>
                    <button onClick={() => excluir(inst.id)} className="text-xs text-red-500 hover:underline">Excluir</button>
                  </div>

                  {/* Extrair com IA */}
                  {inst.arquivo_url && (
                    <button
                      onClick={() => extrair(inst)}
                      disabled={processando[inst.id]}
                      className="btn-primary text-xs py-1 px-3"
                    >
                      {processando[inst.id] ? '⏳ Processando...' : '🤖 Extrair Cláusulas com IA'}
                    </button>
                  )}

                  {/* Revisar cláusulas — disponível sempre que processado */}
                  {jaProcessado && (
                    <button
                      onClick={() => abrirRevisao(inst)}
                      className="btn-secondary text-xs py-1 px-3"
                    >
                      ✏️ Revisar Cláusulas
                    </button>
                  )}

                  {inst.arquivo_nome && (
                    <a href={inst.arquivo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-brand-600">
                      📎 {inst.arquivo_nome}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal de cadastro/edição */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar Instrumento' : 'Novo Instrumento'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Tipo *</label>
            <select className="input" value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Nome/Identificação *</label>
            <input className="input" placeholder="ex: CCT Metalúrgicos SP 2024/2025" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} />
          </div>
          <div>
            <label className="label">Empresa</label>
            <select className="input" value={form.empresa_id} onChange={e => onEmpresaChange(e.target.value)}>
              <option value="">Selecione...</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.razao_social}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Operação</label>
            <select className="input" value={form.operacao_id} onChange={e => onOperacaoChange(e.target.value)} disabled={!form.empresa_id}>
              <option value="">Selecione...</option>
              {operacoes.map(o => <option key={o.id} value={o.id}>{o.nome} {o.codigo && `(${o.codigo})`}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Sindicato Laboral</label>
            <select className="input" value={form.sindicato_laboral_id} onChange={e => setForm({...form, sindicato_laboral_id: e.target.value})}>
              <option value="">Selecione...</option>
              {laboral.map(s => <option key={s.id} value={s.id}>{s.sigla ? `${s.sigla} — ` : ''}{s.razao_social}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Sindicato Patronal</label>
            <select className="input" value={form.sindicato_patronal_id} onChange={e => setForm({...form, sindicato_patronal_id: e.target.value})}>
              <option value="">Selecione...</option>
              {patronal.map(s => <option key={s.id} value={s.id}>{s.sigla ? `${s.sigla} — ` : ''}{s.razao_social}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Início da Vigência</label>
            <input className="input" type="date" value={form.vigencia_inicio} onChange={e => setForm({...form, vigencia_inicio: e.target.value})} />
          </div>
          <div>
            <label className="label">Fim da Vigência</label>
            <input className="input" type="date" value={form.vigencia_fim} onChange={e => setForm({...form, vigencia_fim: e.target.value})} />
          </div>
          <div className="col-span-2">
            <label className="label">Arquivo Original (PDF, DOCX, DOC, TXT, XLS, XLSX, CSV)</label>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.xls,.xlsx,.csv" className="input" onChange={e => setArquivo(e.target.files[0])} />
            {arquivo && <p className="text-xs text-slate-500 mt-1">📎 {arquivo.name} ({(arquivo.size / 1024).toFixed(0)} KB)</p>}
            {editId && !arquivo && (
              <p className="text-xs text-slate-400 mt-1">Deixe em branco para manter o arquivo atual</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn-primary" onClick={salvar} disabled={loading}>{loading ? 'Salvando...' : 'Salvar Instrumento'}</button>
        </div>
      </Modal>

      {/* Modal de revisão de cláusulas */}
      <ModalRevisao
        open={revisao.open}
        onClose={() => setRevisao(r => ({ ...r, open: false }))}
        clausulas={revisao.clausulas}
        instNome={revisao.instNome}
        onConfirmar={confirmarRevisao}
      />
    </div>
  )
}
