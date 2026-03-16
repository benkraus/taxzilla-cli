import {
  decodeCanonicalReturnEnvelope,
  type CanonicalReturnEnvelope,
} from "@taxzilla/tax-engine";
import type { Ty2025CoreEnginePipelineResult } from "@taxzilla/tax-engine/return-ir";
import { Either } from "effect";
import { dirname, join } from "node:path";

import {
  createStarterReturn,
  loadCanonicalReturnFromFile,
} from "../core/canonical-return";
import { CliInteractiveValidationError } from "../core/errors";
import { writeArtifacts } from "../core/exporters";
import { asRecord, asString } from "../core/object";
import { runPipelineForPath } from "../core/run-pipeline";
import { type CliRuntime } from "../core/runtime";
import {
  buildDefaultSessionDir,
  canonicalReturnFileName,
  resolveCanonicalInput,
  writeExportManifest,
  writeJsonFile,
} from "../core/session-store";
import {
  defaultExportFormats,
  defaultRunExportFormats,
  type CliArtifact,
  type CliExportFormat,
  type SupportedFilingStatus,
} from "../core/types";
import {
  applyEfileDraft as applyInteractiveEfileDraft,
  applyIncomeDocumentDrafts,
  applyPaymentsDraft as applyInteractivePaymentsDraft,
  createEmptyDividend1099Draft,
  createEmptyEstimatedPaymentDraft,
  createEmptyExtensionPaymentDraft,
  createEmptyInterest1099Draft,
  createEmptyRetirement1099Draft,
  createEmptyW2Draft,
  efileDraftFromCanonical,
  emptyEfileDraft,
  emptyPaymentsDraft,
  incomeDocumentDraftsFromCanonical,
  paymentsDraftFromCanonical,
  type EfileDraft,
  type PaymentsDraft,
} from "./interactive-intake-drafts";
import {
  applySupplementalFederalDraft,
  supplementalFederalDraftFromCanonical,
  type SupplementalFederalDraft,
} from "./interactive-supplemental-federal-drafts";

export type HouseholdDraft = {
  readonly filingStatus: SupportedFilingStatus;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullLegalName: string;
  readonly email: string;
  readonly phone: string;
};

export type W2Draft = {
  readonly documentId: string;
  readonly wageId: string;
  readonly employerName: string;
  readonly employerEin: string;
  readonly wages: string;
  readonly federalWithholding: string;
  readonly socialSecurityWages: string;
  readonly socialSecurityTaxWithheld: string;
  readonly medicareWages: string;
  readonly medicareTaxWithheld: string;
  readonly controlNumber?: string;
  readonly retirementPlan?: boolean;
};

export type InterestDraft = {
  readonly documentId: string;
  readonly interestId: string;
  readonly payerName: string;
  readonly payerTin: string;
  readonly recipientAccountNumber?: string;
  readonly interestIncome: string;
  readonly federalWithholding: string;
  readonly taxExemptInterest: string;
  readonly usSavingsBondsAndTreasuryInterest: string;
  readonly foreignTaxPaid: string;
};

export type DividendDraft = {
  readonly documentId: string;
  readonly dividendId: string;
  readonly payerName: string;
  readonly payerTin: string;
  readonly recipientAccountNumber?: string;
  readonly ordinaryDividends: string;
  readonly qualifiedDividends: string;
  readonly capitalGainDistributions: string;
  readonly federalWithholding: string;
  readonly exemptInterestDividends: string;
  readonly foreignTaxPaid: string;
};

export type RetirementDraft = {
  readonly documentId: string;
  readonly distributionId: string;
  readonly payerName: string;
  readonly payerTin: string;
  readonly recipientAccountNumber?: string;
  readonly grossDistribution: string;
  readonly taxableAmount: string;
  readonly federalWithholding: string;
  readonly distributionCode1: string;
  readonly distributionCode2: string;
  readonly taxableAmountNotDetermined: boolean;
  readonly totalDistribution: boolean;
  readonly iraSepSimple: boolean;
};

export type IncomeDraft = {
  readonly w2s: ReadonlyArray<W2Draft>;
  readonly interests: ReadonlyArray<InterestDraft>;
  readonly dividends?: ReadonlyArray<DividendDraft>;
  readonly retirements?: ReadonlyArray<RetirementDraft>;
};

