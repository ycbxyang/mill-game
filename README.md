# 棋类合集 · Board Game Collection

<p align="center">
  <strong>三张棋盘，三种思考方式。打开浏览器，下一局马上开始。</strong>
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

## 一眼看懂

这是一个无需安装、打开网页即可玩的轻量棋类合集，面向电脑、iPad 和安卓平板设计。三款游戏都支持本地双人、人机对战和六位房间码远程联机；规则引擎、AI 与联机状态彼此独立，新增游戏不会干扰已有棋局。

| 游戏 | 核心玩法 | AI | 对战方式 |
| --- | --- | --- | --- |
| **磨坊棋** | 成磨、吃子、走子与飞行 | Alpha-Beta；高手使用 ONNX 神经网络 + MCTS | 本地 / 人机 / 联机 |
| **四子棋** | 横、竖或斜向率先连成四子 | 迭代加深 Alpha-Beta + 战术搜索 | 本地 / 人机 / 联机 |
| **黑白棋** | 夹住并翻转棋子，占领更多棋盘 | Alpha-Beta + 局面评估 | 本地 / 人机 / 联机 |

## 为什么值得一试

- **打开即玩**：原生 HTML、CSS 与 JavaScript，无构建步骤，也不依赖应用商店。
- **真正适合触控**：棋盘自适应屏幕，按钮按平板触控尺寸设计，横屏和竖屏都能完成对局。
- **三档 AI**：从轻松体验到深度搜索；AI 在 Web Worker 中运行，不阻塞主界面。
- **远程房间**：通过 Firebase 匿名登录与 Realtime Database 同步，输入六位房间码即可加入。
- **终局仍然可见**：胜负结果显示在棋盘下方，不会遮住最后的局面。
- **可验证**：规则、AI、页面绑定、联机编码和浏览器运行均有自动测试。

## 快速开始

这是一个静态网站。下载项目后，可以直接打开 `index.html`；为了避免浏览器对 ES Module 的本地文件限制，推荐启动一个本地服务器：

```powershell
cd D:\Codex_nine
D:\Python\python.exe -m http.server 8000
```

然后访问：

```text
http://localhost:8000/
```

也可以将仓库根目录直接部署到 GitHub Pages：

```text
Settings → Pages → Deploy from a branch → main / (root)
```

## 远程联机配置

本地双人和人机模式无需 Firebase。只有选择“远程联机”时才会加载在线模块。

1. 创建 Firebase 项目并开启 Anonymous Authentication。
2. 创建 Realtime Database。
3. 将网页配置写入 `firebase-config.js`。
4. 使用 `database.rules.json` 中的规则。
5. 部署后用两台设备完成创建、加入、落子、刷新与断线测试。

更完整的操作说明见 [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)。

> Firebase Web 配置会出现在浏览器端，这是正常设计；真正的访问控制必须依靠 Authentication 与数据库安全规则。

## 项目结构

```text
.
├─ index.html                 # 游戏大厅
├─ app.css                    # 大厅样式
├─ online.js                  # 通用 Firebase 房间同步
├─ firebase-config.js         # Firebase Web 配置
├─ database.rules.json        # Realtime Database 规则
├─ games/
│  ├─ shared/game.css         # 四子棋与黑白棋共用界面
│  ├─ morris/                 # 磨坊棋、传统 AI、神经网络 AI
│  ├─ connect-four/           # 四子棋
│  └─ othello/                # 黑白棋
├─ tests/                     # 浏览器、规则、AI 与联机测试
└─ training/
   ├─ morris/                 # 磨坊棋训练与擂台评测
   └─ connect_four/           # 四子棋训练实验
```

## 本地测试

项目的网页测试只需要 Node.js：

```powershell
node tests/project-check.js
node tests/connect-four-tests.js
node tests/othello-tests.js
node tests/ai-tests.js
node tests/online-codec-tests.js
```

浏览器级测试位于 `tests/ui-harness.html`。Firebase 实际联机测试需要有效配置和网络。

训练代码使用 Python、NumPy 与 PyTorch，相关环境和命令分别记录在：

- [磨坊棋训练说明](./training/morris/README.md)
- [四子棋训练说明](./training/connect_four/README.md)

训练环境、检查点、回放数据和临时导出模型默认不会提交到 GitHub。

## 设计原则

1. **规则优先**：AI 再强也不能下出非法棋。
2. **游戏隔离**：每款游戏独立维护规则、棋盘、AI 和状态编码。
3. **联机一致**：房间校验 `gameId` 与 `rulesVersion`，避免跨游戏或跨版本错误同步。
4. **有限思考**：所有 AI 都有时间上限、看门狗和应急落子。
5. **渐进增强**：本地与基础 AI 不依赖网络；高级能力按需加载。

## 当前状态

当前版本为 **v2.0.0-alpha.2**。三款游戏的核心玩法、本地对战、人机模式和远程房间已经可用；正式版发布前仍需持续完成双设备联机、不同浏览器、弱网恢复和移动端性能测试。

### 下一步

- 提升四子棋神经网络训练与批量自我对弈效率。
- 为新旧 AI 建立固定、可复现的擂台晋级流程。
- 完成 iPad、安卓平板和桌面浏览器的发布回归。
- 核心流程稳定后发布 `v2.0.0`。

---

如果你喜欢这个项目，可以点一个 Star，或者开 Issue 分享规则建议、设备兼容问题和精彩终局。

