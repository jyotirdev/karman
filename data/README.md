# Raw data for the built-in layers

Two layers do not come from a live feed: undersea cables and nuclear power reactors. Their raw files are kept here, exactly as published, so the compact versions in `assets/` can be rebuilt and checked.

```bash
python3 tools/make-data.py     # data/  ->  assets/cables.json, assets/nuclear.json
node tools/build.js            # embeds them in index.html
```

| File | From | Licence |
|---|---|---|
| `cables.geojson`, `cables.csv` | [Tristan Hotham, submarine-cables](https://github.com/Tristan-Hotham/submarine-cables): TeleGeography's Submarine Cable Map (2026), cleaned and lightly simplified | CC BY-NC-SA 4.0 |
| `nuclear_power_plants.json`, `nuclear_reactor_types.json` | [GeoNuclearData](https://github.com/cristianst85/GeoNuclearData) 0.17.17 (3 March 2024): IAEA PRIS and World Nuclear Association records | Open Database License 1.0 |

These files are **not** covered by the repository's MIT licence. See [NOTICE.md](../NOTICE.md).

## Updating

- **Cables:** replace the two cable files with a newer edition in the same format and rerun the two commands above.
- **Reactors:** replace `nuclear_power_plants.json` with a newer GeoNuclearData release. The edition date shown in the app is set in `tools/make-data.py`.

`make-data.py` makes one correction to the reactor data: the source lists Maanshan (Taiwan) at Lungmen's coordinates.
