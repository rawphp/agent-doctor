import { afterEach, describe, expect, it } from "vitest";
import {
  createAdapterRegistry,
  type AdapterRegistry,
} from "../adapters/registry.js";
import { runAgents } from "./agents.js";

afterEach(() => {
  process.exitCode = undefined;
});

describe("runAgents", () => {
  it("prints each registered agent with full|presence support", async () => {
    const lines: string[] = [];
    const registry = createAdapterRegistry();

    const { exitCode, entries } = await runAgents({
      registry,
      stdout: (line) => lines.push(line),
      applyProcessExitCode: false,
    });

    expect(exitCode).toBe(0);
    expect(entries.length).toBeGreaterThanOrEqual(5);

    const byId = Object.fromEntries(
      entries.map((e) => [e.id, e.supportLevel]),
    );
    expect(byId["claude-code"]).toBe("full");
    expect(byId["codex"]).toBe("full");
    expect(byId["grok"]).toBe("full");
    expect(byId["gemini"]).toBe("presence");
    expect(byId["cursor"]).toBe("presence");

    const text = lines.join("\n");
    expect(text).toMatch(/claude-code/);
    expect(text).toMatch(/full/);
    expect(text).toMatch(/gemini/);
    expect(text).toMatch(/presence/);
  });

  it("includes presence limitation note for presence-only adapters", async () => {
    const lines: string[] = [];
    await runAgents({
      registry: createAdapterRegistry(),
      stdout: (line) => lines.push(line),
      applyProcessExitCode: false,
    });

    const text = lines.join("\n");
    // presence-only adapters should surface limited support wording
    expect(text.toLowerCase()).toMatch(/presence/);
  });

  it("accepts an injected registry for custom presence ids", async () => {
    const lines: string[] = [];
    const registry: AdapterRegistry = createAdapterRegistry({
      presenceIds: ["custom-agent"],
    });

    const { entries, exitCode } = await runAgents({
      registry,
      stdout: (line) => lines.push(line),
      applyProcessExitCode: false,
    });

    expect(exitCode).toBe(0);
    expect(entries.find((e) => e.id === "custom-agent")?.supportLevel).toBe(
      "presence",
    );
    expect(lines.join("\n")).toMatch(/custom-agent/);
  });
});
