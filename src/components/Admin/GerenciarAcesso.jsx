import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../hooks/useAuth'

// Painel de administração de acessos. Só aparece para administradores
// (is_admin() no Supabase); para os demais não renderiza nada.
export default function GerenciarAcesso() {
  const { user } = useAuth()
  const [admin, setAdmin] = useState(null) // null = verificando
  const [lista, setLista] = useState([])
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [novoAdmin, setNovoAdmin] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('membros_autorizados')
      .select('email, nome, admin, created_at')
      .order('created_at', { ascending: true })
    if (error) { setErro(error.message); return }
    setLista(data || [])
  }, [])

  useEffect(() => {
    if (!user) return
    supabase.rpc('is_admin').then(({ data, error }) => {
      const ok = !error && !!data
      setAdmin(ok)
      if (ok) carregar()
    })
  }, [user?.id, carregar])

  async function adicionar(e) {
    e.preventDefault()
    setErro('')
    const em = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(em)) { setErro('Informe um e-mail válido.'); return }
    if (lista.some(m => m.email === em)) { setErro('Este e-mail já está na lista.'); return }
    setSalvando(true)
    const { error } = await supabase
      .from('membros_autorizados')
      .insert({ email: em, nome: nome.trim() || null, admin: novoAdmin })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setEmail(''); setNome(''); setNovoAdmin(false)
    carregar()
  }

  async function alternarAdmin(m) {
    setErro('')
    const { error } = await supabase
      .from('membros_autorizados').update({ admin: !m.admin }).eq('email', m.email)
    if (error) setErro(error.message)
    carregar()
  }

  async function remover(m) {
    if (!confirm(`Remover o acesso de ${m.email}?`)) return
    setErro('')
    const { error } = await supabase.from('membros_autorizados').delete().eq('email', m.email)
    if (error) setErro(error.message)
    carregar()
  }

  if (!admin) return null
  const meuEmail = (user?.email || '').toLowerCase()

  return (
    <div className="card p-6 mb-6">
      <h2 className="font-display font-semibold text-slate-800 text-lg mb-1">👥 Acessos da equipe</h2>
      <p className="text-sm text-slate-500 mb-4">
        Quem está na lista vê e edita todos os dados do Motor CCT. Administradores também gerenciam esta lista.
        O e-mail deve ser o mesmo usado no login (GitHub ou Google).
      </p>

      <form onSubmit={adicionar} className="flex gap-2 flex-wrap items-center mb-4">
        <input className="input text-sm w-64" type="email" placeholder="e-mail do colaborador"
          value={email} onChange={e => setEmail(e.target.value)} />
        <input className="input text-sm w-48" placeholder="nome (opcional)"
          value={nome} onChange={e => setNome(e.target.value)} />
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" checked={novoAdmin} onChange={e => setNovoAdmin(e.target.checked)} />
          administrador
        </label>
        <button className="btn-primary" disabled={salvando}>{salvando ? 'Salvando...' : '+ Liberar acesso'}</button>
      </form>

      {erro && <p className="text-sm text-red-600 mb-3">{erro}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100">
            <tr>
              {['E-mail', 'Nome', 'Perfil', ''].map(h => (
                <th key={h} className="text-left py-2 pr-3 text-xs font-medium text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {lista.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-center text-slate-400">Nenhum e-mail autorizado</td></tr>
            )}
            {lista.map(m => {
              const sou = m.email === meuEmail
              return (
                <tr key={m.email}>
                  <td className="py-2 pr-3 text-slate-700">{m.email}{sou && <span className="ml-2 text-xs text-slate-400">(você)</span>}</td>
                  <td className="py-2 pr-3 text-slate-500">{m.nome || '—'}</td>
                  <td className="py-2 pr-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${m.admin ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                      {m.admin ? 'Administrador' : 'Membro'}
                    </span>
                  </td>
                  <td className="py-2">
                    {!sou && (
                      <div className="flex gap-3">
                        <button onClick={() => alternarAdmin(m)} className="text-xs text-brand-600 hover:underline">
                          {m.admin ? 'Tornar membro' : 'Tornar admin'}
                        </button>
                        <button onClick={() => remover(m)} className="text-xs text-red-500 hover:underline">Remover</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
