import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { gerarExcelInstrumento } from '../services/reports/excelReport'
import { gerarPDFInstrumento } from '../services/reports/pdfReport'

export default function Relatorios() {
  const { user } = useAuth()
  const [instrumentos, setInstrumentos] = useState([])
  const [selecionado, setSelecionado] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('instrumentos').select('id,nome,tipo').eq('user_id', user.id).eq('status_processamento','processado').order('nome')
      .then(({ data }) => setInstrumentos(data || []))
  }, [user])

  async function gerarExcel() {
    if (!selecionado) return alert('Selecione um instrumento')
    setLoading(true)
    const [{ data: inst }, { data: clausulas }] = await Promise.all([
      supabase.from('instrumentos').select(`
        *,
        empresa:empresa_id(*),
        operacao:operacao_id(*),
        sindicato_laboral:sindicato_laboral_id(*),
        sindicato_patronal:sindicato_patronal_id(*)
      `).eq('id', selecionado).single(),
      supabase.from('clausulas').select('*').eq('instrumento_id', selecionado).order('numero')
    ])
    await gerarExcelInstrumento(inst, clausulas || [], inst?.empresa, inst?.operacao, inst?.sindicato_laboral, inst?.sindicato_patronal)
    setLoading(false)
  }

  async function gerarPDF() {
    if (!selecionado) return alert('Selecione um instrumento')
    setLoading(true)
    const [{ data: inst }, { data: clausulas }] = await Promise.all([
      supabase.from('instrumentos').select(`
        *,
        empresa:empresa_id(*),
        operacao:operacao_id(*),
        sindicato_laboral:sindicato_laboral_id(*),
        sindicato_patronal:sindicato_patronal_id(*)
      `).eq('id', selecionado).single(),
      supabase.from('clausulas').select('*').eq('instrumento_id', selecionado).order('numero')
    ])
    gerarPDFInstrumento(inst, clausulas || [], inst?.empresa, inst?.operacao, inst?.sindicato_laboral, inst?.sindicato_patronal)
    setLoading(false)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-800">Relatórios</h1>
        <p className="text-slate-500 text-sm">Gere relatórios em Excel ou PDF dos seus instrumentos</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Instrumento único */}
        <div className="card p-6">
          <h2 className="font-display font-semibold text-slate-700 mb-1">📄 Instrumento Único</h2>
          <p className="text-sm text-slate-500 mb-4">Exporta todas as cláusulas de um instrumento selecionado, com dados de empresa e sindicatos.</p>

          <div className="mb-4">
            <label className="label">Selecionar Instrumento</label>
            <select className="input" value={selecionado} onChange={e => setSelecionado(e.target.value)}>
              <option value="">Selecione...</option>
              {instrumentos.map(i => <option key={i.id} value={i.id}>{i.tipo} — {i.nome}</option>)}
            </select>
          </div>

          <div className="flex gap-3">
            <button className="btn-primary" onClick={gerarExcel} disabled={loading || !selecionado}>
              📊 Exportar Excel
            </button>
            <button className="btn-secondary" onClick={gerarPDF} disabled={loading || !selecionado}>
              📄 Exportar PDF
            </button>
          </div>

          {selecionado && (
            <div className="mt-4 p-3 bg-surface-50 rounded-lg text-xs text-slate-500">
              <p className="font-medium text-slate-600 mb-1">O que será exportado:</p>
              <ul className="space-y-0.5">
                <li>• Todas as cláusulas com conteúdo integral</li>
                <li>• Dados da empresa, operação e sindicatos</li>
                <li>• Categorias, subcategorias, valores e percentuais</li>
                <li>• Etiquetas definidas pelo usuário</li>
                <li>• Aba de resumo por categoria (Excel)</li>
              </ul>
            </div>
          )}
        </div>

        {/* Comparativo — redireciona para a página */}
        <div className="card p-6 border-2 border-dashed border-slate-200">
          <h2 className="font-display font-semibold text-slate-700 mb-1">⚖️ Relatório Comparativo</h2>
          <p className="text-sm text-slate-500 mb-4">Para gerar um relatório comparativo entre dois instrumentos, use a página de Comparativo — o export está disponível lá após rodar a comparação.</p>
          <a href="/comparativo" className="btn-secondary text-sm">
            Ir para Comparativo →
          </a>
        </div>
      </div>

      {loading && (
        <div className="mt-6 p-4 bg-blue-50 rounded-xl text-blue-700 text-sm">
          ⏳ Gerando arquivo, aguarde...
        </div>
      )}
    </div>
  )
}
