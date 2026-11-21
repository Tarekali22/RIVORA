# RIVORA — The City Is Yours

A browser-playable, third-person open-world game set in the fictional coastal city of **San Aurelia**, built to run as a single self-contained Claude Artifact (desktop and mobile).

- **Engine:** three.js r158 (WebGL) loaded from jsDelivr (unpkg fallback); everything else is original code in `src/`.
- **Assets:** all 3D geometry, textures, sounds and music are generated procedurally at runtime. No downloads, no API keys, no accounts.
- **Deliverables:**
  - `dist/web/` — **realistic build** (merged with *Miami Nights 2*): motion-captured Microsoft Rocketbox people (MIT) driven by RIVORA's procedural rig, real car models (Ferrari 458 / Car Concept / muscle car, CC BY 4.0), bloom post-processing and local three.js r160. Multi-file, ~17 MB. Add `?classic=1` to the URL for the procedural look.
  - `dist/rivora.html` — single-file procedural build (~410 KB).

## Build & test (cloud workspace)

```bash
cd tools && npm install && node build.mjs        # -> dist/rivora.html (+ dist/test.html wrapper)
cd ../tests && node smoke.mjs                      # boots to title, prints draw stats
node gameplay.mjs                                  # end-to-end checks of every core system
node mobile.mjs                                    # touch controls + layout on an emulated phone
```

Tests run headless Chromium with SwiftShader (CPU WebGL), so frame rates there are far below a real GPU.

## Layout

| Path | What |
| --- | --- |
| `src/world/layout.js` | Map, districts, terrain height, road graph, signals, sidewalks, places |
| `src/world/city.js` | Procedural city, coast, port, airport, hillside, props, collision |
| `src/world/environment.js`, `water.js` | Sky, sun/moon, day–night, weather, rain, ocean |
| `src/world/interiors.js` | Home, villa, café, store, gym, nightclub, clothing store + door services |
| `src/actors/` | Humanoid rig & animation, player, pedestrians, companion; `realskin.js` retargets the rig onto Rocketbox avatars |
| `src/vehicles/realcars.js` | Real car bodies (normalised once, shared) used by the realistic build |
| `src/web/boot.js`, `vendor/three/`, `assets/real/` | Realistic build loader, three.js r160 + add-ons, base64 model modules |
| `src/vehicles/` | Vehicle data, procedural models, physics, traffic AI, red-light cameras |
| `src/systems/` | Combat, police/wanted, missions, activities, economy, FX |
| `src/ui/` | HUD, minimap/map/GPS, phone, menus, touch controls |
| `src/core/` | Input, audio synthesis, camera, save codes, utilities |
| `docs/spec/` | The original RIVORA specification package |
| `assets/reference/` | Visual reference screenshots supplied for art direction |

Personal portrait photos used to configure the default hero are **not** stored in this repository or in the game.

## Third-party assets (realistic build)

- Microsoft Rocketbox avatars — MIT licence.
- Ferrari 458 by vicent091036 — CC BY 4.0 (three.js examples).
- Car Concept by Eric Chadwick / DGG — CC BY 4.0 (Khronos glTF samples).
- Classic muscle car by Karol Miklas — CC BY 4.0 (pmndrs/racing-game).
- three.js r160 — MIT.
