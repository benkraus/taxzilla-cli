import { Data, Schema } from "effect";

import { BlueprintTaxYearSchema, FormsGraphSnapshotSchema } from "../blueprint";

export const CoreEngineDeductionStrategySchema = Schema.Literal("standard", "itemized");
export type CoreEngineDeductionStrategy = Schema.Schema.Type<
  typeof CoreEngineDeductionStrategySchema
>;

export const CoreEngineLine16TaxComputationMethodSchema = Schema.Literal(
  "ordinary_brackets",
  "qualified_dividends_and_capital_gain_worksheet",
  "schedule_d_tax_worksheet",
);
export type CoreEngineLine16TaxComputationMethod = Schema.Schema.Type<
  typeof CoreEngineLine16TaxComputationMethodSchema
>;

export const CoreEngineFederalSummarySchema = Schema.Struct({
  line1a_wages: Schema.Number,
  line2a_tax_exempt_interest: Schema.Number,
  line3a_qualified_dividends: Schema.Number,
  line2b_taxable_interest: Schema.Number,
  line3b_ordinary_dividends: Schema.Number,
  line4a_ira_distributions: Schema.Number,
  line4b_taxable_ira_distributions: Schema.Number,
  line5a_pensions_and_annuities: Schema.Number,
  line5b_taxable_pensions_and_annuities: Schema.Number,
  line6a_social_security_benefits: Schema.Number,
  line6b_taxable_social_security_benefits: Schema.Number,
  line7_capital_gain_or_loss: Schema.Number,
  line8_other_income: Schema.Number,
  line9_total_income: Schema.Number,
  line10_adjustments: Schema.Number,
  line11_adjusted_gross_income: Schema.Number,
  line12_deductions: Schema.Number,
  line15_taxable_income: Schema.Number,
  line16_regular_income_tax: Schema.Number,
  line19_child_tax_credit_or_credit_for_other_dependents: Schema.Number,
  line20_other_nonrefundable_credits: Schema.Number,
  line23_other_taxes: Schema.Number,
  line24_total_tax: Schema.Number,
  line25d_federal_withholding: Schema.Number,
  line26_estimated_and_extension_payments: Schema.Number,
  line27a_earned_income_credit: Schema.Number,
  line28_additional_child_tax_credit: Schema.Number,
  line29_refundable_education_credit: Schema.Number,
  line31_other_payments: Schema.Number,
  line33_total_payments: Schema.Number,
  line34_refund_amount: Schema.Number,
  line37_amount_owed: Schema.Number,
  standard_deduction: Schema.Number,
  itemized_deduction_total: Schema.Number,
  schedule1_additional_income_total: Schema.Number,
  schedule2_other_taxes_total: Schema.Number,
  schedule3_nonrefundable_credits_total: Schema.Number,
  schedule3_payments_total: Schema.Number,
  total_adjustments: Schema.Number,
  federal_withholding: Schema.Number,
  tax_exempt_interest_total: Schema.Number,
  unemployment_compensation_total: Schema.Number,
  self_employment_tax: Schema.Number,
  self_employment_tax_deduction: Schema.Number,
  additional_medicare_tax: Schema.Number,
  additional_medicare_tax_withheld: Schema.Number,
  net_investment_income: Schema.Number,
  net_investment_income_tax: Schema.Number,
  child_and_dependent_care_credit: Schema.Number,
  child_tax_credit_or_credit_for_other_dependents: Schema.Number,
  additional_child_tax_credit: Schema.Number,
  education_credit_nonrefundable: Schema.Number,
  education_credit_refundable: Schema.Number,
  capital_gain_distributions_total: Schema.Number,
  line16_tax_computation_method: CoreEngineLine16TaxComputationMethodSchema,
  net_premium_tax_credit: Schema.Number,
  excess_advance_premium_tax_credit_repayment: Schema.Number,
  schedule_d_collectibles_28_percent_gain_total: Schema.Number,
  schedule_d_unrecaptured_section_1250_gain_total: Schema.Number,
  deduction_strategy: CoreEngineDeductionStrategySchema,
  form_8959_activated: Schema.Boolean,
  form_8960_activated: Schema.Boolean,
  schedule_a_activated: Schema.Boolean,
  schedule_1_activated: Schema.Boolean,
  schedule_2_activated: Schema.Boolean,
  schedule_b_activated: Schema.Boolean,
  schedule_3_activated: Schema.Boolean,
  schedule_c_activated: Schema.Boolean,
  schedule_d_activated: Schema.Boolean,
  schedule_e_activated: Schema.Boolean,
  schedule_e_activity_net_total: Schema.Number,
  schedule_e_investment_income_total: Schema.Number,
  schedule_se_activated: Schema.Boolean,
});
export type CoreEngineFederalSummary = Schema.Schema.Type<typeof CoreEngineFederalSummarySchema>;

export const CoreEngineStateSummarySchema = Schema.Struct({
  state_code: Schema.String,
  plugin_manifest_id: Schema.String,
  return_kind: Schema.optional(Schema.String),
  starting_point_strategy: Schema.optional(Schema.String),
  adjusted_gross_income_or_starting_point: Schema.Number,
  taxable_income: Schema.NullOr(Schema.Number),
  resident_taxable_income: Schema.optional(Schema.NullOr(Schema.Number)),
  nonresident_source_income: Schema.optional(Schema.NullOr(Schema.Number)),
  allocation_ratio: Schema.optional(Schema.NullOr(Schema.Number)),
  total_tax: Schema.Number,
  local_total_tax: Schema.optional(Schema.NullOr(Schema.Number)),
  other_state_credit_total: Schema.optional(Schema.NullOr(Schema.Number)),
  total_payments: Schema.Number,
  refund_amount: Schema.Number,
  amount_owed: Schema.Number,
  manual_review_flags: Schema.optional(Schema.Array(Schema.String)),
});
export type CoreEngineStateSummary = Schema.Schema.Type<typeof CoreEngineStateSummarySchema>;

export const CoreEngineResultSchema = Schema.Struct({
  return_id: Schema.String,
  tax_year: BlueprintTaxYearSchema,
  activated_module_ids: Schema.Array(Schema.String),
  graph: FormsGraphSnapshotSchema,
  federal_summary: CoreEngineFederalSummarySchema,
  state_summaries: Schema.Array(CoreEngineStateSummarySchema),
});
export type CoreEngineResult = Schema.Schema.Type<typeof CoreEngineResultSchema>;

export class InvalidCanonicalReturnError extends Data.TaggedError("InvalidCanonicalReturnError")<{
  readonly parseError: unknown;
}> {}

export class InvalidCoreEngineInputError extends Data.TaggedError("InvalidCoreEngineInputError")<{
  readonly parseError: unknown;
}> {}

export class MissingReferenceDataError extends Data.TaggedError("MissingReferenceDataError")<{
  readonly referenceType: "federal_module" | "state_manifest";
  readonly referenceId: string;
}> {}

export type TaxEngineCoreError =
  | InvalidCanonicalReturnError
  | InvalidCoreEngineInputError
  | MissingReferenceDataError;