export type InteractiveSession = {
  readonly sessionDir: string;
  readonly canonicalPath: string;
  readonly canonicalReturn: CanonicalReturnEnvelope;
  readonly householdDraft: HouseholdDraft;
  readonly incomeDraft: IncomeDraft;
  readonly supplementalFederalDraft: SupplementalFederalDraft;
  readonly paymentsDraft: PaymentsDraft;
  readonly efileDraft: EfileDraft;
};

export const exportPresetOptions = [
  {
    id: "default",
    label: "Default export bundle",
    formats: defaultExportFormats,
  },
  {
    id: "review",
    label: "Review bundle",
    formats: defaultRunExportFormats,
  },
  {
    id: "return_ir",
    label: "Return IR only",
    formats: ["return-ir-json"] as const,
  },
] as const;

export type ExportPresetId = (typeof exportPresetOptions)[number]["id"];

export async function createInteractiveSession(options: {
  readonly filingStatus: SupportedFilingStatus;
  readonly requestedStateCodes?: ReadonlyArray<string>;
  readonly runtime: CliRuntime;
  readonly sessionDir?: string | null;
}): Promise<InteractiveSession> {
  const returnId = options.runtime.generateReturnId();
  const canonicalReturn = createStarterReturn({
    returnId,
    taxYear: 2025,
    filingStatus: options.filingStatus,
    createdAt: options.runtime.now().toISOString(),
    requestedStateCodes: options.requestedStateCodes,
  });
  const sessionDir =
    options.sessionDir ?? buildDefaultSessionDir(options.runtime.cwd, returnId);
  const canonicalPath = join(sessionDir, canonicalReturnFileName);

  await writeJsonFile(canonicalPath, canonicalReturn);

  return toInteractiveSession({
    sessionDir,
    canonicalPath,
    canonicalReturn,
  });
}

export async function openInteractiveSession(path: string): Promise<InteractiveSession> {
  const resolved = await resolveCanonicalInput(path);
  const canonicalReturn = await loadCanonicalReturnFromFile(resolved.canonicalPath);

  return toInteractiveSession({
    sessionDir: resolved.sessionDir ?? dirname(resolved.canonicalPath),
    canonicalPath: resolved.canonicalPath,
    canonicalReturn,
  });
}

export async function saveHouseholdDraft(options: {
  readonly session: InteractiveSession;
  readonly householdDraft: HouseholdDraft;
  readonly writtenAt: string;
}): Promise<InteractiveSession> {
  return saveInteractiveDrafts({
    session: options.session,
    householdDraft: options.householdDraft,
    incomeDraft: options.session.incomeDraft,
    supplementalFederalDraft: options.session.supplementalFederalDraft,
    paymentsDraft: options.session.paymentsDraft,
    efileDraft: options.session.efileDraft,
    writtenAt: options.writtenAt,
  });
}

export async function saveIncomeDraft(options: {
  readonly session: InteractiveSession;
  readonly incomeDraft: IncomeDraft;
  readonly writtenAt: string;
}): Promise<InteractiveSession> {
  return saveInteractiveDrafts({
    session: options.session,
    householdDraft: options.session.householdDraft,
    incomeDraft: options.incomeDraft,
    supplementalFederalDraft: options.session.supplementalFederalDraft,
    paymentsDraft: options.session.paymentsDraft,
    efileDraft: options.session.efileDraft,
    writtenAt: options.writtenAt,
  });
}

export async function savePaymentsDraft(options: {
  readonly session: InteractiveSession;
  readonly paymentsDraft: PaymentsDraft;
  readonly writtenAt: string;
}): Promise<InteractiveSession> {
  return saveInteractiveDrafts({
    session: options.session,
    householdDraft: options.session.householdDraft,
    incomeDraft: options.session.incomeDraft,
    supplementalFederalDraft: options.session.supplementalFederalDraft,
    paymentsDraft: options.paymentsDraft,
    efileDraft: options.session.efileDraft,
    writtenAt: options.writtenAt,
  });
}

export async function saveEfileDraft(options: {
  readonly session: InteractiveSession;
  readonly efileDraft: EfileDraft;
  readonly writtenAt: string;
}): Promise<InteractiveSession> {
  return saveInteractiveDrafts({
    session: options.session,
    householdDraft: options.session.householdDraft,
    incomeDraft: options.session.incomeDraft,
    supplementalFederalDraft: options.session.supplementalFederalDraft,
    paymentsDraft: options.session.paymentsDraft,
    efileDraft: options.efileDraft,
    writtenAt: options.writtenAt,
  });
}

