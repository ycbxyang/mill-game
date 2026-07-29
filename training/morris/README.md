# 磨坊棋神经网络训练

本目录包含独立的磨坊棋规则、动作编码、策略价值网络、MCTS、自我对弈、
老师 AI 以及训练脚本。它不会改动网页游戏，也不会占用其他 Python 环境。

## 当前进度

- [x] 24 点棋盘、相邻关系和 16 条磨坊线
- [x] 布子、走子、三子飞行、成磨后独立吃子
- [x] 少于三子、无路可走、重复局面和无吃子回合上限
- [x] 固定 624 维动作编码与合法动作遮罩
- [x] 13 层局面编码与图残差策略价值网络
- [x] 正确处理连续成磨吃子的 PUCT MCTS
- [x] 自我对弈、压缩 replay buffer 和断点训练
- [x] Negamax 老师棋谱与监督预训练
- [ ] 新旧 AI 擂台评测
- [ ] ONNX 导出并接入网页

## 1. 自检

```powershell
cd D:\Codex_nine\training\morris
..\..\.python312\python.exe -m unittest discover -s tests -v
```

## 2. 第一次老师预训练

先并行生成 500 盘老师棋谱，再用 GPU 训练 8 轮：

```powershell
cd D:\Codex_nine\training\morris
..\..\.python312\python.exe pretrain.py --games 500 --teacher-depth 3 --workers 8 --save-every 25 --epochs 8 --batch-size 1024 --device cuda
```

默认输出：

- 棋谱：`data\teacher-replay.npz`
- 预训练模型：`checkpoints\pretrained.pt`

这一步只使用本机 CPU/GPU，不消耗 Codex 额度。棋谱阶段会并行使用 CPU，
每 25 盘自动保存；网络优化阶段会使用 CUDA 和混合精度。保持 PowerShell
窗口打开，直到看到以 `complete checkpoint=` 开头的完成信息。

## 3. 已生成棋谱，只重新训练模型

如果模型训练被中断，但 `data\teacher-replay.npz` 已经存在，可以跳过耗时的
老师对弈：

```powershell
..\..\.python312\python.exe pretrain.py --reuse-data --epochs 8 --batch-size 1024 --device cuda
```

## 4. 擂台评测

先测试不带搜索的裸网络：

```powershell
..\..\.python312\python.exe arena.py --games 20 --teacher-depth 3 --simulations 0 --device cuda
```

再测试网络加 MCTS：

```powershell
..\..\.python312\python.exe arena.py --games 20 --teacher-depth 3 --simulations 32 --device cuda
```

擂台会对同一随机开局交换先后手。最终 `score` 按胜一分、和半分计算，
避免某一方先手优势干扰判断。

## 5. 第一阶段 MCTS 自我强化

从预训练模型开始，并保留老师棋谱以减小初期遗忘：

```powershell
..\..\.python312\python.exe train.py --iterations 10 --games 32 --self-play-batch-size 8 --simulations 96 --epochs 4 --batch-size 1024 --replay-size 100000 --channels 64 --blocks 4 --temperature-actions 24 --max-actions 512 --device cuda --output checkpoints\selfplay --resume checkpoints\pretrained.pt --initial-replay data\teacher-replay.npz
```

程序每个迭代都会保存：

- 最新模型：`checkpoints\selfplay\latest.pt`
- 对应迭代：`checkpoints\selfplay\iteration-XXXX.pt`
- 自我对弈数据：`checkpoints\selfplay\replay.npz`

如果训练中断，使用下面的命令继续。`--iterations 5` 表示从已有检查点再训练
5 个迭代，不是重新从第一轮开始：

```powershell
..\..\.python312\python.exe train.py --iterations 5 --games 32 --self-play-batch-size 8 --simulations 96 --epochs 4 --batch-size 1024 --replay-size 100000 --channels 64 --blocks 4 --temperature-actions 24 --max-actions 512 --device cuda --output checkpoints\selfplay --resume checkpoints\selfplay\latest.pt
```

## 6. 对称增强精调

棋盘的四种旋转和四种镜像在规则上等价。训练器默认随机变换每个批次中的
局面和动作标签，以提高价值判断的方向泛化。使用较低学习率继续精调：

```powershell
..\..\.python312\python.exe train.py --iterations 5 --games 32 --self-play-batch-size 8 --simulations 128 --epochs 4 --batch-size 1024 --replay-size 100000 --learning-rate 0.0003 --value-loss-weight 1.5 --channels 64 --blocks 4 --temperature-actions 24 --max-actions 512 --device cuda --output checkpoints\selfplay-symmetry --resume checkpoints\selfplay\latest.pt --initial-replay checkpoints\selfplay\replay.npz
```

精调结束后，新旧模型使用相同 MCTS 强度进行准入赛：

```powershell
..\..\.python312\python.exe arena.py --checkpoint checkpoints\selfplay-symmetry\latest.pt --opponent-checkpoint checkpoints\selfplay\latest.pt --games 20 --simulations 32 --opponent-simulations 32 --device cuda
```

候选模型至少需要达到 55% 得分率才进入下一阶段；否则保留原模型并调整
训练参数，不能只凭 loss 下降自动替换。

## 后续流程

预训练完成后，先用擂台脚本确认神经网络至少不弱于现有网页 AI，再进行
神经网络引导的 MCTS 自我对弈和迭代训练。通过评测的模型最后导出为 ONNX，
接入网页端，并保留旧 AI 作为低难度与加载失败时的后备方案。
