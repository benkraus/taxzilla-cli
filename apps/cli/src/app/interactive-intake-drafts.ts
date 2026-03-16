import type { CanonicalReturnEnvelope } from "@taxzilla/tax-engine";

import { CliInteractiveValidationError } from "../core/errors";
import { asArray, asRecord, asString } from "../core/object";

const taxpayerPersonId = "p_taxpayer";
const editableDocumentTypes = new Set([
  "FORM_W2",
  "FORM_1099_INT",
  "FORM_1099_DIV",
  "FORM_1099_R",
]);

export type BankAccountTypeOption = "checking" | "savings";
export type EstimatedPaymentQuarter = "Q1" | "Q2" | "Q3" | "Q4" | "other";
export type ExtensionFormType = "4868" | "2350" | "other";
export type SignatureMethodOption =
  | "unset"
  | "self_select_pin"
  | "practitioner_pin"
  | "paper";

export type W2Draft = {
  readonly documentId: string;
  readonly wageId: string;
  readonly employerName: string;
  readonly employerEin: string;
  readonly wagesTipsOtherCompensation: string;
  readonly federalIncomeTaxWithheld: string;
  readonly socialSecurityWages: string;
  readonly socialSecurityTaxWithheld: string;
  readonly medicareWagesAndTips: string;
  readonly medicareTaxWithheld: string;
  readonly controlNumber: string;
  readonly retirementPlan: boolean;
};

export type Interest1099Draft = {
  readonly documentId: string;
  readonly interestId: string;
  readonly payerName: string;
  readonly payerTin: string;
  readonly recipientAccountNumber: string;
  readonly interestIncome: string;
  readonly federalIncomeTaxWithheld: string;
  readonly taxExemptInterest: string;
  readonly usSavingsBondsAndTreasuryInterest: string;
  readonly foreignTaxPaid: string;
};

export type Dividend1099Draft = {
  readonly documentId: string;
  readonly dividendId: string;
  readonly payerName: string;
  readonly payerTin: string;
  readonly recipientAccountNumber: string;
  readonly ordinaryDividends: string;
  readonly qualifiedDividends: string;
  readonly capitalGainDistributions: string;
  readonly federalIncomeTaxWithheld: string;
  readonly exemptInterestDividends: string;
  readonly foreignTaxPaid: string;
};

export type Retirement1099Draft = {
  readonly documentId: string;
  readonly distributionId: string;
  readonly payerName: string;
  readonly payerTin: string;
  readonly recipientAccountNumber: string;
  readonly grossDistribution: string;
  readonly taxableAmount: string;
  readonly federalIncomeTaxWithheld: string;
  readonly distributionCode1: string;
  readonly distributionCode2: string;
  readonly taxableAmountNotDetermined: boolean;
  readonly totalDistribution: boolean;
  readonly iraSepSimple: boolean;
};

export type IncomeDocumentDrafts = {
  readonly w2s: ReadonlyArray<W2Draft>;
  readonly interest1099s: ReadonlyArray<Interest1099Draft>;
  readonly dividend1099s: ReadonlyArray<Dividend1099Draft>;
  readonly retirement1099s: ReadonlyArray<Retirement1099Draft>;
};

export type EstimatedPaymentDraft = {
  readonly paymentId: string;
  readonly amount: string;
  readonly paidDate: string;
  readonly quarter: EstimatedPaymentQuarter;
};

export type ExtensionPaymentDraft = {
  readonly extensionPaymentId: string;
  readonly amount: string;
  readonly paidDate: string;
  readonly formType: ExtensionFormType;
};

export type PaymentsDraft = {
  readonly estimatedPayments: ReadonlyArray<EstimatedPaymentDraft>;
  readonly extensionPayments: ReadonlyArray<ExtensionPaymentDraft>;
  readonly priorYearOverpaymentAppliedTo2025: string;
  readonly refundDirectDepositEnabled: boolean;
  readonly refundBankName: string;
  readonly refundAccountType: BankAccountTypeOption;
  readonly refundLast4AccountNumber: string;
  readonly refundLast4RoutingNumber: string;
  readonly refundVaultToken: string;
  readonly balanceDueDirectDebitEnabled: boolean;
  readonly debitBankName: string;
  readonly debitAccountType: BankAccountTypeOption;
  readonly debitLast4AccountNumber: string;
  readonly debitLast4RoutingNumber: string;
  readonly debitVaultToken: string;
  readonly debitRequestedDate: string;
};

export type EfileDraft = {
  readonly signatureMethod: SignatureMethodOption;
  readonly taxpayerPinToken: string;
  readonly taxpayerPriorYearAgi: string;
  readonly taxpayerPriorYearPinToken: string;
  readonly taxpayerSignedAt: string;
};

export function createEmptyW2Draft(): W2Draft {
  return {
    documentId: "",
    wageId: "",
    employerName: "",
    employerEin: "",
    wagesTipsOtherCompensation: "",
    federalIncomeTaxWithheld: "",
    socialSecurityWages: "",
    socialSecurityTaxWithheld: "",
    medicareWagesAndTips: "",
    medicareTaxWithheld: "",
    controlNumber: "",
    retirementPlan: false,
  };
}

export function createEmptyInterest1099Draft(): Interest1099Draft {
  return {
    documentId: "",
    interestId: "",
    payerName: "",
    payerTin: "",
    recipientAccountNumber: "",
    interestIncome: "",
    federalIncomeTaxWithheld: "",
    taxExemptInterest: "",
    usSavingsBondsAndTreasuryInterest: "",
    foreignTaxPaid: "",
  };
}

export function createEmptyDividend1099Draft(): Dividend1099Draft {
  return {
    documentId: "",
    dividendId: "",
    payerName: "",
    payerTin: "",
    recipientAccountNumber: "",
    ordinaryDividends: "",
    qualifiedDividends: "",
    capitalGainDistributions: "",
    federalIncomeTaxWithheld: "",
    exemptInterestDividends: "",
    foreignTaxPaid: "",
  };
}

export function createEmptyRetirement1099Draft(): Retirement1099Draft {
  return {
    documentId: "",
    distributionId: "",
    payerName: "",
    payerTin: "",
    recipientAccountNumber: "",
    grossDistribution: "",
    taxableAmount: "",
    federalIncomeTaxWithheld: "",
    distributionCode1: "",
    distributionCode2: "",
    taxableAmountNotDetermined: false,
    totalDistribution: true,
    iraSepSimple: false,
  };
}

export function createEmptyEstimatedPaymentDraft(): EstimatedPaymentDraft {
  return {
    paymentId: "",
    amount: "",
    paidDate: "",
    quarter: "Q1",
  };
}

export function createEmptyExtensionPaymentDraft(): ExtensionPaymentDraft {
  return {
    extensionPaymentId: "",
    amount: "",
    paidDate: "",
    formType: "4868",
  };
}

