import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  sumNamedAmounts,
} from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  createStateEdge,
  createStateNode,
  getStatePluginRecord,
  normalizeResidentFilingStatus,
  readNamedAmountArrayTotal,
  readPluginPaymentTotal,
  supportsAllocatedResidentComputation,
  sumStateAdditionAmounts,
  sumStateNonrefundableCredits,
  toWholeDollars,
} from "../resident";
import {
  calculateNewYorkCityHouseholdCredit,
  calculateNewYorkCitySchoolTaxCreditFixedAmount,
  calculateNewYorkCitySchoolTaxRateReduction,
  calculateNewYorkCityTax,
  calculateNewYorkStateHouseholdCredit,
  resolveNewYorkHouseholdCreditAdjustedGrossIncome,
  resolveNewYorkCityPartYearResidentTax,
  type NewYorkFilingStatus,
} from "./local";
import {
  calculateAllocatedNewYorkTaxableIncome,
  calculateNewYorkIncomePercentage,
  resolveAllocatedNewYorkAdjustedGrossIncome,
} from "./allocated";
import { calculateNewYorkStateTax } from "./tax";
import {
  getNewYorkHouseholdCreditPeopleCount,
  resolveNewYorkCityResidency,
} from "./residency";

const NEW_YORK_STATE_CODE = "NY";
const NEW_YORK_STATE_NAME = "New York";
const NEW_YORK_FORM_RECORD_KEY = "it201";
const NEW_YORK_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 11_200,
  married_filing_jointly: 16_050,
  married_filing_separately: 8_000,
  qualifying_surviving_spouse: 16_050,
  single: 8_000,
} as const satisfies Record<NewYorkFilingStatus, number>;
const NEW_YORK_SINGLE_DEPENDENT_STANDARD_DEDUCTION = 3_100;
const NEW_YORK_DEPENDENT_EXEMPTION_AMOUNT = 1_000;

