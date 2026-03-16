import { Schema } from "effect";

import {
  BlueprintTaxYearSchema,
  CanonicalReturnLifecycleSchema,
  RequestedJurisdictionsSchema,
  StateReturnKindSchema,
  StateStartingPointStrategySchema,
} from "../blueprint";

const CoreEngineWageInputSchema = Schema.Struct({
  person_id: Schema.optional(Schema.String),
  source_document_id: Schema.String,
  wages_tips_other_compensation: Schema.Number,
  federal_income_tax_withheld: Schema.optional(Schema.NullOr(Schema.Number)),
  social_security_wages: Schema.optional(Schema.NullOr(Schema.Number)),
  social_security_tax_withheld: Schema.optional(Schema.NullOr(Schema.Number)),
  medicare_wages_and_tips: Schema.optional(Schema.NullOr(Schema.Number)),
  medicare_tax_withheld: Schema.optional(Schema.NullOr(Schema.Number)),
});
type CoreEngineWageInput = Schema.Schema.Type<typeof CoreEngineWageInputSchema>;

const CoreEngineTaxableInterestInputSchema = Schema.Struct({
  source_document_id: Schema.String,
  interest_income: Schema.Number,
  federal_income_tax_withheld: Schema.optional(Schema.NullOr(Schema.Number)),
  tax_exempt_interest: Schema.optional(Schema.NullOr(Schema.Number)),
});
type CoreEngineTaxableInterestInput = Schema.Schema.Type<
  typeof CoreEngineTaxableInterestInputSchema
>;

const CoreEngineDividendInputSchema = Schema.Struct({
  source_document_id: Schema.String,
  ordinary_dividends: Schema.optional(Schema.NullOr(Schema.Number)),
  qualified_dividends: Schema.optional(Schema.NullOr(Schema.Number)),
  capital_gain_distributions: Schema.optional(Schema.NullOr(Schema.Number)),
  exempt_interest_dividends: Schema.optional(Schema.NullOr(Schema.Number)),
  federal_income_tax_withheld: Schema.optional(Schema.NullOr(Schema.Number)),
});
type CoreEngineDividendInput = Schema.Schema.Type<typeof CoreEngineDividendInputSchema>;

const CoreEngineSourceDocumentSchema = Schema.Unknown;

const CoreEngineCapitalTransactionInputSchema = Schema.Struct({
  source_document_id: Schema.String,
  date_acquired: Schema.optional(Schema.String),
  date_sold: Schema.optional(Schema.String),
  proceeds: Schema.Number,
  cost_basis: Schema.optional(Schema.NullOr(Schema.Number)),
  adjustments: Schema.optional(Schema.NullOr(Schema.Number)),
  gain_or_loss: Schema.optional(Schema.NullOr(Schema.Number)),
  term: Schema.optional(Schema.Literal("short", "long", "unknown")),
});
type CoreEngineCapitalTransactionInput = Schema.Schema.Type<
  typeof CoreEngineCapitalTransactionInputSchema
>;

const CoreEngineRetirementDistributionInputSchema = Schema.Struct({
  source_document_id: Schema.String,
  gross_distribution: Schema.optional(Schema.NullOr(Schema.Number)),
  taxable_amount: Schema.optional(Schema.NullOr(Schema.Number)),
  federal_income_tax_withheld: Schema.optional(Schema.NullOr(Schema.Number)),
  distribution_codes: Schema.Array(Schema.String),
  ira_sep_simple: Schema.Boolean,
});
type CoreEngineRetirementDistributionInput = Schema.Schema.Type<
  typeof CoreEngineRetirementDistributionInputSchema
>;

const CoreEngineUnemploymentCompensationInputSchema = Schema.Struct({
  source_document_id: Schema.String,
  unemployment_compensation: Schema.optional(Schema.NullOr(Schema.Number)),
  federal_income_tax_withheld: Schema.optional(Schema.NullOr(Schema.Number)),
});
type CoreEngineUnemploymentCompensationInput = Schema.Schema.Type<
  typeof CoreEngineUnemploymentCompensationInputSchema
>;

const CoreEngineSocialSecurityBenefitInputSchema = Schema.Struct({
  source_document_id: Schema.String,
  benefits_paid: Schema.optional(Schema.NullOr(Schema.Number)),
  benefits_repaid: Schema.optional(Schema.NullOr(Schema.Number)),
  net_benefits: Schema.optional(Schema.NullOr(Schema.Number)),
});
type CoreEngineSocialSecurityBenefitInput = Schema.Schema.Type<
  typeof CoreEngineSocialSecurityBenefitInputSchema
>;