export function emptyPaymentsDraft(): PaymentsDraft {
  return {
    estimatedPayments: [],
    extensionPayments: [],
    priorYearOverpaymentAppliedTo2025: "",
    refundDirectDepositEnabled: false,
    refundBankName: "",
    refundAccountType: "checking",
    refundLast4AccountNumber: "",
    refundLast4RoutingNumber: "",
    refundVaultToken: "",
    balanceDueDirectDebitEnabled: false,
    debitBankName: "",
    debitAccountType: "checking",
    debitLast4AccountNumber: "",
    debitLast4RoutingNumber: "",
    debitVaultToken: "",
    debitRequestedDate: "",
  };
}

export function emptyEfileDraft(): EfileDraft {
  return {
    signatureMethod: "unset",
    taxpayerPinToken: "",
    taxpayerPriorYearAgi: "",
    taxpayerPriorYearPinToken: "",
    taxpayerSignedAt: "",
  };
}

export function incomeDocumentDraftsFromCanonical(
  canonicalReturn: CanonicalReturnEnvelope,
): IncomeDocumentDrafts {
  const sourceDocuments = asArray(canonicalReturn.source_documents);
  const facts = asRecord(canonicalReturn.facts);
  const income = asRecord(facts?.income);

  return {
    w2s: collectDocumentDrafts({
      sourceDocuments,
      documentType: "FORM_W2",
      factRecords: asArray(income?.wages),
      factDocumentId: (record) => asString(record.source_document_id) ?? "",
      fromFact: (record) => {
        const sourcePayload = findSourcePayload(sourceDocuments, asString(record.source_document_id));

        return {
          documentId: asString(record.source_document_id) ?? "",
          wageId: asString(record.wage_id) ?? "",
          employerName:
            asString(record.employer_name) ??
            asString(sourcePayload?.employer_name) ??
            "",
          employerEin:
            asString(record.employer_ein) ??
            asString(sourcePayload?.employer_ein) ??
            "",
          wagesTipsOtherCompensation: draftMoney(
            record.wages_tips_other_compensation ?? sourcePayload?.wages_tips_other_compensation,
          ),
          federalIncomeTaxWithheld: draftMoney(
            record.federal_income_tax_withheld ?? sourcePayload?.federal_income_tax_withheld,
          ),
          socialSecurityWages: draftMoney(
            record.social_security_wages ?? sourcePayload?.social_security_wages,
          ),
          socialSecurityTaxWithheld: draftMoney(
            record.social_security_tax_withheld ??
              sourcePayload?.social_security_tax_withheld,
          ),
          medicareWagesAndTips: draftMoney(
            record.medicare_wages_and_tips ?? sourcePayload?.medicare_wages_and_tips,
          ),
          medicareTaxWithheld: draftMoney(
            record.medicare_tax_withheld ?? sourcePayload?.medicare_tax_withheld,
          ),
          controlNumber: asString(sourcePayload?.control_number) ?? "",
          retirementPlan: asBoolean(sourcePayload?.retirement_plan) ?? false,
        };
      },
      fromSourceDocument: (document) => {
        const payload = asRecord(document.payload);

        return {
          documentId: asString(document.document_id) ?? "",
          wageId: "",
          employerName: asString(payload?.employer_name) ?? "",
          employerEin: asString(payload?.employer_ein) ?? "",
          wagesTipsOtherCompensation: draftMoney(payload?.wages_tips_other_compensation),
          federalIncomeTaxWithheld: draftMoney(payload?.federal_income_tax_withheld),
          socialSecurityWages: draftMoney(payload?.social_security_wages),
          socialSecurityTaxWithheld: draftMoney(payload?.social_security_tax_withheld),
          medicareWagesAndTips: draftMoney(payload?.medicare_wages_and_tips),
          medicareTaxWithheld: draftMoney(payload?.medicare_tax_withheld),
          controlNumber: asString(payload?.control_number) ?? "",
          retirementPlan: asBoolean(payload?.retirement_plan) ?? false,
        };
      },
    }),
    interest1099s: collectDocumentDrafts({
      sourceDocuments,
      documentType: "FORM_1099_INT",
      factRecords: asArray(income?.taxable_interest),
      factDocumentId: (record) => asString(record.source_document_id) ?? "",
      fromFact: (record) => {
        const sourcePayload = findSourcePayload(sourceDocuments, asString(record.source_document_id));

        return {
          documentId: asString(record.source_document_id) ?? "",
          interestId: asString(record.interest_id) ?? "",
          payerName: asString(record.payer_name) ?? asString(sourcePayload?.payer_name) ?? "",
          payerTin: asString(sourcePayload?.payer_tin) ?? "",
          recipientAccountNumber: asString(sourcePayload?.recipient_account_number) ?? "",
          interestIncome: draftMoney(record.interest_income ?? sourcePayload?.interest_income),
          federalIncomeTaxWithheld: draftMoney(
            record.federal_income_tax_withheld ?? sourcePayload?.federal_income_tax_withheld,
          ),
          taxExemptInterest: draftMoney(
            record.tax_exempt_interest ?? sourcePayload?.tax_exempt_interest,
          ),
          usSavingsBondsAndTreasuryInterest: draftMoney(
            record.us_savings_bonds_and_treasury_interest ??
              sourcePayload?.interest_on_us_savings_bonds_and_treasury_obligations,
          ),
          foreignTaxPaid: draftMoney(record.foreign_tax_paid ?? sourcePayload?.foreign_tax_paid),
        };
      },
      fromSourceDocument: (document) => {
        const payload = asRecord(document.payload);

        return {
          documentId: asString(document.document_id) ?? "",
          interestId: "",
          payerName: asString(payload?.payer_name) ?? "",
          payerTin: asString(payload?.payer_tin) ?? "",
          recipientAccountNumber: asString(payload?.recipient_account_number) ?? "",
          interestIncome: draftMoney(payload?.interest_income),
          federalIncomeTaxWithheld: draftMoney(payload?.federal_income_tax_withheld),
          taxExemptInterest: draftMoney(payload?.tax_exempt_interest),
          usSavingsBondsAndTreasuryInterest: draftMoney(
            payload?.interest_on_us_savings_bonds_and_treasury_obligations,
          ),
          foreignTaxPaid: draftMoney(payload?.foreign_tax_paid),
        };
      },
    }),
    dividend1099s: collectDocumentDrafts({
      sourceDocuments,
      documentType: "FORM_1099_DIV",
      factRecords: asArray(income?.dividends),
      factDocumentId: (record) => asString(record.source_document_id) ?? "",
      fromFact: (record) => {
        const sourcePayload = findSourcePayload(sourceDocuments, asString(record.source_document_id));

        return {
          documentId: asString(record.source_document_id) ?? "",
          dividendId: asString(record.dividend_id) ?? "",
          payerName: asString(record.payer_name) ?? asString(sourcePayload?.payer_name) ?? "",
          payerTin: asString(sourcePayload?.payer_tin) ?? "",
          recipientAccountNumber: asString(sourcePayload?.recipient_account_number) ?? "",
          ordinaryDividends: draftMoney(
            record.ordinary_dividends ?? sourcePayload?.ordinary_dividends,
          ),
          qualifiedDividends: draftMoney(
            record.qualified_dividends ?? sourcePayload?.qualified_dividends,
          ),
          capitalGainDistributions: draftMoney(
            record.capital_gain_distributions ??
              sourcePayload?.total_capital_gain_distributions,
          ),
          federalIncomeTaxWithheld: draftMoney(
            record.federal_income_tax_withheld ?? sourcePayload?.federal_income_tax_withheld,
          ),
          exemptInterestDividends: draftMoney(
            record.exempt_interest_dividends ?? sourcePayload?.exempt_interest_dividends,
          ),
          foreignTaxPaid: draftMoney(record.foreign_tax_paid ?? sourcePayload?.foreign_tax_paid),
        };
      },
      fromSourceDocument: (document) => {
        const payload = asRecord(document.payload);

        return {
          documentId: asString(document.document_id) ?? "",
          dividendId: "",
          payerName: asString(payload?.payer_name) ?? "",
          payerTin: asString(payload?.payer_tin) ?? "",
          recipientAccountNumber: asString(payload?.recipient_account_number) ?? "",
          ordinaryDividends: draftMoney(payload?.ordinary_dividends),
          qualifiedDividends: draftMoney(payload?.qualified_dividends),
          capitalGainDistributions: draftMoney(payload?.total_capital_gain_distributions),
          federalIncomeTaxWithheld: draftMoney(payload?.federal_income_tax_withheld),
          exemptInterestDividends: draftMoney(payload?.exempt_interest_dividends),
          foreignTaxPaid: draftMoney(payload?.foreign_tax_paid),
        };
      },
    }),
    retirement1099s: collectDocumentDrafts({
      sourceDocuments,
      documentType: "FORM_1099_R",
      factRecords: asArray(income?.retirement_distributions),
      factDocumentId: (record) => asString(record.source_document_id) ?? "",
      fromFact: (record) => {
        const sourcePayload = findSourcePayload(sourceDocuments, asString(record.source_document_id));
        const distributionCodes = asArray(record.distribution_codes)
          .map((value) => asString(value) ?? "")
          .filter((value) => value.length > 0);

        return {
          documentId: asString(record.source_document_id) ?? "",
          distributionId: asString(record.distribution_id) ?? "",
          payerName: asString(record.payer_name) ?? asString(sourcePayload?.payer_name) ?? "",
          payerTin: asString(sourcePayload?.payer_tin) ?? "",
          recipientAccountNumber: asString(sourcePayload?.recipient_account_number) ?? "",
          grossDistribution: draftMoney(
            record.gross_distribution ?? sourcePayload?.gross_distribution,
          ),
          taxableAmount: draftMoney(record.taxable_amount ?? sourcePayload?.taxable_amount),
          federalIncomeTaxWithheld: draftMoney(
            record.federal_income_tax_withheld ?? sourcePayload?.federal_income_tax_withheld,
          ),
          distributionCode1:
            distributionCodes[0] ??
            asString(sourcePayload?.distribution_code_1) ??
            "",
          distributionCode2:
            distributionCodes[1] ??
            asString(sourcePayload?.distribution_code_2) ??
            "",
          taxableAmountNotDetermined:
            asBoolean(sourcePayload?.taxable_amount_not_determined) ?? false,
          totalDistribution: asBoolean(sourcePayload?.total_distribution) ?? true,
          iraSepSimple:
            asBoolean(record.ira_sep_simple) ??
            asBoolean(sourcePayload?.ira_sep_simple) ??
            false,
        };
      },
      fromSourceDocument: (document) => {
        const payload = asRecord(document.payload);

        return {
          documentId: asString(document.document_id) ?? "",
          distributionId: "",
          payerName: asString(payload?.payer_name) ?? "",
          payerTin: asString(payload?.payer_tin) ?? "",
          recipientAccountNumber: asString(payload?.recipient_account_number) ?? "",
          grossDistribution: draftMoney(payload?.gross_distribution),
          taxableAmount: draftMoney(payload?.taxable_amount),
          federalIncomeTaxWithheld: draftMoney(payload?.federal_income_tax_withheld),
          distributionCode1: asString(payload?.distribution_code_1) ?? "",
          distributionCode2: asString(payload?.distribution_code_2) ?? "",
          taxableAmountNotDetermined:
            asBoolean(payload?.taxable_amount_not_determined) ?? false,
          totalDistribution: asBoolean(payload?.total_distribution) ?? true,
          iraSepSimple: asBoolean(payload?.ira_sep_simple) ?? false,
        };
      },
    }),
  };
}

