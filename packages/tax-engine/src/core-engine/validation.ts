import type { FormsGraphValidationResult } from "../blueprint";
import type { CoreEngineInput, CoreEngineStateReturn } from "./input";
import {
  getAgeOnLastDayOfTaxYear,
  getFederalEicExtension,
  getFederalForm2441Extension,
  getFederalForm8812Extension,
  getFederalForm8962Extension,
  getFederalScheduleDExtension,
  getFederalSocialSecurityExtension,
  getHouseholdPersonDateOfBirth,
  getHouseholdPersonIsFullTimeStudent,
} from "./helpers";
import { getFederalFilingStatus } from "./foundations";
import { inferCapitalTransactionTerm } from "./income";
import type { FederalComputation, FederalModuleActivationState } from "./types";

function buildValidationResults(args: {
  readonly activations: FederalModuleActivationState;
  readonly hasIdentityFacts: boolean;
  readonly activeStateReturns: ReadonlyArray<CoreEngineStateReturn>;
  readonly computation: FederalComputation;
  readonly input: CoreEngineInput;
}): FormsGraphValidationResult[] {
  const filingStatus = getFederalFilingStatus(args.input);
  const federalForm2441Extension = getFederalForm2441Extension(args.input);
  const federalForm8812Extension = getFederalForm8812Extension(args.input);
  const federalForm8962Extension = getFederalForm8962Extension(args.input);
  const federalScheduleDExtension = getFederalScheduleDExtension(args.input);
  const federalSocialSecurityExtension = getFederalSocialSecurityExtension(args.input);
  const scheduleDTermOptions = {
    sourceDocuments: args.input.source_documents,
    termOverrides: federalScheduleDExtension?.transaction_term_overrides ?? [],
  };
  const marriedFilingSeparatelyEicExceptionApplied =
    filingStatus === "married_filing_separately" &&
    getFederalEicExtension(args.input)?.allow_married_filing_separately_separated_spouse_rules ===
      true;
  const validations: FormsGraphValidationResult[] = [
    {
      rule_id: "federal.identity.complete",
      severity: "error",
      status: args.hasIdentityFacts ? "pass" : "fail",
      message: args.hasIdentityFacts
        ? "Required identity facts present."
        : "Taxpayer identity facts are incomplete.",
      node_ids: ["1040.line1a"],
    },
    {
      rule_id: "federal.interest.schedule_b.activation",
      severity: "info",
      status: args.activations.scheduleBActivated ? "pass" : "skip",
      message: args.activations.scheduleBActivated
        ? "Schedule B activated due to interest or dividend input."
        : "Schedule B not required for this return.",
      node_ids: args.activations.scheduleBActivated ? ["schedb.line2", "schedb.line4"] : undefined,
    },
    {
      rule_id: "federal.deduction.choice",
      severity: "info",
      status: "pass",
      message:
        args.computation.deductionStrategy === "itemized"
          ? "Itemized deductions selected over the standard deduction."
          : "Standard deduction selected over itemized deductions.",
      node_ids: ["1040.choice.deduction_strategy"],
    },
  ];

  if (
    args.computation.line4aIraDistributions > 0 ||
    args.computation.line5aPensionsAndAnnuities > 0
  ) {
    validations.push({
      rule_id: "federal.retirement_distributions.computed",
      severity: "info",
      status: "pass",
      message:
        "IRA distributions and pension or annuity amounts were rolled into Form 1040 lines 4a through 5b from retirement distribution facts and reviewed 1099-R payloads.",
      node_ids: [
        args.computation.line4aIraDistributions > 0 ? "1040.line4a" : undefined,
        args.computation.line4bTaxableIraDistributions > 0 ? "1040.line4b" : undefined,
        args.computation.line5aPensionsAndAnnuities > 0 ? "1040.line5a" : undefined,
        args.computation.line5bTaxablePensionsAndAnnuities > 0 ? "1040.line5b" : undefined,
      ].filter((nodeId): nodeId is string => nodeId !== undefined),
    });
  }

  if (args.computation.retirementTaxableAmountAssumptionCount > 0) {
    validations.push({
      rule_id: "federal.retirement_distributions.taxable_amount_assumed",
      severity: "warning",
      status: "pass",
      message:
        "At least one retirement distribution did not include an explicit taxable amount, so the engine treated the gross distribution as taxable unless a non-taxable rollover code was present.",
      node_ids: ["1040.line4b", "1040.line5b"],
    });
  }

  if (args.computation.unemploymentCompensationTotal > 0) {
    validations.push({
      rule_id: "federal.unemployment_compensation.computed",
      severity: "info",
      status: "pass",
      message: "Unemployment compensation was rolled into Schedule 1 and Form 1040 line 8.",
      node_ids: ["sch1.line7", "sch1.line10", "1040.line8"],
    });
  }

  if (args.computation.linkedNonemployeeCompensationToScheduleCTotal > 0) {
    validations.push({
      rule_id: "federal.nonemployee_compensation.schedule_c_mapped",
      severity: "info",
      status: "pass",
      message:
        "1099-NEC amounts tied to an existing or inferred sole Schedule C business were included in business income before self-employment tax was computed.",
      node_ids: [
        "schc.line31.net_profit",
        args.computation.scheduleCBusinessNetProfit !== 0 ? "sch1.line3" : undefined,
        args.computation.selfEmploymentTax > 0 ? "schse.line12" : undefined,
      ].filter((nodeId): nodeId is string => nodeId !== undefined),
    });
  }

  if (args.computation.nonemployeeCompensationAutoLinkedCount > 0) {
    validations.push({
      rule_id: "federal.nonemployee_compensation.auto_linked_business",
      severity: "warning",
      status: "pass",
      message:
        "At least one 1099-NEC row lacked an explicit linked_business_id, so the engine inferred the sole Schedule C business owned by that recipient person.",
      node_ids: ["schc.line31.net_profit", "sch1.line3"],
    });
  }

  if (args.computation.line8jNonbusinessActivityIncomeTotal > 0) {
    validations.push({
      rule_id: "federal.nonemployee_compensation.line8j_review",
      severity: "warning",
      status: "pass",
      message:
        "Unlinked 1099-NEC amounts were routed to Schedule 1 line 8j because the return did not provide a usable Schedule C business link; review whether any should instead belong on Schedule C.",
      node_ids: ["sch1.line8j", "sch1.line9", "sch1.line10", "1040.line8"],
    });
  }

  if (args.computation.nonemployeeCompensationInvalidLinkedBusinessCount > 0) {
    validations.push({
      rule_id: "federal.nonemployee_compensation.invalid_business_link",
      severity: "warning",
      status: "pass",
      message:
        "At least one 1099-NEC row referenced a linked_business_id that was not present on the return, so the amount could not be trusted as Schedule C input without review.",
      node_ids: ["sch1.line8j", "sch1.line9", "sch1.line10"],
    });
  }

  if (args.computation.line8bGamblingIncomeTotal > 0) {
    validations.push({
      rule_id: "federal.misc_1099.gambling_income_computed",
      severity: "info",
      status: "pass",
      message: "Supported 1099-MISC wagering amounts were rolled into Schedule 1 line 8b.",
      node_ids: ["sch1.line8b", "sch1.line9", "sch1.line10", "1040.line8"],
    });
  }

  if (args.computation.line8zOtherIncomeTotal > 0) {
    validations.push({
      rule_id: "federal.misc_1099.other_income_computed",
      severity: "info",
      status: "pass",
      message:
        "Supported 1099-MISC other-income and substitute-payment categories plus manual other income items were rolled into Schedule 1 line 8z.",
      node_ids: ["sch1.line8z", "sch1.line9", "sch1.line10", "1040.line8"],
    });
  }

  if (args.computation.misc1099ScheduleEMappedCount > 0) {
    validations.push({
      rule_id: "federal.misc_1099.schedule_e_mapped",
      severity: "info",
      status: "pass",
      message:
        "Supported 1099-MISC rents and royalties were auto-linked to a unique Schedule E activity owned by the recipient and included before Schedule 1 line 5 was computed.",
      node_ids: [
        "sche.summary.total",
        args.computation.scheduleEActivityNetTotal !== 0 ? "sch1.line5" : undefined,
        args.computation.scheduleEActivityNetTotal !== 0 ? "1040.line8" : undefined,
      ].filter((nodeId): nodeId is string => nodeId !== undefined),
    });
  }

  if (args.computation.misc1099ScheduleEReviewCount > 0) {
    validations.push({
      rule_id: "federal.misc_1099.schedule_e_override_required",
      severity: "warning",
      status: "fail",
      message: `Some 1099-MISC rents or royalties could not be tied to a unique Schedule E activity for this return (${args.computation.misc1099ScheduleEReviewCategories.join(", ")}); add federal.misc_1099.overrides entries for those source documents or provide unique matching Schedule E activities before relying on Schedule E totals.`,
      node_ids: [
        args.activations.scheduleEActivated ? "sche.summary.total" : undefined,
        "1040.line8",
      ].filter((nodeId): nodeId is string => nodeId !== undefined),
    });
  }

  if (args.computation.misc1099UnsupportedIncomeCategories.length > 0) {
    validations.push({
      rule_id: "federal.misc_1099.override_required",
      severity: "warning",
      status: "fail",
      message: `Some 1099-MISC categories still need explicit classification overrides in federal.misc_1099.overrides or future dedicated modules (${args.computation.misc1099UnsupportedIncomeCategories.join(", ")}); those amounts were excluded from Schedule 1 and Schedule C outputs.`,
      node_ids: ["1040.line8"],
    });
  }

  if (args.activations.scheduleEActivated) {
    validations.push({
      rule_id: "federal.schedule_e.computed",
      severity: "info",
      status: "pass",
      message:
        "Schedule E activities were netted from canonical income and expense items, then rolled into Schedule 1 line 5 and Form 1040 line 8.",
      node_ids: [
        "sche.summary.total",
        args.computation.scheduleEActivityNetTotal !== 0 ? "sch1.line5" : undefined,
        args.computation.scheduleEActivityNetTotal !== 0 ? "sch1.line10" : undefined,
        args.computation.scheduleEActivityNetTotal !== 0 ? "1040.line8" : undefined,
      ].filter((nodeId): nodeId is string => nodeId !== undefined),
    });
  }

  if (args.computation.scheduleELimitationOverrideCount > 0) {
    validations.push({
      rule_id: "federal.schedule_e.loss_limitations_overridden",
      severity: "info",
      status: "pass",
      message:
        "Schedule E activity limitation overrides from the federal extension bag were applied before Schedule 1 line 5 and Form 1040 line 8 were computed.",
      node_ids: [
        "sche.summary.total",
        args.computation.scheduleEActivityNetTotal !== 0 ? "sch1.line5" : undefined,
        args.computation.scheduleEActivityNetTotal !== 0 ? "1040.line8" : undefined,
      ].filter((nodeId): nodeId is string => nodeId !== undefined),
    });
  }

  if (args.computation.scheduleENegativeActivityCount > 0) {
    validations.push({
      rule_id: "federal.schedule_e.loss_limitation_input_required",
      severity: "warning",
      status: "fail",
      message:
        "At least one Schedule E activity still produced a loss without an explicit limitation override or an explicit allow_reported_net_losses_without_limitation_overrides flag. Supply federal.schedule_e limitation results before relying on Schedule E losses.",
      node_ids: [
        "sche.summary.total",
        args.computation.scheduleEActivityNetTotal !== 0 ? "sch1.line5" : undefined,
        args.computation.scheduleEActivityNetTotal !== 0 ? "1040.line8" : undefined,
      ].filter((nodeId): nodeId is string => nodeId !== undefined),
    });
  }

  if (args.computation.scheduleEUnclassifiedActivityCount > 0) {
    validations.push({
      rule_id: "federal.schedule_e.unclassified_activity_type",
      severity: "warning",
      status: "pass",
      message:
        "Some Schedule E activities used the generic `other` activity type, so the engine included them in the Schedule E total without assigning them to a specific Schedule E part.",
      node_ids: ["sche.summary.total"],
    });
  }

  if (args.computation.usesDocumentedFederalWithholdingFallback) {
    validations.push({
      rule_id: "federal.withholding.document_fallback",
      severity: "info",
      status: "pass",
      message:
        "Line 25d used documented federal withholding from income facts because the canonical payments.withholdings array did not include federal rows.",
      node_ids: ["1040.line25d"],
    });
  }

  if (args.computation.line6aSocialSecurityBenefits > 0) {
    validations.push({
      rule_id: "federal.social_security_benefits.computed",
      severity: "info",
      status: "pass",
      message:
        "Social Security benefits were evaluated with the TY2025 worksheet path and rolled into Form 1040 lines 6a and 6b.",
      node_ids: ["1040.line2a", "1040.line6a", "1040.line6b"],
    });

    if (filingStatus === "married_filing_separately") {
      validations.push({
        rule_id:
          federalSocialSecurityExtension?.allow_married_filing_separately_lived_apart_exception ===
          true
            ? "federal.social_security_benefits.mfs_exception_applied"
            : "federal.social_security_benefits.mfs_default_path",
        severity: "info",
        status: "pass",
        message:
          federalSocialSecurityExtension?.allow_married_filing_separately_lived_apart_exception ===
          true
            ? "Married filing separately Social Security benefits used the lived-apart exception flag from the federal extension bag, so the non-zero base-threshold worksheet path was applied."
            : "No married filing separately Social Security lived-apart exception flag was supplied, so the engine used the default zero-base-threshold worksheet path.",
        node_ids: ["1040.line6a", "1040.line6b"],
      });
    }
  }

  if (args.activations.form2441Activated) {
    validations.push({
      rule_id: "federal.form2441.computed",
      severity: "info",
      status: "pass",
      message:
        "Form 2441 child and dependent care credit was computed from qualifying expenses, earned income, and AGI.",
      node_ids: ["2441.summary.allowed_credit"],
    });

    if (filingStatus === "married_filing_separately") {
      validations.push({
        rule_id:
          federalForm2441Extension?.allow_married_filing_separately_lived_apart_exception === true
            ? "federal.form2441.mfs_exception_applied"
            : "federal.form2441.mfs_default_ineligible",
        severity: "info",
        status: "pass",
        message:
          federalForm2441Extension?.allow_married_filing_separately_lived_apart_exception === true
            ? "Married filing separately Form 2441 used the lived-apart exception flag from the federal extension bag and computed the credit instead of suppressing it."
            : "No married filing separately Form 2441 lived-apart exception flag was supplied, so the engine used the default ineligible path and set the credit to zero.",
        node_ids: ["2441.summary.allowed_credit"],
      });
    }
  }

  if (args.activations.form8812Activated) {
    validations.push({
      rule_id: "federal.form8812.computed",
      severity: "info",
      status: "pass",
      message:
        "Schedule 8812 child tax credit, credit for other dependents, and additional child tax credit were computed.",
      node_ids: ["8812.summary.nonrefundable_credit", "8812.summary.additional_child_tax_credit"],
    });

    if (args.computation.form8812QualifyingChildrenCount >= 3) {
      validations.push({
        rule_id: "federal.form8812.alt_actc_method_computed",
        severity: "info",
        status: "pass",
        message:
          args.computation.form8812AlternativeActcMethodUsed
            ? "Three-or-more-child ACTC comparison was computed and the Credit Limit Worksheet B method produced the controlling refundable child credit."
            : "Three-or-more-child ACTC comparison was computed against the earned-income method before the refundable child credit was finalized.",
        node_ids: ["1040.line27a", "8812.summary.additional_child_tax_credit"],
      });
    }
  }

  if (
    args.computation.line27aEarnedIncomeCredit > 0 ||
    federalForm8812Extension?.line27a_eic_override != null
  ) {
    validations.push({
      rule_id: "federal.eic.computed",
      severity: "info",
      status: "pass",
      message:
        federalForm8812Extension?.line27a_eic_override != null
          ? "Form 1040 line 27a used the supplied earned income credit override from the federal extension bag."
          : "Form 1040 line 27a earned income credit was computed from candidate EIC children, earned income, AGI, and the TY2025 investment-income limit.",
      node_ids: ["1040.line27a"],
    });

    if (marriedFilingSeparatelyEicExceptionApplied) {
      validations.push({
        rule_id: "federal.eic.mfs_exception_overridden",
        severity: "info",
        status: "pass",
        message:
          "Married filing separately EIC eligibility was allowed through the separated-spouse exception flag in the federal extension bag.",
        node_ids: ["1040.line27a"],
      });
    }
  }

  if (args.activations.form8863Activated) {
    validations.push({
      rule_id: "federal.form8863.computed",
      severity: "info",
      status: "pass",
      message: "Form 8863 education credits were computed with AOTC and LLC phaseout handling.",
      node_ids: ["8863.summary.nonrefundable_credit", "8863.summary.refundable_credit"],
    });

    if (filingStatus === "married_filing_separately") {
      validations.push({
        rule_id: "federal.form8863.mfs_ineligible",
        severity: "warning",
        status: "skip",
        message:
          "Married filing separately education credits are not allowed in this engine path; Form 8863 amounts were set to zero.",
        node_ids: ["8863.summary.nonrefundable_credit", "8863.summary.refundable_credit"],
      });
    }

    if (
      args.input.facts.credits.education_credits.students.some(
        (student) => student.is_aotc_candidate && student.is_llc_candidate,
      )
    ) {
      validations.push({
        rule_id: "federal.form8863.aotc_precedence",
        severity: "warning",
        status: "pass",
        message:
          "At least one student was marked as both AOTC and LLC eligible; the engine prioritized AOTC for that student.",
        node_ids: ["8863.summary.nonrefundable_credit"],
      });
    }

    const taxpayerAge = getAgeOnLastDayOfTaxYear(
      getHouseholdPersonDateOfBirth(args.input.household.taxpayer),
      args.input.tax_year,
    );
    const taxpayerIsFullTimeStudent = getHouseholdPersonIsFullTimeStudent(
      args.input.household.taxpayer,
    );
    const spouseAge = getAgeOnLastDayOfTaxYear(
      getHouseholdPersonDateOfBirth(args.input.household.spouse),
      args.input.tax_year,
    );
    const spouseIsFullTimeStudent = getHouseholdPersonIsFullTimeStudent(
      args.input.household.spouse,
    );

    if (
      args.computation.educationCreditRefundable > 0 &&
      ((taxpayerAge != null &&
        (taxpayerAge < 18 || (taxpayerAge < 24 && taxpayerIsFullTimeStudent))) ||
        (spouseAge != null && (spouseAge < 18 || (spouseAge < 24 && spouseIsFullTimeStudent))))
    ) {
      validations.push({
        rule_id: "federal.form8863.refundable_aotc_age_restriction_review",
        severity: "warning",
        status: "pass",
        message:
          "Refundable AOTC age and support restrictions were not fully modeled; review refundable education credit eligibility.",
        node_ids: ["8863.summary.refundable_credit"],
      });
    }
  }

  if (args.activations.scheduleDActivated) {
    const scheduleDComputedNodeIds = [
      "schd.line7",
      "schd.line15",
      "schd.line16",
      args.computation.scheduleDCollectibles28PercentGainTotal > 0 ? "schd.line18" : undefined,
      args.computation.scheduleDUnrecapturedSection1250GainTotal > 0 ? "schd.line19" : undefined,
      "1040.line7",
    ].filter((nodeId): nodeId is string => nodeId !== undefined);

    validations.push({
      rule_id: "federal.schedule_d.computed",
      severity: "info",
      status: "pass",
      message:
        "Schedule D net capital gain or loss was computed from short-term transactions, long-term transactions, and capital gain distributions.",
      node_ids: scheduleDComputedNodeIds,
    });

    if (
      args.computation.scheduleDNetCapitalGainOrLossTotal < args.computation.capitalGainOrLossTotal
    ) {
      validations.push({
        rule_id: "federal.schedule_d.capital_loss_limited",
        severity: "info",
        status: "pass",
        message:
          "Schedule D net capital loss exceeded the annual deductible limit, so Form 1040 line 7 was capped and the remaining modeled loss carries forward.",
        node_ids: ["schd.line16", "schd.line21", "1040.line7"],
      });
    }
  }

  if (
    args.input.facts.income.capital_transactions.some(
      (transaction) => inferCapitalTransactionTerm(transaction, scheduleDTermOptions) === "unknown",
    )
  ) {
    validations.push({
      rule_id: "federal.schedule_d.term_override_required",
      severity: "warning",
      status: "fail",
      message:
        "At least one capital transaction still has an unknown holding period after source-document fallback. Supply federal.schedule_d.transaction_term_overrides or canonical acquisition dates before relying on Schedule D totals.",
      node_ids: ["schd.line7", "schd.line15", "schd.line16"],
    });
  }

  if (args.input.elections.capital_loss_carryforward_imported === true) {
    const hasImportedCapitalLossCarryforwardInputs =
      federalScheduleDExtension?.prior_year_short_term_capital_loss_carryforward != null &&
      federalScheduleDExtension?.prior_year_long_term_capital_loss_carryforward != null;

    validations.push({
      rule_id: hasImportedCapitalLossCarryforwardInputs
        ? "federal.schedule_d.imported_carryforward_computed"
        : "federal.schedule_d.imported_carryforward_required",
      severity: "warning",
      status: hasImportedCapitalLossCarryforwardInputs ? "pass" : "fail",
      message: hasImportedCapitalLossCarryforwardInputs
        ? "Prior-year short-term and long-term capital loss carryforwards from the federal extension bag were applied to Schedule D before Form 1040 line 7 was computed."
        : "Capital loss carryforward import was flagged, but federal.schedule_d must provide both prior-year short-term and long-term carryforward amounts before Schedule D can be treated as complete.",
      node_ids: args.activations.scheduleDActivated
        ? ["schd.line7", "schd.line15", "schd.line16", "schd.line21", "1040.line7"]
        : ["1040.line7"],
    });
  }

  if (args.activations.scheduleSEActivated) {
    validations.push({
      rule_id: "federal.schedule_se.computed",
      severity: "info",
      status: "pass",
      message:
        "Schedule SE self-employment tax and the related one-half deduction were computed from business net profit.",
      node_ids: ["schse.line12", "schse.summary.deduction"],
    });
  }

  if (args.activations.form8959Activated) {
    validations.push({
      rule_id: "federal.form8959.computed",
      severity: "info",
      status: "pass",
      message:
        "Form 8959 Additional Medicare Tax and withholding credit were computed from Medicare wages and self-employment earnings.",
      node_ids: [
        "8959.line18.additional_medicare_tax",
        "8959.line24.additional_medicare_tax_withheld",
      ],
    });
  }

  if (args.activations.form8960Activated) {
    validations.push({
      rule_id: "federal.form8960.computed",
      severity: "info",
      status: "pass",
      message:
        args.computation.scheduleEInvestmentIncomeTotal !== 0
          ? "Form 8960 net investment income tax was computed from investment income totals, passive Schedule E activity amounts, and the filing-status threshold."
          : "Form 8960 net investment income tax was computed from investment income totals and the filing-status threshold.",
      node_ids: [
        args.computation.scheduleEInvestmentIncomeTotal !== 0
          ? "8960.line4a.schedule_e_investment_income"
          : undefined,
        "8960.line8.net_investment_income",
        "8960.line17.net_investment_income_tax",
      ].filter((nodeId): nodeId is string => nodeId !== undefined),
    });
  }

  if (args.activations.form8962Activated) {
    validations.push({
      rule_id: "federal.form8962.computed",
      severity: "info",
      status: "pass",
      message:
        "Form 8962 premium tax credit reconciliation was computed from household income, poverty line, and marketplace policy totals.",
      node_ids: [
        "8962.summary.advance_ptc",
        "8962.summary.net_premium_tax_credit",
        "8962.summary.excess_advance_ptc_repayment",
      ],
    });

    if (
      filingStatus === "married_filing_separately" &&
      federalForm8962Extension?.allow_married_filing_separately_exception === true
    ) {
      validations.push({
        rule_id: "federal.form8962.mfs_exception_overridden",
        severity: "info",
        status: "pass",
        message:
          "Married filing separately Form 8962 processing used an explicit exception flag from the federal extension bag instead of suppressing premium tax credit computation.",
        node_ids: [
          "8962.summary.net_premium_tax_credit",
          "8962.summary.excess_advance_ptc_repayment",
        ],
      });
    } else if (filingStatus === "married_filing_separately") {
      validations.push({
        rule_id: "federal.form8962.mfs_default_path",
        severity: "info",
        status: "pass",
        message:
          "No married filing separately Form 8962 exception flag was supplied, so the engine used the default ineligible path: premium tax credit was suppressed and advance payments were treated as repayable.",
        node_ids: ["8962.summary.excess_advance_ptc_repayment"],
      });
    }

    if (
      args.computation.form8962HouseholdIncomePercentage != null &&
      args.computation.form8962HouseholdIncomePercentage < 100 &&
      federalForm8962Extension?.allow_household_income_below_fpl_exception === true
    ) {
      validations.push({
        rule_id: "federal.form8962.low_income_exception_overridden",
        severity: "info",
        status: "pass",
        message:
          "Below-100%-of-FPL Form 8962 processing used an explicit federal extension flag so premium tax credit reconciliation continued instead of being suppressed.",
        node_ids: ["8962.summary.net_premium_tax_credit"],
      });
    } else if (
      args.computation.form8962HouseholdIncomePercentage != null &&
      args.computation.form8962HouseholdIncomePercentage < 100
    ) {
      validations.push({
        rule_id: "federal.form8962.low_income_default_path",
        severity: "info",
        status: "pass",
        message:
          "No below-100%-of-FPL Form 8962 exception flag was supplied, so the engine used the default path and suppressed the net premium tax credit.",
        node_ids: ["8962.summary.net_premium_tax_credit"],
      });
    }
  }

  if (args.computation.usesPreferentialRateTaxComputation) {
    if (args.computation.line16TaxComputationMethod === "schedule_d_tax_worksheet") {
      const scheduleDTaxWorksheetNodes = [
        "1040.line3a",
        "schd.line16",
        args.computation.scheduleDCollectibles28PercentGainTotal > 0 ? "schd.line18" : undefined,
        args.computation.scheduleDUnrecapturedSection1250GainTotal > 0 ? "schd.line19" : undefined,
        "1040.line16",
      ].filter((nodeId): nodeId is string => nodeId !== undefined);

      validations.push({
        rule_id: "federal.line16.schedule_d_tax_worksheet",
        severity: "info",
        status: "pass",
        message: "Line 16 was computed with the TY2025 Schedule D Tax Worksheet path.",
        node_ids: scheduleDTaxWorksheetNodes,
      });
    } else {
      validations.push({
        rule_id: "federal.line16.preferential_rate_worksheet",
        severity: "info",
        status: "pass",
        message:
          "Line 16 was computed with the TY2025 qualified dividends and capital gain worksheet path.",
        node_ids: ["1040.line3a", "1040.line7", "1040.line16"],
      });
    }
  }

  if (args.computation.section1202GainTotal > 0) {
    validations.push({
      rule_id:
        federalScheduleDExtension?.section1202_exclusion_amount != null
          ? "federal.schedule_d.section1202_exclusion_applied"
          : "federal.schedule_d.section1202_exclusion_required",
      severity: "warning",
      status:
        federalScheduleDExtension?.section1202_exclusion_amount != null ? "pass" : "fail",
      message:
        federalScheduleDExtension?.section1202_exclusion_amount != null
          ? "Section 1202 gain was reduced by the explicit exclusion amount from the federal extension bag before Schedule D and line 16 tax computations ran."
          : "Section 1202 gain is present on reviewed 1099-DIV documents. Supply federal.schedule_d.section1202_exclusion_amount, using 0 when no exclusion applies, before relying on Schedule D and line 16 tax outputs.",
      node_ids: [
        args.activations.scheduleDActivated &&
        args.computation.scheduleDCollectibles28PercentGainTotal > 0
          ? "schd.line18"
          : undefined,
        args.computation.section1202ExclusionAmount > 0 ? "schd.summary.section1202_exclusion" : undefined,
        "1040.line16",
      ].filter((nodeId): nodeId is string => nodeId !== undefined),
    });
  }

  for (const stateReturn of args.activeStateReturns) {
    validations.push({
      rule_id: `${stateReturn.state_code}.plugin.enabled`,
      severity: "info",
      status: "pass",
      message: `${stateReturn.state_code} state plugin activated for requested filing.`,
      node_ids: [`bridge.${stateReturn.state_code.toLowerCase()}.starting_point`],
    });
  }

  return validations;
}

export { buildValidationResults };
