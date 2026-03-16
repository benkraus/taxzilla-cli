import { createStarterReturn } from "../core/canonical-return";
import { formatCliError, CliUsageError } from "../core/errors";
import {
  defaultExportFormats,
  defaultRunExportFormats,
  type CliArtifact,
  type CliExportFormat,
} from "../core/types";
import { renderArtifact, writeArtifacts } from "../core/exporters";
import { runPipelineForPath, validateCanonicalReturnPath } from "../core/run-pipeline";
import { formatRequestedStateCodes } from "../core/state-support";
import {
  buildDefaultSessionDir,
  canonicalReturnFileName,
  writeExportManifest,
  writeJsonFile,
} from "../core/session-store";
import { defaultRuntime, type CliRuntime } from "../core/runtime";
import { parseCliArgs } from "./parse-argv";
import { join } from "node:path";

export type CliIo = {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
};

export async function runCli(
  argv: ReadonlyArray<string>,
  io: CliIo = defaultIo,
  runtime: CliRuntime = defaultRuntime,
): Promise<number> {
  try {
    const command = parseCliArgs(argv);

    switch (command.command) {
      case "tui":
        return await launchInteractiveHome({
          initialInputPath: command.inputPath,
          runtime,
        });
      case "help":
        io.stdout(`${renderHelpText()}\n`);
        return 0;
      case "init":
        return await handleInit(command, io, runtime);
      case "validate":
        return await handleValidate(command, io);
      case "run":
        return await handleRun(command, io, runtime);
      case "export":
        return await handleExport(command, io, runtime);
      default:
        throw new CliUsageError({
          message: `Unhandled command: ${command satisfies never}`,
        });
    }
  } catch (error) {
    io.stderr(`${formatCliError(error)}\n`);
    return 1;
  }
}

async function handleValidate(
  command: Extract<ReturnType<typeof parseCliArgs>, { command: "validate" }>,
  io: CliIo,
): Promise<number> {
  const result = await validateCanonicalReturnPath(command.input);

  if (command.json) {
    io.stdout(`${JSON.stringify(result.summary, null, 2)}\n`);
    return 0;
  }

  io.stdout(
    [
      `Validated return ${result.summary.returnId}`,
      `tax year: ${result.summary.taxYear}`,
      `filing status: ${result.summary.filingStatus ?? "unknown"}`,
      `source documents: ${result.summary.sourceDocumentCount}`,
      `requested states: ${formatRequestedStateCodes(result.summary.requestedStates)}`,
      `state return payloads: ${result.summary.stateReturnCount}`,
    ].join("\n") + "\n",
  );
  return 0;
}

async function handleInit(
  command: Extract<ReturnType<typeof parseCliArgs>, { command: "init" }>,
  io: CliIo,
  runtime: CliRuntime,
): Promise<number> {
  const returnId = runtime.generateReturnId();
  const createdAt = runtime.now().toISOString();
  const canonicalReturn = createStarterReturn({
    returnId,
    taxYear: command.taxYear,
    filingStatus: command.filingStatus,
    createdAt,
    requestedStateCodes: command.stateCodes,
  });
  const sessionDir = command.outputPath == null
    ? (command.sessionDir ?? buildDefaultSessionDir(runtime.cwd, returnId))
    : null;
  const canonicalPath = command.outputPath ?? join(sessionDir!, canonicalReturnFileName);

  await writeJsonFile(canonicalPath, canonicalReturn);

  const lines = [
    `Initialized return ${returnId}`,
    `canonical return: ${canonicalPath}`,
    `requested states: ${formatRequestedStateCodes(canonicalReturn.requested_jurisdictions.states)}`,
  ];

  if (sessionDir != null) {
    lines.push(`session directory: ${sessionDir}`);
  }

  io.stdout(`${lines.join("\n")}\n`);
  return 0;
}

async function handleRun(
  command: Extract<ReturnType<typeof parseCliArgs>, { command: "run" }>,
  io: CliIo,
  runtime: CliRuntime,
): Promise<number> {
  const result = await runPipelineForPath(command.input);
  const formats = resolveFormats(command.formats, defaultRunExportFormats);

  return outputArtifacts({
    commandName: "run",
    formats,
    outputDir: command.outputDir,
    io,
    result,
    runtime,
  });
}

