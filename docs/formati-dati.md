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

`attenzione.json`: la griglia dell'attenzione (scenario con sistema). `livelli` dà per ogni veicolo una stringa con un carattere per minuto a partire da `inizio`: `-` fermo al deposito, `0` verde (autonomo), `1` giallo (in osservazione), `2` rosso (intervento probabile). `p` dà per ogni veicolo la probabilità minuto per minuto in percento, due cifre per minuto (`"07"` = 7%, `"99"` = 99% o più, `"--"` fermo): l'Autonomy Confidence Score è 100 meno questo numero. `dettagli` ha una voce per minuto con i 12 veicoli più a rischio, ognuno `[veicolo_id, livello, P, via, motivo, tra_s]`: `P` è la probabilità di almeno una richiesta nei prossimi `orizzonte_min` minuti, `via` e `motivo` il tratto più rischioso davanti e il suo fattore principale, `tra_s` i secondi che mancano a quel tratto. `validazione` dice quanto tempo passano i veicoli in ogni livello e da quale livello arrivano le richieste. `gps` riporta i parametri di `config/scenario.yaml` → `gps`: l'app considera degradato il GPS di un veicolo sopra `degradato_da_m` e aggiunge `contributo_degradato` (o `contributo_assente` nei sottopassi) alla sua probabilità, come una causa in più.
```json
{"passo_s": 60, "inizio": "06:00", "soglie": {"osservazione": 0.25, "intervento": 0.45, "orizzonte_min": 3},
 "validazione": {"tempo_pct": {"verde": 66, "giallo": 27, "rosso": 7}, "richieste_da_pct": {"verde": 39, "giallo": 39, "rosso": 22}, "rosso_su_verde": 5.2, "anticipo_s": 120},
 "livelli": {"boxi_01": "---0001121"},
 "p": {"boxi_01": "------0712182631454951"},
 "dettagli": [[["boxi_33", 2, 0.742, "Corso Vittorio Emanuele Secondo", "attraversamenti pedonali + pioggia", 58]]]}
```

`veicoli.json`: i percorsi per animare i veicoli, **senza** lo sfasamento delle partenze. `t0` è il secondo della giornata del primo punto; i punti `[lat, lon]` sono uno ogni `passo_s` secondi. `passate` elenca i tratti percorsi, piatti: secondi dopo `t0` e numero del tratto, alternati (`[0, 338, 22, 335]` = tratto 338 a `t0`, tratto 335 22 s dopo). `spostamenti_s` dice di quanto è stata spostata la partenza di ogni veicolo nello scenario con sistema: per allinearsi a livelli e richieste, ogni ora del veicolo va spostata di questo valore.
```json
{"passo_s": 30,
 "flotte": {"boxi": {"nome": "Poste · BOXi", "veicoli": 50}},
 "spostamenti_s": {"boxi_01": 540},
 "veicoli": [{"veicolo_id": "boxi_01", "flotta": "boxi", "t0": 30660, "punti": [[41.90731, 12.46538]], "passate": [21, 338, 43, 335]}]}
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

`tratti.geojson`: copia di `data/processed/tratti.geojson` ridotta ai campi `seg_id` e `nome` (serve per disegnare le strade senza bisogno di internet), più `gps_m`, la precisione del GPS stimata sul tratto in metri (dal rapporto canyon, parametri in `config/scenario.yaml` → `gps`), e `senza_gps: true` nei sottopassi, dove il segnale si perde (`gps_m` è `null`).

## 6. Diretta: WebSocket `/api/diretta` (`server/diretta.py`)

Il server tiene l'orologio della giornata e le richieste aperte e li manda a tutte le schermate collegate, ogni 0,25 s e subito dopo ogni comando.

Dal server all'app:
```json
{"t": 58232.5, "velocita": 30, "in_corsa": true,
 "temporale": "previsto", "scenario": "scenario", "temporali": ["previsto", "prima"],
 "cause": ["Pedoni in attraversamento", "Doppia fila o ostacolo", "Altro"],
 "chiusi": [{"id": 2507, "veicolo_id": "navette_110", "seg_id": "seg_000513", "via": "Via Cola di Rienzo", "chiamata": 58977.0,
             "attesa_s": 4, "durata_s": 120, "azione": "assistenza", "causa": "Doppia fila o ostacolo",
             "motivo_previsto": "attraversamenti pedonali", "operatore": "tu"}],
 "ritardi": {"boxi_07": 412.0},
 "richieste": [{"id": 1834, "veicolo_id": "boxi_07", "seg_id": "seg_000456", "inizio": 58210.0,
                "inizio_piano": 57798, "attesa_s": 60, "durata_s": 33, "operatore": 2, "assegnata": true,
                "via": "Via della Scala", "motivo_previsto": "uscita scuola + pioggia", "stato": "in_attesa"}]}