export async function saveInteractiveDrafts(options: {
  readonly session: InteractiveSession;
  readonly householdDraft: HouseholdDraft;
  readonly incomeDraft: IncomeDraft;
  readonly supplementalFederalDraft?: SupplementalFederalDraft;
  readonly paymentsDraft?: PaymentsDraft;
  readonly efileDraft?: EfileDraft;
  readonly writtenAt: string;
}): Promise<InteractiveSession> {
  const withHousehold = applyHouseholdDraft(options.session.canonicalReturn, {
    householdDraft: options.householdDraft,
    writtenAt: options.writtenAt,
  });
  const withIncome = applyIncomeDraft(withHousehold, {
    incomeDraft: options.incomeDraft,
    writtenAt: options.writtenAt,
  });
  const withSupplementalFederal = applySupplementalFederalDraft(withIncome, {
    draft: options.supplementalFederalDraft ?? options.session.supplementalFederalDraft,
    writtenAt: options.writtenAt,
  });
  const withPayments = applyInteractivePaymentsDraft(
    withSupplementalFederal,
    options.paymentsDraft ?? options.session.paymentsDraft,
  );
  const canonicalReturn = validateInteractiveCanonicalReturn(
    applyInteractiveEfileDraft(
    withPayments,
    options.efileDraft ?? options.session.efileDraft,
    ),
  );

  await writeJsonFile(options.session.canonicalPath, canonicalReturn);

  return toInteractiveSession({
    sessionDir: options.session.sessionDir,
    canonicalPath: options.session.canonicalPath,
    canonicalReturn,
  });
}

export async function computeInteractiveSession(
  session: InteractiveSession,
): Promise<Ty2025CoreEnginePipelineResult> {
  const result = await runPipelineForPath(session.sessionDir);
  return result.pipelineResult;
}

export async function exportInteractiveSession(options: {
  readonly session: InteractiveSession;
  readonly presetId: ExportPresetId;
  readonly runtime: CliRuntime;
  readonly outputDir?: string | null;
}): Promise<{
  readonly outputDir: string;
  readonly artifacts: ReadonlyArray<CliArtifact>;
  readonly manifestPath: string;
}> {
  const result = await runPipelineForPath(options.session.sessionDir);
  const formats = exportFormatsForPreset(options.presetId);
  const outputDir = options.outputDir ?? options.session.sessionDir;
  const artifacts = await writeArtifacts({
    outputDir,
    formats,
    payload: {
      canonicalReturn: result.canonicalReturn,
      pipelineResult: result.pipelineResult,
    },
  });
  const manifestPath = await writeExportManifest({
    outputDir,
    commandName: "export",
    generatedAt: options.runtime.now().toISOString(),
    returnId: result.canonicalReturn.return_id,
    taxYear: result.canonicalReturn.tax_year,
    canonicalPath: result.input.canonicalPath,
    artifacts,
  });

  return {
    outputDir,
    artifacts,
    manifestPath,
  };
}

export function exportFormatsForPreset(
  presetId: ExportPresetId,
): ReadonlyArray<CliExportFormat> {
  const preset = exportPresetOptions.find((option) => option.id === presetId);

  if (preset == null) {
    return defaultExportFormats;
  }

  return preset.formats;
}

export function householdDraftFromCanonical(
  canonicalReturn: CanonicalReturnEnvelope,
): HouseholdDraft {
  const household = asRecord(canonicalReturn.household);
  const taxpayer = asRecord(household?.taxpayer);
  const taxpayerName = asRecord(taxpayer?.name);
  const taxpayerContact = asRecord(taxpayer?.contact);

  return {
    filingStatus: readFilingStatus(household?.filing_status),
    firstName: asString(taxpayerName?.first) ?? "",
    lastName: asString(taxpayerName?.last) ?? "",
    fullLegalName: asString(taxpayerName?.full_legal_name) ?? "",
    email: asString(taxpayerContact?.email) ?? "",
    phone: asString(taxpayerContact?.phone) ?? "",
  };
}

