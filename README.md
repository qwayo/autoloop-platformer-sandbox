# 苔原信使

一个给仓库自我迭代做试点的横版跳跃小游戏。跨过断崖，抵达右侧的旗子就能通关。沿途可以尝试集齐三颗种子。

## 开始游戏

从 GitHub Releases 下载 `platformer.zip`，解压后打开 `index.html`。本地工作区也可以直接打开 `index.html`。

- 左右方向键或 `A`、`D` 移动。
- 空格或上方向键跳跃。
- 按 `R` 随时重开，也可以用结算画面的按钮重玩。

## 检查与交付

用 Node.js 24 运行 `npm test`。GitHub Actions 会在面向 `main` 的 PR 创建、更新、重开和转为就绪时运行检查。`main` 更新后，CD 对该提交执行同样的检查，再把 `index.html`、`game.css` 和 `game.js` 打成 ZIP，交付到本仓库的 Releases。每份交付的标签对应一个完整的提交 SHA。

## 试点约定

Agent 先提交候选改进的草稿。维护者确认并发布 Issue 后，才进入开发队列。一个 Issue 对应一个分支和一份 PR。维护者查看独立审查和 CI 的结果后决定是否合并。
