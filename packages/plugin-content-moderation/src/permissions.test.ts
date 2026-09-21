import { describe, expect, test } from "bun:test";
import { contentModerationPlugin } from "./index";

describe("content moderation plugin permissions", () => {
  test("declares only the permissions the validator actually uses", () => {
    expect(contentModerationPlugin.permissions?.required).toEqual([
      "db:read",
      "config:read",
      "tenant:data",
    ]);
    expect(contentModerationPlugin.permissions?.required).not.toContain("events:listen");
  });
});
