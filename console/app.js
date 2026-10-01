// Console della demo. Legge i file prodotti da engine/pipeline.py (formati: docs/formati-dati.md).
// Dati: ?dati=scenario (default, dati veri) oppure ?dati=esempio (dati finti di tools/genera_esempio.py).
// Tasti: spazio avvia/ferma · 1 vai a poco prima del picco · ← → ±10 minuti · R risultato · F schermo intero.
// TODO: finale multi-flotta (?dati=scenario_multiflotta).

const NS = "http://www.w3.org/2000/svg";
const COLORI = { boxi: "var(--boxi)", navetta: "var(--navetta)", robot: "var(--robot)" };
const NOMI_FLOTTA = { boxi: "BOXi", navetta: "Navetta", robot: "Robot" };
const LIVELLI = { verde: 0, giallo: 1, rosso: 2 };
// Fasce di colore delle strade, in millesimi di probabilità di intervento per passata
const FASCE_STRADE = [
  { da: 115, colore: "#ff3b3b", largo: 3.6, alone: 0.22 },
  { da: 85, colore: "#ff7a1a", largo: 3.0, alone: 0.12 },
  { da: 55, colore: "#8a5410", largo: 2.4, alone: 0 },
];

const sec = (s) => { const [h, m, x = 0] = s.split(":").map(Number); return h * 3600 + m * 60 + x; };
const hm = (s) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
const virgola = (n, dec = 1) => Number(n).toFixed(dec).replace(".", ",").replace(/,0$/, "");
const el = (id) => document.getElementById(id);

async function carica(cartella) {
  const obbligatori = ["tratti.geojson", "veicoli.json", "rigioco.json", "kpi.json", "carico.json"];
  const facoltativi = ["attenzione.json", "rischio_console.json"];
  const leggi = (n, serve) => fetch(`data/${cartella}/${n}`, { cache: "no-store" }).then((r) => {
    if (!r.ok) { if (serve) throw new Error(n); return null; }
    return r.json();
  });
  const [tratti, veicoli, rigioco, kpi, carico, attenzione, rischio] = await Promise.all([
    ...obbligatori.map((n) => leggi(n, true)), ...facoltativi.map((n) => leggi(n, false)),
  ]);
  return { tratti, veicoli, rigioco, kpi, carico, attenzione, rischio };
}

function proiezione(tratti) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of tratti.features) for (const [lon, lat] of f.geometry.coordinates) {
    x0 = Math.min(x0, lon); x1 = Math.max(x1, lon); y0 = Math.min(y0, lat); y1 = Math.max(y1, lat);
  }
  const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
  const L = 1000, W = (x1 - x0) * k, H = y1 - y0, s = L / Math.max(W, H);
  return { w: W * s + 20, h: H * s + 20, p: (lon, lat) => [10 + (lon - x0) * k * s, 10 + (y1 - lat) * s] };
}

function nuovo(tag, attributi = {}, padre = null) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attributi)) n.setAttribute(k, v);
  if (padre) padre.appendChild(n);
  return n;
}

