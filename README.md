# 8 Minutes

Ride a photon from the Sun to Earth in real time, at true scale. One pixel is about 2,300 km, so light
crosses the screen at ~130 px/s and today's trip (computed from Earth's actual distance) takes ~8 min 10 s.

```bash
nvm use            # Node 22 (Vite 8 needs ≥ 20.19)
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

## Going live
It's served from the portfolio site at https://kailashgnath.github.io/eight-minutes/. To update it:

```bash
npm run deploy:portfolio   # builds and copies dist/ into ../kailash-lab/public/eight-minutes
cd ../kailash-lab && git add public/eight-minutes && git commit -m "Update 8 Minutes" && git push
```

Pushing the portfolio's `main` runs its GitHub Pages workflow.

## Where things live
- `src/core/Scale.ts`: true-scale constants and today's Earth–Sun distance.
- `src/core/Clock.ts`: journey time, time-warp, catch-up after a hidden tab.
- `src/content/milestones.ts`: every card's copy, computed from today's trip.
- `src/core/CameraDirector.ts`: shots (hero, dive, follow, zoom-out, arrival, end) and blending.
- `src/world/`: Sun, photon, dust, stars, ruler, planets, prologue random walk, telescope lens.
- `src/ui/`: HUD, minimap, cards, race, sheets, labels, audio.
- `src/styles/mobile.css`: phone portrait layout (the world rotates 90°; the photon falls down the screen).

Debug handle in the console: `__8min` (e.g. `__8min.clock.warpTo(__8min.trip.seconds - 10, performance.now())`).