const CoreEngineNonemployeeCompensationInputSchema = Schema.Struct({
  person_id: Schema.String,
  source_document_id: Schema.String,
  amount: Schema.optional(Schema.NullOr(Schema.Number)),
  federal_income_tax_withheld: Schema.optional(Schema.NullOr(Schema.Number)),
  linked_business_id: Schema.optional(Schema.String),
});
type CoreEngineNonemployeeCompensationInput = Schema.Schema.Type<
  typeof CoreEngineNonemployeeCompensationInputSchema
>;

const CoreEngineMisc1099IncomeCategorySchema = Schema.Literal(
  "rents",
  "royalties",
  "other_income",
  "attorney_fees",
  "crop_insurance",
  "medical_payments",
  "substitute_payments",
  "payment_settlement",
  "wagering",
  "other",
);
type CoreEngineMisc1099IncomeCategory = Schema.Schema.Type<
  typeof CoreEngineMisc1099IncomeCategorySchema
>;

const CoreEngineMisc1099IncomeInputSchema = Schema.Struct({
  person_id: Schema.String,
  source_document_id: Schema.String,
  income_category: CoreEngineMisc1099IncomeCategorySchema,
  amount: Schema.optional(Schema.NullOr(Schema.Number)),
  federal_income_tax_withheld: Schema.optional(Schema.NullOr(Schema.Number)),
});
type CoreEngineMisc1099IncomeInput = Schema.Schema.Type<typeof CoreEngineMisc1099IncomeInputSchema>;

const CoreEngineScheduleEActivityTypeSchema = Schema.Literal(
  "rental_real_estate",
  "royalty",
  "partnership_k1",
  "s_corp_k1",
  "estate_or_trust_k1",
  "farm_rental",
  "other",
);
type CoreEngineScheduleEActivityType = Schema.Schema.Type<
  typeof CoreEngineScheduleEActivityTypeSchema
>;

const CoreEngineBusinessExpenseSchema = Schema.Struct({
  amount: Schema.Number,
});

const CoreEngineScheduleCBusinessSchema = Schema.Struct({
  business_id: Schema.optional(Schema.String),
  owner_person_id: Schema.optional(Schema.String),
  gross_receipts_or_sales: Schema.optional(Schema.NullOr(Schema.Number)),
  returns_and_allowances: Schema.optional(Schema.NullOr(Schema.Number)),
  cost_of_goods_sold: Schema.optional(Schema.NullOr(Schema.Number)),
  other_business_income: Schema.optional(Schema.NullOr(Schema.Number)),
  expenses: Schema.Array(CoreEngineBusinessExpenseSchema),
  home_office_deduction: Schema.optional(Schema.NullOr(Schema.Number)),
});
type CoreEngineScheduleCBusiness = Schema.Schema.Type<typeof CoreEngineScheduleCBusinessSchema>;

const CoreEngineOtherIncomeItemSchema = Schema.Struct({
  description: Schema.String,
  amount: Schema.Number,
});
type CoreEngineOtherIncomeItem = Schema.Schema.Type<typeof CoreEngineOtherIncomeItemSchema>;

const CoreEngineNamedAmountSchema = Schema.Struct({
  description: Schema.String,
  amount: Schema.Number,
});
type CoreEngineNamedAmount = Schema.Schema.Type<typeof CoreEngineNamedAmountSchema>;

const CoreEngineScheduleEActivitySchema = Schema.Struct({
  activity_id: Schema.optional(Schema.String),
  owner_person_id: Schema.String,
  activity_type: CoreEngineScheduleEActivityTypeSchema,
  entity_name: Schema.String,
  materially_participates: Schema.optional(Schema.NullOr(Schema.Boolean)),
  income_items: Schema.Array(CoreEngineNamedAmountSchema),
  expense_items: Schema.Array(CoreEngineNamedAmountSchema),
  source_document_ids: Schema.Array(Schema.String),
});
type CoreEngineScheduleEActivity = Schema.Schema.Type<typeof CoreEngineScheduleEActivitySchema>;

const CoreEngineScheduleELimitationOverrideSchema = Schema.Struct({
  activity_id: Schema.optional(Schema.String),
  entity_name: Schema.optional(Schema.String),
  allowed_net_after_limitations: Schema.optional(Schema.NullOr(Schema.Number)),
  prior_year_passive_loss_carryforward_used: Schema.optional(Schema.NullOr(Schema.Number)),
  passive_loss_disallowed: Schema.optional(Schema.NullOr(Schema.Number)),
  at_risk_loss_disallowed: Schema.optional(Schema.NullOr(Schema.Number)),
  basis_loss_disallowed: Schema.optional(Schema.NullOr(Schema.Number)),
});
type CoreEngineScheduleELimitationOverride = Schema.Schema.Type<
  typeof CoreEngineScheduleELimitationOverrideSchema
