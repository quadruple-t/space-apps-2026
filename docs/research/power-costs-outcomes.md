# Shadowline research: lander power presets, debrief numbers, costs, landing record

Compiled 2026-11-14. Every number below comes from a URL that was opened during this research, and each one carries a short quote or table excerpt. "Secondary" marks reputable press rather than agency or peer-reviewed sources. "Derived" marks values computed here from cited inputs. Anything not found is listed under **UNSOURCED** at the end.

Source tiers: **A** = agency, official report or peer-reviewed paper. **B** = company or official mission document. **C** = secondary press.

---

## 1. Power model presets

### 1a. Chandrayaan-3 (Vikram lander and Pragyan rover)

| Field | Value | Unit | Quote | Source |
|---|---|---|---|---|
| Lander power generation | 738 | W | "738W, WS with Bias" | A: https://www.isro.gov.in/Chandrayaan3_Details.html |
| Rover power generation | 50 | W | "50W" (Rover) | A: same |
| Lander mass incl. rover | 1752 (rover 26) | kg | "1752 kg including Rover of 26 kg" | A: same |
| Mission life | 1 lunar day (~14 Earth days) | d | "One lunar day (~14 Earth days)" | A: same |
| Lander comms | IDSN + rover; Ch-2 orbiter as backup | – | "Communicates with IDSN and Rover. Chandrayaan-2 Orbiter is also planned for contingency link." | A: same |
| Rover comms | lander only | – | "Communicates only with Lander." | A: same |
| Prime landing site | 4 km x 2.4 km, 69.367621 S, 32.348126 E | – | "4 km x 2.4 km 69.367621 S, 32.348126 E" | A: same |
| Rover battery | 10 | Ah | "The capacity of the rover battery is 10 Ampere-hour (Ah)." | C: https://www.theweek.in/news/sci-tech/2023/09/07/chandrayaan-3-in-sleep-mode-after-14-days-on-the-moon-will-pragyan-rover-wake-up-again.html |
| Lander battery | UNSOURCED | – | – | – |
| Planned touchdown velocity | <2 vertical, <0.5 horizontal | m/s | "Touchdown velocity had been planned to be less than 2 m/s vertical and 0.5 m/s horizontal." | A: PIB document, https://static.pib.gov.in/WriteReadData/specificdocs/documents/2023/aug/doc2023828246201.pdf (p.2) |

### 1b. Chandrayaan-2 (Vikram, Pragyan, orbiter)

| Field | Value | Unit | Quote | Source |
|---|---|---|---|---|
| Vikram power | 650 | W | Electric power generation "650 W" | A: https://www.isro.gov.in/chandrayan_spacecraft.html |
| Vikram mass | 1471 | kg | "1,471 kg" | A: same |
| Vikram design life | 1 lunar day | – | "one lunar day, which is equivalent to about 14 Earth days" | A: same |
| Pragyan power / mass | 50 / 27 | W / kg | "50 W", "27 kg" | A: same |
| Orbiter power | 1000 | W | "1,000 W" | A: same |
| Battery | UNSOURCED | – | – | – |

### 1c. Intuitive Machines IM-1 / IM-2 (Nova-C)

| Field | Value | Unit | Quote | Source |
|---|---|---|---|---|
| Planned surface ops (IM-1) | ~10 | d | "approx. 10 days (lunar surface operations)" | A: NASA IM-1 press kit, https://www.nasa.gov/wp-content/uploads/2024/01/np-2023-12-016-jsc-clps-im-press-kit-web-508.pdf |
| Planned surface ops (IM-2) | ~10 | d | "Surface Operations: Approximately 10 days" | A: NASA IM-2 press kit, https://nasa.gov/wp-content/uploads/2025/02/np-2025-02-005-jsc-clps-intuitive-machines-press-kit-508-2-25-25.pdf |
| IM-1 achieved | ~7 Earth days | d | "operated on the lunar surface for approximately seven Earth days" | A: IM-2 press kit (same URL) |
| IM-1 operating time (company est.) | 144 h | h | "a total operational time on the surface of 144 hours, or six days" | C: https://spacenews.com/intuitive-machines-and-nasa-call-im-1-lunar-lander-a-success-as-mission-winds-down/ |
| IM-1 mass / design life | 1908 kg; 14 d surface | – | "1908 kg"; "21 days (7 day transit, 14 day on lunar surface)" | C: https://space.skyrocket.de/doc_sdat/nova-c_im1.htm |
| Solar array W, battery Ah, bus V | UNSOURCED (200 W / 25 Ah / 28 V appear only on Wikipedia and mirrors; the NASA press kits give no power specs) | – | – | – |

