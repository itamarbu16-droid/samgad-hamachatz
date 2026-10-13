import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { assertRhythmPreviewMigration } from "./rhythm-preview-guard";
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
    if (Number(accounts.rows[0].count))
      throw new Error("Preview migration refuses non-synthetic accounts");
    stage = "schema-migration";
    await client.query(
      await readFile("migrations/0002_personal_rhythm.sql", "utf8"),
    );
    console.log(
      "Additive personal-rhythm schema applied to the isolated synthetic preview.",
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
main().catch((error: unknown) => {
  console.error(
    "Synthetic preview migration stopped. Verify the preview/project/database guards; no secrets are logged.",
  );
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  console.error("Preview migration failure stage", { stage, code: /^[A-Z0-9]{5}$/.test(code) || ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT"].includes(code) ? code : "unavailable" });
  process.exitCode = 1;
});
