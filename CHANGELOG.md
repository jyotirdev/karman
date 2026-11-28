# Changelog

Notable changes to Kármán. Dates are UTC.

## 1.3.0 (2026-11-28)

### Fixed

- **Satellites and debris that stopped loading after many reloads.** CelesTrak, which publishes the orbits, refuses a list that is asked for twice within two hours, and shuts out an address that keeps asking after a refusal. Kármán used to answer a refusal by asking again in another format, and asked afresh on every reload, which is exactly what gets an address shut out. Every request to CelesTrak now goes through one gate: one at a time, never the same list twice in two hours, and after a refusal (two hours) or no answer (thirty minutes) nothing at all, remembered across reloads. Meanwhile the last saved copy keeps the satellites on the globe, and the Sources tab says what happened and when CelesTrak will be asked again.
- **A saved copy is used however old it is**, up to a fortnight (a day and a half for the two space stations, which are steered). Before, a copy past its freshness was thrown away even when nothing newer could be had.
- **Catalogue records are remembered** for a month, so clicking the same satellite twice asks once.
- **Stars no longer show through the planet.** They were drawn over the night side of the globe.

### The sky

- **The real stars.** The random dots are gone. In their place are the 8,404 stars the eye can see under a dark sky, from the Yale Bright Star Catalogue, each in its true place with its real brightness and colour, turning once a day as they do overhead. Orion, the Plough and the Southern Cross are there to be found.
- **The Moon,** where it really is and as far away as it really is (about thirty Earths), lit by the Sun so that it shows tonight's phase, with its dark seas sketched in. It is drawn three times its true size so that it is more than a dot. Click it, press <kbd>M</kbd>, search for it, or use its row under Right now: the view pulls back until Earth and Moon stand side by side, and a card gives the phase, the share lit, the distance, the age, and the next full and new moon.
- **The Sun's glare** marks where the Sun is. Pull back and look from the night side to watch it stand beside the dark Earth.
- **A better Moon formula.** The Moon's place came from a single term and could be six degrees out. It now uses the Astronomical Almanac's short series and adds distance.

### See a space station yourself

- Click any place and its card lists the passes of the ISS and Tiangong over the coming week that will actually be **visible** there: the station high enough, in sunlight, and the sky dark. Each gives the local time, how long, which way across the sky and how high. Click a pass to go to the station.

### Cinema mode, pictures and links

- **Cinema mode** (<kbd>C</kbd>, or the new button in the view controls): the panels step aside, the globe grows to fill the window, and only the name and the time remain. Move the pointer for the controls; <kbd>Esc</kbd> brings the panels back. Not offered on phones, where the tour does this job.
- **Save a picture** (<kbd>P</kbd>): the globe as it is, at the screen's full sharpness, with the date and any NASA view written in the corner.
- **Copy a link to this view** (<kbd>L</kbd>): the link reopens Kármán looking at the same place from the same height with the same NASA view on. On a phone it opens the share sheet instead.
- **More keys:** <kbd>S</kbd> spin, <kbd>O</kbd> every orbit, <kbd>R</kbd> reset, <kbd>F</kbd> full screen, <kbd>+</kbd> <kbd>−</kbd> zoom, arrow keys to turn the globe. The Guide tab lists them. A press on the globe now takes the keyboard away from the panels, so the keys work straight after.

### For contributors

- `src/app/35-sky.js` (stars, Moon, Sun) and `src/app/89-cinema.js` (cinema mode, pictures, links, keys) are new. Station passes are `stationPasses` in `50-space.js`; the CelesTrak gate is `celestrak` in the same file, and nothing else may fetch from celestrak.org.
- `tools/make-stars.py` packs the star catalogue (`data/stars.csv` to `assets/stars.b64`, 67 KB).
- **The astronomy is checked against PyEphem.** `tools/make-sky-ref.py` writes `tests/sky-ref.json`: where the Sun, the Moon and the brightest stars stand at six moments up to 2034, and a week of station passes over six cities. `tests/smoke.js ok sky` compares the app with it: Sun within 0.005°, Moon within 0.16° and 850 km, stars within 0.01°, thirty passes within 20 seconds and their summits within 0.01°.
- `tests/smoke.js` gains `sky`, `limits` (reloads the page again and again while CelesTrak refuses, then goes silent, and counts the requests), `cinema` and `linked`; `place` now reads the station passes.
- The page grows from 1.36 MB to 1.47 MB, mostly the stars.

## 1.2.0 (2026-11-20)

### Fixed

- **Earthquakes could not be switched off.** A press on the earthquake switch landed on the hour, day or week list beside it instead. Each row in the Layers tab is a label, and a label left to itself works the first control inside it, which on that row was the list. Every row now names its own switch.

### NASA satellite views