### 1d. JAXA SLIM

| Field | Value | Unit | Quote | Source |
|---|---|---|---|---|
| Mass | ~200 dry / ~715 wet | kg | "Approx. 200kg (dry) Approx. 715kg (at launch)" | A: JAXA SLIM project review, Dec 2024, https://www.isas.jaxa.jp/en/topics/files/SLIM-press-briefing-20241226.pdf (p.4) |
| Power hardware | thin-film solar cell + SUS laminated battery | – | "Lightweight 'SUS laminated battery' and 'thin-film solar cell' (first adoption in Japan for curved surfaces)" | A: same, p.5 |
| Night survival design | not designed for it | – | "SLIM was therefore not designed to stay active through the night." | A: same, p.10 |
| Array power (W), battery Wh | UNSOURCED | – | – | – |

### 1e. Firefly Blue Ghost M1

| Field | Value | Unit | Quote | Source |
|---|---|---|---|---|
| Solar power | up to 400 W; 1470 h of generation | W | "provide up to 400 W and 1470 hours of power generation for the lander and 10 payloads" | B: https://fireflyspace.com/missions/blue-ghost-mission-1/ |
| Surface ops | >14 days (346 h daylight) + ~5 h into night | h | "more than 14 days of surface operations (346 hours of daylight)", "operating just over 5 hours into the lunar night" | B: https://fireflyspace.com/news/firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon/ |
| Planned | ~1 lunar day plus several hours of night | – | "operate on the Moon's surface for a lunar day (about 14 Earth days) and for several hours into the lunar night" | A: NASA press kit, https://www.nasa.gov/wp-content/uploads/2025/01/np-2025-01-001-jsc-clps-firefly-press-kit-screen-508-1-10-25-final.pdf |
| Battery | UNSOURCED | – | – | – |

### 1f. Astrobotic Peregrine

| Field | Value | Unit | Quote | Source |
|---|---|---|---|---|
| Payload power allocation | 1.0 | W/kg | "1.0 Watts" (per kg of payload, PUG table) | B: Astrobotic PUG hosted by NASA, https://science.nasa.gov/wp-content/uploads/2023/11/astrobotic-lunar-landers-pug.pdf |
| Planned surface ops | 10 | d | "Mission Duration: 10 days (surface)" | A: NASA press kit, https://www.nasa.gov/wp-content/uploads/2023/12/np-2023-12-017-jsc-clps-astrobotic-press-kit-update-508.pdf |
| Flight duration achieved | 10 d 14 h (never landed) | – | "operated the spacecraft for 10 days and 14 hours" | B: https://www.astrobotic.com/wp-content/uploads/2024/08/PM1_Post-Mission-Report_Website.pdf |
| Array W, battery | UNSOURCED | – | – | – |

### 1g. Chang'e-3/4 (Yutu)
Array power, battery and RHU/RTG details are **UNSOURCED**. The only hits were Wikipedia and mirrors. The Space Review (thespacereview.com/article/2401/1) notes that the radioisotope sources "are not consistent with each other".

### 1h. Apollo LM (batteries only, for contrast)