function disegnaMappa(svg, tratti, pr, conRischio) {
  svg.setAttribute("viewBox", `0 0 ${pr.w} ${pr.h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const punti = (f) => f.geometry.coordinates.map(([lo, la]) => pr.p(lo, la).map((x) => x.toFixed(1)).join(",")).join(" ");
  const base = nuovo("g", { class: "strade" }, svg);
  for (const f of tratti.features) nuovo("polyline", { points: punti(f) }, base);
  const calde = {};
  if (conRischio) {
    const aloni = nuovo("g", { class: "calde" }, svg), linee = nuovo("g", { class: "calde" }, svg);
    for (const f of tratti.features) {
      const id = f.properties.seg_id, pt = punti(f);
      calde[id] = [nuovo("polyline", { points: pt, stroke: "transparent" }, aloni),
                   nuovo("polyline", { points: pt, stroke: "transparent" }, linee)];
    }
  }
  return { calde, veicoli: nuovo("g", {}, svg) };
}

function posizione(percorso, t) {
  if (t < percorso[0][0] || t > percorso[percorso.length - 1][0]) return null;
  let a = 0, b = percorso.length - 1;
  while (b - a > 1) { const m = (a + b) >> 1; if (percorso[m][0] <= t) a = m; else b = m; }
  const [ta, la1, lo1] = percorso[a], [tb, la2, lo2] = percorso[b];
  const x = tb > ta ? (t - ta) / (tb - ta) : 0;
  return [la1 + (la2 - la1) * x, lo1 + (lo2 - lo1) * x];
}

function statoRichieste(eventi, t) {
  // per ogni veicolo: richiesta in attesa (rosso) o in gestione (arancione) all'istante t
  const stato = {};
  let attesa = 0, gestione = 0, attesaMax = 0;
  for (const e of eventi) {
    if (e._t > t) break;
    const t1 = e._t + e.attesa_s, t2 = t1 + e.durata_s;
    if (t < t1) { stato[e.veicolo_id] = { tipo: "attesa", da: t - e._t }; attesa++; attesaMax = Math.max(attesaMax, t - e._t); }
    else if (t < t2) { stato[e.veicolo_id] = stato[e.veicolo_id] || { tipo: "gestione", operatore: e.operatore }; gestione++; }
  }
  return { stato, attesa, gestione, attesaMax };
}

function mediaMobile(v, n) {
  const out = []; let s = 0;
  v.forEach((x, i) => { s += x; if (i >= n) s -= v[i - n]; out.push(s / Math.min(i + 1, n)); });
  return out;
}

async function avvia() {
  const qs = new URLSearchParams(location.search);
  let cartella = qs.get("dati") || "scenario", d;
  try { d = await carica(cartella); } catch { cartella = "esempio"; d = await carica(cartella); }

  for (const lato of ["senza", "con"]) {
    for (const v of d.veicoli[lato]) v.percorso = v.percorso.map(([o, la, lo]) => [sec(o), la, lo]);
    for (const e of d.rigioco[lato]) e._t = sec(e.ora);
    d.rigioco[lato].sort((a, b) => a._t - b._t);
  }
  const inizio = sec(d.carico.orari[0]), fine = inizio + d.carico.orari.length * 60;
  const flotte = [...new Set(d.veicoli.con.map((v) => v.flotta))];
  const nVeicoli = d.veicoli.con.length;
  const data = new Date(`${d.rischio?.data}T12:00`);
  const giorno = isNaN(data) ? null : data.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  el("scenario").innerHTML = cartella === "esempio"
    ? "<b>Dati di esempio</b> · quartiere finto"
    : `<b>Roma · Prati e Trastevere</b><br>${giorno ? giorno + " · " : ""}temporale e uscita delle scuole · ${nVeicoli} veicoli`;

  // Mappe
  const pr = proiezione(d.tratti);
  const mappe = {};
  for (const lato of ["senza", "con"]) {
    const svg = document.querySelector(`#l-${lato} svg`);
    const m = disegnaMappa(svg, d.tratti, pr, lato === "con" && d.rischio);
    m.punti = {};
    for (const v of d.veicoli[lato]) {
      const g = nuovo("g", {}, m.veicoli);
      const anello = nuovo("circle", { r: 9, class: "anello-attesa", style: "display:none" }, g);
      const livello = nuovo("circle", { r: 13, fill: "none", "stroke-width": 3, stroke: "transparent" }, g);
      const punto = nuovo("circle", { r: 7.5, fill: COLORI[v.flotta] || "#fff", stroke: "#07090c", "stroke-width": 2 }, g);
      m.punti[v.veicolo_id] = { g, anello, livello, punto, flotta: v.flotta };
    }
    mappe[lato] = m;
  }

  // Strade colorate per rischio (solo nel pannello con il sistema: senza previsione l'operatore non vede il rischio)
  let fasciaDisegnata = -1;
  function coloraStrade(t) {
    if (!d.rischio) return;
    const i = Math.min(d.rischio.fasce.length - 1, Math.max(0, Math.floor((t - sec(d.rischio.fasce[0])) / 300)));
    if (i === fasciaDisegnata) return;
    fasciaDisegnata = i;
    for (const [seg, [alone, linea]] of Object.entries(mappe.con.calde)) {
      const p = d.rischio.p_millesimi[seg]?.[i] ?? 0;
      const f = FASCE_STRADE.find((x) => p >= x.da);
      if (!f) { linea.setAttribute("stroke", "transparent"); alone.setAttribute("stroke", "transparent"); continue; }
      linea.setAttribute("stroke", f.colore); linea.setAttribute("stroke-width", f.largo);
      if (f.alone) { alone.setAttribute("stroke", f.colore); alone.setAttribute("stroke-width", 12); alone.setAttribute("stroke-opacity", f.alone); }
      else alone.setAttribute("stroke", "transparent");
    }
  }

  // Griglia dell'attenzione: una tessera per veicolo, riordinate per bisogno di attenzione
  const tessere = {};
  for (const v of d.veicoli.con) {
    const div = document.createElement("div");
    div.className = "tessera";
    const numero = v.veicolo_id.split("_").pop();
    div.innerHTML = `<div class="barra"></div><div><span class="nome"></span> <span class="stato"></span></div><div class="perc"></div><div class="dove"></div>`;
    div.querySelector(".nome").textContent = `${NOMI_FLOTTA[v.flotta] || v.flotta} ${numero}`;
    el("tessere").appendChild(div);
    tessere[v.veicolo_id] = div;
  }
  const att = d.attenzione;
  if (att) {
    const so = att.soglie, va = att.validazione;
    el("legenda").innerHTML = `<i style="background:var(--verde)"></i>P &lt; ${virgola(so.osservazione * 100, 0)}%` +
      `<i style="background:var(--giallo)"></i>${virgola(so.osservazione * 100, 0)}–${virgola(so.intervento * 100, 0)}%` +
      `<i style="background:var(--rosso)"></i>≥ ${virgola(so.intervento * 100, 0)}% · probabilità di una richiesta nei prossimi ${so.orizzonte_min} min<br>` +
      `Nel pomeriggio il ${va.richieste_da_pct.rosso}% delle richieste arriva da un veicolo già rosso ${va.anticipo_s / 60} min prima; ` +
      `i verdi (${va.tempo_pct.verde}% del tempo) non richiedono attenzione.`;
  }

  function aggiornaGriglia(t, richieste) {
    const minuto = Math.floor((t - inizio) / 60);
    const righe = [];
    const conta = [0, 0, 0];
    for (const v of d.veicoli.con) {
      const id = v.veicolo_id, r = richieste.stato[id];
      const s = att?.veicoli[id]?.[minuto] || [-1];
      let classe, stato, perc = "", dove = "", ordine;
      if (r?.tipo === "attesa") { classe = "l2"; stato = `fermo · in attesa ${Math.round(r.da)} s`; ordine = 0; conta[2]++; }
      else if (r?.tipo === "gestione") { classe = "lg"; stato = `in gestione · operatore ${r.operatore + 1}`; ordine = 1; conta[2]++; }
      else if (s[0] === -1) { classe = "lf"; stato = "al deposito"; ordine = 5; }
      else {
        classe = `l${s[0]}`; ordine = 4 - s[0]; conta[s[0]]++;
        stato = ["autonomo", "in osservazione", "intervento probabile"][s[0]];
        perc = `${Math.round(s[1] * 100)}%`;
        if (s[0] > 0 && s[2]) dove = `${s[2]}${s[3] ? " · " + s[3] : ""} · tra ${Math.max(0, Math.round(s[4]))} s`;
        else if (s[2]) dove = s[2];
      }
      righe.push({ id, classe, stato, perc, dove, ordine, p: s[1] || 0 });
    }
    righe.sort((a, b) => a.ordine - b.ordine || b.p - a.p);
    const box = el("tessere"), alto = box.clientHeight;
    // le tessere si stringono per starci tutte; sotto i 50 px resta una riga sola (senza la via)
    const h = Math.max(30, Math.min(70, alto / righe.length - 6)), compatta = h < 50;
    righe.forEach((r, i) => {
      const div = tessere[r.id];
      div.className = `tessera ${r.classe}${compatta ? " compatta" : ""}`;
      div.style.transform = `translateY(${i * (h + 6)}px)`;
      div.style.height = `${h}px`;
      div.querySelector(".stato").textContent = r.stato;
      div.querySelector(".perc").textContent = r.perc;
      div.querySelector(".dove").textContent = r.dove;
    });
    el("n-verde").textContent = conta[0]; el("n-giallo").textContent = conta[1]; el("n-rosso").textContent = conta[2];
    return conta;
  }

  // Previsione del picco: guarda avanti nel piano degli operatori
  const sfasati = Object.values(d.kpi.spostamenti_min || {}).filter((x) => x).length;
  function aggiornaPrevisione(t) {
    const piano = d.carico.con.operatori_necessari, i = Math.floor((t - inizio) / 60);
    const box = el("previsione");
    if (i < 0 || i >= piano.length) { box.classList.remove("visibile"); return; }
    const ora = piano[i];
    let jMax = i;
    for (let j = i; j < Math.min(piano.length, i + 45); j++) if (piano[j] > piano[jMax]) jMax = j;
    if (piano[jMax] > ora && piano[jMax] - ora >= 2) {
      const tra = jMax - i;
      box.innerHTML = `<b>Picco previsto tra ${tra} min</b> (${hm(inizio + jMax * 60)}): servono <b>${piano[jMax]} operatori</b>, ora ${ora}. ` +
        `Turno rinforzato in anticipo${sfasati ? `, ${sfasati} partenze già sfasate` : ""}.`;
      box.classList.add("visibile");
    } else box.classList.remove("visibile");
  }

  // Numeri in basso, sempre visibili
  const k = d.kpi, pari = k.parita_servizio;
  const numeri = [
    ["Veicoli fermi oltre 60 s", k.senza.veicoli_fermi_oltre_60s, k.con.veicoli_fermi_oltre_60s, 0],
    ["Attesa media", `${k.senza.attesa_media_s} s`, `${k.con.attesa_media_s} s`],
    ...(pari ? [["Veicoli per operatore · stesso servizio", virgola(pari.senza.veicoli_per_operatore), virgola(pari.con.veicoli_per_operatore)],
                ["Ore operatore · stesso servizio", virgola(pari.senza.ore_operatore), virgola(pari.con.ore_operatore)]]
             : [["Veicoli per operatore", virgola(k.senza.veicoli_per_operatore), virgola(k.con.veicoli_per_operatore)]]),
  ];
  el("numeri").innerHTML = numeri.map(([e, a, b]) => `<div><span class="etichetta">${e}</span><b><s>${a}</s> → <em>${b}</em></b></div>`).join("");

  // Risultato finale
  if (pari) {
    const risparmio = Math.round(100 * (1 - pari.con.ore_operatore / pari.senza.ore_operatore));
    const molt = pari.con.veicoli_per_operatore / pari.senza.veicoli_per_operatore;
    el("ris-sotto").textContent = giorno || "dati di esempio";
    el("ris-tre").innerHTML = [
      [`−${risparmio}%`, "ore operatore", `${virgola(pari.senza.ore_operatore)} → ${virgola(pari.con.ore_operatore)} ore nel pomeriggio, stesso livello di servizio`],
      [`×${virgola(molt)}`, "veicoli per operatore", `da ${virgola(pari.senza.veicoli_per_operatore)} a ${virgola(pari.con.veicoli_per_operatore)}`],
      [`${k.con.veicoli_fermi_oltre_60s}`, "veicoli fermi oltre un minuto", `invece di ${k.senza.veicoli_fermi_oltre_60s} con ${d.carico.senza.operatori_in_turno[0]} operatori fissi`],
    ].map(([g, c, da]) => `<div><div class="grande">${g}</div><div class="cosa">${c}</div><div class="da">${da}</div></div>`).join("");
    el("ris-nota").textContent = `Livello di servizio: ${pari.con.entro_attesa_max_pct}% (con) e ${pari.senza.entro_attesa_max_pct}% (senza) delle richieste gestite entro 20 s. ` +
      "Rischio calcolato da dati aperti (OpenStreetMap, Open-Meteo); i pesi sono stime da validare.";
  }
  const mostraRisultato = (si) => el("risultato").classList.toggle("visibile", si);

  // Linea del tempo
  const tela = el("curva");
  const curvaSenza = mediaMobile(d.carico.senza.richieste_attese, 5), curvaCon = mediaMobile(d.carico.con.richieste_attese, 5);
  const maxCurva = Math.max(...curvaSenza, ...curvaCon, 0.01) * 1.1;
  function disegnaCurva(t) {
    const dpr = window.devicePixelRatio || 1, W = tela.clientWidth, H = tela.clientHeight;
    tela.width = W * dpr; tela.height = H * dpr;
    const c = tela.getContext("2d"); c.scale(dpr, dpr); c.clearRect(0, 0, W, H);
    const n = curvaSenza.length, alto = H - 16, x = (i) => (i / (n - 1)) * W, y = (v) => alto - (v / maxCurva) * (alto - 6);
    if (d.rischio?.pioggia_mm) {
      c.fillStyle = "#16384a";
      d.rischio.pioggia_mm.forEach((mm, i) => { if (mm > 4) c.fillRect(x(i * 5), 0, x(5) + 1, alto); });
    }
    c.font = "600 11px ui-monospace, Menlo, monospace"; c.fillStyle = "#7d8a99"; c.strokeStyle = "#1c2530"; c.lineWidth = 1;
    for (let i = 0; i < n; i += 60) {
      c.beginPath(); c.moveTo(x(i), 0); c.lineTo(x(i), alto); c.stroke();
      c.fillText(hm(inizio + i * 60), Math.min(x(i) + 3, W - 40), H - 2);
    }
    for (const [curva, colore, largo] of [[curvaSenza, "#7d8a99", 2], [curvaCon, "#38d6ff", 3]]) {
      c.strokeStyle = colore; c.lineWidth = largo; c.beginPath();
      curva.forEach((v, i) => (i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v))));
      c.stroke();
    }
    const xt = ((t - inizio) / (fine - inizio)) * W;
    c.fillStyle = "rgba(7,9,12,.55)"; c.fillRect(xt, 0, W - xt, alto);
    c.strokeStyle = "#e8edf2"; c.lineWidth = 2; c.beginPath(); c.moveTo(xt, 0); c.lineTo(xt, alto); c.stroke();
  }

  let t = inizio, inCorso = false, ultimo = null;

  function disegna() {
    el("ora").textContent = hm(t);
    const minuto = Math.min(d.carico.orari.length - 1, Math.max(0, Math.floor((t - inizio) / 60)));
    if (d.rischio?.pioggia_mm) {
      const mm = d.rischio.pioggia_mm[Math.min(d.rischio.pioggia_mm.length - 1, Math.floor(minuto / 5))];
      el("pioggia").textContent = mm == null ? "" : `PIOGGIA ${virgola(mm)} mm/h`;
      el("pioggia").classList.toggle("forte", mm > 4);
    }
    coloraStrade(t);
    let richiesteCon;
    for (const lato of ["senza", "con"]) {
      const m = mappe[lato], s = statoRichieste(d.rigioco[lato], t);
      if (lato === "con") richiesteCon = s;
      for (const v of d.veicoli[lato]) {
        const pos = posizione(v.percorso, t), q = m.punti[v.veicolo_id];
        if (!pos) { q.g.style.display = "none"; continue; }
        const [px, py] = pr.p(pos[1], pos[0]);
        q.g.style.display = ""; q.g.setAttribute("transform", `translate(${px.toFixed(1)},${py.toFixed(1)})`);
        const r = s.stato[v.veicolo_id];
        q.punto.setAttribute("fill", r?.tipo === "attesa" ? "var(--rosso)" : r?.tipo === "gestione" ? "var(--gestione)" : COLORI[q.flotta]);
        q.anello.style.display = r?.tipo === "attesa" ? "" : "none";
        if (lato === "con" && att && !r) {
          const lv = att.veicoli[v.veicolo_id]?.[minuto]?.[0];
          q.livello.setAttribute("stroke", lv === 2 ? "var(--rosso)" : lv === 1 ? "var(--giallo)" : "transparent");
        } else q.livello.setAttribute("stroke", "transparent");
      }
      const box = el(`l-${lato}`);
      const nA = box.querySelector(".n-attesa"), nM = box.querySelector(".n-max");
      nA.textContent = s.attesa; nA.className = "n-attesa" + (s.attesa >= 3 ? " allarme" : "");
      box.querySelector(".n-gestione").textContent = s.gestione;
      nM.innerHTML = `${Math.round(s.attesaMax)}<small>s</small>`; nM.className = "n-max" + (s.attesaMax > 60 ? " allarme" : "");
    }
    el("op-senza").textContent = `${d.carico.senza.operatori_in_turno[minuto]} operatori fissi`;
    el("op-con").textContent = `${d.carico.con.operatori_in_turno[minuto]} operatori in turno · piano su previsione`;
    aggiornaGriglia(t, richiesteCon);
    aggiornaPrevisione(t);
    disegnaCurva(t);
  }

  function passo(ora) {
    if (!inCorso) return;
    if (ultimo !== null) t = Math.min(fine, t + ((ora - ultimo) / 1000) * Number(el("velocita").value));
    ultimo = ora;
    disegna();
    if (t >= fine) { ferma(); setTimeout(() => mostraRisultato(true), 600); return; }
    requestAnimationFrame(passo);
  }
  function ferma() { inCorso = false; el("play").textContent = "▶ Avvia"; }
  function alterna() {
    if (t >= fine) t = inizio;
    inCorso = !inCorso; ultimo = null;
    el("play").textContent = inCorso ? "❚❚ Pausa" : "▶ Avvia";
    if (inCorso) { mostraRisultato(false); requestAnimationFrame(passo); }
  }
  const vai = (nuovo) => { t = Math.max(inizio, Math.min(fine, nuovo)); mostraRisultato(false); disegna(); };
  // "Vai al picco": qualche minuto prima della pioggia forte, così si vede arrivare la previsione
  const primaFasciaForte = d.rischio?.pioggia_mm?.findIndex((mm) => mm > 4) ?? -1;
  const tPicco = primaFasciaForte >= 0 ? sec(d.rischio.fasce[primaFasciaForte]) - 12 * 60 : inizio + 110 * 60;
  el("vai-picco").textContent = `▸ ${hm(tPicco)}`;

  el("play").onclick = alterna;
  el("vai-picco").onclick = () => vai(tPicco);
  el("mostra-risultato").onclick = () => mostraRisultato(!el("risultato").classList.contains("visibile"));
  el("risultato").onclick = () => mostraRisultato(false);
  tela.onclick = (e) => { const r = tela.getBoundingClientRect(); vai(inizio + ((e.clientX - r.left) / r.width) * (fine - inizio)); };
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT") return;
    if (e.code === "Space") { e.preventDefault(); alterna(); }
    else if (e.key === "1") vai(tPicco);
    else if (e.key === "ArrowRight") vai(t + 600);
    else if (e.key === "ArrowLeft") vai(t - 600);
    else if (e.key === "r" || e.key === "R") mostraRisultato(!el("risultato").classList.contains("visibile"));
    else if (e.key === "Escape") mostraRisultato(false);
    else if (e.key === "f" || e.key === "F") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  });
  window.addEventListener("resize", disegna);
  disegna();
}

avvia().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("afterbegin",
    `<p style="padding:16px;color:#ff8a80;position:fixed;z-index:99">Dati non trovati (${e.message}). Lancia prima: python tools/genera_esempio.py</p>`);
});
