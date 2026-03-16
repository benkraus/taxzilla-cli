import { Effect, Either, Schema } from "effect";

import { decodeCanonicalReturnEnvelope, federalModuleCatalogTy2025, statesRegistryTy2025 } from "../blueprint";
import type { FederalModuleCatalogEntry, FormsGraphModuleType, CanonicalReturnEnvelope, StatePluginManifest } from "../blueprint";
import { CoreEngineInputSchema } from "./input";
import { InvalidCanonicalReturnError, InvalidCoreEngineInputError, MissingReferenceDataError } from "./public";
import type { CoreEngineInput } from "./input";
import {
  FEDERAL_FORM_1040_CORE_MODULE_ID,
  FEDERAL_FORM_2441_MODULE_ID,
  FEDERAL_FORM_8812_MODULE_ID,
  FEDERAL_FORM_8863_MODULE_ID,
  FEDERAL_FORM_8889_MODULE_ID,
  FEDERAL_FORM_8949_MODULE_ID,
  FEDERAL_FORM_8959_MODULE_ID,
  FEDERAL_FORM_8960_MODULE_ID,
  FEDERAL_FORM_8962_MODULE_ID,
  FEDERAL_SCHEDULE_1_MODULE_ID,
  FEDERAL_SCHEDULE_2_MODULE_ID,
  FEDERAL_SCHEDULE_3_MODULE_ID,
  FEDERAL_SCHEDULE_A_MODULE_ID,
  FEDERAL_SCHEDULE_B_MODULE_ID,
  FEDERAL_SCHEDULE_C_MODULE_ID,
  FEDERAL_SCHEDULE_D_MODULE_ID,
  FEDERAL_SCHEDULE_E_MODULE_ID,
  FEDERAL_SCHEDULE_SE_MODULE_ID,
} from "./types";
import type { FederalModuleActivationState } from "./types";

function inferFederalModuleType(entry: FederalModuleCatalogEntry): FormsGraphModuleType {
  return entry.form_code.startsWith("Schedule") ? "schedule" : "form";
}

function buildScheduleBNodeId(index: number): string {
  return `input.1099int.${index}.box1`;
}

function buildDividendNodeId(index: number): string {
  return `input.1099div.${index}.box1a`;
}

function buildCapitalTransactionNodeId(index: number): string {
  return `input.8949.${index}.gain_or_loss`;
}

function buildOtherIncomeNodeId(index: number): string {
  return `input.sch1.other_income.${index}.amount`;
}

function buildScheduleEActivityNodeId(index: number): string {
  return `sche.activity.${index}.net`;
}

function buildWageNodeId(index: number): string {
  return `input.w2.${index}.box1`;
}

function findFederalModuleCatalogEntry(
  moduleId: string,
): Effect.Effect<FederalModuleCatalogEntry, MissingReferenceDataError> {
  const entry = federalModuleCatalogTy2025.find((candidate) => candidate.module_id === moduleId);

  if (!entry) {
    return Effect.fail(
      new MissingReferenceDataError({
        referenceType: "federal_module",
        referenceId: moduleId,
      }),
    );
  }

  return Effect.succeed(entry);
}

function findStatePluginManifest(
  stateCode: string,
): Effect.Effect<StatePluginManifest, MissingReferenceDataError> {
  const manifest = statesRegistryTy2025.find((candidate) => candidate.state_code === stateCode);

  if (!manifest) {
    return Effect.fail(
      new MissingReferenceDataError({
        referenceType: "state_manifest",
        referenceId: stateCode,
      }),
    );
  }

  return Effect.succeed(manifest);
}

function fromDecodedEither<A, E, DomainError>(
  decoded: Either.Either<A, E>,
  onLeft: (error: E) => DomainError,
): Effect.Effect<A, DomainError> {
  if (Either.isRight(decoded)) {
    return Effect.succeed(decoded.right);
  }

  return Effect.fail(onLeft(decoded.left));
}