export function paymentsDraftFromCanonical(
  canonicalReturn: CanonicalReturnEnvelope,
): PaymentsDraft {
  const facts = asRecord(canonicalReturn.facts);
  const payments = asRecord(facts?.payments);
  const refundDirectDeposit = asRecord(payments?.refund_direct_deposit);
  const balanceDueDirectDebit = asRecord(payments?.balance_due_direct_debit);
  const debitBankAccount = asRecord(balanceDueDirectDebit?.bank_account);

  return {
    estimatedPayments: asArray(payments?.estimated_payments)
      .map((value) => asRecord(value))
      .filter((record): record is Record<string, unknown> => record != null)
      .filter((record) => (asString(record.jurisdiction) ?? "federal") === "federal")
      .map((record) => ({
        paymentId: asString(record.payment_id) ?? "",
        amount: draftMoney(record.amount),
        paidDate: asString(record.paid_date) ?? "",
        quarter: readQuarter(record.quarter),
      })),
    extensionPayments: asArray(payments?.extension_payments)
      .map((value) => asRecord(value))
      .filter((record): record is Record<string, unknown> => record != null)
      .filter((record) => (asString(record.jurisdiction) ?? "federal") === "federal")
      .map((record) => ({
        extensionPaymentId: asString(record.extension_payment_id) ?? "",
        amount: draftMoney(record.amount),
        paidDate: asString(record.paid_date) ?? "",
        formType: readExtensionFormType(record.form_type),
      })),
    priorYearOverpaymentAppliedTo2025: draftMoney(
      payments?.prior_year_overpayment_applied_to_2025,
    ),
    refundDirectDepositEnabled: hasBankInstruction(refundDirectDeposit),
    refundBankName: asString(refundDirectDeposit?.bank_name) ?? "",
    refundAccountType: readBankAccountType(refundDirectDeposit?.account_type),
    refundLast4AccountNumber:
      asString(refundDirectDeposit?.last4_account_number) ?? "",
    refundLast4RoutingNumber:
      asString(refundDirectDeposit?.last4_routing_number) ?? "",
    refundVaultToken: asString(refundDirectDeposit?.vault_token) ?? "",
    balanceDueDirectDebitEnabled:
      balanceDueDirectDebit != null &&
      (hasBankInstruction(debitBankAccount) ||
        (asString(balanceDueDirectDebit?.requested_debit_date) ?? "").length > 0),
    debitBankName: asString(debitBankAccount?.bank_name) ?? "",
    debitAccountType: readBankAccountType(debitBankAccount?.account_type),
    debitLast4AccountNumber:
      asString(debitBankAccount?.last4_account_number) ?? "",
    debitLast4RoutingNumber:
      asString(debitBankAccount?.last4_routing_number) ?? "",
    debitVaultToken: asString(debitBankAccount?.vault_token) ?? "",
    debitRequestedDate: asString(balanceDueDirectDebit?.requested_debit_date) ?? "",
  };
}