>;

const CoreEngineFederalSocialSecurityExtensionSchema = Schema.Struct({
  allow_married_filing_separately_lived_apart_exception: Schema.optional(Schema.Boolean),
});
type CoreEngineFederalSocialSecurityExtension = Schema.Schema.Type<
  typeof CoreEngineFederalSocialSecurityExtensionSchema
>;

const CoreEngineFederalScheduleEExtensionSchema = Schema.Struct({
  allow_reported_net_losses_without_limitation_overrides: Schema.optional(Schema.Boolean),
  limitation_overrides: Schema.Array(CoreEngineScheduleELimitationOverrideSchema),
});
type CoreEngineFederalScheduleEExtension = Schema.Schema.Type<
  typeof CoreEngineFederalScheduleEExtensionSchema
>;

const CoreEngineFederalForm2441ExtensionSchema = Schema.Struct({
  allow_married_filing_separately_lived_apart_exception: Schema.optional(Schema.Boolean),
});
type CoreEngineFederalForm2441Extension = Schema.Schema.Type<
  typeof CoreEngineFederalForm2441ExtensionSchema
>;

const CoreEngineCapitalTransactionTermOverrideSchema = Schema.Struct({
  source_document_id: Schema.String,
  proceeds: Schema.Number,
  term: Schema.Literal("short", "long"),
  date_sold: Schema.optional(Schema.String),
  date_acquired: Schema.optional(Schema.String),
});
type CoreEngineCapitalTransactionTermOverride = Schema.Schema.Type<
  typeof CoreEngineCapitalTransactionTermOverrideSchema
>;

const CoreEngineFederalScheduleDExtensionSchema = Schema.Struct({
  prior_year_short_term_capital_loss_carryforward: Schema.optional(Schema.NullOr(Schema.Number)),
  prior_year_long_term_capital_loss_carryforward: Schema.optional(Schema.NullOr(Schema.Number)),
  section1202_exclusion_amount: Schema.optional(Schema.NullOr(Schema.Number)),
  transaction_term_overrides: Schema.optional(
    Schema.Array(CoreEngineCapitalTransactionTermOverrideSchema),
  ),
});
type CoreEngineFederalScheduleDExtension = Schema.Schema.Type<
  typeof CoreEngineFederalScheduleDExtensionSchema
>;

const CoreEngineFederalMisc1099OverrideSchema = Schema.Struct({
  source_document_id: Schema.String,
  treatment: Schema.Literal("schedule1_line8z", "ignore_non_taxable", "schedule_e_activity"),
  activity_id: Schema.optional(Schema.String),
  activity_entity_name: Schema.optional(Schema.String),
});
type CoreEngineFederalMisc1099Override = Schema.Schema.Type<
  typeof CoreEngineFederalMisc1099OverrideSchema
>;

const CoreEngineFederalMisc1099ExtensionSchema = Schema.Struct({
  overrides: Schema.Array(CoreEngineFederalMisc1099OverrideSchema),
});
type CoreEngineFederalMisc1099Extension = Schema.Schema.Type<
  typeof CoreEngineFederalMisc1099ExtensionSchema
>;

const CoreEngineFederalForm8962ExtensionSchema = Schema.Struct({
  allow_household_income_below_fpl_exception: Schema.optional(Schema.Boolean),
  allow_married_filing_separately_exception: Schema.optional(Schema.Boolean),
});
type CoreEngineFederalForm8962Extension = Schema.Schema.Type<
  typeof CoreEngineFederalForm8962ExtensionSchema
>;

const CoreEngineFederalEicExtensionSchema = Schema.Struct({
  allow_married_filing_separately_separated_spouse_rules: Schema.optional(Schema.Boolean),
});
type CoreEngineFederalEicExtension = Schema.Schema.Type<typeof CoreEngineFederalEicExtensionSchema>;

const CoreEngineFederalForm8812ExtensionSchema = Schema.Struct({
  credit_limit_worksheet_b_line10_schedule3_line11: Schema.optional(Schema.NullOr(Schema.Number)),
  credit_limit_worksheet_b_line15_additional_credits: Schema.optional(Schema.NullOr(Schema.Number)),
  earned_income_override: Schema.optional(Schema.NullOr(Schema.Number)),
  line27a_eic_override: Schema.optional(Schema.NullOr(Schema.Number)),
});
type CoreEngineFederalForm8812Extension = Schema.Schema.Type<
  typeof CoreEngineFederalForm8812ExtensionSchema
>;

