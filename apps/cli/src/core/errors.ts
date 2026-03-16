import { Data } from "effect";

export class CliUsageError extends Data.TaggedError("CliUsageError")<{
  readonly message: string;
}> {}

export class CliFileReadError extends Data.TaggedError("CliFileReadError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export class CliFileWriteError extends Data.TaggedError("CliFileWriteError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export class CliJsonParseError extends Data.TaggedError("CliJsonParseError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export class CliCanonicalValidationError extends Data.TaggedError("CliCanonicalValidationError")<{
  readonly path: string;
  readonly parseError: unknown;
}> {}

export class CliExportFormatError extends Data.TaggedError("CliExportFormatError")<{
  readonly format: string;
}> {}

export class CliInteractiveValidationError extends Data.TaggedError(
  "CliInteractiveValidationError",
)<{
  readonly message: string;
}> {}

type TaggedErrorLike = {
  readonly _tag?: string;
  readonly [key: string]: unknown;
};

export function formatCliError(error: unknown): string {
  const tagged = asTaggedError(error);

  switch (tagged?._tag) {
    case "CliUsageError":
      return String(tagged.message);
    case "CliFileReadError":
      return `Unable to read file: ${String(tagged.path)}`;
    case "CliFileWriteError":
      return `Unable to write file: ${String(tagged.path)}`;
    case "CliJsonParseError":
      return `Invalid JSON in ${String(tagged.path)}`;
    case "CliCanonicalValidationError":
      return `Canonical return failed validation for ${String(tagged.path)}`;
    case "CliExportFormatError":
      return `Unsupported export format: ${String(tagged.format)}`;
    case "CliInteractiveValidationError":
      return String(tagged.message);
    case "InvalidCanonicalReturnError":
      return "The canonical return did not match the tax-engine schema.";
    case "InvalidCoreEngineInputError":
      return "The canonical return could not be converted into core engine input.";
    case "MissingReferenceDataError":
      return `Missing reference data: ${String(tagged.referenceType)} ${String(tagged.referenceId)}`;
    default:
      if (error instanceof Error && error.message.length > 0) {
        return error.message;
      }

      return "An unexpected CLI error occurred.";
  }
}

function asTaggedError(error: unknown): TaggedErrorLike | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  return error as TaggedErrorLike;
}
