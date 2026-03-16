import type { FormsGraphNode } from "@taxzilla/tax-engine";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { CliExportFormatError, CliFileWriteError } from "./errors";
import { asString } from "./object";
import type { CliArtifact, CliExportFormat, CliExportPayload } from "./types";

export function renderArtifact(format: CliExportFormat, payload: CliExportPayload): string {
  switch (format) {
    case "summary-json":
      return `${JSON.stringify(buildSummaryJson(payload), null, 2)}\n`;
    case "line-csv":
      return renderLineCsv(payload);
    case "canonical-json":
      return `${JSON.stringify(payload.canonicalReturn, null, 2)}\n`;
    case "return-ir-json":
      return `${JSON.stringify(payload.pipelineResult.return_ir, null, 2)}\n`;
    case "package-json":
      return `${JSON.stringify(payload.pipelineResult.return_ir.submission_package, null, 2)}\n`;
    default:
      throw new CliExportFormatError({
        format,
      });
  }
}

export async function writeArtifacts(options: {
  readonly outputDir: string;
  readonly formats: ReadonlyArray<CliExportFormat>;
  readonly payload: CliExportPayload;
}): Promise<ReadonlyArray<CliArtifact>> {
  try {
    await mkdir(options.outputDir, { recursive: true });
  } catch (cause) {
    throw new CliFileWriteError({
      path: options.outputDir,
      cause,
    });
  }

  const written: CliArtifact[] = [];

  for (const format of options.formats) {
    const fileName = artifactFileName(format);
    const path = join(options.outputDir, fileName);
    const content = renderArtifact(format, options.payload);

    try {
      await writeFile(path, content, "utf8");
    } catch (cause) {
      throw new CliFileWriteError({
        path,
        cause,
      });
    }

    written.push({
      format,
      fileName,
      path,
    });
  }

  return written;
}

export function artifactFileName(format: CliExportFormat): string {
  switch (format) {
    case "summary-json":
      return "federal-summary.json";
    case "line-csv":
      return "federal-lines.csv";
    case "canonical-json":
      return "canonical-return.json";
    case "return-ir-json":
      return "return-ir.json";
    case "package-json":
      return "submission-package.json";
    default:
      throw new CliExportFormatError({
        format,
      });
  }
}

function buildSummaryJson(payload: CliExportPayload) {
  const federalReturn = payload.pipelineResult.return_ir.federal_return;
  const federalSummary = payload.pipelineResult.core_engine.federal_summary;

  return {
    return_id: payload.canonicalReturn.return_id,
    tax_year: payload.canonicalReturn.tax_year,
    filing_status: federalReturn.filing_status,
    activated_module_ids: payload.pipelineResult.core_engine.activated_module_ids,
    forms: federalReturn.forms.map((form) => form.form_code),
    schedules: federalReturn.schedules.map((form) => form.form_code),
    summary: {
      adjusted_gross_income: federalSummary.line11_adjusted_gross_income,
      taxable_income: federalSummary.line15_taxable_income,
      total_tax: federalSummary.line24_total_tax,
      total_payments: federalSummary.line33_total_payments,
      refund_amount: federalSummary.line34_refund_amount,
      amount_owed: federalSummary.line37_amount_owed,
    },
  };
}

function renderLineCsv(payload: CliExportPayload): string {
  const headers = [
    "jurisdiction",
    "module_id",
    "form_code",
    "line_code",
    "node_id",
    "label",
    "value",
    "data_type",
    "source_json_pointers",
  ];
  const rows = payload.pipelineResult.core_engine.graph.nodes
    .filter((node) => node.jurisdiction === "federal")
    .map((node) => nodeToCsvRow(node));

  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n").concat("\n");
}

function nodeToCsvRow(node: FormsGraphNode): string[] {
  return [
    node.jurisdiction,
    node.module_id,
    asString(node.form_code) ?? "",
    asString(node.line_code) ?? "",
    node.node_id,
    node.label,
    node.value == null ? "" : JSON.stringify(node.value),
    node.data_type,
    (node.source_json_pointers ?? []).join(";"),
  ];
}

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}
