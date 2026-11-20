/**
 * Izrada PDF uputa: docs/Upute.pdf
 *
 *   uvicorn api.main:app             # aplikacija mora raditi (s izgrađenim frontendom)
 *   node tools/build_manual.js       # snimke zaslona + PDF
 *   node tools/build_manual.js --pdf # samo PDF (koristi postojeće snimke)
 *
 * 1) Snimke prave aplikacije s numeriranim oznakama uz stvarne elemente (docs/upute/img).
 * 2) docs/upute/upute.html -> PDF u Chromiumu (A4). Sadržaj dobiva stvarne brojeve stranica
 *    u drugom prolazu; naslovnica se renderira zasebno (bez zaglavlja/podnožja) i spaja s
 *    ostatkom (python3 + pypdf).
 */
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "docs", "upute");
const IMG = path.join(DIR, "img");
const URL = process.env.APP_URL || "http://localhost:8000";
const onlyPdf = process.argv.includes("--pdf");

// --------------------------------------------------------------------- snimke s oznakama
async function shots(browser) {
  fs.mkdirSync(IMG, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(URL);
  await page.getByText("Zašto ne").first().waitFor();
  await page.waitForTimeout(1200);

  /** Numerirane oznake: [{ loc, n, at: "tl"|"tr"|"l"|"r", box: true }] */
  const mark = async (items) => {
    await page.evaluate(() => document.querySelectorAll(".mk").forEach((e) => e.remove()));
    for (const it of items) {
      const h = await it.loc.first().elementHandle();
      await h.evaluate((el, { n, at, box }) => {
        const r = el.getBoundingClientRect();
        const sx = scrollX, sy = scrollY;
        if (box) {
          const b = document.createElement("div");
          b.className = "mk";
          Object.assign(b.style, {
            position: "absolute", left: `${r.left + sx - 5}px`, top: `${r.top + sy - 5}px`,
            width: `${r.width + 10}px`, height: `${r.height + 10}px`, border: "2.5px solid #e11d48",
            borderRadius: "12px", zIndex: 9998, pointerEvents: "none", boxShadow: "0 0 0 4px rgba(225,29,72,.12)",
          });
          document.body.appendChild(b);
        }
        const d = document.createElement("div");
        d.className = "mk";
        d.textContent = n;
        const pos = {
          tl: [r.left - 16, r.top - 16], tr: [r.right - 16, r.top - 16],
          l: [r.left - 40, r.top + r.height / 2 - 16], r: [r.right + 8, r.top + r.height / 2 - 16],
        }[at || "tl"];
        Object.assign(d.style, {
          position: "absolute", left: `${pos[0] + sx}px`, top: `${pos[1] + sy}px`, width: "32px", height: "32px",
          borderRadius: "50%", background: "#e11d48", color: "#fff", font: "700 17px/32px Inter Variable, sans-serif",
          textAlign: "center", zIndex: 9999, border: "2.5px solid #fff", boxShadow: "0 4px 12px rgba(0,0,0,.25)",
        });
        document.body.appendChild(d);
      }, { n: String(it.n), at: it.at, box: it.box !== false });
    }
  };
  const clear = () => page.evaluate(() => document.querySelectorAll(".mk").forEach((e) => e.remove()));
  const shotOf = async (file, loc, pad = 24) => {
    const b = await loc.first().boundingBox();
    const top = await page.evaluate(() => scrollY);
    await page.screenshot({
      path: path.join(IMG, file),
      clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(1440, b.width + 2 * pad), height: b.height + 2 * pad },
      fullPage: false,
    });
    return top;
  };
  const kpi = (i) => page.locator("main .text-3xl").nth(i).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
  const card = (text) => page.locator("div.rounded-2xl", { has: page.getByText(text, { exact: true }) }).first();

  // 1) pregled
  await mark([
    { loc: page.locator("header"), n: 1, at: "l", box: false },
    { loc: page.locator("aside .rounded-2xl").first(), n: 2 },
    { loc: kpi(0), n: 3 },
    { loc: kpi(2), n: 4 },
    { loc: page.getByText("Zašto ne").first().locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]"), n: 5 },
    { loc: page.getByRole("tablist"), n: 6 },
    { loc: page.getByText("Dokazani optimum", { exact: true }), n: 7, at: "l" },
  ]);
  // oznaka 1 uz logo
  await page.evaluate(() => {
    const m = [...document.querySelectorAll(".mk")].find((e) => e.textContent === "1");
    const logo = document.querySelector("header .size-9").getBoundingClientRect();
    m.style.left = `${logo.right + 6}px`; m.style.top = `${logo.top - 12}px`;
  });
  await page.screenshot({ path: path.join(IMG, "pregled.png"), clip: { x: 0, y: 0, width: 1440, height: 560 } });
  await clear();

  // 2) raspored: radni dan
  const day = card("Radni dan");
  await day.scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, -80));
  await page.locator("div.group.absolute.bg-emerald-500").nth(4).hover();
  await page.waitForTimeout(300);
  await mark([
    { loc: day.locator("div.relative.h-9").nth(1), n: 1, at: "l", box: true },
    { loc: page.getByText("limit 9 h"), n: 2, at: "r", box: false },
    { loc: page.locator("div.group.absolute.bg-emerald-500").nth(4), n: 3, at: "tr", box: false },
    { loc: day.getByText("Istovar"), n: 4, at: "l", box: false },
  ]);
  await shotOf("radni-dan.png", day, 20);
  await clear();
  await page.mouse.move(5, 5);

  // 3) kartica kamiona
  const truckB = page.locator("div.rounded-2xl", { has: page.getByRole("heading", { name: "Kamion B" }) }).first();
  await truckB.scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, -40));
  await mark([
    { loc: truckB.getByText("vrh tereta 9.900 kg"), n: 1, at: "tl" },
    { loc: truckB.locator("div.flex.flex-wrap.items-center.gap-1").first(), n: 2, at: "tl" },
    { loc: truckB.locator('svg[aria-label^="Teret kamiona"]'), n: 3, at: "tl" },
    { loc: truckB.locator("table thead"), n: 4, at: "tl" },
  ]);
  const tb = await truckB.boundingBox();
  await page.screenshot({ path: path.join(IMG, "kamion.png"), clip: { x: tb.x - 20, y: tb.y - 20, width: tb.width + 40, height: 620 } });
  await clear();

  // 4) karta
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole("tab", { name: /Karta/ }).click();
  await page.waitForTimeout(500);
  const map = card("Karta ruta");
  await map.scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: /Pokreni vožnju/ }).click();
  await page.waitForTimeout(6200);
  await page.getByRole("button", { name: /Pauza/ }).click();
  await page.waitForTimeout(300);
  await mark([
    { loc: page.getByRole("button", { name: /Pokreni vožnju/ }), n: 1, at: "l" },
    { loc: page.getByRole("button", { name: "Ispočetka" }), n: 2, at: "l", box: false },
    { loc: page.getByLabel("Vrijeme simulacije").locator("xpath=.."), n: 3, at: "tl" },
    { loc: map.locator("div.rounded-xl.border").nth(1), n: 4, at: "tl" },
    { loc: map.locator("svg g circle[r='9']").nth(1), n: 5, at: "tr", box: false },
  ]);
  await shotOf("karta.png", map, 22);
  await clear();

  // 5) scenariji
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole("tab", { name: /Scenariji/ }).click();
  await page.waitForTimeout(500);
  const sc = card("Usporedba scenarija");
  await sc.scrollIntoViewIfNeeded();
  await mark([
    { loc: sc.getByText("aktivno"), n: 1, at: "l", box: false },
    { loc: sc.getByText("Samo vožnja ≤ limit"), n: 2, at: "l", box: false },
    { loc: sc.getByText("krši 9 h"), n: 3, at: "l", box: false },
  ]);
  await shotOf("scenariji.png", sc, 22);
  await clear();

  // 6) ulazni podaci
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole("tab", { name: /Ulazni podaci/ }).click();
  await page.waitForTimeout(500);
  const grid = page.locator("div.grid.items-start");
  await grid.scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, -30));
  await page.getByLabel("Nosivost (kg) (redak 1)").focus();
  await page.locator("tr", { has: page.getByLabel("Nalog (redak 3)") }).hover();
  await mark([
    { loc: page.getByLabel("Nosivost (kg) (redak 1)"), n: 1, at: "tl" },
    { loc: page.getByRole("button", { name: "Dodaj redak" }).first(), n: 2, at: "l" },
    { loc: page.locator("tr", { has: page.getByLabel("Nalog (redak 3)") }).getByLabel("Obriši redak 3"), n: 3, at: "r", box: false },
    { loc: page.getByLabel("Stroj (redak 3)"), n: 4, at: "tl" },
    { loc: page.locator("tr", { has: page.getByLabel("Nalog (redak 3)") }).locator("td").nth(4), n: 5, at: "tr", box: false },
  ]);
  await page.screenshot({ path: path.join(IMG, "ulazni.png"), clip: { x: 330, y: 70, width: 1110, height: 880 } });
  await clear();

  // 7) neizvršivi nalozi (4 h)
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByLabel("Radno vrijeme vozača (vrijednost)").fill("4");
  await page.waitForTimeout(1500);
  const alert = page.getByRole("alert").first();
  await mark([{ loc: page.getByLabel("Radno vrijeme vozača (vrijednost)"), n: 1, at: "l" }, { loc: alert, n: 2, at: "tl" }]);
  await page.screenshot({ path: path.join(IMG, "neizvrsivo.png"), clip: { x: 0, y: 64, width: 1440, height: 400 } });
  await clear();
  await page.getByLabel("Radno vrijeme vozača (vrijednost)").fill("9");
  await page.waitForTimeout(1200);

  // 8) neispravan unos
  await page.getByLabel("Nalog (redak 2)").fill("N01");
  await page.waitForTimeout(1500);
  await page.evaluate(() => scrollTo(0, 0));
  await mark([{ loc: page.getByRole("alert").first(), n: 1, at: "tl" }]);
  await page.screenshot({ path: path.join(IMG, "greska.png"), clip: { x: 330, y: 64, width: 1110, height: 190 } });
  await clear();
  await page.getByRole("button", { name: /Vrati zadane/ }).click();
  await page.waitForTimeout(1200);

  // 9) tamna tema (bez oznaka)
  await page.getByRole("button", { name: /Tamna tema/ }).click();
  await page.getByRole("tab", { name: /Raspored/ }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(IMG, "tamna.png"), clip: { x: 0, y: 0, width: 1440, height: 760 } });
  await page.getByRole("button", { name: /Svijetla tema/ }).click();
  await page.close();
}

