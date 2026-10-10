import { orologio } from './orologio'

// Carica lo scenario precalcolato dal motore (console/data/scenario, formati in docs/formati-dati.md)
// e risponde alle domande della console in ogni istante: dove sta un veicolo, in che stato è, chi chiede aiuto.

export type Livello = -1 | 0 | 1 | 2 // -1 fermo al deposito, 0 nominale, 1 attenzione, 2 critico

export interface Veicolo {
  veicolo_id: string
  flotta: string
  t0: number // senza sfasamento: l'ora vera del veicolo è t0 + sposta
  sposta: number // spostamento della partenza nello scenario con sistema (secondi)
  punti: [number, number][]
  passate: number[] // secondi dopo t0 e numero del tratto, alternati
}

export interface Dettaglio {
  id: string
  livello: Livello
  p: number
  via: string
  motivo: string
  tra_s: number
  gps: StatoGps | null
}

/** Il GPS del veicolo adesso, dalla strada in cui si trova (precisione stimata dal motore). */
export interface StatoGps {
  metri: number | null // null: segnale assente (sottopasso)
  stato: 'ok' | 'degradato' | 'assente'
}

export interface ParametriGps {
  degradato_da_m: number
  contributo_degradato: number
  contributo_assente: number
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

export interface PianoVerificato {
  ore_pagate: number
  costo_veicolo_mese: number
  entro_pct: number
  ora_peggiore_pct: number
  operatori: number[]
  entro_pct_ora: (number | null)[]
}

export interface Piani {
  attesa_max_s: number
  livello_servizio_pct: number
  ore: string[]
  casi: { chiave: 'previsto' | 'prima' | 'dopo'; nome: string; piani: Record<'fissi' | 'normale' | 'prudente', PianoVerificato> }[]
}

export interface Scenario {
  data: string
  flotte: Record<string, { nome: string; veicoli: number }>
  passo_s: number
  veicoli: Veicolo[]
  perId: Map<string, Veicolo>
  inizio_s: number
  probabilita: Record<string, string> // due cifre per minuto in percento, "--" fermo
  dettagli: (string | number)[][][]
  soglie: { osservazione: number; intervento: number; orizzonte_min: number }
  gps: ParametriGps | null
  gpsTratto: Map<string, number | null> // precisione stimata per tratto in metri; null nei sottopassi
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
  kpi: any
  piani: Piani | null // da tools/prova_pianificazione.py; può mancare
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

const leggi = async (nome: string, cartella = 'scenario') => {
  const r = await fetch(`/data/${cartella}/${nome}`)
  if (!r.ok) throw new Error(`${nome}: ${r.status}`)
  return r.json()
}

export async function caricaScenario(cartella = 'scenario'): Promise<Scenario> {
  const [veicoli, attenzione, rischio, carico, kpi, tratti, edifici] = await Promise.all(
    ['veicoli.json', 'attenzione.json', 'rischio_console.json', 'carico.json', 'kpi.json',
      'tratti.geojson', 'edifici.geojson'].map((n) => leggi(n, n === 'edifici.geojson' ? 'scenario' : cartella)),
  )
  const lista: Veicolo[] = veicoli.veicoli.map((v: Veicolo) => ({
    ...v,
    sposta: veicoli.spostamenti_s?.[v.veicolo_id] ?? 0,
    passate: v.passate ?? [],
  }))
  const piani = await leggi('piani.json').catch(() => null) // i piani verificati valgono per ogni giornata
  const nomiVie = new Map<string, string>()
  for (const f of tratti.features) nomiVie.set(f.properties.seg_id, f.properties.nome || '')
  return {
    data: rischio.data,
    flotte: veicoli.flotte,
    passo_s: veicoli.passo_s,
    veicoli: lista,
    perId: new Map(lista.map((v) => [v.veicolo_id, v])),
    inizio_s: sec(attenzione.inizio),
    probabilita: attenzione.p ?? {},
    dettagli: attenzione.dettagli,
    soglie: attenzione.soglie,
    gps: attenzione.gps?.degradato_da_m ? attenzione.gps : null,
    gpsTratto: new Map(
      tratti.features
        .filter((f: GeoJSON.Feature) => f.properties?.gps_m !== undefined)
        .map((f: GeoJSON.Feature) => [f.properties!.seg_id, f.properties!.senza_gps ? null : f.properties!.gps_m]),
    ),
    validazione: attenzione.validazione,
    fasce_s: rischio.fasce.map(sec),
    pioggia_mm: rischio.pioggia_mm,
    rischio: rischio.p_millesimi,
    carico: { orari: carico.orari, ...carico.con },
    kpi,
    piani,
    tratti,
    edifici,
    nomiVie,
  }
}

/** Posizione [lon, lat] del veicolo al secondo t, interpolata tra due campioni. */
/** L'ora sul piano del veicolo: l'ora della giornata meno il tempo perso fermo ad aspettare o durante gli
 *  interventi. Posizione, livello e probabilità si leggono su questo orologio: un veicolo fermo resta fermo. */
export const oraVeicolo = (id: string, t: number) => orologio.oraVeicolo(id, t)

export function posizione(sc: Scenario, v: Veicolo, t: number): [number, number] {
  const x = (oraVeicolo(v.veicolo_id, t) - v.t0 - v.sposta) / sc.passo_s
  const n = v.punti.length - 1
  if (x <= 0) return [v.punti[0][1], v.punti[0][0]]
  if (x >= n) return [v.punti[n][1], v.punti[n][0]]
  const i = Math.floor(x)
  const f = x - i
  const a = v.punti[i]
  const b = v.punti[i + 1]
  return [a[1] + (b[1] - a[1]) * f, a[0] + (b[0] - a[0]) * f]
}

/** Il GPS del veicolo adesso: la precisione stimata della strada che sta percorrendo, sul suo orologio. */
export function statoGps(sc: Scenario, id: string, t: number): StatoGps | null {
  const v = sc.perId.get(id)
  if (!v || !sc.gps || !v.passate.length) return null
  const rel = oraVeicolo(id, t) - v.t0 - v.sposta
  const p = v.passate
  let lo = 0
  let hi = p.length / 2 - 1
  if (rel < p[0]) return null
  while (lo < hi) {
    // ultimo tratto in cui il veicolo è entrato prima di adesso
    const m = (lo + hi + 1) >> 1
    if (p[2 * m] <= rel) lo = m
    else hi = m - 1
  }
  const seg = `seg_${String(p[2 * lo + 1]).padStart(6, '0')}`
  if (!sc.gpsTratto.has(seg)) return null
  const metri = sc.gpsTratto.get(seg) ?? null
  return { metri, stato: metri == null ? 'assente' : metri >= sc.gps.degradato_da_m ? 'degradato' : 'ok' }
}

export const testoGps = (g: StatoGps) => (g.stato === 'assente' ? 'GPS assente (sottopasso)' : `GPS debole · ${Math.round(g.metri ?? 0)} m`)

/** Probabilità di una richiesta nei prossimi minuti: quella del motore, più il GPS degradato in questo momento
 *  come una causa in più. null se il veicolo è fermo al deposito o il dato manca. */
export function probabilita(sc: Scenario, id: string, t: number): number | null {
  const k = Math.floor((oraVeicolo(id, t) - sc.inizio_s) / 60)
  const c = sc.probabilita[id]?.slice(2 * k, 2 * k + 2)
  if (!c || c === '--') return null
  const p = Number(c) / 100
  const g = statoGps(sc, id, t)
  if (!g || g.stato === 'ok' || !sc.gps) return p
  const extra = g.stato === 'assente' ? sc.gps.contributo_assente : sc.gps.contributo_degradato
  return 1 - (1 - p) * (1 - extra)
}

/** Livello del veicolo dalle soglie del motore sulla probabilità (GPS compreso); -1 se è fermo al deposito. */
export function livello(sc: Scenario, id: string, t: number): Livello {
  const p = probabilita(sc, id, t)
  if (p == null) return -1
  return p >= sc.soglie.intervento ? 2 : p >= sc.soglie.osservazione ? 1 : 0
}

/** I veicoli più a rischio adesso, ognuno letto sul suo orologio. Via, motivo e tempo al tratto vengono dai
 *  dettagli del motore (i 12 più a rischio di ogni minuto); per gli altri restano vuoti. */
export function piuARischio(sc: Scenario, t: number): Dettaglio[] {
  const out: Dettaglio[] = []
  for (const v of sc.veicoli) {
    const p = probabilita(sc, v.veicolo_id, t)
    if (p == null) continue
    const minuto = Math.floor((oraVeicolo(v.veicolo_id, t) - sc.inizio_s) / 60)
    const d = sc.dettagli[minuto]?.find((x) => x[0] === v.veicolo_id)
    const gps = statoGps(sc, v.veicolo_id, t)
    const gpsDebole = gps && gps.stato !== 'ok'
    out.push({
      gps,
      id: v.veicolo_id,
      livello: livello(sc, v.veicolo_id, t),
      p,
      via: (d?.[3] as string) ?? '',
      // il GPS degradato adesso viene prima del motivo previsto dal motore
      motivo: [gpsDebole ? testoGps(gps) : '', (d?.[4] as string) ?? ''].filter(Boolean).join(' · '),
      tra_s: (d?.[5] as number) ?? -1,
    })
  }
  return out.sort((a, b) => b.p - a.p)
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