function parseCanonicalReturnEnvelopeEffect(
  input: unknown,
): Effect.Effect<CanonicalReturnEnvelope, InvalidCanonicalReturnError> {
  return fromDecodedEither(decodeCanonicalReturnEnvelope(input), (parseError) => {
    return new InvalidCanonicalReturnError({ parseError });
  });
}

function parseCoreEngineInputEffect(
  input: CanonicalReturnEnvelope,
): Effect.Effect<CoreEngineInput, InvalidCoreEngineInputError> {
  return fromDecodedEither(
    Schema.decodeUnknownEither(CoreEngineInputSchema)(input),
    (parseError) => {
      return new InvalidCoreEngineInputError({ parseError });
    },
  );
}

function buildActiveFederalModuleIds(activations: FederalModuleActivationState): string[] {
  const activeModuleIds = new Set<string>([FEDERAL_FORM_1040_CORE_MODULE_ID]);

  if (activations.schedule1Activated) {
    activeModuleIds.add(FEDERAL_SCHEDULE_1_MODULE_ID);
  }

  if (activations.schedule2Activated) {
    activeModuleIds.add(FEDERAL_SCHEDULE_2_MODULE_ID);
  }

  if (activations.schedule3Activated) {
    activeModuleIds.add(FEDERAL_SCHEDULE_3_MODULE_ID);
  }

  if (activations.scheduleAActivated) {
    activeModuleIds.add(FEDERAL_SCHEDULE_A_MODULE_ID);
  }

  if (activations.scheduleBActivated) {
    activeModuleIds.add(FEDERAL_SCHEDULE_B_MODULE_ID);
  }

  if (activations.scheduleCActivated) {
    activeModuleIds.add(FEDERAL_SCHEDULE_C_MODULE_ID);
  }

  if (activations.scheduleDActivated) {
    activeModuleIds.add(FEDERAL_SCHEDULE_D_MODULE_ID);
  }

  if (activations.scheduleEActivated) {
    activeModuleIds.add(FEDERAL_SCHEDULE_E_MODULE_ID);
  }

  if (activations.scheduleSEActivated) {
    activeModuleIds.add(FEDERAL_SCHEDULE_SE_MODULE_ID);
  }

  if (activations.form2441Activated) {
    activeModuleIds.add(FEDERAL_FORM_2441_MODULE_ID);
  }

  if (activations.form8812Activated) {
    activeModuleIds.add(FEDERAL_FORM_8812_MODULE_ID);
  }

  if (activations.form8863Activated) {
    activeModuleIds.add(FEDERAL_FORM_8863_MODULE_ID);
  }

  if (activations.form8889Activated) {
    activeModuleIds.add(FEDERAL_FORM_8889_MODULE_ID);
  }

  if (activations.form8949Activated) {
    activeModuleIds.add(FEDERAL_FORM_8949_MODULE_ID);
  }

  if (activations.form8959Activated) {
    activeModuleIds.add(FEDERAL_FORM_8959_MODULE_ID);
  }

  if (activations.form8960Activated) {
    activeModuleIds.add(FEDERAL_FORM_8960_MODULE_ID);
  }

  if (activations.form8962Activated) {
    activeModuleIds.add(FEDERAL_FORM_8962_MODULE_ID);
  }

  return federalModuleCatalogTy2025
    .filter((entry) => activeModuleIds.has(entry.module_id))
    .map((entry) => entry.module_id);
}

export {
  buildActiveFederalModuleIds,
  buildCapitalTransactionNodeId,
  buildDividendNodeId,
  buildOtherIncomeNodeId,
  buildScheduleBNodeId,
  buildScheduleEActivityNodeId,
  buildWageNodeId,
  findFederalModuleCatalogEntry,
  findStatePluginManifest,
  fromDecodedEither,
  inferFederalModuleType,
  parseCanonicalReturnEnvelopeEffect,
  parseCoreEngineInputEffect,
};
