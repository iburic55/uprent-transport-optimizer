/**
 * Automatsko snimanje demonstracijskog videa (Playwright) s titlovima koji opisuju svaki
 * klik, unos i pokazivanje te objašnjavaju što se vidi.
 *
 *   uvicorn api.main:app                 # u drugom terminalu (s izgrađenim frontendom)
 *   node tools/record_demo.js [mapa]     # -> <mapa>/*.webm + <mapa>/demo.srt
 *   (CHROME_PATH=<chrome.exe> za vlastiti Chromium umjesto Playwrightova)
 *   ffmpeg -i <mapa>/*.webm -i <mapa>/demo.srt -map 0:v -map 1 -c:v libx264 -crf 26 \
 *          -pix_fmt yuv420p -c:s mov_text -metadata:s:s:0 language=hrv -movflags +faststart docs/demo.mp4
 *
 * Svaka radnja ide kroz step(): titl ("što radim" + "zašto"), balon uz kursor i brojač koraka,
 * pa nije moguće kliknuti nešto bez objašnjenja.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = process.env.DEMO_URL || "http://localhost:8000";
const OUT = process.argv[2] || path.join(__dirname, "..", "demo-video");
const W = 1920, H = 1080;
const TOTAL = 35; // broj koraka (provjerava se na kraju)

// --- sloj: titl, balon uz kursor, brojač koraka, kursor -----------------------------------
const overlay = () => {
  const css = `
    #demo-cap{position:fixed;left:50%;bottom:40px;transform:translateX(-50%);z-index:99999;
      width:max-content;max-width:1400px;padding:16px 30px 18px;border-radius:18px;background:rgba(15,23,42,.93);
      color:#fff;font:600 27px/1.35 "Inter Variable",Inter,system-ui,sans-serif;text-align:center;
      box-shadow:0 20px 50px rgba(0,0,0,.35);transition:opacity .3s;opacity:0;pointer-events:none}
    #demo-cap b{color:#a5b4fc} #demo-cap .why{display:block;margin-top:6px;font-size:21px;
      font-weight:400;color:#cbd5e1} #demo-cap .why b{color:#fde68a;font-weight:600}
    #demo-act{position:fixed;z-index:100001;padding:7px 13px;border-radius:10px;background:#6366f1;
      color:#fff;font:600 17px/1 "Inter Variable",Inter,system-ui,sans-serif;white-space:nowrap;
      box-shadow:0 8px 24px rgba(99,102,241,.45);opacity:0;transition:opacity .25s;pointer-events:none}
    #demo-step{position:fixed;top:84px;right:28px;z-index:99999;padding:8px 14px;border-radius:999px;
      background:rgba(15,23,42,.85);color:#fff;font:600 16px/1 "Inter Variable",Inter,system-ui,sans-serif;
      opacity:0;transition:opacity .3s;pointer-events:none}
    #demo-cur{position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;z-index:100000;
      border-radius:50%;background:rgba(99,102,241,.35);border:3px solid #6366f1;pointer-events:none;
      transition:transform .12s}
    #demo-cur.down{transform:scale(.65);background:rgba(99,102,241,.75)}`;
  let mx = 0, my = 0, hideAct;
  const el = (id) => document.getElementById(id);
  const place = () => {
    const a = el("demo-act"); if (!a) return;
    const left = Math.min(mx + 24, innerWidth - a.offsetWidth - 12);
    const top = my + 24 + a.offsetHeight > innerHeight - 150 ? my - 24 - a.offsetHeight : my + 24;
    a.style.left = left + "px"; a.style.top = top + "px";
  };
  const install = () => {
    if (el("demo-cap") || !document.body) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    for (const id of ["demo-cap", "demo-act", "demo-step", "demo-cur"]) {
      const d = document.createElement("div"); d.id = id; document.body.appendChild(d);
    }
    addEventListener("mousemove", (e) => {
      mx = e.clientX; my = e.clientY;
      el("demo-cur").style.left = mx + "px"; el("demo-cur").style.top = my + "px"; place();
    }, true);
    addEventListener("mousedown", () => el("demo-cur").classList.add("down"), true);
    addEventListener("mouseup", () => el("demo-cur").classList.remove("down"), true);
  };
  // titlovi su fiksni tekst iz ove skripte (nije korisnički unos)
  window.__step = (n, total, act, what, why) => {
    install();
    const c = el("demo-cap"), a = el("demo-act"), s = el("demo-step");
    if (!what) { c.style.opacity = 0; a.style.opacity = 0; s.style.opacity = 0; return; }
    c.innerHTML = `${what}${why ? `<span class="why">${why}</span>` : ""}`; c.style.opacity = 1;
    s.textContent = `Korak ${n} / ${total}`; s.style.opacity = 1;
    if (act) {
      a.textContent = act; a.style.opacity = 1; place();
      clearTimeout(hideAct); hideAct = setTimeout(() => (a.style.opacity = 0), 2600);
    } else a.style.opacity = 0;
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install); else install();
};

const card = (title, lines, foot) => `<!doctype html><html lang="hr"><head><meta charset="utf-8">
<style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(1200px 700px at 30% 20%,#312e81 0%,#0f172a 60%);color:#fff;
    font-family:"Inter Variable",Inter,system-ui,sans-serif}
  .w{max-width:1250px;padding:40px} .logo{width:84px;height:84px;border-radius:22px;
    background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;
    font-size:44px;box-shadow:0 20px 60px rgba(99,102,241,.5)}
  h1{font-size:66px;letter-spacing:-.02em;margin:34px 0 18px;line-height:1.05}
  p{font-size:29px;color:#cbd5e1;margin:10px 0;line-height:1.4} p b{color:#fff}
  .f{margin-top:40px;font-size:22px;color:#94a3b8}
  .chip{display:inline-block;margin:6px 8px 0 0;padding:8px 16px;border-radius:999px;
    background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);font-size:20px;color:#e2e8f0}
</style></head><body><div class="w"><div class="logo">🚚</div><h1>${title}</h1>
${lines.map((l) => `<p>${l}</p>`).join("")}<div class="f">${foot}</div></div></body></html>`;

// --- SRT -------------------------------------------------------------------------------------
const cues = [];
const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
const srtTime = (ms) => {
  const t = Math.max(0, Math.round(ms));
  const p2 = (n, w = 2) => String(n).padStart(w, "0");
  return `${p2(Math.floor(t / 3600000))}:${p2(Math.floor(t / 60000) % 60)}:${p2(Math.floor(t / 1000) % 60)},${p2(t % 1000, 3)}`;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: "light",
    recordVideo: { dir: OUT, size: { width: W, height: H } },
  });
  await ctx.addInitScript(overlay);
  const p = await ctx.newPage();
  const t0 = Date.now(); // snimanje počinje s otvaranjem stranice
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));

  const wait = (ms) => p.waitForTimeout(ms);
  const readMs = (what, why) => Math.max(3800, ((plain(what) + plain(why || "")).length / 15) * 1000);
  let n = 0;
  const closeCue = () => { const last = cues[cues.length - 1]; if (last && !last.end) last.end = Date.now() - t0; };

  /** Prikaži titl + balon + brojač (jedan korak demonstracije). */
  const show = async (act, what, why) => {
    n++;
    closeCue();
    cues.push({ start: Date.now() - t0, text: `${plain(what)}\n${plain(why || "")}`.trim() });
    await p.evaluate(([n, t, a, w, y]) => window.__step(n, t, a, w, y), [n, TOTAL, act, what, why]);
  };
  const hide = async () => { closeCue(); await p.evaluate(() => window.__step(0, 0, "", "", "")); };

  const moveTo = async (loc, steps = 30) => {
    const b = await loc.first().boundingBox(); // titl je zadnji u DOM-u -> prvi pogodak je u aplikaciji
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
    await wait(200);
  };
  const smooth = async (y) => { await p.evaluate((t) => scrollTo({ top: t, behavior: "smooth" }), y); await wait(1100); };
  const scrollInto = async (loc, offset = 90) => {
    const y = await loc.first().evaluate((el, o) => el.getBoundingClientRect().top + scrollY - o, offset);
    await smooth(y);
  };

  // radnje – svaka s opisom
  const say = async (what, why, ms) => { await show("", what, why); await wait(ms ?? readMs(what, why)); };
  const point = async (loc, label, what, why, ms) => {
    await moveTo(loc); await show(`👆 Pokazujem: ${label}`, what, why); await wait(ms ?? readMs(what, why));
  };
  const click = async (loc, label, what, why, ms) => {
    await moveTo(loc); await show(`🖱 Klik: ${label}`, what, why); await wait(900);
    await loc.first().click(); await wait(Math.max(0, (ms ?? readMs(what, why)) - 900));
  };
  const type = async (loc, text, label, what, why, { fill = false, ms } = {}) => {
    await moveTo(loc); await show(`⌨ Upisujem: ${label}`, what, why); await wait(700);
    await loc.first().click(); await wait(250);
    if (fill) await loc.first().fill(text); // kontrolirano brojčano polje: cijela vrijednost odjednom
    else { await loc.first().press("Control+A"); await loc.first().pressSequentially(text, { delay: 150 }); }
    await wait(ms ?? readMs(what, why));
  };
  const top = () => smooth(0);
  const kpi = (i) => p.locator("main .text-3xl").nth(i);

  // ============================================================== scenarij
  await p.setContent(card("Optimizacija prijevoza radnih strojeva", [
    "Raspored <b>10 transportnih naloga</b> na <b>2 kamiona</b> uz minimalnu kilometražu.",
    "Nosivost i broj strojeva u svakom trenutku · preuzimanje prije isporuke istim kamionom · povratak u bazu · <b>9 h rada</b> · 20 min po utovaru/istovaru · 60 km/h",
  ], `<span class="chip">Python · egzaktni DP</span><span class="chip">FastAPI</span><span class="chip">React + TypeScript</span><span class="chip">32 testa · OR-Tools potvrda</span>`));
  await wait(6000);

  await p.goto(URL);
  await p.getByText("Zašto ne").first().waitFor();
  await p.mouse.move(W / 2, 420);
  // 1
  await say("Otvaram aplikaciju s podacima iz zadatka",
    "2 kamiona, 10 strojeva, 10 lokacija i 10 naloga – raspored se izračuna <b>automatski</b>");
  // 2–5 rezultat
  await point(kpi(0), "ukupna kilometraža", "Pokazujem <b>ukupnu kilometražu: 200,1 km</b>",
    "To je <b>dokazani optimum</b> za oba kamiona zajedno, uključujući povratak u bazu");
  await point(kpi(1), "izvršeni nalozi", "Pokazujem broj izvršenih naloga: <b>10 / 10</b>",
    "Svi nalozi su raspoređeni – nijedan nije neizvršiv");
  await point(p.getByText("Ograničenja zadovoljena", { exact: true }), "provjera",
    "Pokazujem oznaku <b>„Ograničenja zadovoljena”</b>",
    "Nezavisni validator ponovno računa nosivost, broj strojeva, redoslijed, povratak i vrijeme");
  await point(kpi(3), "Kamion B", "Pokazujem <b>Kamion B</b>: 162,9 km i 8:43 h rada",
    "Traka ispod je iskorištenost dnevnog limita: <b>97 % od 9 h</b>");
  // 6–8 zamka
  const insight = p.getByRole("button", { name: /Zašto ne/ });
  await click(insight, "Objasni", "Otvaram traku <b>„Zašto ne 182,2 km?”</b>",
    "Najkraći raspored (sve vozi Kamion B) traje <b>9:42 h</b> – preko limita od 9 h");
  await point(p.getByText("Radno vrijeme bez limita"), "usporedba vremena", "Pokazujem usporedbu radnog vremena",
    "20 utovara/istovara × 20 min = <b>6 h 40 min</b>, plus 3 h 2 min vožnje = 9:42 h");
  await point(insight.locator("xpath=..").locator("span.inline-flex", { hasText: "N03" }), "N03 → Kamion A", "Pokazujem premješteni nalog <b>N03</b>",
    "Optimizator ga daje Kamionu A: <b>+17,9 km</b>, ali oba vozača završe unutar 9 h");
  // 9–11 radni dan
  await scrollInto(p.getByText("Radni dan"), 110);
  await point(p.getByText("Radni dan"), "vremenska crta", "Pomaknuo sam se na <b>vremensku crtu radnog dana</b>",
    "Boja kamiona = vožnja, <b>zeleno</b> = utovar, <b>plavo</b> = istovar");
  await point(p.locator("div.group.absolute.bg-emerald-500").nth(4), "segment utovara",
    "Prelazim mišem preko <b>segmenta utovara</b>", "Opis pokazuje stroj, nalog, lokaciju i vrijeme – svaka radnja traje <b>20 min</b>");
  await point(p.getByText("limit 9 h"), "crta limita", "Pokazujem <b>crvenu crtu limita od 9 h</b>",
    "Kamion B završava u <b>8:43</b>, Kamion A već u 1:17 – oba unutar limita");
  // 12–16 usporedba kamiona i kamion B
  await scrollInto(p.getByText("Usporedba kamiona", { exact: true }), 100);
  await point(p.getByText("Usporedba kamiona", { exact: true }), "usporedba kamiona",
    "Pokazujem <b>usporedbu kamiona</b> jedan uz drugoga",
    "Ista mjera u istom retku: <b>37,2 prema 162,9 km</b>, radno vrijeme <b>14 % prema 97 %</b> limita");
  await point(p.locator("td").filter({ hasText: "9.900 kg" }), "vrh tereta", "Pokazujem <b>vrh tereta Kamiona B</b>",
    "Najveći teret je <b>9.900 / 10.000 kg</b> (M09 + M04) – nosivost nikad nije prekoračena");
  const cardB = p.locator("h3", { hasText: "Kamion B" }).locator("xpath=ancestor::div[contains(@class,'overflow-hidden')][1]");
  await scrollInto(cardB, 100);
  await point(p.locator('svg[aria-label^="Teret kamiona Kamion B"]'), "graf tereta",
    "Pokazujem <b>graf tereta</b> nakon svake radnje",
    "Isprekidana crta je nosivost; stroj M10 (9.400 kg) uvijek putuje sam");
  await click(cardB.getByRole("button", { name: /Prikaži radnje/ }), "Prikaži radnje", "Klikam <b>„Prikaži radnje”</b>",
    "Tablica radnji otvara se na klik, da se kamioni mogu usporediti jedan uz drugoga");
  await scrollInto(cardB.getByRole("row").filter({ hasText: "N10" }), 420);
  await point(cardB.getByRole("row").filter({ hasText: "N10" }), "tablica radnji", "Pokazujem <b>tablicu radnji</b>",
    "Za svaki korak: lokacija, radnja, nalog, km, <b>teret i broj strojeva nakon radnje</b>, vrijeme");
  // 15–18 karta
  await top();
  await click(p.getByRole("tab", { name: /Karta/ }), "Karta", "Klikam karticu <b>„Karta”</b>",
    "Rute oba kamiona na koordinatama X/Y u km; strelice pokazuju smjer vožnje");
  await scrollInto(p.getByText("Karta ruta"), 90);
  await click(p.getByRole("button", { name: /Pokreni vožnju/ }), "Pokreni vožnju", "Klikam <b>„Pokreni vožnju”</b>",
    "Kamioni se kreću po stvarnoj vremenskoj crti, uključujući 20 min za svaki utovar/istovar", 3000);
  await p.mouse.move(W * 0.83, H * 0.42, { steps: 40 });
  await say("Gledamo animaciju vožnje",
    "Desno su <b>trenutna radnja i teret</b> svakog kamiona; buduće dionice su prigušene", 5500);
  await say("Kamion A završi u 1:17 i vrati se u bazu",
    "Kamion B nastavlja do <b>8:43</b> – sat gore desno pokazuje vrijeme od polaska", 6000);
  // 19–21 scenariji
  await top();
  await click(p.getByRole("tab", { name: /Scenariji/ }), "Scenariji", "Klikam karticu <b>„Scenariji”</b>",
    "Isti podaci, tri tumačenja dnevnog limita");
  await scrollInto(p.getByText("Usporedba scenarija"), 90);
  await point(p.getByText("krši 9 h"), "krši 9 h", "Pokazujem scenarij <b>bez vremenskog ograničenja</b>",
    "182,2 km, ali Kamion B radi 9:42 h – zato je označen <b>„krši 9 h”</b>");
  await point(p.getByText("Samo vožnja ≤ limit"), "samo vožnja", "Pokazujem scenarij <b>„Samo vožnja ≤ limit”</b>",
    "Ako se u 9 h broji samo vožnja, 182,2 km je dopušten – to je <b>prekidač u postavkama</b>");
  // 22–25 limit 4 h
  await top();
  const hours = p.getByLabel("Radno vrijeme vozača (vrijednost)");
  await type(hours, "4", "4 h", "Upisujem radno vrijeme vozača: <b>4 h</b>",
    "Strože ograničenje – sve naloge više nije moguće stići u jednom danu", { fill: true });
  await point(p.getByText(/nije moguće izvršiti/), "upozorenje", "Pokazujem <b>upozorenje o neizvršivim nalozima</b>",
    "Izvršeno 7/10; za <b>N06, N08 i N10</b> razlog po kamionu: A – stroj pretežak, B – radio bi preko 5 h");
  await point(kpi(0), "171,6 km", "Pokazujem novu kilometražu: <b>171,6 km</b>",
    "Prioritet je <b>najviše izvršenih naloga</b>, a zatim najmanja kilometraža");
  await type(hours, "9", "9 h", "Vraćam radno vrijeme na <b>9 h</b>",
    "Ponovno su izvršeni svi nalozi: 200,1 km", { fill: true });
  // 26–30 ulazni podaci
  await click(p.getByRole("tab", { name: /Ulazni podaci/ }), "Ulazni podaci", "Klikam karticu <b>„Ulazni podaci”</b>",
    "Vozni park, strojevi, lokacije i nalozi – sve se može mijenjati");
  await scrollInto(p.getByText("Vozni park"), 90);
  await type(p.getByLabel("Nosivost (kg) (redak 1)"), "10000", "10000", "Upisujem nosivost Kamiona A: <b>10.000 kg</b>",
    "Kamion A sada smije voziti i teže strojeve (M06–M10)");
  await top();
  await point(kpi(0), "185,8 km", "Pokazujem novu kilometražu: <b>185,8 km</b>",
    "Raspored je <b>odmah preračunat</b>; validator i dalje potvrđuje sva ograničenja");
  await scrollInto(p.getByText("Transportni nalozi"), 90);
  await type(p.getByLabel("Nalog (redak 2)"), "N01", "N01", "Upisujem oznaku <b>N01</b> umjesto N02",
    "Namjerno neispravan unos – sada postoje dva naloga N01");
  await top();
  await point(p.getByText(/Ulazni podaci nisu ispravni/), "poruka o grešci", "Pokazujem <b>poruku o grešci</b>",
    "Aplikacija odbija neispravan unos i <b>ne računa krivi raspored</b>");
  // 31–33 reset i tema
  await click(p.getByRole("button", { name: /Vrati zadane/ }), "Vrati zadane podatke", "Klikam <b>„Vrati zadane podatke”</b>",
    "Svi podaci vraćeni su na zadatak – ponovno 200,1 km i 10/10");
  await click(p.getByRole("button", { name: /Tamna tema/ }), "tamna tema", "Klikam <b>ikonu mjeseca</b>",
    "Uključuje se <b>tamna tema</b>; aplikacija radi i na mobitelu");
  await click(p.getByRole("tab", { name: /Raspored/ }), "Raspored", "Klikam karticu <b>„Raspored”</b>",
    "Isti raspored u tamnoj temi – kraj demonstracije");
  await click(p.getByRole("button", { name: /Svijetla tema/ }), "svijetla tema", "", "", 600);
  await hide();
  n--; // zadnji klik bez titla ne broji se kao korak

  await p.setContent(card("200,1 km · 10/10 naloga · unutar 9 h", [
    "<b>Egzaktni algoritam</b> (dinamičko programiranje + optimalna podjela) – rezultat potvrđen Google OR-Toolsom i brute-forceom.",
    "<b>32 automatska testa</b> poslovnih ograničenja i API-ja · nezavisni validator svakog rasporeda.",
  ], `pip install -r requirements.txt · cd frontend && npm install && npm run build · uvicorn api.main:app`));
  await wait(6000);

  const video = p.video();
  await ctx.close();
  await browser.close();

  const srt = cues.filter((c) => c.text).map((c, i) =>
    `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end ?? c.start + 4000)}\n${c.text}\n`).join("\n");
  fs.writeFileSync(path.join(OUT, "demo.srt"), srt);
  console.log("video:", await video.path());
  console.log("srt:", path.join(OUT, "demo.srt"), `(${cues.filter((c) => c.text).length} titlova)`);
  console.log("koraka:", n, n === TOTAL ? "(OK)" : `(TOTAL=${TOTAL} – ažurirajte konstantu)`);
  console.log("pageerrors:", errors.length ? errors : "none");
})();