async function handleExport(
  command: Extract<ReturnType<typeof parseCliArgs>, { command: "export" }>,
  io: CliIo,
  runtime: CliRuntime,
): Promise<number> {
  const result = await runPipelineForPath(command.input);
  const formats = resolveFormats(command.formats, defaultExportFormats);

  return outputArtifacts({
    commandName: "export",
    formats,
    outputDir: command.outputDir,
    io,
    result,
    runtime,
  });
}

async function outputArtifacts(options: {
  readonly commandName: "run" | "export";
  readonly formats: ReadonlyArray<CliExportFormat>;
  readonly outputDir: string | null;
  readonly io: CliIo;
  readonly result: Awaited<ReturnType<typeof runPipelineForPath>>;
  readonly runtime: CliRuntime;
}): Promise<number> {
  const resolvedOutputDir = options.outputDir ?? options.result.input.sessionDir;

  if (resolvedOutputDir == null) {
    if (options.formats.length !== 1) {
      throw new CliUsageError({
        message: `\`${options.commandName}\` needs --output-dir when multiple formats are requested.`,
      });
    }
    const [format] = options.formats;

    if (format == null) {
      throw new CliUsageError({
        message: `\`${options.commandName}\` expected exactly one format.`,
      });
    }

    options.io.stdout(
      renderArtifact(format, {
        canonicalReturn: options.result.canonicalReturn,
        pipelineResult: options.result.pipelineResult,
      }),
    );
    return 0;
  }

  const written = await writeArtifacts({
    outputDir: resolvedOutputDir,
    formats: options.formats,
    payload: {
      canonicalReturn: options.result.canonicalReturn,
      pipelineResult: options.result.pipelineResult,
    },
  });
  const manifestPath = await writeExportManifest({
    outputDir: resolvedOutputDir,
    commandName: options.commandName,
    generatedAt: options.runtime.now().toISOString(),
    returnId: options.result.canonicalReturn.return_id,
    taxYear: options.result.canonicalReturn.tax_year,
    canonicalPath: options.result.input.canonicalPath,
    artifacts: written,
  });

  options.io.stdout(formatWrittenArtifacts(options.commandName, written, manifestPath));
  return 0;
}

function resolveFormats(
  formats: ReadonlyArray<CliExportFormat>,
  defaults: ReadonlyArray<CliExportFormat>,
): ReadonlyArray<CliExportFormat> {
  return formats.length > 0 ? formats : defaults;
}

function formatWrittenArtifacts(
  commandName: "run" | "export",
  written: ReadonlyArray<CliArtifact>,
  manifestPath: string,
): string {
  const lines = [`${commandName} wrote ${written.length} artifact(s):`];

  for (const artifact of written) {
    lines.push(`- ${artifact.format}: ${artifact.path}`);
  }
  lines.push(`- export-manifest: ${manifestPath}`);

  return `${lines.join("\n")}\n`;
}

function renderHelpText(): string {
  return [
    "TaxZilla CLI",
    "",
    "Commands:",
    "  taxzilla tui [--input <path>]",
    "  taxzilla init [--session-dir <dir> | --output <file>] [--filing-status <status>] [--state <code> ...] [--tax-year 2025]",
    "  taxzilla validate --input <path> [--json]",
    "  taxzilla run --input <path> [--output-dir <dir>] [--format <format> ...]",
    "  taxzilla export --input <path> [--output-dir <dir>] [--format <format> ...]",
    "",
    "Formats:",
    "  summary-json",
    "  line-csv",
    "  canonical-json",
    "  return-ir-json",
    "  package-json",
    "",
    "Repeat --state or pass comma-separated USPS state codes to seed state filing payloads.",
    "Input paths can point to either a canonical JSON file or a session directory.",
  ].join("\n");
}

const defaultIo: CliIo = {
  stdout: (text) => {
    process.stdout.write(text);
  },
  stderr: (text) => {
    process.stderr.write(text);
  },
};

async function launchInteractiveHome(options: {
  readonly initialInputPath: string | null;
  readonly runtime: CliRuntime;
}): Promise<number> {
  const interactive = await import("../app/launch-interactive.tsx");
  return interactive.launchInteractiveHome(options);
}
