# Cloudflare Worker Secrets Manager

使用 Cloudflare Worker，依「專案／環境」發放應用程式啟動所需的密鑰。每個範圍保存一份 JSON Secret，只有來源 IP 與 Bearer token 都符合的請求可以讀取。

這是可自行部署的開源工具，不是託管密鑰服務。請部署到自己的 Cloudflare 帳號，使用自己的網域與密鑰。MIT 授權允許使用、修改、散布與商用。

```text
https://secrets.example.com/inventory/dev/
  → INVENTORY_DEV（Cloudflare Secret，內容為 JSON）
  → 驗證該範圍的 ACCESS_TOKEN 與 ALLOWED_IPS
  → 只回傳該 JSON 的應用欄位
```

## 功能與邊界

- 單一 Worker 管理多個專案與環境，各自使用獨立 token 與 IP 白名單。
- Secret 內部欄位維持 `DATABASE_URL` 等應用名稱，不需要前綴。
- 只接受 GET；未設定、格式錯誤或授權失敗回 403，其他方法回 405。
- 不回傳 `ACCESS_TOKEN`、`ALLOWED_IPS`，成功回應加上 `Cache-Control: no-store`。
- 不提供 Web 管理介面、密鑰歷史、密鑰恢復、自動輪替或人員登入。管理使用 Cloudflare Dashboard。
- 每個範圍的 token 都能讀取該範圍全部應用密鑰，不提供個別欄位權限。
- 不隔離 Worker 管理員、部署者、同一 Worker 的程式或已遭入侵的合法來源主機。能部署程式，就能存取綁定的所有 secrets。這不是經過獨立安全稽核的產品。

## 需求

- 自己的 Cloudflare 帳號，部署權限與可用的自訂網域。
- Node.js 22 以上與 npm。
- 應用服務可使用的固定出口 IPv4／IPv6。白名單是 IP 字串完全比對，不支援 CIDR；IPv6 也須符合 Cloudflare 實際看到的表示法。
- 密碼管理器，用來保存完整 JSON 的保管副本。

## 首次部署

1. Fork 此 repo，或複製到自己的 repo。若使用受控部署，請依下方步驟設定分支與 Environment；fork 不會自動複製這些保護設定。
2. 執行：

   ```sh
   npm ci
   npm run check
   npx wrangler login
   npm run deploy
   ```

3. `wrangler.toml` 的 Worker 名稱預設為 `secrets`。若已有同名 Worker，先核對用途；更換名稱時，也要與 Cloudflare Builds 綁定的 Worker 名稱一致。
4. 在 Cloudflare 的 Workers & Pages → Worker → Settings → Domains & Routes → Add → Custom Domain，填自己的網域，例如 `secrets.example.com`。
5. 新增下節的範圍 Secret，再從應用服務主機驗證授權。

預設關閉 `workers.dev`、預覽網址與 observability。自訂網域由 Dashboard 管理；設定檔刻意不包含 `route`／`routes`，讓後續部署保留 Dashboard 的路由設定。不需要把自己的網域、IP 或密鑰寫進這個公開 repo。

若要接手既有 Worker，在原 Worker 綁定此 repo，保留相同 Worker 名稱與既有自訂網域即可。請先備妥自己保管的密鑰副本，並核對已配置範圍與部署影響。

## 新增專案／環境

路徑格式是 `/<project>/<environment>/`，也接受省略最後的 `/`。兩個代號都只接受小寫英文字母與數字，以免分隔符造成名稱碰撞。Secret 名稱將兩者轉大寫後以單底線連接：

| 路徑 | Secret 名稱 |
| --- | --- |
| `/inventory/dev/` | `INVENTORY_DEV` |
| `/inventory/prod/` | `INVENTORY_PROD` |
| `/portal/dev/` | `PORTAL_DEV` |

新增範圍不需要修改程式。每個範圍必須產生不同的高熵隨機 token，例如 32 個隨機 bytes 編碼成 URL-safe 字串，並填入實際部署主機的出口 IP。

在 Cloudflare Dashboard → Workers & Pages → Worker → Settings → Variables and Secrets → Add：

1. Type 選 **Secret**，不是一般 Text 或 JSON 變數。
2. Variable name 填範圍名稱，例如 `INVENTORY_DEV`。
3. Value 貼入完整 JSON 文字，按 Deploy。

以下全部是示意值，必須在自己的密碼管理器或 Dashboard 中替換：

```json
{
  "ACCESS_TOKEN": "REPLACE_WITH_A_UNIQUE_RANDOM_TOKEN",
  "ALLOWED_IPS": "192.0.2.10,2001:db8::10",
  "DATABASE_URL": "REPLACE_WITH_YOUR_DATABASE_URL",
  "REDIS_URL": "REPLACE_WITH_YOUR_REDIS_URL"
}
```

JSON 必須是一層物件，所有值皆為字串。`ALLOWED_IPS` 是逗號分隔的 IP 字串；其他應用欄位可自行增加。空字串會保留並回傳，以便明確清空選用設定；物件、陣列、數字、布林或 null 都會讓此範圍拒絕請求。

