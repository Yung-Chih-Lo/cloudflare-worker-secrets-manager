# 參與開發

歡迎提交 Issue 與 Pull Request。請先說明使用情境及預期行為，避免在回報中包含真實密鑰或部署資訊。

使用 Node.js 22 以上，執行 `npm ci` 與 `npm run check`。測試只使用 RFC 文件用途 IP 與合成 token；不要連線真實密鑰服務。修改授權、路徑或 JSON 行為時，補上拒絕與跨範圍隔離測試。

提交 PR 到 `main`。不要直接更新 `release`，不要提交 `.dev.vars`、`.env` 或私人 JSON。變更操作方式時同步更新 README。依賴以 lockfile 固定，GitHub Actions 以完整 commit SHA 固定。
