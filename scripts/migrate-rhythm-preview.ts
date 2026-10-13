import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { assertRhythmPreviewMigration } from "./rhythm-preview-guard";
async function main() {
  if (process.env.VERCEL_ENV !== "preview") {
    console.log(
      "Automatic preview migration skipped; apply production migrations explicitly.",
    );
    return;
  }
  assertRhythmPreviewMigration();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext('samgad-rhythm-migration'))",
    );
    const organizations = await client.query<{ id: string }>(
      "SELECT id FROM organizations",
    );
    if (
      organizations.rows.length !== 1 ||
      organizations.rows[0].id !== "demo-org"
    )
      throw new Error("Preview migration refuses a non-synthetic workspace");
    const accounts = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM auth_user WHERE email NOT LIKE '%@samgad.example'",
    );
    if (Number(accounts.rows[0].count))
      throw new Error("Preview migration refuses non-synthetic accounts");
    await client.query(
      await readFile("migrations/0002_personal_rhythm.sql", "utf8"),
    );
    console.log(
      "Additive personal-rhythm schema applied to the isolated synthetic preview.",
    );
  } finally {
    await client.query(
      "SELECT pg_advisory_unlock(hashtext('samgad-rhythm-migration'))",
    );
    client.release();
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Synthetic preview migration stopped. Verify the preview/project/database guards; no secrets are logged.",
  );
  process.exitCode = 1;
});