export function efileDraftFromCanonical(canonicalReturn: CanonicalReturnEnvelope): EfileDraft {
  const efile = asRecord(canonicalReturn.efile);
  const taxpayerSigner = asArray(efile?.signers)
    .map((value) => asRecord(value))
    .find((record) => asString(record?.person_id) === taxpayerPersonId);

  return {
    signatureMethod: readSignatureMethod(efile?.signature_method),
    taxpayerPinToken: asString(taxpayerSigner?.pin_token) ?? "",
    taxpayerPriorYearAgi: draftMoney(taxpayerSigner?.prior_year_agi),
    taxpayerPriorYearPinToken: asString(taxpayerSigner?.prior_year_pin_token) ?? "",
    taxpayerSignedAt: asString(taxpayerSigner?.signed_at) ?? "",
  };
}

export function applyIncomeDocumentDrafts(
  canonicalReturn: CanonicalReturnEnvelope,
  options: {
    readonly drafts: IncomeDocumentDrafts;
    readonly writtenAt: string;
  },
): CanonicalReturnEnvelope {
  const next = structuredClone(canonicalReturn);
  const sourceDocuments = asArray(next.source_documents)
    .map((value) => asRecord(value))
    .filter((record): record is Record<string, unknown> => record != null);
  const preservedSourceDocuments = sourceDocuments.filter((record) => {
    const documentType = asString(record.document_type) ?? "";
    return !editableDocumentTypes.has(documentType);
  });
  const facts = asRecord(next.facts) ?? {};
  const income = asRecord(facts.income) ?? {};
  const payments = asRecord(facts.payments) ?? {};

  const wageFacts = asArray(income.wages)
    .map((value) => asRecord(value))
    .filter((record): record is Record<string, unknown> => record != null);
  const interestFacts = asArray(income.taxable_interest)
    .map((value) => asRecord(value))
    .filter((record): record is Record<string, unknown> => record != null);
  const dividendFacts = asArray(income.dividends)
    .map((value) => asRecord(value))
    .filter((record): record is Record<string, unknown> => record != null);
  const retirementFacts = asArray(income.retirement_distributions)
    .map((value) => asRecord(value))
    .filter((record): record is Record<string, unknown> => record != null);
  const wageFactsById = indexById(wageFacts, "wage_id");
  const interestFactsById = indexById(interestFacts, "interest_id");
  const dividendFactsById = indexById(dividendFacts, "dividend_id");
  const retirementFactsById = indexById(retirementFacts, "distribution_id");
  const sourceDocumentsById = indexById(sourceDocuments, "document_id");

  const serializedW2s = options.drafts.w2s
    .filter(hasW2Content)
    .map((draft, index) => {
      const documentId = stableId(draft.documentId, "doc_w2", index);
      const wageId = stableId(draft.wageId, "wage", index);
      const sourceDocument = sourceDocumentsById.get(draft.documentId);
      const sourcePayload = asRecord(sourceDocument?.payload) ?? {};
      const wageFact = wageFactsById.get(draft.wageId);

      return {
        document: {
          ...sourceDocument,
          document_id: documentId,
          document_type: "FORM_W2",
          tax_year: 2025,
          issuer_name: draft.employerName.trim(),
          recipient_person_ids: readRecipientPersonIds(sourceDocument),
          source_file:
            asRecord(sourceDocument?.source_file) ??
            createManualSourceFile(documentId, "FORM_W2", options.writtenAt),
          parse_status: asString(sourceDocument?.parse_status) ?? "manual_only",
          extracted_fields: asArray(sourceDocument?.extracted_fields),
          payload: {
            ...sourcePayload,
            employer_name: draft.employerName.trim(),
            employer_ein: parseEinOrNull(draft.employerEin),
            control_number: draft.controlNumber.trim(),
            wages_tips_other_compensation: parseMoneyOrNull(
              draft.wagesTipsOtherCompensation,
              "W-2 wages",
            ),
            federal_income_tax_withheld: parseMoneyOrNull(
              draft.federalIncomeTaxWithheld,
              "W-2 federal withholding",
            ),
            social_security_wages:
              parseMoneyOrNull(draft.socialSecurityWages, "W-2 social security wages") ??
              parseMoneyOrNull(draft.wagesTipsOtherCompensation, "W-2 wages"),
            social_security_tax_withheld: parseMoneyOrNull(
              draft.socialSecurityTaxWithheld,
              "W-2 social security tax withheld",
            ),
            medicare_wages_and_tips:
              parseMoneyOrNull(draft.medicareWagesAndTips, "W-2 medicare wages") ??
              parseMoneyOrNull(draft.wagesTipsOtherCompensation, "W-2 wages"),
            medicare_tax_withheld: parseMoneyOrNull(
              draft.medicareTaxWithheld,
              "W-2 medicare tax withheld",
            ),
            box12: asArray(sourcePayload.box12),
            box14: asArray(sourcePayload.box14),
            state_local_rows: asArray(sourcePayload.state_local_rows),
            retirement_plan: draft.retirementPlan,
          },
        },
        fact: {
          ...wageFact,
          wage_id: wageId,
          person_id: taxpayerPersonId,
          source_document_id: documentId,
          employer_name: draft.employerName.trim(),
          employer_ein: parseEinOrNull(draft.employerEin),
          wages_tips_other_compensation: parseMoneyOrNull(
            draft.wagesTipsOtherCompensation,
            "W-2 wages",
          ),
          federal_income_tax_withheld: parseMoneyOrNull(
            draft.federalIncomeTaxWithheld,
            "W-2 federal withholding",
          ),
          social_security_wages:
            parseMoneyOrNull(draft.socialSecurityWages, "W-2 social security wages") ??
            parseMoneyOrNull(draft.wagesTipsOtherCompensation, "W-2 wages"),
          social_security_tax_withheld: parseMoneyOrNull(
            draft.socialSecurityTaxWithheld,
            "W-2 social security tax withheld",
          ),
          medicare_wages_and_tips:
            parseMoneyOrNull(draft.medicareWagesAndTips, "W-2 medicare wages") ??
            parseMoneyOrNull(draft.wagesTipsOtherCompensation, "W-2 wages"),
          medicare_tax_withheld: parseMoneyOrNull(
            draft.medicareTaxWithheld,
            "W-2 medicare tax withheld",
          ),
          box12: asArray(wageFact?.box12),
          box14: asArray(wageFact?.box14),
          state_local_rows:
            asArray(wageFact?.state_local_rows).length > 0
              ? asArray(wageFact?.state_local_rows)
              : asArray(sourcePayload.state_local_rows),
          is_household_employee: asBoolean(wageFact?.is_household_employee) ?? false,
        },
        federalWithholdingAmount: parseMoneyOrNull(
          draft.federalIncomeTaxWithheld,
          "W-2 federal withholding",
        ),
      };
    });

  const serializedInterest = options.drafts.interest1099s
    .filter(hasInterestContent)
    .map((draft, index) => {
      const documentId = stableId(draft.documentId, "doc_1099int", index);
      const interestId = stableId(draft.interestId, "int", index);
      const sourceDocument = sourceDocumentsById.get(draft.documentId);
      const sourcePayload = asRecord(sourceDocument?.payload) ?? {};
      const interestFact = interestFactsById.get(draft.interestId);

      return {
        document: {
          ...sourceDocument,
          document_id: documentId,
          document_type: "FORM_1099_INT",
          tax_year: 2025,
          issuer_name: draft.payerName.trim(),
          recipient_person_ids: readRecipientPersonIds(sourceDocument),
          source_file:
            asRecord(sourceDocument?.source_file) ??
            createManualSourceFile(documentId, "FORM_1099_INT", options.writtenAt),
          parse_status: asString(sourceDocument?.parse_status) ?? "manual_only",
          extracted_fields: asArray(sourceDocument?.extracted_fields),
          payload: {
            ...sourcePayload,
            payer_name: draft.payerName.trim(),
            payer_tin: parseEinOrNull(draft.payerTin),
            recipient_account_number: draft.recipientAccountNumber.trim(),
            interest_income: parseMoneyOrNull(draft.interestIncome, "1099-INT interest income"),
            interest_on_us_savings_bonds_and_treasury_obligations: parseMoneyOrNull(
              draft.usSavingsBondsAndTreasuryInterest,
              "1099-INT U.S. savings bonds interest",
            ),
            federal_income_tax_withheld: parseMoneyOrNull(
              draft.federalIncomeTaxWithheld,
              "1099-INT federal withholding",
            ),
            foreign_tax_paid: parseMoneyOrNull(draft.foreignTaxPaid, "1099-INT foreign tax paid"),
            tax_exempt_interest: parseMoneyOrNull(
              draft.taxExemptInterest,
              "1099-INT tax-exempt interest",
            ),
            state_local_rows: asArray(sourcePayload.state_local_rows),
          },
        },
        fact: {
          ...interestFact,
          interest_id: interestId,
          person_id: taxpayerPersonId,
          source_document_id: documentId,
          payer_name: draft.payerName.trim(),
          interest_income: parseMoneyOrNull(draft.interestIncome, "1099-INT interest income"),
          tax_exempt_interest: parseMoneyOrNull(
            draft.taxExemptInterest,
            "1099-INT tax-exempt interest",
          ),
          us_savings_bonds_and_treasury_interest: parseMoneyOrNull(
            draft.usSavingsBondsAndTreasuryInterest,
            "1099-INT U.S. savings bonds interest",
          ),
          federal_income_tax_withheld: parseMoneyOrNull(
            draft.federalIncomeTaxWithheld,
            "1099-INT federal withholding",
          ),
          foreign_tax_paid: parseMoneyOrNull(draft.foreignTaxPaid, "1099-INT foreign tax paid"),
          state_local_rows:
            asArray(interestFact?.state_local_rows).length > 0
              ? asArray(interestFact?.state_local_rows)
              : asArray(sourcePayload.state_local_rows),
        },
        federalWithholdingAmount: parseMoneyOrNull(
          draft.federalIncomeTaxWithheld,
          "1099-INT federal withholding",
        ),
      };
    });

  const serializedDividends = options.drafts.dividend1099s
    .filter(hasDividendContent)
    .map((draft, index) => {
      const documentId = stableId(draft.documentId, "doc_1099div", index);
      const dividendId = stableId(draft.dividendId, "div", index);
      const sourceDocument = sourceDocumentsById.get(draft.documentId);
      const sourcePayload = asRecord(sourceDocument?.payload) ?? {};
      const dividendFact = dividendFactsById.get(draft.dividendId);

      return {
        document: {
          ...sourceDocument,
          document_id: documentId,
          document_type: "FORM_1099_DIV",
          tax_year: 2025,
          issuer_name: draft.payerName.trim(),
          recipient_person_ids: readRecipientPersonIds(sourceDocument),
          source_file:
            asRecord(sourceDocument?.source_file) ??
            createManualSourceFile(documentId, "FORM_1099_DIV", options.writtenAt),
          parse_status: asString(sourceDocument?.parse_status) ?? "manual_only",
          extracted_fields: asArray(sourceDocument?.extracted_fields),
          payload: {
            ...sourcePayload,
            payer_name: draft.payerName.trim(),
            payer_tin: parseEinOrNull(draft.payerTin),
            recipient_account_number: draft.recipientAccountNumber.trim(),
            ordinary_dividends: parseMoneyOrNull(
              draft.ordinaryDividends,
              "1099-DIV ordinary dividends",
            ),
            qualified_dividends: parseMoneyOrNull(
              draft.qualifiedDividends,
              "1099-DIV qualified dividends",
            ),
            total_capital_gain_distributions: parseMoneyOrNull(
              draft.capitalGainDistributions,
              "1099-DIV capital gain distributions",
            ),
            federal_income_tax_withheld: parseMoneyOrNull(
              draft.federalIncomeTaxWithheld,
              "1099-DIV federal withholding",
            ),
            exempt_interest_dividends: parseMoneyOrNull(
              draft.exemptInterestDividends,
              "1099-DIV exempt interest dividends",
            ),
            foreign_tax_paid: parseMoneyOrNull(
              draft.foreignTaxPaid,
              "1099-DIV foreign tax paid",
            ),
            state_local_rows: asArray(sourcePayload.state_local_rows),
          },
        },
        fact: {
          ...dividendFact,
          dividend_id: dividendId,
          person_id: taxpayerPersonId,
          source_document_id: documentId,
          payer_name: draft.payerName.trim(),
          ordinary_dividends: parseMoneyOrNull(
            draft.ordinaryDividends,
            "1099-DIV ordinary dividends",
          ),
          qualified_dividends: parseMoneyOrNull(
            draft.qualifiedDividends,
            "1099-DIV qualified dividends",
          ),
          capital_gain_distributions: parseMoneyOrNull(
            draft.capitalGainDistributions,
            "1099-DIV capital gain distributions",
          ),
          federal_income_tax_withheld: parseMoneyOrNull(
            draft.federalIncomeTaxWithheld,
            "1099-DIV federal withholding",
          ),
          exempt_interest_dividends: parseMoneyOrNull(
            draft.exemptInterestDividends,
            "1099-DIV exempt interest dividends",
          ),
          foreign_tax_paid: parseMoneyOrNull(
            draft.foreignTaxPaid,
            "1099-DIV foreign tax paid",
          ),
          state_local_rows:
            asArray(dividendFact?.state_local_rows).length > 0
              ? asArray(dividendFact?.state_local_rows)
              : asArray(sourcePayload.state_local_rows),
        },
        federalWithholdingAmount: parseMoneyOrNull(
          draft.federalIncomeTaxWithheld,
          "1099-DIV federal withholding",
        ),
      };
    });

  const serializedRetirement = options.drafts.retirement1099s
    .filter(hasRetirementContent)
    .map((draft, index) => {
      const documentId = stableId(draft.documentId, "doc_1099r", index);
      const distributionId = stableId(draft.distributionId, "ret", index);
      const sourceDocument = sourceDocumentsById.get(draft.documentId);
      const sourcePayload = asRecord(sourceDocument?.payload) ?? {};
      const distributionFact = retirementFactsById.get(draft.distributionId);

      return {
        document: {
          ...sourceDocument,
          document_id: documentId,
          document_type: "FORM_1099_R",
          tax_year: 2025,
          issuer_name: draft.payerName.trim(),
          recipient_person_ids: readRecipientPersonIds(sourceDocument),
          source_file:
            asRecord(sourceDocument?.source_file) ??
            createManualSourceFile(documentId, "FORM_1099_R", options.writtenAt),
          parse_status: asString(sourceDocument?.parse_status) ?? "manual_only",
          extracted_fields: asArray(sourceDocument?.extracted_fields),
          payload: {
            ...sourcePayload,
            payer_name: draft.payerName.trim(),
            payer_tin: parseEinOrNull(draft.payerTin),
            recipient_account_number: draft.recipientAccountNumber.trim(),
            gross_distribution: parseMoneyOrNull(
              draft.grossDistribution,
              "1099-R gross distribution",
            ),
            taxable_amount: parseMoneyOrNull(
              draft.taxableAmount,
              "1099-R taxable amount",
            ),
            taxable_amount_not_determined: draft.taxableAmountNotDetermined,
            total_distribution: draft.totalDistribution,
            federal_income_tax_withheld: parseMoneyOrNull(
              draft.federalIncomeTaxWithheld,
              "1099-R federal withholding",
            ),
            distribution_code_1: draft.distributionCode1.trim(),
            distribution_code_2: draft.distributionCode2.trim(),
            ira_sep_simple: draft.iraSepSimple,
            state_local_rows: asArray(sourcePayload.state_local_rows),
          },
        },
        fact: {
          ...distributionFact,
          distribution_id: distributionId,
          person_id: taxpayerPersonId,
          source_document_id: documentId,
          payer_name: draft.payerName.trim(),
          gross_distribution: parseMoneyOrNull(
            draft.grossDistribution,
            "1099-R gross distribution",
          ),
          taxable_amount: parseMoneyOrNull(draft.taxableAmount, "1099-R taxable amount"),
          federal_income_tax_withheld: parseMoneyOrNull(
            draft.federalIncomeTaxWithheld,
            "1099-R federal withholding",
          ),
          distribution_codes: [
            draft.distributionCode1.trim(),
            draft.distributionCode2.trim(),
          ].filter((value) => value.length > 0),
          ira_sep_simple: draft.iraSepSimple,
          state_local_rows:
            asArray(distributionFact?.state_local_rows).length > 0
              ? asArray(distributionFact?.state_local_rows)
              : asArray(sourcePayload.state_local_rows),
        },
        federalWithholdingAmount: parseMoneyOrNull(
          draft.federalIncomeTaxWithheld,
          "1099-R federal withholding",
        ),
      };
    });

  const editableSourceDocumentIds = new Set([
    ...serializedW2s.map((item) => item.document.document_id),
    ...serializedInterest.map((item) => item.document.document_id),
    ...serializedDividends.map((item) => item.document.document_id),
    ...serializedRetirement.map((item) => item.document.document_id),
  ]);
  const preservedWithholdings = asArray(payments.withholdings)
    .map((value) => asRecord(value))
    .filter((record): record is Record<string, unknown> => record != null)
    .filter((record) => {
      const sourceDocumentId = asString(record.source_document_id) ?? "";
      const jurisdiction = asString(record.jurisdiction) ?? "";

      return !(jurisdiction === "federal" && editableSourceDocumentIds.has(sourceDocumentId));
    });
  const generatedWithholdings = [
    ...serializedW2s.map((item, index) =>
      buildFederalWithholding({
        amount: item.federalWithholdingAmount,
        description: "Federal withholding from W-2",
        sourceDocumentId: item.document.document_id,
        withholdingId: `wh_w2_${index + 1}`,
      }),
    ),
    ...serializedInterest.map((item, index) =>
      buildFederalWithholding({
        amount: item.federalWithholdingAmount,
        description: "Federal withholding from 1099-INT",
        sourceDocumentId: item.document.document_id,
        withholdingId: `wh_1099int_${index + 1}`,
      }),
    ),
    ...serializedDividends.map((item, index) =>
      buildFederalWithholding({
        amount: item.federalWithholdingAmount,
        description: "Federal withholding from 1099-DIV",
        sourceDocumentId: item.document.document_id,
        withholdingId: `wh_1099div_${index + 1}`,
      }),
    ),
    ...serializedRetirement.map((item, index) =>
      buildFederalWithholding({
        amount: item.federalWithholdingAmount,
        description: "Federal withholding from 1099-R",
        sourceDocumentId: item.document.document_id,
        withholdingId: `wh_1099r_${index + 1}`,
      }),
    ),
  ].filter((value): value is Record<string, unknown> => value != null);

  return {
    ...next,
    source_documents: [
      ...preservedSourceDocuments,
      ...serializedW2s.map((item) => item.document),
      ...serializedInterest.map((item) => item.document),
      ...serializedDividends.map((item) => item.document),
      ...serializedRetirement.map((item) => item.document),
    ] as never,
    facts: {
      ...facts,
      income: {
        ...income,
        wages: serializedW2s.map((item) => item.fact),
        taxable_interest: serializedInterest.map((item) => item.fact),
        dividends: serializedDividends.map((item) => item.fact),
        retirement_distributions: serializedRetirement.map((item) => item.fact),
      },
      payments: {
        ...payments,
        withholdings: [...preservedWithholdings, ...generatedWithholdings],
      },
    } as never,
  };
}

