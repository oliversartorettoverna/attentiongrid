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
| `server/` | Server locale (FastAPI): dati dello scenario, giornata in diretta, registro degli interventi (locale e Supabase), l'app compilata |
| `console/` | Dati dello scenario per l'app (`console/data/`) e la vecchia console statica |
| `tools/` | Verifica dei piani, analisi di sensibilità, taratura, dati di esempio della vecchia console |
| `docs/` | Architettura, formati dei file, ipotesi e parametri |

Tutta la parte tecnica (dati, simulazione, motore, console) è seguita da Oliver. Riccio fa il rilievo in strada che serve a tarare la mappa del rischio.

I formati dei file tra un modulo e l'altro sono fissati in [`docs/formati-dati.md`](docs/formati-dati.md): chi lavora su un pezzo può andare avanti anche se il pezzo prima non è pronto.

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
python engine/pipeline.py                     # previsione, turni, ottimizzazione, rigioco → console/data/scenario/ (--flotte boxi per una sola flotta)
python engine/pipeline.py --previsione-ore 1 --out console/data/scenario_temporale_prima   # la giornata con il temporale un'ora prima del previsto (tasto T nella console)
python tools/prova_pianificazione.py          # i tre piani con il temporale come previsto, un'ora prima e dopo (2 minuti) → piani.json
python tools/soglie.py                        # confronta le soglie della griglia dell'attenzione (pochi secondi)
python data/scripts/07_edifici_console.py     # edifici con altezza per la mappa 3D → console/data/scenario/edifici.geojson
python data/scripts/08_area_sede.py           # strade ed edifici attorno alla sede, per il BOXi in sala → console/data/sede/

# Facoltativo: sensibilità dei risultati ai pesi (circa un'ora, tenere il portatile acceso) → sensibilita.json
python tools/sensibilita.py

# 4. App (serve anche Node.js 20 o più recente)
# per salvare gli interventi su Supabase: crea il file .env alla radice (fuori da git) con
#   SUPABASE_URL=https://<progetto>.supabase.co
#   SUPABASE_CHIAVE=<chiave pubblicabile, dalla dashboard di Supabase>
#   ANTHROPIC_API_KEY=<chiave Anthropic, per il copilota AI>
# senza .env il registro resta solo in locale e il copilota usa il ripiego
npm --prefix web install
npm --prefix web run build
.venv/bin/uvicorn server.main:app --port 8001
# poi apri http://localhost:8001 · tasti: spazio avvia/ferma · ← → ±10 min · T temporale un'ora prima del previsto
#   B vola sul BOXi in sala · Maiusc+G / Maiusc+O / Maiusc+N paracadute: GPS debole, offline, normale
# BOXi in sala: con il server acceso, sul Mac di Oliver Tailscale Funnel pubblica solo la pagina del telefono:
#   tailscale funnel --bg --set-path=/telefono http://127.0.0.1:8001/telefono
#   il telefono (dati mobili) apre https://macbook-air-di-oliver.tailff0477.ts.net/telefono/ e preme "Avvia il BOXi"
#   console, diretta e copilota restano solo sul laptop; per spegnere: tailscale funnel --https=443 off
# in sviluppo: server come sopra e, in un altro terminale, npm --prefix web run dev → http://localhost:5173

# Riserva: la vecchia console statica
python -m http.server 8000 --directory console
```

Per la vecchia console statica: `python tools/genera_esempio.py` rigenera i file finti in `console/data/esempio/` (formato precedente).

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
| Griglia dell'attenzione (`engine/attenzione.py`, soglie con `tools/soglie.py`) | l'86% delle richieste arriva da un veicolo che due minuti prima era giallo o rosso (36% rosso); i veicoli sono rossi il 15% del tempo e un rosso chiede aiuto 6,5 volte più di un verde |
| Sensibilità (`tools/sensibilita.py`) | con il piano prudente vero: risparmio di ore 59% nel caso di riferimento, tra 56% e 65% con un peso alla volta a ±50%, tra 49% e 67% con tutti i pesi insieme, tra 58% e 62% con durata degli interventi e attesa massima a ±50% |
| GPS in diretta | precisione stimata per strada dal canyon urbano: il 10% delle strade e i 9 sottopassi mettono il veicolo in modalità degradata, con cerchio di incertezza e score più basso |
| Edifici 3D (`07`) | 5.598 edifici con altezza: 89% da satellite, 8% da OSM, 2% di riserva |
| App (`web/`, `server/`) | cinque schermate sui dati del motore, mappa 3D che funziona senza internet |
