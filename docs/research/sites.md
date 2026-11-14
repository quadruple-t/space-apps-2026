# Shadowline: verified lunar landing-site catalog

Retrieval date for every source below: **2026-11-14**. Every number was read from the URL cited next to it. Values are not filled from memory. Where no page gave a value, the cell says **UNSOURCED**.

Conventions: latitude is selenographic (north positive). Longitude is east-positive, −180 to 180. Where the source gives 0–360 E, I converted it (lon − 360) and also show the original in the notes. Times are UTC. "LROC" means the LROC team at ASU; its pages now redirect from `www.lroc.asu.edu` to `lroc.im-ldi.com`.

## 0. Coordinate frames used by the sources (read first)

| Source | Frame / datum, as stated by the source | Precision |
|---|---|---|
| LROC "Coordinates of Lunar Anthropogenic Targets", 28 Jul 2016 (Wagner et al., Icarus 283:92–103, 2017). https://lroc.im-ldi.com/data/support/downloads/2016_LROC_Coordinates_of_Human_Features.pdf | Mean Earth/polar axis (ME). Positions from NAC images in USGS ISIS, with the GLD100 shape model for elevation and LOLA crossover-corrected LRO kernels (orbit uncertainty about 15 m). Longitudes 0–360 E. | Per-object uncertainty 0.3–19 m (column in table) |
| LROC RDR "Anthropogenic (man-made) Features on the Moon" shapefile. https://data.lroc.im-ldi.com/lroc/view_rdr/SHAPEFILE_ANTHROPOGENIC_OBJECTS | "IAU Moon 2000 Geographic". Page last updated **2026-08-14**. Has a COORD_SRC column per object (laser ranging, Wagner 2017 method, or DTM orthophoto). | **Not downloaded** (1.5 MB ZIP; downloading needs your OK). It is the most current single source and probably supersedes the 2016 PDF for some objects. |
| NSSDCA "Apollo Landing Sites". https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html | "planetocentric Mean Earth/Polar Axis Lunar Reference System - DE421 ephemeris", from Wagner et al. 2017. Last updated 06 Mar 2017. | Same values as LROC 2016 |
| LROC image/news posts (2019–2025) | ME/LOLA-controlled NAC (same team and pipeline). | Stated per post (±3 m to ±40 m) |
| NSSDCA Soviet and Surveyor summary pages | No frame stated. These are Apollo/Soviet-era published positions, rounded to 0.01°. | Errors of 1–7.6 km versus LROC (computed below) |
| NASA SP-4029 Apollo 11 summary (cites the Apollo 11 Mission Report MSC-00171) | Apollo-era, pre-LOLA. | About 6 m from LROC for Apollo 11 |
| ALSJ Fjeld/Scotti Earth/Sun table | Older site coordinates (for example Apollo 11 at +0.6875, +23.4333, which is 1.27 km from LROC). | Sun angles stated to differ by "less than 0.5 degrees" between the two computations |
| USGS Gazetteer of Planetary Nomenclature | "Planetographic, +East, -180 to 180" (for the spherical Moon this matches planetocentric). Lists several control-network solutions per feature. | Feature centers only |

Offsets between frames: Apollo-era and Soviet-era published coordinates differ from LROC/ME values by about 1 to 7.6 km. The ME versus IAU-2000 difference within LROC products is metre-scale. **Use LROC values as the catalog truth** and keep the historical values only as "as published" metadata.

---

## 1. Seed sites (verification)

