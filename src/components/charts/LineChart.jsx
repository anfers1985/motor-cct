// Gráfico de linhas em SVG puro — sem dependências externas.
// series: [{ name, color, data: [number|null] }], labels: string[]
// seriesVisiveis: Set de nomes visíveis (opcional). Se não passado, todas visíveis.
// onToggleSerie: callback(name) para alternar visibilidade — se não passado, sem toggle.
export default function LineChart({
  series,
  labels,
  height = 260,
  formatValue = v => v?.toFixed(2) + '%',
  seriesVisiveis,
  onToggleSerie,
}) {
  const W = 700, H = height
  const padL = 48, padR = 16, padT = 16, padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  // Filtra apenas séries visíveis para cálculo de escala
  const seriesAtivas = seriesVisiveis
    ? series.filter(s => seriesVisiveis.has(s.name))
    : series

  const todosValores = seriesAtivas.flatMap(s => s.data).filter(v => v != null)
  if (todosValores.length === 0) {
    return <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>Sem dados disponíveis</div>
  }

  let min = Math.min(...todosValores, 0)
  let max = Math.max(...todosValores, 0)
  if (min === max) { min -= 1; max += 1 }
  const margin = (max - min) * 0.12
  min -= margin; max += margin

  const n = labels.length
  const x = i => padL + (innerW * i) / Math.max(n - 1, 1)
  const y = v => padT + innerH - ((v - min) / (max - min)) * innerH
  const yZero = y(0)

  const gridLevels = 4
  const gridYs = Array.from({ length: gridLevels + 1 }, (_, i) => min + ((max - min) * i) / gridLevels)

  function pathFor(data) {
    let d = '', started = false
    data.forEach((v, i) => {
      if (v == null) { started = false; return }
      const cmd = started ? 'L' : 'M'
      d += `${cmd}${x(i).toFixed(1)},${y(v).toFixed(1)} `
      started = true
    })
    return d.trim()
  }

  const hasToggle = !!onToggleSerie

  // Decide quais índices de label mostrar (máximo 12 para não sobrelotar)
  const labelStep = Math.ceil(n / 12)

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }} preserveAspectRatio="xMidYMid meet">
        {/* Gridlines + labels eixo Y */}
        {gridYs.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#f1f5f9" strokeWidth="1"/>
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{v.toFixed(2)}</text>
          </g>
        ))}

        {/* Linha do zero */}
        {min < 0 && max > 0 && (
          <line x1={padL} x2={W - padR} y1={yZero} y2={yZero} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2,2"/>
        )}

        {/* Eixo X */}
        {labels.map((l, i) => (
          (i % labelStep === 0 || i === n - 1) && (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">{l}</text>
          )
        ))}

        {/* Séries */}
        {series.map(s => {
          const visivel = !seriesVisiveis || seriesVisiveis.has(s.name)
          if (!visivel) return null
          return (
            <g key={s.name}>
              <path d={pathFor(s.data)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
              {s.data.map((v, i) => {
                if (v == null) return null
                const cx = x(i), cy = y(v)
                const label = formatValue(v)
                // Posiciona o label acima ou abaixo dependendo do espaço
                const labelY = cy - 7 < padT + 12 ? cy + 13 : cy - 7
                return (
                  <g key={i}>
                    <circle cx={cx} cy={cy} r="3" fill={s.color} />
                    {/* Label do valor sempre visível em cada ponto */}
                    <text
                      x={cx}
                      y={labelY}
                      textAnchor="middle"
                      fontSize="7.5"
                      fontWeight="600"
                      fill={s.color}
                      style={{ pointerEvents: 'none' }}
                    >
                      {label}
                    </text>
                    {/* Tooltip ao hover via <title> */}
                    <circle cx={cx} cy={cy} r="6" fill="transparent" stroke="none">
                      <title>{labels[i]}: {label}</title>
                    </circle>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>

      {/* Legenda — clicável se onToggleSerie fornecido */}
      <div className="flex gap-4 justify-center mt-2 flex-wrap">
        {series.map(s => {
          const visivel = !seriesVisiveis || seriesVisiveis.has(s.name)
          return (
            <button
              key={s.name}
              onClick={hasToggle ? () => onToggleSerie(s.name) : undefined}
              className={`flex items-center gap-1.5 text-xs rounded px-1 py-0.5 transition-opacity ${hasToggle ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${visivel ? 'opacity-100' : 'opacity-35'}`}
              title={hasToggle ? (visivel ? 'Clique para ocultar' : 'Clique para exibir') : s.name}
              style={{ color: visivel ? s.color : '#94a3b8', background: 'transparent', border: 'none' }}
            >
              <span className="w-5 h-0.5 rounded inline-block" style={{ backgroundColor: visivel ? s.color : '#94a3b8' }}/>
              <span style={{ color: visivel ? '#475569' : '#94a3b8' }}>{s.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