const CoreEngineFederalExtensionSchema = Schema.Struct({
  eic: Schema.optional(CoreEngineFederalEicExtensionSchema),
  form2441: Schema.optional(CoreEngineFederalForm2441ExtensionSchema),
  form8812: Schema.optional(CoreEngineFederalForm8812ExtensionSchema),
  form8962: Schema.optional(CoreEngineFederalForm8962ExtensionSchema),
  misc_1099: Schema.optional(CoreEngineFederalMisc1099ExtensionSchema),
  schedule_e: Schema.optional(CoreEngineFederalScheduleEExtensionSchema),
  schedule_d: Schema.optional(CoreEngineFederalScheduleDExtensionSchema),
  social_security: Schema.optional(CoreEngineFederalSocialSecurityExtensionSchema),
});
type CoreEngineFederalExtension = Schema.Schema.Type<typeof CoreEngineFederalExtensionSchema>;

const CoreEngineMortgageInterestItemSchema = Schema.Struct({
  source_document_id: Schema.String,
  mortgage_interest_received: Schema.optional(Schema.NullOr(Schema.Number)),
  points_paid: Schema.optional(Schema.NullOr(Schema.Number)),
  mortgage_insurance_premiums: Schema.optional(Schema.NullOr(Schema.Number)),
  real_estate_taxes_paid: Schema.optional(Schema.NullOr(Schema.Number)),
});

const CoreEngineCareExpenseSchema = Schema.Struct({
  person_id: Schema.String,
  amount: Schema.Number,
});
type CoreEngineCareExpense = Schema.Schema.Type<typeof CoreEngineCareExpenseSchema>;

const CoreEngineEducationStudentSchema = Schema.Struct({
  student_person_id: Schema.String,
  qualified_expenses_paid: Schema.optional(Schema.NullOr(Schema.Number)),
  tax_free_assistance: Schema.optional(Schema.NullOr(Schema.Number)),
  is_aotc_candidate: Schema.Boolean,
  is_llc_candidate: Schema.Boolean,
});
type CoreEngineEducationStudent = Schema.Schema.Type<typeof CoreEngineEducationStudentSchema>;

const CoreEngineMarketplaceRowSchema = Schema.Struct({
  advance_payment_of_premium_tax_credit: Schema.optional(Schema.NullOr(Schema.Number)),
  enrollment_premium: Schema.optional(Schema.NullOr(Schema.Number)),
  second_lowest_cost_silver_plan_premium: Schema.optional(Schema.NullOr(Schema.Number)),
});

const CoreEngineMarketplacePolicySchema = Schema.Struct({
  monthly_rows: Schema.Array(CoreEngineMarketplaceRowSchema),
});
type CoreEngineMarketplacePolicy = Schema.Schema.Type<typeof CoreEngineMarketplacePolicySchema>;

const CoreEngineWithholdingInputSchema = Schema.Struct({
  jurisdiction: Schema.String,
  state_code: Schema.NullOr(Schema.String),
  amount: Schema.Number,
  description: Schema.String,
});

const CoreEnginePreparedStateSummarySchema = Schema.Struct({
  state_code: Schema.String,
  adjusted_gross_income_or_starting_point: Schema.Number,
  taxable_income: Schema.Number,
  total_tax: Schema.Number,
  total_payments: Schema.Number,
  refund_amount: Schema.Number,
  amount_owed: Schema.Number,
});

const CoreEngineStatePaymentSchema = Schema.Struct({
  description: Schema.optional(Schema.String),
  amount: Schema.Number,
});

const CoreEngineResidencyPeriodSchema = Schema.Struct({
  state_code: Schema.String,
  residency_type: Schema.String,
  taxpayer_or_spouse: Schema.String,
  start_date: Schema.String,
  end_date: Schema.String,
});

const CoreEngineStateLocalReturnSchema = Schema.Struct({
  jurisdiction_code: Schema.String,
  jurisdiction_name: Schema.String,
  resident_status: Schema.String,
  additions: Schema.Array(CoreEngineNamedAmountSchema),
  subtractions: Schema.Array(CoreEngineNamedAmountSchema),
  credits: Schema.Array(CoreEngineNamedAmountSchema),
  payments: Schema.Array(CoreEngineStatePaymentSchema),
  plugin_fact_bag: Schema.Record({
    key: Schema.String,
    value: Schema.Unknown,
    }),
});

const CoreEngineStateAllocationProfileSchema = Schema.Struct({
  everywhere_income: Schema.optional(Schema.NullOr(Schema.Number)),
  resident_period_income: Schema.optional(Schema.NullOr(Schema.Number)),
  nonresident_source_income: Schema.optional(Schema.NullOr(Schema.Number)),
  state_source_income: Schema.optional(Schema.NullOr(Schema.Number)),
  apportionment_ratio: Schema.optional(Schema.NullOr(Schema.Number)),
  source_income_ratio: Schema.optional(Schema.NullOr(Schema.Number)),
  allocation_method: Schema.optional(Schema.NullOr(Schema.String)),
});