| Field | Value | Unit | Quote | Source |
|---|---|---|---|---|
| Descent batteries | 5 x 415 | Ah | "Number of batteries 5 / Capacity (each battery) 415 ampere-hours" | A/B: Grumman *Apollo News Reference*, Electrical Power, https://www.apollojournals.org/alsj/LM11_Electric_ppEP1-5.pdf |
| Ascent batteries | 2 x 296 | Ah | "2 / 296 ampere-hours" | A/B: same |
| Bus voltage | 28 nominal (24–32) | V dc | "28 volts dc"; "24 to 32 volts dc" | A/B: same |
| Chemistry | silver-zinc, 20 cells, KOH | – | "Silver-zinc plates, 20 cells / Potassium hydroxide" | A/B: same |
| Derived energy | ~58.1 kWh descent, ~16.6 kWh ascent (5x415x28; 2x296x28) | Wh | Derived | – |

Caveat: this reference describes the 5-descent-battery LM used on the later J-missions. The Apollo 11 LM configuration was not verified from a primary source, so its battery count is UNSOURCED.

---

## 2. Solar constant, irradiance scaling, cell efficiency

| Field | Value | Quote | Source |
|---|---|---|---|
| TSI at 1 AU (2008 solar min) | 1360.8 ± 0.5 W/m² | "The most accurate value of total solar irradiance during the 2008 solar minimum period is 1360.8 ± 0.5 W m−2" | A: Kopp & Lean 2011, GRL 38, L01706, doi:10.1029/2010GL045777, abstract via https://espo.nasa.gov/node/30086 |
| NASA fact-sheet value | 1361.0 W/m² (same for Moon and Earth) | "Solar irradiance (W/m2) 1361.0" | A: https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html |
| Earth orbit | a = 149.598, q = 147.095, Q = 152.100 (10⁶ km), e = 0.0167 | (fact sheet rows) | A: https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html |
| Scaling | S(r) = 1361 x (1 AU / r)² gives ~1408 W/m² at perihelion and ~1317 at aphelion (±3.4%). The Moon's ±0.4055x10⁶ km offset from Earth adds about ±0.5%. | Derived (inverse-square law) | – |
| Triple-junction cell efficiency | 29.2% BOL at 1367 W/m², 29.5% at 1353 W/m² (bare cell, AM0, 28 °C) | "ŋ (1367 W/m2) [%] 29.2" | B: AZUR SPACE 3G30-Advanced datasheet, https://www.azurspace.com/media/uploads/file_links/file/bdb_00010893-02-00_3g30-advanced_6x12.pdf |
| Cell temperature coefficient | ΔVmp/ΔT = −6.7 mV/°C (BOL) | table | B: same |

Suggested sim default: array power P = S(r) x A x η x cos(incidence) x packing/degradation factor, with η ≈ 0.28–0.29 (BOL). The packing and degradation factors are model assumptions and should be labelled as such.

---

## 3. Lunar environment numbers

| Field | Value | Quote | Source |
|---|---|---|---|
| Synodic period | 29.53 d | "Synodic period (days) 29.53" | A: NSSDC Moon fact sheet (URL above) |
| Lunar night length | ~14.77 d (half synodic period) | Derived. NASA uses "about 14 Earth days" for a lunar day: "a lunar day (about 14 Earth days)". | A: Firefly press kit (URL above) |
| Equatorial temperature range | 95 K to 390 K | "Diurnal temperature range (equator): 95 K to 390 K" | A: NSSDC Moon fact sheet |
| Diviner equatorial max / pre-dawn min | ~387–397 K max; ~95 K just before sunrise | "∼387–397 K at the equator, dropping to ∼95 K just before sunrise" | A: Williams et al. 2017, Icarus 283:300–325, doi:10.1016/j.icarus.2016.08.012 (abstract via api.semanticscholar.org) |
| Polar cold trap | ~38 K (LCROSS site, subsurface estimate) | "subsurface temperatures are estimated to be 38 kelvin" | A: Paige et al. 2010, Science 330:479, https://www.usgs.gov/publications/diviner-lunar-radiometer-observations-cold-traps-moons-south-polar-region |
| Moon orbit | perigee 363,300 km, apogee 405,500 km; obliquity to orbit 6.68° | fact sheet rows | A: NSSDC Moon fact sheet |