export function applyPaymentsDraft(
  canonicalReturn: CanonicalReturnEnvelope,
  draft: PaymentsDraft,
): CanonicalReturnEnvelope {
  const next = structuredClone(canonicalReturn);
  const facts = asRecord(next.facts) ?? {};
  const payments = asRecord(facts.payments) ?? {};
  const preservedEstimatedPayments = asArray(payments.estimated_payments)
    .map((value) => asRecord(value))
    .filter((record): record is Record<string, unknown> => record != null)
    .filter((record) => (asString(record.jurisdiction) ?? "federal") !== "federal");
  const preservedExtensionPayments = asArray(payments.extension_payments)
    .map((value) => asRecord(value))
    .filter((record): record is Record<string, unknown> => record != null)
    .filter((record) => (asString(record.jurisdiction) ?? "federal") !== "federal");

  return {
    ...next,
    facts: {
      ...facts,
      payments: {
        ...payments,
        estimated_payments: [
          ...preservedEstimatedPayments,
          ...draft.estimatedPayments
            .filter(hasEstimatedPaymentContent)
            .map((payment, index) => ({
              payment_id: stableId(payment.paymentId, "est", index),
              jurisdiction: "federal",
              amount: requireMoney(payment.amount, "Estimated payment amount"),
              paid_date: requireIsoDate(payment.paidDate, "Estimated payment date"),
              quarter: payment.quarter,
            })),
        ],
        extension_payments: [
          ...preservedExtensionPayments,
          ...draft.extensionPayments
            .filter(hasExtensionPaymentContent)
            .map((payment, index) => ({
              extension_payment_id: stableId(
                payment.extensionPaymentId,
                "ext",
                index,
              ),
              jurisdiction: "federal",
              amount: requireMoney(payment.amount, "Extension payment amount"),
              paid_date: requireIsoDate(payment.paidDate, "Extension payment date"),
              form_type: payment.formType,
            })),
        ],
        prior_year_overpayment_applied_to_2025: parseMoneyOrNull(
          draft.priorYearOverpaymentAppliedTo2025,
          "Prior-year overpayment applied to 2025",
        ),
        refund_direct_deposit: draft.refundDirectDepositEnabled
          ? {
              bank_name: draft.refundBankName.trim(),
              account_type: draft.refundAccountType,
              last4_account_number: optionalLast4(
                draft.refundLast4AccountNumber,
                "Refund account last four",
              ),
              last4_routing_number: optionalLast4(
                draft.refundLast4RoutingNumber,
                "Refund routing last four",
              ),
              vault_token:
                draft.refundVaultToken.trim().length > 0
                  ? draft.refundVaultToken.trim()
                  : "vault:bank:refund",
            }
          : null,
        balance_due_direct_debit: draft.balanceDueDirectDebitEnabled
          ? {
              bank_account: {
                bank_name: draft.debitBankName.trim(),
                account_type: draft.debitAccountType,
                last4_account_number: optionalLast4(
                  draft.debitLast4AccountNumber,
                  "Debit account last four",
                ),
                last4_routing_number: optionalLast4(
                  draft.debitLast4RoutingNumber,
                  "Debit routing last four",
                ),
                vault_token:
                  draft.debitVaultToken.trim().length > 0
                    ? draft.debitVaultToken.trim()
                    : "vault:bank:debit",
              },
              requested_debit_date: requireIsoDate(
                draft.debitRequestedDate,
                "Balance-due debit date",
              ),
            }
          : null,
      },
    } as never,
  };
}

