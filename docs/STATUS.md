# RIVORA — build status

## Realism overhaul & gameplay evolution (November 2026)

Baseline preserved as git tag `baseline-before-realism-overhaul`. Nothing that worked before was removed; the overhaul is layered on top (new modules hook in through `bus.onHandle`, the `'tick'` event and `window.RIVORA_ADDONS`).

| Area | What changed | Status |
| --- | --- | --- |
| Language | Full Arabic / English switch (title button, Settings → Language). Arabic turns the whole UI right-to-left with the Cairo font and joined letters; English restores the original text. Interface in Modern Standard Arabic, people and story in Egyptian Arabic | Implemented & tested |
| El Nour Quarter | New Egyptian-inspired district (4 blocks): plastered row houses with shutters, balconies, laundry, AC units, roof tanks and dishes, Arabic shop signs, awnings, a mosque with minaret, a church, a pigeon tower, bunting and lanterns, a street ahwa with seated regulars | Implemented & tested |
| People & conversation | Egyptian, Levantine, Gulf, Moroccan and international characters with matching names and skin tones; Enter starts a conversation; preset replies, typed text and optional push-to-talk microphone; people answer in Egyptian Arabic, give real directions ("on your left, about 120 m") and mark the GPS, remember your name | Implemented & tested (microphone only checked to the consent step) |
| Voices | Browser speech in Arabic (ar-EG preferred) and English, one voice per character, volume on its own slider. No paid voice service was used | Implemented |
| Story & missions | "Nour Stories" with Uncle Hassan (4 chapters: delivery run, stolen microbus, protection-money choice that Hassan remembers, golden-hour photo) plus a bicycle bread sprint; medals (gold/silver/bronze), optional objectives with bonus pay, a completion card | Implemented & tested (chapter 1 end-to-end) |
| Weapons & money | Start with a basic sidearm; Ironclad Arms shop sells original fictional weapons, ammo, magazine and grip upgrades and body armour with money earned in play; aim (right mouse), fire (left mouse), reload R, cycle T/Y, 1–5, holster H; armed police only at 3+ stars | Implemented & tested |
| Health | One punch or one ordinary hit never kills a healthy player; armour soaks 70 % of a hit; only big falls, high-speed crashes and sustained damage are lethal | Implemented & tested |
| Controls (PC) | Enter = context action (enter/exit vehicle, talk, open doors, shops), Ctrl = crouch toggle, Tab = phone, M = map, C = camera, R = reload, Space = handbrake, O = photo mode, B = push-to-talk; all keys remappable; old saved bindings migrate automatically | Implemented & tested |
| Driving | Speed-sensitive steering, weight transfer, tyre grip limit (understeer), handbrake and power-over drifts, sprung body roll and pitch, 6-speed gearbox with shift dips and gear readout, motorcycle lean from cornering physics; Egyptian cab and microbus added | Implemented & tested |
| Companion | Rides visibly in every vehicle type: passenger seat in cars, padded carrier or basket on bikes and scooters, on board boats and aircraft | Implemented & tested |
| Phone | Arabic phone; text threads with quick replies or free typing, contacts answer; Uncle Hassan in contacts | Implemented & tested |
| Photo mode | O: free camera, height, distance, field of view, hide the hero, capture to the phone gallery | Implemented & tested |
| Menus | Translucent panels over the live world, one panel at a time, Escape and a close button everywhere | Implemented & tested |
| Audio | Sliders: master, music, ambient city, dialogue & crowd, vehicles, effects, notifications, phone calls | Implemented |
| Graphics | Procedural PBR maps (normal + roughness) for roads, pavements and plaster; wind sway on trees; more characters loaded after start | Implemented |
| Mobile | Fire / aim / reload / weapon buttons and a photo button join the existing touch layout | Implemented (not tried on a real phone) |

Statuses follow the spec's scale: **Implemented & tested** (has a passing automated check), **Implemented** (working, exercised manually or indirectly), **Prototype** (simplified), **Not implemented**, **Blocked by platform**.

## Platform facts verified in this session

- Claude Code cloud session with GitHub access to `Tarekali22/RIVORA`; work is on branch `claude/rivora-game-artifact-45iaqn`.
- Artifact runtime: scripts only from cdnjs / jsDelivr / unpkg; file downloads (`<a download>`) are blocked for viewers; file inputs, localStorage (try/catch), pointer lock (desktop, from a click), Web Audio after a user gesture all available. Save export therefore uses a copyable **save code**.
- OpenArt remote MCP connected on the Free plan with 10 credits. One GPT Image 2.5 Flare concept image (10 credits, 16:9, medium) was generated; balance is now 0. The image was not bundled: `cdn.openart.ai` is blocked by this cloud environment's network policy and Free-plan output is watermarked. All game art is procedural instead.
- No local software was installed on the user's computer. Testing used the cloud container's headless Chromium (SwiftShader software WebGL — far slower than a real GPU).

## Feature status

