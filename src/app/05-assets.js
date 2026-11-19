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
  nuclear: __NUCLEAR__
};