export function applyEfileDraft(
  canonicalReturn: CanonicalReturnEnvelope,
  draft: EfileDraft,
): CanonicalReturnEnvelope {
  const next = structuredClone(canonicalReturn);
  const efile = asRecord(next.efile) ?? {};
  const preservedSigners = asArray(efile.signers)
    .map((value) => asRecord(value))
    .filter((record): record is Record<string, unknown> => record != null)
    .filter((record) => asString(record.person_id) !== taxpayerPersonId);
  const includeTaxpayerSigner =
    draft.taxpayerPinToken.trim().length > 0 ||
    draft.taxpayerPriorYearAgi.trim().length > 0 ||
    draft.taxpayerPriorYearPinToken.trim().length > 0 ||
    draft.taxpayerSignedAt.trim().length > 0 ||
    draft.signatureMethod === "self_select_pin" ||
    draft.signatureMethod === "practitioner_pin";

  return {
    ...next,
    efile: {
      ...efile,
      signature_method: draft.signatureMethod === "unset" ? null : draft.signatureMethod,
      signers: includeTaxpayerSigner
        ? [
            {
              person_id: taxpayerPersonId,
              pin_token:
                draft.taxpayerPinToken.trim().length > 0
                  ? draft.taxpayerPinToken.trim()
                  : draft.signatureMethod === "self_select_pin" ||
                      draft.signatureMethod === "practitioner_pin"
                    ? "vault:pin:taxpayer"
                    : null,
              prior_year_agi: parseMoneyOrNull(
                draft.taxpayerPriorYearAgi,
                "Taxpayer prior-year AGI",
              ),
              prior_year_pin_token:
                draft.taxpayerPriorYearPinToken.trim().length > 0
                  ? draft.taxpayerPriorYearPinToken.trim()
                  : null,
              signed_at:
                draft.taxpayerSignedAt.trim().length > 0
                  ? requireDateTime(draft.taxpayerSignedAt, "Taxpayer signed at")
                  : null,
            },
            ...preservedSigners,
          ]
        : preservedSigners,
    } as never,
  };
}

