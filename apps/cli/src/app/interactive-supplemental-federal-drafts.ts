import type { CanonicalReturnEnvelope } from "@taxzilla/tax-engine";

import { CliInteractiveValidationError } from "../core/errors";
import { asArray, asRecord, asString } from "../core/object";

const structuredDocumentTypes = new Set([
  "FORM_W2",
  "FORM_1099_INT",
  "FORM_1099_DIV",
  "FORM_1099_R",
]);

const supplementalIncomeKeys = [
  "capital_transactions",
  "unemployment_compensation",
  "social_security_benefits",
  "nonemployee_compensation",
  "miscellaneous_1099_income",
  "schedule_c_businesses",
  "schedule_e_activities",
  "other_income_items",
] as const;

const supplementalTaxpayerKeys = [
  "date_of_birth",
  "tax_id_token",
  "last4_tax_id",
  "citizenship_status",
  "is_blind",
  "is_full_time_student",
  "occupation",
] as const;

export type SupplementalFederalDraft = {
  readonly householdJson: string;
  readonly additionalDocumentsJson: string;
  readonly supplementalIncomeJson: string;
  readonly supplementalWithholdingsJson: string;
  readonly adjustmentsJson: string;
  readonly itemizedDeductionsJson: string;
  readonly creditsJson: string;
  readonly healthCoverageJson: string;
  readonly federalOverridesJson: string;
  readonly electionsJson: string;
};

export function supplementalFederalDraftFromCanonical(
  canonicalReturn: CanonicalReturnEnvelope,
): SupplementalFederalDraft {
  const household = asRecord(canonicalReturn.household) ?? {};
  const taxpayer = asRecord(household.taxpayer) ?? {};
  const facts = asRecord(canonicalReturn.facts) ?? {};
  const income = asRecord(facts.income) ?? {};
  const stateSpecificFactBag = asRecord(facts.state_specific_fact_bag) ?? {};

  return {
    householdJson: serializeJson({
      taxpayer: readTaxpayerSupplement(taxpayer),
      spouse: household.spouse ?? null,
      dependents: asArray(household.dependents),
      can_be_claimed_as_dependent: household.can_be_claimed_as_dependent ?? false,
    }),
    additionalDocumentsJson: serializeJson(
      asArray(canonicalReturn.source_documents).filter(
        (value) => !isStructuredDocument(asRecord(value)),
      ),
    ),
    supplementalIncomeJson: serializeJson(
      Object.fromEntries(
        supplementalIncomeKeys.map((key) => [key, asArray(income[key])]),
      ),
    ),
    supplementalWithholdingsJson: serializeJson(
      readSupplementalWithholdings(canonicalReturn),
    ),
    adjustmentsJson: serializeJson(asRecord(facts.adjustments) ?? {}),
    itemizedDeductionsJson: serializeJson(asRecord(facts.itemized_deductions) ?? {}),
    creditsJson: serializeJson(asRecord(facts.credits) ?? {}),
    healthCoverageJson: serializeJson(asRecord(facts.health_coverage) ?? {}),
    federalOverridesJson: serializeJson(asRecord(stateSpecificFactBag.federal) ?? {}),
    electionsJson: serializeJson(asRecord(canonicalReturn.elections) ?? {}),
  };
}