---

## 4. Story debrief numbers

### Chandrayaan-2 Vikram (7 Sep 2019)
- Descent date: "powered descent of the Lander was initiated on 7th September 2019". **A:** PIB, 20 Nov 2019, https://www.pib.gov.in/PressReleasePage.aspx?PRID=1592495
- Cause: "During the second phase of descent, the reduction in velocity was more than the designed value. Due to this deviation, the initial conditions at the start of the fine braking phase were beyond the designed parameters. As a result, Vikram hard landed within 500 m of the designated landing site." (same)
- First phase: "from an altitude of 30 km to 7.4 km ... velocity was reduced from 1683 m/s to 146 m/s" (same)
- Later ISRO framing: "higher velocities at touchdown, which was beyond the designed capability of the Lander's legs". **A:** PIB, 3 Aug 2023, https://www.pib.gov.in/PressReleasePage.aspx?PRID=1945483
- **Classification:** guidance and braking performance. This was not a site or date problem.

### Chandrayaan-3 (23 Aug 2023)
- Landing date: "On 23rd Aug, 2023, Chandrayaan-3 lander, Vikram, successfully soft-landed on the Moon." **A:** ISRO monthly summary Aug 2023, https://www.isro.gov.in/media_isro/pdf/Monthly_summary/MonthlySummary_August2023Eng.pdf
- Timing: "Powered descent is expected to commence on August 23, 2023, around 1745 Hrs. IST". **A:** https://www.isro.gov.in/Chandrayaan3.html. The exact touchdown time is UNSOURCED.
- Mission life: one lunar day (see 1a).
- Sleep: "The lander and rover are in sleep mode. Awaiting their awakening around September 22, 2023." (ISRO, 4 Sep). Rover slept on 2 Sep and lander on 4 Sep: "put into sleep mode ... on September 4 and 2 respectively". **C:** https://www.tribuneindia.com/news/india/isro-makes-attempt-to-wake-up-chandrayaan-3s-lander-rover-no-signals-from-them-so-far-546808
- No wake-up: ISRO said "As of now, no signals have been received from them. Efforts to establish contact will continue." (22 Sep 2023, same Tribune/PTI article)
- Robustness changes after Ch-2: "improvements in Lander to handle more dispersion, improvements in sensors, software and propulsion systems, full level redundancies". **A:** PIB 3 Aug 2023 (URL above)

### SLIM (20 Jan 2024 JST)
- Touchdown: "landed on the lunar surface on January 20, 2024 at 0:20 am JST". **A:** https://global.jaxa.jp/press/2024/01/20240125-1_e.html
- Accuracy: "approximately 55m east of the original target landing site". The navigation accuracy before the obstacle-avoidance divert was "about 10 m or less, possibly 3-4 m" (same). The Dec 2024 review says "Achieved precision of about 3-4m at HV2 stage, and around 55m in landing site evaluation". **A:** SLIM briefing PDF, p.11. The Aug 2024 release says "a position error of approximately 10 meters from the target point". **A:** https://global.jaxa.jp/press/2024/08/20240826-1_e.html
- Attitude and power: solar cells "are currently facing west", so "power generation was not possible from the solar cells". The lander was shut down by ground command at 2:57 am JST. **A:** Jan 25 release
- Cause of attitude: one main engine nozzle separated at about 50 m altitude, "nozzle separated and thrust was reduced in one of the two main engines". **A:** SLIM briefing p.12. Note: JAXA never says "nose" in the pages opened. "Tipped onto its nose" is press wording, so use "landed in an unplanned attitude, upside-down/nose-down per images" only with a press citation.
- Power restored: JAXA "re-established communication ... late on Sunday" (28 Jan 2024 JST), "most likely able to generate power thanks to a change in the sunlight's direction". **C:** NBC, https://www.nbcnews.com/news/world/japans-slim-probe-regains-power-week-moon-landing-rcna136119. JAXA's own wording: "operations resumed as the direction of the sun changed". **A:** SLIM briefing p.8
- Night survival: "the spacecraft was confirmed to survive three lunar nights". Last contact 28 Apr 2024. Operations ended "22:40 (JST), on August 23" 2024. **A:** Aug 26 2024 release

