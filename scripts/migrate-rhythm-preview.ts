import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { appUrl } from "../src/server/app-url";
import { connection, closeDb } from "../src/server/db";
import {
  seedHostedPreview,
  refreshHostedPreviewRoles,
} from "../src/server/seed";
import {
  assertRhythmPreviewMigration,
  assertFreshRhythmPreview,
} from "./rhythm-preview-guard";
let stage = "configuration";
async function main() {
  if (process.env.VERCEL_ENV !== "preview") {
    console.log(
      "Automatic preview migration skipped; apply production migrations explicitly.",
    );
    return;
  }
  assertRhythmPreviewMigration();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  stage = "database-connect";
  const client = await pool.connect();
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext('samgad-rhythm-migration'))",
    );
    stage = "schema-preflight";
    const existing = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM pg_catalog.pg_tables WHERE schemaname = 'public'",
    );
    if (Number(existing.rows[0].count) === 0) {
      // Neon creates a fresh isolated database for a new Git preview branch.
      // This exact feature branch may provision only synthetic accounts in it.
      assertFreshRhythmPreview();
      process.env.ALLOW_HOSTED_PREVIEW_SEED = "true";
      process.env.APP_ENV = "preview";
      process.env.BETTER_AUTH_URL = appUrl();
      stage = "fresh-preview-schema";
      await (await connection()).migrate();
      stage = "fresh-preview-synthetic-accounts";
      await seedHostedPreview();
      await closeDb();
      console.log(
        "Fresh isolated feature preview provisioned with synthetic accounts only.",
      );
      return;
    }
    stage = "organization-check";
    const organizations = await client.query<{ id: string }>(
      "SELECT id FROM organizations",
    );
    if (
      organizations.rows.length !== 1 ||
      organizations.rows[0].id !== "demo-org"
    )
      throw new Error("Preview migration refuses a non-synthetic workspace");
    stage = "account-check";
    const accounts = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM auth_user WHERE email NOT LIKE '%@samgad.example'",
    );
    if (Number(accounts.rows[0].count)) {
      // Only the workspace owner's explicit email grants may add real accounts to this preview.
      const tracked=await client.query<{exists:boolean}>("SELECT to_regclass('public.workspace_access_grants') IS NOT NULL AS exists");
      if(!tracked.rows[0].exists)throw new Error("Preview migration refuses untracked non-synthetic accounts");
      const unexpected=await client.query<{count:string}>("SELECT count(*)::text AS count FROM auth_user u WHERE u.email NOT LIKE '%@samgad.example' AND NOT EXISTS(SELECT 1 FROM workspace_access_grants g JOIN workspace_settings w ON w.organization_id=g.organization_id AND w.owner_id=g.granted_by WHERE g.user_id=u.id AND g.organization_id='demo-org')");
      if(Number(unexpected.rows[0].count))throw new Error("Preview migration refuses untracked non-synthetic accounts");
    }
    stage = "schema-migration";
    await client.query(
      [
        await readFile("migrations/0002_personal_rhythm.sql", "utf8"),
        await readFile("migrations/0003_document_library.sql", "utf8"),
        await readFile("migrations/0004_completion_review.sql", "utf8"),
        await readFile("migrations/0005_quick_tasks.sql", "utf8"),
        await readFile("migrations/0006_access_and_domains.sql", "utf8"),
        await readFile("migrations/0007_task_actions_calendar.sql", "utf8"),
        await readFile("migrations/0008_large_document_uploads.sql", "utf8"),
        await readFile("migrations/0009_deadline_requests_push_archive.sql", "utf8"),
      ].join("\n"),
    );
    stage = "role-label-refresh";
    process.env.ALLOW_HOSTED_PREVIEW_SEED = "true";
    process.env.APP_ENV = "preview";
    process.env.BETTER_AUTH_URL = appUrl();
    await refreshHostedPreviewRoles();
    await closeDb();
    console.log(
      "Additive personal-rhythm and document-library schema applied to the isolated synthetic preview.",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.query(
      "SELECT pg_advisory_unlock(hashtext('samgad-rhythm-migration'))",
    );
    client.release();
    await pool.end();
  }
}
main()
  .catch((error: unknown) => {
    console.error(
      "Synthetic preview migration stopped. Verify the preview/project/database guards; no secrets are logged.",
    );
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    console.error("Preview migration failure stage", {
      stage,
      code:
        /^[A-Z0-9]{5}$/.test(code) ||
        ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT"].includes(code)
          ? code
          : "unavailable",
    });
    process.exitCode = 1;
  })
  .finally(closeDb);
