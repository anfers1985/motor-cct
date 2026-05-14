import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { signInWithGitHub } = useAuth()

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-700 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 rounded-2xl mb-4 text-4xl">
            ⚖️
          </div>
          <h1 className="font-display font-bold text-white text-3xl mb-2">Motor CCT</h1>
          <p className="text-brand-200 text-sm">Sistema de Gestão de Normas Coletivas</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="font-display font-semibold text-slate-800 text-xl mb-1">Bem-vindo</h2>
          <p className="text-slate-500 text-sm mb-6">
            Acesse com sua conta GitHub para continuar.
          </p>

          <button
            onClick={signInWithGitHub}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
            Entrar com GitHub
          </button>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-400 text-center">
              Seus dados são privados e isolados por conta.<br/>
              Sem senha, sem cadastro manual.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-brand-300/60 text-xs mt-6">
          Motor CCT · Anderson Advogado Trabalhista
        </p>
      </div>
    </div>
  )
}