### IM-1 Odysseus (22 Feb 2024)
- Landing date: "touching down on Feb. 22". **A:** https://www.nasa.gov/missions/artemis/clps/nasa-collects-first-surface-science-in-decades-via-commercial-moon-mission/
- Cause: "IM found out hours before landing that their laser range finders couldn't be turned on as they had a manual safety switch turned on". The patch to use NASA's NDL had errors: "Neither range nor velocity data were used". The lander came down "short of their original target by ~2.5 km". **A:** NASA NDL briefing, https://ntrs.nasa.gov/api/citations/20240004236/downloads/MSS%202024_NDL%20Lunar%20Mission.pdf (pp.12–13). SpaceNews gives "about 1.5 kilometers away with higher terrain" (C), so the sources disagree on distance.
- Touchdown: "more downward velocity and more horizontal velocity" (Altemus). It came down on a 12° slope and rests "at an angle of about 30 degrees", "breaking at least one landing legs". **C:** SpaceNews 28 Feb 2024 (URL above)
- End: "the sun moved out of view of the one illuminated solar panel". Instruments "ceased science and technology operations seven days after landing". **A:** NASA (URL above)
- **Classification:** procedural/sensor (navigation). The tilt was worsened by sloped terrain, and the short life came from panel orientation after tipping.

### IM-2 Athena (6 Mar 2025)
- "touched down at approximately 11:30 a.m. March 6", "more than 1,300 feet (400 meters) from its intended landing site". Ended "at 12:15 a.m. CST Friday" "before its batteries were depleted". **A:** https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/
- Company: "With the direction of the sun, the orientation of the solar panels, and extreme cold temperatures in the crater, Intuitive Machines does not expect Athena to recharge". The lander was "lying in a shadowed region of a small crater". The company estimated 250 m from target. "'noisy' data from a laser altimeter may have contributed". **C:** https://spacenews.com/im-2-lunar-lander-mission-ends/
- **Classification:** navigation sensor during descent. Lighting (shadowed crater) and panel orientation then ended the mission within about 13 h. This is the strongest "where you end up decides your power" example.

### Apollo 11 (20 Jul 1969)
- Sun altitude at landing: **10.65°** (20:17:39 UTC; computed by Fjeld and Scotti). **A:** ALSJ, https://www.apollojournals.org/alsj/alsj-EarthSun_AltAz.html (Apollo 11 "Landing" row)
- Planning value: "to take advantage of a sun elevation angle on the lunar surface of 10.8°". **A:** NASA SP-4029 *Apollo by the Numbers*, Apollo 11 summary, https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_11a_Summary.htm
- Rationale, same source: "The range of these angles was from 5° to 14° and in a direction from east to west. Under these conditions, visible shadows of craters would aid the crew in recognizing topographical features." The near-16° descent angle caused "washout". Above 18° could be avoided by landing a day earlier. "the sun elevation angle restriction established a 16-hour period, which occurred every 29.5 days, when landing at a given site could be attempted."
- Landing time: "20:17:39 GMT ... on 20 July 1969". **A:** same

### Artemis III south-pole rationale
- "All 13 regions contain sites that provide continuous access to sunlight throughout a 6.5-day period". Sunlight supplies power and "minimizes temperature variations". The south pole "contains permanently shadowed regions rich in resources". Regions are "approximately 9.3 by 9.3 miles (15 by 15 kilometers)". Site selection assessed "terrain slope, ease of communications with Earth, and lighting conditions." **A:** NASA, 19 Aug 2022, https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/

---

## 5. Impact-page costs

