# 安全政策

請勿在公開 Issue、PR、日誌或測試中放入真實密鑰、密鑰 JSON、存取 token 或可重現的客戶資料。請使用 GitHub Security 頁面的私人漏洞通報；若未提供此入口，先以不含漏洞細節的 Issue 請維護者提供私人管道。

此專案以專案／環境 token 與來源 IP 限制密鑰發放。它不隔離 Cloudflare 管理員、Worker 程式、部署者或遭入侵的合法來源主機。能部署程式的人可以讀取 Worker 所有 secrets。公開程式碼及 CI 通過都不代表已經過獨立安全稽核。

請保持依賴更新、審查程式及 workflow 變更，並限制 Cloudflare 與 GitHub 的管理權限。不要把真實密鑰提供給 PR CI。請不要在共享 Worker 上啟用來自任意分支的預覽部署。
