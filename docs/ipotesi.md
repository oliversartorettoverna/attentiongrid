# Ipotesi e parametri

Ogni numero che non viene da un dato misurato sta qui, con il suo stato. I valori usati dal codice sono in `config/scenario.yaml` e `config/pesi_rischio.yaml`: se ne cambi uno, aggiorna anche questa tabella.

Stato: **validato** = da fonte o misura; **da validare** = stima nostra, da confermare con interviste o dati; **scelta** = decisione di progetto.

## Operatività

| Parametro | Valore | Stato | Da dove viene / come validarlo |
|---|---|---|---|
| Durata media di un intervento remoto | 35 s | da validare | Ricavata da Cruise: una sessione ogni 4–5 miglia, assistenza per il 2–4% del tempo, 14 mph di media a San Francisco (vedi sotto); da confermare nelle interviste |
| Tempo massimo di attesa accettabile | 20 s | da validare | Cruise: 98% delle richieste gestite entro 3 s (robotaxi). Per un veicolo lento che si ferma in sicurezza assumiamo 20 s |
| Livello di servizio | 90% delle richieste entro il tempo massimo | scelta | Standard dei call center |
| Persone per coprire una postazione 24/7 | circa 5 (da 4,2 a 5,4) | validato | Regola dei call center (Call Centre Helper) |
| Veicoli per operatore, oggi | 1:1 per Poste | validato | Scheda della sfida Poste |
| Limite umano nella supervisione | 4–6 robot per operatore | validato (laboratorio) | Crandall & Cummings 2007 |
| Turni fissi di una centrale senza previsione | 06–14, 14–22, 22–24 | scelta | Turni da 8 ore di una sala operativa; l'ultimo copre solo fino a fine servizio |
| Cambio di personale con il piano | al massimo una volta l'ora | scelta | Più spesso non è realistico organizzare i turni |
| Verifica del piano | 20 giornate simulate dalla previsione; ogni ora deve rispettare il servizio in almeno il 95% | scelta | Il piano non vede mai la giornata del rigioco |
| Spostamento massimo delle partenze | ±10 minuti | da validare | Margine che un cliente accetta sulle consegne; da chiedere a Poste |
| Operatori fissi nel pannello animato "senza" | 3 | scelta | Serve solo all'animazione; il confronto del pitch è a parità di servizio |

## Traffico