const CoreEngineStateResidencyDeterminationSchema = Schema.Struct({
  resolved_return_kind: StateReturnKindSchema,
  determination_method: Schema.optional(Schema.NullOr(Schema.String)),
  domicile_state_code: Schema.optional(Schema.NullOr(Schema.String)),
  statutory_resident: Schema.optional(Schema.NullOr(Schema.Boolean)),
  days_in_state: Schema.optional(Schema.NullOr(Schema.Number)),
  days_everywhere: Schema.optional(Schema.NullOr(Schema.Number)),
});

const CoreEngineStateLocalReturnRefSchema = Schema.Struct({
  jurisdiction_code: Schema.String,
  resident_status: Schema.optional(Schema.String),
});

const CoreEngineStateReturnSchema = Schema.Struct({
  state_code: Schema.String,
  enabled: Schema.Boolean,
  return_kind: StateReturnKindSchema,
  state_filing_status: Schema.optional(Schema.String),
  starting_point_strategy: StateStartingPointStrategySchema,
  federal_reference_pointer: Schema.optional(Schema.NullOr(Schema.String)),
  residency_periods: Schema.Array(CoreEngineResidencyPeriodSchema),
  additions: Schema.Array(CoreEngineNamedAmountSchema),
  subtractions: Schema.Array(CoreEngineNamedAmountSchema),
  state_specific_income_items: Schema.Array(CoreEngineNamedAmountSchema),
  state_specific_deductions: Schema.Array(CoreEngineNamedAmountSchema),
  state_specific_credits: Schema.Array(CoreEngineNamedAmountSchema),
  local_returns: Schema.Array(CoreEngineStateLocalReturnSchema),
  local_return_refs: Schema.optional(Schema.Array(CoreEngineStateLocalReturnRefSchema)),
  allocation_profile: Schema.optional(CoreEngineStateAllocationProfileSchema),
  residency_determination: Schema.optional(CoreEngineStateResidencyDeterminationSchema),
  plugin_manifest_id: Schema.String,
  state_payments: Schema.Array(CoreEngineStatePaymentSchema),
  plugin_fact_bag: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Unknown,
    }),
  ),
  prepared_summary: Schema.optional(CoreEnginePreparedStateSummarySchema),
});
type CoreEngineStateReturn = Schema.Schema.Type<typeof CoreEngineStateReturnSchema>;

const CoreEngineEstimatedPaymentSchema = Schema.Struct({
  jurisdiction: Schema.String,
  state_code: Schema.optional(Schema.NullOr(Schema.String)),
  amount: Schema.Number,
});

const CoreEngineExtensionPaymentSchema = Schema.Struct({
  jurisdiction: Schema.String,
  state_code: Schema.optional(Schema.NullOr(Schema.String)),
  amount: Schema.Number,
});

const CoreEngineResidencyAndNexusSchema = Schema.Struct({
  primary_home_address: Schema.NullOr(
    Schema.Struct({
      state_code: Schema.String,
    }),
  ),
});

const CoreEngineStateResidencyRoleSchema = Schema.Literal("taxpayer", "spouse", "dependent");
const CoreEngineStateResidencyFactPeriodKindSchema = Schema.Literal(
  "resident",
  "part_year_resident",
  "nonresident",
  "domicile",
  "statutory_resident",
  "local_resident",
);
const CoreEngineStateResidencyFactSchema = Schema.Struct({
  state_code: Schema.String,
  person_id: Schema.String,
  return_role: CoreEngineStateResidencyRoleSchema,
  period_kind: CoreEngineStateResidencyFactPeriodKindSchema,
  start_date: Schema.optional(Schema.NullOr(Schema.String)),
  end_date: Schema.optional(Schema.NullOr(Schema.String)),
  days_in_state: Schema.optional(Schema.NullOr(Schema.Number)),
  domicile_state_code: Schema.optional(Schema.NullOr(Schema.String)),
  maintained_abode: Schema.optional(Schema.NullOr(Schema.Boolean)),
  statutory_resident: Schema.optional(Schema.NullOr(Schema.Boolean)),
  military_status: Schema.optional(Schema.NullOr(Schema.String)),
  locality_code: Schema.optional(Schema.NullOr(Schema.String)),
});