- **Seven new views:** volcanic gas (sulphur dioxide), ocean plant life (chlorophyll, which shows algae blooms), ground temperature, soil moisture, vegetation, floods, and last night's city lights. The picker is grouped into Weather, Sea, Air and Land.
- **Air pollution no longer hides the planet.** NASA paints the nitrogen dioxide measurement across every place it measured, clean air in pale yellow, so the view used to cover the globe in a grainy tan sheet. Clean air is now left uncoloured and only raised levels show, from yellow to red. Smoke, dust and haze gets the same treatment, and volcanic gas and night lights are cleared the same way. Each recolouring is written against NASA's colour table for its layer and leaves any colour it does not recognise untouched.
- **True colour covers the whole globe.** It used to show only the passes flown so far today, with black strips everywhere else. Today's passes are now laid over the two days before.
- **Passes are stacked.** Views made pass by pass use the latest two or three days, oldest at the bottom, so there is always a full picture under today's first passes.
- **Honest dates.** The legend says which days the picture is from. A measurement NASA publishes late (air pollution runs about a week behind, soil moisture three days) is found by looking back through the last fortnight rather than trusting "newest", which for a satellite that has stopped means its last picture, however old.
- **Sharper when you zoom in.** One dot of the whole-Earth picture is 20 km. Stop over an area and the same view is fetched for just that area, down to 600 m a dot, and fades in over the coarse one.
- **Colour scales** in the legend for the views that have one.
- **Moved off satellites that are being switched off.** Terra stops observing on 1 December 2026 and Aqua follows. Snow now comes from VIIRS on NOAA-20 (NOAA-21 as spare) instead of Terra, haze from VIIRS on both instead of the Terra and Aqua product, and sea ice from the multi-satellite MUR analysis instead of AMSR2, which stopped in September 2025 and had been showing year-old ice. Every single-satellite view has a spare that takes over if the first goes quiet.
- **Not added:** carbon monoxide. Its only daily source in NASA's service is the AIRS instrument on Aqua, which is at the end of its life.

### Energy

- **The world's largest power stations**, one layer per fuel: coal, gas and oil, hydro, solar and wind. 3,362 stations, each with its output, type, age and a link to its page on Global Energy Monitor's wiki.
- **Gas pipelines and LNG terminals:** 862 pipelines of 200 km or more, drawn and clickable like the undersea cables, and 308 terminals.
- All of it is built into the file, from Global Energy Monitor's Global Integrated Power Tracker (April 2025) and Global Gas Infrastructure Tracker (May 2025), CC BY 4.0, cut down to the bigger ones by `tools/make-energy.py`. These layers start switched off and are only unpacked when switched on.

### For contributors

- The NASA view code has its own file, `src/app/81-views.js`.
- `tools/make-energy.py` and the extracts it keeps in `data/`; `data/README.md` says how to move to a newer edition.
- `tests/gibs-standin.js` plays NASA's image service, including its failures; `tests/smoke.js` gains `views`, `fine`, `energy` and `toggle`; `tests/tones.js` checks the recolouring without a browser.
- The page grows from 0.99 MB to 1.36 MB (437 KB to 584 KB compressed), nearly all of it the energy map.

## 1.1.0 (2026-11-20)

### Fixed

- **Land dots hanging off the bottom of the globe.** When the opening finished, about one land dot in eight was left a little short of landing: nothing in the north, more and more toward the south, and around Antarctica they sat well clear of the planet as a spray of white dots. Every dot now lands. This had been there since 1.0.0.
- **A hole at the South Pole.** The elevation image and the land outline both stop near 85° south, which left a round black gap with no land in the middle of Antarctica. The last few degrees are now filled in from the ice sheet around them (`tools/fill-pole.py`). The rest of the image is bit-for-bit unchanged.
- Clouds no longer draw rays into the poles, where a flat cloud map is squeezed to a point; they thin out over the last few degrees.

### Tour

- **One clear way in.** The tour is started by a bright play button: beside the name, at the end of the view controls, and on phones. It answers the pointer with a halo, gives under the press, and on the click a ring of light leaves it while a wave of light crosses the planet.
- **The tour starts without a stutter.** Pressing Tour used to hold the page up while the music was set up (about a tenth of a second on the test machine), and the globe then stood still for about a second before the camera set off. Now the slow parts of the music are prepared in idle moments beforehand, the echo is kept between tours, and the opening swing takes over the turn the globe already has.
- The planet slides to make room for the caption in fractions of a pixel instead of whole ones, which removes a fine judder from every flight between stops.
- The rest of the interface leaves faster, all together, and is not drawn at all while the tour runs, so the tour has the whole graphics card.
- Place names clear away from the caption's corner gradually instead of vanishing.
- The "Live tour" badge beside the name is gone. A word appears there only while the tour is paused or holding for you to read.
- The sound engine goes back to sleep a few seconds after a tour ends.

### Brand

- The name is now drawn in Unbounded Black, as on the banner, in the top bar, in the tour and on the opening screen, where the tagline sits under it at the same width. It is embedded as outlines, so there is no font to download.

## 1.0.0 (2026-11-20)

First public release under the name Kármán.

### On the globe

- 37 layers in six groups: Earth, atmosphere, orbit, people and nature, infrastructure, map.
- **Nuclear facilities.** Every power reactor on record with the IAEA (758 reactors at 280 sites, as of March 2024), built in; research reactors, fuel plants and waste stores added live from Wikidata.
- **Undersea cables.** 713 cables from TeleGeography's 2026 map, built in. Click one for its name, age, length, landing countries and owners.
- **Live cameras.** Live video from California, clips from London, a replay of the past day in Finland, a fresh picture every minute in Singapore.
- **Tour mode.** The globe flies itself round every notable event happening now, with captions, a route trail and music generated in the browser.
- An opening sequence in which the continents assemble while the feeds arrive, with a full loading read-out.

### Under it

- One HTML file, built from `src/` by a script with no dependencies.
- No server, no API keys, no tracking. Every feed is called directly from the browser.
- Backup providers and saved copies for the feeds that have them; the cable map and reactor list work offline.
- Set up for AI coding agents: `AGENTS.md`, Claude Code rules and workflows, and headless smoke tests with stand-in feeds.

### Removed before release

- Aircraft, ships, trains and bike sharing. They were sparse or unreliable without keys and crowded the globe.
