# Changelog

Notable changes to Kármán. Dates are UTC.

## Unreleased

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
