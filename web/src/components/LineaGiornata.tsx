// La giornata intera in una striscia: richieste attese minuto per minuto, pioggia, e l'ora attuale.
// Si clicca o si trascina per spostarsi nel tempo.
import { useMemo, useRef } from 'react'
import { orologio, useOra } from '../lib/orologio'
import { hhmm, sec, type Scenario } from '../lib/scenario'

const L = 1000
const H = 72

export function LineaGiornata({ sc }: { sc: Scenario }) {
  const { t } = useOra()
  const svg = useRef<SVGSVGElement>(null)
  const t0 = sec(sc.carico.orari[0])
  const t1 = t0 + sc.carico.orari.length * 60
  const x = (s: number) => ((s - t0) / (t1 - t0)) * L

  const { area, linea, max } = useMemo(() => {
    const v = sc.carico.richieste_attese
    const max = Math.max(...v) * 1.1
    const pts = v.map((y, i) => `${((i / v.length) * L).toFixed(1)},${(H - (y / max) * (H - 6)).toFixed(1)}`)
    return { area: `M0,${H} L${pts.join(' L')} L${L},${H} Z`, linea: `M${pts.join(' L')}`, max }
  }, [sc])

  const pioggia = useMemo(
    () =>
      sc.fasce_s.map((f, i) => ({ x: x(f), w: (300 / (t1 - t0)) * L, mm: sc.pioggia_mm[i] ?? 0 })).filter((p) => p.mm > 0),
    [sc], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const sposta = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    orologio.vai(t0 + ((e.clientX - r.left) / r.width) * (t1 - t0))
  }

  const ore = Array.from({ length: 19 }, (_, i) => 6 * 3600 + i * 3600).filter((o) => o <= t1)
  const iMin = Math.floor((t - t0) / 60)
  const adesso = sc.carico.richieste_attese[iMin] ?? 0

  return (
    <div className="relative select-none">
      <svg
        ref={svg}
        viewBox={`0 0 ${L} ${H + 18}`}
        preserveAspectRatio="none"
        className="h-[92px] w-full cursor-ew-resize touch-none"
        onPointerDown={(e) => {
          ;(e.target as Element).setPointerCapture(e.pointerId)
          sposta(e)
        }}
        onPointerMove={(e) => e.buttons && sposta(e)}
      >
        <defs>
          <linearGradient id="g-carico" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#A1A1AA" stopOpacity="0.32" />
            <stop offset="1" stopColor="#A1A1AA" stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="passato">
            <rect x="0" y="0" width={x(t)} height={H} />
          </clipPath>
        </defs>
        {pioggia.map((p, i) => (
          <rect key={i} x={p.x} y={0} width={p.w + 0.3} height={Math.min(H, p.mm * 6)} fill="#7B6CFF" opacity={0.05 + Math.min(0.25, p.mm / 20)} />
        ))}
        {ore.map((o) => (
          <line key={o} x1={x(o)} x2={x(o)} y1={0} y2={H} stroke="#232327" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill="url(#g-carico)" />
        <path d={linea} fill="none" stroke="#34343A" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        <path d={linea} fill="none" stroke="#FAFAFA" strokeWidth={1.4} vectorEffect="non-scaling-stroke" clipPath="url(#passato)" />
        <line x1={x(t)} x2={x(t)} y1={0} y2={H} stroke="#FAFAFA" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {ore.map((o) => (
          <text key={o} x={x(o) + 3} y={H + 14} fontSize="10" fill="#71717A" className="num" style={{ fontFamily: 'var(--font-mono)' }}>
            {hhmm(o)}
          </text>
        ))}
      </svg>
      <div
        className="pointer-events-none absolute top-0 flex -translate-x-1/2 flex-col items-center"
        style={{ left: `${(x(t) / L) * 100}%`, top: Math.max(0, H - (adesso / max) * (H - 6)) - 4 }}
      >
        <span className="size-2 rounded-full bg-primary ring-4 ring-primary/15" />
      </div>
    </div>
  )
}
