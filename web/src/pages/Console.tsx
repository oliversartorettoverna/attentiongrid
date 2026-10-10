import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowUpRight, Check, CornerDownLeft, Navigation, OctagonX, Play, Siren, Sparkles, X } from 'lucide-react'
import { Mappa } from '../components/Mappa'
import { LineaGiornata } from '../components/LineaGiornata'
import { Stato, coloreLivello } from '../components/Stato'
import { useScenario } from '../lib/ScenarioContext'
import { causaSuggerita } from '../lib/cause'
import { interventi, useOra, type Azione, type RichiestaDiretta } from '../lib/orologio'
import {
  indiceFascia,
  livello,
  piuARischio,
  probabilita,
  posizione,
  score,
  sigla,
  type Livello,
  type Scenario,
} from '../lib/scenario'

const ATTESA_MAX_S = 20 // livello di servizio: 90% delle richieste prese entro 20 secondi

export function Console() {
  const sc = useScenario()
  const [sel, setSel] = useState<string | null>(null)
  const { richieste } = useOra()
  // Invio prende la prima richiesta che aspetta te e apre la sua scheda
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.code !== 'Enter' || (e.target as HTMLElement).tagName === 'INPUT') return
      const prima = richieste.filter((r) => r.assegnata && r.stato === 'in_attesa').sort((a, b) => a.inizio - b.inizio)[0]
      if (prima) {
        interventi.prendi(prima.id)
        setSel(prima.veicolo_id)
      }
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [richieste])
  if (!sc) return <Caricamento />
  return (
    <div className="absolute inset-0 overflow-hidden">
      <Mappa sc={sc} selezionato={sel} onSeleziona={setSel} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(9,9,11,0.85))]" />
      <Coda sc={sc} sel={sel} onSeleziona={setSel} />
      <ColonnaDestra sc={sc} sel={sel} onSeleziona={setSel} />
      <Fondo sc={sc} />
    </div>
  )
}

function Caricamento() {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="size-1.5 animate-pulse rounded-full bg-info" />
        Carico lo scenario di Roma…
      </div>
    </div>
  )
}

const entrata = (i: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.15 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
})

type Aperta = RichiestaDiretta & { trascorsi: number; presa: number }

/** Ordine della coda: prima quelle che aspettano te, poi le tue, poi le altre in attesa, poi quelle dei colleghi. */
function priorita(r: RichiestaDiretta) {
  if (r.stato === 'in_attesa') return r.assegnata ? 0 : 2
  if (r.operatore === 'tu') return r.stato === 'in_gestione' ? 1 : 3
  return 4
}

function apri(r: RichiestaDiretta, t: number): Aperta {
  // presa: quando un operatore l'ha presa (per le richieste ancora in attesa è nel futuro)
  return { ...r, trascorsi: Math.max(0, t - r.inizio), presa: r.inizio + r.attesa_s }
}

