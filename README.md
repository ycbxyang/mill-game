# 棋类合集

[简体中文](./README.md) | [English](./README_EN.md)

这个项目最开始只有磨坊棋，后来又加入了四子棋和黑白棋。网页使用原生 HTML、CSS 和 JavaScript 编写，不需要安装，也没有构建步骤，在电脑、iPad 和安卓平板上都可以使用。

在线试玩：[https://ycbxyang.github.io/mill-game/](https://ycbxyang.github.io/mill-game/)

目前项目仍在开发中，版本为 `v2.0.0-alpha.2`。

## 已有游戏

| 游戏 | 规则概要 | 支持的模式 |
| --- | --- | --- |
| 磨坊棋 | 成磨后吃子，经过落子、走子和飞行阶段 | 本地双人 / 人机 / 远程联机 |
| 四子棋 | 在 7×6 棋盘上率先横向、纵向或斜向连成四子 | 本地双人 / 人机 / 远程联机 |
| 黑白棋 | 夹住并翻转对方棋子，终局时棋子多的一方获胜 | 本地双人 / 人机 / 远程联机 |

三款游戏都有三档电脑难度。磨坊棋和黑白棋主要使用 Alpha-Beta 搜索；四子棋使用迭代加深和战术搜索。高手难度的磨坊棋还可以加载 ONNX 神经网络并配合 MCTS。AI 在 Web Worker 中计算，思考时不会阻塞棋盘操作。

## 本地运行

可以直接打开 `index.html`。如果浏览器限制本地加载 ES Module，建议在项目目录启动一个简单的本地服务器：

```powershell
cd D:\Codex_nine
D:\Python\python.exe -m http.server 8000
```

然后访问：

```text
http://localhost:8000/
```

部署到 GitHub Pages 时，选择：

```text
Settings → Pages → Deploy from a branch → main / (root)
```

## 远程联机

本地双人和人机模式不依赖 Firebase。只有进入远程联机模式时，网页才会加载在线模块。

联机功能需要：

1. 在 Firebase 中开启 Anonymous Authentication。
2. 创建 Realtime Database。
3. 把网页配置填入 `firebase-config.js`。
4. 应用 `database.rules.json` 中的数据库规则。
5. 用两台设备测试创建房间、加入房间、双方落子和重新连接。

具体步骤见 [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)。

Firebase 的 Web 配置会保存在网页端，这是正常的。访问权限由 Authentication 和数据库安全规则控制。

## 项目结构

```text
.
├─ index.html                 # 游戏大厅
├─ app.css                    # 大厅样式
├─ online.js                  # Firebase 房间同步
├─ firebase-config.js         # Firebase Web 配置
├─ database.rules.json        # Realtime Database 规则
├─ games/
│  ├─ shared/game.css         # 四子棋与黑白棋共用样式
│  ├─ morris/                 # 磨坊棋
│  ├─ connect-four/           # 四子棋
│  └─ othello/                # 黑白棋
├─ tests/                     # 规则、AI、联机和页面测试
└─ training/
   ├─ morris/                 # 磨坊棋训练代码
   └─ connect_four/           # 四子棋训练实验
```

每款游戏分别维护规则、界面、AI 和联机状态编码。远程房间还会检查 `gameId` 和 `rulesVersion`，避免不同游戏或不同版本之间错误同步。

## 测试

网页测试只需要 Node.js：

```powershell
node tests/project-check.js
node tests/connect-four-tests.js
node tests/othello-tests.js
node tests/ai-tests.js
node tests/online-codec-tests.js
```

浏览器测试页面是 `tests/ui-harness.html`。实际联机测试还需要有效的 Firebase 配置和两台联网设备。

训练相关说明：

- [磨坊棋训练](./training/morris/README.md)
- [四子棋训练](./training/connect_four/README.md)

训练环境、模型检查点、回放数据和临时导出文件默认不会提交到 GitHub。

## 接下来准备做的事

- 继续调整四子棋和磨坊棋的 AI。
- 固定新旧 AI 的对局评测方法，避免只凭几盘棋判断强弱。
- 补充 iPad、安卓平板和桌面浏览器的测试。
- 检查弱网、刷新和断线后的联机恢复。
- 核心流程稳定后发布 `v2.0.0`。

发现规则问题、联机故障或设备兼容问题，可以直接提交 Issue。
