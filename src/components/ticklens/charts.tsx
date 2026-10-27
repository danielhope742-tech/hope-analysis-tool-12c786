import { cn } from '@/lib/utils'

/** Line chart of recent quotes with the latest point marked. */
export function TickChart({
  quotes,
  className,
}: {
  quotes: number[]
  className?: string
}) {
  const width = 600
  const height = 160
  const pad = 8
  if (quotes.length < 2) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground',
          className,
        )}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        Waiting for ticks…
      </div>
    )
  }
  const min = Math.min(...quotes)
  const max = Math.max(...quotes)
  const span = max - min || 1
  const x = (i: number) => pad + (i / (quotes.length - 1)) * (width - pad * 2)
  const y = (q: number) => pad + (1 - (q - min) / span) * (height - pad * 2)
  const line = quotes.map((q, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(q).toFixed(1)}`).join('')
  const area = `${line}L${x(quotes.length - 1)},${height}L${x(0)},${height}Z`
  const last = quotes[quotes.length - 1]
  const up = last >= quotes[quotes.length - 2]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('w-full', className)}
      role="img"
      aria-label={`Price chart of the last ${quotes.length} ticks`}
    >
      <defs>
        <linearGradient id="tick-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={0}
          x2={width}
          y1={height * f}
          y2={height * f}
          stroke="var(--border)"
          strokeDasharray="2 6"
        />
      ))}
      <path d={area} fill="url(#tick-area)" />
      <path d={line} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" />
      <circle
        cx={x(quotes.length - 1)}
        cy={y(last)}
        r={5}
        fill={up ? 'var(--up)' : 'var(--down)'}
        stroke="var(--background)"
        strokeWidth={2}
      />
    </svg>
  )
}

/** Ten digit tiles with frequency, highlighting the current, hottest and coldest digit. */
export function DigitDistribution({
  pct,
  current,
  hottest,
  coldest,
  predicted,
  total,
}: {
  pct: number[]
  current: number | null
  hottest: number
  coldest: number
  predicted: number | null
  total: number
}) {
  const maxPct = Math.max(...pct, 10)
  return (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
      {pct.map((p, d) => {
        const isCurrent = current === d
        const tone = !total ? 'neutral' : d === hottest ? 'hot' : d === coldest ? 'cold' : 'neutral'
        return (
          <div
            key={d}
            className={cn(
              'relative flex flex-col items-center gap-2 rounded-xl border bg-background/40 px-1 pt-3 pb-2 transition-colors',
              isCurrent && 'border-primary bg-primary/10',
            )}
          >
            {isCurrent && (
              <span className="absolute -top-2 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-primary" />
            )}
            <span
              className={cn(
                'tabular flex size-10 items-center justify-center rounded-full text-lg font-bold',
                tone === 'hot' && 'bg-up/15 text-up ring-1 ring-up/40',
                tone === 'cold' && 'bg-down/15 text-down ring-1 ring-down/40',
                tone === 'neutral' && 'bg-muted text-foreground',
                isCurrent && 'tick-flash',
              )}
              key={isCurrent ? `c-${total}` : d}
            >
              {d}
            </span>
            <div className="flex h-16 w-2 items-end overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'w-full rounded-full transition-[height] duration-500',
                  tone === 'hot' ? 'bg-up' : tone === 'cold' ? 'bg-down' : 'bg-chart-2',
                )}
                style={{ height: `${(p / maxPct) * 100}%` }}
              />
            </div>
            <span className="tabular text-xs font-medium">{p.toFixed(1)}%</span>
            {predicted === d && (
              <span className="text-[10px] font-semibold tracking-wide text-primary uppercase">
                Next
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Two-sided percentage bar, e.g. Even vs Odd. */
export function SplitBar({
  left,
  right,
  leftLabel,
  rightLabel,
  leftClass = 'bg-up',
  rightClass = 'bg-down',
}: {
  left: number
  right: number
  leftLabel: string
  rightLabel: string
  leftClass?: string
  rightClass?: string
}) {
  const sum = left + right || 1
  const l = (left / sum) * 100
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className={cn('font-medium', left >= right && 'text-foreground')}>
          {leftLabel}{' '}
          <span className="tabular text-muted-foreground">{left.toFixed(1)}%</span>
        </span>
        <span className="font-medium">
          <span className="tabular text-muted-foreground">{right.toFixed(1)}%</span>{' '}
          {rightLabel}
        </span>
      </div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('transition-[width] duration-500', leftClass)} style={{ width: `${l}%` }} />
        <div className={cn('flex-1 transition-[width] duration-500', rightClass)} />
      </div>
    </div>
  )
}
