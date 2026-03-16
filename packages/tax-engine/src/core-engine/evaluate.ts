import { Effect } from "effect";

import type {
  CanonicalReturnEnvelope,
  FormsGraphSnapshot,
} from "../blueprint";
import type { CoreEngineInput, CoreEngineStateReturn } from "./input";
import { DERIVED_ADJUSTMENT_KEYS } from "./constants";
import {
  allowReportedNetLossesWithoutLimitationOverrides,
  buildScheduleERollup,
  getFederalScheduleDExtension,
  getFederalScheduleELimitationOverrides,
  roundMoney,
  sumAdjustmentValues,
  sumNamedAmounts,
  sumNumbers,
  toNumber,
} from "./helpers";
import {
  buildMisc1099IncomeRollup,
  buildNonemployeeCompensationRollup,
  resolveUnemploymentCompensationAmount,
  sumAdvancePremiumTaxCredits,
  sumCapitalGainDistributions,
  sumCapitalGainOrLoss,
  sumCareExpenses,
  sumEducationExpenses,
  sumScheduleCBusinessNetProfit,
} from "./income";
import { calculateScheduleDSpecialGains, sumItemizedDeductionTotals } from "./foundations";
import { type CoreEngineFederalSummary, type CoreEngineResult, type TaxEngineCoreError } from "./public";
import { buildFederalComputation, buildFederalActivations, finalizeFederalActivations } from "./computation";
import { buildFederalModules, buildWageInputNodes, buildInterestInputNodes, buildDividendInputNodes, buildCapitalTransactionInputNodes, buildOtherIncomeInputNodes, buildScheduleENodes } from "./graph-inputs";
import { buildScheduleBNodes, buildSchedule1Nodes, buildSchedule2Nodes, buildSchedule3Nodes, buildScheduleANodes } from "./graph-schedule";
import { buildScheduleCNodes, buildScheduleDNodes, buildScheduleSENodes, buildOptionalFederalFormNodes } from "./graph-federal-forms";
import { buildFederal1040Nodes } from "./graph-1040";
import { buildFederalEdges } from "./graph-edges";
import { buildStateArtifacts, buildStatePluginModule } from "./states";
import { buildValidationResults } from "./validation";
import {
  buildActiveFederalModuleIds,
  findFederalModuleCatalogEntry,
  findStatePluginManifest,
  parseCanonicalReturnEnvelopeEffect,
  parseCoreEngineInputEffect,
} from "./references";
import type { FederalComputation, FederalModuleActivationState } from "./types";

