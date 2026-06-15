import { useState, useEffect } from 'react'
import { PROVEDORES, getAIConfig, saveAIConfig, testarConexao } from '../services/ai'
import { ultimosMeses, getIndicesManuais, setIndicesManuais } from '../services/indices'

export default function Configuracoes() {
  const [config, setConfig] = useState({ provedor: 'gemini', chave: '', modelo: '' })
  const [mostrarChave, setMostrarChave] = useState(false)
  const [testando, setTestando] = useState(false)
  const [testeResult, setTesteResult] = useState(null)
  const [salvo, setSalvo] = useState(false)

  // Índices econômicos manuais (fallback quando a API do BCB não responder)
  const [indicesManuais, setIndicesManuaisState] = useState({})
  const [indicesSalvo, setIndicesSalvo] = useState(false)
  const meses = ultimosMeses(12)

  useEffect(() => {
    setIndicesManuaisState(getIndicesManuais())
  }, [])

  function setIndiceValor(mesKey, campo, valor) {
    setIndicesManuaisState(prev => ({
      ...prev,
      [mesKey]: { ...prev[mesKey], [campo]: valor === '' ? undefined : parseFloat(valor) },
    }))
  }

  function salvarIndices() {
    setIndicesManuais(indicesManuais)
    setIndicesSalvo(true)
    setTimeout(() => setIndicesSalvo(false), 2000)
  }

  useEffect(() => {
    const c = getAIConfig()
    if (c) setConfig(c)
    else setConfig({ provedor: 'gemini', chave: '', modelo: PROVEDORES.gemini.modelo_padrao })
  }, [])

  function onProvedorChange(p) {
    setConfig({ provedor: p, chave: config.chave, modelo: PROVEDORES[p]?.modelo_padrao || '' })
    setTesteResult(null)
  }

  function salvar() {
    saveAIConfig(config)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  async function testar() {
    if (!config.chave) return alert('Insira a chave API antes de testar')
    setTestando(true); setTesteResult(null)
    const res = await testarConexao(config)
    setTesteResult(res)
    setTestando(false)
  }

  const prov = PROVEDORES[config.provedor]

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-800">Configurações de IA</h1>
        <p className="text-slate-500 text-sm">Configure o provedor de IA para extração de cláusulas</p>
      </div>

      <div className="max-w-2xl">
        <div className="card p-6 mb-4">
          <h2 className="font-display font-semibold text-slate-700 mb-4">Provedor de IA</h2>

          {/* Seleção de provedor */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            {Object.entries(PROVEDORES).map(([key, p]) => (
              <button
                key={key}
                onClick={() => onProvedorChange(key)}
                className={`p-3 rounded-lg border text-left transition-all ${config.provedor === key ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <p className="text-sm font-medium">{p.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">Modelo: {p.modelo_padrao}</p>
                {p.suporta_pdf_nativo && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded mt-1 inline-block">Lê PDF nativo</span>}
              </button>
            ))}
          </div>

          {/* Chave API */}
          <div className="mb-4">
            <label className="label">Chave API — {prov?.label}</label>
            <div className="relative">
              <input
                type={mostrarChave ? 'text' : 'password'}
                className="input pr-20"
                placeholder="Cole sua chave API aqui..."
                value={config.chave}
                onChange={e => setConfig({...config, chave: e.target.value})}
              />
              <button
                onClick={() => setMostrarChave(!mostrarChave)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                {mostrarChave ? '🙈 Ocultar' : '👁 Revelar'}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">Sua chave é salva apenas no navegador (localStorage) — não vai para nenhum servidor nosso.</p>
          </div>

          {/* Modelo */}
          <div className="mb-5">
            <label className="label">Modelo específico</label>
            <input className="input" value={config.modelo} onChange={e => setConfig({...config, modelo: e.target.value})} />
            <p className="text-xs text-slate-400 mt-1">Padrão: {prov?.modelo_padrao}</p>
          </div>

          {/* Botões */}
          <div className="flex gap-3">
            <button className="btn-primary" onClick={salvar}>
              {salvo ? '✅ Salvo!' : 'Salvar Configurações'}
            </button>
            <button className="btn-secondary" onClick={testar} disabled={testando}>
              {testando ? '⏳ Testando...' : '🔌 Testar Conexão'}
            </button>
          </div>

          {/* Resultado do teste */}
          {testeResult && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${testeResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {testeResult.ok ? '✅ Conexão funcionando corretamente!' : `❌ Erro: ${testeResult.error}`}
            </div>
          )}
        </div>

        {/* Guia de onde obter chaves */}
        <div className="card p-5">
          <h2 className="font-display font-semibold text-slate-700 mb-3">📋 Como obter chaves API gratuitas</h2>
          <div className="space-y-3 text-sm">
            {[
              { nome: 'Google Gemini', url: 'https://aistudio.google.com/app/apikey', desc: 'Gratuito. Login com conta Google.' },
              { nome: 'Groq (mais rápido)', url: 'https://console.groq.com/keys', desc: 'Gratuito. Llama 3.3 70B — muito rápido.' },
              { nome: 'Anthropic Claude', url: 'https://console.anthropic.com', desc: 'Crédito inicial gratuito de USD 5.' },
              { nome: 'OpenAI', url: 'https://platform.openai.com/api-keys', desc: 'Crédito inicial gratuito.' },
              { nome: 'NVIDIA NIM', url: 'https://build.nvidia.com', desc: 'Gratuito com conta NVIDIA.' },
              { nome: 'Mistral', url: 'https://console.mistral.ai', desc: 'Tier gratuito disponível.' },
            ].map(p => (
              <div key={p.nome} className="flex items-start gap-3 p-3 bg-surface-50 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-slate-700">{p.nome}</p>
                  <p className="text-xs text-slate-500">{p.desc}</p>
                </div>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline flex-shrink-0">
                  Acessar →
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Índices econômicos manuais — fallback IPCA/INPC */}
        <div className="card p-5 mt-4">
          <h2 className="font-display font-semibold text-slate-700 mb-1">📈 Índices Econômicos (IPCA / INPC)</h2>
          <p className="text-xs text-slate-400 mb-4">
            O Dashboard busca o IPCA e o INPC automaticamente na API do Banco Central. Se a API não estiver
            disponível para algum mês, os valores informados aqui (variação mensal %) serão usados como fallback.
            Deixe em branco para usar somente a API.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-3">Mês</th>
                  <th className="py-2 pr-3">IPCA (%)</th>
                  <th className="py-2 pr-3">INPC (%)</th>
                </tr>
              </thead>
              <tbody>
                {meses.map(m => (
                  <tr key={m.key} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3 text-slate-600 capitalize">{m.label}</td>
                    <td className="py-1.5 pr-3">
                      <input type="number" step="0.01" placeholder="—" className="input text-sm w-24 py-1"
                        value={indicesManuais[m.key]?.ipca ?? ''}
                        onChange={e => setIndiceValor(m.key, 'ipca', e.target.value)}/>
                    </td>
                    <td className="py-1.5 pr-3">
                      <input type="number" step="0.01" placeholder="—" className="input text-sm w-24 py-1"
                        value={indicesManuais[m.key]?.inpc ?? ''}
                        onChange={e => setIndiceValor(m.key, 'inpc', e.target.value)}/>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn-primary mt-4" onClick={salvarIndices}>
            {indicesSalvo ? '✅ Salvo!' : 'Salvar Índices'}
          </button>
          <p className="text-xs text-slate-400 mt-2">
            Fonte oficial: <a href="https://www.ibge.gov.br/estatisticas/economicas/precos-e-custos/9256-indice-nacional-de-precos-ao-consumidor-amplo.html" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">IBGE — IPCA/INPC</a>
          </p>
        </div>
      </div>
    </div>
  )
}