export function applySupplementalFederalDraft(
  canonicalReturn: CanonicalReturnEnvelope,
  options: {
    readonly draft: SupplementalFederalDraft;
    readonly writtenAt: string;
  },
): CanonicalReturnEnvelope {
  const next = structuredClone(canonicalReturn);
  const household = asRecord(next.household) ?? {};
  const taxpayer = asRecord(household.taxpayer) ?? {};
  const facts = asRecord(next.facts) ?? {};
  const income = asRecord(facts.income) ?? {};
  const payments = asRecord(facts.payments) ?? {};
  const stateSpecificFactBag = asRecord(facts.state_specific_fact_bag) ?? {};

  const householdPayload = parseObjectSection(options.draft.householdJson, "Household supplement");
  const parsedAdditionalDocuments = parseArraySection(
    options.draft.additionalDocumentsJson,
    "Additional source documents",
  );
  const parsedSupplementalIncome = parseObjectSection(
    options.draft.supplementalIncomeJson,
    "Supplemental income facts",
  );
  const parsedSupplementalWithholdings = parseArraySection(
    options.draft.supplementalWithholdingsJson,
    "Supplemental federal withholding rows",
  );
  const parsedAdjustments = parseObjectSection(
    options.draft.adjustmentsJson,
    "Adjustments",
  );
  const parsedItemizedDeductions = parseObjectSection(
    options.draft.itemizedDeductionsJson,
    "Itemized deductions",
  );
  const parsedCredits = parseObjectSection(options.draft.creditsJson, "Credits");
  const parsedHealthCoverage = parseObjectSection(
    options.draft.healthCoverageJson,
    "Health coverage",
  );
  const parsedFederalOverrides = parseObjectSection(
    options.draft.federalOverridesJson,
    "Federal override bag",
  );
  const parsedElections = parseObjectSection(options.draft.electionsJson, "Elections");

  validateAdditionalDocuments(parsedAdditionalDocuments);

  const preservedStructuredDocuments = asArray(next.source_documents).filter((value) =>
    isStructuredDocument(asRecord(value)),
  );
  const structuredDocumentIds = new Set(
    preservedStructuredDocuments.flatMap((value) => {
      const documentId = asString(asRecord(value)?.document_id);
      return documentId == null || documentId.length === 0 ? [] : [documentId];
    }),
  );

  validateSupplementalWithholdings(parsedSupplementalWithholdings, structuredDocumentIds);

  const nextHousehold = {
    ...household,
    taxpayer:
      "taxpayer" in householdPayload
        ? {
            ...taxpayer,
            ...sanitizeTaxpayerSupplement(asRecord(householdPayload.taxpayer)),
          }
        : taxpayer,
    spouse:
      "spouse" in householdPayload
        ? householdPayload.spouse == null
          ? null
          : householdPayload.spouse
        : household.spouse ?? null,
    dependents:
      "dependents" in householdPayload
        ? asArray(householdPayload.dependents)
        : asArray(household.dependents),
    can_be_claimed_as_dependent:
      "can_be_claimed_as_dependent" in householdPayload
        ? householdPayload.can_be_claimed_as_dependent === true
        : household.can_be_claimed_as_dependent === true,
  };

  const nextSourceDocuments = [
    ...preservedStructuredDocuments,
    ...parsedAdditionalDocuments,
  ];

  const nextFacts = {
    ...facts,
    income: {
      ...income,
      ...Object.fromEntries(
        supplementalIncomeKeys.map((key) => [
          key,
          key in parsedSupplementalIncome
            ? asArray(parsedSupplementalIncome[key])
            : asArray(income[key]),
        ]),
      ),
    },
    adjustments: parsedAdjustments,
    itemized_deductions: parsedItemizedDeductions,
    credits: parsedCredits,
    payments: {
      ...payments,
      withholdings: [
        ...readPreservedStructuredWithholdings(next, structuredDocumentIds),
        ...parsedSupplementalWithholdings,
      ],
    },
    health_coverage: parsedHealthCoverage,
    state_specific_fact_bag: {
      ...stateSpecificFactBag,
      federal: parsedFederalOverrides,
    },
  };

  const nextLifecycle = {
    ...next.lifecycle,
    updated_at: options.writtenAt,
  };

  return {
    ...next,
    household: nextHousehold,
    source_documents: nextSourceDocuments,
    facts: nextFacts,
    elections: parsedElections,
    lifecycle: nextLifecycle,
  };
}

function readTaxpayerSupplement(
  taxpayer: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    supplementalTaxpayerKeys
      .filter((key) => key in taxpayer)
      .map((key) => [key, taxpayer[key]]),
  );
}

