import { test } from "node:test";
import assert from "node:assert/strict";
import { getJson } from "./helpers.mjs";

test("GET /api/health — returns ok with network info", async () => {
  const { status, body } = await getJson("/api/health");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, "construct-backend");
  assert.equal(body.network.chainId, 16602);
  assert.equal(body.network.name, "0G Galileo Testnet");
});
