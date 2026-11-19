import { describe, it, expect } from "vitest";
import {
  assertRhythmPreviewMigration,
  assertFreshRhythmPreview,
} from "../scripts/rhythm-preview-guard";
import { PREVIEW_PROJECT_ID } from "../scripts/preview-guard";
const valid = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_PROJECT_ID: PREVIEW_PROJECT_ID,
  DEMO_MODE: "true",
  PGHOST: "ep-synthetic-test.eu-central-1.aws.neon.tech",
  DATABASE_URL:
    "postgresql://synthetic:synthetic@ep-synthetic-test.eu-central-1.aws.neon.tech/preview?sslmode=require",
};
describe("additive preview migration guard", () => {
  it("accepts only the exact synthetic project and integration host", () =>
    expect(() => assertRhythmPreviewMigration(valid)).not.toThrow());
  it.each([
    { VERCEL_ENV: "production" },
    { DEMO_MODE: "false" },
    { VERCEL_PROJECT_ID: "unrelated-project" },
    { PGHOST: "unrelated.neon.tech" },
    {
      DATABASE_URL:
        "postgresql://synthetic:synthetic@ep-synthetic-test.eu-central-1.aws.neon.tech/preview",
    },
  ])("rejects unsafe targets %o", (patch) =>
    expect(() =>
      assertRhythmPreviewMigration({ ...valid, ...patch }),
    ).toThrow(),
  );
});

describe("fresh feature preview provisioning", () => {
  it("requires the exact feature branch in addition to the preview project guards", () => {
    expect(() =>
      assertFreshRhythmPreview({
        ...valid,
        VERCEL_GIT_COMMIT_REF: "feature/personal-rhythm",
      }),
    ).not.toThrow();
    expect(() =>
      assertFreshRhythmPreview({ ...valid, VERCEL_GIT_COMMIT_REF: "main" }),
    ).toThrow();
    expect(() =>
      assertFreshRhythmPreview({
        ...valid,
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "feature/personal-rhythm",
      }),
    ).toThrow();
  });
});
