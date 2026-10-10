import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  CalendarClock,
  CloudLightning,
  CloudRain,
  Gauge,
  Pause,
  Play,
  Radar,
  ScrollText,
  Settings2,
  UserRound,
} from 'lucide-react'
import { Marchio } from './Marchio'
import { Punto } from './Stato'
import { orologio, useOra, VELOCITA } from '../lib/orologio'
import { hhmm, indiceFascia } from '../lib/scenario'
import { useScenario } from '../lib/ScenarioContext'
import { RUOLI, useRuolo, type Ruolo } from '../lib/ruolo'

export const SCHERMATE = [
  { to: '/console', nome: 'Console operatore', breve: 'Console', icona: Radar, ruoli: ['operatore', 'responsabile'] },
  { to: '/planner', nome: 'Planner turni', breve: 'Planner', icona: CalendarClock, ruoli: ['responsabile'] },
  { to: '/registro', nome: 'Registro e report', breve: 'Registro', icona: ScrollText, ruoli: ['responsabile', 'cliente'] },
  { to: '/flotta', nome: 'Dashboard flotta', breve: 'Flotta', icona: Gauge, ruoli: ['responsabile', 'cliente'] },
  { to: '/configurazione', nome: 'Configurazione', breve: 'Config.', icona: Settings2, ruoli: ['responsabile'] },
] as const

