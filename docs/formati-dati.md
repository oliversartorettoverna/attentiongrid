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
| `altezza_edifici_m` | numero | Altezza mediana degli edifici che si affacciano (entro 25 m) |
| `distanza_facciate_m` | numero | Distanza mediana tra le facciate dei due lati, misurata sulle piante degli edifici OSM (massimo 40 m per lato: oltre, il lato è aperto) |
| `rapporto_canyon` | numero | `altezza_edifici_m / distanza_facciate_m`. Sopra 1,5 il GPS peggiora |
| `direzione_gradi` | numero | Orientamento del tratto, 0 = nord, 90 = est (serve per l'abbagliamento) |
| `attraversamenti` | intero | Strisce pedonali e semafori pedonali sul tratto |
| `densita_negozi` | numero | Negozi e locali entro 50 m, per 100 m di strada (indicatore di doppia fila) |
| `scuola_vicina` | booleano | C'è una scuola entro 100 m |
| `sottopasso` | booleano | Il tratto è un sottopasso (OSM `tunnel=yes`) o un punto basso che si allaga. Gli archi sotto i palazzi (`building_passage`) non contano |
| `fonte_dati` | stringa | Da dove vengono i valori, es. `"osm+eubucco"` |

## 2. `data/processed/rischio.csv`

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

I viaggi simulati. Lista di veicoli:

```json
[
  {
    "veicolo_id": "boxi_01",
    "flotta": "boxi",
    "partenza": "14:05:00",
    "fermate": [{"ora": "14:12:30", "lat": 41.9071, "lon": 12.4612}],
    "percorso": [
      {"ora": "14:05:00", "seg_id": "seg_000123", "lat": 41.9062, "lon": 12.4640},
      {"ora": "14:05:40", "seg_id": "seg_000124", "lat": 41.9066, "lon": 12.4631}
    ]
  }
]
```

- `flotta` è uno di `"boxi"`, `"navetta"`, `"robot"`.
- `percorso` ha un punto ogni volta che il veicolo entra in un tratto nuovo, più punti intermedi ogni 10 secondi (serve per animare).

## 5. `console/data/scenario/*.json` (Oliver)

Quello che la console legge. Stessa struttura in `console/data/esempio/` (dati finti).

`carico.json`: carico previsto dell'operatore nel tempo, con e senza sistema.
```json
{
  "passo_min": 1,
  "orari": ["14:00", "14:01"],
  "senza": {"richieste_attese": [0.2, 0.3], "operatori_necessari": [1, 1]},
  "con":   {"richieste_attese": [0.2, 0.2], "operatori_necessari": [1, 1]}
}
```

`avvisi.json`: gli avvisi in anticipo che l'operatore vede nella coda.
```json
[
  {"ora_avviso": "16:22", "ora_evento": "16:26", "veicolo_id": "boxi_07",
   "seg_id": "seg_000456", "nome_via": "Via della Scala",
   "p_intervento": 0.21, "motivi": ["uscita scuola", "pioggia forte", "strada stretta"]}
]
```

`rigioco.json`: gli eventi simulati per animare i due pannelli.
```json
{
  "senza": [{"ora": "16:27:10", "veicolo_id": "boxi_07", "tipo": "richiesta", "attesa_s": 140}],
  "con":   [{"ora": "16:27:10", "veicolo_id": "boxi_07", "tipo": "richiesta", "attesa_s": 12}]
}
```

`kpi.json`: i numeri finali.
```json
{
  "senza": {"picco_richieste_insieme": 4, "attesa_media_s": 95, "veicoli_fermi_oltre_60s": 7, "veicoli_per_operatore": 4},
  "con":   {"picco_richieste_insieme": 2, "attesa_media_s": 14, "veicoli_fermi_oltre_60s": 0, "veicoli_per_operatore": 10},
  "spostamenti_min": {"boxi_01": 6, "boxi_02": -4}
}
```
Ogni blocco `senza`/`con` contiene anche `richieste`, `attesa_max_s`, `operatori_medi`, `operatori_necessari_al_picco`.

`parita_servizio` confronta i due casi **a parità di livello di servizio** (è il numero del pitch): `senza` tiene in turno per tutto il pomeriggio gli operatori necessari al picco non previsto, `con` segue il piano di Erlang C sulla curva prevista e sfasata. Ogni blocco ha `operatori_medi`, `ore_operatore`, `veicoli_per_operatore`, `attesa_media_s`, `entro_attesa_max_pct`. I blocchi `senza`/`con` sopra restano il rigioco con `operatori_senza_sistema` fissi (quello animato nei pannelli).

`attenzione.json`: la griglia dell'attenzione (scenario con sistema). Per ogni veicolo un elenco con uno stato per minuto a partire da `inizio`: `[livello, P, via, motivo, tra_s]`, oppure `[-1]` se il veicolo è fermo al deposito. `livello` 0 verde (autonomo), 1 giallo (in osservazione), 2 rosso (intervento probabile); `P` è la probabilità di almeno una richiesta nei prossimi `orizzonte_min` minuti; `via` e `motivo` sono il tratto più rischioso davanti e il suo fattore principale; `tra_s` quanti secondi mancano a quel tratto. `validazione` dice quanto tempo passano i veicoli in ogni livello e da quale livello arrivano le richieste.
```json
{"passo_s": 60, "inizio": "14:00", "soglie": {"osservazione": 0.25, "intervento": 0.45, "orizzonte_min": 3},
 "validazione": {"tempo_pct": {"verde": 45, "giallo": 34, "rosso": 21}, "richieste_da_pct": {"verde": 19, "giallo": 28, "rosso": 52}, "rosso_su_verde": 5.9, "anticipo_s": 120},
 "veicoli": {"boxi_01": [[-1], [0, 0.12, "Via Crescenzio", "attraversamenti pedonali", 95], [2, 0.51, "Via Cola di Rienzo", "uscita scuola", 40]]}}
```

`veicoli.json`: i percorsi per animare i veicoli, senza e con lo sfasamento delle partenze. Ogni punto è `[ora, lat, lon]`.
```json
{"senza": [{"veicolo_id": "boxi_01", "flotta": "boxi", "percorso": [["14:00:30", 41.9062, 12.4640]]}],
 "con":   [{"veicolo_id": "boxi_01", "flotta": "boxi", "percorso": [["14:08:30", 41.9062, 12.4640]]}]}
```

`tratti.geojson`: copia di `data/processed/tratti.geojson` ridotta ai campi `seg_id` e `nome` (serve per disegnare le strade senza bisogno di internet).