| id | name | lat | lon | landing UTC | outcome | agency | country | source URL(s) | notes (precision / datum) |
|---|---|---|---|---|---|---|---|---|---|
| apollo-11 | Apollo 11 LM *Eagle* (Tranquility Base) | 0.67416 | 23.47314 | 1969-07-20T20:17:40Z (Contact Light, GET 102:45:40). Mission Report: touchdown GET 102:45:39.9, which SP-4029 gives as 20:17:39 GMT. | Success (crewed) | NASA | USA | LROC 2016 PDF (above); NSSDCA https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1969-059C ("landed at 20:17:40 UT", "0.67416 degrees N latitude, 23.47314 degrees E"); SP-4029 https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_11a_Summary.htm ; ALSJ https://www.apollojournals.org/alsj/a11/a11.landing.html | LROC ME, ±0.3 m, elevation −1926 m. The seed (0.67408, 23.47297) is the Apollo-era value in SP-4029, about 6 m from LROC. The landing second is 39.9 s (computed from GET), shown as 20:17:39 or 20:17:40 depending on rounding. |
| apollo-17 | Apollo 17 LM *Challenger* (Taurus-Littrow) | 20.1911 | 30.7723 | 1972-12-11T19:54:57Z (NSSDCA). ALSJ table gives 19:54:58. | Success (crewed) | NASA | USA | LROC 2016 PDF; NSSDCA https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-096C ; ALSJ https://www.apollojournals.org/alsj/alsj-EarthSun_AltAz.html | LROC ME, ±3.5 m, elevation −2626 m. The seed is 19 m off. |
| luna-24 | Luna 24 | 12.7142 | 62.2129 | 1976-08-18T02:00:00Z (NSSDCA, minute-level) | Success (sample return) | USSR | USSR | LROC 2016 PDF; NSSDCA https://nssdc.gsfc.nasa.gov/planetary/lunar/lunarussr.html (12.75 N, 62.20 E) | LROC ME, ±3.7 m. The seed equals the NSSDCA Soviet-era value, which is **1.15 km** from LROC. |
| change-4 | Chang'e-4 lander (Von Kármán) | −45.4561 | 177.5885 | 2019-01-03T02:26Z (minute) | Success (far side) | CNSA | China | LROC DTM https://lroc.im-ldi.com/images/1100 (30 Apr 2019; about 3 m uncertainty, elevation −5927 m); first fix https://lroc.im-ldi.com/posts/1087 (45.457°S, 177.589°E ±20 m); time from https://planetary.org/blogs/jason-davis/change4-success.html ("10:26 Beijing time ... 02:26 UTC") | Seed confirmed exactly. Time is from the Planetary Society, citing Chinese state media; no CNSA primary was opened. |
| change-6 | Chang'e-6 lander (Apollo basin) | −41.6385 | −153.9852 | 2024-06-01T22:23Z (minute) | Success (far-side sample return) | CNSA | China | LROC https://lroc.im-ldi.com/images/1374 (14 Jun 2024: "41.6385°S, 206.0148°E", −5256 m, ±30 m); time from https://spacepolicyonline.com/news/china-lands-sample-return-probe-on-the-far-side-of-the-moon/ (6:23 pm EDT 1 Jun) | Seed longitude −153.9858 should be **−153.9852** (206.0148 − 360), a 14 m difference. Search results also showed a Chinese paper (ygxb.ac.cn) placing it at 153.9856°W, 41.6383°S; I did not open it. |
| chandrayaan-2-vikram | Chandrayaan-2 *Vikram* impact site ("Tiranga Point") | −70.8810 | 22.7840 | 2019-09-06 (US date) / 2019-09-07 (IST). Time **UNSOURCED**. | Crash (contact lost at 2.1 km altitude) | ISRO | India | LROC https://lroc.im-ldi.com/images/1131 ; NASA https://www.nasa.gov/image-article/vikram-lander-found/ (Dec 02 2019: "70.8810°S, 22.7840°E, 834 m elevation") | The seed was rounded; use the LROC value (50 m difference). This is the impact crater, not the intended site. |
| chandrayaan-3 | Chandrayaan-3 *Vikram* ("Statio Shiv Shakti") | −69.3741 | 32.32 | 2023-08-23. Time **UNSOURCED** to the minute from a primary. ISRO pre-landing estimate: "around 18:04 hours IST" (about 12:34 UTC), with powered descent at about 17:45 IST. | Success (with *Pragyan* rover) | ISRO | India | LROC https://lroc.im-ldi.com/images/1314 (5 Sep 2023: "69.3741°S, 32.32°E, 532 m"); ISRO target https://www.isro.gov.in/Chandrayaan3_Details.html (prime site "69.367621 S, 32.348126 E", 4 km × 2.4 km); https://new1.isro.gov.in/Chandrayaan3.html | Seed (−69.3733, 32.3189) matches Wikipedia's 69.373/32.319, which is tertiary. LROC gives longitude to only 2 decimals (about ±0.005°, ±50 m). The LROC position is 359 m from ISRO's target. The 18:03 IST (12:33 UTC) figure appears only in secondary sources. |
| slim | SLIM (Shioli crater area) | −13.3160 | 25.2510 | 2024-01-19T15:20Z (minute) | Success (landed inverted; operated) | JAXA | Japan | LROC https://lroc.im-ldi.com/images/1358 ("13.3160°S, 25.2510°E, -912 m"; "19 January 2024 at 15:20 UTC"; NAC M1460739214L) | The seed was rounded and is **486 m** off. |
| im-1 | IM-1 *Odysseus* (near Malapert A) | −80.13 | 1.44 | 2024-02-22T23:24Z (from "6:24 p.m. EST") | Partial success (tipped over) | Intuitive Machines / NASA CLPS | USA | NASA https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/ ("80.13 degrees south latitude, 1.44 degrees east longitude", 2579 m; NAC M1463440322L) | Seed confirmed. NASA gives only 2 decimals (about ±0.005°). A finer value may be in the LROC shapefile. |

