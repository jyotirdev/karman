/* Embedded map data. Land and borders: Natural Earth. Elevation and night lights: NASA. Plate boundaries: Peter Bird (2003), via Hugo Ahlenius / Nordpil. */
const ASSET = {
  surf: 'data:image/jpeg;base64,__SURF__',
  lights: 'data:image/jpeg;base64,__LIGHTS__',
  land: '__LAND__',
  borders: '__BORDERS__',
  plates: '__PLATES__',
  countries: '__COUNTRIES__',         /* ISO country code, three-letter code and currency, eight characters each */
  /* Undersea cables: TeleGeography's Submarine Cable Map (2026), as cleaned and simplified by Tristan Hotham. CC BY-NC-SA 4.0.
     One row per cable: name, year ready, planned (1), length in km, length measured from the route (1), landing points, countries, owners, routes, id. */
  cables: __CABLES__,
  /* Power reactors: IAEA PRIS records as compiled by GeoNuclearData 0.17.17 (March 2024). Open Database License.
     One row per site: name, latitude, longitude, country code, country, then its reactors (name, status, type, model, MW, year building began, year it started, year it closed, IAEA id). */
  /* The stars the naked eye can see under a dark sky (magnitude 6.5 and brighter), from the Yale Bright Star Catalogue (public domain), packed by tools/make-stars.py:
     six bytes a star: right ascension, declination, brightness, colour temperature. */
  stars: '__STARS__',
  nuclear: __NUCLEAR__,
  /* Power stations, gas pipelines and LNG terminals: Global Energy Monitor's trackers, the larger ones only (tools/make-energy.py). CC BY 4.0.
     plants, per fuel: name, latitude, longitude, MW running, first year, units, MW being built, country, kind, then the wiki page when it is not just the name.
     pipes: name, state (0 running, 1 being built, 2 idle), first year, km, billion cubic metres a year, countries, routes packed like the cables', wiki page.
     lng: name, latitude, longitude, export (1), million tonnes a year running, being built, first year, country, wiki page.
     countries and kinds are the lists those numbers point into; ends are the usual endings of names, packed as "~" and "^". */
  energy: __ENERGY__
};
