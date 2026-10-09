// Carica lo scenario precalcolato dal motore (console/data/scenario, formati in docs/formati-dati.md)
// e risponde alle domande della console in ogni istante: dove sta un veicolo, in che stato è, chi chiede aiuto.

export type Livello = -1 | 0 | 1 | 2 // -1 fermo al deposito, 0 nominale, 1 attenzione, 2 critico

export interface Veicolo {
  veicolo_id: string
  flotta: string
  t0: number
  punti: [number, number][]
}

export interface Dettaglio {
  id: string
  livello: Livello
  p: number
  via: string
  motivo: string
  tra_s: number
}

export interface Richiesta {
  inizio: number // secondo della giornata in cui il veicolo chiama
  veicolo_id: string
  seg_id: string
  attesa_s: number
  durata_s: number
  operatore: number
}

export interface OraKpi {
  ora: string
  veicoli: number
  operatori_senza: number
  operatori_con: number
  operatori_turni: number
  veicoli_per_operatore_senza: number
  veicoli_per_operatore_con: number
}

export interface Scenario {
  data: string
  flotte: Record<string, { nome: string; veicoli: number }>
  passo_s: number
  veicoli: Veicolo[]
  perId: Map<string, Veicolo>
  inizio_s: number
  livelli: Record<string, string>
  dettagli: (string | number)[][][]
  soglie: { osservazione: number; intervento: number; orizzonte_min: number }
  validazione: {
    tempo_pct: Record<string, number>
    richieste_da_pct: Record<string, number>
    anticipo_s: number
  }
  fasce_s: number[]
  pioggia_mm: (number | null)[]
  rischio: Record<string, number[]>
  carico: {
    orari: string[]
    richieste_attese: number[]
    operatori_necessari: number[]
    operatori_in_turno: number[]
    veicoli_attivi: number[]
  }
  richieste: Richiesta[]
  kpi: any
  tratti: GeoJSON.FeatureCollection
  edifici: GeoJSON.FeatureCollection
  nomiVie: Map<string, string>
}

export const sec = (hhmm: string) => {
  const [h, m, s] = hhmm.split(':').map(Number)
  return h * 3600 + m * 60 + (s || 0)
}

export const hhmm = (t: number, conSecondi = false) => {
  const s = Math.max(0, Math.floor(t))
  const h = String(Math.floor(s / 3600) % 24).padStart(2, '0')
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  if (!conSecondi) return `${h}:${m}`
  return `${h}:${m}:${String(s % 60).padStart(2, '0')}`
}

/** Autonomy Confidence Score 0–100: 100 meno la probabilità (in %) di una richiesta nei prossimi minuti.
 *  Le soglie del motore (osservazione 0,25, intervento 0,45) diventano 75 e 55. */
export const score = (p: number) => Math.round(100 * (1 - p))

const leggi = async (nome: string) => {
  const r = await fetch(`/data/scenario/${nome}`)
  if (!r.ok) throw new Error(`${nome}: ${r.status}`)
  return r.json()
}

export async function caricaScenario(): Promise<Scenario> {
  const [veicoli, attenzione, rischio, carico, rigioco, kpi, tratti, edifici] = await Promise.all(
    ['veicoli.json', 'attenzione.json', 'rischio_console.json', 'carico.json', 'rigioco.json', 'kpi.json',
      'tratti.geojson', 'edifici.geojson'].map(leggi),
  )
  const nomiVie = new Map<string, string>()
  for (const f of tratti.features) nomiVie.set(f.properties.seg_id, f.properties.nome || '')
  return {
    data: rischio.data,
    flotte: veicoli.flotte,
    passo_s: veicoli.passo_s,
    veicoli: veicoli.veicoli,
    perId: new Map(veicoli.veicoli.map((v: Veicolo) => [v.veicolo_id, v])),
    inizio_s: sec(attenzione.inizio),
    livelli: attenzione.livelli,
    dettagli: attenzione.dettagli,
    soglie: attenzione.soglie,
    validazione: attenzione.validazione,
    fasce_s: rischio.fasce.map(sec),
    pioggia_mm: rischio.pioggia_mm,
    rischio: rischio.p_millesimi,
    carico: { orari: carico.orari, ...carico.con },
    richieste: rigioco.con
      .filter((e: any) => e.tipo === 'richiesta')
      .map((e: any) => ({ ...e, inizio: sec(e.ora) })),
    kpi,
    tratti,
    edifici,
    nomiVie,
  }
}

/** Posizione [lon, lat] del veicolo al secondo t, interpolata tra due campioni. */
export function posizione(sc: Scenario, v: Veicolo, t: number): [number, number] {
  const x = (t - v.t0) / sc.passo_s
  const n = v.punti.length - 1
  if (x <= 0) return [v.punti[0][1], v.punti[0][0]]
  if (x >= n) return [v.punti[n][1], v.punti[n][0]]
  const i = Math.floor(x)
  const f = x - i
  const a = v.punti[i]
  const b = v.punti[i + 1]
  return [a[1] + (b[1] - a[1]) * f, a[0] + (b[0] - a[0]) * f]
}

export function livello(sc: Scenario, id: string, t: number): Livello {
  const s = sc.livelli[id]
  const c = s?.[Math.floor((t - sc.inizio_s) / 60)]
  return c === undefined || c === '-' ? -1 : (Number(c) as Livello)
}

/** I veicoli più a rischio in questo minuto, con via, motivo e quanto manca. */
export function piuARischio(sc: Scenario, t: number): Dettaglio[] {
  const riga = sc.dettagli[Math.floor((t - sc.inizio_s) / 60)] ?? []
  return riga.map((d) => ({
    id: d[0] as string,
    livello: d[1] as Livello,
    p: d[2] as number,
    via: d[3] as string,
    motivo: d[4] as string,
    tra_s: d[5] as number,
  }))
}

/** Richieste aperte al secondo t: in attesa di un operatore oppure in gestione. */
export function richiesteAperte(sc: Scenario, t: number) {
  const out: (Richiesta & { attesa: number; inGestione: boolean })[] = []
  for (const r of sc.richieste) {
    if (r.inizio > t) break
    const fine = r.inizio + r.attesa_s + r.durata_s
    if (t < fine) out.push({ ...r, attesa: Math.min(t - r.inizio, r.attesa_s), inGestione: t >= r.inizio + r.attesa_s })
  }
  return out
}

export function indiceFascia(sc: Scenario, t: number) {
  return Math.max(0, Math.min(sc.fasce_s.length - 1, Math.floor((t - sc.fasce_s[0]) / 300)))
}

export const NOMI_LIVELLO: Record<Livello, string> = {
  [-1]: 'Al deposito',
  0: 'Nominale',
  1: 'Attenzione',
  2: 'Critico',
}

export const SIGLA_FLOTTA: Record<string, string> = {
  boxi: 'BOXi',
  corriere_a: 'Corr. A',
  corriere_b: 'Corr. B',
  navette: 'Navetta',
}

/** Nome breve del veicolo per l'interfaccia: boxi_07 → BX-07, navette_104 → NV-104. */
export function sigla(id: string) {
  const [f, n] = id.split('_').length > 2 ? [id.split('_').slice(0, 2).join('_'), id.split('_')[2]] : id.split('_')
  const pref: Record<string, string> = { boxi: 'BX', corriere_a: 'CA', corriere_b: 'CB', navette: 'NV' }
  return `${pref[f] ?? f.slice(0, 2).toUpperCase()}-${n}`
}
