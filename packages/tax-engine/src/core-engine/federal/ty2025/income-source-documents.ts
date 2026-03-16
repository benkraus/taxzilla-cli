import type {
  CoreEngineMisc1099IncomeCategory,
  CoreEngineMisc1099IncomeInput,
  CoreEngineNonemployeeCompensationInput,
  CoreEngineRetirementDistributionInput,
  CoreEngineSocialSecurityBenefitInput,
  CoreEngineUnemploymentCompensationInput,
} from "../../input";
import { RETIREMENT_DISTRIBUTION_NONTAXABLE_CODES } from "./constants";
import { asNumber, asRecord, asString, roundMoney, uniqueStrings } from "../../helpers";

const MISC_1099_PAYLOAD_FIELD_BY_CATEGORY: Partial<
  Record<CoreEngineMisc1099IncomeCategory, string>
> = {
  attorney_fees: "gross_proceeds_paid_to_attorney",
  crop_insurance: "crop_insurance_proceeds",
  medical_payments: "medical_and_health_care_payments",
  other_income: "other_income",
  rents: "rents",
  royalties: "royalties",
  substitute_payments: "substitute_payments_in_lieu_of_dividends_or_interest",
};

function findSourceDocumentPayloadById(
  sourceDocuments: ReadonlyArray<unknown>,
  documentId: string,
  documentType: string,
): Record<string, unknown> | undefined {
  for (const sourceDocument of sourceDocuments) {
    const record = asRecord(sourceDocument);

    if (
      asString(record?.document_id) !== documentId ||
      asString(record?.document_type) !== documentType
    ) {
      continue;
    }

    return asRecord(record?.payload);
  }

  return undefined;
}

function buildSourceDocumentPayloadPointersById(
  sourceDocuments: ReadonlyArray<unknown>,
  documentId: string,
  fields: ReadonlyArray<string>,
): string[] {
  const index = sourceDocuments.findIndex((sourceDocument) => {
    const record = asRecord(sourceDocument);
    return asString(record?.document_id) === documentId;
  });

  if (index < 0) {
    return [];
  }

  const payload = asRecord(asRecord(sourceDocuments[index])?.payload);

  return fields.flatMap((field) =>
    payload && typeof payload[field] !== "undefined"
      ? [`/source_documents/${index}/payload/${field}`]
      : [],
  );
}

function getRetirementDistributionCodes(
  distribution: CoreEngineRetirementDistributionInput,
  sourceDocuments: ReadonlyArray<unknown>,
): string[] {
  const payload = findSourceDocumentPayloadById(
    sourceDocuments,
    distribution.source_document_id,
    "FORM_1099_R",
  );

  return uniqueStrings(
    [
      ...distribution.distribution_codes,
      asString(payload?.distribution_code_1),
      asString(payload?.distribution_code_2),
    ].filter((value): value is string => typeof value === "string" && value.length > 0),
  );
}

function resolveRetirementDistributionAmounts(
  distribution: CoreEngineRetirementDistributionInput,
  sourceDocuments: ReadonlyArray<unknown>,
): {
  readonly assumedTaxableAmount: boolean;
  readonly grossDistribution: number;
  readonly taxableAmount: number;
} {
  const payload = findSourceDocumentPayloadById(
    sourceDocuments,
    distribution.source_document_id,
    "FORM_1099_R",
  );
  const grossDistribution = roundMoney(
    distribution.gross_distribution ?? asNumber(payload?.gross_distribution) ?? 0,
  );
  const explicitTaxableAmount = distribution.taxable_amount ?? asNumber(payload?.taxable_amount);

  if (explicitTaxableAmount != null) {
    return {
      assumedTaxableAmount: false,
      grossDistribution,
      taxableAmount: roundMoney(explicitTaxableAmount),
    };
  }

  const distributionCodes = getRetirementDistributionCodes(distribution, sourceDocuments);

  if (distributionCodes.some((code) => RETIREMENT_DISTRIBUTION_NONTAXABLE_CODES.has(code))) {
    return {
      assumedTaxableAmount: false,
      grossDistribution,
      taxableAmount: 0,
    };
  }

  if (grossDistribution === 0) {
    return {
      assumedTaxableAmount: false,
      grossDistribution,
      taxableAmount: 0,
    };
  }

  return {
    assumedTaxableAmount: true,
    grossDistribution,
    taxableAmount: grossDistribution,
  };
}

function resolveUnemploymentCompensationAmount(
  unemployment: CoreEngineUnemploymentCompensationInput,
  sourceDocuments: ReadonlyArray<unknown>,
): number {
  const payload = findSourceDocumentPayloadById(
    sourceDocuments,
    unemployment.source_document_id,
    "FORM_1099_G",
  );

  return roundMoney(
    unemployment.unemployment_compensation ?? asNumber(payload?.unemployment_compensation) ?? 0,
  );
}

function resolveSocialSecurityBenefitAmounts(
  benefit: CoreEngineSocialSecurityBenefitInput,
  sourceDocuments: ReadonlyArray<unknown>,
): {
  readonly benefitsPaid: number;
  readonly benefitsRepaid: number;
  readonly netBenefits: number;
} {
  const payload = findSourceDocumentPayloadById(
    sourceDocuments,
    benefit.source_document_id,
    "FORM_SSA_1099",
  );
  const benefitsPaid = roundMoney(
    benefit.benefits_paid ?? asNumber(payload?.benefits_paid_in_2025) ?? 0,
  );
  const benefitsRepaid = roundMoney(
    benefit.benefits_repaid ?? asNumber(payload?.benefits_repaid_in_2025) ?? 0,
  );
  const netBenefits = roundMoney(
    benefit.net_benefits ??
      asNumber(payload?.net_benefits_for_2025) ??
      Math.max(benefitsPaid - benefitsRepaid, 0),
  );

  return {
    benefitsPaid,
    benefitsRepaid,
    netBenefits,
  };
}

function resolveNonemployeeCompensationAmount(
  nonemployeeCompensation: CoreEngineNonemployeeCompensationInput,
  sourceDocuments: ReadonlyArray<unknown>,
): number {
  const payload = findSourceDocumentPayloadById(
    sourceDocuments,
    nonemployeeCompensation.source_document_id,
    "FORM_1099_NEC",
  );

  return roundMoney(
    nonemployeeCompensation.amount ?? asNumber(payload?.nonemployee_compensation) ?? 0,
  );
}

function resolveMisc1099IncomeAmount(
  miscellaneousIncome: CoreEngineMisc1099IncomeInput,
  sourceDocuments: ReadonlyArray<unknown>,
): number {
  const payload = findSourceDocumentPayloadById(
    sourceDocuments,
    miscellaneousIncome.source_document_id,
    "FORM_1099_MISC",
  );
  const payloadField = MISC_1099_PAYLOAD_FIELD_BY_CATEGORY[miscellaneousIncome.income_category];

  return roundMoney(
    miscellaneousIncome.amount ?? (payloadField ? asNumber(payload?.[payloadField]) : null) ?? 0,
  );
}

export {
  buildSourceDocumentPayloadPointersById,
  findSourceDocumentPayloadById,
  getRetirementDistributionCodes,
  resolveMisc1099IncomeAmount,
  resolveNonemployeeCompensationAmount,
  resolveRetirementDistributionAmounts,
  resolveSocialSecurityBenefitAmounts,
  resolveUnemploymentCompensationAmount,
};
