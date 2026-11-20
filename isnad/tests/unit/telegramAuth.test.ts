import assert from "node:assert/strict";
import { test } from "node:test";
import { validateTelegramInitData } from "@/lib/telegramAuth";
import { signInitData } from "../helpers/initData";

const TOKEN = "123456:TEST-TOKEN";
const user = { id: 42, first_name: "Amina" };
const now = () => Math.floor(Date.now() / 1000);

test("accepts correctly signed initData and exposes the signed start_param", () => {
  const result = validateTelegramInitData(signInitData(TOKEN, { user, startParam: "cm_abc" }), TOKEN);
  assert.equal(result.valid, true);
  assert.equal(result.user?.id, 42);
  assert.equal(result.startParam, "cm_abc");
});

test("rejects a forged signature", () => {
  const forged = signInitData("999:OTHER", { user });
  assert.deepEqual(validateTelegramInitData(forged, TOKEN), { valid: false, reason: "bad_signature" });
});

test("rejects tampered fields", () => {
  const tampered = signInitData(TOKEN, { user }).replace("Amina", "Mallory");
  assert.equal(validateTelegramInitData(tampered, TOKEN).reason, "bad_signature");
});

test("rejects initData older than the maximum age", () => {
  const stale = signInitData(TOKEN, { user, authDate: now() - 3_601 });
  assert.equal(validateTelegramInitData(stale, TOKEN, 3_600).reason, "expired");
  assert.equal(validateTelegramInitData(stale, TOKEN).valid, true, "default 24h window still accepts it");
});

test("rejects future-dated initData beyond clock skew", () => {
  assert.equal(validateTelegramInitData(signInitData(TOKEN, { user, authDate: now() + 600 }), TOKEN).reason, "future_dated");
  assert.equal(validateTelegramInitData(signInitData(TOKEN, { user, authDate: now() + 30 }), TOKEN).valid, true);
});

test("rejects missing input and missing hash", () => {
  assert.equal(validateTelegramInitData("", TOKEN).reason, "missing_input");
  assert.equal(validateTelegramInitData("auth_date=1", TOKEN).reason, "missing_hash");
});
