# Third-party data and software

Kármán's own code is under the MIT licence (see [LICENSE](LICENSE)). This file lists everything else that is bundled with it or loaded by it, who it belongs to and the terms it comes under.

This is a good-faith summary, not legal advice. If you plan to reuse any of this data, read the publisher's own terms first.

## Bundled in this repository and embedded in `index.html`

### Undersea cables

- **Files:** `data/cables.geojson`, `data/cables.csv`, `assets/cables.json`, and the copy embedded in `index.html`.
- **Origin:** TeleGeography's [Submarine Cable Map](https://www.submarinecablemap.com/), 2026 edition, as cleaned and simplified by Tristan Hotham in [submarine-cables](https://github.com/Tristan-Hotham/submarine-cables). `assets/cables.json` is a further repacking of those files made by `tools/make-data.py`: routes rounded to two decimal places and packed, a handful of country names shortened.
- **Licence:** [Creative Commons Attribution-NonCommercial-ShareAlike 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). TeleGeography publishes the map under CC BY-NC-SA 3.0; the cleaned dataset is shared under version 4.0 of the same licence, as 3.0 permits for adaptations, and so is the repacked copy here.
- **What that asks of you:** credit TeleGeography and Tristan Hotham, do not use it commercially, and share anything you build from it under the same licence.

### Nuclear power reactors

