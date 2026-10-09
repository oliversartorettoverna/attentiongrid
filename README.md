# AttentionGrid

Progetto per il **Safe Mobility Hack** (Spazio Attivo Roma Casilina, 10–12 ottobre 2026), sfida **Poste Italiane**: supervisione 1:n di veicoli autonomi per le consegne.

**In una frase:** prevediamo quando e dove i veicoli autonomi avranno bisogno di un operatore umano, così un operatore può seguire più veicoli (anche di flotte diverse) senza andare in crisi nei picchi.

Il contesto completo (idea, prove, business model, piano, ruoli) è nel [Drive del team](https://drive.google.com/drive/folders/1lWvYd15RG1fwRSr5Oq9S2nl_DtjBNuxm), documento [**00 LEGGIMI – Contesto progetto**](https://docs.google.com/document/d/1HsAE_9wqXLRBD0W4tp1wM5lBaq8Z3Ve9ndZwquYFRvg/edit). Le indicazioni per ogni persona sono nella cartella [**01 Indicazioni**](https://drive.google.com/drive/folders/1utUxprX7MMMd6rIOk_PhJcy3-JlSrJ9k). Se lavori con Claude o un'altra AI, le regole per lei sono in [`CLAUDE.md`](CLAUDE.md).

## Cosa mostra la demo

Roma, Prati e Trastevere, giovedì 3 ottobre 2024: una giornata vera con temporale nel pomeriggio e uscita delle scuole. Una centrale condivisa segue 150 veicoli autonomi di 4 flotte: 50 BOXi di Poste, 70 furgoni di due corrieri e 30 navette di linea.

- **Console operatore:** mappa 3D con le strade colorate dal rischio, veicoli colorati dall'Autonomy Confidence Score, coda delle richieste con il timer dei 20 secondi, veicoli da tenere d'occhio con via e motivo.
- **Planner turni:** turni fissi, piano normale e piano prudente a confronto, anche con il temporale che arriva un'ora prima o dopo il previsto.
- **Registro e report:** ogni intervento tracciato ed esportabile.
- **Dashboard flotta:** la vista del cliente (Poste vede solo i BOXi), con il costo contro l'1:1.
- **Configurazione:** flotte, soglie dello score, livello di servizio.

## Come funziona (pipeline)

```
data/scripts  →  data/processed  →  sim  →  engine  →  console
(dati aperti)    (mappa rischio)    (giri)  (previsione,   (demo web)
                                            turni,
                                            ottimizzazione)
```

| Cartella | Cosa fa |
|---|---|
| `config/` | Area, orari, flotte e parametri dello scenario. **Tutti i numeri modificabili stanno qui.** |
| `data/scripts/` | Scarica e prepara i dati aperti (OSM, altezza edifici, meteo) e calcola la mappa del rischio |
| `data/processed/` | Output piccoli della pipeline dati (versionati) |
| `sim/` | Simula i giri di consegna dei veicoli sulle strade vere |
| `engine/` | Previsione degli interventi, calcolo turni (Erlang C), sfasamento partenze, griglia dell'attenzione, rigioco dello scenario con e senza sistema |
| `web/` | L'app: console operatore, planner turni, registro, dashboard flotta, configurazione |
| `server/` | Server locale (FastAPI): dà all'app i dati dello scenario e, compilata, l'app stessa |
| `console/` | Dati dello scenario per l'app (`console/data/`) e la vecchia console statica |
| `tools/` | Dati di esempio e analisi di sensibilità |
| `docs/` | Architettura, formati dei file, ipotesi e parametri |

Tutta la parte tecnica (dati, simulazione, motore, console) è seguita da Oliver. Riccio fa il rilievo in strada che serve a tarare la mappa del rischio.

I formati dei file tra un modulo e l'altro sono fissati in [`docs/formati-dati.md`](docs/formati-dati.md): chi lavora su un pezzo può andare avanti anche se il pezzo prima non è pronto, usando i file di esempio in `console/data/esempio/`.

## Installazione

Serve Python 3.11.

```bash
git clone https://github.com/osartorettoverna-hue/attentiongrid.git
cd attentiongrid
python -m venv .venv
source .venv/bin/activate          # su Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Comandi

```bash
# 1. Dati
python data/scripts/01_scarica_osm.py        # strade, edifici, punti di interesse dell'area
python data/scripts/02_costruisci_tratti.py  # tratti di strada con altezza edifici, attraversamenti, negozi, scuole
python data/scripts/03_meteo.py              # meteo orario del giorno scelto (Open-Meteo)
python data/scripts/05_altezze_copernicus.py # facoltativo, prima di 02: altezza edifici da satellite (serve una chiave Copernicus)
python data/scripts/06_scuole_ministero.py   # facoltativo, prima di 02: scuole dall'anagrafe del Ministero
python data/scripts/04_mappa_rischio.py      # rischio per tratto di strada e fascia oraria
python tools/taratura.py                     # controlla il peso degli attraversamenti sul dato di Cruise

# 2. Simulazione
python sim/simula_flotta.py                   # giri di consegna dei veicoli

# 3. Motore
python engine/pipeline.py                     # previsione, turni, ottimizzazione, rigioco → console/data/scenario/

# Facoltativo: sensibilità dei risultati ai pesi (qualche minuto) → console/data/scenario/sensibilita.json
python tools/sensibilita.py

python data/scripts/07_edifici_console.py     # edifici con altezza per la mappa 3D → console/data/scenario/edifici.geojson

# 4. App (serve anche Node.js 20 o più recente)
npm --prefix web install
npm --prefix web run build
.venv/bin/uvicorn server.main:app --port 8001
# poi apri http://localhost:8001 · tasti: spazio avvia/ferma · ← → ±10 min
# in sviluppo: server come sopra e, in un altro terminale, npm --prefix web run dev → http://localhost:5173

# Riserva: la vecchia console statica
python -m http.server 8000 --directory console
```

Per lavorare sulla console senza aspettare dati e simulazione: `python tools/genera_esempio.py` rigenera i file finti in `console/data/esempio/`.

## Regole di lavoro

- Un ramo per persona o per funzione (`oliver/dati`, `oliver/console`), poi pull request su `main`. Chi apre la PR scrive in due righe cosa cambia.
- **Dati grezzi fuori dal repo.** `data/raw/` resta in locale (e una copia zip nel Drive, cartella "03 Dati").
- **Output piccoli dentro il repo:** `data/processed/`, `sim/out/giri.json` e `console/data/scenario/` si committano (se sotto 20 MB l'uno), così chiunque apre la demo senza rigenerare niente.
- Se cambi un formato di file, aggiorna prima `docs/formati-dati.md` e avvisa nel gruppo.
- Ogni numero inventato o stimato va in `config/` e in `docs/ipotesi.md`, con scritto se è validato o no.

## Cosa c'è

| Pezzo | Risultato |
|---|---|
| Dati OSM (`01`) | 960 incroci, 1.772 tratti, 5.598 edifici, 1.547 attraversamenti |
| Meteo (`03`) | giovedì 3 ottobre 2024, pioggia forte 16–18 |
| Tratti (`02`) | 1.769 tratti, canyon misurato tra le facciate, altezze da satellite (Copernicus), scuole dal Ministero, 9 sottovia |
| Mappa del rischio (`04`) | pesi tarati su Cruise, sul rilievo in strada e sulla letteratura; picco 16:00–17:30 |
| Rilievo in strada (`data/rilievo/`) | 8 vie di Prati e Trastevere: doppia fila, pedoni, scuole |
| Simulatore (`sim/`) | 150 veicoli di 4 flotte su una giornata intera (06–24): 50 BOXi, 40 + 30 furgoni, 30 navette |
| Motore (`engine/`) | piano prudente: −59% ore operatore rispetto a tenere tutto il giorno il personale del picco (117 contro 288), da 3,6 a 8,9 veicoli per operatore, 98% delle richieste entro 20 s |
| Robustezza del piano (`tools/prova_pianificazione.py`) | con il temporale un'ora prima o dopo il previsto il piano prudente tiene il 94% entro 20 s nell'ora peggiore; il piano normale scende al 34% e al 3% |
| Griglia dell'attenzione (`engine/attenzione.py`) | il critico anticipa il 22% delle richieste e il giallo un altro 39%, due minuti prima; i veicoli sono in critico il 7% del tempo |
| Sensibilità (`tools/sensibilita.py`) | sullo scenario a 12 BOXi: risparmio tra 49% e 59% con pesi a ±50% |
| Edifici 3D (`07`) | 5.598 edifici con altezza: 89% da satellite, 8% da OSM, 2% di riserva |
| App (`web/`, `server/`) | cinque schermate sui dati del motore, mappa 3D che funziona senza internet |
