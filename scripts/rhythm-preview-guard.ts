import { PREVIEW_PROJECT_ID } from "./preview-guard";
/** Additive migration only in the existing project's isolated synthetic preview. */
export function assertRhythmPreviewMigration(
  env: Record<string, string | undefined> = process.env,
) {
  if (
    env.VERCEL !== "1" ||
    env.VERCEL_ENV !== "preview" ||
    env.VERCEL_PROJECT_ID !== PREVIEW_PROJECT_ID ||
    env.DEMO_MODE !== "true"
  )
    throw new Error(
      "Only the approved synthetic Vercel preview may apply this migration automatically",
    );
  if (!env.DATABASE_URL || !env.PGHOST)
    throw new Error("An exact preview database host is required");
  const database = new URL(env.DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    database.hostname !== env.PGHOST ||
    !database.hostname.endsWith(".neon.tech") ||
    !["require", "verify-ca", "verify-full"].includes(
      database.searchParams.get("sslmode") || "",
    )
  )
    throw new Error(
      "The preview migration requires the exact Neon integration host with TLS",
    );
}
