import { CliInteractiveValidationError } from "../core/errors";
import { asArray, asRecord, asString } from "../core/object";
import type { HouseholdDraft } from "./interactive-workflow";
import type { SupplementalFederalDraft } from "./interactive-supplemental-federal-drafts";

const taxpayerPersonId = "p_taxpayer";

type UnknownRecord = Record<string, unknown>;
type RawBacked = {
  readonly __raw?: UnknownRecord;
};

export type PersonDirectoryEntry = {
  readonly personId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullLegalName: string;
  readonly last4TaxId: string;
  readonly taxIdToken: string;
};

export type TaxpayerSupplementEditorDraft = RawBacked & {
  readonly dateOfBirth: string;
  readonly taxIdToken: string;
  readonly last4TaxId: string;
  readonly citizenshipStatus: string;
  readonly isBlind: boolean;
  readonly isFullTimeStudent: boolean;
  readonly occupation: string;
};

export type SpouseEditorDraft = RawBacked & {
  readonly personId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullLegalName: string;
  readonly dateOfBirth: string;
  readonly taxIdToken: string;
  readonly last4TaxId: string;
  readonly citizenshipStatus: string;
  readonly isBlind: boolean;
  readonly isFullTimeStudent: boolean;
  readonly occupation: string;
};

export type DependentEditorDraft = RawBacked & {
  readonly personId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullLegalName: string;
  readonly dateOfBirth: string;
  readonly taxIdToken: string;
  readonly last4TaxId: string;
  readonly relationshipToTaxpayer: string;
  readonly monthsLivedWithTaxpayer: string;
  readonly supportPercentageProvidedByTaxpayer: string;
  readonly qualifyingForChildTaxCredit: boolean;
  readonly qualifyingForCreditForOtherDependents: boolean;
  readonly qualifyingForEitc: boolean;
  readonly isDisabled: boolean;
  readonly isFullTimeStudent: boolean;
};

export type FamilyEditorDraft = {
  readonly taxpayer: TaxpayerSupplementEditorDraft;
  readonly includeSpouse: boolean;
  readonly spouse: SpouseEditorDraft;
  readonly dependents: ReadonlyArray<DependentEditorDraft>;
  readonly canBeClaimedAsDependent: boolean;
};

export type BrokerTransactionEditorDraft = RawBacked & {
  readonly transactionId: string;
  readonly assetDescription: string;
  readonly dateAcquired: string;
  readonly dateSold: string;
  readonly proceeds: string;
  readonly costBasis: string;
  readonly accruedMarketDiscount: string;
  readonly washSaleLossDisallowed: string;
  readonly gainOrLoss: string;
  readonly basisReportedToIrs: "unset" | "reported" | "not_reported";
  readonly term: string;
  readonly form8949Box: string;
  readonly countryOrIssuer: string;
  readonly notes: string;
};

export type Form1099BEditorDraft = RawBacked & {
  readonly documentId: string;
  readonly payerName: string;
  readonly payerTin: string;
  readonly recipientAccountNumber: string;
  readonly federalIncomeTaxWithheld: string;
  readonly transactions: ReadonlyArray<BrokerTransactionEditorDraft>;
};

export type Form1099GEditorDraft = RawBacked & {
  readonly documentId: string;
  readonly personId: string;
  readonly payerName: string;
  readonly payerStateOrId: string;
  readonly unemploymentCompensation: string;
  readonly federalIncomeTaxWithheld: string;
  readonly stateCode: string;
  readonly __factRaw?: UnknownRecord;
};

export type Ssa1099EditorDraft = RawBacked & {
  readonly documentId: string;
  readonly personId: string;
  readonly benefitsPaid: string;
  readonly benefitsRepaid: string;
  readonly netBenefits: string;
  readonly medicarePartBPremiums: string;
  readonly medicarePartDPremiums: string;
  readonly __factRaw?: UnknownRecord;
};

export type Form1098EditorDraft = RawBacked & {
  readonly documentId: string;
  readonly lenderName: string;
  readonly lenderTin: string;
  readonly mortgageInterestReceived: string;
  readonly pointsPaid: string;
  readonly mortgageInsurancePremiums: string;
  readonly realEstateTaxesPaid: string;
  readonly propertyAddressLine1: string;
  readonly propertyAddressCity: string;
  readonly propertyAddressStateCode: string;
  readonly propertyAddressPostalCode: string;
  readonly propertyAddressCountryCode: string;
  readonly securedDebtUsedForHome: "unset" | "secured" | "not_secured";
  readonly __factRaw?: UnknownRecord;
};

export type Form1098EEditorDraft = RawBacked & {
  readonly documentId: string;
  readonly lenderName: string;
  readonly lenderTin: string;
  readonly studentLoanInterestReceivedByLender: string;
};

export type Form1098TEditorDraft = RawBacked & {
  readonly documentId: string;
  readonly filerName: string;
  readonly filerTin: string;
  readonly studentPersonId: string;
  readonly qualifiedExpensesPaid: string;
  readonly taxFreeAssistance: string;
  readonly isAotcCandidate: boolean;
  readonly isLlcCandidate: boolean;
  readonly studentHalfTime: boolean;
  readonly graduateStudent: boolean;
  readonly __factRaw?: UnknownRecord;
};

export type MarketplaceMonthlyRowEditorDraft = RawBacked & {
  readonly month: string;
  readonly enrollmentPremium: string;
  readonly secondLowestCostSilverPlanPremium: string;
  readonly advancePaymentOfPremiumTaxCredit: string;
};

export type Form1095AEditorDraft = RawBacked & {
  readonly documentId: string;
  readonly recipientPersonId: string;
  readonly marketplaceIdentifier: string;
  readonly policyNumber: string;
  readonly coveredPersonIds: string;
  readonly monthlyRows: ReadonlyArray<MarketplaceMonthlyRowEditorDraft>;
  readonly __policyRaw?: UnknownRecord;
};

export type AdditionalDocumentsEditorDraft = {
  readonly brokerageForms: ReadonlyArray<Form1099BEditorDraft>;
  readonly unemploymentForms: ReadonlyArray<Form1099GEditorDraft>;
  readonly socialSecurityForms: ReadonlyArray<Ssa1099EditorDraft>;
  readonly mortgageInterestForms: ReadonlyArray<Form1098EditorDraft>;
  readonly studentLoanForms: ReadonlyArray<Form1098EEditorDraft>;
  readonly tuitionForms: ReadonlyArray<Form1098TEditorDraft>;
  readonly marketplaceForms: ReadonlyArray<Form1095AEditorDraft>;
};

export type Form1099NecEditorDraft = RawBacked & {
  readonly documentId: string;
  readonly personId: string;
  readonly payerName: string;
  readonly payerTin: string;
  readonly amount: string;
  readonly federalIncomeTaxWithheld: string;
  readonly linkedBusinessId: string;
  readonly __factRaw?: UnknownRecord;
};

export type Form1099MiscEditorDraft = RawBacked & {
  readonly documentId: string;
  readonly personId: string;
  readonly payerName: string;
  readonly payerTin: string;
  readonly rents: string;
  readonly royalties: string;
  readonly otherIncome: string;
  readonly fishingBoatProceeds: string;
  readonly medicalAndHealthCarePayments: string;
  readonly cropInsuranceProceeds: string;
  readonly grossProceedsPaidToAttorney: string;
  readonly substitutePaymentsInLieuOfDividendsOrInterest: string;
  readonly section409aDeferrals: string;
  readonly nonqualifiedDeferredCompensation: string;
  readonly federalIncomeTaxWithheld: string;
  readonly __factRows?: ReadonlyArray<UnknownRecord>;
};

export type ScheduleCBusinessEditorDraft = RawBacked & {
  readonly businessId: string;
  readonly ownerPersonId: string;
  readonly businessName: string;
  readonly businessEin: string;
  readonly principalBusinessCode: string;
  readonly accountingMethod: string;
  readonly materiallyParticipates: boolean;
  readonly grossReceiptsOrSales: string;
  readonly returnsAndAllowances: string;
  readonly costOfGoodsSold: string;
  readonly otherBusinessIncome: string;
  readonly totalExpenses: string;
  readonly homeOfficeDeduction: string;
  readonly vehicleExpenseMethod: string;
  readonly sourceDocumentIds: string;
};

export type ScheduleEActivityEditorDraft = RawBacked & {
  readonly activityId: string;
  readonly ownerPersonId: string;
  readonly activityType: string;
  readonly entityName: string;
  readonly entityEin: string;
  readonly materiallyParticipates: "unset" | "yes" | "no";
  readonly totalIncome: string;
  readonly totalExpenses: string;
  readonly sourceDocumentIds: string;
};

export type OtherIncomeItemEditorDraft = RawBacked & {
  readonly otherIncomeId: string;
  readonly personId: string;
  readonly description: string;
  readonly amount: string;
  readonly schedule1Category: string;
  readonly sourceDocumentIds: string;
};

export type SupplementalWithholdingEditorDraft = RawBacked & {
  readonly withholdingId: string;
  readonly personId: string;
  readonly sourceDocumentId: string;
  readonly amount: string;
  readonly description: string;
};

export type SupplementalIncomeEditorDraft = {
  readonly necForms: ReadonlyArray<Form1099NecEditorDraft>;
  readonly miscForms: ReadonlyArray<Form1099MiscEditorDraft>;
  readonly scheduleCBusinesses: ReadonlyArray<ScheduleCBusinessEditorDraft>;
  readonly scheduleEActivities: ReadonlyArray<ScheduleEActivityEditorDraft>;
  readonly otherIncomeItems: ReadonlyArray<OtherIncomeItemEditorDraft>;
  readonly supplementalWithholdings: ReadonlyArray<SupplementalWithholdingEditorDraft>;
};

export type NamedAmountEditorDraft = RawBacked & {
  readonly code: string;
  readonly description: string;
  readonly amount: string;
  readonly personId: string;
  readonly sourceDocumentId: string;
};

export type DeductionsEditorDraft = {
  readonly educatorExpenses: string;
  readonly reservistExpenses: string;
  readonly healthSavingsAccountDeduction: string;
  readonly movingExpensesForArmedForces: string;
  readonly deductiblePartOfSelfEmploymentTax: string;
  readonly selfEmployedSepSimpleAndQualifiedPlans: string;
  readonly selfEmployedHealthInsurance: string;
  readonly penaltyOnEarlyWithdrawalOfSavings: string;
  readonly alimonyPaidForPre2019Divorce: string;
  readonly iraDeduction: string;
  readonly studentLoanInterestDeduction: string;
  readonly otherAdjustments: ReadonlyArray<NamedAmountEditorDraft>;
  readonly medicalAndDentalExpenses: string;
  readonly stateAndLocalIncomeOrSalesTaxes: string;
  readonly realEstateTaxes: string;
  readonly personalPropertyTaxes: string;
  readonly otherTaxes: string;
  readonly charitableCashContributions: string;
  readonly charitableNoncashContributions: string;
  readonly casualtyAndTheftLosses: string;
  readonly otherItemizedDeductions: ReadonlyArray<NamedAmountEditorDraft>;
};

export type CareProviderEditorDraft = RawBacked & {
  readonly providerId: string;
  readonly name: string;
  readonly tinToken: string;
  readonly last4Tin: string;
  readonly addressLine1: string;
  readonly addressCity: string;
  readonly addressStateCode: string;
  readonly addressPostalCode: string;
  readonly addressCountryCode: string;
};

export type CareExpenseEditorDraft = RawBacked & {
  readonly personId: string;
  readonly providerId: string;
  readonly amount: string;
  readonly monthsOfCare: string;
};

export type EnergyProjectEditorDraft = RawBacked & {
  readonly projectId: string;
  readonly creditCategory: string;
  readonly qualifiedCost: string;
  readonly placedInServiceDate: string;
  readonly propertyAddressLine1: string;
  readonly propertyAddressCity: string;
  readonly propertyAddressStateCode: string;
  readonly propertyAddressPostalCode: string;
  readonly propertyAddressCountryCode: string;
};

export type VehicleCreditEditorDraft = RawBacked & {
  readonly vehicleClaimId: string;
  readonly vinLast8: string;
  readonly cleanVehicleType: string;
  readonly purchaseDate: string;
  readonly msrpOrSalesPrice: string;
  readonly tentativeCredit: string;
};

export type HsaCoverageMonthEditorDraft = RawBacked & {
  readonly personId: string;
  readonly month: string;
  readonly coverageType: string;
};

export type CreditsEditorDraft = {
  readonly candidateChildTaxCreditDependentIds: string;
  readonly candidateCreditForOtherDependentIds: string;
  readonly candidateEitcChildIds: string;
  readonly qualifyingPersonIdsForCare: string;
  readonly careProviders: ReadonlyArray<CareProviderEditorDraft>;
  readonly careExpenses: ReadonlyArray<CareExpenseEditorDraft>;
  readonly residentialCleanEnergyProjects: ReadonlyArray<EnergyProjectEditorDraft>;
  readonly cleanVehicleCredits: ReadonlyArray<VehicleCreditEditorDraft>;
  readonly retirementSavingsContributionsCreditCandidatePersonIds: string;
  readonly otherNonrefundableCredits: ReadonlyArray<NamedAmountEditorDraft>;
  readonly otherRefundableCredits: ReadonlyArray<NamedAmountEditorDraft>;
  readonly hsaCoverageMonths: ReadonlyArray<HsaCoverageMonthEditorDraft>;
};

export type OverrideEntryEditorDraft = {
  readonly key: string;
  readonly valueText: string;
};

export type ElectionChoiceEditorDraft = RawBacked & {
  readonly electionCode: string;
  readonly description: string;
  readonly selectedValueText: string;
  readonly selectionBasis: string;
  readonly notes: string;
};

export type OverridesEditorDraft = {
  readonly federalOverrides: ReadonlyArray<OverrideEntryEditorDraft>;
  readonly deductionStrategyPreference: string;
  readonly capitalLossCarryforwardImported: boolean;
  readonly selfSelectPinAuthorized: boolean;
  readonly stateFilingOptInStates: string;
  readonly otherElections: ReadonlyArray<ElectionChoiceEditorDraft>;
};

export type InteractiveSupplementalFederalDraft = {
  readonly family: FamilyEditorDraft;
  readonly documents: AdditionalDocumentsEditorDraft;
  readonly supplementalIncome: SupplementalIncomeEditorDraft;
  readonly deductions: DeductionsEditorDraft;
  readonly credits: CreditsEditorDraft;
  readonly overrides: OverridesEditorDraft;
  readonly unmodeledAdditionalDocuments: ReadonlyArray<UnknownRecord>;
};

export function emptyTaxpayerSupplementEditorDraft(): TaxpayerSupplementEditorDraft {
  return {
    dateOfBirth: "",
    taxIdToken: "",
    last4TaxId: "",
    citizenshipStatus: "us_citizen",
    isBlind: false,
    isFullTimeStudent: false,
    occupation: "",
  };
}

export function emptySpouseEditorDraft(): SpouseEditorDraft {
  return {
    personId: "p_spouse",
    firstName: "",
    lastName: "",
    fullLegalName: "",
    dateOfBirth: "",
    taxIdToken: "",
    last4TaxId: "",
    citizenshipStatus: "us_citizen",
    isBlind: false,
    isFullTimeStudent: false,
    occupation: "",
  };
}

