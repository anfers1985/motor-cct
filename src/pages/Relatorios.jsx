import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { vigenciaStatus } from '../utils/formatters'
import { CATEGORIAS } from '../utils/categorias'
import { gerarExcelMultiplo, gerarExcelInstrumento } from '../services/reports/excelReport'
import { gerarPDFInstrumento } from '../services/reports/pdfReport'

function MultiSelect({ label, options, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select multiple className="input h-28 text-xs" value={value}
        onChange={e => onChange([...e.target.selectedOptions].map(o => o.value))}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <p className="text-[10px] text-slate-400 mt-0.5">
        Ctrl+clique para múltiplos. {value.length > 0 ? value.length + ' selecionado(s)' : 'Todos'}
      </p>
    </div>
  )
}

export default function Relatorios() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [todasEmpresas, setTodasEmpresas] = useState([])
  const [todasOperacoes, setTodasOperacoes] = useState([])
  const [todosSindicatos, setTodosSindicatos] = useState([])
  const [todosInstrumentos, setTodosInstrumentos] = useState([])
  const [preview, setPreview] = useState(null)

  const [filtros, setFiltros] = useState({
    empresas: [], operacoes: [], sindicatosLab: [], sindicatosPat: [],
    categorias: [], subcategorias: [], instrumentos: [], vigencia: '',
  })

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('empresas').select('id,razao_social').eq('user_id', user.id).order('razao_social'),
      supabase.from('operacoes').select('id,nome,codigo').eq('user_id', user.id).order('nome'),
      supabase.from('sindicatos').select('id,razao_social,sigla,tipo').eq('user_id', user.id).order('razao_social'),
      supabase.from('instrumentos').select('id,nome,tipo,vigencia_fim,vigencia_inicio,empresa_id,operacao_id,sindicato_laboral_id,sindicato_patronal_id')
        .eq('user_id', user.id).eq('status_processamento', 'processado').order('nome'),
    ]).then(([{ data: e }, { data: o }, { data: s }, { data: i }]) => {
      setTodasEmpresas(e || [])
      setTodasOperacoes(o || [])
      setTodosSindicatos(s || [])
      setTodosInstrumentos(i || [])
    })
  }, [user])

  const subcatsDisponiveis = filtros.categorias.length > 0
    ? filtros.categorias.flatMap(cat => (CATEGORIAS[cat] || []).map(s => ({ value: s, label: s })))
    : Object.values(CATEGORIAS).flat().map(s => ({ value: s, label: s }))

  function filtrarInstrumentos() {
    let insts = [...todosInstrumentos]
    if (filtros.instrumentos.length > 0) insts = insts.filter(i => filtros.instrumentos.includes(i.id))
    if (filtros.empresas.length > 0) insts = insts.filter(i => filtros.empresas.includes(i.empresa_id))
    if (filtros.operacoes.length > 0) insts = insts.filter(i => filtros.operacoes.includes(i.operacao_id))
    if (filtros.sindicatosLab.length > 0) insts = insts.filter(i => filtros.sindicatosLab.includes(i.sindicato_laboral_id))
    if (filtros.sindicatosPat.length > 0) insts = insts.filter(i => filtros.sindicatosPat.includes(i.sindicato_patronal_id))
    if (filtros.vigencia === 'vigente') insts = insts.filter(i => vigenciaStatus(i.vigencia_fim) === 'vigente')
    else if (filtros.vigencia === 'vencido') insts = insts.filter(i => vigenciaStatus(i.vigencia_fim) === 'vencido')
    else if (filtros.vigencia === 'alerta') insts = insts.filter(i => vigenciaStatus(i.vigencia_fim) === 'alerta')
    else if (filtros.vigencia === 'ultimo_vigente') {
      const grupos = {}
      for (const i of insts) {
        const key = (i.empresa_id || '') + '-' + (i.operacao_id || '') + '-' + (i.sindicato_laboral_id || '')
        if (!grupos[key]) grupos[key] = []
        grupos[key].push(i)
      }
      insts = Object.values(grupos).map(grupo => {
        const vigentes = grupo.filter(i => vigenciaStatus(i.vigencia_fim) === 'vigente')
        const lista = vigentes.length > 0 ? vigentes : grupo
        return lista.sort((a, b) => new Date(b.vigencia_fim || 0) - new Date(a.vigencia_fim || 0))[0]
      })
    }
    return insts
  }

  async function calcularPreview() {
    const insts = filtrarInstrumentos()
    if (insts.length === 0) { setPreview({ count: 0, instrumentosCount: 0 }); return }
    let total = 0
    for (const inst of insts) {
      const { count } = await supabase.from('clausulas').select('*', { count: 'exact', head: true })
        .eq('instrumento_id', inst.id).eq('user_id', user.id)
      total += count || 0
    }
    setPreview({ count: total, instrumentosCount: insts.length })
  }

  async function buscarDados() {
    const insts = filtrarInstrumentos()
    if (insts.length === 0) return { insts: [], clausulas: [] }
    let todasClausulas = []
    for (const inst of insts) {
      let q = supabase.from('clausulas').select('*').eq('instrumento_id', inst.id).eq('user_id', user.id)
      if (filtros.categorias.length > 0) q = q.in('categoria', filtros.categorias)
      if (filtros.subcategorias.length > 0) q = q.in('subcategoria', filtros.subcategorias)
      const { data } = await q
      todasClausulas = todasClausulas.concat(data || [])
    }
    return { insts, clausulas: todasClausulas }
  }

  async function exportarExcel() {
    setLoading(true)
    try {
      const { insts, clausulas } = await buscarDados()
      if (clausulas.length === 0) { alert('Nenhuma cláusula encontrada.'); setLoading(false); return }
      if (insts.length === 1) {
        const inst = insts[0]
        const [{ data: emp }, { data: op }, { data: sLab }, { data: sPat }] = await Promise.all([
          inst.empresa_id ? supabase.from('empresas').select('*').eq('id', inst.empresa_id).single() : { data: null },
          inst.operacao_id ? supabase.from('operacoes').select('*').eq('id', inst.operacao_id).single() : { data: null },
          inst.sindicato_laboral_id ? supabase.from('sindicatos').select('*').eq('id', inst.sindicato_laboral_id).single() : { data: null },
          inst.sindicato_patronal_id ? supabase.from('sindicatos').select('*').eq('id', inst.sindicato_patronal_id).single() : { data: null },
        ])
        await gerarExcelInstrumento(inst, clausulas, emp, op, sLab, sPat)
      } else {
        const [{ data: emps }, { data: ops }, { data: sinds }] = await Promise.all([
          supabase.from('empresas').select('*').eq('user_id', user.id),
          supabase.from('operacoes').select('*').eq('user_id', user.id),
          supabase.from('sindicatos').select('*').eq('user_id', user.id),
        ])
        await gerarExcelMultiplo(insts, clausulas, emps, ops, sinds)
      }
    } catch (e) { alert('Erro: ' + e.message) }
    setLoading(false)
  }

  async function exportarPDF() {
    setLoading(true)
    try {
      const { insts, clausulas } = await buscarDados()
      if (clausulas.length === 0) { alert('Nenhuma cláusula encontrada.'); setLoading(false); return }
      for (const inst of insts) {
        const clausulasInst = clausulas.filter(c => c.instrumento_id === inst.id)
        if (!clausulasInst.length) continue
        const [{ data: emp }, { data: op }, { data: sLab }, { data: sPat }] = await Promise.all([
          inst.empresa_id ? supabase.from('empresas').select('*').eq('id', inst.empresa_id).single() : { data: null },
          inst.operacao_id ? supabase.from('operacoes').select('*').eq('id', inst.operacao_id).single() : { data: null },
          inst.sindicato_laboral_id ? supabase.from('sindicatos').select('*').eq('id', inst.sindicato_laboral_id).single() : { data: null },
          inst.sindicato_patronal_id ? supabase.from('sindicatos').select('*').eq('id', inst.sindicato_patronal_id).single() : { data: null },
        ])
        gerarPDFInstrumento(inst, clausulasInst, emp, op, sLab, sPat)
        if (insts.length > 1) await new Promise(r => setTimeout(r, 600))
      }
    } catch (e) { alert('Erro: ' + e.message) }
    setLoading(false)
  }

  const laboral = todosSindicatos.filter(s => s.tipo === 'laboral')
  const patronal = todosSindicatos.filter(s => s.tipo === 'patronal')
  const instsPreview = filtrarInstrumentos()

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-800">Relatórios</h1>
        <p className="text-slate-500 text-sm">Selecione os filtros e gere relatórios em Excel ou PDF</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="card p-5">
          <h2 className="font-display font-semibold text-slate-700 mb-1">🔍 Filtros do Relatório</h2>
          <p className="text-xs text-slate-400 mb-4">Deixe em branco para incluir todos. Use Ctrl+clique para selecionar vários itens em cada filtro.</p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <MultiSelect label="Empresa(s)"
              options={todasEmpresas.map(e => ({ value: e.id, label: e.razao_social }))}
              value={filtros.empresas} onChange={v => setFiltros({ ...filtros, empresas: v })} />

            <MultiSelect label="Operação(ões)"
              options={todasOperacoes.map(o => ({ value: o.id, label: o.nome + (o.codigo ? ' (' + o.codigo + ')' : '') }))}
              value={filtros.operacoes} onChange={v => setFiltros({ ...filtros, operacoes: v })} />

            <MultiSelect label="Sindicato(s) Laboral(is)"
              options={laboral.map(s => ({ value: s.id, label: (s.sigla ? s.sigla + ' — ' : '') + s.razao_social }))}
              value={filtros.sindicatosLab} onChange={v => setFiltros({ ...filtros, sindicatosLab: v })} />

            <MultiSelect label="Sindicato(s) Patronal(is)"
              options={patronal.map(s => ({ value: s.id, label: (s.sigla ? s.sigla + ' — ' : '') + s.razao_social }))}
              value={filtros.sindicatosPat} onChange={v => setFiltros({ ...filtros, sindicatosPat: v })} />

            <MultiSelect label="Instrumento(s) Coletivo(s)"
              options={todosInstrumentos.map(i => ({ value: i.id, label: i.tipo + ' — ' + i.nome }))}
              value={filtros.instrumentos} onChange={v => setFiltros({ ...filtros, instrumentos: v })} />

            <div>
              <label className="label">Vigência</label>
              <select className="input" value={filtros.vigencia} onChange={e => setFiltros({ ...filtros, vigencia: e.target.value })}>
                <option value="">Todos (vigentes e vencidos)</option>
                <option value="vigente">Somente vigentes</option>
                <option value="alerta">Vence em 60 dias</option>
                <option value="vencido">Somente vencidos</option>
                <option value="ultimo_vigente">Último por operação (vigente ou mais recente)</option>
              </select>
            </div>

            <MultiSelect label="Categoria(s)"
              options={Object.keys(CATEGORIAS).map(c => ({ value: c, label: c }))}
              value={filtros.categorias} onChange={v => setFiltros({ ...filtros, categorias: v, subcategorias: [] })} />

            <MultiSelect label="Subcategoria(s)"
              options={subcatsDisponiveis.filter((o, i, arr) => arr.findIndex(x => x.value === o.value) === i)}
              value={filtros.subcategorias} onChange={v => setFiltros({ ...filtros, subcategorias: v })} />
          </div>

          {/* Preview */}
          <div className="bg-surface-50 rounded-lg p-3 mb-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium text-slate-700">
                {instsPreview.length} instrumento{instsPreview.length !== 1 ? 's' : ''} selecionado{instsPreview.length !== 1 ? 's' : ''}
                {preview !== null ? ' — ' + preview.count + ' cláusula' + (preview.count !== 1 ? 's' : '') : ''}
              </p>
              {instsPreview.length > 0 && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {instsPreview.slice(0, 3).map(i => i.nome).join(', ')}{instsPreview.length > 3 ? ' e mais ' + (instsPreview.length - 3) + '...' : ''}
                </p>
              )}
            </div>
            <button className="btn-secondary text-xs py-1" onClick={calcularPreview}>
              Calcular prévia
            </button>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button className="btn-primary" onClick={exportarExcel} disabled={loading || instsPreview.length === 0}>
              {loading ? '⏳ Gerando...' : '📊 Exportar Excel'}
            </button>
            <button className="btn-secondary" onClick={exportarPDF} disabled={loading || instsPreview.length === 0}>
              {loading ? '⏳ Gerando...' : '📄 Exportar PDF'}
            </button>
            <button className="btn-secondary text-slate-400" onClick={() => {
              setFiltros({ empresas: [], operacoes: [], sindicatosLab: [], sindicatosPat: [], categorias: [], subcategorias: [], instrumentos: [], vigencia: '' })
              setPreview(null)
            }}>
              Limpar filtros
            </button>
          </div>

          {instsPreview.length === 0 && todosInstrumentos.length === 0 && (
            <p className="text-xs text-amber-600 mt-3">⚠️ Nenhum instrumento processado encontrado.</p>
          )}
        </div>

        <div className="card p-5 border-2 border-dashed border-slate-200">
          <h2 className="font-display font-semibold text-slate-700 mb-1">⚖️ Relatório Comparativo</h2>
          <p className="text-sm text-slate-500 mb-4">Para comparar dois instrumentos, use a página de Comparativo — o export está disponível lá após rodar a comparação.</p>
          <a href="#/comparativo" className="btn-secondary text-sm">Ir para Comparativo →</a>
        </div>
      </div>
    </div>
  )
}