Exchange rates are annual averages from FRED (Federal Reserve): https://fred.stlouisfed.org/graph/fredgraph.csv?id=AEXINUS and ...?id=AEXJPUS. INR/USD: 2019 = 70.3777, 2023 = 82.5708. JPY/USD: 2023 = 140.5001, 2024 = 151.4551.

| Mission | Published cost | Approx. USD | Outcome | Quote | Source |
|---|---|---|---|---|---|
| Beresheet (2019) | ~US$100M incl. launch | $100M | crashed | "The mission cost about $100 million" | C: AP via https://www.staradvertiser.com/2019/04/11/news/israeli-moon-mission-fails-after-spacecraft-apparently-crashes/ |
| Chandrayaan-2 | ₹603 crore project + ₹367 crore launch = ₹970 crore | ~$86M + $52M ≈ $138M (2019 rate). Includes the orbiter, which succeeded. | lander crashed | "approved cost ... Rs. 603 Crore (excluding launch cost)... GSLV MK III M1 vehicle is Rs. 367 Crore" | A: PIB PRID=1592495 |
| Chandrayaan-3 | ₹250 crore excl. launch | ~$30M (2023) | success | "The approved cost of Chandrayaan-3 is Rs. 250 Crores (Excluding Launch Vehicle Cost)" | A: PIB PRID=1945483 |
| Chandrayaan-3 incl. launch | ₹615 crore (attributed to K. Sivan, 2020) | ~$74M | – | "built at a budget of around Rs 615 crore" | C: https://www.republicworld.com/science/space/chandrayaan-3-budget-how-much-did-indias-3rd-moonshot-cost-articleshow (search snippet; page not opened, so treat as weak) |
| SLIM | ¥14.9 billion total development (budget at project start ¥18.05B) | ~$98–106M | landed, wrong attitude | "Total project development cost 14.9 billion yen" | A: JAXA briefing p.3 |
| Peregrine (TO2-AB) | $79.5M initial → $107.9M current task order | $107.9M | never landed | OIG Table 2 row | A: NASA OIG IG-24-013, https://oig.nasa.gov/wp-content/uploads/2024/06/final-report-ig-24-013-nasas-commercial-lunar-payload-services-initiative.pdf (p.13) |
| IM-1 (TO2-IM/20C/OP) | $81.7M → $122.0M | $122.0M | landed, tipped | OIG Table 2. Also: "CLPS paid Intuitive Machines about $122 million" | A: same |
| IM-2 PRIME-1 task order | $47.0M → $50.0M | $50.0M | landed on side | OIG Table 2 "Intuitive Machines (PRIME-1) October 2020 47.0 50.0" | A: same |
| Blue Ghost M1 (TO19D) | $93.3M → $101.5M | $101.5M | success | OIG Table 2 | A: same |
| 2019 award values | Astrobotic $79.5M, IM $77M, OrbitBeyond $97M | – | – | "Astrobotic ... has been awarded $79.5 million" | A: https://www.nasa.gov/news-release/nasa-selects-first-commercial-moon-landing-services-for-artemis-program/ |
| CLPS cap | $2.6B through 2028 | – | – | "combined maximum contract value of $2.6 billion through 2028" | A: NASA IM-1 press kit; OIG |
| Hakuto-R M1, Luna 25 | UNSOURCED | – | – | – | – |

Notes:
- CLPS task-order values are NASA's delivery price, not the full mission cost to the vendor.
- The task-order value is not the "loss" from a failure. NASA also lists ~$9.5M for the six IM-1 instruments: "instruments that cost the Agency approximately $9.5 million" (OIG IG-24-013, report p.10, same paragraph as the $122M quote).
- "Shots on goal": "NASA informally refers to this risk posture as taking 'shots on goal.'" The CLPS initiative "seeks to manage risk exposure" rather than mitigate risk. **A:** House SS&T hearing charter, 1 Apr 2025, https://republicans-science.house.gov/_cache/files/0/8/08794b1b-508d-4b7a-8008-341e51828609/3A2F66B634F78F4A4A5430D8B5C1C68D2A0EDD05462C88DC1E0AC8149943A700.sst-hearing-charter---leveraging-commercial-innovation-for-lunar-exploration-a-review-of-nasas-clps-initiative.pdf. The OIG says the approach was designed for "accepting higher risks of failure for the sake of learning" but that "NASA has become less risk tolerant". **A:** IG-24-013.

