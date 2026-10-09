import type { Livello } from '../lib/scenario'
import { NOMI_LIVELLO } from '../lib/scenario'

// Regole della palette: il nominale è silenzioso (solo il pallino), attenzione e critico hanno la tinta
// al 14%, e ogni stato ha sempre l'etichetta scritta, così si capisce anche senza distinguere i colori.
const COLORE: Record<Livello, string> = {
  [-1]: 'var(--color-offline)',
  0: 'var(--color-ok)',
  1: 'var(--color-warn)',
  2: 'var(--color-critical)',
}

export const coloreLivello = (l: Livello) => COLORE[l]

export function Stato({ livello, etichetta, pulsa = false }: { livello: Livello; etichetta?: string; pulsa?: boolean }) {
  const c = COLORE[livello]
  const forte = livello >= 1
  return (
    <span
      className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
      style={
        forte
          ? { color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }
          : { color: 'var(--color-secondary)', boxShadow: 'inset 0 0 0 1px var(--color-line)' }
      }
    >
      <span className="relative flex size-1.5">
        {pulsa && <span className="pulse-ring absolute inset-0 rounded-full" style={{ background: c }} />}
        <span className="relative size-1.5 rounded-full" style={{ background: c }} />
      </span>
      {etichetta ?? NOMI_LIVELLO[livello]}
    </span>
  )
}

export function Punto({ colore, pulsa = false }: { colore: string; pulsa?: boolean }) {
  return (
    <span className="relative inline-flex size-1.5">
      {pulsa && <span className="pulse-ring absolute inset-0 rounded-full" style={{ background: colore }} />}
      <span className="relative size-1.5 rounded-full" style={{ background: colore }} />
    </span>
  )
}
