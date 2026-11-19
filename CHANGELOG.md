# Changelog

Notable changes to Kármán. Dates are UTC.

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