**Verdict on "one failed landing costs $100M+":** this holds as an order of magnitude but not as a rule. The failed or partial attempts with documented costs are Beresheet (~$100M), Chandrayaan-2 (~$138M total incl. orbiter and launch), Peregrine ($107.9M task order) and IM-1 ($122M task order). Counter-examples exist: Chandrayaan-3 was ₹250 crore ≈ $30M excl. launch, and IM-2's PRIME-1 task order was $50M. Suggested wording: **"A single lunar landing attempt typically costs on the order of $100 million (Beresheet ~$100M, Peregrine $108M, IM-1 $122M)."**

---

## 6. Lunar landing attempts 2019 – Nov 2026

| Date (UTC unless noted) | Mission | Outcome | Cause class | Source |
|---|---|---|---|---|
| 3 Jan 2019 | Chang'e-4 (China) | Success, far side, Von Kármán | – | A: LROC, https://lroc.asu.edu/posts/1090 |
| 11 Apr 2019 | Beresheet (SpaceIL) | Crash | Hardware + command: IMU fault, then a reset command led to main-engine shutdown ("A software command uploaded to fix a sensor problem started a chain reaction") | C: https://www.planetary.org/articles/software-command-doomed-beresheet |
| 7 Sep 2019 IST | Chandrayaan-2 Vikram | Hard landing within 500 m of the site | GNC/braking performance | A: PIB 1592495 |
| 1 Dec 2020 | Chang'e-5 | Success ("safe touchdown ... 15:11 UTC 01 December 2020") | – | A: https://www.lroc.asu.edu/posts/1172 (via search snippet) |
| 26 Apr 2023 JST | ispace HAKUTO-R M1 | Crash | **Site/terrain-related software:** altitude data rejected after crossing a ~3 km crater rim. The landing-site change "after critical design review" was not reflected in simulations, which "did not adequately incorporate the lunar environment on the navigation route" | B: https://www.ispace-inc.com/2023/05/26/ispace-announces-results-of-the-hakuto-r-mission-1-lunar-landing/ |
| 19 Aug 2023 | Luna 25 (Russia) | Crashed during pre-landing orbit burn | Engine "operated for 127 seconds instead of 84" (Borisov via TASS) | C: https://spacepolicyonline.com/news/luna-25s-engines-fired-longer-than-planned/ |
| 23 Aug 2023 | Chandrayaan-3 | Success; did not wake after lunar night | – | A: ISRO (above) |
| 8–18 Jan 2024 | Peregrine M1 | No landing attempt; propellant leak; re-entered 18 Jan 2024 | Hardware (helium valve PCV2) | B: Astrobotic post-mission report (above) |
| 20 Jan 2024 JST | SLIM | Landed ~55 m from target in wrong attitude; survived 3 nights | Hardware (engine nozzle loss at ~50 m) | A: JAXA (above) |
| 22 Feb 2024 | IM-1 Odysseus | Landed, tipped ~30°, ~7 days ops | Procedural/sensor (rangefinder safety switch). The 12° slope contributed. | A: NASA NDL doc; C: SpaceNews |
| 1 Jun 2024 UTC (2 Jun BJT) | Chang'e-6 | Success, Apollo crater, SPA basin | – | C: Space.com/Xinhua via search. JAXA's comparison table also lists the outcome as "Success" (A: SLIM briefing p.7) |
| 2 Mar 2025 | Blue Ghost M1 | Success, "upright and stable" | – | A: https://www.nasa.gov/news-release/touchdown-carrying-nasa-science-fireflys-blue-ghost-lands-on-moon/ |
| 6 Mar 2025 | IM-2 Athena | On its side in a shadowed crater; ended <13 h | Altimeter data, then **lighting/thermal at the landing spot** ended the mission | A: NASA; C: SpaceNews |
| 6 Jun 2025 JST | ispace M2 RESILIENCE | Crash | Hardware: laser rangefinder "deterioration in the performance ... or the performance itself was lower than expected" | B: https://www.ispace-inc.com/2025/06/24/ispace-releases-technical-cause-analysis-for-hakuto-r-mission-2/ |
| 2026 | None found | Chang'e-7 postponed "indefinitely, at least to some time next year". Blue Moon MK1, Griffin-1, IM-3 and Blue Ghost 2 slipped to 2027. | – | C: Jeff Foust, The Space Review, 26 Oct 2026, https://www.thespacereview.com/article/5344/1. Not checked after 26 Oct. |

