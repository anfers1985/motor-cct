import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

// Verifica no Supabase se o e-mail logado está em membros_autorizados.
export function useMembro(user) {
  const [membro, setMembro] = useState(null) // null = verificando
  useEffect(() => {
    if (!user) { setMembro(null); return }
    let ativo = true
    supabase.rpc('is_membro').then(({ data, error }) => {
      if (!ativo) return
      if (error) console.error('Erro ao verificar acesso:', error)
      setMembro(error ? false : !!data)
    })
    return () => { ativo = false }
  }, [user?.id])
  return membro
}