export function Shell() {
  const [ruolo] = useRuolo()
  const visibili = SCHERMATE.filter((s) => (s.ruoli as readonly Ruolo[]).includes(ruolo))
  return (
    <div className="grain flex h-full">
      <nav className="relative z-20 flex w-[72px] shrink-0 flex-col items-center border-r border-line bg-base py-4">
        <NavLink to="/" className="mb-7 grid size-10 place-items-center rounded-xl text-primary">
          <Marchio className="h-[18px]" />
        </NavLink>
        <div className="flex flex-col gap-1.5">
          {visibili.map(({ to, breve, icona: Icona }) => (
            <NavLink key={to} to={to} className="group relative flex w-14 flex-col items-center gap-1 py-1.5">
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-attiva"
                      className="absolute inset-0 rounded-xl bg-elevated ring-1 ring-line"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <Icona
                    className={`relative size-[18px] transition-colors ${isActive ? 'text-primary' : 'text-muted group-hover:text-secondary'}`}
                    strokeWidth={1.6}
                  />
                  <span
                    className={`relative text-[10px] font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted group-hover:text-secondary'}`}
                  >
                    {breve}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
        <div className="mt-auto">
          <SceltaRuolo />
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraAlta />
        <main className="relative min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function BarraAlta() {
  const { pathname } = useLocation()
  const sc = useScenario()
  const { t, velocita, inCorsa, collegato, temporale, temporali } = useOra()
  const schermata = SCHERMATE.find((s) => pathname.startsWith(s.to))
  const pioggia = sc ? sc.pioggia_mm[indiceFascia(sc, t)] : null

  const temporaleAttuale = useRef(temporale)
  temporaleAttuale.current = temporale

  useEffect(() => {
    const tasti = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.code === 'Space') {
        e.preventDefault()
        orologio.avvia()
      }
      if (e.code === 'ArrowRight') orologio.vai(orologio.ora() + 600)
      if (e.code === 'ArrowLeft') orologio.vai(orologio.ora() - 600)
      if (e.code === 'KeyT') orologio.temporale(temporaleAttuale.current === 'prima' ? 'previsto' : 'prima')
    }
    window.addEventListener('keydown', tasti)
    return () => window.removeEventListener('keydown', tasti)
  }, [])

  const data = sc
    ? new Date(sc.data).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : ''

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-6 border-b border-line bg-base px-5">
      <div className="min-w-0 flex-1">
        <div className="eyebrow">AttentionGrid · Centrale Roma</div>
        <div className="truncate text-[15px] font-medium tracking-tight">{schermata?.nome ?? 'Panoramica'}</div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={orologio.avvia}
          className="grid size-8 place-items-center rounded-lg bg-primary text-base transition-transform active:scale-95"
          title="Avvia o ferma la giornata (spazio)"
        >
          {inCorsa ? <Pause className="size-4" fill="currentColor" /> : <Play className="size-4 translate-x-px" fill="currentColor" />}
        </button>
        <div className="flex flex-col items-start leading-none">
          <span className="num text-[22px] font-medium tracking-tight">{hhmm(t, true)}</span>
          <span className="mt-1 text-[11px] capitalize text-muted">{data}</span>
        </div>
        <div className="ml-2 flex rounded-lg bg-surface p-0.5 ring-1 ring-line">
          {VELOCITA.map((v) => (
            <button
              key={v}
              onClick={() => orologio.velocita(v)}
              className={`num relative h-7 rounded-md px-2.5 text-xs transition-colors ${v === velocita ? 'text-primary' : 'text-muted hover:text-secondary'}`}
            >
              {v === velocita && (
                <motion.span layoutId="vel" className="absolute inset-0 rounded-md bg-elevated ring-1 ring-line-strong" />
              )}
              <span className="relative">{v}×</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        {temporali.includes('prima') && (
          <button
            onClick={() => orologio.temporale(temporale === 'prima' ? 'previsto' : 'prima')}
            title="La giornata vera con il temporale un'ora prima di quanto previsto la sera prima (tasto T)"
            className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs transition-colors"
            style={
              temporale === 'prima'
                ? { color: 'var(--color-warn)', background: 'color-mix(in srgb, var(--color-warn) 14%, transparent)' }
                : { color: 'var(--color-secondary)', boxShadow: 'inset 0 0 0 1px var(--color-line)' }
            }
          >
            <CloudLightning className="size-3.5" strokeWidth={1.8} />
            {temporale === 'prima' ? 'Temporale 1 h prima' : 'Meteo come previsto'}
          </button>
        )}
        {pioggia != null && (
          <span
            className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs"
            style={
              pioggia >= 4
                ? { color: 'var(--color-warn)', background: 'color-mix(in srgb, var(--color-warn) 14%, transparent)' }
                : { color: 'var(--color-secondary)', boxShadow: 'inset 0 0 0 1px var(--color-line)' }
            }
          >
            <CloudRain className="size-3.5" strokeWidth={1.8} />
            <span className="num">{pioggia.toFixed(1)} mm/h</span>
          </span>
        )}
        <span className="inline-flex h-7 items-center gap-2 rounded-full px-3 text-xs text-secondary ring-1 ring-line ring-inset">
          <Punto colore={collegato ? 'var(--color-ok)' : 'var(--color-offline)'} pulsa={collegato && inCorsa} />
          {collegato ? 'Diretta · motore locale' : 'Motore offline'}
        </span>
      </div>
    </header>
  )
}

function SceltaRuolo() {
  const [ruolo, setRuolo] = useRuolo()
  const [aperto, setAperto] = useState(false)
  const vai = useNavigate()
  return (
    <div className="relative">
      <button
        onClick={() => setAperto((a) => !a)}
        className="grid size-10 place-items-center rounded-full bg-elevated text-secondary ring-1 ring-line transition-colors hover:text-primary"
        title={RUOLI[ruolo].nome}
      >
        <UserRound className="size-4" strokeWidth={1.7} />
      </button>
      {aperto && (
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass absolute bottom-0 left-14 w-60 rounded-xl p-1.5"
        >
          <div className="eyebrow px-2.5 pt-1.5 pb-2">Entra come</div>
          {(Object.keys(RUOLI) as Ruolo[]).map((r) => (
            <button
              key={r}
              onClick={() => {
                setRuolo(r)
                setAperto(false)
                vai(RUOLI[r].home)
              }}
              className={`flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-elevated ${r === ruolo ? 'bg-elevated' : ''}`}
            >
              <span className="text-[13px] font-medium">{RUOLI[r].nome}</span>
              <span className="text-xs text-muted">{RUOLI[r].chi}</span>
            </button>
          ))}
        </motion.div>
      )}
    </div>
  )
}
