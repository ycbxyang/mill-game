# 四子棋神经网络训练

这一目录是独立于网页的训练工程。它不会影响当前线上版本，训练完成并通过评测后，才把导出的 ONNX 模型接入浏览器。

## 当前训练路线

1. `ConnectFour` 提供不可变规则环境、合法动作、胜负判断、镜像和神经网络编码。
2. 策略价值网络同时预测 7 列落子概率和当前局面的胜率。
3. PUCT MCTS 用网络引导搜索，自我对弈生成 `(局面, 搜索策略, 最终胜负)` 样本。
4. 训练使用策略交叉熵加价值均方误差，并保存可恢复的检查点。
5. 近终局精确求解器用于构建不会漂移的强度基准。
6. 最终导出 ONNX，交给网页端 ONNX Runtime Web 推理。

## 建立环境

在 PowerShell 中进入项目根目录，运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\training\connect_four\bootstrap.ps1
```

脚本把 Python 3.12 安装到项目的 `.python312` 目录，不修改系统 Python；随后安装 CUDA 12.8 版 PyTorch 和导出工具。

## 验证

```powershell
cd .\training\connect_four
..\..\.python312\python.exe -m unittest discover -s tests -v
```

## 最小冒烟训练

只验证完整链路，模型不会因此变强：

```powershell
..\..\.python312\python.exe train.py --iterations 1 --games 2 --simulations 8 --epochs 1 --batch-size 16 --channels 16 --blocks 1
```

## 先进行策略热身

正式自我对弈前，先让网络学习立即取胜、阻挡对方和优先占据中心等基本常识。它不是最终 AI，只用于避免网络从完全随机状态起步：

```powershell
..\..\.python312\python.exe pretrain.py --positions 50000 --epochs 8 --device cuda
```

## 正式起步配置

RTX 5060 Laptop 8GB 可以先使用：

```powershell
..\..\.python312\python.exe train.py --iterations 20 --games 32 --simulations 96 --epochs 4 --batch-size 128 --channels 64 --blocks 4 --resume checkpoints\pretrained.pt
```

训练时间主要耗在 MCTS 自我对弈，而不是网络更新。第一轮先用上述配置观察速度、显存、胜率与损失，再决定是否增加并行自我对弈和搜索次数。

训练中断后，给 `--resume checkpoints\latest.pt` 即可从最近一次网络与优化器状态继续。当前检查点不保存 replay buffer，所以续训后的第一轮会重新积累自我对弈样本；下一阶段会把并行自我对弈、持久 replay buffer 和新旧模型擂台评测补齐。

## 导出网页模型

```powershell
..\..\.python312\python.exe export_onnx.py checkpoints\latest.pt
```

导出脚本会用 ONNX Runtime 再计算一次并和 PyTorch 输出比对，避免产生无法使用或数值错误的网页模型。