export function incomeDraftFromCanonical(
  canonicalReturn: CanonicalReturnEnvelope,
): IncomeDraft {
  return toIncomeDraft(incomeDocumentDraftsFromCanonical(canonicalReturn));
}

export function addBlankW2Draft(incomeDraft: IncomeDraft): IncomeDraft {
  const draft = createEmptyW2Draft();
  const ordinal = nextOrdinal(incomeDraft.w2s, "doc_w2_");
  return {
    ...incomeDraft,
    w2s: [
      ...incomeDraft.w2s,
      {
        documentId: `doc_w2_${ordinal}`,
        wageId: `wage_${ordinal}`,
        employerName: draft.employerName,
        employerEin: draft.employerEin,
        wages: draft.wagesTipsOtherCompensation,
        federalWithholding: draft.federalIncomeTaxWithheld,
        socialSecurityWages: draft.socialSecurityWages,
        socialSecurityTaxWithheld: draft.socialSecurityTaxWithheld,
        medicareWages: draft.medicareWagesAndTips,
        medicareTaxWithheld: draft.medicareTaxWithheld,
        controlNumber: draft.controlNumber,
        retirementPlan: draft.retirementPlan,
      },
    ],
  };
}

export function removeW2Draft(
  incomeDraft: IncomeDraft,
  documentId: string,
): IncomeDraft {
  return {
    ...incomeDraft,
    w2s: incomeDraft.w2s.filter((entry) => entry.documentId !== documentId),
  };
}

export function addBlankInterestDraft(incomeDraft: IncomeDraft): IncomeDraft {
  const draft = createEmptyInterest1099Draft();
  const ordinal = nextOrdinal(incomeDraft.interests, "doc_1099int_");
  return {
    ...incomeDraft,
    interests: [
      ...incomeDraft.interests,
      {
        documentId: `doc_1099int_${ordinal}`,
        interestId: `int_${ordinal}`,
        payerName: draft.payerName,
        payerTin: draft.payerTin,
        recipientAccountNumber: draft.recipientAccountNumber,
        interestIncome: draft.interestIncome,
        federalWithholding: draft.federalIncomeTaxWithheld,
        taxExemptInterest: draft.taxExemptInterest,
        usSavingsBondsAndTreasuryInterest: draft.usSavingsBondsAndTreasuryInterest,
        foreignTaxPaid: draft.foreignTaxPaid,
      },
    ],
  };
}

export function removeInterestDraft(
  incomeDraft: IncomeDraft,
  documentId: string,
): IncomeDraft {
  return {
    ...incomeDraft,
    interests: incomeDraft.interests.filter(
      (entry) => entry.documentId !== documentId,
    ),
  };
}

export function addBlankDividendDraft(incomeDraft: IncomeDraft): IncomeDraft {
  const draft = createEmptyDividend1099Draft();
  const ordinal = nextOrdinal(incomeDraft.dividends ?? [], "doc_1099div_");
  return {
    ...incomeDraft,
    dividends: [
      ...(incomeDraft.dividends ?? []),
      {
        documentId: `doc_1099div_${ordinal}`,
        dividendId: `div_${ordinal}`,
        payerName: draft.payerName,
        payerTin: draft.payerTin,
        recipientAccountNumber: draft.recipientAccountNumber,
        ordinaryDividends: draft.ordinaryDividends,
        qualifiedDividends: draft.qualifiedDividends,
        capitalGainDistributions: draft.capitalGainDistributions,
        federalWithholding: draft.federalIncomeTaxWithheld,
        exemptInterestDividends: draft.exemptInterestDividends,
        foreignTaxPaid: draft.foreignTaxPaid,
      },
    ],
  };
}

export function removeDividendDraft(
  incomeDraft: IncomeDraft,
  documentId: string,
): IncomeDraft {
  return {
    ...incomeDraft,
    dividends: (incomeDraft.dividends ?? []).filter(
      (entry) => entry.documentId !== documentId,
    ),
  };
}

