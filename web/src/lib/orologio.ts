// Orologio della giornata simulata. La mappa lo legge a ogni fotogramma (ora()), i pannelli
// si aggiornano 4 volte al secondo (useOra) per non ridisegnare tutto 60 volte al secondo.
import { useSyncExternalStore } from 'react'

export const VELOCITA = [1, 10, 30, 60] as const
const INIZIO_DEMO = 15 * 3600 + 40 * 60 // 15:40, poco prima del temporale
const FINE = 24 * 3600 - 1

let t = INIZIO_DEMO
let velocita: number = 30
let inCorsa = false
let ultimo = performance.now()
let pubblicato = { t, velocita, inCorsa }
const ascoltatori = new Set<() => void>()

function pubblica() {
  pubblicato = { t, velocita, inCorsa }
  ascoltatori.forEach((f) => f())
}

function passo(ora: number) {
  if (inCorsa) t = Math.min(FINE, t + ((ora - ultimo) / 1000) * velocita)
  ultimo = ora
  requestAnimationFrame(passo)
}
requestAnimationFrame(passo)
setInterval(() => inCorsa && pubblica(), 250)

export const orologio = {
  ora: () => t,
  vai: (nuovo: number) => {
    t = Math.max(6 * 3600, Math.min(FINE, nuovo))
    pubblica()
  },
  avvia: () => {
    inCorsa = !inCorsa
    pubblica()
  },
  velocita: (v: number) => {
    velocita = v
    pubblica()
  },
}

export function useOra() {
  return useSyncExternalStore(
    (f) => {
      ascoltatori.add(f)
      return () => ascoltatori.delete(f)
    },
    () => pubblicato,
  )
}