export function emptyDependentEditorDraft(): DependentEditorDraft {
  return {
    personId: "",
    firstName: "",
    lastName: "",
    fullLegalName: "",
    dateOfBirth: "",
    taxIdToken: "",
    last4TaxId: "",
    relationshipToTaxpayer: "child",
    monthsLivedWithTaxpayer: "12",
    supportPercentageProvidedByTaxpayer: "",
    qualifyingForChildTaxCredit: true,
    qualifyingForCreditForOtherDependents: false,
    qualifyingForEitc: false,
    isDisabled: false,
    isFullTimeStudent: false,
  };
}

export function emptyBrokerTransactionEditorDraft(): BrokerTransactionEditorDraft {
  return {
    transactionId: "",
    assetDescription: "",
    dateAcquired: "",
    dateSold: "",
    proceeds: "",
    costBasis: "",
    accruedMarketDiscount: "",
    washSaleLossDisallowed: "",
    gainOrLoss: "",
    basisReportedToIrs: "unset",
    term: "long",
    form8949Box: "A",
    countryOrIssuer: "",
    notes: "",
  };
}

export function empty1099BEditorDraft(): Form1099BEditorDraft {
  return {
    documentId: "",
    payerName: "",
    payerTin: "",
    recipientAccountNumber: "",
    federalIncomeTaxWithheld: "",
    transactions: [emptyBrokerTransactionEditorDraft()],
  };
}

export function empty1099GEditorDraft(): Form1099GEditorDraft {
  return {
    documentId: "",
    personId: taxpayerPersonId,
    payerName: "",
    payerStateOrId: "",
    unemploymentCompensation: "",
    federalIncomeTaxWithheld: "",
    stateCode: "",
  };
}

export function emptySsa1099EditorDraft(): Ssa1099EditorDraft {
  return {
    documentId: "",
    personId: taxpayerPersonId,
    benefitsPaid: "",
    benefitsRepaid: "",
    netBenefits: "",
    medicarePartBPremiums: "",
    medicarePartDPremiums: "",
  };
}

export function empty1098EditorDraft(): Form1098EditorDraft {
  return {
    documentId: "",
    lenderName: "",
    lenderTin: "",
    mortgageInterestReceived: "",
    pointsPaid: "",
    mortgageInsurancePremiums: "",
    realEstateTaxesPaid: "",
    propertyAddressLine1: "",
    propertyAddressCity: "",
    propertyAddressStateCode: "",
    propertyAddressPostalCode: "",
    propertyAddressCountryCode: "US",
    securedDebtUsedForHome: "unset",
  };
}

export function empty1098EEditorDraft(): Form1098EEditorDraft {
  return {
    documentId: "",
    lenderName: "",
    lenderTin: "",
    studentLoanInterestReceivedByLender: "",
  };
}

export function empty1098TEditorDraft(): Form1098TEditorDraft {
  return {
    documentId: "",
    filerName: "",
    filerTin: "",
    studentPersonId: taxpayerPersonId,
    qualifiedExpensesPaid: "",
    taxFreeAssistance: "",
    isAotcCandidate: true,
    isLlcCandidate: false,
    studentHalfTime: false,
    graduateStudent: false,
  };
}

export function emptyMarketplaceMonthlyRowEditorDraft(
  month = "annual",
): MarketplaceMonthlyRowEditorDraft {
  return {
    month,
    enrollmentPremium: "",
    secondLowestCostSilverPlanPremium: "",
    advancePaymentOfPremiumTaxCredit: "",
  };
}

export function empty1095AEditorDraft(): Form1095AEditorDraft {
  return {
    documentId: "",
    recipientPersonId: taxpayerPersonId,
    marketplaceIdentifier: "",
    policyNumber: "",
    coveredPersonIds: taxpayerPersonId,
    monthlyRows: [emptyMarketplaceMonthlyRowEditorDraft()],
  };
}

export function empty1099NecEditorDraft(): Form1099NecEditorDraft {
  return {
    documentId: "",
    personId: taxpayerPersonId,
    payerName: "",
    payerTin: "",
    amount: "",
    federalIncomeTaxWithheld: "",
    linkedBusinessId: "",
  };
}

export function empty1099MiscEditorDraft(): Form1099MiscEditorDraft {
  return {
    documentId: "",
    personId: taxpayerPersonId,
    payerName: "",
    payerTin: "",
    rents: "",
    royalties: "",
    otherIncome: "",
    fishingBoatProceeds: "",
    medicalAndHealthCarePayments: "",
    cropInsuranceProceeds: "",
    grossProceedsPaidToAttorney: "",
    substitutePaymentsInLieuOfDividendsOrInterest: "",
    section409aDeferrals: "",
    nonqualifiedDeferredCompensation: "",
    federalIncomeTaxWithheld: "",
  };
}

export function emptyScheduleCBusinessEditorDraft(): ScheduleCBusinessEditorDraft {
  return {
    businessId: "",
    ownerPersonId: taxpayerPersonId,
    businessName: "",
    businessEin: "",
    principalBusinessCode: "",
    accountingMethod: "cash",
    materiallyParticipates: true,
    grossReceiptsOrSales: "",
    returnsAndAllowances: "",
    costOfGoodsSold: "",
    otherBusinessIncome: "",
    totalExpenses: "",
    homeOfficeDeduction: "",
    vehicleExpenseMethod: "standard_mileage",
    sourceDocumentIds: "",
  };
}

export function emptyScheduleEActivityEditorDraft(): ScheduleEActivityEditorDraft {
  return {
    activityId: "",
    ownerPersonId: taxpayerPersonId,
    activityType: "rental_real_estate",
    entityName: "",
    entityEin: "",
    materiallyParticipates: "unset",
    totalIncome: "",
    totalExpenses: "",
    sourceDocumentIds: "",
  };
}

export function emptyOtherIncomeItemEditorDraft(): OtherIncomeItemEditorDraft {
  return {
    otherIncomeId: "",
    personId: taxpayerPersonId,
    description: "",
    amount: "",
    schedule1Category: "other_income",
    sourceDocumentIds: "",
  };
}

export function emptySupplementalWithholdingEditorDraft(): SupplementalWithholdingEditorDraft {
  return {
    withholdingId: "",
    personId: taxpayerPersonId,
    sourceDocumentId: "",
    amount: "",
    description: "",
  };
}

export function emptyNamedAmountEditorDraft(): NamedAmountEditorDraft {
  return {
    code: "",
    description: "",
    amount: "",
    personId: "",
    sourceDocumentId: "",
  };
}

export function emptyCareProviderEditorDraft(): CareProviderEditorDraft {
  return {
    providerId: "",
    name: "",
    tinToken: "",
    last4Tin: "",
    addressLine1: "",
    addressCity: "",
    addressStateCode: "",
    addressPostalCode: "",
    addressCountryCode: "US",
  };
}

export function emptyCareExpenseEditorDraft(): CareExpenseEditorDraft {
  return {
    personId: "",
    providerId: "",
    amount: "",
    monthsOfCare: "",
  };
}

export function emptyEnergyProjectEditorDraft(): EnergyProjectEditorDraft {
  return {
    projectId: "",
    creditCategory: "solar_electric",
    qualifiedCost: "",
    placedInServiceDate: "",
    propertyAddressLine1: "",
    propertyAddressCity: "",
    propertyAddressStateCode: "",
    propertyAddressPostalCode: "",
    propertyAddressCountryCode: "US",
  };
}

export function emptyVehicleCreditEditorDraft(): VehicleCreditEditorDraft {
  return {
    vehicleClaimId: "",
    vinLast8: "",
    cleanVehicleType: "new_clean_vehicle",
    purchaseDate: "",
    msrpOrSalesPrice: "",
    tentativeCredit: "",
  };
}

export function emptyHsaCoverageMonthEditorDraft(): HsaCoverageMonthEditorDraft {
  return {
    personId: taxpayerPersonId,
    month: "january",
    coverageType: "self_only",
  };
}

export function emptyElectionChoiceEditorDraft(): ElectionChoiceEditorDraft {
  return {
    electionCode: "",
    description: "",
    selectedValueText: "",
    selectionBasis: "user_selected",
    notes: "",
  };
}

export function parseInteractiveSupplementalFederalDraft(
  draft: SupplementalFederalDraft,
): InteractiveSupplementalFederalDraft {
  const household = parseObjectText(draft.householdJson, "Household supplement");
  const additionalDocuments = parseArrayText(
    draft.additionalDocumentsJson,
    "Additional source documents",
  )
    .map((value) => asRecord(value))
    .filter((value): value is UnknownRecord => value != null);
  const supplementalIncome = parseObjectText(
    draft.supplementalIncomeJson,
    "Supplemental income",
  );
  const supplementalWithholdings = parseArrayText(
    draft.supplementalWithholdingsJson,
    "Supplemental withholdings",
  )
    .map((value) => asRecord(value))
    .filter((value): value is UnknownRecord => value != null);
  const adjustments = parseObjectText(draft.adjustmentsJson, "Adjustments");
  const itemized = parseObjectText(draft.itemizedDeductionsJson, "Itemized deductions");
  const credits = parseObjectText(draft.creditsJson, "Credits");
  const health = parseObjectText(draft.healthCoverageJson, "Health coverage");
  const federalOverrides = parseObjectText(draft.federalOverridesJson, "Federal overrides");
  const elections = parseObjectText(draft.electionsJson, "Elections");

  const documentsByType = indexDocumentsByType(additionalDocuments);
  const incomeRecord = asRecord(supplementalIncome) ?? {};

  const capitalTransactions = asArrayRecords(incomeRecord.capital_transactions);
  const unemploymentFacts = asArrayRecords(incomeRecord.unemployment_compensation);
  const socialSecurityFacts = asArrayRecords(incomeRecord.social_security_benefits);
  const necFacts = asArrayRecords(incomeRecord.nonemployee_compensation);
  const miscFacts = asArrayRecords(incomeRecord.miscellaneous_1099_income);
  const scheduleCBusinesses = asArrayRecords(incomeRecord.schedule_c_businesses);
  const scheduleEActivities = asArrayRecords(incomeRecord.schedule_e_activities);
  const otherIncomeItems = asArrayRecords(incomeRecord.other_income_items);
  const mortgageInterestItems = asArrayRecords(itemized.mortgage_interest_items);

  const educationCredits = asRecord(credits.education_credits) ?? {};
  const premiumTaxCredit = asRecord(credits.premium_tax_credit) ?? {};
  const childAndDependentCare = asRecord(credits.child_and_dependent_care) ?? {};
  const residentialCleanEnergy = asRecord(credits.residential_clean_energy) ?? {};
  const cleanVehicleCredits = asRecord(credits.clean_vehicle_credits) ?? {};
  const healthCoverage = asRecord(health) ?? {};

  const tuitionFactByDocumentId = mapBySourceDocumentId(
    asArrayRecords(educationCredits.students),
    "source_document_ids",
  );
  const marketplacePolicyByDocumentId = mapBySourceDocumentId(
    asArrayRecords(premiumTaxCredit.policies),
    "source_document_id",
  );
  const mortgageInterestByDocumentId = mapByDocumentId(
    mortgageInterestItems,
    "source_document_id",
  );
  const unemploymentByDocumentId = mapByDocumentId(
    unemploymentFacts,
    "source_document_id",
  );
  const socialSecurityByDocumentId = mapByDocumentId(
    socialSecurityFacts,
    "source_document_id",
  );
  const necByDocumentId = mapByDocumentId(necFacts, "source_document_id");
  const miscByDocumentId = mapGroupedByDocumentId(miscFacts, "source_document_id");

  const parsedDocuments1099B = parse1099BDocuments(
    documentsByType.get("FORM_1099_B") ?? [],
    capitalTransactions,
  );
  const parsedDocuments1099G = parse1099GDocuments(
    documentsByType.get("FORM_1099_G") ?? [],
    unemploymentByDocumentId,
  );
  const parsedDocumentsSsa = parseSsa1099Documents(
    documentsByType.get("FORM_SSA_1099") ?? [],
    socialSecurityByDocumentId,
  );
  const parsedDocuments1098 = parse1098Documents(
    documentsByType.get("FORM_1098") ?? [],
    mortgageInterestByDocumentId,
  );
  const parsedDocuments1098E = parse1098EDocuments(
    documentsByType.get("FORM_1098_E") ?? [],
  );
  const parsedDocuments1098T = parse1098TDocuments(
    documentsByType.get("FORM_1098_T") ?? [],
    tuitionFactByDocumentId,
  );
  const parsedDocuments1095A = parse1095ADocuments(
    documentsByType.get("FORM_1095_A") ?? [],
    marketplacePolicyByDocumentId,
  );

  const parsedNecDocuments = parse1099NecDocuments(
    documentsByType.get("FORM_1099_NEC") ?? [],
    necByDocumentId,
  );
  const parsedMiscDocuments = parse1099MiscDocuments(
    documentsByType.get("FORM_1099_MISC") ?? [],
    miscByDocumentId,
  );

  return {
    family: parseFamilyEditorDraft(household),
    documents: {
      brokerageForms: parsedDocuments1099B,
      unemploymentForms: parsedDocuments1099G,
      socialSecurityForms: parsedDocumentsSsa,
      mortgageInterestForms: parsedDocuments1098,
      studentLoanForms: parsedDocuments1098E,
      tuitionForms: parsedDocuments1098T,
      marketplaceForms: parsedDocuments1095A,
    },
    supplementalIncome: {
      necForms: parsedNecDocuments,
      miscForms: parsedMiscDocuments,
      scheduleCBusinesses: scheduleCBusinesses.map(parseScheduleCBusiness),
      scheduleEActivities: scheduleEActivities.map(parseScheduleEActivity),
      otherIncomeItems: otherIncomeItems.map(parseOtherIncomeItem),
      supplementalWithholdings: supplementalWithholdings.map(parseSupplementalWithholding),
    },
    deductions: {
      educatorExpenses: moneyText(adjustments.educator_expenses),
      reservistExpenses: moneyText(
        adjustments.certain_business_expenses_of_reservists_performing_artists_and_fee_basis_officials,
      ),
      healthSavingsAccountDeduction: moneyText(adjustments.health_savings_account_deduction),
      movingExpensesForArmedForces: moneyText(adjustments.moving_expenses_for_armed_forces),
      deductiblePartOfSelfEmploymentTax: moneyText(
        adjustments.deductible_part_of_self_employment_tax,
      ),
      selfEmployedSepSimpleAndQualifiedPlans: moneyText(
        adjustments.self_employed_sep_simple_and_qualified_plans,
      ),
      selfEmployedHealthInsurance: moneyText(adjustments.self_employed_health_insurance),
      penaltyOnEarlyWithdrawalOfSavings: moneyText(
        adjustments.penalty_on_early_withdrawal_of_savings,
      ),
      alimonyPaidForPre2019Divorce: moneyText(
        adjustments.alimony_paid_for_pre_2019_divorce,
      ),
      iraDeduction: moneyText(adjustments.ira_deduction),
      studentLoanInterestDeduction: moneyText(adjustments.student_loan_interest_deduction),
      otherAdjustments: asArrayRecords(adjustments.other_adjustments).map(parseNamedAmount),
      medicalAndDentalExpenses: moneyText(itemized.medical_and_dental_expenses),
      stateAndLocalIncomeOrSalesTaxes: moneyText(
        itemized.state_and_local_income_or_sales_taxes,
      ),
      realEstateTaxes: moneyText(itemized.real_estate_taxes),
      personalPropertyTaxes: moneyText(itemized.personal_property_taxes),
      otherTaxes: moneyText(itemized.other_taxes),
      charitableCashContributions: moneyText(itemized.charitable_cash_contributions),
      charitableNoncashContributions: moneyText(
        itemized.charitable_noncash_contributions,
      ),
      casualtyAndTheftLosses: moneyText(itemized.casualty_and_theft_losses),
      otherItemizedDeductions: asArrayRecords(itemized.other_itemized_deductions).map(
        parseNamedAmount,
      ),
    },
    credits: {
      candidateChildTaxCreditDependentIds: csvFromArray(
        asArray(credits.candidate_child_tax_credit_dependent_ids),
      ),
      candidateCreditForOtherDependentIds: csvFromArray(
        asArray(credits.candidate_credit_for_other_dependent_ids),
      ),
      candidateEitcChildIds: csvFromArray(asArray(credits.candidate_eitc_child_ids)),
      qualifyingPersonIdsForCare: csvFromArray(
        asArray(childAndDependentCare.qualifying_person_ids),
      ),
      careProviders: asArrayRecords(childAndDependentCare.providers).map(parseCareProvider),
      careExpenses: asArrayRecords(childAndDependentCare.expenses).map(parseCareExpense),
      residentialCleanEnergyProjects: asArrayRecords(
        residentialCleanEnergy.projects,
      ).map(parseEnergyProject),
      cleanVehicleCredits: asArrayRecords(cleanVehicleCredits.vehicles).map(
        parseVehicleCredit,
      ),
      retirementSavingsContributionsCreditCandidatePersonIds: csvFromArray(
        asArray(credits.retirement_savings_contributions_credit_candidate_person_ids),
      ),
      otherNonrefundableCredits: asArrayRecords(credits.other_nonrefundable_credits).map(
        parseNamedAmount,
      ),
      otherRefundableCredits: asArrayRecords(credits.other_refundable_credits).map(
        parseNamedAmount,
      ),
      hsaCoverageMonths: asArrayRecords(healthCoverage.hsa_coverage_months).map(
        parseHsaCoverageMonth,
      ),
    },
    overrides: {
      federalOverrides: Object.entries(federalOverrides).map(([key, value]) => ({
        key,
        valueText: stringifyLooseValue(value),
      })),
      deductionStrategyPreference:
        asString(elections.deduction_strategy_preference) ?? "auto",
      capitalLossCarryforwardImported:
        asBoolean(elections.capital_loss_carryforward_imported) ?? false,
      selfSelectPinAuthorized: asBoolean(elections.self_select_pin_authorized) ?? false,
      stateFilingOptInStates: csvFromArray(asArray(elections.state_filing_opt_in_states)),
      otherElections: asArrayRecords(elections.other_elections).map(parseElectionChoice),
    },
    unmodeledAdditionalDocuments: additionalDocuments.filter((document) => {
      const documentType = asString(document.document_type) ?? "";
      return !handledAdditionalDocumentTypes.has(documentType);
    }),
  };
}

