import { describe, expect, it } from "vitest";

import { parseCliArgs } from "./parse-argv";

describe("parseCliArgs", () => {
  it("defaults to interactive mode without an input path", () => {
    expect(parseCliArgs([])).toEqual({
      command: "tui",
      inputPath: null,
    });
  });

  it("accepts an input path for the interactive shell", () => {
    expect(parseCliArgs(["tui", "--input", "./demo-session"])).toEqual({
      command: "tui",
      inputPath: "./demo-session",
    });
  });

  it("parses requested states for init", () => {
    expect(
      parseCliArgs([
        "init",
        "--session-dir",
        "./demo-session",
        "--filing-status",
        "single",
        "--state",
        "ca",
        "--state",
        "ny,nj",
      ]),
    ).toEqual({
      command: "init",
      outputPath: null,
      sessionDir: "./demo-session",
      filingStatus: "single",
      stateCodes: ["CA", "NY", "NJ"],
      taxYear: 2025,
    });
  });
});
