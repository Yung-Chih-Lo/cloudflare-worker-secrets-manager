import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test("Cloudflare runtime enforces scope, token, IP, JSON and response isolation", async () => {
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    scriptPath: fileURLToPath(new URL("../src/worker.js", import.meta.url)),
    compatibilityDate: "2026-10-01",
    bindings: {
      EXAMPLE_DEV: JSON.stringify({ ACCESS_TOKEN: "test-dev-token", ALLOWED_IPS: "192.0.2.1", DATABASE_URL: "dev-db", OPTIONAL: "" }),
      EXAMPLE_PROD: JSON.stringify({ ACCESS_TOKEN: "test-prod-token", ALLOWED_IPS: "192.0.2.2", DATABASE_URL: "prod-db" }),
      OTHER_DEV: JSON.stringify({ ACCESS_TOKEN: "test-other-token", ALLOWED_IPS: "192.0.2.1", DATABASE_URL: "other-db" }),
      BROKEN_DEV: "not-json",
    },
  }));
  try {
    const cases = [
      ["/example/dev/", "test-dev-token", "192.0.2.1", 200, { DATABASE_URL: "dev-db", OPTIONAL: "" }],
      ["/example/dev", "test-dev-token", "192.0.2.1", 200, { DATABASE_URL: "dev-db", OPTIONAL: "" }],
      ["/example/dev/", "wrong-token", "192.0.2.1", 403],
      ["/other/dev/", "test-dev-token", "192.0.2.1", 403],
      ["/other/dev/", "test-other-token", "192.0.2.1", 200, { DATABASE_URL: "other-db" }],
      ["/example/prod/", "test-dev-token", "192.0.2.1", 403],
      ["/example/prod/", "test-prod-token", "192.0.2.1", 403],
      ["/example/prod/", "test-prod-token", "192.0.2.2", 200, { DATABASE_URL: "prod-db" }],
      ["/example/dev/", "test-dev-token", "192.0.2.2", 403],
      ["/broken/dev/", "test-dev-token", "192.0.2.1", 403],
    ];
    for (const [path, token, ip, status, expected] of cases) {
      const response = await runtime.dispatchFetch(`https://secrets.example.com${path}`, {
        headers: { Authorization: `Bearer ${token}`, "CF-Connecting-IP": ip },
      });
      assert.equal(response.status, status, path);
      if (expected) {
        assert.equal(response.headers.get("Cache-Control"), "no-store");
        assert.deepEqual(await response.json(), expected);
      } else {
        assert.equal(await response.text(), "");
      }
    }
  } finally {
    await runtime.dispose();
  }
});
