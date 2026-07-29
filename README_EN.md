# Board Game Collection · 棋类合集

<p align="center">
  <strong>Three boards. Three ways to think. Your next match starts in the browser.</strong>
</p>

<p align="center">
  <a href="./README.md">简体中文</a> ·
  <a href="./README_EN.md">English</a>
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-v2.0.0--alpha.2-d8a849">
  <img alt="Games" src="https://img.shields.io/badge/games-3-386eaa">
  <img alt="Modes" src="https://img.shields.io/badge/modes-local%20%7C%20AI%20%7C%20online-2d6a4f">
  <img alt="Responsive" src="https://img.shields.io/badge/tablet-ready-cf6251">
</p>

## At a Glance

Board Game Collection is a lightweight, installation-free web app designed for desktop browsers, iPad, and Android tablets. Every included game supports local multiplayer, computer opponents, and remote matches through six-digit room codes. Rules, AI, and online state are isolated per game, so the collection can grow without destabilizing existing boards.

| Game | Core idea | AI | Match modes |
| --- | --- | --- | --- |
| **Nine Men's Morris** | Form mills, capture pieces, move, and fly | Alpha-beta; ONNX neural network + MCTS on Expert | Local / AI / Online |
| **Connect Four** | Connect four horizontally, vertically, or diagonally | Iterative-deepening alpha-beta with tactical search | Local / AI / Online |
| **Othello / Reversi** | Trap and flip discs to control the board | Alpha-beta with positional evaluation | Local / AI / Online |

## Highlights

- **Open and play** — Native HTML, CSS, and JavaScript with no build step or app-store installation.
- **Touch-first layout** — Responsive boards and tablet-sized controls work in portrait and landscape.
- **Three AI levels** — From casual play to deeper search, all running inside Web Workers to keep the UI responsive.
- **Remote rooms** — Firebase anonymous authentication and Realtime Database synchronization behind a six-digit room code.
- **Visible final positions** — Results appear below the board instead of covering the last move.
- **Testable architecture** — Automated checks cover rules, AI, DOM bindings, online codecs, and browser runtime behavior.

## Quick Start

This is a static website. You can open `index.html` directly, but a local server is recommended because browsers restrict ES Modules loaded from local files:

```powershell
cd D:\Codex_nine
D:\Python\python.exe -m http.server 8000
```

Then visit:

```text
http://localhost:8000/
```

The repository root can also be deployed directly with GitHub Pages:

```text
Settings → Pages → Deploy from a branch → main / (root)
```

## Remote Multiplayer Setup

Local multiplayer and AI matches do not require Firebase. The online module is loaded only after the player chooses remote multiplayer.

1. Create a Firebase project and enable Anonymous Authentication.
2. Create a Realtime Database.
3. Put the web configuration in `firebase-config.js`.
4. Apply the rules from `database.rules.json`.
5. Test room creation, joining, moves, refreshes, and disconnects on two devices.

See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for the complete setup guide.

> Firebase web configuration is intentionally visible to the browser. Authentication and database security rules—not hiding the client configuration—must enforce access control.

## Project Structure

```text
.
├─ index.html                 # Game lobby
├─ app.css                    # Lobby styles
├─ online.js                  # Shared Firebase room synchronization
├─ firebase-config.js         # Firebase web configuration
├─ database.rules.json        # Realtime Database rules
├─ games/
│  ├─ shared/game.css         # Shared Connect Four and Othello UI
│  ├─ morris/                 # Morris, classic AI, neural AI
│  ├─ connect-four/           # Connect Four
│  └─ othello/                # Othello
├─ tests/                     # Browser, rules, AI, and online tests
└─ training/
   ├─ morris/                 # Morris training and arena evaluation
   └─ connect_four/           # Connect Four training experiments
```

## Testing

The web test suite only requires Node.js:

```powershell
node tests/project-check.js
node tests/connect-four-tests.js
node tests/othello-tests.js
node tests/ai-tests.js
node tests/online-codec-tests.js
```

The browser-level smoke test lives in `tests/ui-harness.html`. Live Firebase tests require a valid configuration and network access.

Training code uses Python, NumPy, and PyTorch. Environment and command details are documented in:

- [Nine Men's Morris training](./training/morris/README.md)
- [Connect Four training](./training/connect_four/README.md)

Python environments, checkpoints, replay data, and temporary model exports are excluded from GitHub by default.

## Design Principles

1. **Rules first** — A stronger AI must never make an illegal move.
2. **Game isolation** — Every game owns its rules, board UI, AI, and state codec.
3. **Online consistency** — Rooms validate `gameId` and `rulesVersion` to prevent cross-game or cross-version synchronization.
4. **Bounded thinking** — AI levels use time limits, watchdogs, and emergency fallbacks.
5. **Progressive enhancement** — Local play and basic AI work offline; advanced capabilities load only when needed.

## Project Status

The current release is **v2.0.0-alpha.2**. Core rules, local play, AI matches, and remote rooms are available for all three games. Before the stable release, the project still needs broader two-device online tests, cross-browser regression, weak-network recovery tests, and mobile performance tuning.

### Next Up

- Improve batched self-play and neural training efficiency for Connect Four.
- Establish a deterministic arena gate for promoting new AI models.
- Complete release regression on iPad, Android tablets, and desktop browsers.
- Publish `v2.0.0` after the core flows are stable.

---

If you enjoy the project, consider leaving a Star or opening an Issue with rule suggestions, device compatibility reports, or memorable final positions.