---

## 2. Additional sites

### 2a. Apollo

| id | name | lat | lon | landing UTC | outcome | agency | country | source URL(s) | notes |
|---|---|---|---|---|---|---|---|---|---|
| apollo-12 | Apollo 12 LM *Intrepid* | −3.0128 | −23.4219 | 1969-11-19T06:54:35Z (NSSDCA). ALSJ table: 06:54:36. | Success (crewed) | NASA | USA | LROC 2016 PDF (336.5781 E, ±2.2 m, −1422 m); NSSDCA https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1969-099C ; NSSDCA lunar_sites | LROC ME |
| apollo-14 | Apollo 14 LM *Antares* | −3.64589 | −17.47194 | 1971-02-05T09:18:11Z (NSSDCA). ALSJ table: 09:18:13. | Success (crewed) | NASA | USA | LROC 2016 PDF (342.52806 E, ±0.4 m, −1062 m); NSSDCA https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1971-008C | LROC ME |
| apollo-15 | Apollo 15 LM *Falcon* | 26.13239 | 3.63330 | 1971-07-30T22:16:29Z | Success (crewed) | NASA | USA | LROC 2016 PDF (±1.0 m, −1931 m); NSSDCA https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1971-063C ; ALSJ table (same time) | LROC ME |
| apollo-16 | Apollo 16 LM *Orion* | −8.9734 | 15.5011 | 1972-04-21T02:23:35Z | Success (crewed) | NASA | USA | LROC 2016 PDF (±3.0 m, elevation 8 m); NSSDCA lunar_sites (same value); NSSDCA spacecraft page https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-031C gives "8.9730 S ... 15.5002 E" | The two NSSDCA pages disagree by 30 m. Use LROC (−8.9734, 15.5011). |

### 2b. Soviet Luna / Lunokhod

| id | name | lat | lon | landing UTC | outcome | agency | country | source URL(s) | notes |
|---|---|---|---|---|---|---|---|---|---|
| luna-9 | Luna 9 | 7.08 | −64.37 | 1966-02-03T18:44:52Z | Success (first soft landing) | USSR | USSR | NSSDCA https://nssdc.gsfc.nasa.gov/planetary/lunar/lunarussr.html ("7.08 N, Longitude 295.63 E") | **Not located by LROC** (absent from the 2016 table). This is a Soviet-era value; expect a km-level error. Search results described two candidate sites (Egorov; Pinault et al. in *npj Space Exploration*), but none is confirmed and I did not open those pages. |
| luna-16 | Luna 16 | −0.5137 | 56.3638 | 1970-09-20T05:18:00Z (minute) | Success (sample return) | USSR | USSR | LROC 2016 PDF (±3.7 m); NSSDCA lunarussr (0.68 S, 56.30 E) | The NSSDCA value is 5.4 km off. |
| luna-17 | Luna 17 lander | 38.23764 | −35.00163 | 1970-11-17T03:47:00Z (minute) | Success | USSR | USSR | LROC 2016 PDF (324.99837 E, ±0.5 m); NSSDCA lunarussr (38.28 N, 325.00 E) | |
| lunokhod-1 | Lunokhod 1 rover (final position) | 38.3150 | −35.0081 | (delivered by Luna 17) | Success | USSR | USSR | LROC 2016 PDF (324.9919 E, ±3.8 m) | This is where the rover finished its traverse, not a landing point. |
| luna-20 | Luna 20 | 3.7863 | 56.6242 | 1972-02-21T19:19:00Z (minute) | Success (sample return) | USSR | USSR | LROC 2016 PDF (±4.3 m); NSSDCA lunarussr (3.57 N, 56.50 E) | The NSSDCA value is **7.6 km** off. |
| luna-21 | Luna 21 lander | 25.9994 | 30.4076 | 1973-01-15T23:35:00Z (minute) | Success | USSR | USSR | LROC 2016 PDF (±13.4 m); NSSDCA lunarussr (25.85 N, 30.45 E) | |
| lunokhod-2 | Lunokhod 2 rover (final position) | 25.8323 | 30.9222 | (delivered by Luna 21) | Success | USSR | USSR | LROC 2016 PDF (±7.5 m) | Final rover position |
| luna-23 (optional) | Luna 23 | 12.6667 | 62.1511 | UNSOURCED | Landed damaged; no sample | USSR | USSR | LROC 2016 PDF (±3.0 m) | Bonus: about 6 km from Luna 24 |
| luna-13 (optional) | Luna 13 | 18.87 | −62.05 | 1966-12-24T18:01:00Z | Success | USSR | USSR | NSSDCA lunarussr | Not in the LROC table; Soviet-era value |