const CoreEngineStateSourcedIncomeClassSchema = Schema.Literal(
  "wages",
  "business",
  "rental",
  "interest",
  "dividends",
  "capital_gain",
  "retirement",
  "unemployment",
  "pass_through",
  "other",
);
const CoreEngineStateIncomeAllocationMethodSchema = Schema.Literal(
  "reported",
  "ratio",
  "workdays",
  "days_in_state",
  "property_location",
  "entity_apportionment",
  "manual_override",
);
const CoreEngineStateIncomeSourcingFactSchema = Schema.Struct({
  state_code: Schema.String,
  income_class: CoreEngineStateSourcedIncomeClassSchema,
  allocation_method: CoreEngineStateIncomeAllocationMethodSchema,
  person_id: Schema.optional(Schema.NullOr(Schema.String)),
  source_document_id: Schema.optional(Schema.NullOr(Schema.String)),
  total_amount: Schema.Number,
  state_source_amount: Schema.optional(Schema.NullOr(Schema.Number)),
  resident_period_amount: Schema.optional(Schema.NullOr(Schema.Number)),
  nonresident_period_amount: Schema.optional(Schema.NullOr(Schema.Number)),
  work_state_code: Schema.optional(Schema.NullOr(Schema.String)),
  locality_code: Schema.optional(Schema.NullOr(Schema.String)),
  duty_days_in_state: Schema.optional(Schema.NullOr(Schema.Number)),
  duty_days_everywhere: Schema.optional(Schema.NullOr(Schema.Number)),
  entity_name: Schema.optional(Schema.NullOr(Schema.String)),
});

const CoreEngineStateTaxTypeSchema = Schema.Literal(
  "withholding",
  "estimated_payment",
  "extension_payment",
  "local_withholding",
  "composite_payment",
);
const CoreEngineStateWithholdingFactSchema = Schema.Struct({
  jurisdiction_level: Schema.Literal("state", "local"),
  state_code: Schema.String,
  tax_type: CoreEngineStateTaxTypeSchema,
  amount: Schema.Number,
  person_id: Schema.optional(Schema.NullOr(Schema.String)),
  local_jurisdiction_code: Schema.optional(Schema.NullOr(Schema.String)),
  source_document_id: Schema.optional(Schema.NullOr(Schema.String)),
  payer_state_code: Schema.optional(Schema.NullOr(Schema.String)),
  work_state_code: Schema.optional(Schema.NullOr(Schema.String)),
});

const CoreEngineOtherStateTaxCreditClaimSchema = Schema.Struct({
  resident_state_code: Schema.String,
  source_state_code: Schema.String,
  category: Schema.String,
  income_amount: Schema.Number,
  tax_paid: Schema.Number,
  creditable_tax: Schema.optional(Schema.NullOr(Schema.Number)),
});

const CoreEngineLocalJurisdictionTypeSchema = Schema.Literal(
  "city",
  "county",
  "school_district",
  "transit",
  "other",
);
const CoreEngineStateLocalJurisdictionFactSchema = Schema.Struct({
  state_code: Schema.String,
  jurisdiction_code: Schema.String,
  jurisdiction_name: Schema.String,
  jurisdiction_type: CoreEngineLocalJurisdictionTypeSchema,
  resident_status: Schema.optional(Schema.NullOr(Schema.String)),
  local_source_wages: Schema.optional(Schema.NullOr(Schema.Number)),
  local_source_other_income: Schema.optional(Schema.NullOr(Schema.Number)),
  withholding_total: Schema.optional(Schema.NullOr(Schema.Number)),
  estimated_payments_total: Schema.optional(Schema.NullOr(Schema.Number)),
  credits_total: Schema.optional(Schema.NullOr(Schema.Number)),
  residency_start_date: Schema.optional(Schema.NullOr(Schema.String)),
  residency_end_date: Schema.optional(Schema.NullOr(Schema.String)),
});
type CoreEngineStateLocalJurisdictionFact = Schema.Schema.Type<
  typeof CoreEngineStateLocalJurisdictionFactSchema
>;

const CoreEngineStateManualOverrideTypeSchema = Schema.Literal(
  "worksheet_value",
  "allocation_ratio",
  "taxable_income",
  "credit_amount",
  "local_tax_amount",
  "withholding_allocation",
);
const CoreEngineStateManualOverrideSchema = Schema.Struct({
  state_code: Schema.String,
  override_type: CoreEngineStateManualOverrideTypeSchema,
  target: Schema.String,
  amount: Schema.Number,
  notes: Schema.optional(Schema.NullOr(Schema.String)),
});