function buildFederalSummary(args: {
  readonly activations: FederalModuleActivationState;
  readonly computation: FederalComputation;
}): CoreEngineFederalSummary {
  return {
    line1a_wages: args.computation.wageTotal,
    line2a_tax_exempt_interest: args.computation.line2aTaxExemptInterest,
    line3a_qualified_dividends: args.computation.qualifiedDividendsTotal,
    line2b_taxable_interest: args.computation.taxableInterestTotal,
    line3b_ordinary_dividends: args.computation.ordinaryDividendsTotal,
    line4a_ira_distributions: args.computation.line4aIraDistributions,
    line4b_taxable_ira_distributions: args.computation.line4bTaxableIraDistributions,
    line5a_pensions_and_annuities: args.computation.line5aPensionsAndAnnuities,
    line5b_taxable_pensions_and_annuities: args.computation.line5bTaxablePensionsAndAnnuities,
    line6a_social_security_benefits: args.computation.line6aSocialSecurityBenefits,
    line6b_taxable_social_security_benefits: args.computation.line6bTaxableSocialSecurityBenefits,
    line7_capital_gain_or_loss: args.computation.capitalGainOrLossTotal,
    line8_other_income: args.computation.schedule1AdditionalIncomeTotal,
    line9_total_income: args.computation.totalIncome,
    line10_adjustments: args.computation.totalAdjustments,
    line11_adjusted_gross_income: args.computation.adjustedGrossIncome,
    line12_deductions: args.computation.line12Deductions,
    line15_taxable_income: args.computation.line15TaxableIncome,
    line16_regular_income_tax: args.computation.line16RegularIncomeTax,
    line19_child_tax_credit_or_credit_for_other_dependents:
      args.computation.line19ChildTaxCreditOrCreditForOtherDependents,
    line20_other_nonrefundable_credits: args.computation.line20OtherNonrefundableCredits,
    line23_other_taxes: args.computation.line23OtherTaxes,
    line24_total_tax: args.computation.line24TotalTax,
    line25d_federal_withholding: args.computation.federalWithholding,
    line26_estimated_and_extension_payments: args.computation.line26EstimatedAndExtensionPayments,
    line27a_earned_income_credit: args.computation.line27aEarnedIncomeCredit,
    line28_additional_child_tax_credit: args.computation.line28AdditionalChildTaxCredit,
    line29_refundable_education_credit: args.computation.line29RefundableEducationCredit,
    line31_other_payments: args.computation.line31OtherPayments,
    line33_total_payments: args.computation.line33TotalPayments,
    line34_refund_amount: args.computation.line34RefundAmount,
    line37_amount_owed: args.computation.line37AmountOwed,
    standard_deduction: args.computation.standardDeduction,
    itemized_deduction_total: args.computation.itemizedDeductionTotal,
    schedule1_additional_income_total: args.computation.schedule1AdditionalIncomeTotal,
    schedule2_other_taxes_total: args.computation.schedule2OtherTaxesTotal,
    schedule3_nonrefundable_credits_total: args.computation.schedule3NonrefundableCreditsTotal,
    schedule3_payments_total: args.computation.schedule3PaymentsTotal,
    total_adjustments: args.computation.totalAdjustments,
    federal_withholding: args.computation.federalWithholding,
    tax_exempt_interest_total: args.computation.taxExemptInterestTotal,
    unemployment_compensation_total: args.computation.unemploymentCompensationTotal,
    self_employment_tax: args.computation.selfEmploymentTax,
    self_employment_tax_deduction: args.computation.selfEmploymentTaxDeduction,
    additional_medicare_tax: args.computation.additionalMedicareTax,
    additional_medicare_tax_withheld: args.computation.additionalMedicareTaxWithheld,
    net_investment_income: args.computation.netInvestmentIncome,
    net_investment_income_tax: args.computation.netInvestmentIncomeTax,
    child_and_dependent_care_credit: args.computation.childAndDependentCareCredit,
    child_tax_credit_or_credit_for_other_dependents:
      args.computation.childTaxCreditOrCreditForOtherDependents,
    additional_child_tax_credit: args.computation.form8812AdditionalChildTaxCredit,
    education_credit_nonrefundable: args.computation.educationCreditNonrefundable,
    education_credit_refundable: args.computation.educationCreditRefundable,
    capital_gain_distributions_total: args.computation.capitalGainDistributionsTotal,
    line16_tax_computation_method: args.computation.line16TaxComputationMethod,
    net_premium_tax_credit: args.computation.netPremiumTaxCredit,
    excess_advance_premium_tax_credit_repayment:
      args.computation.excessAdvancePremiumTaxCreditRepayment,
    schedule_d_collectibles_28_percent_gain_total:
      args.computation.scheduleDCollectibles28PercentGainTotal,
    schedule_d_unrecaptured_section_1250_gain_total:
      args.computation.scheduleDUnrecapturedSection1250GainTotal,
    deduction_strategy: args.computation.deductionStrategy,
    form_8959_activated: args.activations.form8959Activated,
    form_8960_activated: args.activations.form8960Activated,
    schedule_a_activated: args.activations.scheduleAActivated,
    schedule_1_activated: args.activations.schedule1Activated,
    schedule_2_activated: args.activations.schedule2Activated,
    schedule_b_activated: args.activations.scheduleBActivated,
    schedule_3_activated: args.activations.schedule3Activated,
    schedule_c_activated: args.activations.scheduleCActivated,
    schedule_d_activated: args.activations.scheduleDActivated,
    schedule_e_activated: args.activations.scheduleEActivated,
    schedule_e_activity_net_total: args.computation.scheduleEActivityNetTotal,
    schedule_e_investment_income_total: args.computation.scheduleEInvestmentIncomeTotal,
    schedule_se_activated: args.activations.scheduleSEActivated,
  };
}