export function serializeInteractiveSupplementalFederalDraft(options: {
  readonly draft: InteractiveSupplementalFederalDraft;
  readonly householdDraft: HouseholdDraft | null;
  readonly writtenAt: string;
}): SupplementalFederalDraft {
  const personDirectory = buildPersonDirectory({
    householdDraft: options.householdDraft,
    familyDraft: options.draft.family,
  });

  const documentsPayload = serializeDocumentSections({
    documents: options.draft.documents,
    supplementalIncome: options.draft.supplementalIncome,
    deductions: options.draft.deductions,
    personDirectory,
    writtenAt: options.writtenAt,
  });

  const deductionsPayload = serializeDeductionsSection({
    deductions: options.draft.deductions,
    mortgageInterestItems: documentsPayload.mortgageInterestItems,
    studentLoanInterestFallbackAmount: documentsPayload.studentLoanInterestAmount,
  });

  const creditsPayload = serializeCreditsSection({
    credits: options.draft.credits,
    tuitionStudents: documentsPayload.tuitionStudents,
    marketplacePolicies: documentsPayload.marketplacePolicies,
  });

  return {
    householdJson: JSON.stringify(
      {
        taxpayer: serializeTaxpayerSupplement(options.draft.family.taxpayer),
        spouse: options.draft.family.includeSpouse
          ? serializeSpouse(options.draft.family.spouse)
          : null,
        dependents: options.draft.family.dependents.map(serializeDependent),
        can_be_claimed_as_dependent: options.draft.family.canBeClaimedAsDependent,
      },
      null,
      2,
    ),
    additionalDocumentsJson: JSON.stringify(
      [
        ...documentsPayload.additionalDocuments,
        ...options.draft.unmodeledAdditionalDocuments,
      ],
      null,
      2,
    ),
    supplementalIncomeJson: JSON.stringify(
      {
        capital_transactions: documentsPayload.capitalTransactions,
        unemployment_compensation: documentsPayload.unemploymentFacts,
        social_security_benefits: documentsPayload.socialSecurityFacts,
        nonemployee_compensation: documentsPayload.necFacts,
        miscellaneous_1099_income: documentsPayload.miscFacts,
        schedule_c_businesses: options.draft.supplementalIncome.scheduleCBusinesses.map(
          serializeScheduleCBusiness,
        ),
        schedule_e_activities: options.draft.supplementalIncome.scheduleEActivities.map(
          serializeScheduleEActivity,
        ),
        other_income_items: options.draft.supplementalIncome.otherIncomeItems.map(
          serializeOtherIncomeItem,
        ),
      },
      null,
      2,
    ),
    supplementalWithholdingsJson: JSON.stringify(
      options.draft.supplementalIncome.supplementalWithholdings.map(
        serializeSupplementalWithholding,
      ),
      null,
      2,
    ),
    adjustmentsJson: JSON.stringify(deductionsPayload.adjustments, null, 2),
    itemizedDeductionsJson: JSON.stringify(deductionsPayload.itemized, null, 2),
    creditsJson: JSON.stringify(creditsPayload.credits, null, 2),
    healthCoverageJson: JSON.stringify(creditsPayload.healthCoverage, null, 2),
    federalOverridesJson: JSON.stringify(
      Object.fromEntries(
        options.draft.overrides.federalOverrides
          .filter((entry) => entry.key.trim().length > 0)
          .map((entry) => [entry.key.trim(), parseLooseValue(entry.valueText)]),
      ),
      null,
      2,
    ),
    electionsJson: JSON.stringify(
      {
        deduction_strategy_preference:
          options.draft.overrides.deductionStrategyPreference.trim().length > 0
            ? options.draft.overrides.deductionStrategyPreference.trim()
            : "auto",
        capital_loss_carryforward_imported:
          options.draft.overrides.capitalLossCarryforwardImported,
        self_select_pin_authorized: options.draft.overrides.selfSelectPinAuthorized,
        state_filing_opt_in_states: csvToList(options.draft.overrides.stateFilingOptInStates),
        other_elections: options.draft.overrides.otherElections
          .filter((entry) => entry.electionCode.trim().length > 0)
          .map(serializeElectionChoice),
      },
      null,
      2,
    ),
  };
}

export function buildPersonDirectory(options: {
  readonly householdDraft: HouseholdDraft | null;
  readonly familyDraft: FamilyEditorDraft;
}): ReadonlyArray<PersonDirectoryEntry> {
  const result: PersonDirectoryEntry[] = [];

  result.push({
    personId: taxpayerPersonId,
    firstName: options.householdDraft?.firstName ?? "",
    lastName: options.householdDraft?.lastName ?? "",
    fullLegalName: options.householdDraft?.fullLegalName ?? "",
    last4TaxId: options.familyDraft.taxpayer.last4TaxId,
    taxIdToken: options.familyDraft.taxpayer.taxIdToken,
  });

  if (options.familyDraft.includeSpouse) {
    result.push({
      personId:
        options.familyDraft.spouse.personId.trim().length > 0
          ? options.familyDraft.spouse.personId.trim()
          : "p_spouse",
      firstName: options.familyDraft.spouse.firstName,
      lastName: options.familyDraft.spouse.lastName,
      fullLegalName: options.familyDraft.spouse.fullLegalName,
      last4TaxId: options.familyDraft.spouse.last4TaxId,
      taxIdToken: options.familyDraft.spouse.taxIdToken,
    });
  }

  for (const dependent of options.familyDraft.dependents) {
    if (dependent.personId.trim().length === 0) {
      continue;
    }

    result.push({
      personId: dependent.personId.trim(),
      firstName: dependent.firstName,
      lastName: dependent.lastName,
      fullLegalName: dependent.fullLegalName,
      last4TaxId: dependent.last4TaxId,
      taxIdToken: dependent.taxIdToken,
    });
  }

  return result;
}

const handledAdditionalDocumentTypes = new Set([
  "FORM_1099_B",
  "FORM_1099_G",
  "FORM_SSA_1099",
  "FORM_1099_NEC",
  "FORM_1099_MISC",
  "FORM_1098",
  "FORM_1098_E",
  "FORM_1098_T",
  "FORM_1095_A",
]);

function parseFamilyEditorDraft(household: UnknownRecord): FamilyEditorDraft {
  const taxpayer = asRecord(household.taxpayer) ?? {};
  const spouse = asRecord(household.spouse);

  return {
    taxpayer: {
      __raw: taxpayer,
      dateOfBirth: asString(taxpayer.date_of_birth) ?? "",
      taxIdToken: asString(taxpayer.tax_id_token) ?? "",
      last4TaxId: asString(taxpayer.last4_tax_id) ?? "",
      citizenshipStatus: asString(taxpayer.citizenship_status) ?? "us_citizen",
      isBlind: asBoolean(taxpayer.is_blind) ?? false,
      isFullTimeStudent: asBoolean(taxpayer.is_full_time_student) ?? false,
      occupation: asString(taxpayer.occupation) ?? "",
    },
    includeSpouse: spouse != null,
    spouse: spouse == null ? emptySpouseEditorDraft() : parseSpouse(spouse),
    dependents: asArrayRecords(household.dependents).map(parseDependent),
    canBeClaimedAsDependent: household.can_be_claimed_as_dependent === true,
  };
}

function parseSpouse(spouse: UnknownRecord): SpouseEditorDraft {
  const name = asRecord(spouse.name) ?? {};

  return {
    __raw: spouse,
    personId: asString(spouse.person_id) ?? "p_spouse",
    firstName: asString(name.first) ?? "",
    lastName: asString(name.last) ?? "",
    fullLegalName: asString(name.full_legal_name) ?? "",
    dateOfBirth: asString(spouse.date_of_birth) ?? "",
    taxIdToken: asString(spouse.tax_id_token) ?? "",
    last4TaxId: asString(spouse.last4_tax_id) ?? "",
    citizenshipStatus: asString(spouse.citizenship_status) ?? "us_citizen",
    isBlind: asBoolean(spouse.is_blind) ?? false,
    isFullTimeStudent: asBoolean(spouse.is_full_time_student) ?? false,
    occupation: asString(spouse.occupation) ?? "",
  };
}

function parseDependent(dependent: UnknownRecord): DependentEditorDraft {
  const name = asRecord(dependent.name) ?? {};

  return {
    __raw: dependent,
    personId: asString(dependent.person_id) ?? "",
    firstName: asString(name.first) ?? "",
    lastName: asString(name.last) ?? "",
    fullLegalName: asString(name.full_legal_name) ?? "",
    dateOfBirth: asString(dependent.date_of_birth) ?? "",
    taxIdToken: asString(dependent.tax_id_token) ?? "",
    last4TaxId: asString(dependent.last4_tax_id) ?? "",
    relationshipToTaxpayer: asString(dependent.relationship_to_taxpayer) ?? "child",
    monthsLivedWithTaxpayer: integerText(dependent.months_lived_with_taxpayer),
    supportPercentageProvidedByTaxpayer: numberText(
      dependent.support_percentage_provided_by_taxpayer,
    ),
    qualifyingForChildTaxCredit:
      asBoolean(dependent.qualifying_for_child_tax_credit) ?? false,
    qualifyingForCreditForOtherDependents:
      asBoolean(dependent.qualifying_for_credit_for_other_dependents) ?? false,
    qualifyingForEitc: asBoolean(dependent.qualifying_for_eitc) ?? false,
    isDisabled: asBoolean(dependent.is_disabled) ?? false,
    isFullTimeStudent: asBoolean(dependent.is_full_time_student) ?? false,
  };
}

function parse1099BDocuments(
  documents: ReadonlyArray<UnknownRecord>,
  capitalTransactions: ReadonlyArray<UnknownRecord>,
): ReadonlyArray<Form1099BEditorDraft> {
  const groupedTransactions = mapGroupedByDocumentId(capitalTransactions, "source_document_id");
  const drafts: Form1099BEditorDraft[] = documents.map((document) => {
    const payload = asRecord(document.payload) ?? {};
    const documentId = asString(document.document_id) ?? "";
    const payloadTransactions = asArrayRecords(payload.transactions).map(parseBrokerTransaction);
    const factTransactions =
      payloadTransactions.length > 0
        ? payloadTransactions
        : (groupedTransactions.get(documentId) ?? []).map(parseBrokerTransactionFromFact);

    return {
      __raw: document,
      documentId,
      payerName: asString(payload.payer_name) ?? asString(document.issuer_name) ?? "",
      payerTin: asString(payload.payer_tin) ?? "",
      recipientAccountNumber: asString(payload.recipient_account_number) ?? "",
      federalIncomeTaxWithheld: moneyText(payload.federal_income_tax_withheld),
      transactions:
        factTransactions.length > 0
          ? factTransactions
          : [emptyBrokerTransactionEditorDraft()],
    };
  });

  for (const [documentId, transactions] of groupedTransactions.entries()) {
    if (drafts.some((entry) => entry.documentId === documentId)) {
      continue;
    }

    drafts.push({
      ...empty1099BEditorDraft(),
      documentId,
      transactions: transactions.map(parseBrokerTransactionFromFact),
    });
  }

  return drafts;
}

function parse1099GDocuments(
  documents: ReadonlyArray<UnknownRecord>,
  unemploymentByDocumentId: ReadonlyMap<string, UnknownRecord>,
): ReadonlyArray<Form1099GEditorDraft> {
  const drafts: Form1099GEditorDraft[] = documents.map((document) => {
    const payload = asRecord(document.payload) ?? {};
    const documentId = asString(document.document_id) ?? "";
    const fact = unemploymentByDocumentId.get(documentId);

    return {
      __raw: document,
      __factRaw: fact,
      documentId,
      personId: asString(fact?.person_id) ?? taxpayerPersonId,
      payerName: asString(payload.payer_name) ?? asString(document.issuer_name) ?? "",
      payerStateOrId: asString(payload.payer_state_or_id) ?? "",
      unemploymentCompensation:
        moneyText(payload.unemployment_compensation) || moneyText(fact?.unemployment_compensation),
      federalIncomeTaxWithheld:
        moneyText(payload.federal_income_tax_withheld) ||
        moneyText(fact?.federal_income_tax_withheld),
      stateCode: asString(fact?.state_code) ?? "",
    };
  });

  for (const [documentId, fact] of unemploymentByDocumentId.entries()) {
    if (drafts.some((entry) => entry.documentId === documentId)) {
      continue;
    }

    drafts.push({
      ...empty1099GEditorDraft(),
      documentId,
      __factRaw: fact,
      personId: asString(fact.person_id) ?? taxpayerPersonId,
      payerName: asString(fact.payer_name) ?? "",
      unemploymentCompensation: moneyText(fact.unemployment_compensation),
      federalIncomeTaxWithheld: moneyText(fact.federal_income_tax_withheld),
      stateCode: asString(fact.state_code) ?? "",
    });
  }

  return drafts;
}

