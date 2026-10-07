# AttentionGrid

Progetto per il **Safe Mobility Hack** (Spazio Attivo Roma Casilina, 10–12 ottobre 2026), sfida **Poste Italiane**: supervisione 1:n di veicoli autonomi per le consegne.

**In una frase:** prevediamo quando e dove i veicoli autonomi avranno bisogno di un operatore umano, così un operatore può seguire più veicoli (anche di flotte diverse) senza andare in crisi nei picchi.

Il contesto completo (idea, prove, business model, piano, ruoli) è nel [Drive del team](https://drive.google.com/drive/folders/1lWvYd15RG1fwRSr5Oq9S2nl_DtjBNuxm), documento [**00 LEGGIMI – Contesto progetto**](https://docs.google.com/document/d/1HsAE_9wqXLRBD0W4tp1wM5lBaq8Z3Ve9ndZwquYFRvg/edit). Le indicazioni per ogni persona sono nella cartella [**01 Indicazioni**](https://drive.google.com/drive/folders/1utUxprX7MMMd6rIOk_PhJcy3-JlSrJ9k). Se lavori con Claude o un'altra AI, le regole per lei sono in [`CLAUDE.md`](CLAUDE.md).

## Cosa mostra la demo

Roma, Prati e Trastevere, giovedì 3 ottobre 2024: un pomeriggio vero con temporale e uscita delle scuole. 12 BOXi (i veicoli autonomi di Poste) fanno consegne.

- **Pannello sinistro, senza previsione:** 3 operatori fissi; le richieste di aiuto arrivano tutte insieme, si forma una coda, i veicoli restano fermi.
- **Pannello destro, con AttentionGrid:** le strade si colorano con il rischio previsto, il picco è annunciato in anticipo, le partenze sono sfasate e gli operatori in turno seguono il piano.
- **Griglia dell'attenzione:** ogni veicolo verde, giallo o rosso secondo il rischio dei prossimi minuti, con via e motivo.
- **Risultato:** ore operatore e veicoli per operatore a parità di servizio, con l'intervallo di robustezza sui pesi.

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
| `console/` | Pagina web della demo: due mappe, griglia dell'attenzione, curva delle richieste, risultato |
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
python data/scripts/04_mappa_rischio.py      # rischio per tratto di strada e fascia oraria

# 2. Simulazione
python sim/simula_flotta.py                   # giri di consegna dei veicoli

# 3. Motore
python engine/pipeline.py                     # previsione, turni, ottimizzazione, rigioco → console/data/scenario/

# Facoltativo: sensibilità dei risultati ai pesi (qualche minuto) → console/data/scenario/sensibilita.json
python tools/sensibilita.py

# 4. Demo
python -m http.server 8000 --directory console
# poi apri http://localhost:8000
# tasti: spazio avvia/ferma · 1 poco prima del picco · ← → ±10 min · R risultato · F schermo intero
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
| Tratti (`02`) | 1.769 tratti, canyon misurato tra le facciate, 9 sottovia |
| Mappa del rischio (`04`) | picco 16:00–17:30 |
| Simulatore BOXi (`sim/`) | 12 BOXi, 4 giri da 8 fermate, deposito Roma 5 |
| Motore (`engine/`) | −56% ore operatore a parità di servizio, da 1,3 a 3 veicoli per operatore |
| Griglia dell'attenzione (`engine/attenzione.py`) | il rosso anticipa il 52% delle richieste |
| Sensibilità (`tools/sensibilita.py`) | risparmio tra 46% e 59% con pesi a ±50% |
| Console (`console/`) | strade colorate dal rischio, previsione del picco, griglia, risultato, tasti per il palco |
