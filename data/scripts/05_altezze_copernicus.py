"""Scarica l'altezza degli edifici di Roma da Copernicus (Urban Atlas Building Height, satellite, celle di 10 m).

Uso:
    python data/scripts/05_altezze_copernicus.py

Serve una chiave di servizio Copernicus (land.copernicus.eu → profilo → API Tokens), salvata da te in
~/.config/copernicus/chiave.json (oppure nel file indicato dalla variabile COPERNICUS_CHIAVE).
Lo script la legge da lì e non la stampa mai. La chiave non va mai nel repository.

Output (in data/raw/copernicus/, non versionato): il GeoTIFF delle altezze. Lo usa 02_costruisci_tratti.py
dove OpenStreetMap non ha l'altezza.

Il servizio prepara il file in background: lo script chiede il file, poi controlla ogni 30 secondi
finché non è pronto (di solito pochi minuti).
"""
import io
import json
import os
import time
import zipfile
from pathlib import Path

import jwt
import requests

from comune import RAW

API = "https://land.copernicus.eu/api"
# Urban Atlas Building Height 2012, file già pronto per Roma (dal catalogo: @search, downloadable_files)
DATASET = "9b64a56b49f74f458aa401ad7809af16"
INFO_DOWNLOAD = "e15c300f-435b-43c4-a710-42c65d7da3fd"
FILE_ROMA = "d073b0ba-c395-49cf-a945-04cbf43a61c4"
CARTELLA = RAW / "copernicus"


def token() -> str:
    percorso = Path(os.environ.get("COPERNICUS_CHIAVE", Path.home() / ".config/copernicus/chiave.json"))
    if not percorso.exists():
        raise SystemExit(f"Chiave non trovata in {percorso}. Salvala lì (vedi in cima a questo file).")
    chiave = json.loads(percorso.read_text())
    adesso = int(time.time())
    concessione = jwt.encode({"iss": chiave["client_id"], "sub": chiave["user_id"], "aud": chiave["token_uri"],
                              "iat": adesso, "exp": adesso + 3600},
                             chiave["private_key"].encode(), algorithm="RS256")
    r = requests.post(chiave["token_uri"], timeout=60,
                      headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
                      data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": concessione})
    r.raise_for_status()
    return r.json()["access_token"]


def cerca_link(dati):
    """Il link di download può stare a profondità diverse nella risposta: lo cerca ovunque."""
    if isinstance(dati, dict):
        for k, v in dati.items():
            if k == "DownloadURL" and v:
                return v
            trovato = cerca_link(v)
            if trovato:
                return trovato
    elif isinstance(dati, list):
        for v in dati:
            trovato = cerca_link(v)
            if trovato:
                return trovato
    return None


def main():
    CARTELLA.mkdir(parents=True, exist_ok=True)
    intestazioni = {"Accept": "application/json", "Content-Type": "application/json",
                    "Authorization": f"Bearer {token()}"}
    richiesta = {"Datasets": [{"DatasetID": DATASET, "DatasetDownloadInformationID": INFO_DOWNLOAD,
                               "FileID": FILE_ROMA, "OutputFormat": "Geotiff", "OutputGCS": "EPSG:3035"}]}
    r = requests.post(f"{API}/@datarequest_post", headers=intestazioni, json=richiesta, timeout=60)
    r.raise_for_status()
    compiti = r.json().get("TaskIds") or []
    if not compiti:
        raise SystemExit(f"Richiesta rifiutata: {r.json()}")
    task = compiti[0]["TaskID"]
    print(f"Richiesta accettata (compito {task}). Aspetto che il file sia pronto…")

    for tentativo in range(60):
        r = requests.get(f"{API}/@datarequest_search", headers=intestazioni, params={"taskid": task}, timeout=60)
        r.raise_for_status()
        link = cerca_link(r.json())
        if link:
            break
        print(f"  non ancora pronto ({tentativo + 1}/60), riprovo tra 30 s")
        time.sleep(30)
    else:
        raise SystemExit("Il file non è pronto dopo 30 minuti: rilancia più tardi, arriva anche una mail.")

    print("Scarico", link)
    for _ in range(20):                      # il link arriva a volte prima che il file sia completo
        contenuto = requests.get(link, timeout=600).content
        if zipfile.is_zipfile(io.BytesIO(contenuto)):
            break
        print("  file non ancora completo, riprovo tra 30 s")
        time.sleep(30)
    else:
        raise SystemExit(f"Il file non è arrivato: scaricalo a mano da {link}")
    zipfile.ZipFile(io.BytesIO(contenuto)).extractall(CARTELLA)
    for interno in list(CARTELLA.rglob("*.zip")):          # il file pronto per Roma è uno zip dentro lo zip
        zipfile.ZipFile(interno).extractall(interno.parent)
    tif = sorted(CARTELLA.rglob("*.tif"))
    print("Fatto:", *[str(t) for t in tif], sep="\n  ")


if __name__ == "__main__":
    main()