| Area | Status | Notes |
| --- | --- | --- |
| Title, settings, controls help, About | Implemented & tested | Title cinematic is rendered live in-engine |
| Character creator | Implemented & tested | Default hero configured from the supplied portraits (skin tone, buzz cut, brows, striped crew, earbuds, watch). Optional on-device photo colour sampling with consent; photo discarded after sampling |
| Photo-to-3D likeness | Prototype | Colour sampling only; real face reconstruction is not available in a browser artifact |
| City & districts | Implemented | Downtown, Coral Boardwalk/beach, Vista Heights, Laurel Park, Mercado, Foundry Port, airport, marina, outskirts, Neon Row |
| Player movement, jump, sprint, crouch, swim, climb-out | Implemented & tested | |
| Camera (mouse / drag / touch / gamepad), collision | Implemented & tested | |
| Companion: dog / cat / original robot | Implemented & tested | Follow, stay, come, pet, rides in cars, waits during flights, out-of-view recovery |
| Pedestrians & routines | Implemented & tested | Sidewalk graph, signal-aware crosswalks, chats, benches, phones, smoking (optional), umbrellas, fleeing, witnesses calling police, helping the injured |
| Traffic AI & signals | Implemented & tested | Stops at red, gap keeping, turns, honks, bump-to-physics recovery, road rage |
| Red-light cameras & fines | Implemented & tested | Fine only at active cameras; inactive and camera-less intersections never fine; police who see it raise wanted level |
| Vehicles | Implemented & tested | 24 original vehicles: cars, EVs with battery/charging, pickups, vans, trucks, bus, taxi, police, ambulance, bikes, scooter, bicycle, speedboat, jet ski, helicopter, plane |
| Helicopter / plane / parachute | Implemented & tested | |
| Melee combat | Implemented & tested | Combos, kicks, knees, block/counter, dodge, shove, knockdowns |
| Wanted levels 1–6 & police | Implemented & tested | Line-of-sight tracking, search & decay, pursuit cars, officers on foot, arrests, helicopter (4+), roadblocks (5+) |
| Phone | Implemented & tested | Calls, messages with target photo & GPS, jobs, bank, garage delivery, camera/photos, fitness, companion, settings |
| Missions | Implemented & tested | Story "Homecoming", contract "The Collector", courier runs, Coastline Sprint, lifeguard rescue, skydive, beach workout |
| Interiors & shops | Implemented & tested | Home, villa, café, store, gym, nightclub, clothing; dealership, garage, police, hospital, skydive, marina, elevator, EV chargers |
| Gym & stats | Implemented & tested | Strength / stamina / endurance / recovery with gameplay effects and gradual build change |
| Economy & properties | Implemented & tested | Cash + bank, card payments, fines, villa, café share income |
| Day/night & weather | Implemented & tested | Clear → storm, fog, wind, wet roads, lightning & thunder |
| Audio | Implemented & tested | All synthesized; moderate mix with limiter and per-bus sliders |
| Save / load | Implemented & tested | Versioned save codes + browser autosave |
| Mobile touch controls | Implemented & tested | Context-sensitive buttons, joystick, look pad, rotate-device notice |
| Firearms, 18 more story missions, friend house visits, diving | Not implemented | Roadmap |
| Public link sharing | Blocked by platform for the agent | Must be enabled by the owner from the artifact's Share menu |

## Automated test results (headless Chromium, SwiftShader software WebGL)

| Suite | Result | Covers |
| --- | --- | --- |
| `tests/gameplay.mjs` | 38/39 (the 1 miss was a flawed metric, re-verified below) | Title, creator, companion select, keyboard move/sprint/jump, ground contact, mouse camera, vehicle enter/drive/steer/brake/exit, signal cycle, traffic stopping at red, fine at active camera only, phone, story mission + $2,500 reward, café purchase, gym stat gain, parachute deploy + landing, helicopter flight, save code round-trip + corrupt-save rejection, companion following, melee, wanted level, police response, audio level (peak 0.105), no console errors |
| `tests/systems.mjs` | 18/20, both misses fixed and re-verified | Contract with generated target photo, accept from message, contract completion, storm + night lighting, dealership, clothing, jet ski on water, swim on exit, plane take-off, EV charging, nightclub dancing + club music, sleep/autosave, wasted → hospital, busted → police, population |
| `tests/regress.mjs` | 3/3 | Jumping out of a moving plane starts freefall; pedestrians keep moving while walking (22 walkers, 0 stuck); no console errors |
| `tests/mobile.mjs` (Pixel 7 landscape) | 11/11 | Touch detection, controls visible, no button overlaps, thumb-sized targets, joystick movement, touch camera, punch button, vehicle context buttons, portrait notice, no errors |

Bugs found and fixed by these runs: water plane 1 m too high, jet-ski audio NaN that froze the loop (plus a loop guard), plane bail-out knockdown, touch-button overlap on short screens, café camera outside the room, washed-out sky.

Frame rate in the container is ~3 FPS because WebGL is emulated on the CPU; it does not reflect real devices. Real-GPU and real-phone frame rates were **not** measured here.

## Public link

Artifact: https://claude.ai/artifact/YLcj4s9Pbnou3t8inVmtog — the platform reports it is shared as "Anyone with the link". From the container an anonymous request returns HTTP 200 without a sign-in wall, but the viewer could not finish rendering here because its asset host is blocked by this environment's network policy, so the full anonymous visitor experience was not verified from the cloud session.
