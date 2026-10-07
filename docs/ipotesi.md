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

**Controllo di plausibilità (scenario del 3 ottobre 2024).** Mediando su tutte le strade dell'area, un veicolo chiede aiuto circa 1 volta ogni 3,6 km alle 14:00 (senza pioggia forte), 1 ogni 1,4 km alle 16:30 (temporale e uscita scuole), 1 ogni 2,8 km alle 18:00. Cruise a San Francisco: 1 ogni 6,4–8 km. Siamo circa il doppio di Cruise fuori dal picco, coerente con un centro storico più denso di pedoni e con un veicolo meno maturo. Limite noto: un attraversamento su un incrocio viene contato da tutti i tratti che lo toccano.

## Soglie della griglia dell'attenzione

| Parametro | Valore | Stato | Da dove viene |
|---|---|---|---|
| Orizzonte | 3 minuti | scelta | Provati 2, 3 e 5 minuti: separano allo stesso modo (rosso circa 6 volte più richieste del verde); 3 lascia all'operatore 2 minuti di anticipo |
| Soglia giallo | P ≥ 0,25 di almeno una richiesta nei prossimi 3 minuti | scelta | Circa la mediana del tempo in movimento nello scenario del 3/10/2024 |
| Soglia rosso | P ≥ 0,45 | scelta | Circa l'80° percentile: il rosso copre un quinto del tempo |

Nello scenario: i veicoli sono verdi il 45% del tempo in movimento, gialli il 34%, rossi il 21%; il 52% delle richieste arriva da un veicolo che 2 minuti prima era rosso, il 19% da uno verde. **Limite:** la verifica è fatta sulla simulazione, dove le richieste sono estratte dalle stesse probabilità; la verifica vera richiede il registro degli interventi di una flotta reale.

## Sensibilità: il risultato regge se i pesi sono sbagliati?

`python tools/sensibilita.py` rifà rischio e motore cambiando un parametro alla volta (−50% e +50%) e poi tutti i pesi insieme. Risultati sullo scenario del 3 ottobre 2024 (21 corse):

| Cosa cambia | Risparmio di ore operatore a parità di servizio |
|---|---|
| Riferimento | 56% |
| Ogni peso del rischio a −50% o +50%, uno alla volta | 46–57% (il più sensibile è la pioggia) |
| Tutti i pesi insieme a −50% / +50% | 47% / 59% |
| Durata media dell'intervento 45 s / 135 s | 49% / 57% |
| Attesa massima 10 s / 30 s | 54% / 52% |

Il risparmio resta tra **46% e 59%** in tutte le varianti: dipende dalla forma della curva (il picco previsto), non dal valore preciso dei pesi. Quello che cambia molto è il numero assoluto di richieste (148–513) e quindi i veicoli per operatore (2,2–4,7 con il sistema).

**Limite delle soglie della griglia:** sono valori fissi (0,25 e 0,45). Se i pesi veri fossero la metà, quasi nessun veicolo diventerebbe rosso (solo il 3% delle richieste arriverebbe da un rosso). Con una flotta vera le soglie vanno ritarate sul registro degli interventi.

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
| Altezza edifici | In OSM solo 470 edifici su 5.598 hanno altezza o numero di piani | Copernicus Urban Atlas Building Height 2012 (satellite, celle di 10 m, precisione verticale 3 m) per 4.991 edifici; 15 m di riserva solo per 137 edifici (76 tratti su 1.769) |
| Via Ottaviano | In OSM è pedonale: i BOXi non ci passano. Il rilievo di Riccio lì misura i pedoni ma non entra nella mappa del rischio | Da valutare se sostituirla nella Scheda rilievo con una via carrabile |
