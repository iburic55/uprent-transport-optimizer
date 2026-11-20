/**
 * Automatsko snimanje demonstracijskog videa (Playwright).
 *
 *   uvicorn api.main:app            # u drugom terminalu (s izgrađenim frontendom)
 *   node tools/record_demo.js [izlazna_mapa]
 *   ffmpeg -i <snimka>.webm -c:v libx264 -crf 23 -pix_fmt yuv420p -movflags +faststart docs/demo.mp4
 *
 * U stranicu se ubacuju titlovi (hrvatski) i vidljivi kursor, pa je jasno što se radi.
 */
const { chromium } = require("playwright");
const path = require("path");

const URL = process.env.DEMO_URL || "http://localhost:8000";
const OUT = process.argv[2] || path.join(__dirname, "..", "demo-video");
const W = 1920, H = 1080;

// --- sloj s titlom i kursorom (ubacuje se u svaki dokument) -------------------------------
const overlay = () => {
  const css = `
    #demo-cap{position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:99999;
      max-width:1300px;padding:18px 30px;border-radius:18px;background:rgba(15,23,42,.92);
      color:#fff;font:500 26px/1.35 "Inter Variable",Inter,system-ui,sans-serif;text-align:center;
      box-shadow:0 20px 50px rgba(0,0,0,.35);transition:opacity .35s;opacity:0;pointer-events:none}
    #demo-cap b{color:#a5b4fc;font-weight:700} #demo-cap small{display:block;margin-top:6px;
      font-size:19px;color:#cbd5e1;font-weight:400}
    #demo-cur{position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;z-index:100000;
      border-radius:50%;background:rgba(99,102,241,.35);border:3px solid #6366f1;pointer-events:none;
      transition:transform .12s}
    #demo-cur.down{transform:scale(.7);background:rgba(99,102,241,.7)}`;
  const install = () => {
    if (document.getElementById("demo-cap")) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const cap = document.createElement("div"); cap.id = "demo-cap"; document.body.appendChild(cap);
    const cur = document.createElement("div"); cur.id = "demo-cur"; document.body.appendChild(cur);
    addEventListener("mousemove", (e) => { cur.style.left = e.clientX + "px"; cur.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => cur.classList.add("down"), true);
    addEventListener("mouseup", () => cur.classList.remove("down"), true);
  };
  window.__cap = (html) => {
    install();
    const c = document.getElementById("demo-cap");
    if (!html) { c.style.opacity = 0; return; }
    c.innerHTML = html; c.style.opacity = 1;
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
  h1{font-size:68px;letter-spacing:-.02em;margin:34px 0 18px;line-height:1.05}
  p{font-size:30px;color:#cbd5e1;margin:10px 0;line-height:1.4} p b{color:#fff}
  .f{margin-top:40px;font-size:22px;color:#94a3b8}
  .chip{display:inline-block;margin:6px 8px 0 0;padding:8px 16px;border-radius:999px;
    background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);font-size:20px;color:#e2e8f0}
</style></head><body><div class="w"><div class="logo">🚚</div><h1>${title}</h1>
${lines.map((l) => `<p>${l}</p>`).join("")}<div class="f">${foot}</div></div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: "light",
    recordVideo: { dir: OUT, size: { width: W, height: H } },
  });
  await ctx.addInitScript(overlay);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));

  const wait = (ms) => p.waitForTimeout(ms);
  const cap = async (html, ms = 0) => { await p.evaluate((h) => window.__cap(h), html); if (ms) await wait(ms); };
  const moveTo = async (loc, steps = 30) => {
    const b = await loc.first().boundingBox();   // titl je zadnji u DOM-u -> prvi pogodak je u aplikaciji
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
    await wait(250);
  };
  const click = async (loc) => { await moveTo(loc); await loc.click(); await wait(400); };
  const scrollTo = async (y) => { await p.evaluate((t) => scrollTo({ top: t, behavior: "smooth" }), y); await wait(1200); };
  const scrollInto = async (loc, offset = 90) => {
    const y = await loc.evaluate((el, o) => el.getBoundingClientRect().top + scrollY - o, offset);
    await scrollTo(y);
  };
  const typeInto = async (loc, text) => {
    await click(loc);
    await loc.press("Control+A");
    await loc.pressSequentially(text, { delay: 140 });
  };

  // 1) uvod
  await p.setContent(card("Optimizacija prijevoza radnih strojeva", [
    "Raspored <b>10 transportnih naloga</b> na <b>2 kamiona</b> uz minimalnu kilometražu.",
    "Nosivost i broj strojeva u svakom trenutku · preuzimanje prije isporuke · povratak u bazu · <b>9 h rada</b> · 20 min po utovaru/istovaru · 60 km/h",
  ], `<span class="chip">Python · egzaktni DP</span><span class="chip">FastAPI</span><span class="chip">React + TypeScript</span><span class="chip">31 test · OR-Tools potvrda</span>`));
  await wait(5500);

  // 2) pregled
  await p.goto(URL);
  await p.getByText("Zašto ne").first().waitFor();
  await p.mouse.move(W / 2, H / 2);
  await wait(800);
  await cap("Rezultat za zadane podatke: <b>200,1 km</b>, svih <b>10/10 naloga</b><small>Dokazani optimum · nezavisni validator potvrđuje sva ograničenja</small>");
  await moveTo(p.locator("main .text-3xl").first());
  await wait(1800);
  await moveTo(p.getByText("Dokazani optimum", { exact: true }));
  await wait(1500);
  await moveTo(p.locator("main .text-3xl").nth(3));
  await wait(2200);

  // 3) zamka
  await cap("Zamka: najkraće je <b>182,2 km</b>, ali tada Kamion B radi <b>9:42 h</b> (limit 9 h)<small>20 radnji × 20 min = 6 h 40 min. Optimizator zato N03 daje Kamionu A: +17,9 km, svi unutar 9 h</small>");
  await moveTo(p.getByText("Zašto ne").first());
  await wait(2500);
  await moveTo(p.getByText("Radno vrijeme bez limita"));
  await wait(2500);
  await moveTo(p.getByText("N03").first());
  await wait(2500);

  // 4) radni dan + kamioni
  const day = p.getByText("Radni dan").first();
  await scrollInto(day, 110);
  await cap("Radni dan: vožnja, utovar i istovar na zajedničkoj osi<small>Crvena crta je dnevni limit od 9 h – Kamion B završava u 8:43</small>");
  const segs = p.locator("div.group.absolute");
  for (const k of [3, 14, 30]) { await moveTo(segs.nth(k), 20); await wait(1300); }
  await moveTo(p.getByText("limit 9 h"));
  await wait(1800);
  const truckB = p.getByRole("heading", { name: "Kamion B" });
  await scrollInto(truckB, 100);
  await cap("Za svaki kamion: redoslijed lokacija, teret nakon svake radnje i tablica radnji<small>Kamion B: vrh tereta 9.900 / 10.000 kg (M09 + M04), M10 uvijek putuje sam</small>");
  await moveTo(p.getByText("vrh tereta 9.900 kg"));
  await wait(2500);
  await p.mouse.move(W * 0.55, 620, { steps: 30 });
  await wait(2000);
  await scrollTo(1650);
  await wait(1500);
  await scrollTo(0);

  // 5) karta
  await cap("Karta: animacija vožnje po stvarnoj vremenskoj crti<small>Prikazuje trenutnu radnju i teret; prijeđene dionice su pune, buduće prigušene</small>");
  await click(p.getByRole("tab", { name: /Karta/ }));
  await scrollInto(p.getByText("Karta ruta").first(), 90);
  await click(p.getByRole("button", { name: /Pokreni vožnju/ }));
  await p.mouse.move(W * 0.82, H * 0.5, { steps: 40 });
  await wait(15000);

  // 6) scenariji
  await scrollTo(0);
  await click(p.getByRole("tab", { name: /Scenariji/ }));
  await scrollInto(p.getByText("Usporedba scenarija").first(), 90);
  await cap("Scenariji: kako tumačenje limita mijenja rezultat<small>Ako se u 9 h broji samo vožnja, dopušteno je 182,2 km – u aplikaciji je to prekidač</small>");
  await moveTo(p.getByText("krši 9 h"));
  await wait(3500);
  await scrollTo(0);

  // 7) neizvršivi nalozi uživo
  await cap("Uživo: radno vrijeme na <b>4 h</b> → aplikacija jasno upozori koje naloge nije moguće izvršiti");
  const hours = p.getByLabel("Radno vrijeme vozača (vrijednost)");
  // kontrolirano brojčano polje: fill postavlja cijelu vrijednost odjednom
  await click(hours);
  await hours.fill("4");
  await wait(1800);
  await moveTo(p.getByText(/nije moguće izvršiti/));
  await cap("Radno vrijeme <b>4 h</b> → izvršeno <b>7/10</b>; N06, N08 i N10 jasno označeni s razlogom");
  await wait(3000);
  await moveTo(p.getByText("N06").first());
  await wait(2500);
  await click(hours);
  await hours.fill("9");
  await wait(1500);

  // 8) ulazni podaci
  await click(p.getByRole("tab", { name: /Ulazni podaci/ }));
  await scrollInto(p.getByText("Vozni park").first(), 90);
  await cap("Ulazni podaci se mogu mijenjati – raspored se odmah ponovno izračuna<small>Primjer: nosivost Kamiona A 3.500 → 10.000 kg</small>");
  await typeInto(p.getByLabel("Nosivost (kg) (redak 1)"), "10000");
  await wait(1200);
  await scrollTo(0);
  await moveTo(p.locator("main .text-3xl").first());
  await cap("Nova kilometraža: <b>185,8 km</b> (Kamion A sada smije voziti i teže strojeve)");
  await wait(3500);
  await scrollInto(p.getByText("Transportni nalozi").first(), 90);
  await cap("Neispravan unos se jasno odbije: dupla oznaka naloga");
  await typeInto(p.getByLabel("Nalog (redak 2)"), "N01");
  await wait(900);
  await scrollTo(0);
  await moveTo(p.getByText(/Ulazni podaci nisu ispravni/));
  await wait(3500);
  await cap("„Vrati zadane podatke” vraća zadatak u početno stanje");
  await click(p.getByRole("button", { name: /Vrati zadane/ }));
  await wait(2000);

  // 9) tamna tema
  await cap("Svijetla i tamna tema, prilagođeno i za mobitel");
  await click(p.getByRole("button", { name: /Tamna tema/ }));
  await click(p.getByRole("tab", { name: /Raspored/ }));
  await wait(3000);
  await click(p.getByRole("button", { name: /Svijetla tema/ }));
  await cap("");

  // 10) završna kartica
  await p.setContent(card("200,1 km · 10/10 naloga · unutar 9 h", [
    "<b>Egzaktni algoritam</b> (dinamičko programiranje + optimalna podjela) – rezultat potvrđen Google OR-Toolsom i brute-forceom.",
    "<b>31 automatski test</b> poslovnih ograničenja i API-ja · nezavisni validator svakog rasporeda.",
  ], `pip install -r requirements.txt · cd frontend && npm install && npm run build · uvicorn api.main:app`));
  await wait(6000);

  const video = p.video();
  await ctx.close();
  await browser.close();
  console.log("video:", await video.path());
  console.log("pageerrors:", errors.length ? errors : "none");
})();