```
- `t`: secondo della giornata; l'app lo fa avanzare da sola tra un messaggio e l'altro con `velocita` se `in_corsa`.
- `temporale`: quale giornata vera si sta giocando, `previsto` o `prima` (il temporale arriva un'ora prima di quanto previsto la sera prima); `scenario` è la cartella dei suoi dati in `console/data/`, che l'app ricarica quando cambia; `temporali` le giornate disponibili.
- `ritardi`: secondi persi da ogni veicolo, fermo ad aspettare o durante gli interventi. L'app legge posizione, livello e probabilità del veicolo all'ora `t − ritardo`.
- `richieste`: quelle aperte. `inizio` è quando il veicolo ha chiamato (l'ora del piano `inizio_piano` più il ritardo accumulato fino a lì); `stato` è `in_attesa` finché un operatore non la prende, poi `in_gestione`; `assistenza` e `arresto` sono richieste chiuse dall'operatore in console con quell'azione, con il veicolo ancora fermo fino a `riparte` (secondo della giornata). Una richiesta passata a un collega la prende un operatore simulato da quel momento, con la durata del rigioco. `operatore` è il numero dell'operatore simulato (da 0) oppure `"tu"`; `assegnata` dice se il motore l'ha assegnata alla postazione della console: allora aspetta l'operatore fino a `passa_a_collega_dopo_s` (è il valore di `attesa_s`). `via` e `motivo_previsto` vengono dal registro del motore. Il veicolo resta fermo per `attesa_s + durata_s`, o finché l'operatore in console non chiude.
- `dal_vivo`: il BOXi in sala, `null` finché il telefono non si collega (sezione 9).
- `registro`: `{"salvati": 4, "su_supabase": 4, "collegato": true, "errore": ""}`, lo stato del registro (sezione 7).
- `cause`: le cause tra cui scegliere alla chiusura (`config/scenario.yaml`, `console.cause`). `chiusi`: gli ultimi 50 interventi chiusi dall'operatore in console nella giornata in corso, con azione e causa confermata.

Dall'app al server: `{"comando": "avvia", "valore": true}` (in corsa o in pausa), `{"comando": "velocita", "valore": 30}` (1, 10, 30 o 60), `{"comando": "vai", "valore": 58200}` (salta a quell'ora), `{"comando": "temporale", "valore": "prima"}` (cambia giornata senza fermare l'orologio), `{"comando": "prendi", "id": 1834}` (l'operatore in console prende una richiesta in attesa), `{"comando": "chiudi", "id": 1834, "azione": "riparte", "causa": "Pedoni in attraversamento", "nota": "..."}` (azione tra `riparte`, `deviato`, `assistenza`, `arresto`), `{"comando": "rilascia", "id": 1834}` (passa a un collega), `{"comando": "paracadute", "valore": "gps"}` (forza GPS debole sul BOXi in sala; `"offline"` lo forza offline, `"normale"` toglie il paracadute).

La cartella `console/data/scenario_temporale_prima/` ha gli stessi file di `scenario/` (tranne `edifici.geojson`, `piani.json`, `sensibilita.json`) e si fa con `python engine/pipeline.py --previsione-ore 1 --out console/data/scenario_temporale_prima`: il piano dei turni e lo sfasamento delle partenze sono fatti su una previsione con il temporale un'ora più tardi, la giornata vera è quella del 3 ottobre 2024.

## 7. Registro degli interventi confermati (`server/registro.py`, Supabase)

Ogni intervento chiuso dall'operatore in console si scrive subito in `server/registro_locale.jsonl` (una riga JSON per intervento, fuori da git) e poi nella tabella `interventi` di Supabase; se la rete manca il server riprova ogni 5 secondi. `GET /api/interventi?giornata=previsto` restituisce quelli della giornata dal file locale.

Tabella `interventi` (Supabase, progetto AttentionGrid; stessi campi nel file locale):

| Campo | Significato |
|---|---|
| `codice` | Identificativo univoco generato dal server (un reinvio non crea doppioni) |
| `giornata`, `data` | `previsto` o `prima`, e il giorno dello scenario |
| `richiesta_id` | Posizione della richiesta in `rigioco.json` (e in `registro_interventi.csv`) |
| `veicolo_id`, `flotta_id`, `via`, `seg_id` | Chi e dove; `flotta_id` rimanda alla tabella `flotte` |
| `chiamata_s` | Secondo della giornata in cui il veicolo ha chiamato (ora del piano più il ritardo) |
| `attesa_s`, `durata_s` | Quanto ha aspettato prima che l'operatore la prendesse, quanto è durato l'intervento |
| `azione` | `riparte`, `deviato`, `assistenza`, `arresto` |
| `causa`, `motivo_previsto` | La causa confermata dall'operatore e quella che il motore si aspettava |
| `nota` | La nota per il registro: la scrive il copilota, l'operatore la conferma o la corregge |
| `operatore`, `registrato_il` | Chi l'ha chiuso e quando è stato salvato |

Tabella `flotte`: `id`, `nome`, `veicoli`. Accesso con la chiave pubblicabile: lettura di entrambe, aggiunta di interventi; niente modifiche né cancellazioni.

## 8. Copilota: `POST /api/copilota/{richiesta_id}` (`server/copilota.py`)

L'app manda `{"score": 58, "pioggia_mm": 5.0}`; il server aggiunge veicolo, flotta, via, motivo previsto, ora, attesa e lo storico della via nella giornata (richieste precedenti, cause confermate) e chiede a Claude. Risposta:
```json
{"situazione": "NV-201 fermo in Lungotevere in Sassia: ...", "azione": "riparte",
 "perche_azione": "...", "nota_registro": "...", "fonte": "claude", "modello": "claude-opus-5-5"}
