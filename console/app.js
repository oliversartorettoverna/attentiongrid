// Console della demo. Legge i file prodotti da engine/pipeline.py (formati: docs/formati-dati.md).
// Dati: ?dati=scenario (default, dati veri) oppure ?dati=esempio (dati finti di tools/genera_esempio.py).
// TODO: finale multi-flotta (?dati=scenario_multiflotta), avvisi che lampeggiano sulla mappa,
// grafica definitiva. Questa è la base funzionante da cui partire.

const COLORI = { boxi: "var(--boxi)", navetta: "var(--navetta)", robot: "var(--robot)" };
const sec = (s) => { const [h, m, x = 0] = s.split(":").map(Number); return h * 3600 + m * 60 + x; };
const hm = (s) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

async function carica(cartella) {
  const nomi = ["tratti.geojson", "veicoli.json", "rigioco.json", "avvisi.json", "kpi.json", "carico.json"];
  const file = await Promise.all(nomi.map((n) => fetch(`data/${cartella}/${n}`).then((r) => {
    if (!r.ok) throw new Error(n);
    return r.json();
  })));
  const [tratti, veicoli, rigioco, avvisi, kpi, carico] = file;
  return { tratti, veicoli, rigioco, avvisi, kpi, carico };
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

function disegnaMappa(svg, tratti, pr) {
  svg.setAttribute("viewBox", `0 0 ${pr.w} ${pr.h}`);
  const ns = "http://www.w3.org/2000/svg";
  for (const f of tratti.features) {
    const pl = document.createElementNS(ns, "polyline");
    pl.setAttribute("points", f.geometry.coordinates.map(([lo, la]) => pr.p(lo, la).join(",")).join(" "));
    svg.appendChild(pl);
  }
}

function posizione(percorso, t) {
  // percorso: [[ora, lat, lon], ...] con ora già in secondi (convertita al caricamento)
  if (t < percorso[0][0] || t > percorso[percorso.length - 1][0]) return null;
  let a = 0, b = percorso.length - 1;
  while (b - a > 1) { const m = (a + b) >> 1; if (percorso[m][0] <= t) a = m; else b = m; }
  const [ta, la1, lo1] = percorso[a], [tb, la2, lo2] = percorso[b];
  const x = tb > ta ? (t - ta) / (tb - ta) : 0;
  return [la1 + (la2 - la1) * x, lo1 + (lo2 - lo1) * x];
}

function statoRichieste(eventi, t) {
  // per ogni veicolo: "attesa" (rosso) o "gestione" (arancione) se ha una richiesta aperta a t
  const stato = {};
  let attesa = 0, gestione = 0;
  for (const e of eventi) {
    const t0 = e._t, t1 = t0 + e.attesa_s, t2 = t1 + e.durata_s;
    if (t >= t0 && t < t1) { stato[e.veicolo_id] = "attesa"; attesa++; }
    else if (t >= t1 && t < t2) { stato[e.veicolo_id] = stato[e.veicolo_id] || "gestione"; gestione++; }
  }
  return { stato, attesa, gestione };
}

function grafico(canvas, curva, inizio, t, max) {
  // stessa scala per i due pannelli, altrimenti il confronto inganna
  const c = canvas.getContext("2d"), W = canvas.width = canvas.clientWidth * 2, H = canvas.height = 140;
  c.clearRect(0, 0, W, H);
  c.strokeStyle = "#6aa8ff"; c.lineWidth = 3; c.beginPath();
  curva.forEach((v, i) => { const x = (i / (curva.length - 1)) * W, y = H - (v / max) * (H - 10); i ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.stroke();
  const x = ((t - inizio) / 60 / (curva.length - 1)) * W;
  c.strokeStyle = "#e7ebf0"; c.lineWidth = 2; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
}

async function avvia() {
  const qs = new URLSearchParams(location.search);
  let cartella = qs.get("dati") || "scenario", d;
  try { d = await carica(cartella); } catch { cartella = "esempio"; d = await carica(cartella); }
  document.getElementById("fonte").textContent = cartella === "esempio" ? "dati di esempio (finti)" : `dati: ${cartella}`;

  for (const lato of ["senza", "con"]) {
    for (const v of d.veicoli[lato]) v.percorso = v.percorso.map(([o, la, lo]) => [sec(o), la, lo]);
    for (const e of d.rigioco[lato]) e._t = sec(e.ora);
  }
  const inizio = sec(d.carico.orari[0]), fine = inizio + d.carico.orari.length * 60;
  const maxCurva = Math.max(...d.carico.senza.richieste_attese, ...d.carico.con.richieste_attese, 0.01);
  const pr = proiezione(d.tratti);
  const pannelli = {};
  const ns = "http://www.w3.org/2000/svg";
  for (const lato of ["senza", "con"]) {
    const el = document.getElementById(`p-${lato}`), svg = el.querySelector("svg");
    disegnaMappa(svg, d.tratti, pr);
    const punti = {};
    for (const v of d.veicoli[lato]) {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("r", 9); c.style.fill = COLORI[v.flotta] || "#fff";
      svg.appendChild(c); punti[v.veicolo_id] = c;
    }
    pannelli[lato] = { el, punti };
  }

  const k = d.kpi, righe = [
    ["Richieste di aiuto", "richieste"], ["Picco di richieste insieme", "picco_richieste_insieme"],
    ["Attesa media (s)", "attesa_media_s"], ["Veicoli fermi oltre 60 s", "veicoli_fermi_oltre_60s"],
    ["Veicoli per operatore", "veicoli_per_operatore"],
  ];
  document.getElementById("kpi").innerHTML = "";
  for (const [etichetta, chiave] of righe) {
    const div = document.createElement("div");
    div.innerHTML = `<span></span><b></b>`;
    div.querySelector("span").textContent = etichetta;
    div.querySelector("b").textContent = `${k.senza[chiave]} → ${k.con[chiave]}`;
    document.getElementById("kpi").appendChild(div);
  }

  const cursore = document.getElementById("cursore");
  cursore.min = inizio; cursore.max = fine; cursore.value = inizio;
  let t = inizio, inCorso = false, ultimo = null;

  function disegna() {
    document.getElementById("orologio").textContent = hm(t);
    const minuto = Math.min(d.carico.orari.length - 1, Math.max(0, Math.floor((t - inizio) / 60)));
    for (const lato of ["senza", "con"]) {
      const { el, punti } = pannelli[lato];
      const s = statoRichieste(d.rigioco[lato], t);
      for (const v of d.veicoli[lato]) {
        const pos = posizione(v.percorso, t), c = punti[v.veicolo_id];
        if (!pos) { c.style.display = "none"; continue; }
        const [x, y] = pr.p(pos[1], pos[0]);
        c.style.display = ""; c.setAttribute("cx", x); c.setAttribute("cy", y);
        c.style.fill = s.stato[v.veicolo_id] === "attesa" ? "var(--attesa)"
          : s.stato[v.veicolo_id] === "gestione" ? "var(--gestione)" : (COLORI[v.flotta] || "#fff");
      }
      el.querySelector(".n-attesa").textContent = s.attesa;
      el.querySelector(".n-gestione").textContent = s.gestione;
      document.getElementById(`op-${lato}`).textContent = `operatori in turno: ${d.carico[lato].operatori_in_turno[minuto]}`;
      grafico(el.querySelector("canvas"), d.carico[lato].richieste_attese, inizio, t, maxCurva);
    }
    const coda = document.getElementById("coda");
    coda.innerHTML = "";
    const visti = new Set();
    const attivi = d.avvisi.filter((a) => sec(a.ora_avviso) <= t && sec(a.ora_evento) >= t)
      .filter((a) => { const k = a.veicolo_id + a.nome_via; if (visti.has(k)) return false; visti.add(k); return true; });
    for (const a of attivi.slice(0, 6)) {
      const div = document.createElement("div");
      div.textContent = `${a.ora_evento} · ${a.veicolo_id} · ${a.nome_via || a.seg_id} · ${a.motivi.join(", ")}`;
      coda.appendChild(div);
    }
    cursore.value = t;
  }

  function passo(ora) {
    if (!inCorso) return;
    if (ultimo !== null) t = Math.min(fine, t + ((ora - ultimo) / 1000) * Number(document.getElementById("velocita").value));
    ultimo = ora;
    disegna();
    if (t >= fine) inCorso = false;
    requestAnimationFrame(passo);
  }
  document.getElementById("play").onclick = (e) => {
    inCorso = !inCorso; ultimo = null;
    e.target.textContent = inCorso ? "❚❚ Pausa" : "▶ Avvia";
    if (inCorso) requestAnimationFrame(passo);
  };
  cursore.oninput = () => { t = Number(cursore.value); disegna(); };
  disegna();
}

avvia().catch((e) => {
  document.body.insertAdjacentHTML("afterbegin",
    `<p style="padding:16px;color:#ff8a80">Dati non trovati (${e.message}). Lancia prima: python tools/genera_esempio.py</p>`);
});
