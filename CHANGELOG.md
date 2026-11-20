# Changelog

Notable changes to Kármán. Dates are UTC.

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