### 2c. Surveyor

| id | name | lat | lon | landing UTC | outcome | agency | country | source URL(s) | notes |
|---|---|---|---|---|---|---|---|---|---|
| surveyor-1 | Surveyor 1 | −2.4745 | −43.3398 | 1966-06-02T06:17:36Z | Success | NASA/JPL | USA | LROC 2016 PDF (316.6602 E, ±5.6 m); NSSDCA https://nssdc.gsfc.nasa.gov/planetary/lunar/surveyor.html (2.45 S, 316.79 E) | NSSDCA value 4.0 km off |
| surveyor-3 | Surveyor 3 | −3.0162 | −23.4180 | 1967-04-20T00:04:53Z | Success | NASA/JPL | USA | LROC 2016 PDF (336.5820 E, ±2.6 m); NSSDCA surveyor (3.01 S, 336.66 E) | Next to Apollo 12 |
| surveyor-5 | Surveyor 5 | 1.4551 | 23.1943 | 1967-09-11T00:46:44Z | Success | NASA/JPL | USA | LROC 2016 PDF (±11.9 m); NSSDCA surveyor (1.41 N, 23.18 E) | |
| surveyor-6 | Surveyor 6 | 0.4742 | −1.4275 | 1967-11-10T01:01:06Z | Success (made the first lunar "hop") | NASA/JPL | USA | LROC 2016 PDF (358.5725 E, ±6.7 m); NSSDCA surveyor (0.49 N, 358.60 E) | |
| surveyor-7 | Surveyor 7 (Tycho north rim) | −40.9812 | −11.5127 | 1968-01-10T01:05:36Z | Success | NASA/JPL | USA | LROC 2016 PDF (348.4873 E, ±3.5 m); NSSDCA surveyor (40.86 S, 348.53 E) | |

### 2d. Chang'e-3 and -5

| id | name | lat | lon | landing UTC | outcome | agency | country | source URL(s) | notes |
|---|---|---|---|---|---|---|---|---|---|
| change-3 | Chang'e-3 lander (Mare Imbrium) | 44.1214 | −19.5117 | 2013-12-14, about 13:11–13:12Z (approximate) | Success (with *Yutu* rover) | CNSA | China | LROC 2016 PDF (340.4883 E, ±9.1 m, −2630 m); time from Xinhua via https://english.spacechina.com/n17212/c604696/content.html ("about 21:00" Beijing, touched down "about 12 minutes later") | Only an approximate minute is sourced. Yutu's position: 44.1208, −19.5122 (LROC, ±12.9 m). |
| change-5 | Chang'e-5 lander (Oceanus Procellarum) | 43.0576 | −51.9161 | 2020-12-01T15:11Z (minute) | Success (sample return) | CNSA | China | LROC https://lroc.im-ldi.com/images/1172 ("43.0576° N, 308.0839°E", −2570 m, ±20 m; "15:11 UTC 01 December 2020") | |

### 2e. Commercial and 2019–2025 missions

