// Comandi della mappa come su Google Maps: zoom, rotazione a passi di 45°, bussola (clic = nord),
// 2D/3D e un'orbita lenta attorno al centro per il palco. Con il mouse si ruota anche con Ctrl + trascina.
import { useEffect, useRef, useState } from 'react'
import type { Map as MLMap } from 'maplibre-gl'
import { Box, Minus, Orbit, Plus, RotateCcw, RotateCw } from 'lucide-react'

const PITCH_3D = 52
const GRADI_ORBITA_AL_SECONDO = 4

export function ComandiMappa({ mappa }: { mappa: MLMap }) {
  const [bearing, setBearing] = useState(mappa.getBearing())
  const [pitch, setPitch] = useState(mappa.getPitch())
  const [orbita, setOrbita] = useState(false)
  const raf = useRef(0)

  useEffect(() => {
    const aggiorna = () => {
      setBearing(mappa.getBearing())
      setPitch(mappa.getPitch())
    }
    mappa.on('rotate', aggiorna)
    mappa.on('pitch', aggiorna)
    return () => {
      mappa.off('rotate', aggiorna)
      mappa.off('pitch', aggiorna)
    }
  }, [mappa])

  // L'orbita si ferma appena qualcuno tocca la mappa
  useEffect(() => {
    if (!orbita) return
    let prima = performance.now()
    const gira = (ora: number) => {
      mappa.setBearing(mappa.getBearing() + ((ora - prima) / 1000) * GRADI_ORBITA_AL_SECONDO)
      prima = ora
      raf.current = requestAnimationFrame(gira)
    }
    raf.current = requestAnimationFrame(gira)
    const ferma = () => setOrbita(false)
    mappa.on('mousedown', ferma)
    mappa.on('touchstart', ferma)
    mappa.on('wheel', ferma)
    return () => {
      cancelAnimationFrame(raf.current)
      mappa.off('mousedown', ferma)
      mappa.off('touchstart', ferma)
      mappa.off('wheel', ferma)
    }
  }, [orbita, mappa])

  const ruota = (gradi: number) => mappa.easeTo({ bearing: mappa.getBearing() + gradi, duration: 600 })
  const tre_d = pitch > 5

  return (
    <div className="glass flex flex-col items-center gap-0.5 rounded-xl p-1">
      <Tasto titolo="Avvicina" onClick={() => mappa.zoomIn({ duration: 300 })}>
        <Plus className="size-4" />
      </Tasto>
      <Tasto titolo="Allontana" onClick={() => mappa.zoomOut({ duration: 300 })}>
        <Minus className="size-4" />
      </Tasto>
      <Divisore />
      <Tasto titolo="Ruota a sinistra" onClick={() => ruota(-45)}>
        <RotateCcw className="size-4" />
      </Tasto>
      <button
        title="Torna a nord"
        onClick={() => mappa.easeTo({ bearing: 0, duration: 700 })}
        className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-elevated"
      >
        <svg viewBox="0 0 24 24" className="size-5" style={{ transform: `rotate(${-bearing}deg)` }}>
          <path d="M12 3 L15 12 L9 12 Z" fill="var(--color-critical)" />
          <path d="M12 21 L9 12 L15 12 Z" fill="var(--color-secondary)" />
        </svg>
      </button>
      <Tasto titolo="Ruota a destra" onClick={() => ruota(45)}>
        <RotateCw className="size-4" />
      </Tasto>
      <Divisore />
      <Tasto titolo={tre_d ? 'Vista dall’alto (2D)' : 'Vista 3D'} attivo={tre_d} onClick={() => mappa.easeTo({ pitch: tre_d ? 0 : PITCH_3D, duration: 700 })}>
        <Box className="size-4" />
      </Tasto>
      <Tasto titolo="Orbita lenta attorno alla città" attivo={orbita} onClick={() => setOrbita((o) => !o)}>
        <Orbit className="size-4" />
      </Tasto>
    </div>
  )
}

function Tasto({ titolo, attivo = false, onClick, children }: { titolo: string; attivo?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={titolo}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-lg transition-colors ${attivo ? 'bg-elevated text-info ring-1 ring-info/50' : 'text-secondary hover:bg-elevated hover:text-primary'}`}
    >
      {children}
    </button>
  )
}

const Divisore = () => <span className="my-0.5 h-px w-5 bg-line" />
