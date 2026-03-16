import type { CanonicalReturnEnvelope } from "@taxzilla/tax-engine";
import {
  evaluateTy2025CoreEnginePipeline,
  type Ty2025CoreEnginePipelineResult,
} from "@taxzilla/tax-engine/return-ir";
import { Effect } from "effect";

import { loadCanonicalReturnFromFile } from "./canonical-return";
import { asArray, asRecord, asString } from "./object";
import { resolveCanonicalInput, type ResolvedCanonicalInput } from "./session-store";

export type ValidatedCanonicalReturn = {
  readonly canonicalReturn: CanonicalReturnEnvelope;
  readonly input: ResolvedCanonicalInput;
  readonly summary: {
    readonly returnId: string;
    readonly taxYear: number;
    readonly filingStatus: string | null;
    readonly sourceDocumentCount: number;
  };
};

export type PipelineExecution = {
  readonly canonicalReturn: CanonicalReturnEnvelope;
  readonly input: ResolvedCanonicalInput;
  readonly pipelineResult: Ty2025CoreEnginePipelineResult;
};

export async function validateCanonicalReturnPath(path: string): Promise<ValidatedCanonicalReturn> {
  const input = await resolveCanonicalInput(path);
  const canonicalReturn = await loadCanonicalReturnFromFile(input.canonicalPath);

  return {
    canonicalReturn,
    input,
    summary: {
      returnId: canonicalReturn.return_id,
      taxYear: canonicalReturn.tax_year,
      filingStatus: asString(asRecord(canonicalReturn.household)?.filing_status),
      sourceDocumentCount: asArray(canonicalReturn.source_documents).length,
    },
  };
}

export async function runPipelineForPath(path: string): Promise<PipelineExecution> {
  const input = await resolveCanonicalInput(path);
  const canonicalReturn = await loadCanonicalReturnFromFile(input.canonicalPath);
  const pipelineResult = await Effect.runPromise(evaluateTy2025CoreEnginePipeline(canonicalReturn));

  return {
    canonicalReturn,
    input,
    pipelineResult,
  };
}