| id | name | lat | lon | landing UTC | outcome | agency | country | source URL(s) | notes |
|---|---|---|---|---|---|---|---|---|---|
| beresheet | Beresheet impact site | 32.5956 | 19.3496 | 2019-04-11. Time **UNSOURCED**. | Crash | SpaceIL / IAI | Israel | LROC https://lroc.im-ldi.com/images/1101 (15 May 2019) | Darkest pixel of the impact smudge; 95% confidence interval 20 m (lat) × 8 m (lon) |
| hakuto-r-m1 | ispace HAKUTO-R Mission 1 (probable impact) | 47.581 | 44.094 | 2023-04-25T16:40Z (approximate; LROC says "moments before the touchdown on 25 April at 12:40 p.m. EDT") | Crash | ispace | Japan | LROC https://lroc.im-ldi.com/images/1302 (Speyerer, 23 May 2023) | LROC calls it a surface change near the nominal site (Atlas crater region). The UTC time is my conversion from EDT. |
| luna-25 | Luna 25 impact crater | −57.865 | 61.360 | 2023-08-19T11:58Z | Crash | Roscosmos | Russia | LROC https://lroc.im-ldi.com/images/1311 ("57.865°S, 61.360°E", −360 m, "accuracy better than 40 meters", "19 August 2023 11:58 am UTC") | LROC says the crater is "likely" Luna 25's. Intended site was 69.545°S, 43.544°E, 424 km away. |
| blue-ghost-m1 | Firefly Blue Ghost Mission 1 (Mare Crisium, near Mons Latreille) | 18.5623 | 61.8103 | 2025-03-02T08:34Z (from "3:34 a.m. EST") | Success | Firefly / NASA CLPS | USA | LROC https://www.lroc.im-ldi.com/images/1407 (7 Mar 2025, −3650 m); NASA https://www.nasa.gov/news-release/touchdown-carrying-nasa-science-fireflys-blue-ghost-lands-on-moon/ | |
| im-2 | IM-2 *Athena* (Mons Mouton area; lander on its side in a crater about 20 m across) | −84.7906 | 29.1957 | 2025-03-06, about 17:30Z (approximate) | Partial / failure (tipped over; operated less than a day) | Intuitive Machines / NASA CLPS | USA | LROC https://lroc.im-ldi.com/images/1408 (10 Mar 2025; NAC M1495922531LR); NASA https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/ ("approximately 11:30 a.m. March 6") | The NASA release gives no time zone for 11:30; the same release uses CST elsewhere, which gives 17:30 UTC. Flag as approximate. The target was −84.78, 29.13E (LROC images/1401), 369 m away. |
| hakuto-r-m2 | ispace Mission 2 *RESILIENCE* impact site | 60.4445 | −4.5880 | 2025-06-05T18:13Z | Crash | ispace | Japan | LROC https://lroc.im-ldi.com/images/1456 ("60.4445°N, 355.4120°E", −2431.6 m; "hard landing on 5 June 2025 18:13 UTC"; NAC M1504323448R) | Target area 60.5°N, 355.4°E in Mare Frigoris (LROC images/1412) |

### 2f. 2025–2026 check (what actually landed by 2026-11-14)

- Landed in 2025 (all listed above): Blue Ghost M1 (2 Mar), IM-2 (6 Mar, tipped over), ispace M2 (5 Jun, crash).
- **Nothing landed in 2026 up to the latest sources I found.**
  - The Space Review (Jeff Foust, 26 Oct 2026), https://www.thespacereview.com/article/5344/1 : none of the four CLPS missions planned for 2026 had launched. Chang'e-7's launch was called off in late August 2026 and is postponed "at least to some time next year". Griffin-1 is no earlier than January 2027. IM-3 and Blue Ghost 2 slipped to 2027. Blue Moon Mk1 "Endurance" is expected early 2027.
  - LROC's "Robotic Spacecraft" tag page has no 2026 posts. Its "Spacecraft Impact" tag lists only "Falcon 9 Impact!" (images/1499, 18 Aug 2026), a rocket stage, not a lander.
  - Search results (not opened) suggest Griffin-1 moved to about 31 Jan 2027. There is a residual risk of something between 8 and 14 Nov 2026 that I did not see.

---

## 3. Artemis III candidate landing regions