function sanitizeTaxpayerSupplement(
  taxpayer: Record<string, unknown> | null,
): Record<string, unknown> {
  if (taxpayer == null) {
    return {};
  }

  return Object.fromEntries(
    supplementalTaxpayerKeys
      .filter((key) => key in taxpayer)
      .map((key) => [key, taxpayer[key]]),
  );
}

function readSupplementalWithholdings(
  canonicalReturn: CanonicalReturnEnvelope,
): ReadonlyArray<unknown> {
  const structuredDocumentIds = new Set(
    asArray(canonicalReturn.source_documents).flatMap((value) => {
      const record = asRecord(value);

      if (!isStructuredDocument(record)) {
        return [];
      }

      const documentId = asString(record?.document_id);
      return documentId == null || documentId.length === 0 ? [] : [documentId];
    }),
  );
  const facts = asRecord(canonicalReturn.facts) ?? {};
  const payments = asRecord(facts.payments) ?? {};

  return asArray(payments.withholdings).filter((value) => {
    const record = asRecord(value);

    if (record == null) {
      return false;
    }

    const sourceDocumentId = asString(record.source_document_id);
    return sourceDocumentId == null || !structuredDocumentIds.has(sourceDocumentId);
  });
}

function readPreservedStructuredWithholdings(
  canonicalReturn: CanonicalReturnEnvelope,
  structuredDocumentIds: ReadonlySet<string>,
): ReadonlyArray<unknown> {
  const facts = asRecord(canonicalReturn.facts) ?? {};
  const payments = asRecord(facts.payments) ?? {};

  return asArray(payments.withholdings).filter((value) => {
    const sourceDocumentId = asString(asRecord(value)?.source_document_id);
    return sourceDocumentId != null && structuredDocumentIds.has(sourceDocumentId);
  });
}

function validateAdditionalDocuments(documents: ReadonlyArray<unknown>) {
  for (const value of documents) {
    const documentType = asString(asRecord(value)?.document_type) ?? "";

    if (structuredDocumentTypes.has(documentType)) {
      throw new CliInteractiveValidationError({
        message:
          `Additional source documents cannot include ${documentType}. ` +
          "Use the dedicated W-2 / 1099-INT / 1099-DIV / 1099-R screens instead.",
      });
    }
  }
}

function validateSupplementalWithholdings(
  withholdings: ReadonlyArray<unknown>,
  structuredDocumentIds: ReadonlySet<string>,
) {
  for (const value of withholdings) {
    const record = asRecord(value);
    const sourceDocumentId = asString(record?.source_document_id);

    if (sourceDocumentId != null && structuredDocumentIds.has(sourceDocumentId)) {
      throw new CliInteractiveValidationError({
        message:
          "Supplemental federal withholding rows cannot target W-2 / 1099-INT / 1099-DIV / 1099-R documents. " +
          "Those rows are generated from the dedicated form editors.",
      });
    }
  }
}

function parseObjectSection(
  rawText: string,
  label: string,
): Record<string, unknown> {
  const parsed = parseJsonSection(rawText, label);
  const record = asRecord(parsed);

  if (record == null) {
    throw new CliInteractiveValidationError({
      message: `${label} must be a JSON object.`,
    });
  }

  return record;
}

function parseArraySection(
  rawText: string,
  label: string,
): ReadonlyArray<unknown> {
  const parsed = parseJsonSection(rawText, label);

  if (!Array.isArray(parsed)) {
    throw new CliInteractiveValidationError({
      message: `${label} must be a JSON array.`,
    });
  }

  return parsed;
}

function parseJsonSection(rawText: string, label: string): unknown {
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new CliInteractiveValidationError({
      message: `${label} contains invalid JSON.`,
    });
  }
}

function isStructuredDocument(
  record: Record<string, unknown> | null,
): boolean {
  if (record == null) {
    return false;
  }

  const documentType = asString(record.document_type) ?? "";
  return structuredDocumentTypes.has(documentType);
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
