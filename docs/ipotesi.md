# Ipotesi e parametri

Ogni numero che non viene da un dato misurato sta qui, con il suo stato. I valori usati dal codice sono in `config/scenario.yaml` e `config/pesi_rischio.yaml`: se ne cambi uno, aggiorna anche questa tabella.

Stato: **validato** = da fonte o misura; **da validare** = stima nostra, da confermare con interviste o dati; **scelta** = decisione di progetto.

## Operatività

| Parametro | Valore | Stato | Da dove viene / come validarlo |
|---|---|---|---|
| Velocità massima BOXi | 25 km/h | validato | Scheda BOXi (Poste, feb. 2026) |
| Durata media di un intervento remoto | 90 s | prudente | Cruise implica meno di un minuto (vedi sotto); da confermare nelle interviste |
| Tempo massimo di attesa accettabile | 20 s | da validare | Cruise: 98% delle richieste gestite entro 3 s (robotaxi). Per un veicolo lento che si ferma in sicurezza assumiamo 20 s |
| Livello di servizio | 90% delle richieste entro il tempo massimo | scelta | Standard dei call center |
| Persone per coprire una postazione 24/7 | circa 5 (da 4,2 a 5,4) | validato | Regola dei call center (Call Centre Helper) |
| Veicoli per operatore, oggi | 1:1 per Poste | validato | Scheda della sfida Poste |
| Limite umano nella supervisione | 4–6 robot per operatore | validato (laboratorio) | Crandall & Cummings 2007 |

## Rischio di intervento

Il rischio di un tratto in una fascia è la probabilità che un veicolo che lo percorre chieda aiuto. I fattori si combinano come cause indipendenti:

```
p = 1 − (1 − p_base) × Π (1 − c_i)
```

cioè il veicolo non chiede aiuto solo se non lo chiede per nessuno dei motivi. Così il totale non supera mai 1; con contributi piccoli il risultato è quasi la somma (0,02 e 0,03 danno 0,049). La pioggia forte non è un motivo a sé: moltiplica i contributi di attraversamenti, doppia fila e scuola.

Stato: **tarato** = scelto perché il modello riproduca un dato pubblico; **dal rilievo** = misurato da noi in strada (`data/rilievo/`); **da letteratura** = valore preso da uno studio; **stima** = nostra, con impatto sul risultato misurato dalla sensibilità.