**Current status of the mission.** NASA release of 27 Feb 2026 (https://www.nasa.gov/news-release/nasa-adds-mission-to-artemis-lunar-program-updates-architecture/): Artemis III is now a **2027 low-Earth-orbit test flight** (rendezvous and docking with SpaceX and/or Blue Origin landers, plus xEVA suit tests). **Artemis IV, planned for 2028, is the first crewed landing.** NASA's blog of 23 Oct 2026 (https://www.nasa.gov/blogs/missions/2026/10/23/nasa-shares-artemis-acceleration-plans-for-moon-missions/) restates "Artemis III ... low Earth orbit in 2027" and Artemis IV as the first landing in 2028. The NASA Artemis IV page (https://www.nasa.gov/mission/artemis-iv/) says "the agency has identified nine candidate landing regions near the lunar South Pole" and gives a launch of "Early 2028". On 16 Mar 2026, SpacePolicyOnline (https://spacepolicyonline.com/news/kshatriya-hints-nasa-may-reconsider-south-pole-for-initial-artemis-landings/) reported Kshatriya saying "we're not yet giving up on the South Pole"; no decision was reported.

**Latest official list.** There are 9 regions (NASA, 28 Oct 2024: https://www.prnewswire.com/news-releases/nasa-provides-update-on-artemis-iii-moon-landing-regions-302288659.html, "in no priority order"). They are reaffirmed in LPSC 2026 abstract #1901 (George, Rubio, Lawrence, Curell, NASA): https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf. That abstract says the 9 regions "are specific to Artemis III" and that the refinement "does not affect site selection for Artemis IV and later missions". **The Artemis IV page (above), however, quotes the same nine.** I found no newer list. The 2022 list of 13 regions (NASA, 19 Aug 2022: https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/) said each region is about "15 by 15 kilometers", "within six degrees of latitude of the lunar South Pole", with landing sites about 100 m in radius.

**Coordinates.** Neither the 2022 nor the 2024 NASA release, nor LPSC 2026 #1901, gives coordinates or boundaries. The table below gives the nearest **named-feature** reference coordinates from the USGS Gazetteer. **These are not region centroids.** "Rim" regions sit on crater rims, not at crater centers.

| id | region (NASA 2024) | in the 2022 list? | representative coordinate available | lat | lon | source | notes |
|---|---|---|---|---|---|---|---|
| a3-peak-near-cabeus-b | Peak near Cabeus B | No (new in 2024) | Cabeus B crater center (feature ID 8058) | −82.26 | −54.58 | https://planetarynames.wr.usgs.gov/Feature/Cabeus%20B | Region is a peak *near* the crater; not a centroid |
| a3-haworth | Haworth | Yes | Haworth crater center (ID 14502) | −86.90 | −4.00 | https://planetarynames.wr.usgs.gov/Feature/Haworth | Other control-network solutions: −87.20/−7.49 and −87.45/−5.17 |
| a3-malapert-massif | Malapert Massif | Yes | Malapert crater center (ID 3603) | −85.00 | 11.40 | https://planetarynames.wr.usgs.gov/Feature/Malapert | The massif is not the crater; coarse proxy only |
| a3-mons-mouton-plateau | Mons Mouton Plateau | No (new) | IM-2 intended site on Mons Mouton | −84.78 | 29.13 | LROC https://lroc.im-ldi.com/images/1401 | Gazetteer page for Mons Mouton returned HTTP 500, so the feature center is **UNSOURCED** |
| a3-mons-mouton | Mons Mouton | Yes, as "Leibnitz Beta Plateau" (renamed; the renaming came from search snippets only, not verified) | Same proxy | −84.78 | 29.13 | LROC images/1401 | Same caveat as above |
| a3-nobile-rim-1 | Nobile Rim 1 | Yes | Nobile crater center (ID 4321) | −85.28 | 53.27 | https://planetarynames.wr.usgs.gov/Feature/Nobile | The region is on the rim (crater diameter 79 km); the center is about 40 km from the rim |
| a3-nobile-rim-2 | Nobile Rim 2 | Yes | Nobile crater center | −85.28 | 53.27 | same | same |
| a3-de-gerlache-rim-2 | de Gerlache Rim 2 | Yes | de Gerlache crater center (ID 1439) | −88.48 | −88.34 | https://planetarynames.wr.usgs.gov/Feature/de%20Gerlache | Rim region; crater diameter 32.7 km |
| a3-slater-plain | Slater Plain | No (new) | Slater crater center (ID 15325) | −88.08 | 111.29 | https://planetarynames.wr.usgs.gov/Feature/Slater | Plain near the crater |

Region centroids: **UNSOURCED** for all 9.

**Recommended method for the app:**
1. Georeference NASA's published 2024 region map (NASA/GSFC image released with the 28 Oct 2024 announcement) onto an LROC/LOLA south-polar stereographic basemap.
2. Digitize each region's outline and compute the centroid in polar-stereographic coordinates, then convert to lat/lon.
3. Cite the map image and state about ±1–2 km uncertainty.

Alternatively, if one can be obtained, use a published region shapefile: the 2026 JGR paper (Wueller et al., doi:10.1029/2025JE009434, which reports 130 candidate sites inside the regions) or NASA ACT-REACT QuickMap layers. The JGR page returned HTTP 403 to me. Label every Artemis point in the UI "approximate region reference".

---

## 4. Sun elevation at landing (validation values)

**Apollo 11.**

| quantity | value | short quote | where | URL |
|---|---|---|---|---|
| Computed Sun altitude/azimuth at landing (20:17:39 UTC) | **10.65° altitude, 88.81° azimuth** | (table row) | ALSJ "Earth and Sun Altitude/Azimuth" table, Apollo 11 row. Computed by Paul Fjeld and Jim Scotti (table uses Scotti's values), "spot-checked" against JPL Horizons; the two computations differ by "less than 0.5 degrees". Site coordinates used: +23.4333 E, +0.6875 N. | https://www.apollojournals.org/alsj/alsj-EarthSun_AltAz.html |
| Planned Sun elevation (launch-window design) | **10.8°** | "to take advantage of a sun elevation angle on the lunar surface of 10.8°" | NASA SP-4029 *Apollo by the Numbers*, Apollo 11 summary, Ascent Phase paragraph. This is a **planning value tied to the launch window, not the as-flown landing value**. The same page gives the acceptable range "from 5° to 14°", with sunlight changing "about 0.5° per hour". | https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_11a_Summary.htm |
| Crew observation | "about 10 degrees" | "at this Sun angle - about 10 degrees Sun angle" | ALSJ Apollo 11 Post-landing transcript, Armstrong at GET 103:12:44 (about 27 minutes after landing) | https://www.apollojournals.org/alsj/a11/a11.postland.html |
| Journal editor's computed value | 11.37° elevation, 88.81° azimuth at GET 104:02:42 | "the solar elevation and azimuth was 11.37 and 88.81" | ALSJ post-landing commentary | same |

Primary Mission Report (MSC-00171) as-flown value: **UNSOURCED**. The PDF at https://www.nasa.gov/wp-content/uploads/static/apollo50th/pdf/A11_MissionReport.pdf exceeded the 10 MB fetch limit. The ALSJ copy (a11mr_NoMissingPages) returned 404. The press kit and flight plan PDFs are scanned or font-encoded and could not be text-extracted. A search snippet reported the flight plan's Table 1-3 listing Site 2 with 10.5° and 13.5° values, but I could not verify this.

Suggested validation target for the simulator: **Sun altitude about 10.6–10.7° at azimuth about 88.8° (almost due east)** at 1969-07-20T20:17:40Z at Tranquility Base, within ±0.5°.

**Apollo 12–17 at landing (ALSJ Fjeld/Scotti table, same URL as above; computed values, not mission-report values).**

| mission | landing UTC (table) | Sun alt / az (°) | site lon, lat used by table |
|---|---|---|---|
| Apollo 12 | 1969-11-19 06:54:36 | 5.19 / 91.16 | −23.3856, −3.1975 |
| Apollo 14 | 1971-02-05 09:18:13 | 10.36 / 89.54 | −17.4653, −3.6733 |
| Apollo 15 | 1971-07-30 22:16:29 | 12.05 / 95.73 | +3.6528, +26.1008 |
| Apollo 16 | 1972-04-21 02:23:35 | 14.76 / 86.01 | +15.5144, −8.9914 |
| Apollo 17 | 1972-12-11 19:54:58 | 13.33 / 95.83 | +30.7658, +20.1653 |

For the same missions, the ALSJ Earth altitude/azimuth: A12 61.56/86.95, A14 66.10/96.70, A15 69.28/203.00, A16 77.16/319.70, A17 45.52/240.88. The Apollo 11 Earth altitude is printed as "59:43", an ambiguous format (possibly degrees:arcminutes).

EVA sun elevations (Brian Lawrence, revised Feb 1999): https://www.apollojournals.org/alsj/sunangles.html . Apollo 11 EVA: 14.0° at GET 109.00, 15.4° at 111.75. Apollo 17 EVA-1: 15.3° at 117.00. No landing values are given there.

**Chandrayaan-3 sun elevation and sunrise timing.** **UNSOURCED** from a primary source. ISRO pages give only "Powered descent ... around 1745 Hrs. IST" (https://new1.isro.gov.in/Chandrayaan3.html). Forum posts claim an 8.75° elevation and a 6–9° requirement; they are not primary and should not be used.

---

## Corrections to seed

1. **Apollo 11:** keep the seed time. For coordinates, prefer LROC **0.67416, 23.47314**. The seed (0.67408, 23.47297) is the Apollo-era SP-4029 / Mission Report value, 6 m away. Label the time as Contact Light 20:17:40Z (touchdown GET 102:45:39.9).
2. **Apollo 17:** 20.1908, 30.7717 → **20.1911, 30.7723** (LROC/NSSDCA), a 19 m change. Landing time **1972-12-11T19:54:57Z** (NSSDCA); the ALSJ table gives :58.
3. **Luna 24:** 12.75, 62.2 → **12.7142, 62.2129** (LROC), a 1.15 km change.
4. **Chang'e-4:** confirmed. Add time 2019-01-03T02:26Z.
5. **Chang'e-6:** longitude −153.9858 → **−153.9852** (LROC 206.0148E), a 14 m change. Add time 2024-06-01T22:23Z.
6. **Chandrayaan-2:** −70.88, 22.78 → **−70.8810, 22.7840** (impact site).
7. **Chandrayaan-3:** −69.3733, 32.3189 → **−69.3741, 32.32** (LROC), a 27 m change. The seed traces to Wikipedia, not a primary. Do not use ISRO's 69.367621/32.348126, which is the *planned* prime site.
8. **SLIM:** −13.3, 25.25 → **−13.3160, 25.2510**, a 486 m change. Add 2024-01-19T15:20Z.
9. **IM-1:** confirmed (−80.13, 1.44; only 2 decimals published). Add 2024-02-22T23:24Z.
10. **Apollo 16:** if seeded from the NSSDCA spacecraft page (−8.9730, 15.5002), switch to the LROC value **−8.9734, 15.5011**.

## UNSOURCED list

- Chandrayaan-2 Vikram crash time (to the minute or second).
- Chandrayaan-3 touchdown time from an ISRO primary source (the 18:03 IST figure is only in secondary sources; ISRO's pre-landing estimate was "around 18:04").
- Chandrayaan-3 sun elevation at landing and the exact local sunrise time.
- Apollo 11 as-flown sun elevation in the Mission Report MSC-00171 (PDF too large or scanned). Computed ALSJ value used instead.
- Apollo 12–17 sun elevations from mission reports (only the computed ALSJ values were found).
- Beresheet impact time of day.
- Luna 23 landing time.
- Luna 9 precise (LROC-verified) location: still not located. Only the Soviet-era NSSDCA value is available.
- Chang'e-3 landing time to the second (about 13:11–13:12Z only); Chang'e-4, Chang'e-6, SLIM and Chang'e-5 are known only to the minute.
- IM-2 landing time: approximate, because the NASA release omits the time zone.
- HAKUTO-R M1 time: the LROC page says "moments before" 12:40 pm EDT, so it is approximate.
- Artemis III/IV region centroids or boundaries: no official coordinates published. Mons Mouton gazetteer center: page error.
- Contents of the LROC 2026-08-14 anthropogenic-objects shapefile: not downloaded (needs your approval; it would also give IM-1 and Chandrayaan-3 to more decimals).

## Search-result claims not opened (do not use without checking)

- Chinese paper (ygxb.ac.cn) on Chang'e-6 localization: 153.9856°W, 41.6383°S.
- Luna 9 candidate-site papers.
- Griffin-1 slip to 31 Jan 2027.
- Mons Mouton previously called "Leibnitz Beta".
