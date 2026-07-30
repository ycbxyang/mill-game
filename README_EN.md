# Qiju · Board Game Collection

[简体中文](./README.md) | [English](./README_EN.md)

[Release notes](./CHANGELOG.md#english)

This project started as a Nine Men's Morris page. Connect Four and Othello were added later. It is written in plain HTML, CSS, and JavaScript, with no installation or build step required. The layout is intended to work on desktop browsers, iPad, and Android tablets.

Play online: [https://ycbxyang.github.io/qiju/](https://ycbxyang.github.io/qiju/)

The current stable release is `v2.1.1`, and development is ongoing.

## Games

| Game | Basic rules | Modes |
| --- | --- | --- |
| Nine Men's Morris | Form mills, capture pieces, then move and fly | Local / AI / Online |
| Connect Four | Be the first to connect four pieces on a 7×6 board | Local / AI / Online |
| Othello | Trap and flip opposing discs; the larger final count wins | Local / AI / Online |

Each game has three AI levels. Morris and Othello mainly use alpha-beta search. Connect Four uses iterative deepening with tactical search. The expert Morris player can also load an ONNX neural network and use MCTS. AI calculations run in Web Workers so the board remains responsive.

## Running Locally

You can open `index.html` directly. If the browser blocks ES Modules loaded from local files, clone the repository and start a small local server from the project directory:

```powershell
git clone https://github.com/ycbxyang/qiju.git
cd qiju
python -m http.server 8000
```

Use `python3` instead of `python` on systems where that is the Python 3 command. Once the server starts, open:

```text
http://localhost:8000/
```

For GitHub Pages, select:

```text
Settings → Pages → Deploy from a branch → main / (root)
```

## Online Matches

Local and AI matches do not use Firebase. The online module is loaded only when remote multiplayer is selected.

Online play requires:

1. Enable Anonymous Authentication in Firebase.
2. Create a Realtime Database.
3. Put the web configuration in `firebase-config.js`.
4. Apply the rules from `database.rules.json`.
5. Test room creation, joining, moves, and reconnection on two devices.

See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for the setup steps.

Firebase web configuration is stored on the client by design. Authentication and database security rules are responsible for access control.

## Project Structure

```text
.
├─ index.html                 # Game lobby
├─ app.css                    # Lobby styles
├─ online.js                  # Firebase room synchronization
├─ firebase-config.js         # Firebase web configuration
├─ database.rules.json        # Realtime Database rules
├─ games/
│  ├─ shared/game.css         # Shared Connect Four and Othello styles
│  ├─ morris/                 # Nine Men's Morris
│  ├─ connect-four/           # Connect Four
│  └─ othello/                # Othello
├─ tests/                     # Rules, AI, online, and page tests
└─ training/
   ├─ morris/                 # Morris training code
   └─ connect_four/           # Connect Four training experiments
```

Rules, UI, AI, and online state encoding are kept separate for each game. Online rooms also check `gameId` and `rulesVersion` to prevent mismatched games or versions from synchronizing.

## Tests

The web tests only require Node.js:

```powershell
node tests/project-check.js
node tests/connect-four-tests.js
node tests/othello-tests.js
node tests/ai-tests.js
node tests/online-codec-tests.js
```

The browser test page is `tests/ui-harness.html`. Live online tests require a valid Firebase configuration and two connected devices.

Training notes:

- [Nine Men's Morris training](./training/morris/README.md)
- [Connect Four training](./training/connect_four/README.md)

Python environments, checkpoints, replay data, and temporary exports are excluded from GitHub by default.

## Planned Work

- Continue tuning the Connect Four and Morris AI.
- Use a fixed match evaluation process when comparing old and new AI versions.
- Test on iPad, Android tablets, and desktop browsers.
- Check reconnect behavior after weak connections, refreshes, and disconnects.
- Publish follow-up stable releases as the main flows evolve.

Please open an Issue if you find a rules bug, online-play problem, or device compatibility issue.