export function addBlankRetirementDraft(incomeDraft: IncomeDraft): IncomeDraft {
  const draft = createEmptyRetirement1099Draft();
  const ordinal = nextOrdinal(incomeDraft.retirements ?? [], "doc_1099r_");
  return {
    ...incomeDraft,
    retirements: [
      ...(incomeDraft.retirements ?? []),
      {
        documentId: `doc_1099r_${ordinal}`,
        distributionId: `ret_${ordinal}`,
        payerName: draft.payerName,
        payerTin: draft.payerTin,
        recipientAccountNumber: draft.recipientAccountNumber,
        grossDistribution: draft.grossDistribution,
        taxableAmount: draft.taxableAmount,
        federalWithholding: draft.federalIncomeTaxWithheld,
        distributionCode1: draft.distributionCode1,
        distributionCode2: draft.distributionCode2,
        taxableAmountNotDetermined: draft.taxableAmountNotDetermined,
        totalDistribution: draft.totalDistribution,
        iraSepSimple: draft.iraSepSimple,
      },
    ],
  };
}

export function removeRetirementDraft(
  incomeDraft: IncomeDraft,
  documentId: string,
): IncomeDraft {
  return {
    ...incomeDraft,
    retirements: (incomeDraft.retirements ?? []).filter(
      (entry) => entry.documentId !== documentId,
    ),
  };
}

export function addBlankEstimatedPayment(
  paymentsDraft: PaymentsDraft,
): PaymentsDraft {
  const ordinal = nextIdOrdinal(
    paymentsDraft.estimatedPayments.map((payment) => payment.paymentId),
    "est_",
  );

  return {
    ...paymentsDraft,
    estimatedPayments: [
      ...paymentsDraft.estimatedPayments,
      {
        ...createEmptyEstimatedPaymentDraft(),
        paymentId: `est_${ordinal}`,
      },
    ],
  };
}

export function removeEstimatedPayment(
  paymentsDraft: PaymentsDraft,
  paymentId: string,
): PaymentsDraft {
  return {
    ...paymentsDraft,
    estimatedPayments: paymentsDraft.estimatedPayments.filter(
      (entry) => entry.paymentId !== paymentId,
    ),
  };
}

export function addBlankExtensionPayment(
  paymentsDraft: PaymentsDraft,
): PaymentsDraft {
  const ordinal = nextIdOrdinal(
    paymentsDraft.extensionPayments.map(
      (payment) => payment.extensionPaymentId,
    ),
    "ext_",
  );

  return {
    ...paymentsDraft,
    extensionPayments: [
      ...paymentsDraft.extensionPayments,
      {
        ...createEmptyExtensionPaymentDraft(),
        extensionPaymentId: `ext_${ordinal}`,
      },
    ],
  };
}

export function removeExtensionPayment(
  paymentsDraft: PaymentsDraft,
  extensionPaymentId: string,
): PaymentsDraft {
  return {
    ...paymentsDraft,
    extensionPayments: paymentsDraft.extensionPayments.filter(
      (entry) => entry.extensionPaymentId !== extensionPaymentId,
    ),
  };
}

export function applyHouseholdDraft(
  canonicalReturn: CanonicalReturnEnvelope,
  options: {
    readonly householdDraft: HouseholdDraft;
    readonly writtenAt: string;
  },
): CanonicalReturnEnvelope {
  const next = structuredClone(canonicalReturn);
  const household = asRecord(next.household) ?? {};
  const taxpayer = asRecord(household.taxpayer) ?? {};
  const taxpayerName = asRecord(taxpayer.name) ?? {};
  const taxpayerContact = asRecord(taxpayer.contact) ?? {};
  const lifecycle = next.lifecycle;
  const updatedHousehold = {
    ...household,
    filing_status: options.householdDraft.filingStatus,
    taxpayer: {
      ...taxpayer,
      name: {
        ...taxpayerName,
        first: options.householdDraft.firstName,
        last: options.householdDraft.lastName,
        full_legal_name: options.householdDraft.fullLegalName,
      },
      contact: {
        ...taxpayerContact,
        email: options.householdDraft.email,
        phone: options.householdDraft.phone,
      },
    },
  };
  const updatedLifecycle = {
    ...lifecycle,
    updated_at: options.writtenAt,
  };

  return {
    ...next,
    household: updatedHousehold,
    lifecycle: updatedLifecycle,
  };
}

export function applyIncomeDraft(
  canonicalReturn: CanonicalReturnEnvelope,
  options: {
    readonly incomeDraft: IncomeDraft;
    readonly writtenAt: string;
  },
): CanonicalReturnEnvelope {
  return applyIncomeDocumentDrafts(canonicalReturn, {
    drafts: fromIncomeDraft(options.incomeDraft),
    writtenAt: options.writtenAt,
  });
}

