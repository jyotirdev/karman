# Raw data for the built-in layers

Some things on the globe do not come from a live feed: undersea cables, nuclear power reactors, the energy map (power stations, gas pipelines, LNG terminals), and the stars. The files they are built from are kept here, so the compact versions in `assets/` can be rebuilt and checked. The cable and reactor files are exactly as published; the energy files are cut-down extracts, because the originals run to 80 MB.

```bash
python3 tools/make-data.py     # data/  ->  assets/cables.json, assets/nuclear.json
python3 tools/make-energy.py   # data/  ->  assets/energy.json
python3 tools/make-stars.py    # data/  ->  assets/stars.b64
node tools/build.js            # embeds them in index.html
```

| File | From | Licence |
|---|---|---|
| `cables.geojson`, `cables.csv` | [Tristan Hotham, submarine-cables](https://github.com/Tristan-Hotham/submarine-cables): TeleGeography's Submarine Cable Map (2026), cleaned and lightly simplified | CC BY-NC-SA 4.0 |
| `nuclear_power_plants.json`, `nuclear_reactor_types.json` | [GeoNuclearData](https://github.com/cristianst85/GeoNuclearData) 0.17.17 (3 March 2024): IAEA PRIS and World Nuclear Association records | Open Database License 1.0 |
| `energy-plants.csv` | [Global Energy Monitor](https://globalenergymonitor.org/projects/global-integrated-power-tracker/), Global Integrated Power Tracker, edition of 30 April 2025, cut down to the larger stations | CC BY 4.0 |
| `energy-pipelines.geojson`, `energy-lng.csv` | [Global Energy Monitor](https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/), Global Gas Infrastructure Tracker, edition of 1 May 2025, cut down to the longer pipelines and working terminals | CC BY 4.0 |
| `stars.csv` | The [Yale Bright Star Catalogue](http://tdc-www.harvard.edu/catalogs/bsc5.html), 5th revised edition (Hoffleit and Warren, 1991), from [Bretton Wade's JSON conversion](https://github.com/brettonw/YaleBrightStarCatalog) (commit `abffb3b`), cut down to the 8,404 stars of magnitude 6.5 or brighter | Public domain (the conversion is MIT) |

These files are **not** covered by the repository's MIT licence. See [NOTICE.md](../NOTICE.md).

## Updating

- **Cables:** replace the two cable files with a newer edition in the same format and rerun the two commands above.
- **Reactors:** replace `nuclear_power_plants.json` with a newer GeoNuclearData release. The edition date shown in the app is set in `tools/make-data.py`.

`make-data.py` makes one correction to the reactor data: the source lists Maanshan (Taiwan) at Lungmen's coordinates.

## The energy map

`energy-plants.csv`, `energy-pipelines.geojson` and `energy-lng.csv` are written by `tools/make-energy.py --from DIR` out of two of Global Energy Monitor's own files, the ones its tracker maps load:

| File | What it is | Where it is published |
|---|---|---|
| `gipt-data-YYYY-MM-DD.csv` | Global Integrated Power Tracker, one row per generating unit (about 47 MB) | The edition used here, `gipt-data-2025-04-30.csv`, is in the history of Global Energy Monitor's public repository [GlobalEnergyMonitor/maps](https://github.com/GlobalEnergyMonitor/maps) at `trackers/integrated/compilation_output/` (commit `d037ecd`) |
| `ggit_YYYY-MM-DD.geojson` | Global Gas Infrastructure Tracker, pipeline routes and LNG terminals (about 30 MB) | `ggit_2025-05-01.geojson`, same repository, `trackers/ggit/compilation_output/` (commit `c4f4307`) |

The first line of each extract records the edition it came from and what was kept. Each row keeps Global Energy Monitor's own identifier and wiki address, so any entry can be traced back.

**These are not the newest editions.** Global Energy Monitor has published newer ones since (the address of the current file for each tracker is in `trackers/integrated/config.js` and `trackers/ggit/config.js` of the same repository, and the full spreadsheets are on its [download page](https://globalenergymonitor.org/projects/global-integrated-power-tracker/download-data/)). To update:

```bash
mkdir gem && cd gem        # put the two newer files here, keeping their names
cd .. && python3 tools/make-energy.py --from gem
node tools/build.js
```

The script stops with a message if a column it needs has been renamed. What is kept is set at the top of it (`KEEP_MW`, `PIPE_KM`); the page grows by roughly 60 bytes for every power station kept.

## The stars

`stars.csv` holds one row for each star the naked eye can see under a dark sky: its Harvard Revised number, its name where it has one, right ascension and declination for the year 2000 in degrees, visual magnitude, and colour temperature in kelvin. `tools/make-stars.py` packs it into `assets/stars.b64`, six bytes a star.

The stars do not change, so this never needs updating. To rebuild the extract from the catalogue itself:

```bash
git clone https://github.com/brettonw/YaleBrightStarCatalog
python3 tools/make-stars.py --from YaleBrightStarCatalog/bsc5-short.json
node tools/build.js
```

The faintest magnitude kept is `FAINTEST` at the top of the script. If it changes, or the star file does, run `python3 tools/make-sky-ref.py` as well (it needs `pip install ephem`): it rewrites `tests/sky-ref.json`, the answers the sky test checks the app against.
