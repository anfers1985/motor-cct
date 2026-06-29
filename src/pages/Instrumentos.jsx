import { useState, useEffect, useRef } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { vigenciaBadge, formatDate } from '../utils/formatters'
import { extrairClausulas, getAIConfig } from '../services/ai'
import { extractPDFText, getPDFBase64 } from '../services/extractors/pdf'
import { extractDOCXText } from '../services/extractors/docx'
import { extractExcelText } from '../services/extractors/excel'
import Modal from '../components/UI/Modal'
import RevisaoExtracao from '../components/UI/RevisaoExtracao'

const TIPOS = ['ACT', 'CCT', 'Aditivo', 'Acordo Extrajudicial']
const EMPTY = {
  tipo: 'CCT', nome: '', empresa_id: '', operacao_id: '',
  sindicato_laboral_id: '', sindicato_patronal_id: '',
  vigencia_inicio: '', vigencia_fim: '',
}

export default function Instrumentos() {
  const { user } = useAuth()
  const [lista, setLista] = useState([])
  const [empresas, setEmpresas] = useState([])
  const [operacoes, setOperacoes] = useState([])
  const [sindicatos, setSindicatos] = useState([])

  // Modal de cadastro/edição do instrumento
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [arquivo, setArquivo] = useState(null)
  const [loading, setLoading] = useState(false)

  // Modal de revisão de extração (pré-salvamento)
  const [revisaoModal, setRevisaoModal] = useState(false)
  const [clausulasParaRevisar, setClausulasParaRevisar] = useState([])
  const [instRevisao, setInstRevisao] = useState(null) // instrumento ao qual as cláusulas pertencem
  const [salvandoRevisao, setSalvandoRevisao] = useState(false)

  // Modal de edição de cláusulas já salvas
  const [edicaoCláusulasModal, setEdicaoClausulasModal] = useState(false)
  const [clausulasEditando, setClausulasEditando] = useState([])
  const [instEditandoClaususlas, setInstEditandoClaususlas] = useState(null)
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)

  // Estado de extração
  const [processando, setProcessando] = useState({})
  const [log, setLog] = useState({})
  const [filtros, setFiltros] = useState({ tipo: '', status: '', busca: '' })
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
    supabase.from('empresas').select('id,razao_social').eq('user_id', user.id).order('razao_social')
      .then(({ data }) => setEmpresas(data || []))
    supabase.from('sindicatos').select('id,razao_social,sigla,tipo').eq('user_id', user.id).order('razao_social')
      .then(({ data }) => setSindicatos(data || []))
  }, [user])

  async function onEmpresaChange(empresaId) {
    setForm(f => ({ ...f, empresa_id: empresaId, operacao_id: '' }))
    if (!empresaId) { setOperacoes([]); return }
    const { data } = await supabase.from('operacoes')
      .select('id,nome,codigo,sindicato_laboral_id,sindicato_patronal_id')
      .eq('empresa_id', empresaId).eq('user_id', user.id)
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

  // ── Salvar instrumento (cadastro ou edição) ─────────────────────────────────
  async function salvar() {
    if (!form.nome.trim()) return alert('Nome obrigatório')
    setLoading(true)

    try {
      let arquivoUrl = null, arquivoNome = null

      if (arquivo) {
        const ext = arquivo.name.split('.').pop()
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('instrumentos').upload(path, arquivo)
        if (uploadErr) throw new Error('Erro ao fazer upload do arquivo: ' + uploadErr.message)
        const { data: urlData } = supabase.storage.from('instrumentos').getPublicUrl(path)
        arquivoUrl = urlData.publicUrl
        arquivoNome = arquivo.name
      }

      if (editId) {
        // ── UPDATE: monta payload limpo, SEM user_id e SEM status_processamento
        // para não sobrescrever o status de extração já existente
        const payload = {
          tipo: form.tipo,
          nome: form.nome,
          empresa_id: form.empresa_id || null,
          operacao_id: form.operacao_id || null,
          sindicato_laboral_id: form.sindicato_laboral_id || null,
          sindicato_patronal_id: form.sindicato_patronal_id || null,
          vigencia_inicio: form.vigencia_inicio || null,
          vigencia_fim: form.vigencia_fim || null,
        }
        // Só atualiza arquivo se um novo foi enviado
        if (arquivo && arquivoUrl) {
          payload.arquivo_url = arquivoUrl
          payload.arquivo_nome = arquivoNome
          payload.status_processamento = 'aguardando' // novo arquivo → re-extrair
        }
        const { error } = await supabase.from('instrumentos')
          .update(payload)
          .eq('id', editId)
          .eq('user_id', user.id) // garante que só atualiza registro do próprio usuário
        if (error) throw new Error('Erro ao atualizar: ' + error.message)
      } else {
        // ── INSERT
        const payload = {
          ...form,
          user_id: user.id,
          status_processamento: 'aguardando',
          empresa_id: form.empresa_id || null,
          operacao_id: form.operacao_id || null,
          sindicato_laboral_id: form.sindicato_laboral_id || null,
          sindicato_patronal_id: form.sindicato_patronal_id || null,
          vigencia_inicio: form.vigencia_inicio || null,
          vigencia_fim: form.vigencia_fim || null,
        }
        if (arquivoUrl) { payload.arquivo_url = arquivoUrl; payload.arquivo_nome = arquivoNome }
        const { error } = await supabase.from('instrumentos').insert(payload)
        if (error) throw new Error('Erro ao inserir: ' + error.message)
      }

      setModal(false)
      setArquivo(null)
      await carregar()
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Extração com IA → abre revisão ─────────────────────────────────────────
  async function extrair(inst) {
    const aiCfg = getAIConfig()
    if (!aiCfg?.chave) return alert('Configure um provedor de IA nas Configurações antes de extrair cláusulas.')

    const { count } = await supabase.from('clausulas')
      .select('*', { count: 'exact', head: true }).eq('instrumento_id', inst.id)
    if (count > 0) {
      if (!confirm(`Este instrumento já tem ${count} cláusulas extraídas. Deseja reprocessar e substituir tudo?`)) return
    }

    setProcessando(p => ({ ...p, [inst.id]: true }))
    setLog(l => ({ ...l, [inst.id]: 'Iniciando extração...' }))
    await supabase.from('instrumentos').update({ status_processamento: 'processando' }).eq('id', inst.id)

    try {
      if (!inst.arquivo_url) throw new Error('Nenhum arquivo vinculado a este instrumento')

      setLog(l => ({ ...l, [inst.id]: 'Baixando arquivo...' }))
      const resp = await fetch(inst.arquivo_url)
      const blob = await resp.blob()
      const file = new File([blob], inst.arquivo_nome, { type: blob.type })
      const ext = inst.arquivo_nome.split('.').pop().toLowerCase()

      let texto = '', isPDF = false, pdfBase64 = null
      const provedor = aiCfg.provedor

      if (ext === 'pdf') {
        isPDF = true
        if (provedor === 'claude' || provedor === 'gemini') {
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

      // ── Em vez de salvar direto, abre a tela de revisão ──
      setLog(l => ({ ...l, [inst.id]: `✅ ${clausulas.length} cláusulas extraídas — aguardando revisão do usuário` }))
      await supabase.from('instrumentos').update({ status_processamento: 'aguardando_revisao' }).eq('id', inst.id)
      setInstRevisao(inst)
      setClausulasParaRevisar(clausulas)
      setRevisaoModal(true)
    } catch (e) {
      await supabase.from('instrumentos').update({ status_processamento: 'erro' }).eq('id', inst.id)
      setLog(l => ({ ...l, [inst.id]: `❌ Erro: ${e.message}` }))
    }

    setProcessando(p => ({ ...p, [inst.id]: false }))
    carregar()
  }

  // ── Confirmar revisão → salva no banco ──────────────────────────────────────
  async function confirmarRevisao(clausulasEditadas) {
    if (!instRevisao) return
    setSalvandoRevisao(true)
    try {
      // Deleta cláusulas antigas (se houver reprocessamento)
      await supabase.from('clausulas').delete().eq('instrumento_id', instRevisao.id)

      // Insere as cláusulas revisadas
      const rows = clausulasEditadas.map(c => ({
        numero: c.numero || null,
        titulo: c.titulo || null,
        conteudo: c.conteudo || null,
        categoria: c.categoria || null,
        subcategoria: c.subcategoria || null,
        observacoes: c.observacoes || null,
        valor_monetario: c.valor_monetario || null,
        percentual: c.percentual || null,
        vigencia_especifica: c.vigencia_especifica || null,
        tags: c.tags || [],
        instrumento_id: instRevisao.id,
        user_id: user.id,
      }))
      const { error } = await supabase.from('clausulas').insert(rows)
      if (error) throw new Error('Erro ao salvar cláusulas: ' + error.message)

      await supabase.from('instrumentos')
        .update({ status_processamento: 'processado' })
        .eq('id', instRevisao.id)

      setLog(l => ({ ...l, [instRevisao.id]: `✅ ${rows.length} cláusulas salvas após revisão.` }))
      setRevisaoModal(false)
      setInstRevisao(null)
      setClausulasParaRevisar([])
      await carregar()
    } catch (e) {
      alert(e.message)
    } finally {
      setSalvandoRevisao(false)
    }
  }

  function cancelarRevisao() {
    // Volta status para 'aguardando' caso o usuário cancele sem salvar
    if (instRevisao) {
      supabase.from('instrumentos')
        .update({ status_processamento: 'aguardando' })
        .eq('id', instRevisao.id)
        .then(() => carregar())
      setLog(l => ({ ...l, [instRevisao.id]: 'Revisão cancelada — cláusulas não foram salvas.' }))
    }
    setRevisaoModal(false)
    setInstRevisao(null)
    setClausulasParaRevisar([])
  }

  // ── Abrir edição de cláusulas já salvas ─────────────────────────────────────
  async function abrirEdicaoClausulas(inst) {
    const { data, error } = await supabase.from('clausulas')
      .select('*').eq('instrumento_id', inst.id).eq('user_id', user.id).order('numero')
    if (error) return alert('Erro ao carregar cláusulas: ' + error.message)
    setClausulasEditando(data || [])
    setInstEditandoClaususlas(inst)
    setEdicaoClausulasModal(true)
  }

  // ── Salvar edição de cláusulas já existentes ────────────────────────────────
  async function salvarEdicaoClausulas(clausulasEditadas) {
    if (!instEditandoClaususlas) return
    setSalvandoEdicao(true)
    try {
      // Estratégia: delete + re-insert (mais simples e confiável que N updates individuais)
      await supabase.from('clausulas').delete().eq('instrumento_id', instEditandoClaususlas.id)
      const rows = clausulasEditadas.map(c => ({
        numero: c.numero || null,
        titulo: c.titulo || null,
        conteudo: c.conteudo || null,
        categoria: c.categoria || null,
        subcategoria: c.subcategoria || null,
        observacoes: c.observacoes || null,
        valor_monetario: c.valor_monetario || null,
        percentual: c.percentual || null,
        vigencia_especifica: c.vigencia_especifica || null,
        tags: c.tags || [],
        instrumento_id: instEditandoClaususlas.id,
        user_id: user.id,
      }))
      if (rows.length > 0) {
        const { error } = await supabase.from('clausulas').insert(rows)
        if (error) throw new Error('Erro ao salvar: ' + error.message)
      }
      setEdicaoClausulasModal(false)
      setInstEditandoClaususlas(null)
      setClausulasEditando([])
      alert(`✅ ${rows.length} cláusulas atualizadas com sucesso.`)
    } catch (e) {
      alert(e.message)
    } finally {
      setSalvandoEdicao(false)
    }
  }

  async function excluir(id) {
    if (!confirm('Excluir instrumento e todas as suas cláusulas?')) return
    await supabase.from('clausulas').delete().eq('instrumento_id', id)
    await supabase.from('instrumentos').delete().eq('id', id)
    carregar()
  }

  function abrir(inst = null) {
    if (inst?.empresa_id) onEmpresaChange(inst.empresa_id)
    setForm(inst ? {
      tipo: inst.tipo || 'CCT',
      nome: inst.nome || '',
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
  }

  const STATUS_CLS = {
    aguardando: 'bg-slate-100 text-slate-600',
    processando: 'bg-blue-100 text-blue-700',
    aguardando_revisao: 'bg-amber-100 text-amber-700',
    processado: 'bg-emerald-100 text-emerald-700',
    erro: 'bg-red-100 text-red-700',
  }
  const STATUS_LABEL = {
    aguardando: 'Aguardando',
    processando: 'Processando...',
    aguardando_revisao: '⏳ Ag. Revisão',
    processado: 'Processado',
    erro: 'Erro',
  }

  const filtrados = lista.filter(i => {
    const q = filtros.busca.toLowerCase()
    return (!filtros.tipo || i.tipo === filtros.tipo)
      && (!filtros.status || i.status_processamento === filtros.status)
      && (!q || i.nome?.toLowerCase().includes(q) || i.empresa?.razao_social?.toLowerCase().includes(q))
  })

  const laboral = sindicatos.filter(s => s.tipo === 'laboral')
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
        <input className="input max-w-xs" placeholder="Buscar..." value={filtros.busca}
          onChange={e => setFiltros({ ...filtros, busca: e.target.value })} />
        <select className="input max-w-[140px]" value={filtros.tipo}
          onChange={e => setFiltros({ ...filtros, tipo: e.target.value })}>
          <option value="">Todos os tipos</option>
          {TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="input max-w-[180px]" value={filtros.status}
          onChange={e => setFiltros({ ...filtros, status: e.target.value })}>
          <option value="">Todos os status</option>
          <option value="aguardando">Aguardando</option>
          <option value="processando">Processando</option>
          <option value="aguardando_revisao">Aguardando Revisão</option>
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
          const emRevisao = inst.status_processamento === 'aguardando_revisao'
          return (
            <div key={inst.id} className={`card p-4 ${emRevisao ? 'ring-2 ring-amber-300' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded">{inst.tipo}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLS[inst.status_processamento] || 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABEL[inst.status_processamento] || inst.status_processamento}
                    </span>
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

                  {/* Botão de extração */}
                  {inst.arquivo_url && !emRevisao && (
                    <button
                      onClick={() => extrair(inst)}
                      disabled={processando[inst.id]}
                      className="btn-primary text-xs py-1 px-3">
                      {processando[inst.id] ? '⏳ Processando...' : '🤖 Extrair Cláusulas com IA'}
                    </button>
                  )}

                  {/* Botão para retomar revisão pendente */}
                  {emRevisao && clausulasParaRevisar.length > 0 && instRevisao?.id === inst.id && (
                    <button
                      onClick={() => setRevisaoModal(true)}
                      className="btn-primary text-xs py-1 px-3 bg-amber-500 hover:bg-amber-600">
                      📋 Revisar Extração Pendente
                    </button>
                  )}
                  {emRevisao && !(clausulasParaRevisar.length > 0 && instRevisao?.id === inst.id) && (
                    <span className="text-xs text-amber-600 font-medium">
                      ⏳ Reprocesse para retomar revisão
                    </span>
                  )}

                  {/* Botão de edição de cláusulas já processadas */}
                  {inst.status_processamento === 'processado' && (
                    <button
                      onClick={() => abrirEdicaoClausulas(inst)}
                      className="btn-secondary text-xs py-1 px-3">
                      ✏️ Editar Cláusulas
                    </button>
                  )}

                  {inst.arquivo_nome && (
                    <a href={inst.arquivo_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-slate-400 hover:text-brand-600">
                      📎 {inst.arquivo_nome}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Modal cadastro/edição do instrumento ── */}
      <Modal open={modal} onClose={() => setModal(false)}
        title={editId ? 'Editar Instrumento' : 'Novo Instrumento'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Tipo *</label>
            <select className="input" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Nome/Identificação *</label>
            <input className="input" placeholder="ex: CCT Metalúrgicos SP 2024/2025"
              value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
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
            <select className="input" value={form.operacao_id}
              onChange={e => onOperacaoChange(e.target.value)} disabled={!form.empresa_id}>
              <option value="">Selecione...</option>
              {operacoes.map(o => <option key={o.id} value={o.id}>{o.nome} {o.codigo && `(${o.codigo})`}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Sindicato Laboral</label>
            <select className="input" value={form.sindicato_laboral_id}
              onChange={e => setForm({ ...form, sindicato_laboral_id: e.target.value })}>
              <option value="">Selecione...</option>
              {laboral.map(s => <option key={s.id} value={s.id}>{s.sigla ? `${s.sigla} — ` : ''}{s.razao_social}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Sindicato Patronal</label>
            <select className="input" value={form.sindicato_patronal_id}
              onChange={e => setForm({ ...form, sindicato_patronal_id: e.target.value })}>
              <option value="">Selecione...</option>
              {patronal.map(s => <option key={s.id} value={s.id}>{s.sigla ? `${s.sigla} — ` : ''}{s.razao_social}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Início da Vigência</label>
            <input className="input" type="date" value={form.vigencia_inicio}
              onChange={e => setForm({ ...form, vigencia_inicio: e.target.value })} />
          </div>
          <div>
            <label className="label">Fim da Vigência</label>
            <input className="input" type="date" value={form.vigencia_fim}
              onChange={e => setForm({ ...form, vigencia_fim: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="label">Arquivo Original (PDF, DOCX, DOC, TXT, XLS, XLSX, CSV)</label>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.xls,.xlsx,.csv"
              className="input" onChange={e => setArquivo(e.target.files[0])} />
            {arquivo && (
              <p className="text-xs text-slate-500 mt-1">📎 {arquivo.name} ({(arquivo.size / 1024).toFixed(0)} KB)</p>
            )}
            {editId && !arquivo && (
              <p className="text-xs text-slate-400 mt-1 italic">
                Deixe em branco para manter o arquivo atual. Envie um novo arquivo para substituir.
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn-primary" onClick={salvar} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar Instrumento'}
          </button>
        </div>
      </Modal>

      {/* ── Modal de revisão pós-extração ── */}
      <Modal open={revisaoModal} onClose={() => {}} title="" size="xl">
        <div style={{ height: 'calc(90vh - 120px)' }}>
          <RevisaoExtracao
            clausulas={clausulasParaRevisar}
            onConfirmar={confirmarRevisao}
            onCancelar={cancelarRevisao}
            titulo={`Revisar Extração — ${instRevisao?.nome || ''}`}
            subtitulo={`${clausulasParaRevisar.length} cláusula(s) extraídas pela IA. Corrija classificações, títulos ou conteúdos antes de salvar.`}
            salvarLabel="Confirmar e Salvar no Banco"
            loading={salvandoRevisao}
          />
        </div>
      </Modal>

      {/* ── Modal de edição de cláusulas já salvas ── */}
      <Modal open={edicaoCláusulasModal} onClose={() => setEdicaoClausulasModal(false)}
        title="" size="xl">
        <div style={{ height: 'calc(90vh - 120px)' }}>
          <RevisaoExtracao
            clausulas={clausulasEditando}
            onConfirmar={salvarEdicaoClausulas}
            onCancelar={() => setEdicaoClausulasModal(false)}
            titulo={`Editar Cláusulas — ${instEditandoClaususlas?.nome || ''}`}
            subtitulo={`${clausulasEditando.length} cláusula(s) cadastradas. Edite categoria, subcategoria, título ou conteúdo e clique em Salvar.`}
            salvarLabel="Salvar Alterações"
            loading={salvandoEdicao}
          />
        </div>
      </Modal>
    </div>
  )
}