export {
  createEmptyDividend1099Draft,
  createEmptyEstimatedPaymentDraft,
  createEmptyExtensionPaymentDraft,
  createEmptyInterest1099Draft,
  createEmptyRetirement1099Draft,
  createEmptyW2Draft,
  emptyEfileDraft,
  emptyPaymentsDraft,
  efileDraftFromCanonical,
  paymentsDraftFromCanonical,
  type SupplementalFederalDraft,
  type EfileDraft,
  type PaymentsDraft,
};

function toInteractiveSession(options: {
  readonly sessionDir: string;
  readonly canonicalPath: string;
  readonly canonicalReturn: CanonicalReturnEnvelope;
}): InteractiveSession {
  return {
    sessionDir: options.sessionDir,
    canonicalPath: options.canonicalPath,
    canonicalReturn: options.canonicalReturn,
    householdDraft: householdDraftFromCanonical(options.canonicalReturn),
    incomeDraft: incomeDraftFromCanonical(options.canonicalReturn),
    supplementalFederalDraft: supplementalFederalDraftFromCanonical(
      options.canonicalReturn,
    ),
    paymentsDraft: paymentsDraftFromCanonical(options.canonicalReturn),
    efileDraft: efileDraftFromCanonical(options.canonicalReturn),
  };
}

function toIncomeDraft(documentDrafts: ReturnType<typeof incomeDocumentDraftsFromCanonical>): IncomeDraft {
  return {
    w2s: documentDrafts.w2s.map((draft) => ({
      documentId: draft.documentId,
      wageId: draft.wageId,
      employerName: draft.employerName,
      employerEin: draft.employerEin,
      wages: draft.wagesTipsOtherCompensation,
      federalWithholding: draft.federalIncomeTaxWithheld,
      socialSecurityWages: draft.socialSecurityWages,
      socialSecurityTaxWithheld: draft.socialSecurityTaxWithheld,
      medicareWages: draft.medicareWagesAndTips,
      medicareTaxWithheld: draft.medicareTaxWithheld,
      controlNumber: draft.controlNumber,
      retirementPlan: draft.retirementPlan,
    })),
    interests: documentDrafts.interest1099s.map((draft) => ({
      documentId: draft.documentId,
      interestId: draft.interestId,
      payerName: draft.payerName,
      payerTin: draft.payerTin,
      recipientAccountNumber: draft.recipientAccountNumber,
      interestIncome: draft.interestIncome,
      federalWithholding: draft.federalIncomeTaxWithheld,
      taxExemptInterest: draft.taxExemptInterest,
      usSavingsBondsAndTreasuryInterest: draft.usSavingsBondsAndTreasuryInterest,
      foreignTaxPaid: draft.foreignTaxPaid,
    })),
    dividends: documentDrafts.dividend1099s.map((draft) => ({
      documentId: draft.documentId,
      dividendId: draft.dividendId,
      payerName: draft.payerName,
      payerTin: draft.payerTin,
      recipientAccountNumber: draft.recipientAccountNumber,
      ordinaryDividends: draft.ordinaryDividends,
      qualifiedDividends: draft.qualifiedDividends,
      capitalGainDistributions: draft.capitalGainDistributions,
      federalWithholding: draft.federalIncomeTaxWithheld,
      exemptInterestDividends: draft.exemptInterestDividends,
      foreignTaxPaid: draft.foreignTaxPaid,
    })),
    retirements: documentDrafts.retirement1099s.map((draft) => ({
      documentId: draft.documentId,
      distributionId: draft.distributionId,
      payerName: draft.payerName,
      payerTin: draft.payerTin,
      recipientAccountNumber: draft.recipientAccountNumber,
      grossDistribution: draft.grossDistribution,
      taxableAmount: draft.taxableAmount,
      federalWithholding: draft.federalIncomeTaxWithheld,
      distributionCode1: draft.distributionCode1,
      distributionCode2: draft.distributionCode2,
      taxableAmountNotDetermined: draft.taxableAmountNotDetermined,
      totalDistribution: draft.totalDistribution,
      iraSepSimple: draft.iraSepSimple,
    })),
  };
}

