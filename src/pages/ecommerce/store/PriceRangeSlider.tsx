import { useEffect, useState } from 'react'

function formatSoles(n: number): string {
  return `S/ ${Number(n).toFixed(0)}`
}

export default function PriceRangeSlider({
  bounds,
  value,
  onChange,
}: {
  bounds: { min: number; max: number }
  value: { min: number | null; max: number | null }
  onChange: (value: { min: number | null; max: number | null }) => void
}) {
  const floor = Math.floor(bounds.min)
  const ceil = Math.max(Math.ceil(bounds.max), floor + 1)
  const [low, setLow] = useState(value.min ?? floor)
  const [high, setHigh] = useState(value.max ?? ceil)

  useEffect(() => {
    setLow(value.min ?? floor)
    setHigh(value.max ?? ceil)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.min, bounds.max])

  const commit = (nextLow: number, nextHigh: number) => {
    onChange({
      min: nextLow <= floor ? null : nextLow,
      max: nextHigh >= ceil ? null : nextHigh,
    })
  }

  const pctLow = ((low - floor) / (ceil - floor)) * 100
  const pctHigh = ((high - floor) / (ceil - floor)) * 100

  return (
    <div className="vs-range">
      <span>
        {formatSoles(low)} – {formatSoles(high)}
      </span>
      <div className="relative h-5 w-32 sm:w-40 shrink-0">
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-[6px] rounded-full" style={{ background: 'var(--vs-line)' }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-[6px] rounded-full"
          style={{ left: `${pctLow}%`, right: `${100 - pctHigh}%`, background: 'var(--vs-g)' }}
        />
        <input
          type="range"
          min={floor}
          max={ceil}
          value={low}
          aria-label="Precio mínimo"
          onChange={(e) => {
            const next = Math.min(Number(e.target.value), high - 1)
            setLow(next)
            commit(next, high)
          }}
          className="vs-range-thumb absolute inset-0 w-full appearance-none bg-transparent pointer-events-none"
        />
        <input
          type="range"
          min={floor}
          max={ceil}
          value={high}
          aria-label="Precio máximo"
          onChange={(e) => {
            const next = Math.max(Number(e.target.value), low + 1)
            setHigh(next)
            commit(low, next)
          }}
          className="vs-range-thumb absolute inset-0 w-full appearance-none bg-transparent pointer-events-none"
        />
      </div>
      <style>{`
        .vs-range-thumb::-webkit-slider-thumb {
          pointer-events: auto;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          background: #fff;
          border: 4px solid var(--vs-g-d);
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          cursor: pointer;
        }
        .vs-range-thumb::-moz-range-thumb {
          pointer-events: auto;
          width: 12px;
          height: 12px;
          border-radius: 9999px;
          background: #fff;
          border: 4px solid var(--vs-g-d);
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          cursor: pointer;
        }
        .vs-range-thumb::-webkit-slider-runnable-track { background: transparent; }
        .vs-range-thumb::-moz-range-track { background: transparent; }
      `}</style>
    </div>
  )
}
