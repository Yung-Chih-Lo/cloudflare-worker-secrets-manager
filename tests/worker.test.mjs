import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import test from "node:test";
import worker from "../src/worker.js";

// Node has the same primitive outside SubtleCrypto; Cloudflare exposes it on subtle.
crypto.subtle.timingSafeEqual = timingSafeEqual;
const dev = { ACCESS_TOKEN: "test-dev-token", ALLOWED_IPS: "192.0.2.1, 2001:db8::1", DATABASE_URL: "dev-db", TRACING_DATABASE_URL: "" };
const env = {
  EXAMPLE_DEV: JSON.stringify(dev),
  EXAMPLE_PROD: JSON.stringify({ ACCESS_TOKEN: "test-prod-token", ALLOWED_IPS: "192.0.2.2", DATABASE_URL: "prod-db" }),
  OTHER_DEV: JSON.stringify({ ACCESS_TOKEN: "test-other-token", ALLOWED_IPS: "192.0.2.1", DATABASE_URL: "other-db" }),
  ACCESS_TOKEN: "legacy-token", ALLOWED_IPS: "192.0.2.1", DATABASE_URL: "legacy-db",
  EXAMPLE__DEV__DATABASE_URL: "legacy-prefixed-db",
};
function request(path = "/example/dev/", token = "test-dev-token", ip = "192.0.2.1", method = "GET", bindings = env) {
  const headers = { Authorization: `Bearer ${token}` };
  if (ip !== null) headers["CF-Connecting-IP"] = ip;
  return worker.fetch(new Request(`https://broker.example${path}`, { method, headers }), bindings);
}

test("returns only the requested JSON's application fields, including intentional empty values", async () => {
  for (const path of ["/example/dev", "/example/dev/"]) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { DATABASE_URL: "dev-db", TRACING_DATABASE_URL: "" });
  }
});
test("rejects dev credentials for another environment or project even on a shared IP", async () => {
  for (const path of ["/example/prod/", "/other/dev/", "/unknown/dev/"]) assert.equal((await request(path)).status, 403);
});
test("each scope uses its own token and IP allowlist", async () => {
  assert.equal((await request("/example/prod/", "test-prod-token")).status, 403);
  const response = await request("/example/prod/", "test-prod-token", "192.0.2.2");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { DATABASE_URL: "prod-db" });
  assert.deepEqual(await (await request("/other/dev/", "test-other-token")).json(), { DATABASE_URL: "other-db" });
});
test("rejects missing or wrong tokens, missing or unlisted IPs, and legacy credentials", async () => {
  for (const token of ["", "wrong", "legacy-token"]) assert.equal((await request("/example/dev/", token)).status, 403);
  for (const ip of [null, "", "192.0.2.10"]) assert.equal((await request("/example/dev/", "test-dev-token", ip)).status, 403);
  assert.equal((await request("/example/dev/", "test-dev-token", "2001:db8::1")).status, 200);
});
test("missing scope or access settings fail closed without global or prefixed fallback", async () => {
  const bindings = { ...env };
  delete bindings.EXAMPLE_DEV;
  assert.equal((await request("/example/dev/", "test-dev-token", "192.0.2.1", "GET", bindings)).status, 403);
  for (const key of ["ACCESS_TOKEN", "ALLOWED_IPS"]) {
    const scope = { ...dev };
    delete scope[key];
    bindings.EXAMPLE_DEV = JSON.stringify(scope);
    assert.equal((await request("/example/dev/", "test-dev-token", "192.0.2.1", "GET", bindings)).status, 403);
  }
});
test("invalid JSON and non-string values fail closed without leaking the supplied content", async () => {
  for (const value of ['{"secret":', 'null', '[]', '"not-object"', '42', JSON.stringify({ ...dev, NESTED: { secret: "sensitive-fixture" } }), JSON.stringify({ ...dev, ALLOWED_IPS: ["192.0.2.1"] })]) {
    const response = await request("/example/dev/", "test-dev-token", "192.0.2.1", "GET", { ...env, EXAMPLE_DEV: value });
    assert.equal(response.status, 403);
    assert.equal(await response.text(), "");
  }
});
test("rejects ambiguous scope names and malformed paths", async () => {
  for (const path of ["/", "/example", "/example/dev//", "/example/dev/key", "/EXAMPLE/dev", "/example/DEV", "/example_dev/x", "/example//dev", "/example/%64ev", "/example-dev/x", "/example/dev-"]) {
    assert.equal((await request(path)).status, 403, path);
  }
});
test("rejects methods other than GET", async () => {
  for (const method of ["POST", "PUT", "DELETE", "HEAD", "OPTIONS"]) assert.equal((await request("/example/dev/", "test-dev-token", "192.0.2.1", method)).status, 405);
});