function hasIdentityFacts(input: CoreEngineInput): boolean {
  return input.household.filing_status.length > 0 && input.household.taxpayer !== null;
}

function isStateReturnActive(stateReturn: CoreEngineStateReturn): boolean {
  return stateReturn.enabled;
}

export function evaluateTy2025CoreEngineFromEnvelope(
  canonicalReturn: CanonicalReturnEnvelope,
): Effect.Effect<CoreEngineResult, TaxEngineCoreError> {
  return Effect.gen(function* () {
    const engineInput = yield* parseCoreEngineInputEffect(canonicalReturn);
    const federalScheduleDExtension = getFederalScheduleDExtension(engineInput);
    const preliminaryScheduleDSpecialGains = calculateScheduleDSpecialGains(
      engineInput.source_documents,
    );
    const preliminaryNonemployeeCompensationRollup =
      buildNonemployeeCompensationRollup(engineInput);
    const preliminaryMisc1099IncomeRollup = buildMisc1099IncomeRollup(engineInput);
    const preliminaryScheduleERollup = buildScheduleERollup(
      engineInput.facts.income.schedule_e_activities,
      {
        additionalIncomeByActivityIndex: preliminaryMisc1099IncomeRollup.scheduleEIncomeByActivityIndex,
        allowReportedNetLossesWithoutLimitationOverrides:
          allowReportedNetLossesWithoutLimitationOverrides(engineInput),
        limitationOverrides: getFederalScheduleELimitationOverrides(engineInput),
      },
    );
    const preliminaryCapitalTransactionsNetTotal = sumCapitalGainOrLoss(
      engineInput.facts.income.capital_transactions,
    );
    const preliminaryCapitalGainDistributionsTotal = sumCapitalGainDistributions(
      engineInput.facts.income.dividends,
    );
    const preliminaryTotals = {
      advancePremiumTaxCreditTotal: sumAdvancePremiumTaxCredits(
        engineInput.facts.credits.premium_tax_credit.policies,
      ),
      careExpenseTotal: sumCareExpenses(
        engineInput.facts.credits.child_and_dependent_care.expenses,
      ),
      capitalGainDistributionsTotal: preliminaryCapitalGainDistributionsTotal,
      capitalTransactionsNetTotal: preliminaryCapitalTransactionsNetTotal,
      capitalLossCarryforwardTotal: roundMoney(
        Math.abs(
          toNumber(
            federalScheduleDExtension?.prior_year_short_term_capital_loss_carryforward,
          ),
        ) +
          Math.abs(
            toNumber(
              federalScheduleDExtension?.prior_year_long_term_capital_loss_carryforward,
            ),
          ),
      ),
      capitalGainOrLossTotal: roundMoney(
        preliminaryCapitalTransactionsNetTotal + preliminaryCapitalGainDistributionsTotal,
      ),
      collectibles28PercentGainTotal:
        preliminaryScheduleDSpecialGains.collectibles28PercentGainTotal,
      educationExpenseTotal: sumEducationExpenses(
        engineInput.facts.credits.education_credits.students,
      ),
      hsaDeductionTotal: roundMoney(
        toNumber(
          engineInput.facts.adjustments.health_savings_account_deduction as
            | number
            | null
            | undefined,
        ),
      ),
      itemizedDeductionTotal: sumItemizedDeductionTotals(engineInput.facts.itemized_deductions),
      nonrefundableCreditsTotal: sumNamedAmounts(
        engineInput.facts.credits.other_nonrefundable_credits,
      ),
      ordinaryDividendsTotal: roundMoney(
        sumNumbers(
          engineInput.facts.income.dividends.map((dividend) =>
            toNumber(dividend.ordinary_dividends),
          ),
        ),
      ),
      refundableCreditsTotal: sumNamedAmounts(engineInput.facts.credits.other_refundable_credits),
      scheduleCBusinessNetProfit: sumScheduleCBusinessNetProfit(
        engineInput.facts.income.schedule_c_businesses,
        preliminaryNonemployeeCompensationRollup.receiptsByBusinessId,
      ),
      scheduleEActivityNetTotal: preliminaryScheduleERollup.totalNetTotal,
      scheduleEInvestmentIncomeTotal: preliminaryScheduleERollup.activityNetInvestmentIncomeTotal,
      section1202GainTotal: preliminaryScheduleDSpecialGains.section1202GainTotal,
      taxableInterestTotal: roundMoney(
        sumNumbers(
          engineInput.facts.income.taxable_interest.map((interest) => interest.interest_income),
        ),
      ),
      totalAdjustments: sumAdjustmentValues(engineInput.facts.adjustments, {
        excludedKeys: DERIVED_ADJUSTMENT_KEYS,
      }),
      totalPaymentsBeyondWithholding: roundMoney(
        sumNumbers(
          engineInput.facts.payments.estimated_payments
            .filter((payment) => payment.jurisdiction === "federal")
            .map((payment) => payment.amount),
        ) +
          sumNumbers(
            engineInput.facts.payments.extension_payments
              .filter((payment) => payment.jurisdiction === "federal")
              .map((payment) => payment.amount),
          ) +
          toNumber(engineInput.facts.payments.prior_year_overpayment_applied_to_2025) +
          sumNamedAmounts(engineInput.facts.credits.other_refundable_credits),
      ),
      otherIncomeTotal: roundMoney(
        sumNumbers(engineInput.facts.income.other_income_items.map((item) => item.amount)) +
          sumNumbers(
            engineInput.facts.income.unemployment_compensation.map((unemployment) =>
              resolveUnemploymentCompensationAmount(unemployment, engineInput.source_documents),
            ),
          ) +
          preliminaryNonemployeeCompensationRollup.line8jAmountTotal +
          preliminaryScheduleERollup.totalNetTotal +
          preliminaryMisc1099IncomeRollup.line8bGamblingAmountTotal +
          preliminaryMisc1099IncomeRollup.line8zOtherIncomeAmountTotal,
      ),
      unrecapturedSection1250GainTotal:
        preliminaryScheduleDSpecialGains.unrecapturedSection1250GainTotal,
    };
    const preliminaryActivations = buildFederalActivations(engineInput, preliminaryTotals);
    const computation = buildFederalComputation(engineInput, preliminaryActivations);
    const activations = finalizeFederalActivations(preliminaryActivations, computation);
    const federalSummary = buildFederalSummary({
      activations,
      computation,
    });
    const activeStateReturns = engineInput.requested_jurisdictions.states
      .map((stateCode) => engineInput.state_returns[stateCode])
      .filter((stateReturn): stateReturn is CoreEngineStateReturn => stateReturn !== undefined)
      .filter(isStateReturnActive);

    const stateManifestEntries = yield* Effect.all(
      activeStateReturns.map((stateReturn) =>
        Effect.map(findStatePluginManifest(stateReturn.state_code), (manifest) => ({
          stateCode: stateReturn.state_code,
          manifest,
        })),
      ),
    );
    const stateManifestsByCode = new Map(
      stateManifestEntries.map(({ stateCode, manifest }) => [stateCode, manifest]),
    );
    const activeFederalModuleIds = buildActiveFederalModuleIds(activations);
    const federalModuleEntries = yield* Effect.all(
      activeFederalModuleIds.map((moduleId) => findFederalModuleCatalogEntry(moduleId)),
    );
    const federalModules = buildFederalModules(federalModuleEntries);
    const stateModules = activeStateReturns.map((stateReturn) =>
      buildStatePluginModule(stateManifestsByCode.get(stateReturn.state_code)!),
    );
    const wageInputNodes = buildWageInputNodes(engineInput.facts.income.wages);
    const interestInputNodes = activations.scheduleBActivated
      ? buildInterestInputNodes(engineInput.facts.income.taxable_interest)
      : [];
    const dividendInputNodes = activations.scheduleBActivated
      ? buildDividendInputNodes(engineInput.facts.income.dividends)
      : [];
    const capitalTransactionInputNodes = activations.form8949Activated
      ? buildCapitalTransactionInputNodes(engineInput.facts.income.capital_transactions)
      : [];
    const otherIncomeInputNodes = activations.schedule1Activated
      ? buildOtherIncomeInputNodes(engineInput.facts.income.other_income_items)
      : [];
    const scheduleCNodes = buildScheduleCNodes({
      computation,
      input: engineInput,
    });
    const scheduleBNodes = activations.scheduleBActivated ? buildScheduleBNodes(computation) : [];
    const scheduleDNodes = buildScheduleDNodes({
      computation,
      input: engineInput,
    });
    const scheduleENodes = buildScheduleENodes({
      computation,
      input: engineInput,
    });
    const scheduleSENodes = buildScheduleSENodes(computation);
    const schedule1Nodes = buildSchedule1Nodes({
      computation,
      input: engineInput,
    });
    const schedule2Nodes = buildSchedule2Nodes(computation);
    const scheduleANodes = buildScheduleANodes({
      computation,
      input: engineInput,
    });
    const schedule3Nodes = buildSchedule3Nodes(computation);
    const optionalFederalFormNodes = buildOptionalFederalFormNodes({
      activations,
      computation,
      input: engineInput,
    });
    const federal1040Nodes = buildFederal1040Nodes({
      activations,
      computation,
      input: engineInput,
    });
    const federalNodes = [
      ...wageInputNodes,
      ...interestInputNodes,
      ...dividendInputNodes,
      ...capitalTransactionInputNodes,
      ...otherIncomeInputNodes,
      ...scheduleCNodes,
      ...scheduleBNodes,
      ...scheduleDNodes,
      ...scheduleENodes,
      ...scheduleSENodes,
      ...schedule1Nodes,
      ...schedule2Nodes,
      ...scheduleANodes,
      ...schedule3Nodes,
      ...optionalFederalFormNodes,
      ...federal1040Nodes,
    ];
    const federalEdges = buildFederalEdges({
      activations,
      capitalTransactionInputNodes,
      computation,
      dividendInputNodes,
      input: engineInput,
      interestInputNodes,
      otherIncomeInputNodes,
      scheduleEActivities: engineInput.facts.income.schedule_e_activities,
      wageInputNodes,
    });
    const stateArtifacts = buildStateArtifacts({
      activeStateReturns,
      adjustedGrossIncome: federalSummary.line11_adjusted_gross_income,
      federalSummary,
      input: engineInput,
      stateManifestsByCode,
    });
    const validationResults = [
      ...buildValidationResults({
        activations,
        hasIdentityFacts: hasIdentityFacts(engineInput),
        activeStateReturns,
        computation,
        input: engineInput,
      }),
      ...stateArtifacts.validationResults,
    ];
    const graph: FormsGraphSnapshot = {
      graph_id: `graph_${engineInput.return_id}`,
      tax_year: engineInput.tax_year,
      created_at: engineInput.lifecycle.updated_at,
      jurisdictions: [
        "federal",
        ...activeStateReturns.map((stateReturn) => stateReturn.state_code),
      ],
      modules: [...federalModules, ...stateModules],
      nodes: [...federalNodes, ...stateArtifacts.nodes],
      edges: [...federalEdges, ...stateArtifacts.edges],
      execution_order: [...federalNodes, ...stateArtifacts.nodes].map((node) => node.node_id),
      validation_results: validationResults,
      materialized_outputs: {
        federal_summary: federalSummary,
        state_summaries: stateArtifacts.stateSummaries,
      },
    };

    return {
      return_id: engineInput.return_id,
      tax_year: engineInput.tax_year,
      activated_module_ids: graph.modules.map((module) => module.module_id),
      graph,
      federal_summary: federalSummary,
      state_summaries: stateArtifacts.stateSummaries,
    };
  });
}

export function evaluateTy2025CoreEngine(
  input: unknown,
): Effect.Effect<CoreEngineResult, TaxEngineCoreError> {
  return Effect.flatMap(
    parseCanonicalReturnEnvelopeEffect(input),
    evaluateTy2025CoreEngineFromEnvelope,
  );
}