function parseSsa1099Documents(
  documents: ReadonlyArray<UnknownRecord>,
  benefitsByDocumentId: ReadonlyMap<string, UnknownRecord>,
): ReadonlyArray<Ssa1099EditorDraft> {
  const drafts: Ssa1099EditorDraft[] = documents.map((document) => {
    const payload = asRecord(document.payload) ?? {};
    const documentId = asString(document.document_id) ?? "";
    const fact = benefitsByDocumentId.get(documentId);

    return {
      __raw: document,
      __factRaw: fact,
      documentId,
      personId: asString(fact?.person_id) ?? taxpayerPersonId,
      benefitsPaid:
        moneyText(payload.net_benefits_for_2025) || moneyText(fact?.benefits_paid),
      benefitsRepaid: moneyText(payload.benefits_repaid) || moneyText(fact?.benefits_repaid),
      netBenefits: moneyText(payload.net_benefits) || moneyText(fact?.net_benefits),
      medicarePartBPremiums: moneyText(fact?.medicare_part_b_premiums),
      medicarePartDPremiums: moneyText(fact?.medicare_part_d_premiums),
    };
  });

  for (const [documentId, fact] of benefitsByDocumentId.entries()) {
    if (drafts.some((entry) => entry.documentId === documentId)) {
      continue;
    }

    drafts.push({
      ...emptySsa1099EditorDraft(),
      documentId,
      __factRaw: fact,
      personId: asString(fact.person_id) ?? taxpayerPersonId,
      benefitsPaid: moneyText(fact.benefits_paid),
      benefitsRepaid: moneyText(fact.benefits_repaid),
      netBenefits: moneyText(fact.net_benefits),
      medicarePartBPremiums: moneyText(fact.medicare_part_b_premiums),
      medicarePartDPremiums: moneyText(fact.medicare_part_d_premiums),
    });
  }

  return drafts;
}

function parse1098Documents(
  documents: ReadonlyArray<UnknownRecord>,
  mortgageInterestByDocumentId: ReadonlyMap<string, UnknownRecord>,
): ReadonlyArray<Form1098EditorDraft> {
  const drafts: Form1098EditorDraft[] = documents.map((document) => {
    const payload = asRecord(document.payload) ?? {};
    const documentId = asString(document.document_id) ?? "";
    const fact = mortgageInterestByDocumentId.get(documentId);
    const propertyAddress = asRecord(payload.property_address) ?? asRecord(fact?.property_address) ?? {};

    return {
      __raw: document,
      __factRaw: fact,
      documentId,
      lenderName: asString(payload.lender_name) ?? asString(document.issuer_name) ?? "",
      lenderTin: asString(payload.lender_tin) ?? "",
      mortgageInterestReceived:
        moneyText(payload.mortgage_interest_received) ||
        moneyText(fact?.mortgage_interest_received),
      pointsPaid:
        moneyText(payload.points_paid_on_purchase_of_principal_residence) ||
        moneyText(fact?.points_paid),
      mortgageInsurancePremiums:
        moneyText(payload.mortgage_insurance_premiums) ||
        moneyText(fact?.mortgage_insurance_premiums),
      realEstateTaxesPaid:
        moneyText(payload.real_estate_taxes_paid) || moneyText(fact?.real_estate_taxes_paid),
      propertyAddressLine1: asString(propertyAddress.line1) ?? "",
      propertyAddressCity: asString(propertyAddress.city) ?? "",
      propertyAddressStateCode: asString(propertyAddress.state_code) ?? "",
      propertyAddressPostalCode: asString(propertyAddress.postal_code) ?? "",
      propertyAddressCountryCode: asString(propertyAddress.country_code) ?? "US",
      securedDebtUsedForHome: readSecuredDebtUsedForHome(fact),
    };
  });

  for (const [documentId, fact] of mortgageInterestByDocumentId.entries()) {
    if (drafts.some((entry) => entry.documentId === documentId)) {
      continue;
    }

    const propertyAddress = asRecord(fact.property_address) ?? {};

    drafts.push({
      ...empty1098EditorDraft(),
      documentId,
      __factRaw: fact,
      lenderName: asString(fact.lender_name) ?? "",
      mortgageInterestReceived: moneyText(fact.mortgage_interest_received),
      pointsPaid: moneyText(fact.points_paid),
      mortgageInsurancePremiums: moneyText(fact.mortgage_insurance_premiums),
      realEstateTaxesPaid: moneyText(fact.real_estate_taxes_paid),
      propertyAddressLine1: asString(propertyAddress.line1) ?? "",
      propertyAddressCity: asString(propertyAddress.city) ?? "",
      propertyAddressStateCode: asString(propertyAddress.state_code) ?? "",
      propertyAddressPostalCode: asString(propertyAddress.postal_code) ?? "",
      propertyAddressCountryCode: asString(propertyAddress.country_code) ?? "US",
      securedDebtUsedForHome: readSecuredDebtUsedForHome(fact),
    });
  }

  return drafts;
}

function parse1098EDocuments(
  documents: ReadonlyArray<UnknownRecord>,
): ReadonlyArray<Form1098EEditorDraft> {
  return documents.map((document) => {
    const payload = asRecord(document.payload) ?? {};

    return {
      __raw: document,
      documentId: asString(document.document_id) ?? "",
      lenderName: asString(payload.lender_name) ?? asString(document.issuer_name) ?? "",
      lenderTin: asString(payload.lender_tin) ?? "",
      studentLoanInterestReceivedByLender: moneyText(
        payload.student_loan_interest_received_by_lender,
      ),
    };
  });
}

function parse1098TDocuments(
  documents: ReadonlyArray<UnknownRecord>,
  tuitionFactByDocumentId: ReadonlyMap<string, UnknownRecord>,
): ReadonlyArray<Form1098TEditorDraft> {
  const drafts: Form1098TEditorDraft[] = documents.map((document) => {
    const payload = asRecord(document.payload) ?? {};
    const documentId = asString(document.document_id) ?? "";
    const fact = tuitionFactByDocumentId.get(documentId);

    return {
      __raw: document,
      __factRaw: fact,
      documentId,
      filerName: asString(payload.filer_name) ?? asString(document.issuer_name) ?? "",
      filerTin: asString(payload.filer_tin) ?? "",
      studentPersonId: asString(fact?.student_person_id) ?? taxpayerPersonId,
      qualifiedExpensesPaid:
        moneyText(payload.payments_received_for_qualified_tuition_and_related_expenses) ||
        moneyText(fact?.qualified_expenses_paid),
      taxFreeAssistance:
        moneyText(payload.scholarships_or_grants) || moneyText(fact?.tax_free_assistance),
      isAotcCandidate: asBoolean(fact?.is_aotc_candidate) ?? true,
      isLlcCandidate: asBoolean(fact?.is_llc_candidate) ?? false,
      studentHalfTime: asBoolean(payload.student_half_time) ?? false,
      graduateStudent: asBoolean(payload.graduate_student) ?? false,
    };
  });

  for (const [documentId, fact] of tuitionFactByDocumentId.entries()) {
    if (drafts.some((entry) => entry.documentId === documentId)) {
      continue;
    }

    drafts.push({
      ...empty1098TEditorDraft(),
      documentId,
      __factRaw: fact,
      studentPersonId: asString(fact.student_person_id) ?? taxpayerPersonId,
      qualifiedExpensesPaid: moneyText(fact.qualified_expenses_paid),
      taxFreeAssistance: moneyText(fact.tax_free_assistance),
      isAotcCandidate: asBoolean(fact.is_aotc_candidate) ?? true,
      isLlcCandidate: asBoolean(fact.is_llc_candidate) ?? false,
    });
  }

  return drafts;
}

function parse1095ADocuments(
  documents: ReadonlyArray<UnknownRecord>,
  policyByDocumentId: ReadonlyMap<string, UnknownRecord>,
): ReadonlyArray<Form1095AEditorDraft> {
  const drafts: Form1095AEditorDraft[] = documents.map((document) => {
    const payload = asRecord(document.payload) ?? {};
    const documentId = asString(document.document_id) ?? "";
    const policy = policyByDocumentId.get(documentId);
    const monthlyRows = asArrayRecords(payload.monthly_rows);
    const policyMonthlyRows = asArrayRecords(policy?.monthly_rows);

    return {
      __raw: document,
      __policyRaw: policy,
      documentId,
      recipientPersonId: inferRecipientPersonId(document, policy),
      marketplaceIdentifier:
        asString(payload.marketplace_identifier) ||
        asString(policy?.marketplace_identifier) ||
        "",
      policyNumber: asString(payload.policy_number) || asString(policy?.policy_number) || "",
      coveredPersonIds: csvFromArray(
        policy == null ? [] : asArray(policy.covered_person_ids),
      ),
      monthlyRows:
        (monthlyRows.length > 0 ? monthlyRows : policyMonthlyRows).map(parseMarketplaceMonthlyRow),
    };
  });

  for (const [documentId, policy] of policyByDocumentId.entries()) {
    if (drafts.some((entry) => entry.documentId === documentId)) {
      continue;
    }

    drafts.push({
      ...empty1095AEditorDraft(),
      documentId,
      __policyRaw: policy,
      recipientPersonId: inferRecipientPersonId(undefined, policy),
      marketplaceIdentifier: asString(policy.marketplace_identifier) ?? "",
      policyNumber: asString(policy.policy_number) ?? "",
      coveredPersonIds: csvFromArray(asArray(policy.covered_person_ids)),
      monthlyRows: asArrayRecords(policy.monthly_rows).map(parseMarketplaceMonthlyRow),
    });
  }

  return drafts;
}

function parse1099NecDocuments(
  documents: ReadonlyArray<UnknownRecord>,
  necByDocumentId: ReadonlyMap<string, UnknownRecord>,
): ReadonlyArray<Form1099NecEditorDraft> {
  const drafts: Form1099NecEditorDraft[] = documents.map((document) => {
    const payload = asRecord(document.payload) ?? {};
    const documentId = asString(document.document_id) ?? "";
    const fact = necByDocumentId.get(documentId);

    return {
      __raw: document,
      __factRaw: fact,
      documentId,
      personId: asString(fact?.person_id) ?? taxpayerPersonId,
      payerName: asString(payload.payer_name) ?? asString(document.issuer_name) ?? "",
      payerTin: asString(payload.payer_tin) ?? "",
      amount:
        moneyText(payload.nonemployee_compensation) || moneyText(fact?.amount),
      federalIncomeTaxWithheld:
        moneyText(payload.federal_income_tax_withheld) ||
        moneyText(fact?.federal_income_tax_withheld),
      linkedBusinessId: asString(fact?.linked_business_id) ?? "",
    };
  });

  for (const [documentId, fact] of necByDocumentId.entries()) {
    if (drafts.some((entry) => entry.documentId === documentId)) {
      continue;
    }

    drafts.push({
      ...empty1099NecEditorDraft(),
      documentId,
      __factRaw: fact,
      personId: asString(fact.person_id) ?? taxpayerPersonId,
      payerName: asString(fact.payer_name) ?? "",
      amount: moneyText(fact.amount),
      federalIncomeTaxWithheld: moneyText(fact.federal_income_tax_withheld),
      linkedBusinessId: asString(fact.linked_business_id) ?? "",
    });
  }

  return drafts;
}

function parse1099MiscDocuments(
  documents: ReadonlyArray<UnknownRecord>,
  miscByDocumentId: ReadonlyMap<string, ReadonlyArray<UnknownRecord>>,
): ReadonlyArray<Form1099MiscEditorDraft> {
  const drafts: Form1099MiscEditorDraft[] = documents.map((document) => {
    const payload = asRecord(document.payload) ?? {};
    const documentId = asString(document.document_id) ?? "";
    const factRows = miscByDocumentId.get(documentId) ?? [];

    return {
      __raw: document,
      __factRows: factRows,
      documentId,
      personId: asString(factRows[0]?.person_id) ?? taxpayerPersonId,
      payerName: asString(payload.payer_name) ?? asString(document.issuer_name) ?? "",
      payerTin: asString(payload.payer_tin) ?? "",
      rents: moneyText(payload.rents) || categoryMoneyText(factRows, "rents"),
      royalties: moneyText(payload.royalties) || categoryMoneyText(factRows, "royalties"),
      otherIncome:
        moneyText(payload.other_income) || categoryMoneyText(factRows, "other_income"),
      fishingBoatProceeds:
        moneyText(payload.fishing_boat_proceeds) ||
        categoryMoneyText(factRows, "fishing_boat_proceeds"),
      medicalAndHealthCarePayments:
        moneyText(payload.medical_and_health_care_payments) ||
        categoryMoneyText(factRows, "medical_and_health_care_payments"),
      cropInsuranceProceeds:
        moneyText(payload.crop_insurance_proceeds) ||
        categoryMoneyText(factRows, "crop_insurance_proceeds"),
      grossProceedsPaidToAttorney:
        moneyText(payload.gross_proceeds_paid_to_attorney) ||
        categoryMoneyText(factRows, "gross_proceeds_paid_to_attorney"),
      substitutePaymentsInLieuOfDividendsOrInterest:
        moneyText(payload.substitute_payments_in_lieu_of_dividends_or_interest) ||
        categoryMoneyText(
          factRows,
          "substitute_payments_in_lieu_of_dividends_or_interest",
        ),
      section409aDeferrals:
        moneyText(payload.section_409a_deferrals) ||
        categoryMoneyText(factRows, "section_409a_deferrals"),
      nonqualifiedDeferredCompensation:
        moneyText(payload.nonqualified_deferred_compensation) ||
        categoryMoneyText(factRows, "nonqualified_deferred_compensation"),
      federalIncomeTaxWithheld:
        moneyText(payload.federal_income_tax_withheld) ||
        moneyText(factRows[0]?.federal_income_tax_withheld),
    };
  });

  for (const [documentId, factRows] of miscByDocumentId.entries()) {
    if (drafts.some((entry) => entry.documentId === documentId)) {
      continue;
    }

    drafts.push({
      ...empty1099MiscEditorDraft(),
      documentId,
      __factRows: factRows,
      personId: asString(factRows[0]?.person_id) ?? taxpayerPersonId,
      payerName: asString(factRows[0]?.payer_name) ?? "",
      rents: categoryMoneyText(factRows, "rents"),
      royalties: categoryMoneyText(factRows, "royalties"),
      otherIncome: categoryMoneyText(factRows, "other_income"),
      fishingBoatProceeds: categoryMoneyText(factRows, "fishing_boat_proceeds"),
      medicalAndHealthCarePayments: categoryMoneyText(
        factRows,
        "medical_and_health_care_payments",
      ),
      cropInsuranceProceeds: categoryMoneyText(factRows, "crop_insurance_proceeds"),
      grossProceedsPaidToAttorney: categoryMoneyText(
        factRows,
        "gross_proceeds_paid_to_attorney",
      ),
      substitutePaymentsInLieuOfDividendsOrInterest: categoryMoneyText(
        factRows,
        "substitute_payments_in_lieu_of_dividends_or_interest",
      ),
      section409aDeferrals: categoryMoneyText(factRows, "section_409a_deferrals"),
      nonqualifiedDeferredCompensation: categoryMoneyText(
        factRows,
        "nonqualified_deferred_compensation",
      ),
      federalIncomeTaxWithheld: moneyText(factRows[0]?.federal_income_tax_withheld),
    });
  }

  return drafts;
}

