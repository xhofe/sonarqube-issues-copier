# SonarQube Issues Copier

油猴脚本：在 SonarQube / SonarCloud 的 Issues 列表页一键复制当前筛选下的全部 issue，格式化成可直接贴给 AI 的修复说明。

## 安装

需要 [Tampermonkey](https://www.tampermonkey.net/)（或兼容的脚本管理器）。

点击安装：

[https://github.com/xhofe/sonarqube-issues-copier/raw/main/dist/sonarqube-issues-copier.user.js](https://github.com/xhofe/sonarqube-issues-copier/raw/main/dist/sonarqube-issues-copier.user.js)

`@match` 为 `*://*/*`。脚本只在识别到 Sonar 页面、且路径为 Issues 列表时显示按钮，不会在 GitHub 等站点误出。

## 用法

1. 打开任意 SonarQube 或 SonarCloud 的 Issues 列表（`/project/issues` 或 `/issues`）。
2. 用页面上的筛选（类型、严重级别、分支、未解决等）圈定范围。
3. 点右下角 **复制 Issues**。
4. 粘贴给 Cursor / ChatGPT 等，让它按列表改仓库。

按钮会显示拉取进度。同源带登录 cookie 调用 `/api/issues/search`，按当前 URL 筛选翻完全部分页。

401 或一条都拉不到时剪贴板不动。中途失败或撞上 API 约 1 万条上限时，已拉到的仍会复制，并在文案里标明截断。

## 复制格式

```
Here are some issues found by a SonarQube scan. Please fix them.

Project: my-project
Branch: main
Copied: 123

## src/foo.ts
- L42 [BUG/MAJOR] javascript:S1234 — message
```

按文件分组，文件内按行号排序。路径会去掉 `projectKey:` 前缀。无行号写 `L?`。

不做：Security Hotspots、源码片段、勾选行。

## 开发

```bash
pnpm install
pnpm dev      # 开发，按终端提示装进 Tampermonkey
pnpm test
pnpm build    # 产出 dist/sonarqube-issues-copier.user.js
```

推送到 `main` 后，CI 会构建并把 `dist/` 提交回去。
