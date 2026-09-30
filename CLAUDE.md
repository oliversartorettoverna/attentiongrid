# Regole per Claude in questo repository

Progetto AttentionGrid per il Safe Mobility Hack (sfida Poste Italiane, 10–12 ottobre 2026). Contesto completo nel README e nel Drive del team ("00 LEGGIMI – Contesto progetto"). Tutta la parte tecnica (dati, simulazione, motore, console) la segue Oliver.

## Ambiente

- Python 3.11 in `.venv` (`source .venv/bin/activate`, oppure `.venv/bin/python ...`).
- Demo: `python -m http.server 8000 --directory console`, poi `http://localhost:8000` (dati veri in `console/data/scenario/`) o `?dati=esempio` (dati finti).
- Prova rapida del motore: `python engine/erlang.py` deve stampare `OK`.

## Regole

1. Mai lavorare direttamente su `main`: ramo `oliver/<argomento>`, poi pull request.
2. `data/raw/` non si committa mai. Gli output piccoli (`data/processed/`, `sim/out/giri.json`, `console/data/scenario*/`) sì, se sotto 20 MB l'uno.
3. I formati tra i moduli sono fissati in `docs/formati-dati.md`. Se ne cambi uno, aggiorna prima quel file.
4. Ogni numero stimato o inventato va in `config/` e in `docs/ipotesi.md`, con lo stato (validato / da validare / scelta).
5. Non alzare i pesi del rischio per avere numeri più belli: in giuria si guarda la robustezza tecnica.
6. La demo deve funzionare senza internet: niente librerie, font o mappe caricati da CDN nella console.
7. Testi, commenti e messaggi di commit in italiano semplice.