function parseScheduleCBusiness(business: UnknownRecord): ScheduleCBusinessEditorDraft {
  return {
    __raw: business,
    businessId: asString(business.business_id) ?? "",
    ownerPersonId: asString(business.owner_person_id) ?? taxpayerPersonId,
    businessName: asString(business.business_name) ?? "",
    businessEin: asString(business.business_ein) ?? "",
    principalBusinessCode: asString(business.principal_business_code) ?? "",
    accountingMethod: asString(business.accounting_method) ?? "cash",
    materiallyParticipates: asBoolean(business.materially_participates) ?? true,
    grossReceiptsOrSales: moneyText(business.gross_receipts_or_sales),
    returnsAndAllowances: moneyText(business.returns_and_allowances),
    costOfGoodsSold: moneyText(business.cost_of_goods_sold),
    otherBusinessIncome: moneyText(business.other_business_income),
    totalExpenses: moneyText(sumNamedAmounts(asArrayRecords(business.expenses))),
    homeOfficeDeduction: moneyText(business.home_office_deduction),
    vehicleExpenseMethod: asString(business.vehicle_expense_method) ?? "standard_mileage",
    sourceDocumentIds: csvFromArray(asArray(business.source_document_ids)),
  };
}

function parseScheduleEActivity(activity: UnknownRecord): ScheduleEActivityEditorDraft {
  return {
    __raw: activity,
    activityId: asString(activity.activity_id) ?? "",
    ownerPersonId: asString(activity.owner_person_id) ?? taxpayerPersonId,
    activityType: asString(activity.activity_type) ?? "rental_real_estate",
    entityName: asString(activity.entity_name) ?? "",
    entityEin: asString(activity.entity_ein) ?? "",
    materiallyParticipates:
      activity.materially_participates === true
        ? "yes"
        : activity.materially_participates === false
          ? "no"
          : "unset",
    totalIncome: moneyText(sumNamedAmounts(asArrayRecords(activity.income_items))),
    totalExpenses: moneyText(sumNamedAmounts(asArrayRecords(activity.expense_items))),
    sourceDocumentIds: csvFromArray(asArray(activity.source_document_ids)),
  };
}

function parseOtherIncomeItem(item: UnknownRecord): OtherIncomeItemEditorDraft {
  return {
    __raw: item,
    otherIncomeId: asString(item.other_income_id) ?? "",
    personId: asString(item.person_id) ?? taxpayerPersonId,
    description: asString(item.description) ?? "",
    amount: moneyText(item.amount),
    schedule1Category: asString(item.schedule1_category) ?? "other_income",
    sourceDocumentIds: csvFromArray(asArray(item.source_document_ids)),
  };
}

function parseSupplementalWithholding(
  withholding: UnknownRecord,
): SupplementalWithholdingEditorDraft {
  return {
    __raw: withholding,
    withholdingId: asString(withholding.withholding_id) ?? "",
    personId: asString(withholding.person_id) ?? taxpayerPersonId,
    sourceDocumentId: asString(withholding.source_document_id) ?? "",
    amount: moneyText(withholding.amount),
    description: asString(withholding.description) ?? "",
  };
}

function parseNamedAmount(item: UnknownRecord): NamedAmountEditorDraft {
  const sourceDocumentId = asString(asArrayRecords(item.source_refs)[0]?.document_id) ?? "";

  return {
    __raw: item,
    code: asString(item.code) ?? "",
    description: asString(item.description) ?? "",
    amount: moneyText(item.amount),
    personId: asString(item.person_id) ?? "",
    sourceDocumentId,
  };
}

function parseCareProvider(provider: UnknownRecord): CareProviderEditorDraft {
  const address = asRecord(provider.address) ?? {};

  return {
    __raw: provider,
    providerId: asString(provider.provider_id) ?? "",
    name: asString(provider.name) ?? "",
    tinToken: asString(provider.tin_token) ?? "",
    last4Tin: asString(provider.last4_tin) ?? "",
    addressLine1: asString(address.line1) ?? "",
    addressCity: asString(address.city) ?? "",
    addressStateCode: asString(address.state_code) ?? "",
    addressPostalCode: asString(address.postal_code) ?? "",
    addressCountryCode: asString(address.country_code) ?? "US",
  };
}

function parseCareExpense(expense: UnknownRecord): CareExpenseEditorDraft {
  return {
    __raw: expense,
    personId: asString(expense.person_id) ?? "",
    providerId: asString(expense.provider_id) ?? "",
    amount: moneyText(expense.amount),
    monthsOfCare: integerText(expense.months_of_care),
  };
}

function parseEnergyProject(project: UnknownRecord): EnergyProjectEditorDraft {
  const address = asRecord(project.property_address) ?? {};

  return {
    __raw: project,
    projectId: asString(project.project_id) ?? "",
    creditCategory: asString(project.credit_category) ?? "solar_electric",
    qualifiedCost: moneyText(project.qualified_cost),
    placedInServiceDate: asString(project.placed_in_service_date) ?? "",
    propertyAddressLine1: asString(address.line1) ?? "",
    propertyAddressCity: asString(address.city) ?? "",
    propertyAddressStateCode: asString(address.state_code) ?? "",
    propertyAddressPostalCode: asString(address.postal_code) ?? "",
    propertyAddressCountryCode: asString(address.country_code) ?? "US",
  };
}

function parseVehicleCredit(vehicle: UnknownRecord): VehicleCreditEditorDraft {
  return {
    __raw: vehicle,
    vehicleClaimId: asString(vehicle.vehicle_claim_id) ?? "",
    vinLast8: asString(vehicle.vin_last8) ?? "",
    cleanVehicleType: asString(vehicle.clean_vehicle_type) ?? "new_clean_vehicle",
    purchaseDate: asString(vehicle.purchase_date) ?? "",
    msrpOrSalesPrice: moneyText(vehicle.msrp_or_sales_price),
    tentativeCredit: moneyText(vehicle.tentative_credit),
  };
}

function parseHsaCoverageMonth(item: UnknownRecord): HsaCoverageMonthEditorDraft {
  return {
    __raw: item,
    personId: asString(item.person_id) ?? taxpayerPersonId,
    month: asString(item.month) ?? "january",
    coverageType: asString(item.coverage_type) ?? "self_only",
  };
}

function parseElectionChoice(choice: UnknownRecord): ElectionChoiceEditorDraft {
  return {
    __raw: choice,
    electionCode: asString(choice.election_code) ?? "",
    description: asString(choice.description) ?? "",
    selectedValueText: stringifyLooseValue(choice.selected_value),
    selectionBasis: asString(choice.selection_basis) ?? "user_selected",
    notes: asString(choice.notes) ?? "",
  };
}

function parseBrokerTransaction(
  transaction: UnknownRecord,
): BrokerTransactionEditorDraft {
  return {
    __raw: transaction,
    transactionId: asString(transaction.transaction_id) ?? "",
    assetDescription: asString(transaction.asset_description) ?? "",
    dateAcquired: asString(transaction.date_acquired) ?? "",
    dateSold: asString(transaction.date_sold) ?? "",
    proceeds: moneyText(transaction.proceeds),
    costBasis: moneyText(transaction.cost_basis),
    accruedMarketDiscount: moneyText(transaction.accrued_market_discount),
    washSaleLossDisallowed: moneyText(transaction.wash_sale_loss_disallowed),
    gainOrLoss: moneyText(transaction.gain_or_loss),
    basisReportedToIrs:
      transaction.basis_reported_to_irs === true
        ? "reported"
        : transaction.basis_reported_to_irs === false
          ? "not_reported"
          : "unset",
    term: asString(transaction.term) ?? "long",
    form8949Box: asString(transaction.form_8949_box) ?? "A",
    countryOrIssuer: asString(transaction.country_or_issuer) ?? "",
    notes: asString(transaction.notes) ?? "",
  };
}

function parseBrokerTransactionFromFact(
  transaction: UnknownRecord,
): BrokerTransactionEditorDraft {
  return {
    __raw: transaction,
    transactionId: asString(transaction.transaction_id) ?? "",
    assetDescription: asString(transaction.asset_description) ?? "",
    dateAcquired: asString(transaction.date_acquired) ?? "",
    dateSold: asString(transaction.date_sold) ?? "",
    proceeds: moneyText(transaction.proceeds),
    costBasis: moneyText(transaction.cost_basis),
    accruedMarketDiscount: moneyText(transaction.accrued_market_discount),
    washSaleLossDisallowed: moneyText(transaction.wash_sale_loss_disallowed),
    gainOrLoss: moneyText(transaction.gain_or_loss),
    basisReportedToIrs:
      transaction.basis_reported_to_irs === true
        ? "reported"
        : transaction.basis_reported_to_irs === false
          ? "not_reported"
          : "unset",
    term: asString(transaction.term) ?? "long",
    form8949Box: asString(transaction.form_8949_box) ?? "A",
    countryOrIssuer: asString(transaction.country_or_issuer) ?? "",
    notes: asString(transaction.notes) ?? "",
  };
}

function parseMarketplaceMonthlyRow(
  row: UnknownRecord,
): MarketplaceMonthlyRowEditorDraft {
  return {
    __raw: row,
    month: asString(row.month) ?? "annual",
    enrollmentPremium: moneyText(row.enrollment_premium),
    secondLowestCostSilverPlanPremium: moneyText(
      row.second_lowest_cost_silver_plan_premium,
    ),
    advancePaymentOfPremiumTaxCredit: moneyText(
      row.advance_payment_of_premium_tax_credit,
    ),
  };
}

