// Mappa 3D di Prati e Trastevere disegnata solo con i nostri dati (strade OSM, edifici con altezza
// da satellite): nessuna tile online, funziona anche senza rete.
import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent, MapMouseEvent } from 'maplibre-gl'
import indirizzoWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { indiceFascia, livello, posizione, type Scenario } from '../lib/scenario'
import { orologio } from '../lib/orologio'
import { ComandiMappa } from './ComandiMappa'

// Soglie grafiche della mappa (millesimi di probabilità per passaggio): sotto i 60 la strada resta neutra.
// 60‰ ≈ 95° percentile della giornata, 100‰ ≈ 99°. Non toccano il modello, solo il disegno.
const STRADA_ATTENZIONE = 60
const STRADA_CRITICA = 100

// Il worker di MapLibre (calcoli della mappa in un thread separato) impacchettato da Vite insieme all'app
maplibregl.setWorkerUrl(indirizzoWorker)

const C = {
  base: '#09090B',
  strada: '#2A2A30',
  ok: '#A3F24E',
  warn: '#FF8A3D',
  critical: '#FF3D6E',
  info: '#7B6CFF',
}

interface Props {
  sc: Scenario
  selezionato: string | null
  onSeleziona: (id: string | null) => void
}

export function Mappa({ sc, selezionato, onSeleziona }: Props) {
  const div = useRef<HTMLDivElement>(null)
  const mappa = useRef<MLMap | null>(null)
  const [pronta, setPronta] = useState<MLMap | null>(null)
  const sel = useRef(selezionato)
  sel.current = selezionato

  useEffect(() => {
    const m = new maplibregl.Map({
      container: div.current!,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'sfondo', type: 'background', paint: { 'background-color': C.base } }],
      },
      center: [12.468, 41.9],
      zoom: 14,
      pitch: 52,
      bearing: -17,
      maxPitch: 70, // si inclina fino a 70°: mai sotto la città
      attributionControl: false,
      fadeDuration: 0,
    })
    mappa.current = m
    if (import.meta.env.DEV) (window as unknown as { mappa: MLMap }).mappa = m

    m.on('load', () => {
      setPronta(m)
      const b = new maplibregl.LngLatBounds()
      for (const f of sc.tratti.features) for (const c of (f.geometry as GeoJSON.LineString).coordinates) b.extend(c as [number, number])
      const cam = m.cameraForBounds(b, { padding: { top: 40, bottom: 220, left: 380, right: 380 } })
      if (cam) m.jumpTo({ ...cam, pitch: 52, bearing: -17 })
      m.setMaxBounds([
        [b.getWest() - 0.03, b.getSouth() - 0.02],
        [b.getEast() + 0.03, b.getNorth() + 0.02],
      ])

      m.addSource('tratti', { type: 'geojson', data: sc.tratti, promoteId: 'seg_id' })
      m.addSource('edifici', { type: 'geojson', data: sc.edifici })
      m.addSource('veicoli', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addSource('percorso', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

      m.addLayer({
        id: 'strade',
        type: 'line',
        source: 'tratti',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.strada,
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0.6, 16, 2.4, 18, 7],
        },
      })
      const coloreRischio: maplibregl.ExpressionSpecification = [
        'step',
        ['coalesce', ['feature-state', 'p'], 0],
        'rgba(0,0,0,0)',
        STRADA_ATTENZIONE,
        C.warn,
        STRADA_CRITICA,
        C.critical,
      ]
      m.addLayer({
        id: 'rischio-alone',
        type: 'line',
        source: 'tratti',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': coloreRischio,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 14, 18, 30],
          'line-blur': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 10],
          'line-opacity': 0.28,
          'line-color-transition': { duration: 900 },
        },
      })
      m.addLayer({
        id: 'rischio',
        type: 'line',
        source: 'tratti',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': coloreRischio,
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 1, 16, 3, 18, 8],
          'line-opacity': 0.95,
        },
      })
      m.addLayer({
        id: 'edifici',
        type: 'fill-extrusion',
        source: 'edifici',
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'h'], 6, '#141418', 25, '#1D1D22', 45, '#2A2A31'],
          'fill-extrusion-height': ['get', 'h'],
          'fill-extrusion-opacity': 0.88,
          'fill-extrusion-vertical-gradient': true,
        },
      })
      m.addLayer({
        id: 'percorso',
        type: 'line',
        source: 'percorso',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.info,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.5, 17, 4],
          'line-dasharray': [1.5, 1.5],
          'line-opacity': 0.9,
        },
      })
      const coloreVeicolo: maplibregl.ExpressionSpecification = [
        'match', ['get', 'l'], 2, C.critical, 1, C.warn, C.ok,
      ]
      m.addLayer({
        id: 'veicoli-alone',
        type: 'circle',
        source: 'veicoli',
        filter: ['>=', ['get', 'l'], 1],
        paint: {
          'circle-color': coloreVeicolo,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 8, 17, 22],
          'circle-opacity': 0.16,
          'circle-blur': 0.6,
          'circle-pitch-alignment': 'map',
        },
      })
      m.addLayer({
        id: 'veicoli-selezione',
        type: 'circle',
        source: 'veicoli',
        filter: ['==', ['get', 's'], 1],
        paint: {
          'circle-color': 'rgba(0,0,0,0)',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 9, 17, 16],
          'circle-stroke-color': C.info,
          'circle-stroke-width': 2,
        },
      })
      m.addLayer({
        id: 'veicoli',
        type: 'circle',
        source: 'veicoli',
        paint: {
          'circle-color': coloreVeicolo,
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            13, ['match', ['get', 'l'], 2, 4, 1, 3.4, 2.2],
            17, ['match', ['get', 'l'], 2, 8, 1, 7, 5],
          ],
          'circle-stroke-color': C.base,
          'circle-stroke-width': 1.5,
        },
      })

      m.on('click', 'veicoli', (e: MapLayerMouseEvent) => onSeleziona((e.features?.[0]?.properties?.id as string) ?? null))
      m.on('click', (e: MapMouseEvent) => {
        if (!m.queryRenderedFeatures(e.point, { layers: ['veicoli'] }).length) onSeleziona(null)
      })
      m.on('mouseenter', 'veicoli', () => (m.getCanvas().style.cursor = 'pointer'))
      m.on('mouseleave', 'veicoli', () => (m.getCanvas().style.cursor = ''))

      let fascia = -1
      let raf = 0
      const disegna = () => {
        const t = orologio.ora()
        const f = indiceFascia(sc, t)
        if (f !== fascia) {
          fascia = f
          for (const [seg, valori] of Object.entries(sc.rischio)) m.setFeatureState({ source: 'tratti', id: seg }, { p: valori[f] })
        }
        const features: GeoJSON.Feature[] = []
        for (const v of sc.veicoli) {
          const l = livello(sc, v.veicolo_id, t)
          if (l < 0) continue
          features.push({
            type: 'Feature',
            properties: { id: v.veicolo_id, l, s: v.veicolo_id === sel.current ? 1 : 0 },
            geometry: { type: 'Point', coordinates: posizione(sc, v, t) },
          })
        }
        ;(m.getSource('veicoli') as GeoJSONSource).setData({ type: 'FeatureCollection', features })

        const v = sel.current ? sc.perId.get(sel.current) : null
        const tracciato: GeoJSON.Feature[] = []
        if (v) {
          const coords = []
          for (let dt = 0; dt <= 600; dt += sc.passo_s) coords.push(posizione(sc, v, t + dt))
          tracciato.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } })
        }
        ;(m.getSource('percorso') as GeoJSONSource).setData({ type: 'FeatureCollection', features: tracciato })
        raf = requestAnimationFrame(disegna)
      }
      disegna()
      m.once('remove', () => cancelAnimationFrame(raf))
    })

    return () => {
      setPronta(null)
      m.remove()
    }
  }, [sc]) // eslint-disable-line react-hooks/exhaustive-deps

  // Al cambio di selezione la camera va sul veicolo
  useEffect(() => {
    const m = mappa.current
    const v = selezionato ? sc.perId.get(selezionato) : null
    if (!m || !v) return
    m.easeTo({ center: posizione(sc, v, orologio.ora()), zoom: Math.max(m.getZoom(), 15.6), duration: 1200, padding: { left: 0, right: 360, top: 0, bottom: 160 } })
  }, [selezionato, sc])

  // Il contenitore esterno è posizionato; quello interno lo usa MapLibre (che gli impone position: relative)
  return (
    <div className="absolute inset-0">
      <div ref={div} className="h-full w-full" />
      {pronta && (
        <div className="absolute right-[372px] bottom-[176px] z-10">
          <ComandiMappa mappa={pronta} />
        </div>
      )}
    </div>
  )
}
