// Mappa 3D di Prati e Trastevere disegnata solo con i nostri dati (strade OSM, edifici con altezza
// da satellite): nessuna tile online, funziona anche senza rete.
import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent, MapMouseEvent } from 'maplibre-gl'
import indirizzoWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { indiceFascia, livello, posizione, statoGps, type Scenario } from '../lib/scenario'
import { orologio } from '../lib/orologio'

// Soglie grafiche della mappa (millesimi di probabilità per passaggio): sotto i 60 la strada resta neutra.
// 60‰ ≈ 95° percentile della giornata, 100‰ ≈ 99°. Non toccano il modello, solo il disegno.
const STRADA_ATTENZIONE = 60
const STRADA_CRITICA = 100

// Il worker di MapLibre (calcoli della mappa in un thread separato) impacchettato da Vite insieme all'app
maplibregl.setWorkerUrl(indirizzoWorker)

// Rotazione come su Google Maps: click a due dita sul touchpad (tasto destro) o Ctrl + clic, poi trascina.
// In orizzontale ruota in modo lineare ovunque sia il puntatore, in verticale inclina.
const GRADI_ROTAZIONE_PER_PIXEL = 0.4
const GRADI_INCLINAZIONE_PER_PIXEL = 0.3

function rotazioneTouchpad(m: MLMap) {
  m.dragRotate.disable() // la rotazione di MapLibre gira attorno al centro: lontano dal centro è lentissima
  const area = m.getCanvasContainer()
  let ultimo: { x: number; y: number } | null = null
  const giu = (e: MouseEvent) => {
    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
      ultimo = { x: e.clientX, y: e.clientY }
      e.preventDefault()
      e.stopPropagation()
    }
  }
  const muovi = (e: MouseEvent) => {
    if (!ultimo) return
    m.jumpTo({
      bearing: m.getBearing() + (e.clientX - ultimo.x) * GRADI_ROTAZIONE_PER_PIXEL,
      pitch: m.getPitch() - (e.clientY - ultimo.y) * GRADI_INCLINAZIONE_PER_PIXEL,
    })
    ultimo = { x: e.clientX, y: e.clientY }
  }
  const su = () => (ultimo = null)
  const menu = (e: Event) => e.preventDefault()
  area.addEventListener('mousedown', giu, true)
  area.addEventListener('contextmenu', menu)
  window.addEventListener('mousemove', muovi)
  window.addEventListener('mouseup', su)
  m.once('remove', () => {
    window.removeEventListener('mousemove', muovi)
    window.removeEventListener('mouseup', su)
  })
}

const SEDE: [number, number] = [12.51787, 41.89023] // Spazio Attivo Roma Casilina (config/scenario.yaml, sede)

const C = {
  base: '#09090B',
  strada: '#2A2A30',
  ok: '#A3F24E',
  warn: '#FF8A3D',
  critical: '#FF3D6E',
  info: '#7B6CFF',
  offline: '#71717A',
}

interface Props {
  sc: Scenario
  selezionato: string | null
  onSeleziona: (id: string | null) => void
}

