# UP Rent – optimizacija prijevoza radnih strojeva

Prototip web aplikacije koja raspoređuje transportne naloge na dva kamiona, određuje
redoslijed preuzimanja i isporuka i minimizira ukupnu kilometražu, uz poštivanje
nosivosti, broja strojeva, dnevnog radnog vremena i obaveznog povratka u bazu.

**Rezultat za zadane podatke: svih 10 naloga, ukupno 200,1 km** (Kamion A 37,2 km,
Kamion B 162,9 km), oba vozača unutar 9 h. Rješenje je **dokazano optimalno**
(egzaktni algoritam, neovisno potvrđeno OR-Toolsom i brute-force testom).

### ⚠️ Zamka u zadatku

Najkraći mogući raspored ima **182,2 km**: sve naloge vozi kamion B, a kamion A ostaje u bazi.
Vožnja tada traje samo 3 h 2 min, ali 10 naloga znači 20 radnji × 20 min = 6 h 40 min
utovara/istovara, ukupno **9 h 42 min**, što je preko dnevnog limita od 9 h. Optimizator zato
nalog **N03 (L9 → L4) daje kamionu A** (+17,9 km), pa oba vozača završavaju na vrijeme
(1 h 17 min i 8 h 43 min). Pretpostavka da utovar/istovar ulazi u 9 h izložena je kao prekidač
u aplikaciji. Ako se računa samo vožnja, dopušteno je 182,2 km (vidi [Ključni uvid](#ključni-uvid)).
Aplikacija to objašnjenje prikazuje i na kartici Raspored.

Manje zamke:
- kamion A ne smije voziti M06–M10 (> 3.500 kg), a M01 + M05 = 3.900 kg ne stane ni u 2 mjesta;
- M10 (9.400 kg) uvijek putuje sam;
- baza je i lokacija naloga (N05 se preuzima u L0, N04 isporučuje u L0);
- udaljenost se zaokružuje po dionici, ne tek ukupni zbroj;
- uz zadane podatke **nijedan nalog nije neizvršiv**; upozorenje se vidi tek uz strože uvjete
  (npr. limit od 4 h → N06, N08, N10).

![Raspored – React sučelje](docs/react-raspored.png)

## Sadržaj predaje

| Traženo u zadatku (točka 8) | Gdje se nalazi |
|---|---|
| Izvorni kod aplikacije | Ovaj repozitorij (struktura u odjeljku [5](#5-struktura)) |
| Kratke upute za pokretanje | [1. Pokretanje](#1-pokretanje) |
| Funkcionalna demonstracija | [2. Funkcionalna demonstracija](#2-funkcionalna-demonstracija) |
| Kratak opis optimizacijske logike | [3. Optimizacijska logika](#3-optimizacijska-logika) |
| Najmanje tri testa poslovnih ograničenja | [4. Testovi](#4-testovi): 31 test (`tests/test_constraints.py`, `tests/test_api.py`) |
| Osvrt na AI alate i provjeru rezultata | [6. Korištenje AI alata](#6-korištenje-ai-alata-i-provjera-rezultata) |
| Procjena stvarnog vremena razvoja | [7. Procjena utrošenog vremena](#7-procjena-utrošenog-vremena) |

---

## 1. Pokretanje

Potrebno: **Python 3.10+** i **Node.js 20+**.

```bash
git clone https://github.com/iburic55/uprent-transport-optimizer.git
cd uprent-transport-optimizer
pip install -r requirements.txt

# React sučelje (jednom): izgradnja frontenda
cd frontend && npm install && npm run build && cd ..

uvicorn api.main:app          # aplikacija + API -> http://localhost:8000  (API docs: /docs)
pytest -v                     # testovi poslovnih ograničenja i API-ja
python -m optimizer           # isti raspored ispisan u terminalu
```

Razvojni način (automatsko osvježavanje): `uvicorn api.main:app --reload` u jednom terminalu i
`cd frontend && npm run dev` u drugom → http://localhost:5173 (Vite prosljeđuje `/api` na 8000).

**Rezervno sučelje bez Node.js-a:** `streamlit run app.py` → http://localhost:8501 (iste
funkcionalnosti, isti optimizator).

Opcionalna neovisna provjera s Google OR-Toolsom:

```bash
pip install ortools
python tools/verify_ortools.py
```

## 2. Funkcionalna demonstracija

🎬 **Video demonstracija (2:17, bez zvuka, s titlovima):** [`docs/demo.mp4`](docs/demo.mp4)
– snimljen automatski skriptom `tools/record_demo.js` (Playwright), pa se može ponovno snimiti.

Nakon `uvicorn api.main:app` aplikacija se otvara na http://localhost:8000. Za demonstraciju
predlažem ovaj redoslijed (oko 3 minute):

1. **Vrh stranice:** ukupno 200,1 km, 10/10 naloga, oznake „Dokazani optimum” i „Ograničenja
   zadovoljena”, te okvir **„Zašto ne 182,2 km?”** (zamka s 9 h).
2. **Raspored:** vremenska crta radnog dana s crtom limita od 9 h; za svaki kamion redoslijed
   lokacija, graf tereta i tablica radnji (teret i broj strojeva nakon svake radnje, vrijeme).
3. **Karta:** gumb „Pokreni vožnju” animira oba kamiona po stvarnoj vremenskoj crti, uz trenutnu
   radnju i teret.
4. **Scenariji:** usporedba tumačenja limita (200,1 / 182,2 / 182,2 km).
5. **Neizvršivi nalozi uživo:** radno vrijeme na 4 h → 7 naloga, a za N06, N08 i N10 crveno
   ispiše razlog.
6. **Ulazni podaci:** promjena nosivosti ili naloga, a raspored se odmah ponovno izračuna.
   Neispravan unos (npr. dupli nalog) jasno se odbije. Tamna tema: ikona mjeseca gore desno.

![Karta ruta – animacija](docs/react-karta.png)

Streamlit verzija (`streamlit run app.py`) ima iste funkcije; njezine snimke su u
`docs/raspored.png` i `docs/karta.png`.

## 2a. Što aplikacija radi

| Zahtjev iz zadatka | Gdje / kako |
|---|---|
| Prikaz i pregled ulaznih podataka | Kartica **Ulazni podaci**: vozni park, strojevi, lokacije, nalozi. Tablice se mogu uređivati, a raspored se odmah ponovno izračunava. |
| Automatska dodjela naloga kamionima | Optimizator bira najbolju podjelu (sve kombinacije) |
| Redoslijed obilaska | Kartica **Raspored**: redoslijed lokacija + tablica radnji |
| Nosivost i broj strojeva u svakom trenutku | Ugrađeno u algoritam; nedopuštena stanja se ni ne generiraju |
| Preuzimanje prije isporuke, isti kamion | Ugrađeno u model stanja (čeka → na kamionu → isporučen) |
| Minimalna kilometraža | Egzaktna optimizacija |
| Kilometraža po kamionu i ukupno | Metrike na vrhu kartice Raspored |
| Upozorenje za neizvršive naloge | Crveni okvir s popisom naloga i razlogom (preteško / nema vremena) |
| Neispravni ulazni podaci | Provjera prije izračuna (`check_inputs`): duple oznake, težina/nosivost ≤ 0, ista lokacija preuzimanja i isporuke, nedostaje baza – jasna poruka umjesto pada aplikacije |
| Radnje i opterećenje nakon svake radnje | Tablica po kamionu: lokacija, radnja, nalog, stroj, km, teret, broj strojeva, vrijeme |
| Broj izvršenih naloga | Metrike i naslov svakog kamiona |
| Karta (opcionalno) | Kartica **Karta**: rute s označenim smjerom |
| Dodatno | Kartica **Usporedba scenarija**; nezavisna provjera plana (zeleni/crveni status) |

U bočnoj traci mogu se mijenjati radno vrijeme, trajanje utovara/istovara, brzina i
tumačenje dnevnog limita.

## 3. Optimizacijska logika

Problem je **Pickup and Delivery Vehicle Routing Problem** s kapacitetom
(kg i broj strojeva) i vremenskim ograničenjem. Općenito je NP-težak, ali za ovu
veličinu (10 naloga, 2 kamiona) može se riješiti **egzaktno**, pa sam umjesto
heuristike odabrao algoritam koji jamči optimum.

**Korak 1 – optimalna ruta za svaki kamion i svaki podskup naloga (dinamičko programiranje).**
Stanje = status svakog naloga (čeka / na kamionu / isporučen, zapisano kao dvije bitmaske)
+ trenutna lokacija.
Iz stanja se smije samo:
- **preuzeti** nalog koji čeka, ako stroj stane po težini i broju mjesta;
- **isporučiti** nalog koji je na kamionu.

Zato nosivost i redoslijed preuzimanje → isporuka *ne mogu* biti prekršeni. Svaki korak
povećava zbroj statusa za 1, pa se stanja obrađuju po razinama i za svako se pamti najkraći
put. Kad je kamion prazan, ruta se zatvori povratkom u bazu. Tako za **svaki** podskup naloga
dobijemo najkraću rutu baza → … → baza. Zbog kapaciteta (najviše 2 odnosno 3 stroja)
dostižnih stanja ima malo, pa izračun traje oko 0,2 s. Stanja koja već premašuju radno
vrijeme (prijeđeni km + obavljeni i neizbježni utovari/istovari) odmah se odbacuju; povratak
u bazu se namjerno ne procjenjuje, jer zaokruživanje dionica može narušiti nejednakost
trokuta, a rezanje mora ostati egzaktno.

**Korak 2 – podjela između kamiona.** Kamion A smije voziti samo strojeve ≤ 3.500 kg
(N01–N05), kamion B sve. Od svih parova *disjunktnih* podskupova koji stanu u radno
vrijeme bira se onaj s (nabrajanjem podskupova slobodnih naloga, najviše 3^n kombinacija;
isti kamioni s istim nalozima računaju se samo jednom):
1. **najviše izvršenih naloga** (prioritet: ništa ne ostaje neisporučeno), zatim
2. **najmanjom ukupnom kilometražom**.

Nalozi koji ne stanu označe se kao neizvršivi, s razlogom.

**Veći problemi – heuristika (`optimizer/heuristic.py`).** Ako neki kamion ima više od 12
mogućih naloga (3^n stanja postaje presporo), aplikacija ne pada, nego koristi:
najjeftinije izvedivo umetanje para preuzimanje/isporuka → lokalnu pretragu (premještanje
naloga između kamiona i pomicanje pojedinih radnji unutar rute) → više početnih redoslijeda
(fiksni seed, rezultat je ponovljiv). Aplikacija tada jasno upozorava da raspored nije dokazano
optimalan, a validator ga provjerava kao i egzaktni. Na zadanim podacima heuristika daje
219,7 km (+9,8 % od optimuma), a uz limit samo za vožnju 183,6 km (+0,8 %). Uz limit od 4 h
izvrši 6 naloga, a optimum 7, pa se za ≤ 12 naloga po kamionu uvijek koristi egzaktni DP.

**Pravila izračuna**
- Udaljenost: euklidska, zaokružena na 0,1 km **po dionici**. Interno se računa u
  desetinkama km (cijeli brojevi), pa se zaokruživanje ne gomila.
- Vrijeme: vožnja = km / 60 km/h; svaki utovar i svaki istovar traje 20 min.
- **Pretpostavka:** u dnevni limit od 9 h ulazi vožnja **i** utovar/istovar, jer je to
  stvarno radno vrijeme vozača i konzervativnija varijanta. U aplikaciji se može prebaciti
  na „samo vožnja”.
- Više radnji na istoj lokaciji (npr. istovar pa utovar na L8) ne dodaje kilometre.

### Ključni uvid

| Scenarij | Ukupno | Raspored |
|---|---|---|
| Bez vremenskog limita (teoretski minimum) | **182,2 km** | Sve vozi kamion B, ali to traje **9 h 42 min** |
| Limit 9 h, samo vožnja | 182,2 km | Isto kao gore (vožnja je samo ~3 h) |
| **Limit 9 h, vožnja + utovar/istovar (zadano)** | **200,1 km** | A: N03 (1 h 17 min), B: ostalih 9 naloga (8 h 43 min) |

Najkraća kilometraža zahtijevala bi da jedan vozač radi 42 minute preko limita. Optimizator
zato prebacuje nalog N03 (L9 → L4) na kamion A. To je najjeftinija preraspodjela
(+17,9 km), nakon koje oba vozača završavaju na vrijeme. Zanimljiv je i rad kamiona B:
M04 preuzima na L3 i nosi ga do baze, a usput odradi M08 i M09 (vrhunac tereta
9.900 / 10.000 kg).

## 4. Testovi

`pytest -v` pokreće 31 test: 26 u `tests/test_constraints.py` i 5 u `tests/test_api.py`
(optimum i zamka preko API-ja, vremenska crta, neispravan unos, limit od 4 h, validacija postavki).
Među ostalim:

- nosivost i broj strojeva nikad nisu prekoračeni ni nakon jedne radnje;
- strojevi teži od 3.500 kg nikad ne idu kamionom A; M10 uvijek putuje sam;
- svaki stroj preuzima i isporučuje isti kamion, i to preuzimanje dolazi prvo;
- obje rute počinju i završavaju u bazi, prazne;
- radno vrijeme ≤ 9 h; uz kraći limit neizvršivi nalozi se jasno označe s razlogom
  (uz 4 h točno N06, N08 i N10, kao u demonstraciji);
- preteški stroj (12 t) odbija se s razlogom, a ostali nalozi se i dalje izvrše;
- **validator stvarno hvata greške** (namjerno pokvaren plan: prekoračena nosivost,
  isporuka prije preuzimanja, krivo prikazan teret u tablici);
- neispravni ulazni podaci (dupla oznaka naloga, težina 0, ista lokacija preuzimanja i
  isporuke, kamion bez nosivosti, nedostaje baza) odbijaju se jasnom porukom;
- rubni slučajevi: nema vozila, scenarij „bez ograničenja” uz malu brzinu, više od 12 naloga
  po kamionu (heuristika poštuje sva ograničenja), validator ne pada na nepoznat nalog;
- **optimalnost:** rezultat DP-a jednak je brute-forceu (sve permutacije radnji) na manjim
  primjerima.

Sve se provjerava i neovisnim validatorom (`optimizer/validate.py`), koji iz samog niza
radnji ponovno izračuna kilometre, teret, vrijeme i redoslijed. Isti validator koristi i
aplikacija za zeleni/crveni status.

## 5. Struktura

```
api/main.py               FastAPI: /api/defaults, /api/optimize (+ poslužuje izgrađeni frontend)
frontend/                 React + TypeScript sučelje (Vite, Tailwind CSS, Motion)
app.py                    Streamlit sučelje (rezervno, bez Node.js-a)
optimizer/insight.py      objašnjenje zamke (zajedničko za oba sučelja)
optimizer/data.py         ulazni podaci zadatka i provjera ulaza
optimizer/solver.py       optimizacijski algoritam (egzaktni DP + optimalna podjela)
optimizer/heuristic.py    heuristika za veće probleme (umetanje + lokalna pretraga)
optimizer/validate.py     nezavisna provjera ograničenja
optimizer/__main__.py     ispis u terminalu
tests/test_constraints.py testovi poslovnih ograničenja
tests/test_api.py         testovi REST API-ja
tools/verify_ortools.py   neovisna usporedba s Google OR-Toolsom
tools/record_demo.js      automatsko snimanje demonstracijskog videa (Playwright)
```

**Tehnologije**
- **Backend:** Python (optimizacija i provjera), FastAPI (tipizirani REST API s automatskom
  dokumentacijom na `/docs`), pytest. Za vlastiti algoritam nisu potrebne vanjske optimizacijske
  biblioteke; OR-Tools služi samo za provjeru.
- **Frontend:** React 19 + TypeScript (strogi tipovi), Vite, Tailwind CSS 4, TanStack Query
  (ponovni izračun s debounceom, bez treperenja), Motion (animacije), Lucide ikone. Karta,
  vremenska crta i graf tereta su vlastiti SVG (lokacije su X/Y u km, a ne GPS, pa kartografske
  biblioteke nemaju smisla). Svijetla/tamna tema, prilagođeno mobitelu.
- Frontend ne računa ništa poslovno: sve brojke dolaze iz istog optimizatora i validatora, pa
  oba sučelja daju identične rezultate.
- **Streamlit** ostaje kao rezervno sučelje koje se pokreće jednom naredbom bez Node.js-a.

## 6. Korištenje AI alata i provjera rezultata

Za razvoj sam koristio **Claude (Anthropic)**: za analizu problema, prijedlog pristupa,
pisanje koda, testova i ove dokumentacije. Ni jednom rezultatu AI-ja nisam vjerovao bez provjere:

1. **Neovisna usporedba s OR-Toolsom.** Isti problem modeliran je u Googleovom solveru i dao
   je istu kilometražu (200,1 km i 182,2 km) za oba tumačenja limita.
2. **Brute force.** Na manjim primjerima isprobane su *sve* permutacije radnji; DP daje isti
   optimum.
3. **Nezavisni validator.** Odvojen kod ponovno računa sva ograničenja i namjerno je testiran
   na pokvarenim planovima kako bi se vidjelo da stvarno javlja greške.
4. **Ručna provjera.** Ruta kamiona A izračunata je na papiru:
   √89 ≈ 9,4 + √290 ≈ 17,0 + √117 ≈ 10,8 = 37,2 km; vrijeme 37 min vožnje + 2 × 20 min = 1 h 17 min.
5. **Kritičko čitanje testova.** Prvi test „M10 putuje sam” bio je pogrešno napisan
   (gledao je ukupni teret ≥ 9.400 kg, a to može biti i M09 + M04). Test je pao, a ja sam
   utvrdio da je greška u testu, ne u algoritmu, i ispravio ga da gleda koji su strojevi
   stvarno na kamionu.
6. **Tumačenje zadatka.** Nejasnoću oko toga ulazi li utovar/istovar u 9 h nisam prepustio
   AI-ju da prešutno odluči; izložena je kao pretpostavka i prekidač u aplikaciji.
7. **Završni pregled.** Prije predaje ponovno sam pokrenuo sve provjere (OR-Tools, scenarij
   od 4 h, ručni izračun) i aplikaciju u pregledniku. Pritom sam našao i ispravio: test
   neizvršivih naloga koji bi prošao gotovo s bilo kojim tekstom, nedostajuću provjeru
   ulaznih podataka (dupli nalog tiho bi pregazio drugi) i preniski minimum verzije Streamlita.
8. **Tehnički pregled (code review).** Svaku sumnju sam potvrdio prije popravka:
   - **gubljenje uređivanja u tablicama** – izlaz `data_editora` vraćao se kao njegov ulaz, a kod
     `num_rows="dynamic"` identitet widgeta ovisi o podacima. U pregledniku (Playwright) druga
     uzastopna izmjena iste tablice bila je izgubljena. Sada se izmjene upisuju u izvorne
     tablice u `on_change` povratnom pozivu, a isti test u pregledniku potvrđuje obje izmjene;
   - scenarij „bez ograničenja” zapravo je imao limit od 24 h (uz 5 km/h izvršio 9/10);
   - više od 12 naloga po kamionu rušilo je izračun → heuristika;
   - pogrešan razlog kad nema vozila; validator je mogao pasti na nepoznatom nalogu;
   - DP je ubrzan oko 5 puta (12 naloga, oba kamiona po 10 t: 12 s → 2 s), uz iste rezultate
     (testovi brute force i OR-Tools);
   - uklonjen neiskorišten kod (`distance_matrix`, `Plan.notes`) i `sys.path` hack u testovima.
9. **React + FastAPI sučelje.** Frontend ne sadrži poslovnu logiku: sve brojke dolaze iz istog
   optimizatora, a API testovi (`tests/test_api.py`) provjeravaju da daje iste rezultate.
   Sučelje sam provjerio u pregledniku (Playwright): dvije uzastopne izmjene nosivosti
   (185,8 → 187,5 km, isto kao Python), negativna koordinata, dupli nalog, limit od 4 h,
   tamna tema i mobilni prikaz bez vodoravnog pomicanja.

## 7. Procjena utrošenog vremena

| Aktivnost | Vrijeme |
|---|---|
| Analiza zadatka i odabir pristupa | 0,5 h |
| Optimizator i validator | 1 h |
| Web sučelje | 1 h |
| Testovi i neovisne provjere (OR-Tools, brute force, ručno) | 1 h |
| Dokumentacija | 0,5 h |
| Završni pregled (provjera svih brojki, validacija ulaza, dodatni testovi) | 0,5 h |
| Tehnički pregled: bugovi, rubni slučajevi, ubrzanje, heuristika | 1,5 h |
| React + FastAPI sučelje (API, komponente, provjera u pregledniku) | 3 h |
| **Ukupno** | **~9 h** |

## 8. Ograničenja i mogući nastavak

- Egzaktni DP praktičan je do ~12 naloga po kamionu; iznad toga radi ugrađena heuristika.
  Za stvarni dnevni volumen UP Renta koristio bih OR-Tools (model je već napisan u
  `tools/verify_ortools.py`) ili jaču metaheuristiku (npr. ALNS).
- Prema zadatku koriste se euklidske udaljenosti; za produkciju trebaju stvarne ceste
  (OSRM/Google Distance Matrix) i vremenski prozori kupaca.
- Planiranje na više dana, prioriteti naloga, vozač bez kamiona i slično nisu dio zadatka.
