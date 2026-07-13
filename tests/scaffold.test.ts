import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("package scaffold", () => {
  it("defines name agent-doctor, bin pointing at CLI entry, and script test", () => {
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as {
      name?: string;
      bin?: string | Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(pkg.name).toBe("agent-doctor");
    expect(pkg.scripts?.test).toBeTruthy();

    let binTarget: string | undefined;
    if (typeof pkg.bin === "string") {
      binTarget = pkg.bin;
    } else {
      expect(pkg.bin).toBeDefined();
      expect(pkg.bin).toHaveProperty("agent-doctor");
      binTarget = pkg.bin?.["agent-doctor"];
    }

    expect(binTarget).toBeTruthy();
    // Bin may point at dist/cli.js (build output) or src/cli.ts (dev).
    expect(binTarget).toMatch(/cli\.(js|ts|mjs|cjs)$/);
  });
});

describe("module entry (src/index.ts)", () => {
  it("exists as the library entrypoint", () => {
    expect(existsSync(join(root, "src/index.ts"))).toBe(true);
  });

  it("is importable and exposes package identity", async () => {
    const mod = await import(
      pathToFileURL(join(root, "src/index.ts")).href
    );
    expect(mod).toBeDefined();
    expect(mod.PACKAGE_NAME).toBe("agent-doctor");
  });
});