function deriveNewYorkSpouseAdjustedGrossIncome(args: StateArtifactsArgs): number | null {
  if (args.input.household.spouse == null) {
    return null;
  }

  const spousePersonId = asString(asRecord(args.input.household.spouse)?.person_id) ?? "spouse";
  const spouseWages = args.input.facts.income.wages
    .filter((wage) => wage.person_id === spousePersonId)
    .reduce((total, wage) => total + wage.wages_tips_other_compensation, 0);
  const spouseNonemployeeCompensation = args.input.facts.income.nonemployee_compensation
    .filter((entry) => entry.person_id === spousePersonId)
    .reduce((total, entry) => total + (entry.amount ?? 0), 0);
  const spouseMisc1099 = args.input.facts.income.miscellaneous_1099_income
    .filter((entry) => entry.person_id === spousePersonId)
    .reduce((total, entry) => total + (entry.amount ?? 0), 0);
  const spouseScheduleC = args.input.facts.income.schedule_c_businesses
    .filter((business) => business.owner_person_id === spousePersonId)
    .reduce((total, business) => {
      const grossReceipts = business.gross_receipts_or_sales ?? 0;
      const otherIncome = business.other_business_income ?? 0;
      const returnsAndAllowances = business.returns_and_allowances ?? 0;
      const costOfGoodsSold = business.cost_of_goods_sold ?? 0;
      const expenses = business.expenses.reduce((expenseTotal, expense) => expenseTotal + expense.amount, 0);
      return total +
        grossReceipts +
        otherIncome -
        returnsAndAllowances -
        costOfGoodsSold -
        expenses -
        (business.home_office_deduction ?? 0);
    }, 0);
  const spouseScheduleE = args.input.facts.income.schedule_e_activities
    .filter((activity) => activity.owner_person_id === spousePersonId)
    .reduce((total, activity) => {
      const income = activity.income_items.reduce((sum, item) => sum + item.amount, 0);
      const expense = activity.expense_items.reduce((sum, item) => sum + item.amount, 0);
      return total + income - expense;
    }, 0);

  return toWholeDollars(
    spouseWages +
      spouseNonemployeeCompensation +
      spouseMisc1099 +
      spouseScheduleC +
      spouseScheduleE,
  );
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: NEW_YORK_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, NEW_YORK_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const fullYearFederalSummary = args.returnKindContext?.originalFederalSummary ?? args.federalSummary;
  const fullYearFederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const federalAdjustedGrossIncome = toWholeDollars(
    asNumber(formRecord?.federal_adjusted_gross_income_amount) ?? fullYearFederalAdjustedGrossIncome,
  );
  const line23Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line31Subtractions = toWholeDollars(
    sumNamedAmounts(args.stateReturn.subtractions) +
      readNamedAmountArrayTotal(formRecord?.subtractions) +
      (asNumber(formRecord?.pension_and_annuity_exclusion_amount) ?? 0) +
      (asNumber(formRecord?.college_savings_deduction_amount) ?? 0) +
      (asNumber(formRecord?.u_s_government_interest_amount) ?? 0),
  );
  const line33NewYorkAdjustedGrossIncome = Math.max(
    federalAdjustedGrossIncome + line23Additions - line31Subtractions,
    0,
  );
  const explicitSpouseAdjustedGrossIncome =
    asNumber(formRecord?.spouse_federal_adjusted_gross_income_amount) ??
    asNumber(formRecord?.spouse_adjusted_gross_income_amount);
  const derivedSpouseAdjustedGrossIncome =
    explicitSpouseAdjustedGrossIncome == null && filingStatus === "married_filing_separately"
      ? deriveNewYorkSpouseAdjustedGrossIncome(args)
      : null;
  const combinedHouseholdCreditAdjustedGrossIncome = resolveNewYorkHouseholdCreditAdjustedGrossIncome({
    combinedAdjustedGrossIncome:
      asNumber(formRecord?.combined_federal_adjusted_gross_income_amount) ??
      asNumber(formRecord?.household_credit_combined_federal_adjusted_gross_income_amount) ??
      asNumber(formRecord?.nyc_household_credit_combined_federal_adjusted_gross_income_amount) ??
      null,
    federalAdjustedGrossIncome,
    filingStatus,
    spouseAdjustedGrossIncome: explicitSpouseAdjustedGrossIncome ?? derivedSpouseAdjustedGrossIncome,
  });
  const standardDeduction = toWholeDollars(
    asNumber(formRecord?.standard_deduction_amount) ??
      (filingStatus === "single" &&
      (args.input.household.can_be_claimed_as_dependent ??
        (asBoolean(asRecord(args.input.household.taxpayer)?.can_be_claimed_as_dependent) ?? false))
        ? NEW_YORK_SINGLE_DEPENDENT_STANDARD_DEDUCTION
        : NEW_YORK_STANDARD_DEDUCTION_BY_FILING_STATUS[filingStatus]),
  );
  const itemizedDeductionCandidate = toWholeDollars(
    asNumber(formRecord?.itemized_deduction_amount) ??
      (fullYearFederalSummary?.deduction_strategy === "itemized"
        ? fullYearFederalSummary.itemized_deduction_total
        : 0) +
      sumNamedAmounts(args.stateReturn.state_specific_deductions),
  );
  const useItemizedDeduction =
    asBoolean(formRecord?.use_itemized_deductions) === true ||
    (fullYearFederalSummary?.deduction_strategy === "itemized" &&
      (filingStatus !== "married_filing_separately" ||
        asBoolean(formRecord?.spouse_itemized_new_york) === true));
  const line34Deduction = useItemizedDeduction ? itemizedDeductionCandidate : standardDeduction;
  const line36DependentExemptionAmount = toWholeDollars(
    asNumber(formRecord?.dependent_exemption_amount) ??
      args.input.household.dependents.length * NEW_YORK_DEPENDENT_EXEMPTION_AMOUNT,
  );
  const line38TaxableIncome = Math.max(
    line33NewYorkAdjustedGrossIncome - line34Deduction - line36DependentExemptionAmount,
    0,
  );
  const line39StateTax = toWholeDollars(
    asNumber(formRecord?.state_tax_amount) ??
      calculateNewYorkStateTax({
        adjustedGrossIncome: line33NewYorkAdjustedGrossIncome,
        filingStatus,
        taxableIncome: line38TaxableIncome,
      }),
  );
  const householdCreditPeopleCount = getNewYorkHouseholdCreditPeopleCount(args.input, filingStatus);
  const canBeClaimedAsDependent =
    args.input.household.can_be_claimed_as_dependent ??
    asBoolean(asRecord(args.input.household.taxpayer)?.can_be_claimed_as_dependent) ??
    false;
  const line40StateHouseholdCredit = toWholeDollars(
    asNumber(formRecord?.household_credit_amount) ??
      calculateNewYorkStateHouseholdCredit({
        canBeClaimedAsDependent,
        federalAdjustedGrossIncome: combinedHouseholdCreditAdjustedGrossIncome,
        filingStatus,
        peopleCount: householdCreditPeopleCount,
      }),
  );
  const line41ResidentCredit = toWholeDollars(
    asNumber(formRecord?.resident_credit_amount) ??
      asNumber(formRecord?.other_state_credit_amount) ??
      0,
  );
  const line41ChildAndDependentCareCredit = toWholeDollars(
    asNumber(formRecord?.child_and_dependent_care_credit_amount) ?? 0,
  );
  const line42OtherNonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const isAllocatedReturn = args.stateReturn.return_kind !== "resident";
  const allocatedNewYorkAdjustedGrossIncome = isAllocatedReturn
    ? resolveAllocatedNewYorkAdjustedGrossIncome(args.stateReturn, formRecord)
    : null;
  const line44BaseTax = Math.max(
    line39StateTax -
      line40StateHouseholdCredit -
      line41ChildAndDependentCareCredit -
      line41ResidentCredit,
    0,
  );
  const line45IncomePercentage = isAllocatedReturn
    ? calculateNewYorkIncomePercentage({
        federalAdjustedGrossIncome: line33NewYorkAdjustedGrossIncome,
        newYorkStateAdjustedGrossIncome: allocatedNewYorkAdjustedGrossIncome,
      })
    : null;
  const line45NetOtherStateTaxes = toWholeDollars(
    asNumber(formRecord?.other_state_taxes_amount) ??
      asNumber(formRecord?.other_taxes_amount) ??
      0,
  );
  const line46AllocatedStateTax = isAllocatedReturn
    ? toWholeDollars(line44BaseTax * (line45IncomePercentage ?? 0))
    : null;
  const line46StateTaxAfterCredits = isAllocatedReturn
    ? Math.max((line46AllocatedStateTax ?? 0) - line42OtherNonrefundableCredits, 0)
    : Math.max(
        line39StateTax -
          line40StateHouseholdCredit -
          line41ResidentCredit -
          line42OtherNonrefundableCredits,
        0,
      );
  const allocatedTaxableIncome = isAllocatedReturn
    ? calculateAllocatedNewYorkTaxableIncome(line38TaxableIncome, line45IncomePercentage)
    : null;
  const newYorkCityResidency = resolveNewYorkCityResidency(formRecord, args.stateReturn);
  const partYearNewYorkCityTax = newYorkCityResidency.partYear
    ? resolveNewYorkCityPartYearResidentTax({
        canBeClaimedAsDependent,
        dependentExemptionCount: args.input.household.dependents.length,
        filingStatus,
        formRecord,
        fullYearDeductionAmount: line34Deduction,
        fullYearNewYorkAdjustedGrossIncome: line33NewYorkAdjustedGrossIncome,
        householdCreditFederalAdjustedGrossIncome: combinedHouseholdCreditAdjustedGrossIncome,
        monthsResident: newYorkCityResidency.monthsResident,
        peopleCount: householdCreditPeopleCount,
        useItemizedDeduction,
      })
    : null;
  const line47NewYorkCityTaxableIncome = newYorkCityResidency.fullYear
    ? Math.max(
        line33NewYorkAdjustedGrossIncome +
          toWholeDollars(asNumber(formRecord?.charitable_gifts_trust_addback_amount) ?? 0) -
          line34Deduction -
          line36DependentExemptionAmount,
        0,
      )
    : partYearNewYorkCityTax?.taxableIncome ?? 0;
  const line47aNewYorkCityResidentTax = newYorkCityResidency.fullYear
    ? toWholeDollars(
        asNumber(formRecord?.nyc_tax_amount) ??
          calculateNewYorkCityTax({
            filingStatus,
            taxableIncome: line47NewYorkCityTaxableIncome,
          }),
      )
    : 0;
  const line48NewYorkCityHouseholdCredit = newYorkCityResidency.fullYear
    ? toWholeDollars(
        asNumber(formRecord?.nyc_household_credit_amount) ??
          calculateNewYorkCityHouseholdCredit({
            canBeClaimedAsDependent,
            federalAdjustedGrossIncome: combinedHouseholdCreditAdjustedGrossIncome,
            filingStatus,
            peopleCount: householdCreditPeopleCount,
          }),
      )
    : 0;
  const line50PartYearNewYorkCityTax = newYorkCityResidency.partYear
    ? toWholeDollars(asNumber(formRecord?.nyc_part_year_tax_amount) ?? partYearNewYorkCityTax?.taxAfterCredits ?? 0)
    : 0;
  const line51OtherNewYorkCityTaxes = toWholeDollars(asNumber(formRecord?.nyc_other_taxes_amount) ?? 0);
  const schoolTaxFixedIncome = Math.max(federalAdjustedGrossIncome - (fullYearFederalSummary?.line4b_taxable_ira_distributions ?? 0), 0);
  const line69NewYorkCitySchoolTaxCreditFixedAmount = newYorkCityResidency.applies
    ? toWholeDollars(
        asNumber(formRecord?.nyc_school_tax_credit_fixed_amount) ??
          calculateNewYorkCitySchoolTaxCreditFixedAmount({
            canBeClaimedAsDependent,
            filingStatus,
            income: schoolTaxFixedIncome,
            monthsResident: newYorkCityResidency.monthsResident,
          }),
      )
    : 0;
  const line69aNewYorkCitySchoolTaxCreditRateReduction = newYorkCityResidency.applies
    ? toWholeDollars(
        asNumber(formRecord?.nyc_school_tax_credit_rate_reduction_amount) ??
          calculateNewYorkCitySchoolTaxRateReduction({
            canBeClaimedAsDependent,
            filingStatus,
            taxableIncome: line47NewYorkCityTaxableIncome,
          }),
      )
    : 0;
  const line52NewYorkCityTaxAfterCredits = newYorkCityResidency.fullYear
    ? Math.max(line47aNewYorkCityResidentTax - line48NewYorkCityHouseholdCredit, 0)
    : line50PartYearNewYorkCityTax;
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: toWholeDollars(
      readNamedAmountArrayTotal(formRecord?.refundable_credits) +
        line69NewYorkCitySchoolTaxCreditFixedAmount +
        line69aNewYorkCitySchoolTaxCreditRateReduction,
    ),
    stateCode: NEW_YORK_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line46StateTaxAfterCredits + line45NetOtherStateTaxes + line52NewYorkCityTaxAfterCredits + line51OtherNewYorkCityTaxes - payments.totalPayments, 0),
    startingPoint: allocatedNewYorkAdjustedGrossIncome ?? line33NewYorkAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: allocatedTaxableIncome ?? line38TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line46StateTaxAfterCredits + line45NetOtherStateTaxes + line52NewYorkCityTaxAfterCredits + line51OtherNewYorkCityTaxes,
  });

  const validationResults = [];
  const missingCombinedHouseholdCreditInputs = asNumber(formRecord?.combined_federal_adjusted_gross_income_amount) == null &&
    asNumber(formRecord?.household_credit_combined_federal_adjusted_gross_income_amount) == null &&
    asNumber(formRecord?.nyc_household_credit_combined_federal_adjusted_gross_income_amount) == null &&
    asNumber(formRecord?.spouse_federal_adjusted_gross_income_amount) == null &&
    asNumber(formRecord?.spouse_adjusted_gross_income_amount) == null;

  if (
    filingStatus === "married_filing_separately" &&
    derivedSpouseAdjustedGrossIncome != null &&
    missingCombinedHouseholdCreditInputs
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "New York married-filing-separately household credits derived the spouse adjusted gross income from spouse-tagged income facts because no combined AGI override was supplied.",
        nodeIds: ["ny.it201.line40", "ny.it201.line48"],
        ruleId: "NY.household_credit_spouse_agi_derived",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    filingStatus === "married_filing_separately" &&
    line40StateHouseholdCredit > 0 &&
    asNumber(formRecord?.household_credit_amount) == null &&
    derivedSpouseAdjustedGrossIncome == null &&
    missingCombinedHouseholdCreditInputs
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "New York household credit for married filing separately uses both spouses’ combined federal adjusted gross income and dependent counts. Supply plugin_fact_bag.it201.household_credit_amount when the default single-return approximation is not sufficient.",
        nodeIds: ["ny.it201.line40"],
        ruleId: "NY.household_credit_mfs_review",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    filingStatus === "married_filing_separately" &&
    newYorkCityResidency.fullYear &&
    line48NewYorkCityHouseholdCredit > 0 &&
    asNumber(formRecord?.nyc_household_credit_amount) == null &&
    derivedSpouseAdjustedGrossIncome == null &&
    missingCombinedHouseholdCreditInputs
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "New York City household credit for married filing separately uses both spouses’ combined federal adjusted gross income and dependents. Supply plugin_fact_bag.it201.nyc_household_credit_amount when the default approximation is not sufficient.",
        nodeIds: ["ny.it201.line48"],
        ruleId: "NY.nyc_household_credit_mfs_review",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    fullYearFederalSummary?.deduction_strategy === "itemized" &&
    asNumber(formRecord?.itemized_deduction_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "New York itemized deductions use Form IT-196. This common path reused the federal itemized deduction total unless you supplied plugin_fact_bag.it201.itemized_deduction_amount.",
        nodeIds: ["ny.it201.line34"],
        ruleId: "NY.itemized_deduction_federal_base_used",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (isAllocatedReturn && line45IncomePercentage != null) {
    validationResults.push(
      buildValidationResult({
        message:
          "New York Form IT-203 applied the line 45 income percentage to the full-year base tax so part-year and nonresident tax follows the official allocated-tax flow instead of taxing apportioned income directly.",
        nodeIds: ["ny.it203.line44", "ny.it203.line45", "ny.it203.line46"],
        ruleId: "NY.it203.income_percentage_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (newYorkCityResidency.partYear) {
    validationResults.push(buildValidationResult({
      message:
        "Part-year New York City resident tax was computed using the IT-360.1 resident-period path. Supply plugin_fact_bag.it201.nyc_adjusted_gross_income_amount or nyc_itemized_deduction_amount to replace any remaining month-ratio proxy inputs.",
      nodeIds: ["ny.it201.line50"],
      ruleId: "NY.nyc_part_year_tax_computed",
      severity: "info",
      status: "pass",
    }));
  }

  if (newYorkCityResidency.partYear && partYearNewYorkCityTax?.usesIncomeProxy) {
    validationResults.push(buildValidationResult({
      message:
        "Part-year New York City adjusted gross income was not supplied explicitly, so the engine prorated New York adjusted gross income by resident months as a proxy for IT-360.1 Part 1 Column B.",
      nodeIds: ["ny.it201.line47", "ny.it201.line50"],
      ruleId: "NY.nyc_part_year_income_prorated",
      severity: "info",
      status: "pass",
    }));
  }

  if (newYorkCityResidency.partYear && partYearNewYorkCityTax?.usesItemizedDeductionProxy) {
    validationResults.push(
      buildValidationResult({
        message:
          "Part-year New York City itemized deductions were not supplied explicitly, so the engine prorated the selected New York deduction by resident months as a proxy for IT-360.1 Part 2.",
        nodeIds: ["ny.it201.line50"],
        ruleId: "NY.nyc_part_year_itemized_deduction_prorated",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    newYorkCityResidency.applies &&
    newYorkCityResidency.localReturn == null &&
    asBoolean(formRecord?.nyc_full_year_resident) !== true &&
    asBoolean(formRecord?.nyc_part_year_resident) !== true
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "New York City tax and credits were enabled without a local-return record. This module used plugin_fact_bag.it201 NYC residency flags only.",
        nodeIds: ["ny.it201.line47"],
        ruleId: "NY.nyc_residency_plugin_only",
        severity: "info",
      }),
    );
  }

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.ny.starting_point", "carryforward"),
      createStateEdge("bridge.ny.starting_point", "ny.it201.line38"),
      createStateEdge("ny.it201.line34", "ny.it201.line38"),
      createStateEdge("ny.it201.line36", "ny.it201.line38"),
      createStateEdge("ny.it201.line38", "ny.it201.line39"),
      ...(isAllocatedReturn
        ? [
            createStateEdge("ny.it201.line39", "ny.it203.line44"),
            createStateEdge("ny.it201.line40", "ny.it203.line44"),
            createStateEdge("ny.it201.line41", "ny.it203.line44"),
            createStateEdge("ny.it203.line44", "ny.it203.line46"),
            createStateEdge("ny.it203.line45", "ny.it203.line46"),
          ]
        : []),
      createStateEdge("ny.it201.line39", "ny.it201.line46"),
      createStateEdge("ny.it201.line46", "ny.summary.total_tax"),
      createStateEdge("ny.it201.line73", "ny.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New York adjusted gross income",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York adjusted gross income",
        lineCode: "line33",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.ny.starting_point",
        nodeType: "bridge",
        value: line33NewYorkAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New York additions total",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York additions",
        lineCode: "line23",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line23",
        nodeType: "calculation",
        value: line23Additions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New York subtractions total",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York subtractions",
        lineCode: "line31",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line31",
        nodeType: "calculation",
        value: line31Subtractions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New York standard or itemized deduction",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York deduction",
        lineCode: "line34",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line34",
        nodeType: "calculation",
        value: line34Deduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "$1,000 per dependent",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York dependent exemption amount",
        lineCode: "line36",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line36",
        nodeType: "calculation",
        value: line36DependentExemptionAmount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line33 - line34 - line36, 0)",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York taxable income",
        lineCode: "line38",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line38",
        nodeType: "calculation",
        value: line38TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New York State tax schedule and recapture worksheets",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York State tax",
        lineCode: "line39",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line39",
        nodeType: "calculation",
        value: line39StateTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New York household credit",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York State household credit",
        lineCode: "line40",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line40",
        nodeType: "calculation",
        value: line40StateHouseholdCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Resident credit for taxes paid to other jurisdictions",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York resident credit",
        lineCode: "line41",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line41",
        nodeType: "calculation",
        value: line41ResidentCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Other New York State nonrefundable credits",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "Other New York State nonrefundable credits",
        lineCode: "line42",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line42",
        nodeType: "calculation",
        value: line42OtherNonrefundableCredits,
      }),
      ...(isAllocatedReturn
        ? [
            createStateNode({
              formCode: primaryFormCode,
              formulaRef:
                "max(line39 - household_credit - child_and_dependent_care_credit - resident_credit, 0)",
              jurisdiction: NEW_YORK_STATE_CODE,
              label: "New York base tax before income percentage",
              lineCode: "line44",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "ny.it203.line44",
              nodeType: "calculation",
              value: line44BaseTax,
            }),
            createStateNode({
              dataType: "string",
              formCode: primaryFormCode,
              formulaRef: "round(new_york_state_amount / federal_amount, 4)",
              jurisdiction: NEW_YORK_STATE_CODE,
              label: "New York income percentage",
              lineCode: "line45",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "ny.it203.line45",
              nodeType: "calculation",
              value: line45IncomePercentage == null ? null : line45IncomePercentage.toFixed(4),
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "line44 * line45",
              jurisdiction: NEW_YORK_STATE_CODE,
              label: "Allocated New York State tax",
              lineCode: "line46",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "ny.it203.line46",
              nodeType: "calculation",
              value: line46AllocatedStateTax,
            }),
          ]
        : []),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Other New York State taxes",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "Net other New York State taxes",
        lineCode: "line45",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line45",
        nodeType: "calculation",
        value: line45NetOtherStateTaxes,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line39 - line40 - line41 - line42, 0)",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York State tax after credits",
        lineCode: "line46",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line46",
        nodeType: "calculation",
        value: line46StateTaxAfterCredits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: newYorkCityResidency.partYear
          ? "IT-360.1 line47 New York City taxable income"
          : "New York City taxable income worksheet",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York City taxable income",
        lineCode: "line47",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line47",
        nodeType: "calculation",
        value: line47NewYorkCityTaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New York City resident tax schedule",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York City resident tax",
        lineCode: "line47a",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line47a",
        nodeType: "calculation",
        value: line47aNewYorkCityResidentTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New York City household credit",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York City household credit",
        lineCode: "line48",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line48",
        nodeType: "calculation",
        value: line48NewYorkCityHouseholdCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: newYorkCityResidency.partYear
          ? "IT-360.1 line50 part-year New York City resident tax after credits"
          : "Part-year New York City resident tax override",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "Part-year New York City resident tax",
        lineCode: "line50",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line50",
        nodeType: "calculation",
        value: line50PartYearNewYorkCityTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Other New York City taxes",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "Other New York City taxes",
        lineCode: "line51",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line51",
        nodeType: "calculation",
        value: line51OtherNewYorkCityTaxes,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New York City school tax credit fixed amount",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York City school tax credit fixed amount",
        lineCode: "line69",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line69",
        nodeType: "calculation",
        value: line69NewYorkCitySchoolTaxCreditFixedAmount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New York City school tax credit rate reduction amount",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York City school tax credit rate reduction amount",
        lineCode: "line69a",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line69a",
        nodeType: "calculation",
        value: line69aNewYorkCitySchoolTaxCreditRateReduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "state_payments or canonical payment fallback + refundable credits",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York total payments",
        lineCode: "line73",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.it201.line73",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "it201 total tax summary",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York total tax summary",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.summary.total_tax",
        nodeType: "summary",
        value: summary.total_tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "it201 total payments summary",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York total payments summary",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.summary.total_payments",
        nodeType: "summary",
        value: summary.total_payments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(total_payments - total_tax, 0)",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York refund amount",
        lineCode: "summary.refund_amount",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.summary.refund_amount",
        nodeType: "summary",
        value: summary.refund_amount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(total_tax - total_payments, 0)",
        jurisdiction: NEW_YORK_STATE_CODE,
        label: "New York amount owed",
        lineCode: "summary.amount_owed",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ny.summary.amount_owed",
        nodeType: "summary",
        value: summary.amount_owed,
      }),
    ],
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