```
`azione` è una di `riparte`, `deviato`, `assistenza`, `arresto`. `fonte` è `ripiego` quando manca la chiave, manca la rete o Claude non risponde entro `copilota.attesa_max_s`: allora il testo è costruito dai dati del motore. Un suggerimento per richiesta, tenuto in memoria. 404 se la richiesta non è più aperta.

## 9. BOXi in sala (`telefono/`, `server/dal_vivo.py`, Supabase)

Il telefono apre `/telefono/` (in https) e ogni secondo scrive la sua posizione nella tabella `posizioni_live` di Supabase, una sola riga:

| Campo | Significato |
|---|---|
| `veicolo` | Sempre `boxi_sala` (la chiave pubblicabile può scrivere solo questa riga) |
| `lat`, `lon`, `precisione_m` | Posizione e precisione del GPS dal browser; senza fix nuovi da 4 s (al chiuso) la precisione si dichiara almeno 100 m |
| `aggiornato_il` | Ora del telefono dell'ultimo invio |

Il server la legge ogni secondo e la mette nel messaggio della diretta come `dal_vivo`:
```json
{"id": "boxi_sala", "lat": 41.89035, "lon": 12.5177, "precisione_m": 40.0, "ultimo_segnale_s": 0.7,
 "stato": "critico", "p": 0.43, "paracadute": null}
```
`stato` è `nominale`, `attenzione` (da `dal_vivo.attenzione_da_m`), `critico` (da `dal_vivo.critico_da_m`) o `offline` (nessun segnale per `dal_vivo.offline_dopo_s`). Da critico o offline il server apre una richiesta con `veicolo_id: "boxi_sala"`, `assegnata: true` e `id` sopra 1.000.000, che si prende e si chiude come le altre. `/telefono/config.js` dà alla pagina indirizzo e chiave pubblicabile di Supabase dal file `.env`.

`console/data/sede/strade.geojson` e `edifici.geojson` (da `data/scripts/08_area_sede.py`): strade e edifici con altezza `h` attorno alla sede dell'hackathon, per mostrare il BOXi in sala sulla mappa.

