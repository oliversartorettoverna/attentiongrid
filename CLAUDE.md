# Istruzioni per Claude (e per qualsiasi AI che lavora su questo repository)

Leggi anche `README.md` (cosa fa il progetto, comandi) e `docs/formati-dati.md` (formato dei file tra un modulo e l'altro).

## Contesto

AttentionGrid, team di 5 al Safe Mobility Hack (Roma, 10–12 ottobre 2026), sfida Poste Italiane: supervisione 1:n di veicoli autonomi per le consegne. Il contesto completo è nel Drive del team:

- [Cartella del team](https://drive.google.com/drive/folders/1lWvYd15RG1fwRSr5Oq9S2nl_DtjBNuxm)
- [00 LEGGIMI – Contesto progetto](https://docs.google.com/document/d/1HsAE_9wqXLRBD0W4tp1wM5lBaq8Z3Ve9ndZwquYFRvg/edit): idea, prove, business, piano
- [01 Indicazioni](https://drive.google.com/drive/folders/1utUxprX7MMMd6rIOk_PhJcy3-JlSrJ9k): un documento per persona con i task giorno per giorno

Chi fa cosa: **Oliver** tutta la parte tecnica: dati (`data/`), simulazione (`sim/`), motore (`engine/`), console (`console/`), parametri (`config/`); **Tommaso** business, numeri e mercato; **Andrea** interviste, normativa e pitch; **Riccio** rilievo sul campo per validare le ipotesi (Scheda rilievo nel Drive, 03 Dati). Se chi ti scrive si presenta, segui il suo documento in 01 Indicazioni, un compito alla volta.

## Come lavorare con la persona

- Chi ti scrive vuole imparare, non solo avere il risultato. Prima di ogni comando scrivi in una riga cosa fa e perché. Niente gergo non spiegato.
- Dopo ogni task mostra il risultato (numeri, file creati, errori) e di' cosa deve controllare con i suoi occhi. Il compito è chiuso quando la persona ha controllato il risultato.
- Se una cosa non funziona, spiega il problema prima di cambiare strada. Non aggirare un controllo che fallisce abbassando la soglia senza dirlo.
- Le decisioni di merito (quale giorno di pioggia, quale soglia, quali colori) le prende la persona: proponi con i motivi, poi aspetta.
- Chiavi, token e password non vanno mai nel repository. Se la persona fornisce una chiave, usala tenendola fuori dal repository (file temporaneo o variabile d'ambiente) e cancellala dopo l'uso.
- Se la tua rete non raggiunge un servizio (Overpass di OpenStreetMap, Open-Meteo, EUBUCCO), non insistere: dai alla persona il comando esatto da lanciare nel suo terminale.

## Regole del repository

- Mai push diretto su `main`. Un ramo per funzione (`oliver/dati`, `oliver/attenzione`), poi pull request verso `main` con due righe su cosa cambia.
- `data/raw/` non si committa (è in `.gitignore`): i dati grezzi vanno zippati nel Drive, cartella 03 Dati.
- Si committano gli output piccoli (`data/processed/`, `sim/out/giri.json`, `console/data/scenario*/`), solo se ogni file è sotto 20 MB.
- Se cambi il formato di un file, aggiorna prima `docs/formati-dati.md`.
- Ogni numero stimato o inventato va in `config/` e in `docs/ipotesi.md`, con scritto se è validato e da cosa (es. "tarato sul rilievo in strada").
- Niente scadenze né TODO nei file del repository: i documenti descrivono il prodotto com'è.
- Non alzare i pesi del rischio per avere numeri più belli: in giuria si guarda la robustezza tecnica.
- `engine/` e `console/` sono di Oliver: chi altro li modifica lo fa su un ramo e lo avvisa nel gruppo.

## Note tecniche

- Python 3.11, ambiente in `.venv`, dipendenze in `requirements.txt`.
- osmnx 2.x: `bbox = (left, bottom, right, top)`. L'area è in `config/scenario.yaml` (`riquadro`).
- L'app è in `web/` (Vite + React + TypeScript, Tailwind, MapLibre) e legge i dati dal server locale FastAPI in `server/`. Sviluppo: `.venv/bin/uvicorn server.main:app --port 8001` e, in un altro terminale, `npm --prefix web run dev` → `http://localhost:5173`. Per il palco: `npm --prefix web run build`, poi solo il server → `http://localhost:8001`.
- Mappa, simulatore e motore girano sul laptop e devono funzionare senza internet: niente librerie, font o mappe da CDN (tutto installato con npm). Supabase, copilota AI e telefono-BOXi passano dalla rete e hanno sempre un ripiego se la rete cade.
- Grafica: palette e regole in `web/src/index.css` (AG Brand v1 nel Drive, 06 Loghi e palette). Il colore si usa solo per gli stati, ogni stato ha anche l'etichetta scritta, il rosso è riservato a critico e arresto.
- La vecchia console statica in `console/` resta come riserva: `python -m http.server 8000 --directory console`.
- Prova rapida del motore: `python engine/erlang.py` deve stampare `OK`.
- Finale multi-flotta: `python engine/pipeline.py --flotte boxi,navetta,robot --out console/data/scenario_multiflotta`.
