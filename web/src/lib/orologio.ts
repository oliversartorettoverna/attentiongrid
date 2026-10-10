// Orologio della giornata. Lo tiene il server (WebSocket /api/diretta, server/diretta.py): tutte le
// schermate aperte vedono la stessa ora, le stesse richieste e gli stessi ritardi dei veicoli.
// La mappa legge l'ora a ogni fotogramma (ora()), i pannelli 4 volte al secondo (useOra).
// Se il server non risponde, l'orologio gira nel browser come ripiego.
import { useSyncExternalStore } from 'react'

export const VELOCITA = [1, 10, 30, 60] as const
const INIZIO_DEMO = 15 * 3600 + 40 * 60 // 15:40, poco prima del temporale
const FINE = 24 * 3600 - 1

export interface RichiestaDiretta {
  id: number
  veicolo_id: string
  seg_id: string
  inizio: number // secondo della giornata in cui il veicolo ha chiamato
  inizio_piano: number // la stessa ora sul piano del veicolo: finché la richiesta è aperta resta lì
  attesa_s: number
  durata_s: number
  operatore: number | 'tu' // 'tu' = l'operatore in console
  assegnata?: boolean // assegnata alla postazione della console: aspetta te, poi la prende un collega
  via: string
  motivo_previsto: string
  // in gestione; oppure chiusa da te ma il veicolo è ancora fermo per assistenza in strada o arresto
  stato: 'in_attesa' | 'in_gestione' | 'assistenza' | 'arresto'
}

export type Azione = 'riparte' | 'deviato' | 'assistenza' | 'arresto'

export interface InterventoChiuso {
  id: number
  veicolo_id: string
  via: string
  chiamata: number
  attesa_s: number
  durata_s: number
  azione: Azione
  causa: string
  motivo_previsto: string
}

interface StatoServer {
  t: number
  temporale: string
  scenario: string
  temporali: string[]
  cause?: string[]
  chiusi?: InterventoChiuso[]
  velocita: number
  in_corsa: boolean
  ritardi: Record<string, number>
  richieste: RichiestaDiretta[]
}

let base = { t: INIZIO_DEMO, quando: performance.now() } // ultima ora nota e quando l'abbiamo saputa
let velocita = 30
let inCorsa = false
let ritardi: Record<string, number> = {}
let richieste: RichiestaDiretta[] = []
let fermi = new Map<string, number>() // veicolo fermo per una richiesta → ora del piano in cui si è fermato
let collegato = false
let scenario = 'scenario' // la cartella dei dati della giornata in corso
let temporale = 'previsto'
let temporali: string[] = ['previsto']
let cause: string[] = []
let chiusi: InterventoChiuso[] = []
let ws: WebSocket | null = null
let pubblicato = { t: INIZIO_DEMO, velocita, inCorsa, collegato, richieste, scenario, temporale, temporali, cause, chiusi }
const ascoltatori = new Set<() => void>()

const ora = () => {
  const t = inCorsa ? base.t + ((performance.now() - base.quando) / 1000) * velocita : base.t
  return Math.min(FINE, t)
}

function pubblica() {
  pubblicato = { t: ora(), velocita, inCorsa, collegato, richieste, scenario, temporale, temporali, cause, chiusi }
  ascoltatori.forEach((f) => f())
}

function ricevi(s: StatoServer) {
  base = { t: s.t, quando: performance.now() }
  velocita = s.velocita
  inCorsa = s.in_corsa
  ritardi = s.ritardi
  richieste = s.richieste
  fermi = new Map(s.richieste.map((r) => [r.veicolo_id, r.inizio_piano]))
  temporali = s.temporali ?? ['previsto']
  cause = s.cause ?? []
  chiusi = s.chiusi ?? []
  if (s.scenario !== scenario || s.temporale !== temporale) {
    scenario = s.scenario
    temporale = s.temporale
    pubblica()
  }
}

function collega() {
  const indirizzo = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/diretta`
  ws = new WebSocket(indirizzo)
  ws.onopen = () => {
    collegato = true
    pubblica()
  }
  ws.onmessage = (e) => ricevi(JSON.parse(e.data))
  ws.onclose = () => {
    collegato = false
    ws = null
    pubblica()
    setTimeout(collega, 2000)
  }
}
collega()
setInterval(pubblica, 250)

/** Esegue il comando subito nel browser (così più tasti di fila si sommano) e lo manda al server,
 *  che lo rimanda a tutte le schermate. */
function comanda(comando: string, valore?: number | boolean | string) {
  const t = ora()
  if (comando === 'avvia') inCorsa = !inCorsa
  if (comando === 'velocita') velocita = valore as number
  if (comando === 'vai') valore = Math.max(6 * 3600, Math.min(FINE, valore as number))
  base = { t: comando === 'vai' ? (valore as number) : t, quando: performance.now() }
  if (ws && collegato) {
    // all'avvio si manda lo stato voluto, non "inverti": due schermate che premono insieme non si annullano
    const v = comando === 'avvia' ? inCorsa : valore
    ws.send(JSON.stringify(v === undefined ? { comando } : { comando, valore: v }))
  }
  pubblica()
}

/** Comandi sugli interventi: valgono solo collegati al server, che decide e rimanda lo stato a tutti. */
function intervento(comando: 'prendi' | 'chiudi' | 'rilascia', id: number, extra: Record<string, string> = {}) {
  if (ws && collegato) ws.send(JSON.stringify({ comando, id, ...extra }))
}

export const interventi = {
  prendi: (id: number) => intervento('prendi', id),
  rilascia: (id: number) => intervento('rilascia', id),
  chiudi: (id: number, azione: Azione, causa: string) => intervento('chiudi', id, { azione, causa }),
}

export const orologio = {
  ora,
  /** L'ora sul piano del veicolo: quella della giornata meno il tempo perso fermo ad aspettare o durante gli
   *  interventi. Un veicolo con una richiesta aperta resta all'ora del piano in cui si è fermato: tra un
   *  messaggio del server e l'altro non deve avanzare, altrimenti vibra avanti e indietro. */
  oraVeicolo: (id: string, t: number) => fermi.get(id) ?? t - (ritardi[id] ?? 0),
  vai: (t: number) => comanda('vai', t),
  avvia: () => comanda('avvia'),
  velocita: (v: number) => comanda('velocita', v),
  /** Quale giornata vera: 'previsto' o 'prima' (il temporale arriva un'ora prima del previsto). */
  temporale: (quale: string) => comanda('temporale', quale),
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
