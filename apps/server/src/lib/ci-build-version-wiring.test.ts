import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../../../../.github/workflows/docker-image.yml", import.meta.url), "utf8");

describe("CAMPUX_BUILD_VERSION workflow expansion", () => {
  test("does not pass unexpanded Bash substring to with.build-args", () => {
    expect(workflow).not.toContain("CAMPUX_BUILD_VERSION=sha-${GITHUB_SHA::12}");
  });

  test("computes a concrete build version in a shell step", () => {
    expect(workflow).toContain('echo "campux_build_version=sha-${short_sha}" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain("CAMPUX_BUILD_VERSION=${{ steps.ghcr_tags.outputs.campux_build_version }}");
  });
});
