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
});