| Parametro | Valore | Stato | Fonte |
|---|---|---|---|
| Velocità media nelle ore di punta (07–10, 17–20) | 16,7 km/h | validato | TomTom Traffic Index, Roma |
| Velocità media di giorno | 19,5 km/h | validato | TomTom Traffic Index, Roma (10 km in 30 min 46 s, media dell'anno) |
| Velocità dalle 21 | 30 km/h, poi il massimo di ogni veicolo | stima | Traffico libero la sera |

Ogni veicolo va alla velocità del traffico, fino al suo massimo.

## Flotte della centrale condivisa

| Flotta | Veicoli | Velocità massima | Giri | Stato |
|---|---|---|---|---|
| Poste · BOXi | 50 | 25 km/h (**validato**, scheda BOXi) | 3 ondate (08:30, 12:00, 16:00) da 8 fermate, 90 s per fermata; partono dall'ufficio postale Roma 5 in Prati | numero di veicoli **scelta**; 3 giri per restare sotto i 60 km di autonomia (**validato**, scheda BOXi); sosta **stima** |
| Corriere A · furgoni | 40 | 50 km/h (limite urbano) | 3 ondate (08:00, 12:30, 16:30) da 12 fermate, 150 s per fermata; deposito a Porta Portese | **scelta** (corriere ipotetico) |
| Corriere B · furgoni | 30 | 50 km/h | 3 ondate (09:00, 13:30, 17:00) da 12 fermate, 150 s; deposito in Borgo | **scelta** (corriere ipotetico) |
| Navette di linea | 30 | 25 km/h | 3 linee avanti e indietro, fermata ogni 400 m, 20 s per fermata, servizio 06:30–23:30; orario fisso, partenze non spostabili | **scelta** |

Le ondate mettono in strada molti mezzi insieme: è questo che crea i picchi che il sistema prevede e sfasa.

## Leve in tempo reale

Sopra il piano dei turni la centrale usa quattro leve, con i preavvisi che ha davvero (`engine/tempo_reale.py`, parametri in `config/scenario.yaml`, sezione `tempo_reale`).

| Leva | Parametri | Stato |
|---|---|---|
| Previsione a breve | carico atteso nei prossimi 15 minuti; meteo e radar noti 2 ore prima | **stima** |
| 1. Operatori misti | un quarto di chi è in turno fa back-office e passa alla supervisione in 1 minuto | **stima** |
| 2. Prolungamento del turno | fino a 1 ora in più, deciso con 30 minuti di preavviso, straordinario +25% | **stima** |
| 3. Reperibilità | 2 persone per turno, operative 45 minuti dopo la chiamata, per almeno 2 ore; indennità pari al 15% del costo orario | **stima** |
| 4. Meno richieste | partenze ritardate al massimo di 10 minuti, soste prima delle vie a rischio al massimo di 10 minuti a veicolo (vie a rischio = 5% dei tratti più rischiosi della fascia) | **da validare** con Poste |

## Costi

Gli stessi del foglio "Modello – costi, prezzo e mercato" nel Drive; valori in `config/economia.yaml`.

| Parametro | Valore | Stato | Fonte |
|---|---|---|---|
| Paese di riferimento | Germania | scelta | Come nel foglio del modello di business nel Drive |
| Stipendio lordo annuo di un operatore | 45.000 € | validato | gehalt.de (Leitstellendisponent, circa 3.710 €/mese); StepStone circa 42.300 €/anno |
| Costo azienda sul lordo | ×1,21 | stima | Contributi a carico del datore di lavoro |
| Persone per una postazione 24 ore su 24 | 5 | validato | Call Centre Helper (4,2–5,4) |
| Costi extra | +15% | stima | Capiturno, formazione, sala |
| Costo di un'ora di postazione | 35,74 € | calcolato | 45.000 × 1,21 × 5 × 1,15 / 8.760 ore |
| Canone per veicolo al mese | 2.500 € | da validare | Prezzo del servizio completo, Germania |

Il costo per veicolo al mese di ogni piano è ore operatore × 35,74 € × 365 / 12, diviso per i 150 veicoli. Per un cliente italiano come Poste va rifatto con lo stipendio italiano.

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
| Scuola | scuola entro 100 m (OSM + anagrafe del Ministero) e fascia 07:45–08:30, 12:30–14:00 o 16:00–17:00 (entrata e uscite) | 0,03 | **stima**; l'elenco delle scuole viene dal Ministero perché OSM mancava 3 scuole su 4 viste nel rilievo |
| Pioggia forte | pioggia > 4 mm/h | moltiplica per 1,7 i tre fattori sopra | **da letteratura**: con la pioggia gli incidenti aumentano in media del 71% (meta-analisi di 34 studi, [Qiu e Nixon 2008](https://journals.sagepub.com/doi/10.3141/2055-16)). È un dato sui guidatori umani, usato come approssimazione |
| Base | sempre | 0,002 | **stima**: blocchi non spiegati dagli altri fattori; impatto trascurabile (sensibilità) |
| Sottopasso | sottovia stradale (OSM `tunnel=yes` su strade principali) e pioggia > 4 mm/h | 0,2 | **stima** (Waymo sospende il servizio per allagamenti, mag. 2026); impatto trascurabile sul risultato |
| GPS in canyon urbano | altezza edifici / distanza tra le facciate > 1,5 | 0,005 | **stima** (BOXi ha sensori inerziali); impatto trascurabile |
| Abbagliamento | sole sotto 15°, allineato con la strada (< 20°) e nuvolosità ≤ 70% | 0,02 | **stima** (NHTSA indaga Tesla per sole basso); nel 3/10/2024 il cielo è coperto e vale zero |

**Rilievo in strada (`data/rilievo/rilievo_prati_trastevere.csv`).** 8 vie, 2 e 5 ottobre 2026, 16:00–17:30: auto in doppia fila lungo il tratto, pedoni che attraversano in 5 minuti, scuole e uscita in corso. Limiti: una misura per via e nessuna misura fuori dall'orario di uscita, quindi l'effetto della scuola non si può separare da quello della via. Via Ottaviano e Via della Lungaretta sono pedonali e servono solo per la regola dei pedoni.

**Durata degli interventi.** Cruise dichiara assistenza remota per il 2–4% del tempo, con una richiesta ogni 4–5 miglia. A 14 mph di media 4,5 miglia sono circa 19 minuti di guida, e il 3% di 19 minuti fa circa 35 s: è il valore che usiamo. La sensibilità prova anche 17 s e 52 s (±50%).

## Soglie della griglia dell'attenzione

| Parametro | Valore | Stato | Da dove viene |
|---|---|---|---|
| Orizzonte | 3 minuti | scelta | Provati 2, 3 e 5 minuti sul primo scenario (12 BOXi, pomeriggio): separano allo stesso modo; 3 lascia all'operatore 2 minuti di anticipo |
| Soglia giallo (attenzione) | P ≥ 0,15 di almeno una richiesta nei prossimi 3 minuti (score sotto 85) | scelta | `python tools/soglie.py` sulla giornata della centrale: il giallo fa da preavviso, così un veicolo verde chiama di rado |
| Soglia rosso (critico) | P ≥ 0,35 (score sotto 65) | scelta | `tools/soglie.py`: il rosso resta al 15% del tempo |
| Autonomy Confidence Score | 100 × (1 − P) | scelta | È lo stesso numero della griglia, letto al contrario per l'operatore |

Con queste soglie, nello scenario della centrale (150 veicoli, giornata intera), i veicoli in movimento sono verdi il 38% del tempo, gialli il 47%, rossi il 15%. Delle richieste, il 36% arriva da un veicolo che 2 minuti prima era rosso, il 50% da uno giallo e il 14% da uno verde; un rosso chiede aiuto 6,5 volte più spesso di un verde. In media 9 veicoli sono rossi nello stesso momento, più degli operatori in turno (6,5 in media): il rosso dice quali veicoli guardare per primi, non assegna un operatore a ciascuno.

Le alternative provate (`tools/soglie.py`): con 0,25 e 0,45 il rosso anticipa il 23% delle richieste e il giallo o rosso il 63%; con 0,20 e 0,35 il 37% e il 76%. Nessuna coppia anticipa quasi tutte le richieste con pochi veicoli colorati, perché il rischio è diffuso sulla città e le richieste sono in parte casuali.

**Limite:** la verifica è fatta sulla simulazione, dove le richieste sono estratte dalle stesse probabilità; la verifica vera richiede il registro degli interventi di una flotta reale.

## Sensibilità: il risultato regge se i pesi sono sbagliati?

`python tools/sensibilita.py` rifà rischio, piano prudente e rigioco cambiando un parametro alla volta (−50% e +50%) e poi tutti i pesi insieme. Risultati sulla centrale a 150 veicoli, giovedì 3 ottobre 2024 (21 corse):

| Cosa cambia | Risparmio di ore operatore a parità di servizio | Richieste nella giornata |
|---|---|---|
| Riferimento | 59% | 5.287 |
| Ogni peso del rischio a −50% o +50%, uno alla volta | 56–65% | 3.871–6.644 |
| Tutti i pesi insieme a −50% / +50% | 49% / 67% | 2.478 / 8.422 |
| Durata media dell'intervento 17 s / 52 s | 59% / 62% | 5.287 |
| Attesa massima 10 s / 30 s | 58% / 61% | 5.287 |

Il risparmio resta tra **49% e 67%** in tutte le varianti: dipende dalla forma della curva (i picchi previsti), non dal valore preciso dei pesi. Quello che cambia molto è il numero di richieste, e quindi i veicoli per operatore con il sistema (da 6,2 a 14,3). Le richieste rimaste in attesa oltre 60 secondi con il sistema sono tra 0 e 12, tranne con il peso dei sottopassi a +50% (53, contro 847 senza sistema).

**Limite delle soglie della griglia:** sono valori fissi. Con le soglie precedenti (0,25 e 0,45), con tutti i pesi a metà nessuna richiesta arrivava da un veicolo rosso e con tutti a +50% ne arrivava il 47%: se i pesi veri sono diversi, le soglie vanno ritarate sul registro degli interventi della flotta.

## Il piano regge se il temporale non arriva quando previsto?

`python tools/prova_pianificazione.py` fa i piani sulla previsione e li verifica sulla giornata vera, anche con il temporale previsto un'ora prima o un'ora dopo di quando arriva (risultati in `console/data/scenario/piani.json`).

| Il temporale arriva | Turni fissi sul picco del turno | Piano normale | Piano prudente |
|---|---|---|---|
| Come previsto | 222 ore, 97% entro 20 s nell'ora peggiore | 113 ore, 94% | 117 ore, 94% |
| Un'ora prima del previsto | 198 ore, 73% | 110 ore, 34% | 116 ore, 94% |
| Un'ora dopo il previsto | 222 ore, 97% | 110 ore, 3% | 117 ore, 94% |

Nella console la giornata con il temporale un'ora prima del previsto (tasto T) usa il piano prudente con le partenze sfasate sulla previsione sbagliata: nell'ora peggiore prende l'88% delle richieste entro 20 s (il piano normale il 34%) e nessuna richiesta aspetta più di 60 s; lo sfasamento fatto sulla previsione sbagliata costa qualche punto rispetto al 94% del piano prudente da solo.

Il piano prudente rifà il piano con il temporale anticipato e ritardato di un'ora (ricalcolando il rischio, perché la pioggia sull'uscita da scuola pesa più della somma delle due) e tiene il massimo: costa 4 ore in più del piano normale e regge in tutti e tre i casi.

## Scenario della demo

| Parametro | Valore | Stato |
|---|---|---|
| Area | Prati e Trastevere (riquadro in `config/scenario.yaml`) | scelta |
| Giorno | giovedì 3 ottobre 2024, giorno di scuola. Pioggia (Open-Meteo, Ponte Garibaldi): 5,0 mm alle 16, 4,2 alle 17, 3,7 alle 18. Nell'autunno 2025 nessun giorno feriale superava 4 mm/h alle 16 e alle 17 | scelta |
| Finestra | 06:00–24:00, la giornata intera della centrale; picco del rischio 16:00–17:30 | scelta |
| Flotte | 150 veicoli di 4 gestori: 50 BOXi, 40 + 30 furgoni di due corrieri, 30 navette di linea (vedi "Flotte della centrale condivisa") | scelta |
| Deposito BOXi | ufficio postale Roma 5, Prati | scelta |

## Console dell'operatore

| Parametro | Valore | Stato | Dove |
|---|---|---|---|
| Postazione di chi usa la console | 3 (le richieste che il motore le assegna aspettano l'operatore) | scelta | `config/scenario.yaml`, `console` |
| Passa a un collega se non la prendi | dopo 60 s | scelta | `config/scenario.yaml`, `console` |
| Fermo dopo "assistenza in strada" | 10 minuti | stima | `config/scenario.yaml`, `console` |
| Fermo dopo "arresto" | 15 minuti | stima | `config/scenario.yaml`, `console` |
| Cause alla chiusura | pedoni, doppia fila o ostacolo, uscita scuola o folla, pioggia o visibilità, GPS o sensori, altro | scelta | `config/scenario.yaml`, `console` |

Alla postazione 3 il motore assegna circa una richiesta al minuto nell'ora del temporale: un ritmo da seguire a velocità 1×.

## GPS in diretta

Ogni tratto ha una precisione del GPS stimata dal rapporto canyon (altezza dei palazzi / distanza tra le facciate, misurato con Copernicus e OSM). In console un veicolo prende la precisione della strada che sta percorrendo: è lo stato che una flotta vera riporta dal veicolo, e che il BOXi-telefono manderà misurato dal browser.

| Parametro | Valore | Stato |
|---|---|---|
| Precisione a cielo aperto | 3 m | stima (GNSS per auto: 2–5 m) |
| Peggioramento con il canyon | +5 m per ogni punto di rapporto oltre 0,5 (circa 10 m con rapporto 2, 15 m nei vicoli più stretti) | stima |
| GPS degradato | da 10 m: 180 tratti su 1.769, circa il 10% | scelta |
| Segnale assente | nei 9 sottopassi | stima |
| Effetto sullo score mentre il GPS è degradato | +15% di probabilità di richiesta (+30% senza segnale), come una causa in più | scelta |

Nel rischio previsto il motore tiene già un piccolo contributo per il GPS in canyon (0,005 per tratto): quello è la previsione, questo è lo stato del momento. Nella giornata della centrale ci sono in ogni momento 5–6 veicoli con il GPS degradato su 80–90 in strada.

## BOXi in sala

| Parametro | Valore | Stato |
|---|---|---|
| Sede | Spazio Attivo Roma Casilina, Via Casilina 3T (41,8902 N, 12,5179 E, geocodifica OSM) | da confermare sul posto |
| Score con GPS buono | 95 (probabilità base 5%) | scelta |
| Attenzione | precisione da 10 m: +15% di probabilità, score circa 81 | scelta |
| Critico | precisione da 25 m o nessun fix (al chiuso): +40%, score circa 57, si apre una richiesta | scelta, da tarare provando nel posto vero |
| Offline | nessun segnale per 5 s | scelta |

Le soglie vanno provate nella sede: se anche fuori il GPS è debole (portici, palazzi alti) il veicolo parte già giallo.

## Copilota AI

| Parametro | Valore | Stato | Dove |
|---|---|---|---|
| Modello | `claude-opus-5-5` | scelta | `config/scenario.yaml`, `copilota` |
| Effort | `low` (risposta in pochi secondi, dentro i 20 s dell'intervento) | scelta | `config/scenario.yaml`, `copilota` |
| Attesa massima della risposta | 8 s, poi il ripiego dai dati del motore | scelta | `config/scenario.yaml`, `copilota` |

Il copilota suggerisce e scrive la nota; decide l'operatore. Lo score resta quello deterministico del motore: ogni colore ha un motivo spiegabile senza l'AI.

## Scelte grafiche dell'app

Non toccano il modello: decidono solo cosa si vede.

| Parametro | Valore | Dove | Stato |
|---|---|---|---|
| Strada colorata di arancio | rischio ≥ 60‰ per passaggio (circa il 95° percentile della giornata) | `web/src/components/Mappa.tsx` | scelta |
| Strada colorata di rosso | rischio ≥ 100‰ (circa il 99° percentile) | `web/src/components/Mappa.tsx` | scelta |
| Inizio della demo | 15:40, poco prima del temporale | `web/src/lib/orologio.ts` | scelta |
| Rotazione della mappa | 0,4° per pixel, inclinazione 0,3° per pixel, al massimo 70° | `web/src/components/Mappa.tsx` | scelta, a sensazione come Google Maps |

## Dati mancanti

| Dato | Situazione | Cosa usiamo |
|---|---|---|
| Altezza edifici | In OSM solo 470 edifici su 5.598 hanno altezza o numero di piani | Copernicus Urban Atlas Building Height 2012 (satellite, celle di 10 m, precisione verticale 3 m) per 4.991 edifici; 15 m di riserva solo per 137 edifici (76 tratti su 1.769) |
| Scuole | OSM ha 26 scuole nell'area e non conosceva 3 delle 4 viste nel rilievo | Anagrafe del Ministero dell'Istruzione 2025/26 (statali e paritarie, senza corsi serali), geolocalizzata dall'indirizzo: 44 sedi; 117 indirizzi su 136 trovati |
| Scuola su Via di S. Francesco a Ripa | Il rilievo indica l'IC Giovan Battista Vico, che nell'anagrafe non risulta in quella zona | Da chiarire con chi ha fatto il rilievo |