// --------------------------------------------------------------------- PDF

async function pdf(browser) {
  const page = await browser.newPage();
  await page.goto("file://" + path.join(DIR, "upute.html"));
  await page.evaluate(() => document.fonts.ready);
  const opts = (p) => ({
    path: p, format: "A4", printBackground: true, preferCSSPageSize: true,
    margin: { top: "16mm", bottom: "18mm", left: "0", right: "0" },
  });
  const tmp = path.join(DIR, ".body.pdf");
  const cover = path.join(DIR, ".cover.pdf");

  // prolaz 1: tijelo bez naslovnice -> pronađi stranicu svakog naslova
  await page.evaluate(() => document.body.classList.add("no-cover"));
  await page.pdf(opts(tmp));
  const heads = await page.evaluate(() => [...document.querySelectorAll("[data-toc]")].map((a) => a.dataset.toc));
  const pages = JSON.parse(execFileSync("python3", ["-c", `
import sys, json, re
from pypdf import PdfReader
heads = json.loads(sys.argv[2]); r = PdfReader(sys.argv[1])
txt = [re.sub(r"\\s+", " ", p.extract_text() or "") for p in r.pages]
out = {}
for h in heads:
    key = "TOCMARK" + h + "TOCMARK"
    out[h] = next((i + 1 for i, t in enumerate(txt) if key in t.replace(" ", "")), None)
print(json.dumps(out))`, tmp, JSON.stringify(heads)]).toString());
  await page.evaluate((map) => {
    for (const a of document.querySelectorAll("[data-toc]")) {
      const n = map[a.dataset.toc];
      a.querySelector(".pg").textContent = n ? String(n + 1) : "–"; // +1: naslovnica
    }
    document.querySelectorAll(".anchor-key").forEach((e) => e.remove()); // pomoćne oznake za pronalazak
  }, pages);
  // prolaz 2: konačno tijelo
  await page.pdf(opts(tmp));

  // naslovnica zasebno (bez podnožja)
  await page.evaluate(() => { document.body.classList.remove("no-cover"); document.body.classList.add("only-cover"); });
  await page.pdf({ path: cover, format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await page.close();

  const out = path.join(ROOT, "docs", "Upute.pdf");
  execFileSync("python3", ["-c", `
import sys
from pypdf import PdfWriter
import io
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
w = PdfWriter()
w.append(sys.argv[1]); w.append(sys.argv[2])
total = len(w.pages)
for i, page in enumerate(w.pages):          # podnožje: sve osim naslovnice, brojevi kao u pregledniku PDF-a
    if i == 0:
        continue
    W, H = float(page.mediabox.width), float(page.mediabox.height)
    buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=(W, H))
    c.setFillColorRGB(0.58, 0.64, 0.72); c.setFont("Helvetica", 7.5)
    c.drawString(17 * mm, 9 * mm, "UP Rent \u00b7 Optimizacija prijevoza radnih strojeva \u2014 Upute")
    c.drawRightString(W - 17 * mm, 9 * mm, f"stranica {i + 1} / {total}")
    c.setStrokeColorRGB(0.89, 0.91, 0.94); c.setLineWidth(0.5); c.line(17 * mm, 12.5 * mm, W - 17 * mm, 12.5 * mm)
    c.save(); buf.seek(0)
    page.merge_page(PdfReader(buf).pages[0])
w.add_metadata({"/Title": "UP Rent – Optimizacija prijevoza radnih strojeva: upute",
                "/Subject": "Korisničke i tehničke upute", "/Lang": "hr-HR"})
w.write(sys.argv[3])`, cover, tmp, out]);
  fs.rmSync(tmp); fs.rmSync(cover);
  console.log("PDF:", out, "· stranice sadržaja:", pages);
}

(async () => {
  const browser = await chromium.launch();
  if (!onlyPdf) await shots(browser);
  await pdf(browser);
  await browser.close();
})();
