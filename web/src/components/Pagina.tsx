import type { ReactNode } from 'react'
import { motion } from 'motion/react'

export function Pagina({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_70%_0%,rgba(123,108,255,0.07),transparent)]" />
      <div className="relative mx-auto flex max-w-[1240px] flex-col gap-5 px-8 py-8">{children}</div>
    </div>
  )
}

export function Titolo({ eyebrow, titolo, children }: { eyebrow: string; titolo: string; children?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-2 max-w-2xl">
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="mt-2 text-[28px] leading-tight font-medium tracking-tight">{titolo}</h1>
      {children && <p className="mt-2 text-sm leading-relaxed text-secondary">{children}</p>}
    </motion.div>
  )
}

export function Riquadro({ titolo, destra, children }: { titolo: string; destra?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
      <header className="flex items-center justify-between">
        <span className="eyebrow">{titolo}</span>
        {destra}
      </header>
      {children}
    </section>
  )
}

export function Numero({ etichetta, valore, unita, sotto }: { etichetta: string; valore: ReactNode; unita?: string; sotto?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface p-5 ring-1 ring-line">
      <div className="text-xs text-muted">{etichetta}</div>
      <div className="num mt-2 text-[32px] leading-none font-medium tracking-tight">
        {valore}
        {unita && <span className="ml-1.5 text-sm text-muted">{unita}</span>}
      </div>
      {sotto && <div className="mt-2 text-xs text-secondary">{sotto}</div>}
    </div>
  )
}