const CoreEngineStateFactsSchema = Schema.Struct({
  residency: Schema.Array(CoreEngineStateResidencyFactSchema),
  income_sourcing: Schema.Array(CoreEngineStateIncomeSourcingFactSchema),
  withholding: Schema.Array(CoreEngineStateWithholdingFactSchema),
  other_state_tax_credit_claims: Schema.Array(CoreEngineOtherStateTaxCreditClaimSchema),
  local_jurisdictions: Schema.Array(CoreEngineStateLocalJurisdictionFactSchema),
  overrides: Schema.Array(CoreEngineStateManualOverrideSchema),
});

const CoreEngineElectionsSchema = Schema.Struct({
  capital_loss_carryforward_imported: Schema.optional(Schema.Boolean),
});

const CoreEngineInputSchema = Schema.Struct({
  return_id: Schema.String,
  tax_year: BlueprintTaxYearSchema,
  requested_jurisdictions: RequestedJurisdictionsSchema,
  lifecycle: CanonicalReturnLifecycleSchema,
  residency_and_nexus: CoreEngineResidencyAndNexusSchema,
  source_documents: Schema.Array(CoreEngineSourceDocumentSchema),
  elections: CoreEngineElectionsSchema,
  household: Schema.Struct({
    filing_status: Schema.String,
    taxpayer: Schema.Unknown,
    spouse: Schema.optional(Schema.Unknown),
    dependents: Schema.Array(Schema.Unknown),
    can_be_claimed_as_dependent: Schema.optional(Schema.Boolean),
  }),
  facts: Schema.Struct({
    income: Schema.Struct({
      wages: Schema.Array(CoreEngineWageInputSchema),
      taxable_interest: Schema.Array(CoreEngineTaxableInterestInputSchema),
      dividends: Schema.Array(CoreEngineDividendInputSchema),
      capital_transactions: Schema.Array(CoreEngineCapitalTransactionInputSchema),
      retirement_distributions: Schema.Array(CoreEngineRetirementDistributionInputSchema),
      unemployment_compensation: Schema.Array(CoreEngineUnemploymentCompensationInputSchema),
      social_security_benefits: Schema.Array(CoreEngineSocialSecurityBenefitInputSchema),
      nonemployee_compensation: Schema.Array(CoreEngineNonemployeeCompensationInputSchema),
      miscellaneous_1099_income: Schema.Array(CoreEngineMisc1099IncomeInputSchema),
      schedule_c_businesses: Schema.Array(CoreEngineScheduleCBusinessSchema),
      schedule_e_activities: Schema.Array(CoreEngineScheduleEActivitySchema),
      other_income_items: Schema.Array(CoreEngineOtherIncomeItemSchema),
    }),
    adjustments: Schema.Record({
      key: Schema.String,
      value: Schema.Unknown,
    }),
    state: Schema.optional(CoreEngineStateFactsSchema),
    itemized_deductions: Schema.Struct({
      medical_and_dental_expenses: Schema.optional(Schema.NullOr(Schema.Number)),
      state_and_local_income_or_sales_taxes: Schema.optional(Schema.NullOr(Schema.Number)),
      real_estate_taxes: Schema.optional(Schema.NullOr(Schema.Number)),
      personal_property_taxes: Schema.optional(Schema.NullOr(Schema.Number)),
      other_taxes: Schema.optional(Schema.NullOr(Schema.Number)),
      mortgage_interest_items: Schema.Array(CoreEngineMortgageInterestItemSchema),
      charitable_cash_contributions: Schema.optional(Schema.NullOr(Schema.Number)),
      charitable_noncash_contributions: Schema.optional(Schema.NullOr(Schema.Number)),
      casualty_and_theft_losses: Schema.optional(Schema.NullOr(Schema.Number)),
      other_itemized_deductions: Schema.Array(CoreEngineNamedAmountSchema),
    }),
    credits: Schema.Struct({
      candidate_child_tax_credit_dependent_ids: Schema.Array(Schema.String),
      candidate_credit_for_other_dependent_ids: Schema.Array(Schema.String),
      candidate_eitc_child_ids: Schema.optional(Schema.Array(Schema.String)),
      child_and_dependent_care: Schema.Struct({
        qualifying_person_ids: Schema.Array(Schema.String),
        providers: Schema.Array(Schema.Unknown),
        expenses: Schema.Array(CoreEngineCareExpenseSchema),
      }),
      education_credits: Schema.Struct({
        students: Schema.Array(CoreEngineEducationStudentSchema),
      }),
      premium_tax_credit: Schema.Struct({
        policies: Schema.Array(CoreEngineMarketplacePolicySchema),
      }),
      other_nonrefundable_credits: Schema.Array(CoreEngineNamedAmountSchema),
      other_refundable_credits: Schema.Array(CoreEngineNamedAmountSchema),
    }),
    payments: Schema.Struct({
      withholdings: Schema.Array(CoreEngineWithholdingInputSchema),
      estimated_payments: Schema.Array(CoreEngineEstimatedPaymentSchema),
      extension_payments: Schema.Array(CoreEngineExtensionPaymentSchema),
      prior_year_overpayment_applied_to_2025: Schema.optional(Schema.NullOr(Schema.Number)),
    }),
    health_coverage: Schema.Struct({
      marketplace_policies: Schema.Array(CoreEngineMarketplacePolicySchema),
      hsa_coverage_months: Schema.Array(Schema.Unknown),
    }),
    state_specific_fact_bag: Schema.optional(
      Schema.Record({
        key: Schema.String,
        value: Schema.Unknown,
      }),
    ),
  }),
  state_returns: Schema.Record({
    key: Schema.String,
    value: CoreEngineStateReturnSchema,
  }),
});
type CoreEngineInput = Schema.Schema.Type<typeof CoreEngineInputSchema>;

