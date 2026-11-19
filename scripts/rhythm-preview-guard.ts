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

/** Fresh synthetic provisioning is restricted to this exact feature preview branch. */
export function assertFreshRhythmPreview(
  env: Record<string, string | undefined> = process.env,
) {
  assertRhythmPreviewMigration(env);
  if (env.VERCEL_GIT_COMMIT_REF !== "feature/personal-rhythm")
    throw new Error(
      "Fresh provisioning is restricted to the personal-rhythm feature preview",
    );
}