Tally, 2019 to Oct 2026: 14 attempts. Five clean soft landings (Chang'e-4, Chang'e-5, Chandrayaan-3, Chang'e-6, Blue Ghost M1). Three landed in an unplanned attitude (SLIM, IM-1, IM-2). Five crashes (Beresheet, Chandrayaan-2, HAKUTO-R M1, Luna 25, RESILIENCE). One never reached the Moon (Peregrine).

---

## 7. Tagline check

> "Landing on the Moon fails when the site and date are wrong. Chandrayaan-2, IM-1 and SLIM all show it."

**Not accurate as written.**
- **Chandrayaan-2:** ISRO attributes the failure to excess braking and descent dispersion. ISRO cites neither the site nor the date.
- **IM-1:** caused by a laser rangefinder safety switch and a failed software patch. Terrain slope contributed to the tip, and the mission was shortened by a single illuminated panel.
- **SLIM:** an engine nozzle failure. SLIM actually landed precisely. Lighting only governed when power came back, after the sun direction changed.
- None of the three failures was caused by choosing the wrong site or date.

**Examples that do support a site, lighting or date story:**
- HAKUTO-R M1: crater-rim terrain on a changed site that had not been simulated.
- IM-2: shadowed crater, panel orientation and cold ended the mission in less than 13 h.
- SLIM: west-facing cells produced no power until the sun moved.
- Chandrayaan-3: one-lunar-day design, slept at nightfall and never woke.
- Apollo 11: landed at a 10.65° sun elevation, inside a deliberate 5°–14° window chosen so crater shadows were visible.
- Artemis III: regions chosen for continuous sunlight across a 6.5-day stay.

**Suggested wording (defensible):**
> "Where and when you land decides whether your lander gets power, warmth and a link home. SLIM's solar cells faced the wrong way until the Sun moved. IM-2 came down in a shadowed crater and lost power within hours. Chandrayaan-3 went to sleep when its single lunar day ended. Apollo crews landed only in a 5–14° sun-angle window so they could see the hazards."

A shorter alternative: "Getting down is half the problem; the site and the date decide whether the lander survives once it's there."

---

## UNSOURCED (not found in an opened primary or reputable source)
- Chandrayaan-3 Vikram battery capacity, bus voltage and exact touchdown time (only "around 1745 IST" for descent start).
- Chandrayaan-2 Vikram and Pragyan battery.
- Nova-C (IM-1/IM-2) solar array W, battery Ah and bus V. 200 W / 25 Ah / 28 V appears only on Wikipedia.
- SLIM array W and battery capacity.
- Peregrine array W and battery capacity.
- Blue Ghost battery capacity.
- Chang'e-3/4 power system and RHU/RTG details.
- Apollo 11 LM descent battery count (4 vs 5) from a primary Apollo 11 document.
- Operating-temperature limits for any of these landers.
- Average/base loads and comms power for any lander.
- HAKUTO-R M1 total cost; Luna 25 cost.
- A NASA-authored (not House-charter) "shots on goal" quote. The phrase is attributed to Zurbuchen only in press.
- Any lunar landing attempt between 26 Oct and 14 Nov 2026 (not checked).