function Coda({ sc, sel, onSeleziona }: { sc: Scenario; sel: string | null; onSeleziona: (id: string) => void }) {
  const { t, richieste } = useOra()
  const aperte = richieste.map((r) => apri(r, t)).sort((a, b) => priorita(a) - priorita(b) || a.inizio - b.inizio)
  const perTe = aperte.filter((r) => r.assegnata && r.stato === 'in_attesa').length
  return (
    <motion.section {...entrata(0)} className="glass absolute top-4 left-4 flex max-h-[calc(100%-200px)] w-[340px] flex-col rounded-2xl">
      <header className="flex items-center justify-between px-4 pt-4 pb-3">
        <div>
          <div className="eyebrow">Coda richieste</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="num text-2xl font-medium">{aperte.length}</span>
            <span className="text-xs text-muted">
              aperte · <span className={perTe ? 'text-critical' : ''}>{perTe} per te</span>
            </span>
          </div>
        </div>
        {perTe > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <kbd className="num rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-secondary">
              <CornerDownLeft className="inline size-3" />
            </kbd>
            prendi
          </span>
        )}
      </header>
      <div className="flex gap-3 px-4 pb-2.5 text-[10.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full ring-2 ring-warn" /> aspetta
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full ring-2 ring-info" /> in gestione
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full ring-2 ring-offline" /> chiusa, ancora fermo
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {aperte.length === 0 && <div className="px-2 py-6 text-center text-sm text-muted">Nessun veicolo sta chiedendo aiuto.</div>}
        <AnimatePresence initial={false}>
          {aperte.map((r) => {
            const attende = r.stato === 'in_attesa'
            const urgente = attende && r.assegnata
            return (
              <motion.button
                layout
                key={r.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => onSeleziona(r.veicolo_id)}
                className={`mb-1.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors hover:ring-line-strong ${sel === r.veicolo_id ? 'bg-elevated' : 'bg-elevated/70'}`}
                style={{
                  ['--tw-ring-color' as string]:
                    sel === r.veicolo_id
                      ? 'color-mix(in srgb, var(--color-info) 70%, transparent)'
                      : urgente
                        ? 'color-mix(in srgb, var(--color-critical) 55%, transparent)'
                        : 'var(--color-line)',
                }}
              >
                <Timer r={r} t={t} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="num text-[13px] font-medium">{sigla(r.veicolo_id)}</span>
                    <span className="truncate text-xs text-muted">{sc.flotte[sc.perId.get(r.veicolo_id)?.flotta ?? '']?.nome}</span>
                  </div>
                  <div className="truncate text-xs text-secondary">{r.via || sc.nomiVie.get(r.seg_id) || 'Via senza nome'}</div>
                  <div className="num truncate text-[11px] text-muted">{didascalia(r, t)}</div>
                </div>
                <Etichetta r={r} />
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}

const mmss = (s: number) => (s < 60 ? `${Math.floor(s)} s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`)

/** Cosa sta succedendo, in parole: aspetta, in gestione, riparte tra. */
function didascalia(r: Aperta, t: number) {
  if (r.stato === 'in_attesa') return `aspetta da ${mmss(r.trascorsi)}`
  if (r.stato === 'in_gestione') return `in gestione da ${mmss(Math.max(0, t - r.presa))}`
  return `riparte tra ${mmss(Math.max(0, (r.riparte ?? t) - t))}`
}

function Etichetta({ r }: { r: Aperta }) {
  if (r.stato === 'in_attesa') return <Stato livello={2} etichetta={r.assegnata ? 'Per te' : 'Richiesta'} pulsa />
  if (r.stato === 'assistenza') return <Stato livello={1} etichetta="Assistenza" />
  if (r.stato === 'arresto') return <Stato livello={2} etichetta="Arresto" />
  if (r.operatore === 'tu')
    return (
      <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-info/15 px-2.5 text-xs font-medium text-info">
        <span className="size-1.5 rounded-full bg-info" /> Tu
      </span>
    )
  return <span className="num shrink-0 text-[11px] text-muted">Op. {Number(r.operatore) + 1}</span>
}

/** Anello del timer: in attesa conta verso i 20 secondi (rosso oltre), in gestione da quanto un operatore è sul veicolo. */
function Timer({ r, t, grande = false }: { r: Aperta; t: number; grande?: boolean }) {
  const raggio = 15
  const giro = 2 * Math.PI * raggio
  const attende = r.stato === 'in_attesa'
  const fermo = r.stato === 'assistenza' || r.stato === 'arresto'
  const mancano = Math.max(0, (r.riparte ?? t) - t)
  const secondi = attende ? r.trascorsi : fermo ? mancano : Math.max(0, t - r.presa)
  const quota = attende
    ? Math.min(1, secondi / ATTESA_MAX_S)
    : fermo
      ? Math.min(1, mancano / Math.max(1, (r.riparte ?? t) - r.presa))
      : r.operatore === 'tu'
        ? 1
        : Math.min(1, secondi / Math.max(1, r.durata_s))
  const colore = attende
    ? secondi > ATTESA_MAX_S
      ? 'var(--color-critical)'
      : 'var(--color-warn)'
    : r.stato === 'in_gestione'
      ? 'var(--color-info)'
      : 'var(--color-offline)'
  return (
    <div className={`relative grid shrink-0 place-items-center ${grande ? 'size-20' : 'size-10'}`}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r={raggio} fill="none" stroke="var(--color-line)" strokeWidth={grande ? 2 : 2.5} />
        <circle cx="20" cy="20" r={raggio} fill="none" stroke={colore} strokeWidth={grande ? 2 : 2.5} strokeLinecap="round" strokeDasharray={giro} strokeDashoffset={giro * (1 - quota)} />
      </svg>
      <span className={`num font-medium ${grande ? 'text-xl' : 'text-[11px]'}`} style={grande && attende && secondi > ATTESA_MAX_S ? { color: 'var(--color-critical)' } : undefined}>
        {secondi < 60 ? Math.floor(secondi) : `${Math.floor(secondi / 60)}:${String(Math.floor(secondi % 60)).padStart(2, '0')}`}
      </span>
    </div>
  )
}

function ColonnaDestra({ sc, sel, onSeleziona }: { sc: Scenario; sel: string | null; onSeleziona: (id: string | null) => void }) {
  const { t, richieste } = useOra()
  const daGuardare = piuARischio(sc, t).filter((d) => d.livello >= 1).slice(0, 7)
  const aperta = sel ? richieste.find((r) => r.veicolo_id === sel) : undefined
  return (
    <div className="absolute top-4 right-4 flex max-h-[calc(100%-200px)] w-[340px] flex-col gap-3">
      <AnimatePresence mode="popLayout">
        {sel && aperta && <SchedaIntervento key={`i-${aperta.id}`} sc={sc} r={apri(aperta, t)} t={t} onChiudi={() => onSeleziona(null)} />}
        {sel && !aperta && <SchedaVeicolo key={sel} sc={sc} id={sel} t={t} onChiudi={() => onSeleziona(null)} />}
      </AnimatePresence>
      {!(sel && aperta) && (
        <motion.section {...entrata(1)} layout className="glass flex min-h-0 flex-col rounded-2xl">
          <header className="flex items-center justify-between px-4 pt-4 pb-3">
            <div>
              <div className="eyebrow">Da tenere d'occhio</div>
              <div className="mt-1 text-xs text-muted">entrano in una via a rischio nei prossimi {sc.soglie.orizzonte_min} min</div>
            </div>
          </header>
          <div className="min-h-0 overflow-y-auto px-2 pb-2">
            {daGuardare.length === 0 && <div className="px-2 py-6 text-center text-sm text-muted">Tutti i veicoli sono nominali.</div>}
            {daGuardare.map((d) => (
              <motion.button
                layout
                key={d.id}
                onClick={() => onSeleziona(d.id)}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-elevated ${sel === d.id ? 'bg-elevated ring-1 ring-info/60' : ''}`}
              >
                <div className="w-11 shrink-0">
                  <div className="num text-lg leading-none font-medium" style={{ color: coloreLivello(d.livello) }}>
                    {score(d.p)}
                  </div>
                  <div className="mt-1 text-[10px] text-muted">score</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="num text-[13px] font-medium">{sigla(d.id)}</span>
                    {d.tra_s >= 0 && <span className="num text-[11px] text-muted">tra {d.tra_s} s</span>}
                  </div>
                  <div className="truncate text-xs text-secondary">{d.via || sc.flotte[sc.perId.get(d.id)?.flotta ?? '']?.nome}</div>
                  <div className="truncate text-[11px] text-muted">{d.motivo}</div>
                </div>
                <Stato livello={d.livello} />
              </motion.button>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  )
}

function SchedaVeicolo({ sc, id, t, onChiudi }: { sc: Scenario; id: string; t: number; onChiudi: () => void }) {
  const v = sc.perId.get(id)!
  const l = livello(sc, id, t)
  const d = piuARischio(sc, t).find((x) => x.id === id)
  const pv = d?.p ?? probabilita(sc, id, t)
  const s = pv == null ? null : score(pv)
  const a = posizione(sc, v, t)
  const b = posizione(sc, v, t + sc.passo_s)
  const { richieste } = useOra()
  const fermo = richieste.some((r) => r.veicolo_id === id)
  const kmh = fermo ? 0 : Math.round((Math.hypot((b[0] - a[0]) * 82_700, (b[1] - a[1]) * 111_200) / sc.passo_s) * 3.6)
  return (
    <motion.section
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="glass shrink-0 rounded-2xl p-4"
      style={{ boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-info) 40%, transparent), 0 24px 48px -24px rgb(0 0 0 / 0.8)' }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="eyebrow">{sc.flotte[v.flotta]?.nome}</div>
          <div className="num mt-1 text-xl font-medium">{sigla(id)}</div>
        </div>
        <div className="flex items-center gap-2">
          {fermo ? <Stato livello={2} etichetta="Fermo · richiesta" pulsa /> : <Stato livello={l as Livello} pulsa={l === 2} />}
          <button onClick={onChiudi} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-elevated hover:text-primary">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-line ring-1 ring-line">
        <Cifra etichetta="Score" valore={s ?? '—'} colore={l >= 1 ? coloreLivello(l as Livello) : undefined} />
        <Cifra etichetta="Velocità" valore={`${kmh}`} unita="km/h" />
        <Cifra etichetta={`Richiesta in ${sc.soglie.orizzonte_min} min`} valore={pv == null ? '—' : Math.round(pv * 100)} unita="%" />
      </div>
      <BarraScore valore={s ?? 100} sc={sc} />

      {d?.motivo && (
        <div className="mt-4 rounded-xl bg-elevated p-3">
          <div className="eyebrow">Perché</div>
          <div className="mt-1.5 text-[13px]">{d.motivo}</div>
          <div className="mt-0.5 text-xs text-muted">
            {d.via}
            {d.tra_s >= 0 && ` · tra ${d.tra_s} s`}
          </div>
        </div>
      )}

    </motion.section>
  )
}

const AZIONI: { azione: Azione; testo: string; icona: typeof Play; nota: string }[] = [
  { azione: 'riparte', testo: 'Fai ripartire', icona: Play, nota: 'riparte subito' },
  { azione: 'deviato', testo: 'Devia', icona: Navigation, nota: 'percorso alternativo' },
  { azione: 'assistenza', testo: 'Assistenza in strada', icona: Siren, nota: 'resta fermo finché arriva' },
  { azione: 'arresto', testo: 'Arresto', icona: OctagonX, nota: 'fermo per controllo' },
]

interface Consiglio {
  situazione: string
  azione: Azione
  perche_azione: string
  nota_registro: string
  fonte: 'claude' | 'ripiego'
}

/** Il copilota: riassume la situazione e suggerisce un'azione. Decide l'operatore. */
function RiquadroCopilota({ consiglio }: { consiglio: Consiglio | 'attesa' }) {
  return (
    <div className="mt-3 rounded-xl p-3 ring-1 ring-info/40" style={{ background: 'color-mix(in srgb, var(--color-info) 8%, transparent)' }}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-info">
          <Sparkles className="size-3.5" /> Copilota
        </span>
        {consiglio !== 'attesa' && (
          <span className="text-[10px] text-muted">{consiglio.fonte === 'claude' ? 'AI · Claude' : 'ripiego, senza AI'}</span>
        )}
      </div>
      {consiglio === 'attesa' ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
          <span className="size-1.5 animate-pulse rounded-full bg-info" /> Il copilota legge la situazione…
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-[13px] leading-snug text-primary">{consiglio.situazione}</p>
          <p className="mt-1.5 text-xs text-secondary">
            Suggerisce: <span className="font-medium text-info">{AZIONI.find((x) => x.azione === consiglio.azione)?.testo}</span> ·{' '}
            {consiglio.perche_azione}
          </p>
        </>
      )}
    </div>
  )
}

function SchedaIntervento({ sc, r, t, onChiudi }: { sc: Scenario; r: Aperta; t: number; onChiudi: () => void }) {
  const { cause } = useOra()
  const [azione, setAzione] = useState<Azione | null>(null)
  const [causa, setCausa] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [consiglio, setConsiglio] = useState<Consiglio | 'attesa' | null>(null)
  const v = sc.perId.get(r.veicolo_id)
  const pv = probabilita(sc, r.veicolo_id, t)
  const suggerita = causaSuggerita(r.motivo_previsto, cause)
  const mia = r.operatore === 'tu'
  const inCorso = r.stato === 'in_gestione' && mia
  // appena l'intervento è tuo, il copilota legge la situazione (una volta per richiesta)
  useEffect(() => {
    if (!inCorso || consiglio) return
    setConsiglio('attesa')
    fetch(`/api/copilota/${r.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: pv == null ? null : score(pv), pioggia_mm: sc.pioggia_mm[indiceFascia(sc, t)] }),
    })
      .then((x) => (x.ok ? x.json() : null))
      .then((c: Consiglio | null) => {
        setConsiglio(c)
        if (c) setNota(c.nota_registro)
      }, () => setConsiglio(null))
  }, [inCorso]) // eslint-disable-line react-hooks/exhaustive-deps
  const suggerita_azione = consiglio && consiglio !== 'attesa' ? consiglio.azione : null
  const titolo =
    r.stato === 'in_attesa'
      ? r.assegnata
        ? 'Richiesta per te'
        : 'Richiesta di intervento'
      : r.stato === 'in_gestione'
        ? mia
          ? 'Intervento in corso'
          : `Lo gestisce l'operatore ${Number(r.operatore) + 1}`
        : r.stato === 'assistenza'
          ? 'Fermo: assistenza in arrivo'
          : 'Fermo dopo l\u2019arresto'
  return (
    <motion.section
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="glass min-h-0 overflow-y-auto overscroll-contain rounded-2xl p-4"
      style={{
        boxShadow: `0 0 0 1px color-mix(in srgb, ${r.stato === 'in_attesa' ? 'var(--color-critical)' : 'var(--color-info)'} 45%, transparent), 0 24px 48px -24px rgb(0 0 0 / 0.8)`,
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="eyebrow">{v ? sc.flotte[v.flotta]?.nome : ''}</div>
          <div className="num mt-1 text-xl font-medium">{sigla(r.veicolo_id)}</div>
          <div className="mt-0.5 text-[13px] text-secondary">{titolo}</div>
        </div>
        <div className="flex items-start gap-2">
          <Timer r={r} t={t} grande />
          <button onClick={onChiudi} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-elevated hover:text-primary">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-elevated p-3">
        <div className="eyebrow">Dove e perché</div>
        <div className="mt-1.5 text-[13px]">{r.via || sc.nomiVie.get(r.seg_id) || 'Via senza nome'}</div>
        <div className="mt-0.5 text-xs text-muted">
          {r.motivo_previsto ? `Il motore se lo aspettava: ${r.motivo_previsto}` : 'Il motore non aveva un motivo prevalente'}
          {pv != null && ` · score ${score(pv)}`}
        </div>
      </div>

      {r.stato === 'in_attesa' && (
        <button
          onClick={() => interventi.prendi(r.id)}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-medium text-base transition-transform active:scale-[0.98]"
        >
          Prendi la richiesta
          {r.assegnata && (
            <kbd className="rounded border border-base/20 px-1.5 py-0.5 text-[10px]">
              <CornerDownLeft className="inline size-3" />
            </kbd>
          )}
        </button>
      )}

      {inCorso && consiglio && <RiquadroCopilota consiglio={consiglio} />}

      {r.stato === 'in_gestione' && mia && !azione && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {AZIONI.map(({ azione: a, testo, icona: Icona, nota: spiegazione }) => (
              <button
                key={a}
                onClick={() => {
                  setAzione(a)
                  setCausa(suggerita)
                }}
                className={`relative flex flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-transform active:scale-[0.98] ${a === suggerita_azione ? 'ring-2 ring-info ring-offset-2 ring-offset-surface' : ''} ${
                  a === 'riparte'
                    ? 'bg-primary text-base'
                    : a === 'arresto'
                      ? 'bg-critical text-white'
                      : 'text-primary ring-1 ring-line-strong hover:bg-elevated'
                }`}
              >
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <Icona className="size-4" /> {testo}
                </span>
                <span className={`text-[11px] ${a === 'riparte' ? 'text-base/60' : a === 'arresto' ? 'text-white/70' : 'text-muted'}`}>
                  {a === suggerita_azione ? 'suggerita dal copilota' : spiegazione}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => interventi.rilascia(r.id)}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs text-muted transition-colors hover:text-primary"
          >
            <ArrowUpRight className="size-3.5" /> Passa a un collega
          </button>
        </>
      )}

      {r.stato === 'in_gestione' && mia && azione && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Perché si è fermato?</span>
            <button onClick={() => setAzione(null)} className="flex items-center gap-1 text-[11px] text-muted hover:text-primary">
              <ArrowLeft className="size-3" /> azioni
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cause.map((c) => (
              <button
                key={c}
                onClick={() => setCausa(c)}
                className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                  c === causa ? 'bg-info/15 text-info ring-1 ring-info/60' : 'text-secondary ring-1 ring-line-strong hover:text-primary'
                }`}
              >
                {c}
                {c === suggerita && <span className="ml-1.5 text-[10px] opacity-70">prevista</span>}
              </button>
            ))}
          </div>
          <label className="mt-3 block">
            <span className="eyebrow">Nota per il registro</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              placeholder="Facoltativa"
              className="mt-1.5 w-full resize-none rounded-lg bg-elevated px-3 py-2 text-xs text-primary ring-1 ring-line outline-none placeholder:text-muted focus:ring-info/60"
            />
          </label>
          <button
            onClick={() => causa && interventi.chiudi(r.id, azione, causa, nota)}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-medium text-base transition-transform active:scale-[0.98]"
          >
            <Check className="size-4" /> Chiudi l'intervento · {AZIONI.find((x) => x.azione === azione)?.testo.toLowerCase()}
          </button>
        </div>
      )}

      {r.stato === 'in_gestione' && !mia && (
        <div className="mt-4 text-xs text-muted">Un collega è già sul veicolo. Lo vedi ripartire quando chiude l'intervento.</div>
      )}
      {(r.stato === 'assistenza' || r.stato === 'arresto') && (
        <div className="mt-4 text-xs text-muted">
          Intervento chiuso da te. Il veicolo resta fermo finché {r.stato === 'assistenza' ? 'arriva l\u2019assistenza in strada' : 'non finisce il controllo'}, poi riparte da solo.
        </div>
      )}
    </motion.section>
  )
}

function Cifra({ etichetta, valore, unita, colore }: { etichetta: string; valore: string | number; unita?: string; colore?: string }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="text-[10px] text-muted">{etichetta}</div>
      <div className="num mt-0.5 text-[16px] font-medium text-primary" style={{ color: colore }}>
        {valore}
        {unita && <span className="ml-1 text-[11px] text-muted">{unita}</span>}
      </div>
    </div>
  )
}

/** Barra 0–100 con le due soglie del motore: sotto la prima si osserva, sotto la seconda si interviene. */
function BarraScore({ valore, sc }: { valore: number; sc: Scenario }) {
  const oss = score(sc.soglie.osservazione)
  const int = score(sc.soglie.intervento)
  return (
    <div className="mt-3">
      <div className="relative h-1.5 rounded-full bg-elevated">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{
            width: `${valore}%`,
            background: valore < int ? 'var(--color-critical)' : valore < oss ? 'var(--color-warn)' : 'var(--color-ok)',
          }}
        />
        {[int, oss].map((x) => (
          <span key={x} className="absolute -top-1 h-3.5 w-px bg-line-strong" style={{ left: `${x}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted">
        <span>0</span>
        <span>
          rosso sotto <span className="num">{int}</span> · giallo sotto <span className="num">{oss}</span>
        </span>
        <span className="num">100</span>
      </div>
    </div>
  )
}


function Fondo({ sc }: { sc: Scenario }) {
  const { t } = useOra()
  const i = Math.max(0, Math.floor((t - sc.inizio_s) / 60))
  const attivi = sc.carico.veicoli_attivi[i] ?? 0
  const inTurno = sc.carico.operatori_in_turno[i] ?? 0
  const prossimaOra = useMemo(() => sc.carico.richieste_attese.slice(i, i + 60).reduce((a, b) => a + b, 0), [sc, i])
  const livelli = useMemo(() => {
    const n = [0, 0, 0]
    for (const v of sc.veicoli) {
      const l = livello(sc, v.veicolo_id, t)
      if (l >= 0) n[l]++
    }
    return n
  }, [sc, t])
  return (
    <motion.section {...entrata(2)} className="glass absolute right-4 bottom-4 left-4 flex items-stretch gap-6 rounded-2xl px-5 py-3">
      <div className="flex shrink-0 items-center gap-6 pr-6" style={{ borderRight: '1px solid var(--color-line)' }}>
        <Kpi etichetta="Veicoli attivi" valore={Math.round(attivi)} sotto={`di ${sc.veicoli.length} · 4 flotte`} />
        <Kpi etichetta="Operatori in turno" valore={Math.round(inTurno)} sotto={`${inTurno ? (attivi / inTurno).toFixed(1) : '—'} veicoli ciascuno`} />
        <Kpi etichetta="Richieste prossima ora" valore={Math.round(prossimaOra)} sotto="previste dal motore" />
        <div className="flex flex-col justify-center gap-1.5">
          {([2, 1, 0] as const).map((l) => (
            <div key={l} className="flex items-center gap-2 text-xs">
              <span className="size-1.5 rounded-full" style={{ background: coloreLivello(l) }} />
              <span className="num w-6 text-right text-primary">{livelli[l]}</span>
              <span className="text-muted">{['Nominale', 'Attenzione', 'Critico'][l]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between">
          <span className="eyebrow">Richieste attese nella giornata</span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="size-2 rounded-sm bg-info/40" /> pioggia
          </span>
        </div>
        <LineaGiornata sc={sc} />
      </div>
    </motion.section>
  )
}

function Kpi({ etichetta, valore, sotto }: { etichetta: string; valore: number | string; sotto: string }) {
  return (
    <div className="flex flex-col justify-center">
      <div className="text-[11px] text-muted">{etichetta}</div>
      <div className="num text-[28px] leading-tight font-medium tracking-tight">{valore}</div>
      <div className="text-[11px] text-muted">{sotto}</div>
    </div>
  )
}
