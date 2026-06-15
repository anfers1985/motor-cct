// Gráfico de linhas simples em SVG puro — sem dependências externas.
// series: [{ name, color, data: [number|null] }], labels: string[]
export default function LineChart({ series, labels, height = 220, formatValue = v => v?.toFixed(2) + '%' }) {
  const W = 700, H = height
  const padL = 40, padR = 10, padT = 10, padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const todosValores = series.flatMap(s => s.data).filter(v => v != null)
  if (todosValores.length === 0) {
    return <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>Sem dados disponíveis</div>
  }

  let min = Math.min(...todosValores, 0)
  let max = Math.max(...todosValores, 0)
  if (min === max) { min -= 1; max += 1 }
  const margin = (max - min) * 0.12
  min -= margin; max += margin

  const n = labels.length
  const x = i => padL + (innerW * i) / (n - 1)
  const y = v => padT + innerH - ((v - min) / (max - min)) * innerH

  const yZero = y(0)

  // Gridlines horizontais (5 níveis)
  const gridLevels = 4
  const gridYs = Array.from({ length: gridLevels + 1 }, (_, i) => min + ((max - min) * i) / gridLevels)

  function pathFor(data) {
    let d = ''
    let started = false
    data.forEach((v, i) => {
      if (v == null) { started = false; return }
      const cmd = started ? 'L' : 'M'
      d += `${cmd}${x(i).toFixed(1)},${y(v).toFixed(1)} `
      started = true
    })
    return d.trim()
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }} preserveAspectRatio="xMidYMid meet">
        {/* Gridlines + labels do eixo Y */}
        {gridYs.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#f1f5f9" strokeWidth="1"/>
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{v.toFixed(1)}</text>
          </g>
        ))}

        {/* Linha do zero, destacada */}
        {min < 0 && max > 0 && (
          <line x1={padL} x2={W - padR} y1={yZero} y2={yZero} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2,2"/>
        )}

        {/* Eixo X — labels dos meses */}
        {labels.map((l, i) => (
          (i % Math.ceil(n / 12) === 0 || i === n - 1) && (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">{l}</text>
          )
        ))}

        {/* Séries */}
        {series.map(s => (
          <g key={s.name}>
            <path d={pathFor(s.data)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
            {s.data.map((v, i) => v != null && (
              <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill={s.color}>
                <title>{labels[i]}: {formatValue(v)}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>

      {/* Legenda */}
      <div className="flex gap-4 justify-center mt-2 flex-wrap">
        {series.map(s => (
          <div key={s.name} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-3 h-0.5 rounded" style={{ backgroundColor: s.color }}/>
            {s.name}
          </div>
        ))}
      </div>
    </div>
  )
}
