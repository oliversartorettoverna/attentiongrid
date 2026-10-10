import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, Hand, Navigation, OctagonX, Siren, X } from 'lucide-react'
import { Mappa } from '../components/Mappa'
import { LineaGiornata } from '../components/LineaGiornata'
import { Stato, coloreLivello } from '../components/Stato'
import { useScenario } from '../lib/ScenarioContext'
import { useOra } from '../lib/orologio'
import {
  livello,
  piuARischio,
  probabilita,
  posizione,
  richiesteAperte,
  score,
  sigla,
  type Livello,
  type Scenario,
} from '../lib/scenario'

const ATTESA_MAX_S = 20 // livello di servizio: 90% delle richieste prese entro 20 secondi

export function Console() {
  const sc = useScenario()
  const [sel, setSel] = useState<string | null>(null)
  if (!sc) return <Caricamento />
  return (
    <div className="absolute inset-0 overflow-hidden">
      <Mappa sc={sc} selezionato={sel} onSeleziona={setSel} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(9,9,11,0.85))]" />
      <Coda sc={sc} onSeleziona={setSel} />
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

function Coda({ sc, onSeleziona }: { sc: Scenario; onSeleziona: (id: string) => void }) {
  const { t } = useOra()
  const aperte = richiesteAperte(sc, t).sort((a, b) => Number(a.inGestione) - Number(b.inGestione) || a.inizio - b.inizio)
  const inAttesa = aperte.filter((r) => !r.inGestione).length
  return (
    <motion.section {...entrata(0)} className="glass absolute top-4 left-4 flex max-h-[calc(100%-200px)] w-[340px] flex-col rounded-2xl">
      <header className="flex items-center justify-between px-4 pt-4 pb-3">
        <div>
          <div className="eyebrow">Coda richieste</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="num text-2xl font-medium">{aperte.length}</span>
            <span className="text-xs text-muted">aperte · {inAttesa} in attesa</span>
          </div>
        </div>
        <span className="num text-xs text-muted">obiettivo ≤ {ATTESA_MAX_S} s</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {aperte.length === 0 && (
          <div className="px-2 py-6 text-center text-sm text-muted">Nessun veicolo sta chiedendo aiuto.</div>
        )}
        <AnimatePresence initial={false}>
          {aperte.map((r) => {
            const via = sc.nomiVie.get(r.seg_id) || 'Via senza nome'
            const scaduta = !r.inGestione && r.attesa > ATTESA_MAX_S
            return (
              <motion.button
                layout
                key={`${r.veicolo_id}-${r.inizio}`}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => onSeleziona(r.veicolo_id)}
                className="mb-1.5 flex w-full items-center gap-3 rounded-xl bg-elevated px-3 py-2.5 text-left ring-1 transition-colors hover:ring-line-strong"
                style={{ ['--tw-ring-color' as string]: r.inGestione ? 'var(--color-line)' : 'color-mix(in srgb, var(--color-critical) 45%, transparent)' }}
              >
                <Timer secondi={r.inGestione ? r.durata_s : r.attesa} inGestione={r.inGestione} scaduta={scaduta} t={t} inizio={r.inizio + r.attesa_s} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="num text-[13px] font-medium">{sigla(r.veicolo_id)}</span>
                    <span className="truncate text-xs text-muted">{sc.flotte[sc.perId.get(r.veicolo_id)?.flotta ?? '']?.nome}</span>
                  </div>
                  <div className="truncate text-xs text-secondary">{via}</div>
                </div>
                {r.inGestione ? (
                  <span className="num shrink-0 text-[11px] text-muted">Op. {r.operatore + 1}</span>
                ) : (
                  <Stato livello={2} etichetta="Richiesta" pulsa />
                )}
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}

/** Anello del timer: in attesa conta verso i 20 secondi, in gestione mostra da quanto l'operatore è sul veicolo. */
function Timer({ secondi, inGestione, scaduta, t, inizio }: { secondi: number; inGestione: boolean; scaduta: boolean; t: number; inizio: number }) {
  const r = 15
  const giro = 2 * Math.PI * r
  const trascorsi = inGestione ? Math.max(0, t - inizio) : secondi
  const quota = inGestione ? Math.min(1, trascorsi / Math.max(1, secondi)) : Math.min(1, secondi / ATTESA_MAX_S)
  const colore = inGestione ? 'var(--color-info)' : scaduta ? 'var(--color-critical)' : 'var(--color-warn)'
  return (
    <div className="relative grid size-10 shrink-0 place-items-center">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--color-line)" strokeWidth="2.5" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={colore} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={giro} strokeDashoffset={giro * (1 - quota)} />
      </svg>
      <span className="num text-[11px] font-medium">{Math.floor(trascorsi)}</span>
    </div>
  )
}

function ColonnaDestra({ sc, sel, onSeleziona }: { sc: Scenario; sel: string | null; onSeleziona: (id: string | null) => void }) {
  const { t } = useOra()
  const daGuardare = piuARischio(sc, t).filter((d) => d.livello >= 1).slice(0, 7)
  return (
    <div className="absolute top-4 right-4 flex max-h-[calc(100%-200px)] w-[340px] flex-col gap-3">
      <AnimatePresence mode="popLayout">
        {sel && <SchedaVeicolo key={sel} sc={sc} id={sel} t={t} onChiudi={() => onSeleziona(null)} />}
      </AnimatePresence>
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
                  <span className="num text-[11px] text-muted">tra {d.tra_s} s</span>
                </div>
                <div className="truncate text-xs text-secondary">{d.via}</div>
                <div className="truncate text-[11px] text-muted">{d.motivo}</div>
              </div>
              <Stato livello={d.livello} />
            </motion.button>
          ))}
        </div>
      </motion.section>
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
  const kmh = Math.round((Math.hypot((b[0] - a[0]) * 82_700, (b[1] - a[1]) * 111_200) / sc.passo_s) * 3.6)
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
          <Stato livello={l as Livello} pulsa={l === 2} />
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

      {d && (
        <div className="mt-4 rounded-xl bg-elevated p-3">
          <div className="eyebrow">Perché</div>
          <div className="mt-1.5 text-[13px]">{d.motivo}</div>
          <div className="mt-0.5 text-xs text-muted">
            {d.via} · tra {d.tra_s} s
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="col-span-2 flex h-9 items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-medium text-base transition-transform active:scale-[0.98]">
          <Hand className="size-4" /> Prendi il controllo
        </button>
        <Azione icona={Navigation} testo="Devia" />
        <Azione icona={ArrowUpRight} testo="Passa a collega" />
        <Azione icona={Siren} testo="Assistenza" />
        <button className="flex h-9 items-center justify-center gap-2 rounded-lg bg-critical text-[13px] font-medium text-white transition-transform active:scale-[0.98]">
          <OctagonX className="size-4" /> Arresto
        </button>
      </div>
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

function Azione({ icona: Icona, testo }: { icona: typeof Hand; testo: string }) {
  return (
    <button className="flex h-9 items-center justify-center gap-2 rounded-lg text-[13px] font-medium text-primary ring-1 ring-line-strong transition-colors hover:bg-elevated">
      <Icona className="size-4 text-secondary" /> {testo}
    </button>
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