function serializeDocumentSections(options: {
  readonly documents: AdditionalDocumentsEditorDraft;
  readonly supplementalIncome: SupplementalIncomeEditorDraft;
  readonly deductions: DeductionsEditorDraft;
  readonly personDirectory: ReadonlyArray<PersonDirectoryEntry>;
  readonly writtenAt: string;
}) {
  const additionalDocuments: UnknownRecord[] = [];
  const capitalTransactions: UnknownRecord[] = [];
  const unemploymentFacts: UnknownRecord[] = [];
  const socialSecurityFacts: UnknownRecord[] = [];
  const mortgageInterestItems: UnknownRecord[] = [];
  const tuitionStudents: UnknownRecord[] = [];
  const marketplacePolicies: UnknownRecord[] = [];
  const necFacts: UnknownRecord[] = [];
  const miscFacts: UnknownRecord[] = [];

  options.documents.brokerageForms
    .filter(has1099BContent)
    .forEach((entry, index) => {
      const documentId = stableId(entry.documentId, "doc_1099b", index);
      const rawDocument = entry.__raw ?? {};
      const rawPayload = asRecord(rawDocument.payload) ?? {};

      const transactions = entry.transactions
        .filter(hasBrokerTransactionContent)
        .map((transaction, transactionIndex) => {
          const transactionId = stableId(
            transaction.transactionId,
            `${documentId}_tx`,
            transactionIndex,
          );

          const next = {
            ...transaction.__raw,
            transaction_id: transactionId,
            asset_description: transaction.assetDescription.trim(),
            date_acquired: stringOrNull(transaction.dateAcquired),
            date_sold: requiredIsoDate(transaction.dateSold, "1099-B sale date"),
            proceeds: requireMoney(transaction.proceeds, "1099-B proceeds"),
            cost_basis: parseMoneyOrNull(transaction.costBasis, "1099-B cost basis"),
            accrued_market_discount: parseMoneyOrNull(
              transaction.accruedMarketDiscount,
              "1099-B accrued market discount",
            ),
            wash_sale_loss_disallowed: parseMoneyOrNull(
              transaction.washSaleLossDisallowed,
              "1099-B wash sale loss disallowed",
            ),
            gain_or_loss: parseMoneyOrNull(transaction.gainOrLoss, "1099-B gain or loss"),
            basis_reported_to_irs: booleanOrNullFromTriState(transaction.basisReportedToIrs),
            term: transaction.term.trim().length > 0 ? transaction.term.trim() : "long",
            form_8949_box:
              transaction.form8949Box.trim().length > 0
                ? transaction.form8949Box.trim()
                : "A",
            country_or_issuer: transaction.countryOrIssuer.trim(),
            notes: transaction.notes.trim(),
          } satisfies UnknownRecord;

          capitalTransactions.push({
            ...next,
            source_document_id: documentId,
          });

          return next;
        });

      additionalDocuments.push({
        ...rawDocument,
        document_id: documentId,
        document_type: "FORM_1099_B",
        tax_year: 2025,
        issuer_name: entry.payerName.trim(),
        recipient_person_ids: readRecipientPersonIds(rawDocument),
        source_file:
          asRecord(rawDocument.source_file) ??
          createManualSourceFile(documentId, "FORM_1099_B", options.writtenAt),
        parse_status: asString(rawDocument.parse_status) ?? "manual_only",
        extracted_fields: asArray(rawDocument.extracted_fields),
        payload: {
          ...rawPayload,
          payer_name: entry.payerName.trim(),
          payer_tin: stringOrNull(entry.payerTin),
          recipient_account_number: entry.recipientAccountNumber.trim(),
          federal_income_tax_withheld: parseMoneyOrNull(
            entry.federalIncomeTaxWithheld,
            "1099-B federal withholding",
          ),
          transactions,
          sales_summaries: asArray(rawPayload.sales_summaries),
          state_local_rows: asArray(rawPayload.state_local_rows),
        },
      });
    });

  options.documents.unemploymentForms
    .filter(has1099GContent)
    .forEach((entry, index) => {
      const documentId = stableId(entry.documentId, "doc_1099g", index);
      const rawDocument = entry.__raw ?? {};
      const rawPayload = asRecord(rawDocument.payload) ?? {};

      additionalDocuments.push({
        ...rawDocument,
        document_id: documentId,
        document_type: "FORM_1099_G",
        tax_year: 2025,
        issuer_name: entry.payerName.trim(),
        recipient_person_ids: [normalizedPersonId(entry.personId)],
        source_file:
          asRecord(rawDocument.source_file) ??
          createManualSourceFile(documentId, "FORM_1099_G", options.writtenAt),
        parse_status: asString(rawDocument.parse_status) ?? "manual_only",
        extracted_fields: asArray(rawDocument.extracted_fields),
        payload: {
          ...rawPayload,
          payer_name: entry.payerName.trim(),
          payer_state_or_id: entry.payerStateOrId.trim(),
          unemployment_compensation: parseMoneyOrNull(
            entry.unemploymentCompensation,
            "1099-G unemployment compensation",
          ),
          federal_income_tax_withheld: parseMoneyOrNull(
            entry.federalIncomeTaxWithheld,
            "1099-G federal withholding",
          ),
        },
      });

      unemploymentFacts.push({
        ...entry.__factRaw,
        unemployment_id: stableId(
          asString(entry.__factRaw?.unemployment_id) ?? "",
          "unemployment",
          index,
        ),
        person_id: normalizedPersonId(entry.personId),
        source_document_id: documentId,
        payer_name: entry.payerName.trim(),
        unemployment_compensation: parseMoneyOrNull(
          entry.unemploymentCompensation,
          "1099-G unemployment compensation",
        ),
        federal_income_tax_withheld: parseMoneyOrNull(
          entry.federalIncomeTaxWithheld,
          "1099-G federal withholding",
        ),
        state_code: stringOrNull(entry.stateCode),
      });
    });

  options.documents.socialSecurityForms
    .filter(hasSsa1099Content)
    .forEach((entry, index) => {
      const documentId = stableId(entry.documentId, "doc_ssa1099", index);
      const rawDocument = entry.__raw ?? {};
      const rawPayload = asRecord(rawDocument.payload) ?? {};

      additionalDocuments.push({
        ...rawDocument,
        document_id: documentId,
        document_type: "FORM_SSA_1099",
        tax_year: 2025,
        issuer_name: asString(rawDocument.issuer_name) ?? "Social Security Administration",
        recipient_person_ids: [normalizedPersonId(entry.personId)],
        source_file:
          asRecord(rawDocument.source_file) ??
          createManualSourceFile(documentId, "FORM_SSA_1099", options.writtenAt),
        parse_status: asString(rawDocument.parse_status) ?? "manual_only",
        extracted_fields: asArray(rawDocument.extracted_fields),
        payload: {
          ...rawPayload,
          benefits_paid: parseMoneyOrNull(entry.benefitsPaid, "SSA-1099 benefits paid"),
          benefits_repaid: parseMoneyOrNull(entry.benefitsRepaid, "SSA-1099 benefits repaid"),
          net_benefits: parseMoneyOrNull(entry.netBenefits, "SSA-1099 net benefits"),
        },
      });

      socialSecurityFacts.push({
        ...entry.__factRaw,
        social_security_id: stableId(
          asString(entry.__factRaw?.social_security_id) ?? "",
          "ssa",
          index,
        ),
        person_id: normalizedPersonId(entry.personId),
        source_document_id: documentId,
        benefits_paid: parseMoneyOrNull(entry.benefitsPaid, "SSA-1099 benefits paid"),
        benefits_repaid: parseMoneyOrNull(entry.benefitsRepaid, "SSA-1099 benefits repaid"),
        net_benefits: parseMoneyOrNull(entry.netBenefits, "SSA-1099 net benefits"),
        medicare_part_b_premiums: parseMoneyOrNull(
          entry.medicarePartBPremiums,
          "Medicare Part B premiums",
        ),
        medicare_part_d_premiums: parseMoneyOrNull(
          entry.medicarePartDPremiums,
          "Medicare Part D premiums",
        ),
      });
    });

  options.documents.mortgageInterestForms
    .filter(has1098Content)
    .forEach((entry, index) => {
      const documentId = stableId(entry.documentId, "doc_1098", index);
      const rawDocument = entry.__raw ?? {};
      const rawPayload = asRecord(rawDocument.payload) ?? {};

      additionalDocuments.push({
        ...rawDocument,
        document_id: documentId,
        document_type: "FORM_1098",
        tax_year: 2025,
        issuer_name: entry.lenderName.trim(),
        recipient_person_ids: [taxpayerPersonId],
        source_file:
          asRecord(rawDocument.source_file) ??
          createManualSourceFile(documentId, "FORM_1098", options.writtenAt),
        parse_status: asString(rawDocument.parse_status) ?? "manual_only",
        extracted_fields: asArray(rawDocument.extracted_fields),
        payload: {
          ...rawPayload,
          lender_name: entry.lenderName.trim(),
          lender_tin: stringOrNull(entry.lenderTin),
          mortgage_interest_received: parseMoneyOrNull(
            entry.mortgageInterestReceived,
            "1098 mortgage interest received",
          ),
          mortgage_insurance_premiums: parseMoneyOrNull(
            entry.mortgageInsurancePremiums,
            "1098 mortgage insurance premiums",
          ),
          points_paid_on_purchase_of_principal_residence: parseMoneyOrNull(
            entry.pointsPaid,
            "1098 points paid",
          ),
          property_address: serializePostalAddress({
            line1: entry.propertyAddressLine1,
            city: entry.propertyAddressCity,
            stateCode: entry.propertyAddressStateCode,
            postalCode: entry.propertyAddressPostalCode,
            countryCode: entry.propertyAddressCountryCode,
          }),
          real_estate_taxes_paid: parseMoneyOrNull(
            entry.realEstateTaxesPaid,
            "1098 real estate taxes paid",
          ),
        },
      });

      mortgageInterestItems.push({
        ...entry.__factRaw,
        mortgage_interest_id: stableId(
          asString(entry.__factRaw?.mortgage_interest_id) ?? "",
          "mortgage_interest",
          index,
        ),
        source_document_id: documentId,
        lender_name: entry.lenderName.trim(),
        mortgage_interest_received: parseMoneyOrNull(
          entry.mortgageInterestReceived,
          "1098 mortgage interest received",
        ),
        points_paid: parseMoneyOrNull(entry.pointsPaid, "1098 points paid"),
        mortgage_insurance_premiums: parseMoneyOrNull(
          entry.mortgageInsurancePremiums,
          "1098 mortgage insurance premiums",
        ),
        real_estate_taxes_paid: parseMoneyOrNull(
          entry.realEstateTaxesPaid,
          "1098 real estate taxes paid",
        ),
        property_address: serializePostalAddress({
          line1: entry.propertyAddressLine1,
          city: entry.propertyAddressCity,
          stateCode: entry.propertyAddressStateCode,
          postalCode: entry.propertyAddressPostalCode,
          countryCode: entry.propertyAddressCountryCode,
        }),
        secured_debt_used_for_home:
          entry.securedDebtUsedForHome === "secured"
            ? true
            : entry.securedDebtUsedForHome === "not_secured"
              ? false
              : null,
      });
    });

  let studentLoanInterestAmount = 0;

  options.documents.studentLoanForms
    .filter(has1098EContent)
    .forEach((entry, index) => {
      const documentId = stableId(entry.documentId, "doc_1098e", index);
      const rawDocument = entry.__raw ?? {};
      const rawPayload = asRecord(rawDocument.payload) ?? {};
      const interestAmount =
        parseMoneyOrNull(
          entry.studentLoanInterestReceivedByLender,
          "1098-E student loan interest received by lender",
        ) ?? 0;

      studentLoanInterestAmount += interestAmount;

      additionalDocuments.push({
        ...rawDocument,
        document_id: documentId,
        document_type: "FORM_1098_E",
        tax_year: 2025,
        issuer_name: entry.lenderName.trim(),
        recipient_person_ids: [taxpayerPersonId],
        source_file:
          asRecord(rawDocument.source_file) ??
          createManualSourceFile(documentId, "FORM_1098_E", options.writtenAt),
        parse_status: asString(rawDocument.parse_status) ?? "manual_only",
        extracted_fields: asArray(rawDocument.extracted_fields),
        payload: {
          ...rawPayload,
          lender_name: entry.lenderName.trim(),
          lender_tin: stringOrNull(entry.lenderTin),
          student_loan_interest_received_by_lender: interestAmount,
        },
      });
    });

  options.documents.tuitionForms
    .filter(has1098TContent)
    .forEach((entry, index) => {
      const documentId = stableId(entry.documentId, "doc_1098t", index);
      const rawDocument = entry.__raw ?? {};
      const rawPayload = asRecord(rawDocument.payload) ?? {};
      const student = findPersonEntry(options.personDirectory, entry.studentPersonId);

      additionalDocuments.push({
        ...rawDocument,
        document_id: documentId,
        document_type: "FORM_1098_T",
        tax_year: 2025,
        issuer_name: entry.filerName.trim(),
        recipient_person_ids: [normalizedPersonId(entry.studentPersonId)],
        source_file:
          asRecord(rawDocument.source_file) ??
          createManualSourceFile(documentId, "FORM_1098_T", options.writtenAt),
        parse_status: asString(rawDocument.parse_status) ?? "manual_only",
        extracted_fields: asArray(rawDocument.extracted_fields),
        payload: {
          ...rawPayload,
          filer_name: entry.filerName.trim(),
          filer_tin: stringOrNull(entry.filerTin),
          student_name: serializeNameFromPerson(student, asRecord(rawPayload.student_name)),
          payments_received_for_qualified_tuition_and_related_expenses: parseMoneyOrNull(
            entry.qualifiedExpensesPaid,
            "1098-T qualified expenses paid",
          ),
          scholarships_or_grants: parseMoneyOrNull(
            entry.taxFreeAssistance,
            "1098-T tax-free assistance",
          ),
          student_half_time: entry.studentHalfTime,
          graduate_student: entry.graduateStudent,
        },
      });

      tuitionStudents.push({
        ...entry.__factRaw,
        student_person_id: normalizedPersonId(entry.studentPersonId),
        source_document_ids: [documentId],
        qualified_expenses_paid: parseMoneyOrNull(
          entry.qualifiedExpensesPaid,
          "1098-T qualified expenses paid",
        ),
        tax_free_assistance: parseMoneyOrNull(
          entry.taxFreeAssistance,
          "1098-T tax-free assistance",
        ),
        is_aotc_candidate: entry.isAotcCandidate,
        is_llc_candidate: entry.isLlcCandidate,
      });
    });

  options.documents.marketplaceForms
    .filter(has1095AContent)
    .forEach((entry, index) => {
      const documentId = stableId(entry.documentId, "doc_1095a", index);
      const rawDocument = entry.__raw ?? {};
      const rawPayload = asRecord(rawDocument.payload) ?? {};
      const recipient = findPersonEntry(options.personDirectory, entry.recipientPersonId);
      const coveredPersonIds = csvToList(entry.coveredPersonIds);
      const householdMembers = coveredPersonIds.map((personId) =>
        serializeHouseholdMember(findPersonEntry(options.personDirectory, personId)),
      );
      const monthlyRows = entry.monthlyRows
        .filter(has1095AMonthlyRowContent)
        .map(serializeMarketplaceMonthlyRow);

      additionalDocuments.push({
        ...rawDocument,
        document_id: documentId,
        document_type: "FORM_1095_A",
        tax_year: 2025,
        issuer_name:
          entry.marketplaceIdentifier.trim().length > 0
            ? entry.marketplaceIdentifier.trim()
            : "Health Insurance Marketplace",
        recipient_person_ids: coveredPersonIds.length > 0 ? coveredPersonIds : [taxpayerPersonId],
        source_file:
          asRecord(rawDocument.source_file) ??
          createManualSourceFile(documentId, "FORM_1095_A", options.writtenAt),
        parse_status: asString(rawDocument.parse_status) ?? "manual_only",
        extracted_fields: asArray(rawDocument.extracted_fields),
        payload: {
          ...rawPayload,
          marketplace_identifier: entry.marketplaceIdentifier.trim(),
          policy_number: entry.policyNumber.trim(),
          recipient_name: serializeNameFromPerson(
            recipient,
            asRecord(rawPayload.recipient_name),
          ),
          recipient_ssn_last4:
            recipient?.last4TaxId && recipient.last4TaxId.length === 4
              ? recipient.last4TaxId
              : asString(rawPayload.recipient_ssn_last4) ?? "",
          household_members: householdMembers,
          monthly_rows: monthlyRows,
        },
      });

      marketplacePolicies.push({
        ...entry.__policyRaw,
        policy_id: stableId(
          asString(entry.__policyRaw?.policy_id) ?? "",
          "marketplace_policy",
          index,
        ),
        source_document_id: documentId,
        marketplace_identifier: entry.marketplaceIdentifier.trim(),
        policy_number: entry.policyNumber.trim(),
        covered_person_ids: coveredPersonIds,
        monthly_rows: monthlyRows,
      });
    });

  options.supplementalIncome.necForms
    .filter(has1099NecContent)
    .forEach((entry, index) => {
      const documentId = stableId(entry.documentId, "doc_1099nec", index);
      const rawDocument = entry.__raw ?? {};
      const rawPayload = asRecord(rawDocument.payload) ?? {};

      additionalDocuments.push({
        ...rawDocument,
        document_id: documentId,
        document_type: "FORM_1099_NEC",
        tax_year: 2025,
        issuer_name: entry.payerName.trim(),
        recipient_person_ids: [normalizedPersonId(entry.personId)],
        source_file:
          asRecord(rawDocument.source_file) ??
          createManualSourceFile(documentId, "FORM_1099_NEC", options.writtenAt),
        parse_status: asString(rawDocument.parse_status) ?? "manual_only",
        extracted_fields: asArray(rawDocument.extracted_fields),
        payload: {
          ...rawPayload,
          payer_name: entry.payerName.trim(),
          payer_tin: stringOrNull(entry.payerTin),
          nonemployee_compensation: parseMoneyOrNull(entry.amount, "1099-NEC amount"),
          federal_income_tax_withheld: parseMoneyOrNull(
            entry.federalIncomeTaxWithheld,
            "1099-NEC federal withholding",
          ),
          payer_direct_sales: asBoolean(rawPayload.payer_direct_sales) ?? false,
          state_local_rows: asArray(rawPayload.state_local_rows),
        },
      });

      necFacts.push({
        ...entry.__factRaw,
        nec_id: stableId(asString(entry.__factRaw?.nec_id) ?? "", "nec", index),
        person_id: normalizedPersonId(entry.personId),
        source_document_id: documentId,
        payer_name: entry.payerName.trim(),
        amount: parseMoneyOrNull(entry.amount, "1099-NEC amount"),
        federal_income_tax_withheld: parseMoneyOrNull(
          entry.federalIncomeTaxWithheld,
          "1099-NEC federal withholding",
        ),
        state_local_rows: asArray(entry.__factRaw?.state_local_rows),
        linked_business_id: entry.linkedBusinessId.trim(),
      });
    });

  options.supplementalIncome.miscForms
    .filter(has1099MiscContent)
    .forEach((entry, index) => {
      const documentId = stableId(entry.documentId, "doc_1099misc", index);
      const rawDocument = entry.__raw ?? {};
      const rawPayload = asRecord(rawDocument.payload) ?? {};

      additionalDocuments.push({
        ...rawDocument,
        document_id: documentId,
        document_type: "FORM_1099_MISC",
        tax_year: 2025,
        issuer_name: entry.payerName.trim(),
        recipient_person_ids: [normalizedPersonId(entry.personId)],
        source_file:
          asRecord(rawDocument.source_file) ??
          createManualSourceFile(documentId, "FORM_1099_MISC", options.writtenAt),
        parse_status: asString(rawDocument.parse_status) ?? "manual_only",
        extracted_fields: asArray(rawDocument.extracted_fields),
        payload: {
          ...rawPayload,
          payer_name: entry.payerName.trim(),
          payer_tin: stringOrNull(entry.payerTin),
          rents: parseMoneyOrNull(entry.rents, "1099-MISC rents"),
          royalties: parseMoneyOrNull(entry.royalties, "1099-MISC royalties"),
          other_income: parseMoneyOrNull(entry.otherIncome, "1099-MISC other income"),
          federal_income_tax_withheld: parseMoneyOrNull(
            entry.federalIncomeTaxWithheld,
            "1099-MISC federal withholding",
          ),
          fishing_boat_proceeds: parseMoneyOrNull(
            entry.fishingBoatProceeds,
            "1099-MISC fishing boat proceeds",
          ),
          medical_and_health_care_payments: parseMoneyOrNull(
            entry.medicalAndHealthCarePayments,
            "1099-MISC medical payments",
          ),
          crop_insurance_proceeds: parseMoneyOrNull(
            entry.cropInsuranceProceeds,
            "1099-MISC crop insurance proceeds",
          ),
          gross_proceeds_paid_to_attorney: parseMoneyOrNull(
            entry.grossProceedsPaidToAttorney,
            "1099-MISC attorney proceeds",
          ),
          substitute_payments_in_lieu_of_dividends_or_interest: parseMoneyOrNull(
            entry.substitutePaymentsInLieuOfDividendsOrInterest,
            "1099-MISC substitute payments",
          ),
          section_409a_deferrals: parseMoneyOrNull(
            entry.section409aDeferrals,
            "1099-MISC section 409A deferrals",
          ),
          nonqualified_deferred_compensation: parseMoneyOrNull(
            entry.nonqualifiedDeferredCompensation,
            "1099-MISC nonqualified deferred compensation",
          ),
          state_local_rows: asArray(rawPayload.state_local_rows),
        },
      });

      for (const [incomeCategory, amountText] of miscIncomeCategoryPairs(entry)) {
        const amount = parseMoneyOrNull(amountText, `1099-MISC ${incomeCategory}`);

        if (amount == null || amount === 0) {
          continue;
        }

        miscFacts.push({
          person_id: normalizedPersonId(entry.personId),
          source_document_id: documentId,
          misc_income_id: `${documentId}_${incomeCategory}`,
          payer_name: entry.payerName.trim(),
          income_category: incomeCategory,
          amount,
          federal_income_tax_withheld: parseMoneyOrNull(
            entry.federalIncomeTaxWithheld,
            "1099-MISC federal withholding",
          ),
          state_local_rows: [],
        });
      }
    });

  return {
    additionalDocuments,
    capitalTransactions,
    unemploymentFacts,
    socialSecurityFacts,
    mortgageInterestItems,
    studentLoanInterestAmount,
    tuitionStudents,
    marketplacePolicies,
    necFacts,
    miscFacts,
  };
}

