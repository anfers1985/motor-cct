import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCNPJ } from '../utils/formatters'
import Modal from '../components/UI/Modal'

const UFs = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const EMPTY_EMP = { razao_social: '', nome_fantasia: '', cnpj: '', estado: '', municipio: '' }
const EMPTY_OP = { nome: '', codigo: '', estado: '', municipio: '', sindicato_laboral_id: '', sindicato_patronal_id: '' }

export default function Empresas() {
  const { user } = useAuth()
  const [empresas, setEmpresas] = useState([])
  const [sindicatos, setSindicatos] = useState([])
  const [expandida, setExpandida] = useState(null)
  const [operacoes, setOperacoes] = useState({})
  const [busca, setBusca] = useState('')

  const [modalEmp, setModalEmp] = useState(false)
  const [formEmp, setFormEmp] = useState(EMPTY_EMP)
  const [editEmpId, setEditEmpId] = useState(null)

  const [modalOp, setModalOp] = useState(false)
  const [formOp, setFormOp] = useState(EMPTY_OP)
  const [editOpId, setEditOpId] = useState(null)
  const [opEmpresaId, setOpEmpresaId] = useState(null)

  const [loading, setLoading] = useState(false)

  async function carregarEmpresas() {
    const { data } = await supabase.from('empresas').select('*').eq('user_id', user.id).order('razao_social')
    setEmpresas(data || [])
  }

  async function carregarSindicatos() {
    const { data } = await supabase.from('sindicatos').select('id, razao_social, sigla, tipo').eq('user_id', user.id).order('razao_social')
    setSindicatos(data || [])
  }

  async function carregarOperacoes(empresaId) {
    const { data } = await supabase.from('operacoes').select(`
      *, 
      sindicato_laboral:sindicato_laboral_id(razao_social,sigla),
      sindicato_patronal:sindicato_patronal_id(razao_social,sigla)
    `).eq('empresa_id', empresaId).eq('user_id', user.id)
    setOperacoes(prev => ({ ...prev, [empresaId]: data || [] }))
  }

  useEffect(() => {
    if (user) { carregarEmpresas(); carregarSindicatos() }
  }, [user])

  async function toggleExpand(id) {
    if (expandida === id) { setExpandida(null); return }
    setExpandida(id)
    if (!operacoes[id]) await carregarOperacoes(id)
  }

  async function salvarEmpresa() {
    if (!formEmp.razao_social.trim()) return alert('Razão social obrigatória')
    setLoading(true)
    const payload = { ...formEmp, user_id: user.id }
    if (editEmpId) await supabase.from('empresas').update(payload).eq('id', editEmpId)
    else await supabase.from('empresas').insert(payload)
    setModalEmp(false); setLoading(false); carregarEmpresas()
  }

  async function excluirEmpresa(id) {
    if (!confirm('Excluir esta empresa e todas as suas operações?')) return
    await supabase.from('operacoes').delete().eq('empresa_id', id)
    await supabase.from('empresas').delete().eq('id', id)
    carregarEmpresas()
  }

  async function salvarOperacao() {
    if (!formOp.nome.trim()) return alert('Nome da operação obrigatório')
    setLoading(true)
    const payload = { ...formOp, empresa_id: opEmpresaId, user_id: user.id }
    if (editOpId) await supabase.from('operacoes').update(payload).eq('id', editOpId)
    else await supabase.from('operacoes').insert(payload)
    setModalOp(false); setLoading(false); carregarOperacoes(opEmpresaId)
  }

  async function excluirOperacao(id, empresaId) {
    if (!confirm('Excluir esta operação?')) return
    await supabase.from('operacoes').delete().eq('id', id)
    carregarOperacoes(empresaId)
  }

  function abrirNovaOperacao(empresaId) {
    setFormOp(EMPTY_OP); setEditOpId(null); setOpEmpresaId(empresaId); setModalOp(true)
  }

  function abrirEditarOperacao(op) {
    setFormOp({ nome: op.nome, codigo: op.codigo, estado: op.estado, municipio: op.municipio,
      sindicato_laboral_id: op.sindicato_laboral_id || '', sindicato_patronal_id: op.sindicato_patronal_id || '' })
    setEditOpId(op.id); setOpEmpresaId(op.empresa_id); setModalOp(true)
  }

  const filtradas = empresas.filter(e => {
    const q = busca.toLowerCase()
    return !q || e.razao_social?.toLowerCase().includes(q) || e.nome_fantasia?.toLowerCase().includes(q) || e.cnpj?.includes(q)
  })

  const laboral = sindicatos.filter(s => s.tipo === 'laboral')
  const patronal = sindicatos.filter(s => s.tipo === 'patronal')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-800">Empresas</h1>
          <p className="text-slate-500 text-sm">{empresas.length} empresa{empresas.length !== 1 ? 's' : ''} cadastrada{empresas.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => { setFormEmp(EMPTY_EMP); setEditEmpId(null); setModalEmp(true) }}>+ Nova Empresa</button>
      </div>

      <input className="input max-w-xs mb-4" placeholder="Buscar empresa..." value={busca} onChange={e => setBusca(e.target.value)} />

      <div className="space-y-3">
        {filtradas.length === 0 && <div className="card p-8 text-center text-slate-400 text-sm">Nenhuma empresa encontrada</div>}
        {filtradas.map(emp => (
          <div key={emp.id} className="card">
            <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => toggleExpand(emp.id)}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center text-lg">🏢</div>
                <div>
                  <p className="font-medium text-slate-800">{emp.razao_social}</p>
                  <p className="text-xs text-slate-400">{emp.nome_fantasia} · {emp.cnpj} · {emp.estado}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{expandida === emp.id ? '▲' : '▼'}</span>
                <button onClick={e => { e.stopPropagation(); setFormEmp({...emp}); setEditEmpId(emp.id); setModalEmp(true) }} className="text-xs text-brand-600 hover:underline">Editar</button>
                <button onClick={e => { e.stopPropagation(); excluirEmpresa(emp.id) }} className="text-xs text-red-500 hover:underline">Excluir</button>
              </div>
            </div>

            {expandida === emp.id && (
              <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Operações</p>
                  <button className="text-xs btn-secondary py-1 px-2" onClick={() => abrirNovaOperacao(emp.id)}>+ Adicionar Operação</button>
                </div>
                {(operacoes[emp.id] || []).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Nenhuma operação cadastrada.</p>
                ) : (
                  <div className="space-y-2">
                    {(operacoes[emp.id] || []).map(op => (
                      <div key={op.id} className="bg-surface-50 rounded-lg p-3 flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-700">{op.nome} {op.codigo && <span className="text-xs text-slate-400 font-mono">({op.codigo})</span>}</p>
                          <p className="text-xs text-slate-400">{op.municipio} — {op.estado}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Lab: {op.sindicato_laboral?.sigla || op.sindicato_laboral?.razao_social || '—'} ·
                            Pat: {op.sindicato_patronal?.sigla || op.sindicato_patronal?.razao_social || '—'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => abrirEditarOperacao(op)} className="text-xs text-brand-600 hover:underline">Editar</button>
                          <button onClick={() => excluirOperacao(op.id, emp.id)} className="text-xs text-red-500 hover:underline">Excluir</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal Empresa */}
      <Modal open={modalEmp} onClose={() => setModalEmp(false)} title={editEmpId ? 'Editar Empresa' : 'Nova Empresa'}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Razão Social *</label>
            <input className="input" value={formEmp.razao_social} onChange={e => setFormEmp({...formEmp, razao_social: e.target.value})} />
          </div>
          <div>
            <label className="label">Nome Fantasia</label>
            <input className="input" value={formEmp.nome_fantasia} onChange={e => setFormEmp({...formEmp, nome_fantasia: e.target.value})} />
          </div>
          <div>
            <label className="label">CNPJ</label>
            <input className="input" value={formEmp.cnpj} onChange={e => setFormEmp({...formEmp, cnpj: formatCNPJ(e.target.value)})} maxLength={18} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <label className="label">Estado (UF)</label>
            <select className="input" value={formEmp.estado} onChange={e => setFormEmp({...formEmp, estado: e.target.value})}>
              <option value="">Selecione...</option>
              {UFs.map(uf => <option key={uf}>{uf}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Município</label>
            <input className="input" value={formEmp.municipio} onChange={e => setFormEmp({...formEmp, municipio: e.target.value})} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <button className="btn-secondary" onClick={() => setModalEmp(false)}>Cancelar</button>
          <button className="btn-primary" onClick={salvarEmpresa} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </Modal>

      {/* Modal Operação */}
      <Modal open={modalOp} onClose={() => setModalOp(false)} title={editOpId ? 'Editar Operação' : 'Nova Operação'}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Nome da Operação *</label>
            <input className="input" placeholder="ex: Centro de Distribuição SP1" value={formOp.nome} onChange={e => setFormOp({...formOp, nome: e.target.value})} />
          </div>
          <div>
            <label className="label">Código da Operação</label>
            <input className="input" placeholder="ex: SÃO PAULO 1" value={formOp.codigo} onChange={e => setFormOp({...formOp, codigo: e.target.value})} />
          </div>
          <div>
            <label className="label">Estado (UF)</label>
            <select className="input" value={formOp.estado} onChange={e => setFormOp({...formOp, estado: e.target.value})}>
              <option value="">Selecione...</option>
              {UFs.map(uf => <option key={uf}>{uf}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Município</label>
            <input className="input" value={formOp.municipio} onChange={e => setFormOp({...formOp, municipio: e.target.value})} />
          </div>
          <div>
            <label className="label">Sindicato Laboral</label>
            <select className="input" value={formOp.sindicato_laboral_id} onChange={e => setFormOp({...formOp, sindicato_laboral_id: e.target.value})}>
              <option value="">Selecione...</option>
              {laboral.map(s => <option key={s.id} value={s.id}>{s.sigla ? `${s.sigla} — ` : ''}{s.razao_social}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Sindicato Patronal</label>
            <select className="input" value={formOp.sindicato_patronal_id} onChange={e => setFormOp({...formOp, sindicato_patronal_id: e.target.value})}>
              <option value="">Selecione...</option>
              {patronal.map(s => <option key={s.id} value={s.id}>{s.sigla ? `${s.sigla} — ` : ''}{s.razao_social}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <button className="btn-secondary" onClick={() => setModalOp(false)}>Cancelar</button>
          <button className="btn-primary" onClick={salvarOperacao} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </Modal>
    </div>
  )
}
