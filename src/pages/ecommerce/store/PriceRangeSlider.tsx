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
    <div className="inline-flex items-center gap-2.5 bg-white border border-gray-200 rounded-full pl-3 pr-3.5 py-1.5">
      <span className="text-[11px] font-semibold text-gray-500 whitespace-nowrap">
        {formatSoles(low)}–{formatSoles(high)}
      </span>
      <div className="relative h-4 w-28 shrink-0">
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-[3px] rounded-full bg-gray-200" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full"
          style={{ left: `${pctLow}%`, right: `${100 - pctHigh}%`, background: 'rgb(var(--vs-primary))' }}
        />
        <input
          type="range"
          min={floor}
          max={ceil}
          value={low}
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
          width: 12px;
          height: 12px;
          border-radius: 9999px;
          background: rgb(var(--vs-primary));
          border: 2px solid #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: pointer;
        }
        .vs-range-thumb::-moz-range-thumb {
          pointer-events: auto;
          width: 12px;
          height: 12px;
          border-radius: 9999px;
          background: rgb(var(--vs-primary));
          border: 2px solid #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: pointer;
        }
        .vs-range-thumb::-webkit-slider-runnable-track { background: transparent; }
        .vs-range-thumb::-moz-range-track { background: transparent; }
      `}</style>
    </div>
  )
}