function collectDocumentDrafts<T>(options: {
  readonly sourceDocuments: ReadonlyArray<unknown>;
  readonly documentType: string;
  readonly factRecords: ReadonlyArray<unknown>;
  readonly factDocumentId: (record: Record<string, unknown>) => string;
  readonly fromFact: (record: Record<string, unknown>) => T;
  readonly fromSourceDocument: (document: Record<string, unknown>) => T;
}): ReadonlyArray<T> {
  const drafts = options.factRecords
    .map((value) => asRecord(value))
    .filter((record): record is Record<string, unknown> => record != null)
    .map(options.fromFact);
  const existingDocumentIds = new Set(
    options.factRecords
      .map((value) => asRecord(value))
      .filter((record): record is Record<string, unknown> => record != null)
      .map(options.factDocumentId)
      .filter((value) => value.length > 0),
  );

  for (const value of options.sourceDocuments) {
    const document = asRecord(value);

    if (document == null) {
      continue;
    }

    if ((asString(document.document_type) ?? "") !== options.documentType) {
      continue;
    }

    const documentId = asString(document.document_id) ?? "";

    if (documentId.length > 0 && existingDocumentIds.has(documentId)) {
      continue;
    }

    drafts.push(options.fromSourceDocument(document));
  }

  return drafts;
}

