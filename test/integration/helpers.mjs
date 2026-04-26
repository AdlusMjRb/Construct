import fs from "fs";
import path from "path";

export const API = process.env.API_BASE_URL || "http://localhost:3001";

export async function getJson(pathname) {
  const url = `${API}${pathname}`;
  const res = await fetch(url);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Non-JSON response from GET ${pathname} (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  return { status: res.status, body };
}

export async function postJson(pathname, payload) {
  const url = `${API}${pathname}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Non-JSON response from POST ${pathname} (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  return { status: res.status, body };
}

export async function postMultipart(pathname, fields, files = {}) {
  const url = `${API}${pathname}`;
  const form = new FormData();

  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v);
  }
  for (const [fieldName, filepath] of Object.entries(files)) {
    const buf = fs.readFileSync(filepath);
    const blob = new Blob([buf], { type: "image/jpeg" });
    form.append(fieldName, blob, path.basename(filepath));
  }

  const res = await fetch(url, { method: "POST", body: form });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Non-JSON response from POST ${pathname} (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  return { status: res.status, body };
}

export async function assertServerUp() {
  try {
    const { body } = await getJson("/api/health");
    if (!body?.ok) throw new Error("Health check returned non-ok");
  } catch (err) {
    throw new Error(
      `Server not reachable at ${API}. Start it with \`npm start\` first. ` +
        `Underlying error: ${err.message}`,
    );
  }
}

export const TEST_PAYEE = "0xdf6cA46F65159658Ac52736CeBD806C16095B078";
export const SHED_DESCRIPTION =
  "Build a small garden shed: clear the site, pour a concrete slab, " +
  "frame and roof it. Roughly 2.5m by 2m.";