| Fattore | Quando si attiva | Valore | Stato e fonte |
|---|---|---|---|
| Attraversamenti | per ogni striscia o semaforo pedonale sul tratto, moltiplicato per i pedoni stimati | 0,0048 per attraversamento in una via tipica | **tarato**: con questo valore, nel pomeriggio senza pioggia forte né scuole, i BOXi chiedono aiuto una volta ogni 7,2 km, come Cruise a San Francisco (una ogni 4–5 miglia, [CNBC 2023](https://www.cnbc.com/2023/11/06/cruise-confirms-robotaxis-rely-on-human-assistance-every-4-to-5-miles.html)). `python tools/taratura.py` |
| Pedoni | moltiplicano il rischio degli attraversamenti | pedoni in 5 min ≈ 25 + 1,51 × negozi/100 m, diviso 32,6 (via tipica); oltre 31 negozi/100 m non si estrapola | **dal rilievo**: 7 vie, correlazione pedoni–negozi +0,82 |
| Doppia fila | distanza tra le facciate ≥ 20 m e fascia 08–10 o 16–19:30 | 0,02 | soglia **dal rilievo**: auto in doppia fila correlate con la larghezza della via (+0,86), non con i negozi (−0,71); vie larghe 9 auto in media, strette 3. Il contributo resta una **stima** |
| Scuola | scuola entro 100 m (OSM + anagrafe del Ministero) e fascia 12:30–14:00 o 16:00–17:00 | 0,03 | **stima**; l'elenco delle scuole viene dal Ministero perché OSM mancava 3 scuole su 4 viste nel rilievo |
| Pioggia forte | pioggia > 4 mm/h | moltiplica per 1,7 i tre fattori sopra | **da letteratura**: con la pioggia gli incidenti aumentano in media del 71% (meta-analisi di 34 studi, [Qiu e Nixon 2008](https://journals.sagepub.com/doi/10.3141/2055-16)). È un dato sui guidatori umani, usato come approssimazione |
| Base | sempre | 0,002 | **stima**: blocchi non spiegati dagli altri fattori; impatto trascurabile (sensibilità) |
| Sottopasso | sottovia stradale (OSM `tunnel=yes` su strade principali) e pioggia > 4 mm/h | 0,2 | **stima** (Waymo sospende il servizio per allagamenti, mag. 2026); impatto trascurabile sul risultato |
| GPS in canyon urbano | altezza edifici / distanza tra le facciate > 1,5 | 0,005 | **stima** (BOXi ha sensori inerziali); impatto trascurabile |
| Abbagliamento | sole sotto 15°, allineato con la strada (< 20°) e nuvolosità ≤ 70% | 0,02 | **stima** (NHTSA indaga Tesla per sole basso); nel 3/10/2024 il cielo è coperto e vale zero |

**Rilievo in strada (`data/rilievo/rilievo_prati_trastevere.csv`).** 8 vie, 2 e 5 ottobre 2026, 16:00–17:30: auto in doppia fila lungo il tratto, pedoni che attraversano in 5 minuti, scuole e uscita in corso. Limiti: una misura per via e nessuna misura fuori dall'orario di uscita, quindi l'effetto della scuola non si può separare da quello della via. Via Ottaviano e Via della Lungaretta sono pedonali e servono solo per la regola dei pedoni.

**Durata degli interventi.** Cruise dichiara assistenza remota per il 2–4% del tempo, con una richiesta ogni 4–5 miglia: ne deriva una durata media sotto il minuto. I nostri 90 s sono quindi prudenti.

## Soglie della griglia dell'attenzione

| Parametro | Valore | Stato | Da dove viene |
|---|---|---|---|
| Orizzonte | 3 minuti | scelta | Provati 2, 3 e 5 minuti: separano allo stesso modo (rosso circa 6 volte più richieste del verde); 3 lascia all'operatore 2 minuti di anticipo |
| Soglia giallo | P ≥ 0,25 di almeno una richiesta nei prossimi 3 minuti | scelta | Circa la mediana del tempo in movimento nello scenario del 3/10/2024 |
| Soglia rosso | P ≥ 0,45 | scelta | Circa l'80° percentile: il rosso copre un quinto del tempo |

Nello scenario: i veicoli sono verdi il 48% del tempo in movimento, gialli il 29%, rossi il 22%; il 54% delle richieste arriva da un veicolo che 2 minuti prima era rosso, il 17% da uno verde (un rosso chiede aiuto 6,7 volte più spesso di un verde). **Limite:** la verifica è fatta sulla simulazione, dove le richieste sono estratte dalle stesse probabilità; la verifica vera richiede il registro degli interventi di una flotta reale.

## Sensibilità: il risultato regge se i pesi sono sbagliati?

`python tools/sensibilita.py` rifà rischio e motore cambiando un parametro alla volta (−50% e +50%) e poi tutti i pesi insieme. Risultati sullo scenario del 3 ottobre 2024 (21 corse):

| Cosa cambia | Risparmio di ore operatore a parità di servizio |
|---|---|
| Riferimento | 51% |
| Ogni peso del rischio a −50% o +50%, uno alla volta | 49–58% |
| Tutti i pesi insieme a −50% / +50% | 50% / 59% |
| Durata media dell'intervento 45 s / 135 s | 50% / 57% |
| Attesa massima 10 s / 30 s | 55% / 53% |

Il risparmio resta tra **49% e 59%** in tutte le varianti: dipende dalla forma della curva (il picco previsto), non dal valore preciso dei pesi. Quello che cambia molto è il numero assoluto di richieste (133–501) e quindi i veicoli per operatore (2,2–4,8 con il sistema).

**Limite delle soglie della griglia:** sono valori fissi (0,25 e 0,45). Se i pesi veri fossero la metà, quasi nessun veicolo diventerebbe rosso (solo il 7% delle richieste arriverebbe da un rosso). Con una flotta vera le soglie vanno ritarate sul registro degli interventi.

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
| Scuole | OSM ha 26 scuole nell'area e non conosceva 3 delle 4 viste nel rilievo | Anagrafe del Ministero dell'Istruzione 2025/26 (statali e paritarie, senza corsi serali), geolocalizzata dall'indirizzo: 44 sedi; 117 indirizzi su 136 trovati |
| Scuola su Via di S. Francesco a Ripa | Il rilievo indica l'IC Giovan Battista Vico, che nell'anagrafe non risulta in quella zona | Da chiarire con chi ha fatto il rilievo |