function fromIncomeDraft(incomeDraft: IncomeDraft): ReturnType<typeof incomeDocumentDraftsFromCanonical> {
  return {
    w2s: incomeDraft.w2s.map((draft) => ({
      documentId: draft.documentId,
      wageId: draft.wageId,
      employerName: draft.employerName,
      employerEin: draft.employerEin,
      wagesTipsOtherCompensation: draft.wages,
      federalIncomeTaxWithheld: draft.federalWithholding,
      socialSecurityWages: draft.socialSecurityWages,
      socialSecurityTaxWithheld: draft.socialSecurityTaxWithheld,
      medicareWagesAndTips: draft.medicareWages,
      medicareTaxWithheld: draft.medicareTaxWithheld,
      controlNumber: draft.controlNumber ?? "",
      retirementPlan: draft.retirementPlan ?? false,
    })),
    interest1099s: incomeDraft.interests.map((draft) => ({
      documentId: draft.documentId,
      interestId: draft.interestId,
      payerName: draft.payerName,
      payerTin: draft.payerTin,
      recipientAccountNumber: draft.recipientAccountNumber ?? "",
      interestIncome: draft.interestIncome,
      federalIncomeTaxWithheld: draft.federalWithholding,
      taxExemptInterest: draft.taxExemptInterest,
      usSavingsBondsAndTreasuryInterest: draft.usSavingsBondsAndTreasuryInterest,
      foreignTaxPaid: draft.foreignTaxPaid,
    })),
    dividend1099s: (incomeDraft.dividends ?? []).map((draft) => ({
      documentId: draft.documentId,
      dividendId: draft.dividendId,
      payerName: draft.payerName,
      payerTin: draft.payerTin,
      recipientAccountNumber: draft.recipientAccountNumber ?? "",
      ordinaryDividends: draft.ordinaryDividends,
      qualifiedDividends: draft.qualifiedDividends,
      capitalGainDistributions: draft.capitalGainDistributions,
      federalIncomeTaxWithheld: draft.federalWithholding,
      exemptInterestDividends: draft.exemptInterestDividends,
      foreignTaxPaid: draft.foreignTaxPaid,
    })),
    retirement1099s: (incomeDraft.retirements ?? []).map((draft) => ({
      documentId: draft.documentId,
      distributionId: draft.distributionId,
      payerName: draft.payerName,
      payerTin: draft.payerTin,
      recipientAccountNumber: draft.recipientAccountNumber ?? "",
      grossDistribution: draft.grossDistribution,
      taxableAmount: draft.taxableAmount,
      federalIncomeTaxWithheld: draft.federalWithholding,
      distributionCode1: draft.distributionCode1,
      distributionCode2: draft.distributionCode2,
      taxableAmountNotDetermined: draft.taxableAmountNotDetermined,
      totalDistribution: draft.totalDistribution,
      iraSepSimple: draft.iraSepSimple,
    })),
  };
}

function validateInteractiveCanonicalReturn(
  canonicalReturn: CanonicalReturnEnvelope,
): CanonicalReturnEnvelope {
  const decoded = decodeCanonicalReturnEnvelope(canonicalReturn);

  if (Either.isLeft(decoded)) {
    throw new CliInteractiveValidationError({
      message:
        "Interactive edits did not produce a valid canonical return. Review the advanced federal JSON sections.",
    });
  }

  return decoded.right;
}

function readFilingStatus(value: unknown): SupportedFilingStatus {
  switch (value) {
    case "married_filing_jointly":
    case "married_filing_separately":
    case "head_of_household":
    case "qualifying_surviving_spouse":
      return value;
    case "single":
    default:
      return "single";
  }
}

function nextOrdinal(
  entries: ReadonlyArray<{ readonly documentId: string }>,
  prefix: string,
): number {
  return nextIdOrdinal(
    entries.map((entry) => entry.documentId),
    prefix,
  );
}

function nextIdOrdinal(
  ids: ReadonlyArray<string>,
  prefix: string,
): number {
  let next = ids.length + 1;

  for (const id of ids) {
    if (!id.startsWith(prefix)) {
      continue;
    }

    const parsed = Number.parseInt(id.slice(prefix.length), 10);

    if (Number.isInteger(parsed)) {
      next = Math.max(next, parsed + 1);
    }
  }

  return next;
}