function serializeDeductionsSection(options: {
  readonly deductions: DeductionsEditorDraft;
  readonly mortgageInterestItems: ReadonlyArray<UnknownRecord>;
  readonly studentLoanInterestFallbackAmount: number;
}) {
  const manualStudentLoanInterest = parseMoneyOrNull(
    options.deductions.studentLoanInterestDeduction,
    "Student loan interest deduction",
  );
  const studentLoanInterestDeduction =
    manualStudentLoanInterest == null
      ? options.studentLoanInterestFallbackAmount
      : manualStudentLoanInterest === 0 &&
          options.studentLoanInterestFallbackAmount > 0
        ? options.studentLoanInterestFallbackAmount
        : manualStudentLoanInterest;

  return {
    adjustments: {
      educator_expenses: parseMoneyOrNull(
        options.deductions.educatorExpenses,
        "Educator expenses",
      ),
      certain_business_expenses_of_reservists_performing_artists_and_fee_basis_officials:
        parseMoneyOrNull(options.deductions.reservistExpenses, "Reservist expenses"),
      health_savings_account_deduction: parseMoneyOrNull(
        options.deductions.healthSavingsAccountDeduction,
        "Health savings account deduction",
      ),
      moving_expenses_for_armed_forces: parseMoneyOrNull(
        options.deductions.movingExpensesForArmedForces,
        "Moving expenses for armed forces",
      ),
      deductible_part_of_self_employment_tax: parseMoneyOrNull(
        options.deductions.deductiblePartOfSelfEmploymentTax,
        "Deductible part of self-employment tax",
      ),
      self_employed_sep_simple_and_qualified_plans: parseMoneyOrNull(
        options.deductions.selfEmployedSepSimpleAndQualifiedPlans,
        "Self-employed SEP SIMPLE and qualified plans",
      ),
      self_employed_health_insurance: parseMoneyOrNull(
        options.deductions.selfEmployedHealthInsurance,
        "Self-employed health insurance",
      ),
      penalty_on_early_withdrawal_of_savings: parseMoneyOrNull(
        options.deductions.penaltyOnEarlyWithdrawalOfSavings,
        "Penalty on early withdrawal of savings",
      ),
      alimony_paid_for_pre_2019_divorce: parseMoneyOrNull(
        options.deductions.alimonyPaidForPre2019Divorce,
        "Alimony paid for pre-2019 divorce",
      ),
      ira_deduction: parseMoneyOrNull(options.deductions.iraDeduction, "IRA deduction"),
      student_loan_interest_deduction: studentLoanInterestDeduction,
      other_adjustments: options.deductions.otherAdjustments
        .filter((entry) => entry.description.trim().length > 0)
        .map(serializeNamedAmount),
    },
    itemized: {
      medical_and_dental_expenses: parseMoneyOrNull(
        options.deductions.medicalAndDentalExpenses,
        "Medical and dental expenses",
      ),
      state_and_local_income_or_sales_taxes: parseMoneyOrNull(
        options.deductions.stateAndLocalIncomeOrSalesTaxes,
        "State and local income or sales taxes",
      ),
      real_estate_taxes: parseMoneyOrNull(
        options.deductions.realEstateTaxes,
        "Real estate taxes",
      ),
      personal_property_taxes: parseMoneyOrNull(
        options.deductions.personalPropertyTaxes,
        "Personal property taxes",
      ),
      other_taxes: parseMoneyOrNull(options.deductions.otherTaxes, "Other taxes"),
      mortgage_interest_items: options.mortgageInterestItems,
      charitable_cash_contributions: parseMoneyOrNull(
        options.deductions.charitableCashContributions,
        "Charitable cash contributions",
      ),
      charitable_noncash_contributions: parseMoneyOrNull(
        options.deductions.charitableNoncashContributions,
        "Charitable noncash contributions",
      ),
      casualty_and_theft_losses: parseMoneyOrNull(
        options.deductions.casualtyAndTheftLosses,
        "Casualty and theft losses",
      ),
      other_itemized_deductions: options.deductions.otherItemizedDeductions
        .filter((entry) => entry.description.trim().length > 0)
        .map(serializeNamedAmount),
    },
  };
}

function serializeCreditsSection(options: {
  readonly credits: CreditsEditorDraft;
  readonly tuitionStudents: ReadonlyArray<UnknownRecord>;
  readonly marketplacePolicies: ReadonlyArray<UnknownRecord>;
}) {
  return {
    credits: {
      candidate_child_tax_credit_dependent_ids: csvToList(
        options.credits.candidateChildTaxCreditDependentIds,
      ),
      candidate_credit_for_other_dependent_ids: csvToList(
        options.credits.candidateCreditForOtherDependentIds,
      ),
      candidate_eitc_child_ids: csvToList(options.credits.candidateEitcChildIds),
      child_and_dependent_care: {
        qualifying_person_ids: csvToList(options.credits.qualifyingPersonIdsForCare),
        providers: options.credits.careProviders
          .filter((entry) => entry.name.trim().length > 0)
          .map(serializeCareProvider),
        expenses: options.credits.careExpenses
          .filter((entry) => entry.personId.trim().length > 0)
          .map(serializeCareExpense),
      },
      education_credits: {
        students: options.tuitionStudents,
      },
      premium_tax_credit: {
        policies: options.marketplacePolicies,
      },
      residential_clean_energy: {
        projects: options.credits.residentialCleanEnergyProjects
          .filter((entry) => entry.creditCategory.trim().length > 0)
          .map(serializeEnergyProject),
      },
      clean_vehicle_credits: {
        vehicles: options.credits.cleanVehicleCredits
          .filter((entry) => entry.cleanVehicleType.trim().length > 0)
          .map(serializeVehicleCredit),
      },
      retirement_savings_contributions_credit_candidate_person_ids: csvToList(
        options.credits.retirementSavingsContributionsCreditCandidatePersonIds,
      ),
      other_nonrefundable_credits: options.credits.otherNonrefundableCredits
        .filter((entry) => entry.description.trim().length > 0)
        .map(serializeNamedAmount),
      other_refundable_credits: options.credits.otherRefundableCredits
        .filter((entry) => entry.description.trim().length > 0)
        .map(serializeNamedAmount),
    },
    healthCoverage: {
      marketplace_policies: options.marketplacePolicies,
      hsa_coverage_months: options.credits.hsaCoverageMonths
        .filter((entry) => entry.personId.trim().length > 0)
        .map(serializeHsaCoverageMonth),
    },
  };
}

function serializeTaxpayerSupplement(
  taxpayer: TaxpayerSupplementEditorDraft,
): UnknownRecord {
  return {
    ...taxpayer.__raw,
    date_of_birth: stringOrNull(taxpayer.dateOfBirth),
    tax_id_token: stringOrNull(taxpayer.taxIdToken),
    last4_tax_id: taxpayer.last4TaxId.trim(),
    citizenship_status:
      taxpayer.citizenshipStatus.trim().length > 0
        ? taxpayer.citizenshipStatus.trim()
        : "us_citizen",
    is_blind: taxpayer.isBlind,
    is_full_time_student: taxpayer.isFullTimeStudent,
    occupation: taxpayer.occupation.trim(),
  };
}

function serializeSpouse(spouse: SpouseEditorDraft): UnknownRecord {
  return {
    ...spouse.__raw,
    person_id: normalizedPersonId(spouse.personId, "p_spouse"),
    role: "spouse",
    name: {
      first: spouse.firstName.trim(),
      last: spouse.lastName.trim(),
      full_legal_name: spouse.fullLegalName.trim(),
    },
    date_of_birth: stringOrNull(spouse.dateOfBirth),
    tax_id_token: stringOrNull(spouse.taxIdToken),
    last4_tax_id: spouse.last4TaxId.trim(),
    citizenship_status:
      spouse.citizenshipStatus.trim().length > 0
        ? spouse.citizenshipStatus.trim()
        : "us_citizen",
    is_blind: spouse.isBlind,
    is_full_time_student: spouse.isFullTimeStudent,
    occupation: spouse.occupation.trim(),
  };
}

function serializeDependent(dependent: DependentEditorDraft): UnknownRecord {
  return {
    ...dependent.__raw,
    person_id: normalizedPersonId(dependent.personId, "p_dependent"),
    role: "dependent",
    name: {
      first: dependent.firstName.trim(),
      last: dependent.lastName.trim(),
      full_legal_name: dependent.fullLegalName.trim(),
    },
    date_of_birth: stringOrNull(dependent.dateOfBirth),
    tax_id_token: stringOrNull(dependent.taxIdToken),
    last4_tax_id: dependent.last4TaxId.trim(),
    relationship_to_taxpayer: dependent.relationshipToTaxpayer.trim(),
    months_lived_with_taxpayer: parseIntegerOrNull(
      dependent.monthsLivedWithTaxpayer,
      "Dependent months lived with taxpayer",
    ),
    support_percentage_provided_by_taxpayer: parseMoneyOrNull(
      dependent.supportPercentageProvidedByTaxpayer,
      "Dependent support percentage provided by taxpayer",
    ),
    qualifying_for_child_tax_credit: dependent.qualifyingForChildTaxCredit,
    qualifying_for_credit_for_other_dependents:
      dependent.qualifyingForCreditForOtherDependents,
    qualifying_for_eitc: dependent.qualifyingForEitc,
    is_disabled: dependent.isDisabled,
    is_full_time_student: dependent.isFullTimeStudent,
  };
}

function serializeScheduleCBusiness(
  business: ScheduleCBusinessEditorDraft,
): UnknownRecord {
  return {
    ...business.__raw,
    business_id: business.businessId.trim(),
    owner_person_id: normalizedPersonId(business.ownerPersonId),
    business_name: business.businessName.trim(),
    business_ein: stringOrNull(business.businessEin),
    principal_business_code: business.principalBusinessCode.trim(),
    accounting_method:
      business.accountingMethod.trim().length > 0
        ? business.accountingMethod.trim()
        : "cash",
    materially_participates: business.materiallyParticipates,
    gross_receipts_or_sales: parseMoneyOrNull(
      business.grossReceiptsOrSales,
      "Schedule C gross receipts or sales",
    ),
    returns_and_allowances: parseMoneyOrNull(
      business.returnsAndAllowances,
      "Schedule C returns and allowances",
    ),
    cost_of_goods_sold: parseMoneyOrNull(
      business.costOfGoodsSold,
      "Schedule C cost of goods sold",
    ),
    other_business_income: parseMoneyOrNull(
      business.otherBusinessIncome,
      "Schedule C other business income",
    ),
    expenses:
      parseMoneyOrNull(business.totalExpenses, "Schedule C total expenses") == null
        ? []
        : [
            {
              description: "Total expenses",
              amount: requireMoney(business.totalExpenses, "Schedule C total expenses"),
            },
          ],
    home_office_deduction: parseMoneyOrNull(
      business.homeOfficeDeduction,
      "Schedule C home office deduction",
    ),
    vehicle_expense_method:
      business.vehicleExpenseMethod.trim().length > 0
        ? business.vehicleExpenseMethod.trim()
        : "standard_mileage",
    source_document_ids: csvToList(business.sourceDocumentIds),
    state_allocations: asArray(business.__raw?.state_allocations),
  };
}

function serializeScheduleEActivity(
  activity: ScheduleEActivityEditorDraft,
): UnknownRecord {
  return {
    ...activity.__raw,
    activity_id: activity.activityId.trim(),
    owner_person_id: normalizedPersonId(activity.ownerPersonId),
    activity_type:
      activity.activityType.trim().length > 0
        ? activity.activityType.trim()
        : "rental_real_estate",
    entity_name: activity.entityName.trim(),
    entity_ein: stringOrNull(activity.entityEin),
    materially_participates:
      activity.materiallyParticipates === "yes"
        ? true
        : activity.materiallyParticipates === "no"
          ? false
          : null,
    income_items:
      parseMoneyOrNull(activity.totalIncome, "Schedule E total income") == null
        ? []
        : [
            {
              description: "Total income",
              amount: requireMoney(activity.totalIncome, "Schedule E total income"),
            },
          ],
    expense_items:
      parseMoneyOrNull(activity.totalExpenses, "Schedule E total expenses") == null
        ? []
        : [
            {
              description: "Total expenses",
              amount: requireMoney(activity.totalExpenses, "Schedule E total expenses"),
            },
          ],
    source_document_ids: csvToList(activity.sourceDocumentIds),
    state_allocations: asArray(activity.__raw?.state_allocations),
  };
}

function serializeOtherIncomeItem(item: OtherIncomeItemEditorDraft): UnknownRecord {
  return {
    ...item.__raw,
    other_income_id:
      item.otherIncomeId.trim().length > 0 ? item.otherIncomeId.trim() : item.description.trim(),
    person_id: normalizedPersonId(item.personId),
    description: item.description.trim(),
    amount: requireMoney(item.amount, "Other income amount"),
    schedule1_category:
      item.schedule1Category.trim().length > 0
        ? item.schedule1Category.trim()
        : "other_income",
    source_document_ids: csvToList(item.sourceDocumentIds),
    state_allocations: asArray(item.__raw?.state_allocations),
  };
}

function serializeSupplementalWithholding(
  withholding: SupplementalWithholdingEditorDraft,
): UnknownRecord {
  return {
    ...withholding.__raw,
    withholding_id:
      withholding.withholdingId.trim().length > 0
        ? withholding.withholdingId.trim()
        : `${normalizedPersonId(withholding.personId)}_supplemental_wh`,
    person_id: normalizedPersonId(withholding.personId),
    jurisdiction: "federal",
    state_code: null,
    locality_name: "",
    source_document_id: withholding.sourceDocumentId.trim(),
    amount: requireMoney(withholding.amount, "Supplemental withholding amount"),
    description: withholding.description.trim(),
  };
}

function serializeNamedAmount(item: NamedAmountEditorDraft): UnknownRecord {
  return {
    ...item.__raw,
    code: item.code.trim().length > 0 ? item.code.trim() : undefined,
    description: item.description.trim(),
    amount: requireMoney(item.amount, item.description.trim() || "Named amount"),
    currency: "USD",
    person_id: stringOrNull(item.personId),
    source_refs:
      item.sourceDocumentId.trim().length > 0
        ? [
            {
              document_id: item.sourceDocumentId.trim(),
            },
          ]
        : [],
  };
}

function serializeCareProvider(provider: CareProviderEditorDraft): UnknownRecord {
  return {
    ...provider.__raw,
    provider_id:
      provider.providerId.trim().length > 0 ? provider.providerId.trim() : provider.name.trim(),
    name: provider.name.trim(),
    tin_token: stringOrNull(provider.tinToken),
    last4_tin: provider.last4Tin.trim(),
    address: serializePostalAddress({
      line1: provider.addressLine1,
      city: provider.addressCity,
      stateCode: provider.addressStateCode,
      postalCode: provider.addressPostalCode,
      countryCode: provider.addressCountryCode,
    }),
  };
}

