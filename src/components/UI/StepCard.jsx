// Card de um passo de um stepper guiado. Quando confirmado, colapsa exibindo um resumo.
export default function StepCard({ number, title, subtitle, active, done, locked, summary, onEdit, children, onConfirm, onSkip, confirmLabel = 'Confirmar →', skipLabel = 'Incluir todos e avançar' }) {
  return (
    <div className={'card mb-3 overflow-hidden transition-all ' + (locked ? 'opacity-40 pointer-events-none' : '')}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className={'w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 transition-colors ' +
            (done && !active ? 'bg-emerald-500 text-white'
              : active ? 'bg-brand-600 text-white'
              : 'bg-slate-100 text-slate-400')}>
            {done && !active ? '✓' : number}
          </div>
          <div className="flex-1 min-w-0">
            <p className={'font-medium text-sm ' + (active ? 'text-slate-800' : done ? 'text-slate-700' : 'text-slate-500')}>
              {title}
            </p>
            {active && subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            {done && !active && summary && <p className="text-xs text-slate-400 truncate mt-0.5">{summary}</p>}
          </div>
          {done && !active && (
            <button onClick={onEdit}
              className="text-xs text-brand-600 hover:text-brand-700 flex-shrink-0 transition-colors">
              Editar
            </button>
          )}
        </div>

        {active && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            {children}
            <div className="flex gap-2 mt-4">
              {onConfirm && (
                <button className="btn-primary text-sm py-1.5 px-4" onClick={onConfirm}>
                  {confirmLabel}
                </button>
              )}
              {onSkip && (
                <button className="btn-secondary text-xs py-1.5" onClick={onSkip}>
                  {skipLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