export {
  CoreEngineBusinessExpenseSchema,
  CoreEngineCapitalTransactionInputSchema,
  CoreEngineCareExpenseSchema,
  CoreEngineDividendInputSchema,
  CoreEngineElectionsSchema,
  CoreEngineEducationStudentSchema,
  CoreEngineEstimatedPaymentSchema,
  CoreEngineExtensionPaymentSchema,
  CoreEngineFederalEicExtensionSchema,
  CoreEngineFederalExtensionSchema,
  CoreEngineFederalForm2441ExtensionSchema,
  CoreEngineFederalForm8812ExtensionSchema,
  CoreEngineFederalForm8962ExtensionSchema,
  CoreEngineFederalMisc1099ExtensionSchema,
  CoreEngineFederalMisc1099OverrideSchema,
  CoreEngineFederalScheduleEExtensionSchema,
  CoreEngineFederalScheduleDExtensionSchema,
  CoreEngineFederalSocialSecurityExtensionSchema,
  CoreEngineInputSchema,
  CoreEngineMarketplacePolicySchema,
  CoreEngineMarketplaceRowSchema,
  CoreEngineCapitalTransactionTermOverrideSchema,
  CoreEngineMisc1099IncomeCategorySchema,
  CoreEngineMisc1099IncomeInputSchema,
  CoreEngineMortgageInterestItemSchema,
  CoreEngineNamedAmountSchema,
  CoreEngineNonemployeeCompensationInputSchema,
  CoreEngineOtherIncomeItemSchema,
  CoreEnginePreparedStateSummarySchema,
  CoreEngineResidencyAndNexusSchema,
  CoreEngineRetirementDistributionInputSchema,
  CoreEngineScheduleCBusinessSchema,
  CoreEngineScheduleEActivitySchema,
  CoreEngineScheduleEActivityTypeSchema,
  CoreEngineScheduleELimitationOverrideSchema,
  CoreEngineSocialSecurityBenefitInputSchema,
  CoreEngineSourceDocumentSchema,
  CoreEngineStatePaymentSchema,
  CoreEngineStateReturnSchema,
  CoreEngineTaxableInterestInputSchema,
  CoreEngineUnemploymentCompensationInputSchema,
  CoreEngineWageInputSchema,
  CoreEngineWithholdingInputSchema,
};

export type {
  CoreEngineCapitalTransactionInput,
  CoreEngineCapitalTransactionTermOverride,
  CoreEngineCareExpense,
  CoreEngineDividendInput,
  CoreEngineEducationStudent,
  CoreEngineFederalEicExtension,
  CoreEngineFederalExtension,
  CoreEngineFederalForm2441Extension,
  CoreEngineFederalForm8812Extension,
  CoreEngineFederalForm8962Extension,
  CoreEngineFederalMisc1099Extension,
  CoreEngineFederalMisc1099Override,
  CoreEngineFederalScheduleDExtension,
  CoreEngineFederalScheduleEExtension,
  CoreEngineFederalSocialSecurityExtension,
  CoreEngineInput,
  CoreEngineMarketplacePolicy,
  CoreEngineMisc1099IncomeCategory,
  CoreEngineMisc1099IncomeInput,
  CoreEngineNamedAmount,
  CoreEngineNonemployeeCompensationInput,
  CoreEngineOtherIncomeItem,
  CoreEngineRetirementDistributionInput,
  CoreEngineScheduleCBusiness,
  CoreEngineScheduleEActivity,
  CoreEngineScheduleEActivityType,
  CoreEngineScheduleELimitationOverride,
  CoreEngineSocialSecurityBenefitInput,
  CoreEngineStateLocalJurisdictionFact,
  CoreEngineStateReturn,
  CoreEngineTaxableInterestInput,
  CoreEngineUnemploymentCompensationInput,
  CoreEngineWageInput,
};
