# Native surfaces — shared contracts

Native code is injected by Expo config plugins in this folder (pattern:
`withBelgranoDeviceModule.js` — `withDangerousMod` writes Kotlin, `withMainApplication`
registers the package; old architecture, `newArchEnabled=false`).

| Plugin | Build | Purpose |
|---|---|---|
| `withBelgranoDeviceModule.js` | all | Device form factor detection |
| `withBelgranoRotary.js` | all (no-op without crown) | Rotary input → `DeviceEventEmitter('belgranoRotary', { delta })` |
| `withBelgranoLiveTrip.js` | phone + wear | `BelgranoLiveTrip` module: ongoing notification / Live Update, home-screen widgets, snapshot writer |
| `withBelgranoWear.js` | only when `BELGRANO_WEAR=1` | Tile, complication data source, Ongoing Activity, watch manifest entries, minSdk ≥ 26 |

## Trip snapshot

Written by JS through `includes/TripSnapshot.js` → `BelgranoLiveTrip.publishSnapshot(json)`
and read by every native surface (widgets, tile, complications, ongoing notification).

- Storage: `SharedPreferences` file **`belgrano_trip_snapshot`**, string key **`json`**.
- After each write the module asks widgets/tile/complications to refresh.
- Times are epoch milliseconds (UTC). Surfaces format them in `America/Argentina/Buenos_Aires`.

```json
{
  "origin":      { "id": 10, "title": "Boulogne Sur Mer" },
  "destination": { "id": 1,  "title": "Retiro" },
  "departures": [
    { "departure": 1791000000000, "arrival": 1791002280000, "source": "live" },
    { "departure": 1791001200000, "arrival": 1791003480000, "source": "scheduled" }
  ],
  "fetchedAt": 1790999940000,
  "tracking": { "active": false, "nextStation": null, "arrivalAt": null }
}
```

- `source`: `live` | `scheduled` | `offline` (same values as `SOURCE` in `includes/Schedule.js`).
- `arrival` may be `null` for legacy rows without arrival time.
- `departures` holds up to 5 upcoming trains, sorted; surfaces drop entries already in the past.
- `tracking` mirrors `includes/LiveTrip.js`: `active` while "Seguir viaje" is on. Native owns it: every publish overwrites it from the stored tracking payload, so a stale JS copy cannot revive a trip stopped from the notification.
- `labels` (optional): localized widget strings filled by JS — `nextTrain, live, scheduled, offline, inMinutes ("en {n} min"), now, agoSeconds, agoMinutes, openApp, noMoreTrains, separator, locale`. Native replaces `{n}`; readers fall back to Spanish when missing.
- Every write broadcasts `<applicationId>.TRIP_SNAPSHOT_UPDATED` (`setPackage`, extra `trackingActive: Boolean`).
- Readers must tolerate a missing file/key (show "Abrí la app") and unknown extra fields.
