import { sampleReturnTy2025 } from "@taxzilla/tax-engine";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "./run-cli";

describe("runCli", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const directory of tempDirs) {
      await rm(directory, { force: true, recursive: true });
    }

    tempDirs.length = 0;
  });

  it("validates a federal-only canonical return", async () => {
    const directory = await makeTempDir();
    const inputPath = join(directory, "return.json");
    await writeCanonicalReturn(inputPath, makeFederalOnlyReturn());

    const io = createMemoryIo();
    const exitCode = await runCli(["validate", "--input", inputPath], io.io);

    expect(exitCode).toBe(0);
    expect(io.stderr).toEqual("");
    expect(io.stdout).toContain("Validated federal return");
    expect(io.stdout).toContain("filing status: single");
  });

  it("runs the pipeline and writes selected artifacts", async () => {
    const directory = await makeTempDir();
    const inputPath = join(directory, "return.json");
    const outputDir = join(directory, "out");
    await writeCanonicalReturn(inputPath, makeFederalOnlyReturn());

    const io = createMemoryIo();
    const exitCode = await runCli(
      [
        "run",
        "--input",
        inputPath,
        "--output-dir",
        outputDir,
        "--format",
        "summary-json",
        "--format",
        "line-csv",
        "--format",
        "return-ir-json",
      ],
      io.io,
    );

    expect(exitCode).toBe(0);
    expect(io.stdout).toContain("run wrote 3 artifact(s):");
    expect(await readFile(join(outputDir, "federal-summary.json"), "utf8")).toContain(
      '"adjusted_gross_income": 85045.32',
    );
    expect(await readFile(join(outputDir, "federal-lines.csv"), "utf8")).toContain(
      "1040.line11",
    );
    expect(await readFile(join(outputDir, "return-ir.json"), "utf8")).toContain(
      '"submission_package"',
    );
  });

  it("exports the default machine artifacts", async () => {
    const directory = await makeTempDir();
    const inputPath = join(directory, "return.json");
    const outputDir = join(directory, "exports");
    await writeCanonicalReturn(inputPath, makeFederalOnlyReturn());

    const io = createMemoryIo();
    const exitCode = await runCli(
      ["export", "--input", inputPath, "--output-dir", outputDir],
      io.io,
    );

    expect(exitCode).toBe(0);
    expect(await readFile(join(outputDir, "canonical-return.json"), "utf8")).toContain(
      '"requested_jurisdictions"',
    );
    expect(await readFile(join(outputDir, "export-manifest.json"), "utf8")).toContain(
      '"command": "export"',
    );
    expect(await readFile(join(outputDir, "submission-package.json"), "utf8")).toContain(
      '"submission_mode": "federal_only"',
    );
  });

  it("initializes a starter session directory and can use it as command input", async () => {
    const directory = await makeTempDir();
    const sessionDir = join(directory, "session");
    const io = createMemoryIo();

    const initExitCode = await runCli(
      ["init", "--session-dir", sessionDir, "--filing-status", "head_of_household"],
      io.io,
      {
        cwd: directory,
        now: () => new Date("2026-03-16T12:00:00.000Z"),
        generateReturnId: () => "return_cli_init",
      },
    );

    expect(initExitCode).toBe(0);
    expect(await readFile(join(sessionDir, "canonical-return.json"), "utf8")).toContain(
      '"filing_status": "head_of_household"',
    );

    const validateIo = createMemoryIo();
    const validateExitCode = await runCli(["validate", "--input", sessionDir], validateIo.io);

    expect(validateExitCode).toBe(0);
    expect(validateIo.stdout).toContain("return_cli_init");
  });

  it("writes run artifacts into the session directory when no output dir is provided", async () => {
    const directory = await makeTempDir();
    const sessionDir = join(directory, "session");
    await writeCanonicalReturn(join(sessionDir, "canonical-return.json"), makeFederalOnlyReturn());

    const io = createMemoryIo();
    const exitCode = await runCli(["run", "--input", sessionDir], io.io);

    expect(exitCode).toBe(0);
    expect(await readFile(join(sessionDir, "federal-summary.json"), "utf8")).toContain(
      '"amount_owed": 1158.97',
    );
    expect(await readFile(join(sessionDir, "export-manifest.json"), "utf8")).toContain(
      '"command": "run"',
    );
  });

  it("rejects state-return payloads in federal-only mode", async () => {
    const directory = await makeTempDir();
    const inputPath = join(directory, "return.json");
    await writeCanonicalReturn(inputPath, sampleReturnTy2025);

    const io = createMemoryIo();
    const exitCode = await runCli(["validate", "--input", inputPath], io.io);

    expect(exitCode).toBe(1);
    expect(io.stderr).toContain("State data is not supported");
  });

  async function makeTempDir(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "taxzilla-cli-"));
    tempDirs.push(directory);
    return directory;
  }
});

function createMemoryIo() {
  let stdout = "";
  let stderr = "";

  return {
    io: {
      stdout: (text: string) => {
        stdout += text;
      },
      stderr: (text: string) => {
        stderr += text;
      },
    },
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

async function writeCanonicalReturn(path: string, canonicalReturn: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(canonicalReturn, null, 2)}\n`, "utf8");
}

function makeFederalOnlyReturn() {
  return {
    ...structuredClone(sampleReturnTy2025),
    requested_jurisdictions: {
      federal: true,
      states: [],
    },
    state_returns: {},
  };
}
