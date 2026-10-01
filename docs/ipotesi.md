# Ipotesi e parametri

Ogni numero che non viene da un dato misurato sta qui, con il suo stato. I valori usati dal codice sono in `config/scenario.yaml` e `config/pesi_rischio.yaml`: se ne cambi uno, aggiorna anche questa tabella.

Stato: **validato** = da fonte o misura; **da validare** = stima nostra, da confermare con interviste o dati; **scelta** = decisione di progetto.

## Operatività

| Parametro | Valore | Stato | Da dove viene / come validarlo |
|---|---|---|---|
| Velocità massima BOXi | 25 km/h | validato | Scheda BOXi (Poste, feb. 2026) |
| Durata media di un intervento remoto | 90 s | da validare | Chiedere nelle interviste (domanda 1) |
| Tempo massimo di attesa accettabile | 20 s | da validare | Cruise: 98% delle richieste gestite entro 3 s (robotaxi). Per un veicolo lento che si ferma in sicurezza assumiamo 20 s |
| Livello di servizio | 90% delle richieste entro il tempo massimo | scelta | Standard dei call center |
| Persone per coprire una postazione 24/7 | circa 5 (da 4,2 a 5,4) | validato | Regola dei call center (Call Centre Helper) |
| Veicoli per operatore, oggi | 1:1 per Poste | validato | Scheda della sfida Poste |
| Limite umano nella supervisione | 4–6 robot per operatore | validato (laboratorio) | Crandall & Cummings 2007 |

## Rischio di intervento

Il rischio di un tratto in una fascia è la probabilità che un veicolo che lo percorre chieda aiuto. Si combina così:

```
p = 1 − (1 − p_base) × Π (1 − c_i)
```

dove `c_i` è il contributo di ciascun fattore. Pioggia forte moltiplica i contributi di attraversamenti, doppia fila e scuola. **Tutti i pesi sono da validare**: sono ordini di grandezza per far funzionare la demo, e lo diciamo nel pitch.

| Fattore | Quando si attiva | Contributo iniziale | Base |
|---|---|---|---|
| Base | sempre | 0,002 | stima |
| Attraversamenti | per ogni attraversamento sul tratto | 0,008 | Starship: aiuto umano in circa il 15% degli attraversamenti (robot da marciapiede) |
| Doppia fila | densità negozi ≥ 10 per 100 m (un terzo dei tratti) e fascia 08–10 o 16–19:30 | 0,02 | soglia scelta il 30/9 sui dati OSM (con 3 si accendeva sul 60% dei tratti); da tarare sul rilievo di Riccio |
| Scuola | scuola entro 100 m e fascia 16:00–17:00 (tempo pieno) o 12:30–14:00 | 0,03 | da misurare nel rilievo di Riccio |
| Pioggia forte | pioggia > 4 mm/h | moltiplica per 1,8 i tre fattori sopra | stima |
| Abbagliamento | sole sotto 15° di altezza, allineato con la strada (differenza < 20°) e nuvolosità ≤ 70% | 0,02 | NHTSA indaga Tesla per sole basso, nebbia, polvere |
| Sottopasso | sottovia stradale (OSM `tunnel=yes` su strade principali: Lungotevere, Galleria Principe Amedeo) e pioggia > 4 mm/h | 0,2 | Waymo sospende il servizio per allagamenti (mag. 2026) |
| GPS in canyon urbano | rapporto altezza edifici / distanza tra le facciate > 1,5 (distanza misurata sulle piante OSM) | 0,005 | BOXi ha sensori inerziali: il GPS pesa poco |

**Controllo di plausibilità (30/9, dati veri, 3 ottobre 2024).** Mediando su tutte le strade dell'area, un veicolo chiede aiuto circa 1 volta ogni 3,6 km alle 14:00 (senza pioggia forte), 1 ogni 1,4 km alle 16:30 (temporale e uscita scuole), 1 ogni 2,8 km alle 18:00. Cruise a San Francisco: 1 ogni 6,4–8 km. Siamo circa il doppio di Cruise fuori dal picco, coerente con un centro storico più denso di pedoni e con un veicolo meno maturo. Limite noto: un attraversamento su un incrocio viene contato da tutti i tratti che lo toccano.

## Scenario della demo

| Parametro | Valore | Stato |
|---|---|---|
| Area | Prati e Trastevere (riquadro in `config/scenario.yaml`) | scelta |
| Giorno | giovedì 3 ottobre 2024, giorno di scuola. Pioggia (Open-Meteo, Ponte Garibaldi): 5,0 mm alle 16, 4,2 alle 17, 3,7 alle 18. Nell'autunno 2025 nessun giorno feriale superava 4 mm/h alle 16 e alle 17 | scelta |
| Finestra | 14:00–19:00, picco atteso 16:30 | scelta |
| Flotte | 12 BOXi, 4 navette su anello fisso, 6 robot da marciapiede (solo nel finale) | scelta |
| Deposito BOXi | ufficio postale OSM più vicino al centro di Prati (esclusi gli uffici di Poste Vaticane) | scelta |

## Dati mancanti

| Dato | Situazione | Cosa usiamo |
|---|---|---|
| Altezza edifici | In OSM solo 66 edifici su 5.598 hanno `height` e 452 `building:levels` (download del 30/9) | Valore di riserva 15 m dove manca, finché non si integra EUBUCCO. Il rapporto canyon (GPS) è quindi poco affidabile |
| Via Ottaviano | In OSM è pedonale: i BOXi non ci passano. Il rilievo di Riccio lì misura i pedoni ma non entra nella mappa del rischio | Da valutare se sostituirla nella Scheda rilievo con una via carrabile |
