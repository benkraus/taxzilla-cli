import { parseArgs } from "node:util";

import { CliUsageError } from "../core/errors";
import {
  type CliCommandName,
  isCliExportFormat,
  type CliExportFormat,
  isSupportedFilingStatus,
  type SupportedFilingStatus,
} from "../core/types";

export type ParsedCliCommand =
  | { readonly command: "tui"; readonly inputPath: string | null }
  | { readonly command: "help" }
  | {
      readonly command: "init";
      readonly outputPath: string | null;
      readonly sessionDir: string | null;
      readonly filingStatus: SupportedFilingStatus;
      readonly taxYear: 2025;
    }
  | { readonly command: "validate"; readonly input: string; readonly json: boolean }
  | {
      readonly command: "run";
      readonly input: string;
      readonly outputDir: string | null;
      readonly formats: ReadonlyArray<CliExportFormat>;
    }
  | {
      readonly command: "export";
      readonly input: string;
      readonly outputDir: string | null;
      readonly formats: ReadonlyArray<CliExportFormat>;
    };

export function parseCliArgs(argv: ReadonlyArray<string>): ParsedCliCommand {
  const parsed = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      input: { type: "string", short: "i" },
      "output-dir": { type: "string", short: "o" },
      output: { type: "string" },
      "session-dir": { type: "string" },
      format: { type: "string", short: "f", multiple: true },
      "filing-status": { type: "string" },
      "tax-year": { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });

  const command = normalizeCommand(parsed.positionals[0], parsed.values.help);
  const formats = parseFormats(parsed.values.format ?? []);

  switch (command) {
    case "tui":
      return {
        command,
        inputPath: parsed.values.input ?? null,
      };
    case "help":
      return { command };
    case "init":
      validateInitDestination(parsed.values.output, parsed.values["session-dir"]);
      return {
        command,
        outputPath: parsed.values.output ?? null,
        sessionDir: parsed.values["session-dir"] ?? null,
        filingStatus: parseFilingStatus(parsed.values["filing-status"]),
        taxYear: parseTaxYear(parsed.values["tax-year"]),
      };
    case "validate":
      return {
        command,
        input: requireInput(parsed.values.input, command),
        json: parsed.values.json ?? false,
      };
    case "run":
    case "export":
      return {
        command,
        input: requireInput(parsed.values.input, command),
        outputDir: parsed.values["output-dir"] ?? null,
        formats,
      };
    default:
      throw new CliUsageError({
        message: `Unsupported command: ${command satisfies never}`,
      });
  }
}

function normalizeCommand(rawCommand: string | undefined, help: boolean | undefined): CliCommandName {
  if (help) {
    return "help";
  }

  switch (rawCommand) {
    case undefined:
    case "tui":
      return "tui";
    case "help":
    case "init":
    case "validate":
    case "run":
    case "export":
      return rawCommand;
    default:
      throw new CliUsageError({
        message: `Unknown command: ${rawCommand}`,
      });
  }
}

function requireInput(input: string | undefined, command: "validate" | "run" | "export"): string {
  if (input == null || input.length === 0) {
    throw new CliUsageError({
      message: `Missing required --input for \`${command}\`.`,
    });
  }

  return input;
}

function parseFormats(rawFormats: ReadonlyArray<string>): ReadonlyArray<CliExportFormat> {
  const formats: CliExportFormat[] = [];

  for (const format of rawFormats) {
    if (!isCliExportFormat(format)) {
      throw new CliUsageError({
        message: `Unknown format: ${format}`,
      });
    }

    formats.push(format);
  }

  return formats;
}

function parseFilingStatus(rawFilingStatus: string | undefined): SupportedFilingStatus {
  const filingStatus = rawFilingStatus ?? "single";

  if (!isSupportedFilingStatus(filingStatus)) {
    throw new CliUsageError({
      message: `Unknown filing status: ${filingStatus}`,
    });
  }

  return filingStatus;
}

function parseTaxYear(rawTaxYear: string | undefined): 2025 {
  const taxYear = Number.parseInt(rawTaxYear ?? "2025", 10);

  if (!Number.isInteger(taxYear) || taxYear !== 2025) {
    throw new CliUsageError({
      message: "Only TY2025 is supported by the CLI right now.",
    });
  }

  return 2025;
}

function validateInitDestination(outputPath: string | undefined, sessionDir: string | undefined): void {
  if (outputPath != null && sessionDir != null) {
    throw new CliUsageError({
      message: "Use either --output or --session-dir for `init`, not both.",
    });
  }
}
