# AttentionGrid

Progetto per il **Safe Mobility Hack** (Spazio Attivo Roma Casilina, 10–12 ottobre 2026), sfida **Poste Italiane**: supervisione 1:n di veicoli autonomi per le consegne.

**In una frase:** prevediamo quando e dove i veicoli autonomi avranno bisogno di un operatore umano, così un operatore può seguire più veicoli (anche di flotte diverse) senza andare in crisi nei picchi.

Il contesto completo (idea, prove, business model, piano, ruoli) è nel [Drive del team](https://drive.google.com/drive/folders/1lWvYd15RG1fwRSr5Oq9S2nl_DtjBNuxm), documento [**00 LEGGIMI – Contesto progetto**](https://docs.google.com/document/d/109SlfWPYotK3Y1A98rnCzY4TWpvVRaSBUSONrSjZHgk/edit). Le indicazioni per ogni persona sono nella cartella [**01 Indicazioni**](https://drive.google.com/drive/folders/1UvzmBy5Q3U7GlKB9oX3G62AynPZuySeB).

## Cosa mostra la demo

Roma, Prati e Trastevere, un pomeriggio feriale con temporale e uscita delle scuole. 12 BOXi (i veicoli autonomi di Poste) fanno consegne; un solo operatore li supervisiona.

- **Pannello sinistro, senza sistema:** le richieste di aiuto arrivano tutte insieme, si forma una coda, i veicoli restano fermi.
- **Pannello destro, con AttentionGrid:** il picco è previsto in anticipo, le partenze sono sfasate, le zone critiche evitate, e la console dice quanti operatori servono.
- **Finale:** nella stessa console compaiono veicoli di tre flotte diverse (BOXi, navette, robot da marciapiede), seguiti dagli stessi operatori.

## Come funziona (pipeline)

```
data/scripts  →  data/processed  →  sim  →  engine  →  console
(dati aperti)    (mappa rischio)    (giri)  (previsione,   (demo web)
                                            turni,
                                            ottimizzazione)
```

| Cartella | Cosa fa | Responsabile |
|---|---|---|
| `config/` | Area, orari, flotte e parametri dello scenario. **Tutti i numeri modificabili stanno qui.** | Oliver |
| `data/scripts/` | Scarica e prepara i dati aperti (OSM, altezza edifici, meteo) e calcola la mappa del rischio | Pela |
| `data/processed/` | Output piccoli della pipeline dati (versionati) | Pela |
| `sim/` | Simula i giri di consegna dei veicoli sulle strade vere | Pela |
| `engine/` | Previsione degli interventi, calcolo turni (Erlang C), sfasamento partenze, rigioco dello scenario con e senza sistema | Oliver |
| `console/` | Pagina web della demo: mappa, due pannelli, coda di avvisi, numeri finali | Oliver + Pela |
| `docs/` | Architettura, formati dei file, ipotesi e parametri | Oliver |

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
# 1. Dati (Pela)
python data/scripts/01_scarica_osm.py        # strade, edifici, punti di interesse dell'area
python data/scripts/02_costruisci_tratti.py  # tratti di strada con altezza edifici, attraversamenti, negozi, scuole
python data/scripts/03_meteo.py              # meteo orario del giorno scelto (Open-Meteo)
python data/scripts/04_mappa_rischio.py      # rischio per tratto di strada e fascia oraria

# 2. Simulazione (Pela)
python sim/simula_flotta.py                   # giri di consegna dei veicoli

# 3. Motore (Oliver)
python engine/pipeline.py                     # previsione, turni, ottimizzazione, rigioco → console/data/scenario/

# 4. Demo
python -m http.server 8000 --directory console
# poi apri http://localhost:8000
```

Per lavorare sulla console senza aspettare dati e simulazione: `python tools/genera_esempio.py` rigenera i file finti in `console/data/esempio/`.

## Regole di lavoro

- Un ramo per persona o per funzione (`pela/mappa-rischio`, `oliver/erlang`), poi pull request su `main`. Chi apre la PR scrive in due righe cosa cambia.
- **Dati grezzi fuori dal repo.** `data/raw/` resta in locale (e una copia zip nel Drive, cartella "03 Dati").
- **Output piccoli dentro il repo:** `data/processed/`, `sim/out/giri.json` e `console/data/scenario/` si committano (se sotto 20 MB l'uno), così chiunque apre la demo senza rigenerare niente.
- Se cambi un formato di file, aggiorna prima `docs/formati-dati.md` e avvisa nel gruppo.
- Ogni numero inventato o stimato va in `config/` e in `docs/ipotesi.md`, con scritto se è validato o no.

## Stato (30 settembre)

| Pezzo | Stato |
|---|---|
| Struttura repo, formati, parametri | pronto |
| Motore: previsione, Erlang C, sfasamento partenze, rigioco (`engine/`) | pronto, provato su dati finti |
| Console di base (`console/`) | pronta, provata con `?dati=esempio` |
| Script dati 02 e 04, simulatore BOXi | provati su un quartiere finto; da provare sui dati veri |
| Script dati 01 (OSM) e 03 (meteo) | da provare: servono internet e Overpass/Open-Meteo |
| Altezze da EUBUCCO, sottopassi allagabili, navette e robot, grafica definitiva della console | da fare (TODO nei file) |
