# Formati dei file

Questi sono i "contratti" tra i moduli. Se li rispetti, ognuno può lavorare in parallelo. Se devi cambiarne uno, aggiorna prima questo file e avvisa nel gruppo.

Convenzioni valide per tutti i file:
- Coordinate in gradi decimali WGS84 (`lat`, `lon`), come su Google Maps.
- Orari come stringa `"HH:MM"` o `"HH:MM:SS"` nell'ora locale di Roma, riferiti al giorno dello scenario.
- Identificativi sempre stringhe (`"seg_000123"`, `"boxi_01"`).
- Probabilità tra 0 e 1.

---

## 1. `data/processed/tratti.geojson`

Un tratto = un pezzo di strada tra due incroci. È la griglia su cui si calcola tutto.

GeoJSON `FeatureCollection` di `LineString`. Proprietà di ogni tratto:

| Campo | Tipo | Significato |
|---|---|---|
| `seg_id` | stringa | Identificativo unico, es. `"seg_000123"` |
| `u`, `v` | intero | Nodi OSM di inizio e fine (servono al simulatore per riconoscere il tratto) |
| `nome` | stringa | Nome della via da OSM, `""` se manca |
| `lunghezza_m` | numero | Lunghezza del tratto in metri |
| `larghezza_m` | numero | Larghezza stimata (da OSM `width` o da tipo di strada) |
| `altezza_edifici_m` | numero | Altezza mediana degli edifici che si affacciano (entro 25 m): OSM, poi Copernicus da satellite, poi 15 m di riserva |
| `distanza_facciate_m` | numero | Distanza mediana tra le facciate dei due lati, misurata sulle piante degli edifici OSM (massimo 40 m per lato: oltre, il lato è aperto) |
| `rapporto_canyon` | numero | `altezza_edifici_m / distanza_facciate_m`. Sopra 1,5 il GPS peggiora |
| `direzione_gradi` | numero | Orientamento del tratto, 0 = nord, 90 = est (serve per l'abbagliamento) |
| `attraversamenti` | intero | Strisce pedonali e semafori pedonali sul tratto |
| `densita_negozi` | numero | Negozi e locali entro 50 m, per 100 m di strada (indicatore di doppia fila) |
| `scuola_vicina` | booleano | C'è una scuola entro 100 m |
| `sottopasso` | booleano | Il tratto è un sottopasso (OSM `tunnel=yes`) o un punto basso che si allaga. Gli archi sotto i palazzi (`building_passage`) non contano |
| `fonte_dati` | stringa | Da dove vengono i valori, es. `"osm+copernicus"` |

## 2. `data/processed/rischio.csv.gz`

Rischio di intervento per ogni tratto e ogni fascia di 5 minuti del giorno dello scenario.

| Colonna | Significato |
|---|---|
| `seg_id` | Come in `tratti.geojson` |
| `fascia` | Inizio della fascia, `"16:30"` |
| `p_intervento` | Probabilità che un veicolo che percorre il tratto in quella fascia chieda aiuto |
| `c_attraversamenti`, `c_doppia_fila`, `c_scuola`, `c_meteo`, `c_abbagliamento`, `c_sottopasso`, `c_gps` | Contributo di ogni fattore (servono per spiegare l'avviso in console) |

Esempio:
```csv
seg_id,fascia,p_intervento,c_attraversamenti,c_doppia_fila,c_scuola,c_meteo,c_abbagliamento,c_sottopasso,c_gps
seg_000123,16:30,0.061,0.010,0.020,0.030,0.0,0.0,0.0,0.001
```

Come si combina: vedi `config/pesi_rischio.yaml` e `docs/ipotesi.md`.

## 3. `data/processed/meteo.csv`

Meteo orario del giorno scelto, da Open-Meteo.

| Colonna | Significato |
|---|---|
| `ora` | `"16:00"` |
| `pioggia_mm` | Pioggia nell'ora, millimetri |
| `visibilita_m` | Visibilità, metri (se disponibile) |
| `nuvolosita_pct` | Copertura nuvolosa, percentuale |

## 4. `sim/out/giri.json`

I giri simulati di tutte le flotte. Lista, un elemento per giro di un veicolo; i tempi sono secondi dalla mezzanotte.

```json
[
  {
    "veicolo_id": "boxi_01",
    "flotta": "boxi",
    "partenza": "08:31:21",
    "fermate": [[30795, 41.905107, 12.462096]],
    "percorso": [[30681, 338, 1, 22.2], [30703, 335, 1, 22.0]]
  }
]
```

- `flotta` è una delle chiavi di `flotte` in `config/scenario.yaml` (`boxi`, `corriere_a`, `corriere_b`, `navette`).
- `fermate`: `[secondo, lat, lon]` di ogni consegna o fermata di linea.
- `percorso`: un elemento per tratto percorso, `[secondo di ingresso, numero del tratto, verso, durata in secondi]`. Il numero del tratto è quello di `seg_id` (`338` → `"seg_000338"`); `verso` è `1` da `u` a `v`, `-1` al contrario.

## 5. `console/data/scenario/*.json` (Oliver)

Quello che l'app legge (tramite `server/`). `console/data/esempio/` ha i dati finti della vecchia console statica, con il formato precedente.

`carico.json`: minuto per minuto, richieste attese, operatori necessari (Erlang C), operatori in turno secondo il piano e veicoli in servizio, senza e con sistema. `senza` ha anche `operatori_sul_picco`, il personale del picco tenuto tutto il giorno.
```json
{
  "passo_min": 1,
  "orari": ["06:00", "06:01"],
  "senza": {"richieste_attese": [0.2, 0.3], "operatori_necessari": [1, 1], "operatori_in_turno": [10, 10], "operatori_sul_picco": [16, 16], "veicoli_attivi": [11, 12]},
  "con":   {"richieste_attese": [0.2, 0.2], "operatori_necessari": [1, 1], "operatori_in_turno": [3, 3], "veicoli_attivi": [11, 11]}
}
```

`rigioco.json`: le richieste di aiuto della giornata, in ordine di ora, senza e con sistema. `seg_id` è il tratto dove il veicolo si ferma, `attesa_s` quanto aspetta un operatore, `durata_s` quanto dura l'intervento, `operatore` chi lo prende (da 0).
```json
{
  "senza": [{"ora": "16:27:10", "veicolo_id": "boxi_07", "seg_id": "seg_000456", "tipo": "richiesta", "attesa_s": 140, "durata_s": 33, "operatore": 2}],
  "con":   [{"ora": "16:27:10", "veicolo_id": "boxi_07", "seg_id": "seg_000456", "tipo": "richiesta", "attesa_s": 0, "durata_s": 33, "operatore": 1}]
}
```

`registro_interventi.csv`: il registro della giornata con sistema, una riga per intervento: `ora`, `gestore` (nome della flotta), `veicolo`, `via`, `motivo_previsto` e `probabilita_prevista` (il fattore principale e la probabilità del tratto secondo la mappa del rischio), `attesa_s`, `durata_s`, `operatore` (da 1).

`kpi.json`: i numeri finali.
```json
{
  "senza": {"picco_richieste_insieme": 4, "attesa_media_s": 95, "veicoli_fermi_oltre_60s": 7, "veicoli_per_operatore": 4},
  "con":   {"picco_richieste_insieme": 2, "attesa_media_s": 14, "veicoli_fermi_oltre_60s": 0, "veicoli_per_operatore": 10},
  "spostamenti_min": {"boxi_01": 6, "boxi_02": -4}
}
```
Ogni blocco `senza`/`con` contiene anche `richieste`, `attesa_max_s`, `operatori_medi`, `operatori_necessari_al_picco`. `veicoli_fermi_oltre_60s` conta le **richieste** (blocchi) che hanno aspettato più di 60 s, non i veicoli distinti.

`parita_servizio` confronta i piani **a parità di livello di servizio** (è il numero del pitch): `senza` tiene in turno tutto il giorno gli operatori necessari al picco non previsto; `senza_turni` copre ogni turno fisso per il suo picco; `solo_turni` è il piano normale dalla previsione, senza sfasare le partenze; `con` è il piano prudente con le partenze sfasate. Ogni blocco ha `operatori_medi`, `ore_operatore`, `ore_veicolo`, `veicoli_per_operatore`, `attesa_media_s`, `entro_attesa_max_pct`, `ora_peggiore_entro_attesa_max_pct` e, se c'è `config/economia.yaml`, `costo_veicolo_mese` e `margine_pct`. I blocchi `senza`/`con` in cima restano il rigioco con `operatori_senza_sistema` fissi.

`orario`: una riga per ora con veicoli in servizio, operatori (`operatori_senza`, `operatori_turni`, `operatori_con`) e veicoli per operatore. `per_flotta`: per ogni flotta veicoli, ore di servizio, richieste per veicolo, quota di tempo in assistenza, ore operatore attribuite (in proporzione al lavoro dato agli operatori), veicoli per operatore, costo per veicolo al mese e per ora di servizio, e il dettaglio ora per ora. `economia`: paese, costo orario di una postazione e canone mensile usati per i costi.

`rischio_console.json`: il rischio di ogni tratto per fascia, per colorare le strade, e la data dello scenario (`data`). `p_millesimi` è `p_intervento × 1000` arrotondato (per tenere il file piccolo); `pioggia_mm` è la pioggia dell'ora di ogni fascia, `null` se manca `meteo.csv`.
```json
{"data": "2024-10-03", "fasce": ["14:00", "14:05"], "pioggia_mm": [2.5, 2.5], "p_millesimi": {"seg_000123": [18, 18]}}
```

`sensibilita.json` (facoltativo, da `tools/sensibilita.py`): una riga per variante (`parametro`, `gruppo`, `fattore`, `richieste`, `risparmio_ore_pct`, `veicoli_per_operatore_senza`/`_con`, `fermi_oltre_60s_senza`/`_con`, `richieste_da_rosso_pct`) e `intervalli` con minimo e massimo di ogni numero su tutte le varianti.

`attenzione.json`: la griglia dell'attenzione (scenario con sistema). `livelli` dà per ogni veicolo una stringa con un carattere per minuto a partire da `inizio`: `-` fermo al deposito, `0` verde (autonomo), `1` giallo (in osservazione), `2` rosso (intervento probabile). `dettagli` ha una voce per minuto con i 12 veicoli più a rischio, ognuno `[veicolo_id, livello, P, via, motivo, tra_s]`: `P` è la probabilità di almeno una richiesta nei prossimi `orizzonte_min` minuti, `via` e `motivo` il tratto più rischioso davanti e il suo fattore principale, `tra_s` i secondi che mancano a quel tratto. `validazione` dice quanto tempo passano i veicoli in ogni livello e da quale livello arrivano le richieste.
```json
{"passo_s": 60, "inizio": "06:00", "soglie": {"osservazione": 0.25, "intervento": 0.45, "orizzonte_min": 3},
 "validazione": {"tempo_pct": {"verde": 66, "giallo": 27, "rosso": 7}, "richieste_da_pct": {"verde": 39, "giallo": 39, "rosso": 22}, "rosso_su_verde": 5.2, "anticipo_s": 120},
 "livelli": {"boxi_01": "---0001121"},
 "dettagli": [[["boxi_33", 2, 0.742, "Corso Vittorio Emanuele Secondo", "attraversamenti pedonali + pioggia", 58]]]}
```

`veicoli.json`: i percorsi per animare i veicoli (scenario con sistema, partenze già sfasate). `t0` è il secondo della giornata del primo punto; i punti `[lat, lon]` sono uno ogni `passo_s` secondi. `spostamenti_s` dice di quanto è stata spostata la partenza di ogni veicolo.
```json
{"passo_s": 30,
 "flotte": {"boxi": {"nome": "Poste · BOXi", "veicoli": 50}},
 "spostamenti_s": {"boxi_01": 540},
 "veicoli": [{"veicolo_id": "boxi_01", "flotta": "boxi", "t0": 30660, "punti": [[41.90731, 12.46538]]}]}
```

`edifici.geojson` (da `data/scripts/07_edifici_console.py`): pianta semplificata degli edifici con l'altezza `h` in metri, per la mappa 3D. Altezza da OSM, poi da Copernicus, poi 15 m di riserva.
```json
{"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"h": 18.5}, "geometry": {"type": "Polygon", "coordinates": [[[12.4612, 41.9071]]]}}]}
```

`piani.json` (da `tools/prova_pianificazione.py`, qualche minuto): i tre piani dei turni (turni fissi, piano normale, piano prudente) fatti sulla previsione e verificati sulla giornata vera, in tre casi: temporale come previsto, un'ora prima del previsto, un'ora dopo. Per ogni piano: ore pagate, costo per veicolo al mese, quota di richieste entro 20 s sulla giornata e nell'ora peggiore, e ora per ora gli operatori in turno (`operatori`, massimo dell'ora) e la quota entro 20 s (`entro_pct`, `null` se nell'ora ci sono meno di 20 richieste).
```json
{"attesa_max_s": 20, "livello_servizio_pct": 90, "ore": ["06:00", "07:00"],
 "casi": [{"chiave": "prima", "nome": "Il temporale arriva un'ora prima del previsto",
           "piani": {"normale": {"ore_pagate": 110.0, "costo_veicolo_mese": 797, "entro_pct": 82, "ora_peggiore_pct": 34,
                                 "operatori": [3, 4], "entro_pct_ora": [100, null]}}}]}
```
Le chiavi dei casi sono `previsto`, `prima` e `dopo`; quelle dei piani `fissi`, `normale` e `prudente`.

`tratti.geojson`: copia di `data/processed/tratti.geojson` ridotta ai campi `seg_id` e `nome` (serve per disegnare le strade senza bisogno di internet).