此處是「一個 Secret 的 JSON 文字」，不是 `wrangler secret bulk` 的名稱／值清單。更新任一值都要重新提交整份 JSON。Cloudflare 不提供讀回 Secret 明文，請在密碼管理器保存完整副本。不要提交真實 JSON 到 Git，也不要放進 Issue、PR、CI、建置環境變數或日誌。

## 應用端接入與驗證

應用部署設定保存自己的範圍網址與 token，例如：

```text
SECRETS_URL=https://secrets.example.com/inventory/dev/
SECRETS_TOKEN=<該範圍的 ACCESS_TOKEN>
```

從白名單內的服務主機送出 GET，標頭為 `Authorization: Bearer <token>`，成功回應只包含應用欄位。應用程式可以在啟動時取得一次並保留在記憶體；取不到時應停止啟動，不應把錯誤當作空設定或成功。Worker 不會主動更新已啟動程序的記憶體。

驗證時只列印狀態碼，不要列印回應或 token。例如已安裝 httpx 的 Python 服務：

```python
import os
import httpx

response = httpx.get(
    os.environ["SECRETS_URL"],
    headers={"Authorization": "Bearer " + os.environ["SECRETS_TOKEN"]},
    timeout=10,
)
print(response.status_code)
```

確認正確來源及 token 回 200；錯 token、非白名單 IP、其他範圍的 token 都回 403。不要把訪客提供的 `CF-Connecting-IP` 當作本機測試以外的授權依據；正式請求須經 Cloudflare Worker 的受信任入口。

## CI 與受控部署

此 repo 不需要在 GitHub 保存 Cloudflare token 或任何應用密鑰。

```text
Pull Request → CI 檢查 → 合併 main
  → 手動執行 Promote release（選 main）
  → 重新檢查指定 commit → release Environment 核准
  → 將同一 commit 快轉到 release 分支
  → Cloudflare Builds 從 release 建置與部署
```

### GitHub 一次性設定

- 建立 `release` 分支，起點為已檢查的 `main` commit。
- 保護 `main`：要求 PR 與 `check` 狀態通過、禁止 force push／刪除；workflow 變更也必須審查。
- 保護 `release`：要求 `check` 狀態通過、禁止 force push／刪除。此分支由 Promote release 快轉，不要求再建立 release PR。
- 建立名為 `release` 的 Environment，設定至少一位 required reviewer，並只允許 `main` 作為部署來源。單人維護者可自行核准；有獨立審查者時可啟用 prevent self-review。
- 工作流程會先查核 Environment 已設定 reviewer；缺少時會失敗，不會自動變成無核准部署。核准期間若 main 已前進，發布會停止，必須針對新版本重新執行。

CI 使用唯讀 GitHub token、固定 SHA 的 Actions 與鎖定版本的 npm 依賴。PR CI 不取得部署環境。只有核准後的 promotion job 有 repository contents write 權限，且不執行 repo 中的程式，只推進分支。Repo 管理員仍可改保護規則，因此管理員與 Cloudflare 權限都必須受控。

### 綁定 Cloudflare Builds

在自己的 Worker → Settings → Builds 連接自己的 GitHub repo，設定：

| 設定 | 值 |
| --- | --- |
| Root directory | repo 根目錄 |
| Production branch | `release` |
| Build command | `npm ci && npm run check` |
| Deploy command | `npm run deploy` |
| 非 production 分支／預覽建置 | 關閉 |

不要把 production branch 設為 `main`，否則會跳過 release 核准流程。Cloudflare 初次綁定可能立即建置指定分支，綁定前先核對 release 的版本。Cloudflare 建置權限與 runtime secrets 由自己的 Cloudflare 帳號管理；不要把範圍 JSON 複製到 Builds 的環境變數。

Fork 後不要把自己的服務綁到上游 repo 的 release，否則上游更新就可能部署到自己的 Worker。若使用其他部署流程，請自行提供等效的權限與核准控制。

## 開發與測試

- `npm test`：Node 單元測試與 Miniflare／workerd runtime 測試，只有合成 token 和文件用途 IP。
- `npm run build`：Wrangler dry-run，確認程式可打包，不部署遠端。
- `npm run check`：執行以上兩項。
- `npm run dev`：啟動本機 Worker；本機測試不能證明真實出口 IP、DNS、TLS 或 Cloudflare 生產環境已驗收。

詳細貢獻方式見 [CONTRIBUTING.md](CONTRIBUTING.md)，安全邊界與私人通報見 [SECURITY.md](SECURITY.md)。

## 維運注意事項

- 輪替 token 時同步更新呼叫端；更換 IP 前先更新白名單。逐一驗證後再移除舊授權。
- 共用 Worker 程式部署會影響所有範圍，更新前核對影響範圍並保留可回復版本。程式回退不等於密鑰回復，不能依賴 Git 恢復密鑰。
- Cloudflare 帳號、Worker 程式與部署權限是共同信任邊界；多範圍授權不等於多個獨立保管庫。
- 使用平台最新的 secret 大小、數量及 Worker 用量限制；此工具不提供無限容量或可用性保證。

## 官方文件

- [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [自訂網域](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Wrangler 路由設定](https://developers.cloudflare.com/workers/wrangler/configuration/#routes)
- [Cloudflare Builds 分支](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [GitHub Environment 部署保護](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

## 授權

[MIT](LICENSE)。可自行部署、修改及商用；不提供保固。
