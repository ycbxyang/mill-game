# 棋聚版本更新 / Qiju Release Notes

这里记录面向玩家和开发者的正式版本变化。`v2.1.1` 之前的开发过程请查看 Git 提交与 Pull Request 历史。

## v2.1.1 — 2026-07-30

### 新增

- 磨坊棋最高难度现已完整部署 ONNX 神经网络与 MCTS 引擎。
- 三款游戏的远程对战加入双方确认重开和返回创建/加入页面的入口。
- 磨坊棋加入连续 100 回合未吃子与同一局面重复三次的和棋规则。
- 新增 GitHub Actions，自动检查页面资源、规则、AI、联机协议和浏览器 Worker。

### 改进

- 磨坊棋最高难度会在约 7 秒思考时间内持续执行 MCTS，不再受固定少量模拟次数限制。
- 联机棋局加入状态版本号，发生并发更新时会恢复服务器上的最新棋局。
- 统一网页标题、脚本、样式、Worker 和模型缓存版本为 `v2.1.1`。
- 清理旧的重复目录，并检查网页依赖是否已被 Git 跟踪，避免发布时漏传模型或运行库。

### 修复

- 修复一方行动后另一方可能无法及时获得最新棋局的问题。
- 修复玩家断线后临时房间未可靠关闭的问题。
- 修复撤销或远程重开后仍显示上一局终局结果的问题。
- 修复黑白棋搜索缓存把剪枝边界误当作精确分数的问题。
- 修复浏览器冒烟测试通过后，临时目录清理竞态导致 CI 误报失败的问题。

### 验证

- 三款游戏的规则、AI 与联机测试通过。
- Chrome 实际加载 ONNX 模型并运行神经网络 MCTS 通过。
- 四子棋训练测试 12 项、磨坊棋训练测试 48 项通过。
- 桌面与 GitHub Pages 的自动化检查通过。

---

<a id="english"></a>

## English

Release notes for players and contributors start with `v2.1.1`. Earlier development history remains available through Git commits and Pull Requests.

### v2.1.1 — 2026-07-30

#### Added

- The expert Nine Men's Morris player now ships with its ONNX neural network and MCTS runtime.
- Online matches in all three games now support mutually confirmed restarts and a back action for the room screen.
- Morris now detects draws after 100 non-capturing turns or three repetitions of the same position.
- GitHub Actions now checks page assets, rules, AI behavior, online protocols, and the browser Worker.

#### Improved

- Expert Morris uses its roughly seven-second thinking budget for continued MCTS instead of a small fixed simulation count.
- Online games use state revisions and recover the newest server state after conflicting updates.
- Page, script, style, Worker, and model cache versions are consistently set to `v2.1.1`.
- Duplicate legacy directories were removed, and runtime assets must now be tracked by Git before deployment.

#### Fixed

- Fixed cases where the second player did not receive the latest board after the first move.
- Fixed unreliable cleanup of temporary rooms after a player disconnects.
- Fixed stale end-game results remaining visible after undo or a remote restart.
- Fixed Othello search cutoffs being cached as exact scores.
- Fixed a cleanup race that made browser smoke tests report failure after the model test had passed.

#### Validation

- Rules, AI, and online tests pass for all three games.
- Chrome successfully loads the ONNX model and runs neural-network MCTS.
- All 12 Connect Four and 48 Morris training tests pass.
- Local and GitHub Pages automation checks pass.
