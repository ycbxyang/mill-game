# 远程联机启用说明

远程房间使用 Firebase Authentication（匿名登录）和 Realtime Database。
网页代码已经接好，首次发布前只需完成下面的配置。

## 1. 注册网页应用

1. 打开 [Firebase 控制台](https://console.firebase.google.com/) 并进入你的项目。
2. 点击项目概览中的“网页”图标 `</>`。
3. 应用昵称可填写“磨坊棋”，不需要勾选 Firebase Hosting。
4. 注册后复制页面显示的 `firebaseConfig`。

## 2. 填写网页配置

打开项目根目录的 `firebase-config.js`，把 Firebase 给出的对应值填入：

```js
export const firebaseConfig = {
  apiKey: "你的 apiKey",
  authDomain: "你的 authDomain",
  databaseURL: "你的 databaseURL",
  projectId: "你的 projectId",
  appId: "你的 appId"
};
```

`databaseURL` 会在创建 Realtime Database 后显示；若第一次复制的配置里没有它，
可以稍后从“项目设置 → 你的应用 → SDK 设置和配置”重新复制。

## 3. 开启匿名登录

1. 左侧进入“构建 → Authentication”。
2. 点击“开始使用”。
3. 打开“登录方法”，选择“匿名”，启用并保存。

如果网页发布在 GitHub Pages，请在 Authentication 的“设置 → 已获授权的网域”
中加入你的 `用户名.github.io`。

## 4. 创建实时数据库并设置规则

1. 左侧进入“构建 → Realtime Database”。
2. 点击“创建数据库”，选择离玩家较近的区域。
3. 创建完成后打开“规则”标签。
4. 将项目根目录 `database.rules.json` 的全部内容复制进去，然后点击“发布”。

不要长期使用测试模式。项目提供的规则只允许匿名登录用户创建房间、加入空房间，
以及由房间中的两位玩家读写该房间。

## 5. 发布并测试

1. 将新增和修改的文件一起上传到 GitHub Pages。
2. 在两台设备或两个不同浏览器中打开网页。
3. 设备 A 选择“远程联机 → 创建房间”。
4. 设备 B 输入 A 显示的 6 位房间码并加入。
5. 页面提示“对手已加入”后即可开始。

房间码不区分大小写；离开页面或断线后，临时房间会自动关闭。
