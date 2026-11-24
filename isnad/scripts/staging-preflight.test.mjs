import assert from "node:assert/strict";
import test from "node:test";
import { validateStagingConfig } from "./staging-preflight.mjs";

const fixture = {
  ISNAD_RELEASE_TARGET:"staging",
  ISNAD_STAGING_BOT_USERNAME:"isnad_qa_test_bot",
  TELEGRAM_BOT_USERNAME:"isnad_qa_test_bot",
  TELEGRAM_BOT_TOKEN:"123456:synthetic-test-token",
  ISNAD_STAGING_ORIGIN:"https://isnad-stage.example.org",
  PUBLIC_BASE_URL:"https://isnad-stage.example.org",
  TELEGRAM_MINI_APP_URL:"https://isnad-stage.example.org/telegram",
  DATABASE_URL:"postgresql://isnad_staging_owner:synthetic-password@staging.example.org/isnad_staging?sslmode=require",
  ISNAD_STAGING_DATABASE_HOST:"staging.example.org",
  TELEGRAM_WEBHOOK_SECRET:"synthetic_webhook_secret_00000000000",
  CRON_SECRET:"synthetic_cron_secret_11111111111111",
  OPENAI_API_KEY:"synthetic-key",
};

test("accepts a distinct explicitly scoped staging target",()=>{
  const result=validateStagingConfig(fixture);
  assert.equal(result.username,"isnad_qa_test_bot");
  assert.equal(result.origin,"https://isnad-stage.example.org");
});
test("blocks wrong targets, bot identities and production site",()=>{
  for(const override of [
    {ISNAD_RELEASE_TARGET:"production"},
    {VERCEL_ENV:"production"},
    {ISNAD_STAGING_BOT_USERNAME:"the_isnad_bot",TELEGRAM_BOT_USERNAME:"the_isnad_bot"},
    {TELEGRAM_BOT_USERNAME:"other_bot"},
    {ISNAD_STAGING_ORIGIN:"https://www.isnadsunnah.site"},
    {ISNAD_STAGING_ORIGIN:"https://isnadsunnah.site"},
    {ISNAD_STAGING_ORIGIN:"http://isnad-stage.example.org"},
    {PUBLIC_BASE_URL:"https://other.example.org"},
    {TELEGRAM_MINI_APP_URL:"https://other.example.org/telegram"},
  ]) assert.throws(()=>validateStagingConfig({...fixture,...override}));
});
test("blocks unapproved host, database, role and disabled TLS",()=>{
  for(const override of [
    {ISNAD_STAGING_DATABASE_HOST:"other.example.org"},
    {DATABASE_URL:"postgresql://isnad_staging_owner:test@staging.example.org/neondb"},
    {DATABASE_URL:"postgresql://other_owner:test@staging.example.org/isnad_staging"},
    {DATABASE_SSL:"disable"},
  ]) assert.throws(()=>validateStagingConfig({...fixture,...override}));
});
test("requires distinct webhook and cron secrets and complete settings",()=>{
  for(const override of [
    {TELEGRAM_WEBHOOK_SECRET:"short"},
    {CRON_SECRET:"short"},
    {CRON_SECRET:fixture.TELEGRAM_WEBHOOK_SECRET},
    {OPENAI_API_KEY:""},
    {TELEGRAM_BOT_TOKEN:""},
  ]) assert.throws(()=>validateStagingConfig({...fixture,...override}));
});
