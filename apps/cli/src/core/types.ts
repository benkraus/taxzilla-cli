import type { CanonicalReturnEnvelope } from "@taxzilla/tax-engine";
import type { Ty2025CoreEnginePipelineResult } from "@taxzilla/tax-engine/return-ir";

export const cliExportFormats = [
  "summary-json",
  "line-csv",
  "canonical-json",
  "return-ir-json",
  "package-json",
] as const;

export type CliExportFormat = (typeof cliExportFormats)[number];

export const defaultRunExportFormats: ReadonlyArray<CliExportFormat> = [
  "summary-json",
  "line-csv",
  "return-ir-json",
];

export const defaultExportFormats: ReadonlyArray<CliExportFormat> = [
  "canonical-json",
  "summary-json",
  "line-csv",
  "return-ir-json",
  "package-json",
];

export type CliCommandName = "tui" | "help" | "init" | "validate" | "run" | "export";

export const supportedFilingStatuses = [
  "single",
  "married_filing_jointly",
  "married_filing_separately",
  "head_of_household",
  "qualifying_surviving_spouse",
] as const;

export type SupportedFilingStatus = (typeof supportedFilingStatuses)[number];

export type CliArtifact = {
  readonly format: CliExportFormat;
  readonly fileName: string;
  readonly path: string;
};

export type CliExportPayload = {
  readonly canonicalReturn: CanonicalReturnEnvelope;
  readonly pipelineResult: Ty2025CoreEnginePipelineResult;
};

export function isCliExportFormat(value: string): value is CliExportFormat {
  return cliExportFormats.includes(value as CliExportFormat);
}

export function isSupportedFilingStatus(value: string): value is SupportedFilingStatus {
  return supportedFilingStatuses.includes(value as SupportedFilingStatus);
}