function buildFederalWithholding(options: {
  readonly amount: number | null;
  readonly description: string;
  readonly sourceDocumentId: string;
  readonly withholdingId: string;
}): Record<string, unknown> | null {
  if (options.amount == null || options.amount <= 0) {
    return null;
  }

  return {
    withholding_id: options.withholdingId,
    person_id: taxpayerPersonId,
    jurisdiction: "federal",
    state_code: null,
    locality_name: "",
    source_document_id: options.sourceDocumentId,
    amount: options.amount,
    description: options.description,
  };
}

function createManualSourceFile(
  documentId: string,
  documentType: string,
  writtenAt: string,
): Record<string, unknown> {
  return {
    file_name: `${documentType.toLowerCase()}-${documentId}.json`,
    mime_type: "application/json",
    storage_uri: `manual://${documentId}`,
    uploaded_at: writtenAt,
    capture_method: "manual_entry",
  };
}

function findSourcePayload(
  sourceDocuments: ReadonlyArray<unknown>,
  sourceDocumentId: string | null,
): Record<string, unknown> | null {
  if (sourceDocumentId == null || sourceDocumentId.length === 0) {
    return null;
  }

  for (const value of sourceDocuments) {
    const document = asRecord(value);

    if (document == null || asString(document.document_id) !== sourceDocumentId) {
      continue;
    }

    return asRecord(document.payload);
  }

  return null;
}

function indexById(
  records: ReadonlyArray<Record<string, unknown>>,
  key: string,
): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();

  for (const record of records) {
    const id = asString(record[key]) ?? "";

    if (id.length > 0) {
      result.set(id, record);
    }
  }

  return result;
}

function readRecipientPersonIds(sourceDocument: Record<string, unknown> | undefined): ReadonlyArray<string> {
  const recipientPersonIds = asArray(sourceDocument?.recipient_person_ids)
    .map((value) => asString(value) ?? "")
    .filter((value) => value.length > 0);

  return recipientPersonIds.length > 0 ? recipientPersonIds : [taxpayerPersonId];
}

function stableId(existingId: string, prefix: string, index: number): string {
  return existingId.trim().length > 0 ? existingId.trim() : `${prefix}_${index + 1}`;
}

function draftMoney(value: unknown): string {
  const numericValue = asNumber(value);
  return numericValue == null ? "" : `${numericValue}`;
}

function parseMoneyOrNull(value: string, label: string): number | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const numericValue = Number(trimmed);

  if (!Number.isFinite(numericValue)) {
    throw new CliInteractiveValidationError({
      message: `${label} must be a valid number.`,
    });
  }

  return numericValue;
}

function requireMoney(value: string, label: string): number {
  const parsed = parseMoneyOrNull(value, label);

  if (parsed == null) {
    throw new CliInteractiveValidationError({
      message: `${label} is required.`,
    });
  }

  return parsed;
}

function requireIsoDate(value: string, label: string): string {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new CliInteractiveValidationError({
      message: `${label} must use YYYY-MM-DD.`,
    });
  }

  return trimmed;
}

function requireDateTime(value: string, label: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0 || Number.isNaN(Date.parse(trimmed))) {
    throw new CliInteractiveValidationError({
      message: `${label} must be a valid date-time string.`,
    });
  }

  return trimmed;
}

function parseEinOrNull(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (!/^\d{2}-?\d{7}$/.test(trimmed)) {
    throw new CliInteractiveValidationError({
      message: "Employer or payer TIN must look like an EIN.",
    });
  }

  return trimmed;
}

function optionalLast4(value: string, label: string): string | undefined {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (!/^\d{4}$/.test(trimmed)) {
    throw new CliInteractiveValidationError({
      message: `${label} must be exactly four digits.`,
    });
  }

  return trimmed;
}

function hasBankInstruction(record: Record<string, unknown> | null | undefined): boolean {
  if (record == null) {
    return false;
  }

  return (
    (asString(record.vault_token) ?? "").trim().length > 0 ||
    (asString(record.bank_name) ?? "").trim().length > 0 ||
    (asString(record.last4_account_number) ?? "").trim().length > 0 ||
    (asString(record.last4_routing_number) ?? "").trim().length > 0 ||
    record.account_type === "checking" ||
    record.account_type === "savings"
  );
}

function hasW2Content(draft: W2Draft): boolean {
  return hasAnyValue([
    draft.employerName,
    draft.employerEin,
    draft.wagesTipsOtherCompensation,
    draft.federalIncomeTaxWithheld,
    draft.socialSecurityWages,
    draft.socialSecurityTaxWithheld,
    draft.medicareWagesAndTips,
    draft.medicareTaxWithheld,
    draft.controlNumber,
  ]);
}

function hasInterestContent(draft: Interest1099Draft): boolean {
  return hasAnyValue([
    draft.payerName,
    draft.payerTin,
    draft.recipientAccountNumber,
    draft.interestIncome,
    draft.federalIncomeTaxWithheld,
    draft.taxExemptInterest,
    draft.usSavingsBondsAndTreasuryInterest,
    draft.foreignTaxPaid,
  ]);
}

function hasDividendContent(draft: Dividend1099Draft): boolean {
  return hasAnyValue([
    draft.payerName,
    draft.payerTin,
    draft.recipientAccountNumber,
    draft.ordinaryDividends,
    draft.qualifiedDividends,
    draft.capitalGainDistributions,
    draft.federalIncomeTaxWithheld,
    draft.exemptInterestDividends,
    draft.foreignTaxPaid,
  ]);
}

function hasRetirementContent(draft: Retirement1099Draft): boolean {
  return hasAnyValue([
    draft.payerName,
    draft.payerTin,
    draft.recipientAccountNumber,
    draft.grossDistribution,
    draft.taxableAmount,
    draft.federalIncomeTaxWithheld,
    draft.distributionCode1,
    draft.distributionCode2,
  ]);
}

function hasEstimatedPaymentContent(draft: EstimatedPaymentDraft): boolean {
  return hasAnyValue([draft.amount, draft.paidDate]);
}

function hasExtensionPaymentContent(draft: ExtensionPaymentDraft): boolean {
  return hasAnyValue([draft.amount, draft.paidDate]);
}

function hasAnyValue(values: ReadonlyArray<string>): boolean {
  return values.some((value) => value.trim().length > 0);
}

function readQuarter(value: unknown): EstimatedPaymentQuarter {
  switch (value) {
    case "Q2":
    case "Q3":
    case "Q4":
    case "other":
      return value;
    case "Q1":
    default:
      return "Q1";
  }
}

function readExtensionFormType(value: unknown): ExtensionFormType {
  switch (value) {
    case "2350":
    case "other":
      return value;
    case "4868":
    default:
      return "4868";
  }
}

function readSignatureMethod(value: unknown): SignatureMethodOption {
  switch (value) {
    case "self_select_pin":
    case "practitioner_pin":
    case "paper":
      return value;
    default:
      return "unset";
  }
}

function readBankAccountType(value: unknown): BankAccountTypeOption {
  return value === "savings" ? "savings" : "checking";
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}
