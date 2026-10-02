import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCNPJ } from '../utils/formatters'
import Modal from '../components/UI/Modal'

const EMPTY = {
  tipo: 'laboral', razao_social: '', sigla: '', cnpj: '',
  estado: '', municipio: '', base_territorial: '', categoria: '',
  federacao: '', confederacao: ''
}

const UFs = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const CONFEDERACOES = ['CUT','Força Sindical','UGT','CTB','NCST','CSB','CSP-Conlutas','Outra']

export default function Sindicatos() {
  const { user } = useAuth()
  const [lista, setLista] = useState([])
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(false)

  async function carregar() {
    const { data } = await supabase.from('sindicatos').select('*').order('razao_social')
    setLista(data || [])
  }

  useEffect(() => { if (user) carregar() }, [user])

  function abrir(item = null) {
    setForm(item ? { ...item } : EMPTY)
    setEditId(item?.id || null)
    setModal(true)
  }

  async function salvar() {
    if (!form.razao_social.trim()) return alert('Razão social obrigatória')
    setLoading(true)
    const payload = { ...form, user_id: user.id }
    if (editId) {
      await supabase.from('sindicatos').update(payload).eq('id', editId)
    } else {
      await supabase.from('sindicatos').insert(payload)
    }
    setModal(false)
    setLoading(false)
    carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir este sindicato?')) return
    await supabase.from('sindicatos').delete().eq('id', id)
    carregar()
  }

  const filtrado = lista.filter(s => {
    const q = busca.toLowerCase()
    const match = !q || s.razao_social?.toLowerCase().includes(q) || s.sigla?.toLowerCase().includes(q) || s.estado?.toLowerCase().includes(q)
    const tipo = !filtroTipo || s.tipo === filtroTipo
    return match && tipo
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-800">Sindicatos</h1>
          <p className="text-slate-500 text-sm">{lista.length} cadastrado{lista.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => abrir()}>+ Novo Sindicato</button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <input className="input max-w-xs" placeholder="Buscar por nome, sigla, UF..." value={busca} onChange={e => setBusca(e.target.value)} />
        <select className="input max-w-[160px]" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="laboral">Laboral</option>
          <option value="patronal">Patronal</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-50 border-b border-slate-100">
            <tr>
              {['Tipo','Razão Social','Sigla','CNPJ','UF','Categoria','Ações'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtrado.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">Nenhum sindicato encontrado</td></tr>
            )}
            {filtrado.map(s => (
              <tr key={s.id} className="hover:bg-surface-50 transition-colors">
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.tipo === 'laboral' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {s.tipo === 'laboral' ? 'Laboral' : 'Patronal'}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-slate-700 max-w-[200px] truncate">{s.razao_social}</td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.sigla}</td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.cnpj}</td>
                <td className="px-4 py-3 text-slate-500">{s.estado}</td>
                <td className="px-4 py-3 text-slate-500 max-w-[140px] truncate">{s.categoria}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => abrir(s)} className="text-xs text-brand-600 hover:underline">Editar</button>
                    <button onClick={() => excluir(s.id)} className="text-xs text-red-500 hover:underline">Excluir</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar Sindicato' : 'Novo Sindicato'}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Tipo *</label>
            <div className="flex gap-3">
              {['laboral','patronal'].map(t => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="tipo" value={t} checked={form.tipo === t} onChange={e => setForm({...form, tipo: e.target.value})} />
                  <span className="text-sm capitalize">{t === 'laboral' ? 'Laboral (trabalhadores)' : 'Patronal (empregadores)'}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="col-span-2">
            <label className="label">Razão Social *</label>
            <input className="input" value={form.razao_social} onChange={e => setForm({...form, razao_social: e.target.value})} />
          </div>

          <div>
            <label className="label">Sigla</label>
            <input className="input" placeholder="ex: SINDIMETAL" value={form.sigla} onChange={e => setForm({...form, sigla: e.target.value.toUpperCase()})} />
          </div>

          <div>
            <label className="label">CNPJ</label>
            <input className="input" value={form.cnpj} onChange={e => setForm({...form, cnpj: formatCNPJ(e.target.value)})} maxLength={18} placeholder="00.000.000/0000-00" />
          </div>

          <div>
            <label className="label">Estado (UF)</label>
            <select className="input" value={form.estado} onChange={e => setForm({...form, estado: e.target.value})}>
              <option value="">Selecione...</option>
              {UFs.map(uf => <option key={uf}>{uf}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Município Sede</label>
            <input className="input" value={form.municipio} onChange={e => setForm({...form, municipio: e.target.value})} />
          </div>

          <div className="col-span-2">
            <label className="label">Base Territorial</label>
            <input className="input" placeholder="ex: Grande Florianópolis" value={form.base_territorial} onChange={e => setForm({...form, base_territorial: e.target.value})} />
          </div>

          <div className="col-span-2">
            <label className="label">Categoria Econômica</label>
            <input className="input" placeholder="ex: Metalúrgicos, Comércio, Transporte" value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} />
          </div>

          <div>
            <label className="label">Federação Vinculada</label>
            <input className="input" placeholder="Nome + UF" value={form.federacao} onChange={e => setForm({...form, federacao: e.target.value})} />
          </div>

          <div>
            <label className="label">Confederação</label>
            <select className="input" value={form.confederacao} onChange={e => setForm({...form, confederacao: e.target.value})}>
              <option value="">Selecione...</option>
              {CONFEDERACOES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn-primary" onClick={salvar} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar Sindicato'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