export function Mappa({ sc, selezionato, onSeleziona }: Props) {
  const div = useRef<HTMLDivElement>(null)
  const mappa = useRef<MLMap | null>(null)
  const sel = useRef(selezionato)
  const volaDalVivo = useRef<() => void>(() => {})
  // i dati della giornata possono cambiare (temporale in anticipo): la mappa resta, cambia solo cosa legge
  const dati = useRef(sc)
  dati.current = sc
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
    rotazioneTouchpad(m)
    if (import.meta.env.DEV) (window as unknown as { mappa: MLMap }).mappa = m

    m.on('load', () => {
      const b = new maplibregl.LngLatBounds()
      for (const f of sc.tratti.features) for (const c of (f.geometry as GeoJSON.LineString).coordinates) b.extend(c as [number, number])
      const cam = m.cameraForBounds(b, { padding: { top: 40, bottom: 220, left: 380, right: 380 } })
      if (cam) m.jumpTo({ ...cam, pitch: 52, bearing: -17 })
      // spazio occupato dai pannelli (coda a sinistra, schede a destra, giornata in basso): impostato una volta sola,
      // così centrare un veicolo non fa scivolare la vista animando i margini
      m.setPadding({ left: 360, right: 360, top: 0, bottom: 180 })
      // la mappa arriva fino alla sede dell'hackathon (Casilina), dove il telefono fa da BOXi dal vivo
      const limiti = new maplibregl.LngLatBounds(b.getSouthWest(), b.getNorthEast()).extend(SEDE)
      m.setMaxBounds([
        [limiti.getWest() - 0.03, limiti.getSouth() - 0.02],
        [limiti.getEast() + 0.03, limiti.getNorth() + 0.02],
      ])

      m.addSource('tratti', { type: 'geojson', data: sc.tratti, promoteId: 'seg_id' })
      m.addSource('edifici', { type: 'geojson', data: sc.edifici })
      // strade ed edifici attorno alla sede (data/scripts/08_area_sede.py); se mancano la mappa resta com'è
      m.addSource('sede-strade', { type: 'geojson', data: '/data/sede/strade.geojson' })
      m.addSource('sede-edifici', { type: 'geojson', data: '/data/sede/edifici.geojson' })
      m.addSource('dal-vivo', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
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
        id: 'sede-strade',
        type: 'line',
        source: 'sede-strade',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': C.strada, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0.6, 16, 2.4, 18, 7] },
      })
      m.addLayer({
        id: 'sede-edifici',
        type: 'fill-extrusion',
        source: 'sede-edifici',
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'h'], 6, '#141418', 25, '#1D1D22', 45, '#2A2A31'],
          'fill-extrusion-height': ['get', 'h'],
          'fill-extrusion-opacity': 0.88,
          'fill-extrusion-vertical-gradient': true,
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
      // metri per pixel a Roma (41,9° N): 28,45 a zoom 12, si dimezza a ogni livello di zoom
      const raggioMetri: maplibregl.ExpressionSpecification = [
        'interpolate', ['exponential', 2], ['zoom'],
        12, ['/', ['get', 'g'], 28.45],
        20, ['/', ['get', 'g'], 0.111],
      ]
      m.addLayer({
        id: 'gps-incertezza',
        type: 'circle',
        source: 'veicoli',
        filter: ['>', ['get', 'g'], 0],
        paint: {
          'circle-radius': raggioMetri,
          'circle-color': ['case', ['==', ['get', 'ga'], 1], C.offline, C.warn],
          'circle-opacity': 0.1,
          'circle-stroke-color': ['case', ['==', ['get', 'ga'], 1], C.offline, C.warn],
          'circle-stroke-width': 1,
          'circle-stroke-opacity': 0.7,
          'circle-pitch-alignment': 'map',
        },
      })
      m.addLayer({
        id: 'dal-vivo-precisione',
        type: 'circle',
        source: 'dal-vivo',
        paint: {
          'circle-radius': raggioMetri,
          'circle-color': ['match', ['get', 'stato'], 'offline', C.offline, 'critico', C.critical, 'attenzione', C.warn, C.info],
          'circle-opacity': 0.12,
          'circle-stroke-color': ['match', ['get', 'stato'], 'offline', C.offline, 'critico', C.critical, 'attenzione', C.warn, C.info],
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.8,
          'circle-pitch-alignment': 'map',
          'circle-radius-transition': { duration: 600 },
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
      let giornata = sc
      let raf = 0
      // il BOXi in sala: un marcatore con l'etichetta (le etichette della mappa vorrebbero font scaricati da internet)
      const elemento = document.createElement('button')
      elemento.className = 'boxi-sala'
      elemento.innerHTML = '<span class="anello"></span><span class="punto"></span><span class="nome">BOXi in sala</span>'
      elemento.onclick = (e) => {
        e.stopPropagation()
        onSeleziona('boxi_sala')
      }
      const marcatore = new maplibregl.Marker({ element: elemento })
      let visto = false
      let sullaMappa = false // il marcatore si aggiunge una volta sola: riaggiungerlo a ogni fotogramma rende impossibile cliccarlo
      const disegnaDalVivo = () => {
        const d = orologio.dalVivo()
        if (!d) {
          if (sullaMappa) marcatore.remove()
          sullaMappa = false
          ;(m.getSource('dal-vivo') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [] })
          return
        }
        marcatore.setLngLat([d.lon, d.lat])
        if (!sullaMappa) {
          marcatore.addTo(m)
          sullaMappa = true
        }
        if (elemento.dataset.stato !== d.stato) elemento.dataset.stato = d.stato
        ;(m.getSource('dal-vivo') as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: { g: d.precisione_m, stato: d.stato }, geometry: { type: 'Point', coordinates: [d.lon, d.lat] } }],
        })
        if (!visto) {
          // la prima volta che il telefono si collega la mappa vola da lui
          visto = true
          m.flyTo({ center: [d.lon, d.lat], zoom: 16.5, pitch: 55, duration: 2500 })
        }
      }
      volaDalVivo.current = () => {
        const d = orologio.dalVivo()
        if (d) m.flyTo({ center: [d.lon, d.lat], zoom: 16.5, pitch: 55, duration: 2000 })
      }
      const disegna = () => {
        disegnaDalVivo()
        const sc = dati.current
        const t = orologio.ora()
        const f = indiceFascia(sc, t)
        if (f !== fascia || sc !== giornata) {
          fascia = f
          giornata = sc
          for (const [seg, valori] of Object.entries(sc.rischio)) m.setFeatureState({ source: 'tratti', id: seg }, { p: valori[f] })
        }
        const features: GeoJSON.Feature[] = []
        for (const v of sc.veicoli) {
          const l = livello(sc, v.veicolo_id, t)
          if (l < 0) continue
          // cerchio di incertezza: raggio pari all'errore del GPS in metri (40 m quando il segnale manca)
          const gps = statoGps(sc, v.veicolo_id, t)
          const g = !gps || gps.stato === 'ok' ? 0 : gps.stato === 'assente' ? 40 : (gps.metri ?? 0)
          features.push({
            type: 'Feature',
            properties: { id: v.veicolo_id, l, s: v.veicolo_id === sel.current ? 1 : 0, g, ga: gps?.stato === 'assente' ? 1 : 0 },
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

    return () => m.remove()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Tasto B: la mappa torna sul BOXi in sala
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.code === 'KeyB' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA')
        volaDalVivo.current()
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [])

  // Al cambio di selezione la camera va sul veicolo
  useEffect(() => {
    const m = mappa.current
    const v = selezionato ? sc.perId.get(selezionato) : null
    if (!m || !v) return
    m.easeTo({ center: posizione(sc, v, orologio.ora()), zoom: Math.max(m.getZoom(), 15.6), duration: 800 })
  }, [selezionato, sc])

  // Il contenitore esterno è posizionato; quello interno lo usa MapLibre (che gli impone position: relative)
  return (
    <div className="absolute inset-0">
      <div ref={div} className="h-full w-full" />
    </div>
  )
}
