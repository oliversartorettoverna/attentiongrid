"""Calcola data/processed/rischio.csv: probabilità di intervento per tratto e fascia di 5 minuti.

Uso:
    python data/scripts/04_mappa_rischio.py

Prima servono tratti.geojson (02) e meteo.csv (03). I pesi sono in config/pesi_rischio.yaml
e sono tutti DA VALIDARE (docs/ipotesi.md). Formato di output: docs/formati-dati.md, sezione 2.
"""
import datetime as dt

import geopandas as gpd
import pandas as pd
import pvlib

from comune import LAT_RIF, LON_RIF, PROCESSED, hhmm, leggi_pesi, leggi_scenario, minuti


def in_fasce(minuto: int, fasce) -> bool:
    return any(minuti(a) <= minuto < minuti(b) for a, b in fasce)


def posizione_sole(data: str, fasce_min):
    """Altezza e azimut del sole per ogni fascia (gradi)."""
    tempi = pd.DatetimeIndex([pd.Timestamp(f"{data} {hhmm(m)}", tz="Europe/Rome") for m in fasce_min])
    pos = pvlib.solarposition.get_solarposition(tempi, LAT_RIF, LON_RIF)
    return dict(zip(fasce_min, zip(pos["apparent_elevation"], pos["azimuth"])))


def differenza_angolo(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


def carica_tratti():
    tratti = gpd.read_file(PROCESSED / "tratti.geojson")
    for c in ["rapporto_canyon", "direzione_gradi", "attraversamenti", "densita_negozi", "distanza_facciate_m"]:
        tratti[c] = pd.to_numeric(tratti[c], errors="coerce").fillna(0.0)
    for c in ["scuola_vicina", "sottopasso"]:
        tratti[c] = tratti[c].astype(str).str.lower().isin(["true", "1", "yes"])
    return tratti


def moltiplicatore_pedoni(densita_negozi: float, ped: dict) -> float:
    """Quanti pedoni attraversano rispetto a una via tipica, dalla regola del rilievo in strada:
    pedoni in 5 min ≈ intercetta + per_negozio × negozi/100 m. Non si estrapola oltre il rilievo."""
    d = min(densita_negozi, ped["densita_max_rilievo"])
    return (ped["intercetta"] + ped["per_negozio"] * d) / ped["riferimento"]


def calcola(tratti, meteo, sc: dict, pesi: dict) -> pd.DataFrame:
    """Rischio per tratto e fascia con i pesi dati (usato anche da tools/sensibilita.py)."""
    data = sc["giorno"]["data"]
    dt.date.fromisoformat(data)  # errore chiaro se la data non è stata ancora scelta
    passo = sc["giorno"]["fascia_min"]
    fasce_min = list(range(minuti(sc["giorno"]["inizio"]), minuti(sc["giorno"]["fine"]), passo))
    pioggia_ora = dict(zip(meteo["ora"].str[:2].astype(int), meteo["pioggia_mm"]))
    nuvole_ora = dict(zip(meteo["ora"].str[:2].astype(int), meteo["nuvolosita_pct"]))
    sole = posizione_sole(data, fasce_min)

    righe = []
    for fm in fasce_min:
        piove = pioggia_ora.get(fm // 60, 0.0) > pesi["pioggia"]["soglia_mm_ora"]
        molt = pesi["pioggia"]["moltiplicatore"] if piove else 1.0
        elev, azim = sole[fm]
        sole_visibile = nuvole_ora.get(fm // 60, 0.0) <= pesi["abbagliamento"]["nuvolosita_max_pct"]
        doppia_fila_ora = in_fasce(fm, pesi["doppia_fila"]["fasce"])
        scuola_ora = in_fasce(fm, pesi["scuola"]["fasce"])

        for t in tratti.itertuples():
            at = pesi["attraversamenti"]
            c_attr = min(0.5, t.attraversamenti * at["per_attraversamento"]
                         * moltiplicatore_pedoni(t.densita_negozi, at["pedoni"]))
            # doppia fila dove la strada è abbastanza larga da permetterla (rilievo: conta la larghezza, non i negozi)
            c_df = pesi["doppia_fila"]["contributo"] if (
                doppia_fila_ora and t.distanza_facciate_m >= pesi["doppia_fila"]["distanza_facciate_min_m"]) else 0.0
            c_sc = pesi["scuola"]["contributo"] if (scuola_ora and t.scuola_vicina) else 0.0
            # la pioggia amplifica i tre fattori legati a pedoni e traffico
            c_meteo = (molt - 1.0) * (c_attr + c_df + c_sc)
            abbaglia = sole_visibile and 0 < elev < pesi["abbagliamento"]["altezza_sole_max_gradi"] and min(
                differenza_angolo(t.direzione_gradi, azim),
                differenza_angolo((t.direzione_gradi + 180) % 360, azim),
            ) < pesi["abbagliamento"]["differenza_direzione_max_gradi"]
            c_abb = pesi["abbagliamento"]["contributo"] if abbaglia else 0.0
            c_sott = pesi["sottopasso"]["contributo"] if (t.sottopasso and piove) else 0.0
            c_gps = pesi["gps_canyon"]["contributo"] if t.rapporto_canyon > pesi["gps_canyon"]["soglia_rapporto"] else 0.0

            contributi = [c_attr, c_df, c_sc, c_meteo, c_abb, c_sott, c_gps]
            resto = 1 - pesi["base"]
            for c in contributi:
                resto *= (1 - min(c, 0.95))
            righe.append([t.seg_id, hhmm(fm), round(1 - resto, 4)] + [round(c, 4) for c in contributi])

    colonne = ["seg_id", "fascia", "p_intervento", "c_attraversamenti", "c_doppia_fila", "c_scuola",
               "c_meteo", "c_abbagliamento", "c_sottopasso", "c_gps"]
    return pd.DataFrame(righe, columns=colonne)


def main():
    tratti = carica_tratti()
    df = calcola(tratti, pd.read_csv(PROCESSED / "meteo.csv"), leggi_scenario(), leggi_pesi())
    df.to_csv(PROCESSED / "rischio.csv", index=False)
    print(f"Scritte {len(df)} righe in {PROCESSED / 'rischio.csv'}")
    print("Tratti più rischiosi alle 16:30:")
    top = df[df["fascia"] == "16:30"].nlargest(10, "p_intervento").merge(tratti[["seg_id", "nome"]], on="seg_id")
    print(top[["nome", "p_intervento"]].to_string(index=False))


if __name__ == "__main__":
    main()
