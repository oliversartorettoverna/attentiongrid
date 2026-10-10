// Ruolo di chi usa l'app: decide quali schermate vede. Il login vero (Supabase) prende il posto di questa scelta.
import { useSyncExternalStore } from 'react'

export type Ruolo = 'operatore' | 'responsabile' | 'cliente'

export const RUOLI: Record<Ruolo, { nome: string; chi: string; home: string }> = {
  operatore: { nome: 'Operatore', chi: 'Giulia R. · postazione 3', home: '/console' },
  responsabile: { nome: 'Responsabile di sala', chi: 'Marco T. · turno pomeriggio', home: '/console' },
  cliente: { nome: 'Cliente · Poste', chi: 'Vede solo i BOXi', home: '/flotta' },
}

const CHIAVE = 'ag-ruolo'
let ruolo: Ruolo = 'responsabile'
try {
  const salvato = localStorage.getItem(CHIAVE) as Ruolo | null
  if (salvato && salvato in RUOLI) ruolo = salvato
} catch {
  /* senza localStorage si parte da responsabile */
}
const ascoltatori = new Set<() => void>()

export function useRuolo(): [Ruolo, (r: Ruolo) => void] {
  const r = useSyncExternalStore(
    (f) => {
      ascoltatori.add(f)
      return () => ascoltatori.delete(f)
    },
    () => ruolo,
  )
  return [
    r,
    (nuovo) => {
      ruolo = nuovo
      try {
        localStorage.setItem(CHIAVE, nuovo)
      } catch {
        /* niente */
      }
      ascoltatori.forEach((f) => f())
    },
  ]
}