function serializeCareExpense(expense: CareExpenseEditorDraft): UnknownRecord {
  return {
    ...expense.__raw,
    person_id: normalizedPersonId(expense.personId),
    provider_id: stringOrNull(expense.providerId),
    amount: requireMoney(expense.amount, "Care expense amount"),
    months_of_care: parseIntegerOrNull(expense.monthsOfCare, "Months of care"),
  };
}

function serializeEnergyProject(project: EnergyProjectEditorDraft): UnknownRecord {
  return {
    ...project.__raw,
    project_id:
      project.projectId.trim().length > 0
        ? project.projectId.trim()
        : `${project.creditCategory.trim()}_${project.placedInServiceDate.trim()}`,
    property_address: serializePostalAddress({
      line1: project.propertyAddressLine1,
      city: project.propertyAddressCity,
      stateCode: project.propertyAddressStateCode,
      postalCode: project.propertyAddressPostalCode,
      countryCode: project.propertyAddressCountryCode,
    }),
    credit_category:
      project.creditCategory.trim().length > 0
        ? project.creditCategory.trim()
        : "solar_electric",
    qualified_cost: requireMoney(project.qualifiedCost, "Residential clean energy qualified cost"),
    placed_in_service_date: stringOrNull(project.placedInServiceDate),
  };
}

function serializeVehicleCredit(vehicle: VehicleCreditEditorDraft): UnknownRecord {
  return {
    ...vehicle.__raw,
    vehicle_claim_id:
      vehicle.vehicleClaimId.trim().length > 0
        ? vehicle.vehicleClaimId.trim()
        : vehicle.vinLast8.trim(),
    vin_last8: vehicle.vinLast8.trim(),
    clean_vehicle_type:
      vehicle.cleanVehicleType.trim().length > 0
        ? vehicle.cleanVehicleType.trim()
        : "new_clean_vehicle",
    purchase_date: requiredIsoDate(vehicle.purchaseDate, "Vehicle purchase date"),
    msrp_or_sales_price: parseMoneyOrNull(
      vehicle.msrpOrSalesPrice,
      "Vehicle MSRP or sales price",
    ),
    tentative_credit: parseMoneyOrNull(vehicle.tentativeCredit, "Vehicle tentative credit"),
  };
}

function serializeHsaCoverageMonth(month: HsaCoverageMonthEditorDraft): UnknownRecord {
  return {
    ...month.__raw,
    person_id: normalizedPersonId(month.personId),
    month: month.month.trim(),
    coverage_type: month.coverageType.trim(),
  };
}

function serializeElectionChoice(choice: ElectionChoiceEditorDraft): UnknownRecord {
  return {
    ...choice.__raw,
    election_code: choice.electionCode.trim(),
    description: choice.description.trim(),
    selected_value:
      choice.selectedValueText.trim().length > 0
        ? parseLooseValue(choice.selectedValueText)
        : undefined,
    selection_basis:
      choice.selectionBasis.trim().length > 0
        ? choice.selectionBasis.trim()
        : "user_selected",
    notes: choice.notes.trim(),
  };
}

function mapByDocumentId(
  items: ReadonlyArray<UnknownRecord>,
  key: string,
): Map<string, UnknownRecord> {
  const result = new Map<string, UnknownRecord>();

  for (const item of items) {
    const id = asString(item[key]) ?? "";

    if (id.length > 0) {
      result.set(id, item);
    }
  }

  return result;
}

function mapGroupedByDocumentId(
  items: ReadonlyArray<UnknownRecord>,
  key: string,
): Map<string, ReadonlyArray<UnknownRecord>> {
  const result = new Map<string, UnknownRecord[]>();

  for (const item of items) {
    const id = asString(item[key]) ?? "";

    if (id.length === 0) {
      continue;
    }

    const group = result.get(id) ?? [];
    group.push(item);
    result.set(id, group);
  }

  return result;
}

function mapBySourceDocumentId(
  items: ReadonlyArray<UnknownRecord>,
  key: string,
): Map<string, UnknownRecord> {
  const result = new Map<string, UnknownRecord>();

  for (const item of items) {
    if (key === "source_document_ids") {
      const documentId = asString(asArray(item.source_document_ids)[0]) ?? "";

      if (documentId.length > 0) {
        result.set(documentId, item);
      }

      continue;
    }

    const documentId = asString(item[key]) ?? "";

    if (documentId.length > 0) {
      result.set(documentId, item);
    }
  }

  return result;
}

function indexDocumentsByType(
  documents: ReadonlyArray<UnknownRecord>,
): Map<string, UnknownRecord[]> {
  const result = new Map<string, UnknownRecord[]>();

  for (const document of documents) {
    const documentType = asString(document.document_type) ?? "";
    const group = result.get(documentType) ?? [];
    group.push(document);
    result.set(documentType, group);
  }

  return result;
}

function asArrayRecords(value: unknown): ReadonlyArray<UnknownRecord> {
  return asArray(value)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is UnknownRecord => entry != null);
}

function parseObjectText(rawText: string, label: string): UnknownRecord {
  const parsed = parseJsonText(rawText, label);
  const record = asRecord(parsed);

  if (record == null) {
    throw new CliInteractiveValidationError({
      message: `${label} must be a JSON object.`,
    });
  }

  return record;
}

function parseArrayText(rawText: string, label: string): ReadonlyArray<unknown> {
  const parsed = parseJsonText(rawText, label);

  if (!Array.isArray(parsed)) {
    throw new CliInteractiveValidationError({
      message: `${label} must be a JSON array.`,
    });
  }

  return parsed;
}

function parseJsonText(rawText: string, label: string): unknown {
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new CliInteractiveValidationError({
      message: `${label} contains invalid JSON.`,
    });
  }
}

function parseLooseValue(valueText: string): unknown {
  const trimmed = valueText.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (!looksLikeJsonLiteral(trimmed)) {
    return trimmed;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function looksLikeJsonLiteral(value: string): boolean {
  return (
    value.startsWith("{") ||
    value.startsWith("[") ||
    value.startsWith("\"") ||
    value === "true" ||
    value === "false" ||
    value === "null" ||
    /^-?\d/.test(value)
  );
}

function stringifyLooseValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value == null ||
    Array.isArray(value) ||
    typeof value === "object"
  ) {
    return JSON.stringify(value);
  }

  return "";
}

function moneyText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value}` : "";
}

function numberText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value}` : "";
}

function integerText(value: unknown): string {
  return typeof value === "number" && Number.isInteger(value) ? `${value}` : "";
}

function parseMoneyOrNull(value: string, label: string): number | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed)) {
    throw new CliInteractiveValidationError({
      message: `${label} must be a valid number.`,
    });
  }

  return parsed;
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

function parseIntegerOrNull(value: string, label: string): number | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed)) {
    throw new CliInteractiveValidationError({
      message: `${label} must be a whole number.`,
    });
  }

  return parsed;
}

function requiredIsoDate(value: string, label: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new CliInteractiveValidationError({
      message: `${label} is required.`,
    });
  }

  return trimmed;
}

function stringOrNull(value: string): string | null {
  return value.trim().length > 0 ? value.trim() : null;
}

function normalizedPersonId(value: string, fallback = taxpayerPersonId): string {
  return value.trim().length > 0 ? value.trim() : fallback;
}

function booleanOrNullFromTriState(
  value: "unset" | "reported" | "not_reported" | "secured",
): boolean | null {
  if (value === "reported" || value === "secured") {
    return true;
  }

  if (value === "not_reported") {
    return false;
  }

  return null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function csvFromArray(values: ReadonlyArray<unknown>): string {
  return values
    .map((value) => asString(value) ?? "")
    .filter((value) => value.length > 0)
    .join(", ");
}

function csvToList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function sumNamedAmounts(values: ReadonlyArray<UnknownRecord>): number | null {
  let total = 0;
  let found = false;

  for (const value of values) {
    if (typeof value.amount === "number" && Number.isFinite(value.amount)) {
      total += value.amount;
      found = true;
    }
  }

  return found ? total : null;
}

function categoryMoneyText(
  rows: ReadonlyArray<UnknownRecord>,
  incomeCategory: string,
): string {
  const row = rows.find((entry) => asString(entry.income_category) === incomeCategory);
  return moneyText(row?.amount);
}

function miscIncomeCategoryPairs(
  entry: Form1099MiscEditorDraft,
): ReadonlyArray<readonly [string, string]> {
  return [
    ["rents", entry.rents],
    ["royalties", entry.royalties],
    ["other_income", entry.otherIncome],
    ["fishing_boat_proceeds", entry.fishingBoatProceeds],
    ["medical_and_health_care_payments", entry.medicalAndHealthCarePayments],
    ["crop_insurance_proceeds", entry.cropInsuranceProceeds],
    ["gross_proceeds_paid_to_attorney", entry.grossProceedsPaidToAttorney],
    [
      "substitute_payments_in_lieu_of_dividends_or_interest",
      entry.substitutePaymentsInLieuOfDividendsOrInterest,
    ],
    ["section_409a_deferrals", entry.section409aDeferrals],
    ["nonqualified_deferred_compensation", entry.nonqualifiedDeferredCompensation],
  ] as const;
}

function inferRecipientPersonId(
  document: UnknownRecord | undefined,
  policy: UnknownRecord | undefined,
): string {
  const recipientIds = document == null ? [] : readRecipientPersonIds(document);

  if (recipientIds.length > 0) {
    return recipientIds[0] ?? taxpayerPersonId;
  }

  const coveredPersonIds = asArray(policy?.covered_person_ids)
    .map((value) => asString(value) ?? "")
    .filter((value) => value.length > 0);

  return coveredPersonIds[0] ?? taxpayerPersonId;
}

function readRecipientPersonIds(document: UnknownRecord): ReadonlyArray<string> {
  const personIds = asArray(document.recipient_person_ids)
    .map((value) => asString(value) ?? "")
    .filter((value) => value.length > 0);

  return personIds.length > 0 ? personIds : [taxpayerPersonId];
}

function serializePostalAddress(address: {
  readonly line1: string;
  readonly city: string;
  readonly stateCode: string;
  readonly postalCode: string;
  readonly countryCode: string;
}): UnknownRecord | null {
  if (
    address.line1.trim().length === 0 &&
    address.city.trim().length === 0 &&
    address.postalCode.trim().length === 0
  ) {
    return null;
  }

  return {
    line1: address.line1.trim(),
    city: address.city.trim(),
    state_code: stringOrNull(address.stateCode),
    postal_code: address.postalCode.trim(),
    country_code: address.countryCode.trim().length > 0 ? address.countryCode.trim() : "US",
  };
}

function serializeMarketplaceMonthlyRow(
  row: MarketplaceMonthlyRowEditorDraft,
): UnknownRecord {
  return {
    ...row.__raw,
    month: row.month.trim(),
    enrollment_premium: parseMoneyOrNull(row.enrollmentPremium, "1095-A enrollment premium"),
    second_lowest_cost_silver_plan_premium: parseMoneyOrNull(
      row.secondLowestCostSilverPlanPremium,
      "1095-A SLCSP premium",
    ),
    advance_payment_of_premium_tax_credit: parseMoneyOrNull(
      row.advancePaymentOfPremiumTaxCredit,
      "1095-A advance premium tax credit",
    ),
  };
}

function readSecuredDebtUsedForHome(
  fact: UnknownRecord | undefined,
): "unset" | "secured" | "not_secured" {
  if (fact?.secured_debt_used_for_home === true) {
    return "secured";
  }

  if (fact?.secured_debt_used_for_home === false) {
    return "not_secured";
  }

  return "unset";
}

function serializeNameFromPerson(
  person: PersonDirectoryEntry | null,
  fallback: UnknownRecord | null,
): UnknownRecord {
  if (person == null) {
    return fallback ?? {
      first: "",
      last: "",
      full_legal_name: "",
    };
  }

  return {
    first: person.firstName,
    last: person.lastName,
    full_legal_name: person.fullLegalName,
  };
}

function serializeHouseholdMember(person: PersonDirectoryEntry | null): UnknownRecord {
  return {
    name: serializeNameFromPerson(person, null),
    taxpayer_or_dependent: person?.personId === taxpayerPersonId ? "taxpayer" : "dependent",
  };
}

function findPersonEntry(
  directory: ReadonlyArray<PersonDirectoryEntry>,
  personId: string,
): PersonDirectoryEntry | null {
  return directory.find((entry) => entry.personId === normalizedPersonId(personId)) ?? null;
}

function createManualSourceFile(
  documentId: string,
  documentType: string,
  writtenAt: string,
): UnknownRecord {
  return {
    file_name: `${documentType.toLowerCase()}-${documentId}.json`,
    mime_type: "application/json",
    storage_uri: `manual://${documentId}`,
    uploaded_at: writtenAt,
    capture_method: "manual_entry",
  };
}

function stableId(existingId: string, prefix: string, index: number): string {
  return existingId.trim().length > 0 ? existingId.trim() : `${prefix}_${index + 1}`;
}

function has1099BContent(entry: Form1099BEditorDraft): boolean {
  return (
    entry.payerName.trim().length > 0 ||
    entry.transactions.some((transaction) => hasBrokerTransactionContent(transaction))
  );
}

function hasBrokerTransactionContent(transaction: BrokerTransactionEditorDraft): boolean {
  return (
    transaction.assetDescription.trim().length > 0 ||
    transaction.dateSold.trim().length > 0 ||
    transaction.proceeds.trim().length > 0
  );
}

function has1099GContent(entry: Form1099GEditorDraft): boolean {
  return (
    entry.payerName.trim().length > 0 ||
    entry.unemploymentCompensation.trim().length > 0 ||
    entry.federalIncomeTaxWithheld.trim().length > 0
  );
}

function hasSsa1099Content(entry: Ssa1099EditorDraft): boolean {
  return (
    entry.benefitsPaid.trim().length > 0 ||
    entry.benefitsRepaid.trim().length > 0 ||
    entry.netBenefits.trim().length > 0
  );
}

function has1098Content(entry: Form1098EditorDraft): boolean {
  return (
    entry.lenderName.trim().length > 0 ||
    entry.mortgageInterestReceived.trim().length > 0 ||
    entry.pointsPaid.trim().length > 0
  );
}

function has1098EContent(entry: Form1098EEditorDraft): boolean {
  return (
    entry.lenderName.trim().length > 0 ||
    entry.studentLoanInterestReceivedByLender.trim().length > 0
  );
}

function has1098TContent(entry: Form1098TEditorDraft): boolean {
  return (
    entry.filerName.trim().length > 0 ||
    entry.studentPersonId.trim().length > 0 ||
    entry.qualifiedExpensesPaid.trim().length > 0
  );
}

function has1095AContent(entry: Form1095AEditorDraft): boolean {
  return (
    entry.marketplaceIdentifier.trim().length > 0 ||
    entry.policyNumber.trim().length > 0 ||
    entry.monthlyRows.some((row) => has1095AMonthlyRowContent(row))
  );
}

function has1095AMonthlyRowContent(row: MarketplaceMonthlyRowEditorDraft): boolean {
  return (
    row.enrollmentPremium.trim().length > 0 ||
    row.secondLowestCostSilverPlanPremium.trim().length > 0 ||
    row.advancePaymentOfPremiumTaxCredit.trim().length > 0
  );
}

function has1099NecContent(entry: Form1099NecEditorDraft): boolean {
  return entry.payerName.trim().length > 0 || entry.amount.trim().length > 0;
}

function has1099MiscContent(entry: Form1099MiscEditorDraft): boolean {
  return (
    entry.payerName.trim().length > 0 ||
    miscIncomeCategoryPairs(entry).some(([, value]) => value.trim().length > 0)
  );
}
