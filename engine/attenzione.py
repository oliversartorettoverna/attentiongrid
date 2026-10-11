"""Griglia dell'attenzione: per ogni veicolo e ogni minuto, quanta attenzione gli serve.

Il livello dipende dalla probabilità che il veicolo chieda aiuto nei prossimi minuti, calcolata sui
tratti che sta per percorrere:
    P = 1 − Π (1 − p_intervento)   sulle passate dei prossimi `orizzonte_min` minuti
    verde  (0) P < soglia_osservazione   autonomo, l'operatore non lo guarda
    giallo (1) P < soglia_intervento     in osservazione, l'operatore è preallertato
    rosso  (2) altrimenti                intervento probabile, un operatore è assegnato prima che si fermi
    fermo (-1) il veicolo non si muove (al deposito o a fine turno)

Le soglie sono in config/scenario.yaml → attenzione; la loro tenuta si misura con `validazione`.
"""
from collections import defaultdict

from previsione import NOMI_MOTIVI, hm, riga_rischio


def motivo_principale(riga: dict | None) -> str:
    """Il fattore che pesa di più. La pioggia amplifica gli altri, quindi si aggiunge al motivo
    invece di prenderne il posto: "uscita scuola + pioggia", non solo "pioggia forte"."""
    if not riga:
        return ""
    altri = {k: riga.get(k, 0.0) for k in NOMI_MOTIVI if k != "c_meteo"}
    chiave = max(altri, key=altri.get)
    motivo = NOMI_MOTIVI[chiave] if altri[chiave] > 0 else ""
    if riga.get("c_meteo", 0.0) > 0 and chiave != "c_sottopasso":
        motivo += " + pioggia"
    return motivo


def livelli(lista_passate: list, rischio: dict, fascia_min: int, nomi_vie: dict,
            inizio_s: int, fine_s: int, orizzonte_s: int, soglia_oss: float, soglia_int: float) -> dict:
    """{veicolo_id: [stato per minuto]}, stato = [livello, P, via, motivo, tra_s] oppure [-1]."""
    per_veicolo = defaultdict(list)
    for p in lista_passate:
        r = riga_rischio(p, rischio, fascia_min)
        per_veicolo[p.veicolo_id].append((p.t, r["p_intervento"] if r else 0.0, p.seg_id, r))
    out = {}
    for v, lista in per_veicolo.items():
        lista.sort(key=lambda x: x[0])
        stati, j = [], 0
        for t in range(inizio_s, fine_s, 60):
            while j < len(lista) and lista[j][0] < t:
                j += 1
            avanti = [x for x in lista[j:j + 200] if x[0] < t + orizzonte_s]
            if not avanti:
                stati.append([-1])
                continue
            resto = 1.0
            for _, q, _, _ in avanti:
                resto *= 1 - q
            prob = 1 - resto
            livello = 0 if prob < soglia_oss else (1 if prob < soglia_int else 2)
            t_peggiore, _, seg, riga = max(avanti, key=lambda x: x[1])
            motivo = motivo_principale(riga)
            stati.append([livello, round(prob, 3), nomi_vie.get(seg, ""), motivo, int(t_peggiore - t)])
        out[v] = stati
    return out


def validazione(stati: dict, richieste: list, inizio_s: int, anticipo_s: int) -> dict:
    """Quanto bene i livelli anticipano le richieste: in che stato era il veicolo `anticipo_s` prima."""
    tempo = defaultdict(int)
    for lista in stati.values():
        for s in lista:
            tempo[s[0]] += 1
    da = defaultdict(int)
    for r in richieste:
        i = int((r["t"] - anticipo_s - inizio_s) // 60)
        lista = stati.get(r["veicolo_id"], [])
        da[lista[i][0] if 0 <= i < len(lista) else -1] += 1
    in_moto = sum(tempo[k] for k in (0, 1, 2)) or 1
    n = len(richieste) or 1
    frequenza = {k: da[k] / max(tempo[k], 1) for k in (0, 1, 2)}
    return {
        "tempo_pct": {nome: round(100 * tempo[k] / in_moto) for k, nome in ((0, "verde"), (1, "giallo"), (2, "rosso"))},
        "richieste_da_pct": {nome: round(100 * da[k] / n) for k, nome in ((0, "verde"), (1, "giallo"), (2, "rosso"))},
        "rosso_su_verde": round(frequenza[2] / max(frequenza[0], 1e-9), 1),
        "anticipo_s": anticipo_s,
    }


def serializza(stati: dict, inizio_s: int, cfg_att: dict, valid: dict) -> dict:
    return {"passo_s": 60, "inizio": hm(inizio_s),
            "soglie": {"osservazione": cfg_att["soglia_osservazione"], "intervento": cfg_att["soglia_intervento"],
                       "orizzonte_min": cfg_att["orizzonte_min"]},
            "validazione": valid, "veicoli": stati}


def serializza_compatto(stati: dict, inizio_s: int, cfg_att: dict, valid: dict, quanti: int = 12,
                        cfg_gps: dict | None = None) -> dict:
    """Per molti veicoli: il livello e la probabilità di ogni veicolo minuto per minuto come stringhe
    ("-" fermo, 0, 1, 2; due cifre in percento) e, per ogni minuto, i dettagli dei `quanti` veicoli più a rischio."""
    livelli = {v: "".join("-" if s[0] < 0 else str(s[0]) for s in lista) for v, lista in stati.items()}
    # probabilità di ogni veicolo in percento, due cifre per minuto: lo score è 100 meno questo numero
    prob = {v: "".join("--" if s[0] < 0 else f"{min(99, round(100 * s[1])):02d}" for s in lista)
            for v, lista in stati.items()}
    n = max((len(x) for x in stati.values()), default=0)
    dettagli = []
    for i in range(n):
        attivi = [(v, lista[i]) for v, lista in stati.items() if i < len(lista) and lista[i][0] >= 0]
        attivi.sort(key=lambda x: -x[1][1])
        dettagli.append([[v] + s for v, s in attivi[:quanti]])
    return {"passo_s": 60, "inizio": hm(inizio_s),
            "soglie": {"osservazione": cfg_att["soglia_osservazione"], "intervento": cfg_att["soglia_intervento"],
                       "orizzonte_min": cfg_att["orizzonte_min"]},
            "validazione": valid, "livelli": livelli, "p": prob, "dettagli": dettagli,
            "gps": cfg_gps or {}}
