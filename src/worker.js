// Each project/environment is one encrypted JSON secret.
const ACCESS_SETTINGS = ["ACCESS_TOKEN", "ALLOWED_IPS"];
const SCOPE_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789";

function scopeName(pathname) {
  const path = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const parts = path.split("/");
  if (parts.length !== 3 || parts[0] !== "") return null;
  const scope = parts.slice(1);
  if (scope.some((part) => !part || [...part].some((character) => !SCOPE_CHARACTERS.includes(character)))) return null;
  return scope.join("_").toUpperCase();
}

async function sameText(left, right) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([left, right].map((text) => crypto.subtle.digest("SHA-256", encoder.encode(text))));
  return crypto.subtle.timingSafeEqual(a, b);
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET") return new Response(null, { status: 405 });
    const name = scopeName(new URL(request.url).pathname);
    if (!name || typeof env[name] !== "string") return new Response(null, { status: 403 });
    let scope;
    try {
      scope = JSON.parse(env[name]);
    } catch {
      return new Response(null, { status: 403 });
    }
    if (!scope || Array.isArray(scope) || typeof scope !== "object" ||
        Object.values(scope).some((value) => typeof value !== "string")) {
      return new Response(null, { status: 403 });
    }
    const token = scope.ACCESS_TOKEN;
    const allowed = (scope.ALLOWED_IPS || "").split(",").map((ip) => ip.trim()).filter(Boolean);
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const authorization = request.headers.get("Authorization") || "";
    if (!token || !allowed.includes(ip) || !(await sameText(authorization, `Bearer ${token}`))) {
      return new Response(null, { status: 403 });
    }
    const values = Object.fromEntries(Object.entries(scope).filter(([key]) => !ACCESS_SETTINGS.includes(key)));
    return Response.json(values, { headers: { "Cache-Control": "no-store" } });
  },
};