- **Files:** `data/nuclear_power_plants.json`, `data/nuclear_reactor_types.json`, `assets/nuclear.json`, and the copy embedded in `index.html`.
- **Origin:** [GeoNuclearData](https://github.com/cristianst85/GeoNuclearData) version 0.17.17 (3 March 2024) by Cristian Stoica, compiled from the International Atomic Energy Agency's [Power Reactor Information System](https://pris-stats.iaea.org/) and the World Nuclear Association. `assets/nuclear.json` groups those reactors into sites and is made by `tools/make-data.py`. One position is corrected there: the source lists Maanshan (Taiwan) at Lungmen's coordinates.
- **Licence:** [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1.0/); individual contents under the [Database Contents License 1.0](https://opendatacommons.org/licenses/dbcl/1.0/). © 2015 to 2024 Cristian Stoica.
- **What that asks of you:** credit the source, and share any adapted version of the database under the same licence.

### Power stations, gas pipelines and LNG terminals

- **Files:** `data/energy-plants.csv`, `data/energy-pipelines.geojson`, `data/energy-lng.csv`, `assets/energy.json`, and the copy embedded in `index.html`.
- **Origin:** [Global Energy Monitor](https://globalenergymonitor.org/): the Global Integrated Power Tracker (edition of 30 April 2025) and the Global Gas Infrastructure Tracker (edition of 1 May 2025), in the form Global Energy Monitor publishes for its own tracker maps. `tools/make-energy.py` cut them down: generating units are added up per power station; only stations of at least 1,000 MW (coal, gas and oil), 500 MW (hydro) or 300 MW (solar, wind) are kept, or twice that if still being built; only gas pipelines of 200 km or more that are running, being built or idle, with their routes simplified to about 6 km; and LNG terminals that are running or being built. Nuclear stations are not taken from here.
- **Licence:** [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Recommended citations: "Global Integrated Power Tracker, Global Energy Monitor, April 2025 release" and "Global Gas Infrastructure Tracker, Global Energy Monitor, May 2025 release".
- **What that asks of you:** credit Global Energy Monitor and say that the data was changed, as above. These are not the newest editions: see `data/README.md` for how to bring them up to date.

### Map data

| File | Origin | Terms |
|---|---|---|
| `assets/land.b64`, `assets/borders.b64` | [Natural Earth](https://www.naturalearthdata.com/) land and country boundaries. The land outline stops near 85° S; the rows south of 84° S follow the filled elevation image | Public domain |
| `assets/lights.jpg` | NASA Earth Observatory, [Black Marble](https://earthobservatory.nasa.gov/features/NightLights) night lights | NASA imagery, credit NASA Earth Observatory |
| `assets/surf.jpg` | NASA Earth Observatory elevation data. The image is blank south of about 84° S; those rows are filled in from the ice sheet around them by `tools/fill-pole.py`, and nothing else in it is altered | NASA imagery, credit NASA Earth Observatory |
| `assets/plates.b64` | Plate boundaries from Peter Bird, "An updated digital model of plate boundaries", *Geochemistry Geophysics Geosystems* 4(3), 2003, as converted by [Hugo Ahlenius, Nordpil](https://github.com/fraxen/tectonicplates) | See that repository |
| `assets/countries.txt` | ISO 3166 country codes and ISO 4217 currency codes | Factual codes |

## Loaded while the app runs

Nothing below is stored in this repository. The visitor's browser fetches it from the publisher.

### Software

| Library | Used for | Licence |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) r128, with OrbitControls | 3D rendering | MIT |
| [satellite.js](https://github.com/shashwatak/satellite-js) 5.0.0 | SGP4 orbit propagation | MIT |
| [hls.js](https://github.com/video-dev/hls.js) 1.5.20 | Playing live camera streams; fetched only when one is opened | Apache-2.0 |
| [Geist and Geist Mono](https://github.com/vercel/geist-font) | Typefaces, from Google Fonts | SIL Open Font License 1.1 |
| [Unbounded](https://github.com/googlefonts/unbounded), by The Unbounded Project Authors | The Kármán wordmark: the outlines of six letters of Unbounded Black, drawn into the page and into `docs/brand/`. No font file is shipped or downloaded | SIL Open Font License 1.1 |

### Live data

| Provider | What Kármán takes from it |
|---|---|
| [US Geological Survey](https://earthquake.usgs.gov/) | Earthquakes |
| [EMSC](https://www.seismicportal.eu/) | Earthquakes, when USGS cannot be reached |
| [NASA EONET](https://eonet.gsfc.nasa.gov/) | Wildfires, severe storms, volcanoes, sea ice and other natural events |
| [GDACS](https://www.gdacs.org/) | Disaster alerts |
| [kanari.io](https://kanari.io/) | Fire hotspots from NASA, NOAA and EUMETSAT satellites |
| [NASA JPL CNEOS](https://cneos.jpl.nasa.gov/) | Fireballs and asteroid close approaches |
| [US National Weather Service](https://www.weather.gov/) | Severe weather warnings |
| [Live cloud maps](https://github.com/matteason/live-cloud-maps) by Matt Eason | Cloud cover. Contains modified EUMETSAT data |
| [Open-Meteo](https://open-meteo.com/) | Weather, wind, air quality, sea state, place search. Data under CC BY 4.0; the free service is for non-commercial use |
| [MET Norway](https://api.met.no/) | Weather, when Open-Meteo cannot be reached |
| [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/) | Aurora forecast, Kp index, solar wind, flares, alerts |
| [GFZ Potsdam](https://kp.gfz-potsdam.de/) | Kp index, as a backup |
| [NASA Solar Dynamics Observatory](https://sdo.gsfc.nasa.gov/) | Latest images of the Sun |
| [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api) | Whole-Earth satellite views, from VIIRS and OMPS (NOAA-20, NOAA-21), SMAP, GPM IMERG, the MUR sea analyses and Sentinel-5P TROPOMI. NASA asks for the credit "NASA EOSDIS GIBS"; the night lights are NASA's Black Marble product |
| [NASA EPIC](https://epic.gsfc.nasa.gov/) | Photographs of the whole Earth from the DSCOVR spacecraft |
| [global-warming.org](https://global-warming.org/) and [NOAA GML](https://gml.noaa.gov/) | Daily carbon dioxide level |
| [CelesTrak](https://celestrak.org/) | Orbital elements, predicted close passes (SOCRATES), catalogue records (SATCAT) |
| [SatNOGS DB](https://db.satnogs.org/) and [wheretheiss.at](https://wheretheiss.at/) | Orbital elements, as backups |
| [Launch Library 2](https://thespacedevs.com/llapi) by The Space Devs | Launches, people in space, spacecraft docked at the ISS |
| [NASA Deep Space Network Now](https://eyes.nasa.gov/apps/dsn-now/) | Which spacecraft each antenna is in contact with |
| [Spaceflight News API](https://spaceflightnewsapi.net/) | Space news headlines |
| [Wikipedia](https://www.wikipedia.org/) | Current events, most read articles, place introductions. Text under CC BY-SA |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) Nominatim | Place names. © OpenStreetMap contributors, Open Database License |
| [BigDataCloud](https://www.bigdatacloud.com/) | Place names, as a backup |
| [Wikimedia Commons](https://commons.wikimedia.org/) | Photos near a place, each under its own licence |
| [Statistics of the World](https://statisticsoftheworld.com/) | Country facts from the IMF and the World Bank |
| [Flagpedia](https://flagcdn.com/) | Country flags |
| [Frankfurter](https://frankfurter.dev/) and [ExchangeRate-API](https://www.exchangerate-api.com/) | Exchange rates |
| [caldays](https://caldays.com/) and [Nager.Date](https://date.nager.at/) | Public holidays |
| [Macrostrat](https://macrostrat.org/) | Bedrock geology. CC BY 4.0 |
| [GeoJS](https://www.geojs.io/) and [ipwho.is](https://ipwho.is/) | Approximate location, only when the visitor asks for it |
| [iNaturalist](https://www.inaturalist.org/) | Wildlife sightings and sound recordings, each under its observer's licence |
| [GBIF](https://www.gbif.org/) | Wildlife sightings, as a backup |
| [Radio Browser](https://www.radio-browser.info/) | The directory of radio stations. Streams belong to their broadcasters |
| [Fintraffic Digitraffic](https://www.digitraffic.fi/en/road-traffic/) | Finnish road weather cameras. CC BY 4.0 |
| [Transport for London](https://tfl.gov.uk/info-for/open-data-users/) | London traffic cameras. Powered by TfL Open Data |
| [Land Transport Authority, Singapore](https://data.gov.sg/) | Expressway cameras. Singapore Open Data Licence |
| [Caltrans](https://quickmap.dot.ca.gov/) | California highway cameras and live streams |
| [Wikidata](https://www.wikidata.org/) | Research reactors, fuel plants, waste stores. CC0 |

## Names and marks

The names and logos of the organisations above belong to them. Listing a provider here does not mean it endorses Kármán.
