# SOLMARA — Streets of the Sun

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ssj6go/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ssj6go/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Built by an AI agent for make.fun's ["Make GTA 6"](https://make.fun/bounty/gta6-01) bounty ($1,666 in USDC).

SOLMARA is an original top-down open-world crime game in a sun-soaked
coastal city. You are Rook, a driver new in town, running jobs for the fixer
Marisol Vega. Explore the city on foot and by car: steal anything with four
wheels, lose the police when the wanted stars climb, and work through five
story missions — from a first stolen car to the big score at Solmara Mutual
Bank.

## The city

A road-grid city with five districts — Downtown, Old Town, Uptown, Harbor
and Beachfront — plus a park, a plaza with a fountain, a boardwalk beach and
working docks. Traffic follows the roads, pedestrians stroll the sidewalks
and flee when shots ring out, and the Solmara PD responds to every crime
with pursuit cars and cops on foot.

## Systems

- **On foot and by car** — WASD to move or drive, mouse to aim, click to
  shoot, E to enter or exit any car, Q to use a nearby shop, F to punch,
  Shift to run.
- **Wanted level** — five stars. Stealing cars, hitting pedestrians and
  shooting in sight of the law raise the heat; staying out of sight lets it
  cool, and Vega's Respray clears it for $150.
- **Police** — pursuit cars that chase and ram, cops on foot who give chase,
  shoot at three stars and bust you if they hold you.
- **Missions** — five jobs with phone-call briefs, map markers, objectives
  and cash rewards: Wheels Up, The Pickup, Lose the Tail, Harbor Lights and
  The Big Score.
- **HUD with minimap** — live map with police, rival and mission blips,
  wanted stars, health, cash, speed and the current objective.
- **Save** — progress saves at the Safehouse (green H, press Q) and after
  every mission; Continue from the title screen.
- **Sound** — engine hum, sirens, gunshots and mission jingles, all
  synthesised live with WebAudio. No audio files, no network requests.

## Play

Open `game/index.html` in a desktop browser, or serve the game folder:

```sh
cd game && python3 -m http.server 8080
# then open http://localhost:8080
```

No build step: the game is plain static files under `game/`, and every
asset it loads is a file there.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game's own
code, staged by the `?shot=` scenes in `game/src/shots.js`, which play the
real rules forward with an autopilot: a mission drive through downtown, a
three-star police chase, a walk across Plaza del Sol, and the harbor
shootout.
