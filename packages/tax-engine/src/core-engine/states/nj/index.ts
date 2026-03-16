import { asNumber, sumNamedAmounts } from "../../helpers";
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
  deriveCombinedStateTaxedIncome,
  deriveNonresidentStateSourceIncome,
  deriveResidentPeriodIncome,
} from "../return-kind";
import {
  calculateNewJerseyAutomaticIncomeSubtractions,
  calculateNewJerseyExemptionAmount,
  calculateNewJerseyPropertyTaxBenefit,
  calculateNewJerseyRefundableCredits,
  calculateNewJerseyRetirementExclusion,
  calculateNewJerseyTax,
} from "./computation";

const NEW_JERSEY_STATE_CODE = "NJ";
const NEW_JERSEY_STATE_NAME = "New Jersey";
const NEW_JERSEY_FORM_RECORD_KEY = "nj1040";

type NewJerseyResidencyRatios = {
  readonly nonresidentRatio: number;
  readonly residentRatio: number;
  readonly usedFallbackRatio: boolean;
};

function roundNewJerseyRatio(value: number): number {
  return Math.round(Math.max(Math.min(value, 1), 0) * 10_000) / 10_000;
}

function countInclusiveDays(startDate: string, endDate: string): number | null {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function calculateNewJerseyResidencyRatios(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateReturn: StateArtifactsArgs["stateReturn"];
}): NewJerseyResidencyRatios {
  if (args.stateReturn.return_kind === "resident") {
    return {
      nonresidentRatio: 0,
      residentRatio: 1,
      usedFallbackRatio: false,
    };
  }

  if (args.stateReturn.return_kind === "nonresident") {
    return {
      nonresidentRatio: 1,
      residentRatio: 0,
      usedFallbackRatio: false,
    };
  }

  const explicitDaysInState = asNumber(args.stateReturn.residency_determination?.days_in_state);
  const explicitDaysEverywhere = asNumber(args.stateReturn.residency_determination?.days_everywhere);

  if (
    explicitDaysInState != null &&
    explicitDaysEverywhere != null &&
    explicitDaysInState >= 0 &&
    explicitDaysEverywhere > 0
  ) {
    const residentRatio = roundNewJerseyRatio(explicitDaysInState / explicitDaysEverywhere);

    return {
      nonresidentRatio: roundNewJerseyRatio(1 - residentRatio),
      residentRatio,
      usedFallbackRatio: false,
    };
  }

  let residentDays = 0;
  let sawResidentPeriod = false;

  for (const period of args.stateReturn.residency_periods) {
    if (
      period.state_code !== args.stateReturn.state_code ||
      period.residency_type !== "resident" ||
      period.start_date == null ||
      period.end_date == null
    ) {
      continue;
    }

    const days = countInclusiveDays(period.start_date, period.end_date);

    if (days == null) {
      continue;
    }

    residentDays += days;
    sawResidentPeriod = true;
  }

  if (sawResidentPeriod && residentDays > 0) {
    const residentRatio = roundNewJerseyRatio(residentDays / 365);

    return {
      nonresidentRatio: roundNewJerseyRatio(1 - residentRatio),
      residentRatio,
      usedFallbackRatio: false,
    };
  }

  const residentIncome = asNumber(args.stateReturn.allocation_profile?.resident_period_income);
  const everywhereIncome = asNumber(args.stateReturn.allocation_profile?.everywhere_income);

  if (residentIncome != null && everywhereIncome != null && everywhereIncome > 0) {
    const residentRatio = roundNewJerseyRatio(residentIncome / everywhereIncome);

    return {
      nonresidentRatio: roundNewJerseyRatio(1 - residentRatio),
      residentRatio,
      usedFallbackRatio: true,
    };
  }

  return {
    nonresidentRatio: 0.5,
    residentRatio: 0.5,
    usedFallbackRatio: true,
  };
}

function prorateNewJerseyAmount(amount: number, ratio: number): number {
  return toWholeDollars(amount * ratio);
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: NEW_JERSEY_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, NEW_JERSEY_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const returnKind = args.returnKindContext?.returnKind ?? "resident";
  const fullYearAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const line27TotalIncome = Math.max(
    fullYearAdjustedGrossIncome +
      sumStateAdditionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.additions)) -
      toWholeDollars(
        sumNamedAmounts(args.stateReturn.subtractions) +
          readNamedAmountArrayTotal(formRecord?.subtractions) +
          calculateNewJerseyAutomaticIncomeSubtractions(args.input),
      ),
    0,
  );
  const retirementExclusion = calculateNewJerseyRetirementExclusion({
    filingStatus,
    formRecord,
    grossIncome: line27TotalIncome,
    input: args.input,
  });
  const line29NewJerseyGrossIncome = Math.max(
    line27TotalIncome - retirementExclusion.line28cTotalRetirementExclusion,
    0,
  );
  const line30ExemptionAmount = calculateNewJerseyExemptionAmount({
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line31To37cAdditionalDeductions = toWholeDollars(
    sumNamedAmounts(args.stateReturn.state_specific_deductions) +
      readNamedAmountArrayTotal(formRecord?.deductions) +
      (asNumber(formRecord?.medical_expense_deduction_amount) ?? 0) +
      (asNumber(formRecord?.alimony_deduction_amount) ?? 0) +
      (asNumber(formRecord?.conservation_deduction_amount) ?? 0) +
      (asNumber(formRecord?.health_enterprise_zone_deduction_amount) ?? 0) +
      (asNumber(formRecord?.alternative_business_calculation_adjustment_amount) ?? 0) +
      (asNumber(formRecord?.organ_donor_deduction_amount) ?? 0) +
      (asNumber(formRecord?.college_affordability_deduction_amount) ?? 0),
  );
  const line38TotalExemptionsAndDeductions = line30ExemptionAmount + line31To37cAdditionalDeductions;
  const line39TaxableIncome = Math.max(line29NewJerseyGrossIncome - line38TotalExemptionsAndDeductions, 0);
  const line44CreditForTaxesPaidToOtherJurisdictions = toWholeDollars(
    asNumber(formRecord?.other_jurisdiction_credit_amount) ??
      asNumber(formRecord?.other_state_credit_amount) ??
      0,
  );
  const fullYearLine49TotalCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) +
      (asNumber(formRecord?.sheltered_workshop_credit_amount) ?? 0) +
      (asNumber(formRecord?.gold_star_family_counseling_credit_amount) ?? 0) +
      (asNumber(formRecord?.organ_bone_marrow_donor_credit_amount) ?? 0),
  );
  const fullYearLine51UseTax = toWholeDollars(asNumber(formRecord?.use_tax_amount) ?? 0);
  const fullYearLine52EstimatedTaxInterest = toWholeDollars(
    asNumber(formRecord?.estimated_tax_interest_amount) ?? 0,
  );
  const fullYearLine53cSharedResponsibilityPayment = toWholeDollars(
    asNumber(formRecord?.shared_responsibility_payment_amount) ?? 0,
  );

  if (returnKind === "part_year_resident" || returnKind === "nonresident") {
    const residencyRatios = calculateNewJerseyResidencyRatios({
      formRecord,
      stateReturn: args.stateReturn,
    });
    const residentPeriodIncome = Math.max(
      toWholeDollars(
        returnKind === "part_year_resident"
          ? deriveResidentPeriodIncome(args.stateReturn) ??
              fullYearAdjustedGrossIncome * residencyRatios.residentRatio
          : 0,
      ),
      0,
    );
    const nonresidentSourceIncome = Math.max(
      toWholeDollars(
        returnKind === "nonresident"
          ? deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome
          : deriveNonresidentStateSourceIncome(args.stateReturn) ??
              Math.max((deriveCombinedStateTaxedIncome(args.stateReturn) ?? 0) - residentPeriodIncome, 0),
      ),
      0,
    );
    const residentPropertyTaxFormRecord =
      formRecord == null
        ? undefined
        : {
            ...formRecord,
            property_taxes_paid_amount:
              asNumber(formRecord.property_taxes_paid_amount) == null
                ? formRecord.property_taxes_paid_amount
                : prorateNewJerseyAmount(
                    asNumber(formRecord.property_taxes_paid_amount) ?? 0,
                    residencyRatios.residentRatio,
                  ),
            rent_paid_amount:
              asNumber(formRecord.rent_paid_amount) == null
                ? formRecord.rent_paid_amount
                : prorateNewJerseyAmount(
                    asNumber(formRecord.rent_paid_amount) ?? 0,
                    residencyRatios.residentRatio,
                  ),
          };
    const residentLine28cRetirementExclusion =
      returnKind === "part_year_resident"
        ? prorateNewJerseyAmount(
            retirementExclusion.line28cTotalRetirementExclusion,
            residencyRatios.residentRatio,
          )
        : 0;
    const residentLine29GrossIncome = Math.max(
      residentPeriodIncome - residentLine28cRetirementExclusion,
      0,
    );
    const residentLine30ExemptionAmount =
      returnKind === "part_year_resident"
        ? prorateNewJerseyAmount(line30ExemptionAmount, residencyRatios.residentRatio)
        : 0;
    const residentLine37cAdditionalDeductions =
      returnKind === "part_year_resident"
        ? prorateNewJerseyAmount(
            line31To37cAdditionalDeductions,
            residencyRatios.residentRatio,
          )
        : 0;
    const residentLine38TotalExemptionsAndDeductions =
      residentLine30ExemptionAmount + residentLine37cAdditionalDeductions;
    const residentLine39TaxableIncome = Math.max(
      residentLine29GrossIncome - residentLine38TotalExemptionsAndDeductions,
      0,
    );
    const residentLine44CreditForTaxesPaidToOtherJurisdictions =
      returnKind === "part_year_resident"
        ? prorateNewJerseyAmount(
            line44CreditForTaxesPaidToOtherJurisdictions,
            residencyRatios.residentRatio,
          )
        : 0;
    const residentPropertyTaxBenefit =
      returnKind === "part_year_resident"
        ? calculateNewJerseyPropertyTaxBenefit({
            filingStatus,
            formRecord: residentPropertyTaxFormRecord,
            line39TaxableIncome: residentLine39TaxableIncome,
            otherStateCreditAmount: residentLine44CreditForTaxesPaidToOtherJurisdictions,
          })
        : {
            line40aPropertyTaxesPaid: 0,
            line41PropertyTaxDeduction: 0,
            line56PropertyTaxCredit: 0,
            usedPropertyTaxCredit: false,
          };
    const residentLine42TaxableIncome = Math.max(
      residentLine39TaxableIncome - residentPropertyTaxBenefit.line41PropertyTaxDeduction,
      0,
    );
    const residentLine43Tax =
      returnKind === "part_year_resident"
        ? toWholeDollars(calculateNewJerseyTax(residentLine42TaxableIncome, filingStatus))
        : 0;
    const residentLine49TotalCredits =
      returnKind === "part_year_resident"
        ? prorateNewJerseyAmount(fullYearLine49TotalCredits, residencyRatios.residentRatio)
        : 0;
    const residentLine50BalanceOfTaxAfterCredits = Math.max(
      residentLine43Tax -
        residentLine44CreditForTaxesPaidToOtherJurisdictions -
        residentLine49TotalCredits,
      0,
    );
    const residentAdditionalTaxes =
      returnKind === "part_year_resident"
        ? prorateNewJerseyAmount(
            fullYearLine51UseTax +
              fullYearLine52EstimatedTaxInterest +
              fullYearLine53cSharedResponsibilityPayment,
            residencyRatios.residentRatio,
          )
        : 0;
    const residentLine54TotalTaxDue =
      residentLine50BalanceOfTaxAfterCredits + residentAdditionalTaxes;
    const residentRefundableCredits =
      returnKind === "part_year_resident"
        ? prorateNewJerseyAmount(
            calculateNewJerseyRefundableCredits({
              federalSummary: args.returnKindContext?.originalFederalSummary ?? args.federalSummary,
              filingStatus,
              formRecord,
              input: args.input,
              line42TaxableIncome: residentLine42TaxableIncome,
              line56PropertyTaxCredit: residentPropertyTaxBenefit.line56PropertyTaxCredit,
            }),
            residencyRatios.residentRatio,
          )
        : 0;
    const nonresidentLine28cRetirementExclusion = Math.max(
      toWholeDollars(asNumber(formRecord?.nonresident_retirement_exclusion_amount) ?? 0),
      0,
    );
    const nonresidentLine29aIncomeFromEverywhere = Math.max(
      line27TotalIncome -
        prorateNewJerseyAmount(
          retirementExclusion.line28cTotalRetirementExclusion,
          residencyRatios.nonresidentRatio,
        ),
      0,
    );
    const nonresidentLine29bNewJerseySourceIncome = Math.max(
      nonresidentSourceIncome - nonresidentLine28cRetirementExclusion,
      0,
    );
    const nonresidentLine30ExemptionAmount = prorateNewJerseyAmount(
      line30ExemptionAmount,
      residencyRatios.nonresidentRatio,
    );
    const nonresidentLine37cAdditionalDeductions = prorateNewJerseyAmount(
      line31To37cAdditionalDeductions,
      residencyRatios.nonresidentRatio,
    );
    const nonresidentLine38TotalExemptionsAndDeductions =
      nonresidentLine30ExemptionAmount + nonresidentLine37cAdditionalDeductions;
    const nonresidentLine39aTaxableIncome = Math.max(
      nonresidentLine29aIncomeFromEverywhere - nonresidentLine38TotalExemptionsAndDeductions,
      0,
    );
    const nonresidentLine39bTaxableIncome = Math.max(
      nonresidentLine29bNewJerseySourceIncome - nonresidentLine38TotalExemptionsAndDeductions,
      0,
    );
    const nonresidentLine40Tax = toWholeDollars(
      calculateNewJerseyTax(nonresidentLine39aTaxableIncome, filingStatus),
    );
    const nonresidentLine41IncomePercentage =
      nonresidentLine39aTaxableIncome > 0 && nonresidentLine39bTaxableIncome > 0
        ? roundNewJerseyRatio(
            nonresidentLine39bTaxableIncome / nonresidentLine39aTaxableIncome,
          )
        : 0;
    const nonresidentLine42Tax = toWholeDollars(
      nonresidentLine40Tax * nonresidentLine41IncomePercentage,
    );
    const nonresidentLine49TotalCredits =
      returnKind === "nonresident"
        ? fullYearLine49TotalCredits
        : prorateNewJerseyAmount(fullYearLine49TotalCredits, residencyRatios.nonresidentRatio);
    const nonresidentLine50BalanceOfTaxAfterCredits = Math.max(
      nonresidentLine42Tax - nonresidentLine49TotalCredits,
      0,
    );
    const nonresidentAdditionalTaxes =
      returnKind === "nonresident"
        ? fullYearLine51UseTax +
          fullYearLine52EstimatedTaxInterest +
          fullYearLine53cSharedResponsibilityPayment
        : prorateNewJerseyAmount(
            fullYearLine51UseTax +
              fullYearLine52EstimatedTaxInterest +
              fullYearLine53cSharedResponsibilityPayment,
            residencyRatios.nonresidentRatio,
          );
    const nonresidentLine54TotalTaxDue =
      nonresidentLine50BalanceOfTaxAfterCredits + nonresidentAdditionalTaxes;
    const explicitRefundableCredits = toWholeDollars(
      readNamedAmountArrayTotal(formRecord?.refundable_credits),
    );
    const payments = calculateResidentStatePayments({
      additionalPaymentTotal: readPluginPaymentTotal(formRecord),
      input: args.input,
      refundableCreditsTotal: explicitRefundableCredits + residentRefundableCredits,
      stateCode: NEW_JERSEY_STATE_CODE,
      stateReturn: args.stateReturn,
    });
    const totalTaxDue =
      returnKind === "nonresident"
        ? nonresidentLine54TotalTaxDue
        : residentLine54TotalTaxDue + nonresidentLine54TotalTaxDue;
    const totalStartingPoint =
      returnKind === "nonresident"
        ? nonresidentSourceIncome
        : residentPeriodIncome + nonresidentSourceIncome;
    const totalTaxableIncome =
      returnKind === "nonresident"
        ? nonresidentLine39bTaxableIncome
        : residentLine42TaxableIncome + nonresidentLine39bTaxableIncome;
    const summary = buildResidentStateSummary({
      amountOwed: Math.max(totalTaxDue - payments.totalPayments, 0),
      startingPoint: totalStartingPoint,
      stateReturn: args.stateReturn,
      taxableIncome: totalTaxableIncome,
      totalPayments: payments.totalPayments,
      totalTax: totalTaxDue,
    });
    const summaryWithAllocatedOverrides = {
      ...summary,
      adjusted_gross_income_or_starting_point: totalStartingPoint,
      allocation_ratio:
        fullYearAdjustedGrossIncome > 0
          ? roundNewJerseyRatio(totalStartingPoint / fullYearAdjustedGrossIncome)
          : summary.allocation_ratio ?? null,
      resident_taxable_income:
        returnKind === "part_year_resident" ? residentLine42TaxableIncome : null,
      nonresident_source_income:
        returnKind === "nonresident"
          ? nonresidentLine39bTaxableIncome
          : nonresidentLine39bTaxableIncome,
    };
    const validationResults = [];

    validationResults.push(
      buildValidationResult({
        message:
          returnKind === "part_year_resident"
            ? "New Jersey part-year resident tax was computed by combining a prorated resident-period NJ-1040 path with a prorated NJ-1040NR nonresident path for New Jersey-source income earned during the nonresident period."
            : "New Jersey NJ-1040NR tax was computed by taxing full-year taxable income and applying the official income-percentage allocation to New Jersey-source taxable income.",
        nodeIds:
          returnKind === "part_year_resident"
            ? ["nj.nj1040py.line42", "nj.nj1040nr.line41", "nj.nj1040nr.line42"]
            : ["nj.nj1040nr.line39a", "nj.nj1040nr.line41", "nj.nj1040nr.line42"],
        ruleId:
          returnKind === "part_year_resident"
            ? "NJ.part_year_dual_return_aggregation_applied"
            : "NJ.nj1040nr_income_percentage_applied",
        severity: "info",
        status: "pass",
      }),
    );

    if (residencyRatios.usedFallbackRatio) {
      validationResults.push(
        buildValidationResult({
          message:
            "New Jersey resident and nonresident month ratios were not supplied explicitly, so the engine fell back to the state allocation profile or a 50/50 default for part-year proration.",
          nodeIds: ["bridge.nj.starting_point", "nj.nj1040nr.line41"],
          ruleId: "NJ.part_year_ratio_fallback_used",
          severity: "info",
          status: "pass",
        }),
      );
    }

    if (
      retirementExclusion.missingSingleSpouseAllocationOverride &&
      asNumber(formRecord?.pension_exclusion_amount) == null
    ) {
      validationResults.push(
        buildValidationResult({
          message:
            "New Jersey pension exclusion on this joint return assumed the full retirement distribution belonged to the single qualifying senior or blind spouse because no spouse-level allocation input was supplied.",
          nodeIds: ["nj.nj1040py.line28c", "nj.nj1040nr.line29a"],
          ruleId: "NJ.retirement_exclusion_joint_allocation_review",
          severity: "info",
          status: "pass",
        }),
      );
    }

    return {
      edges: [
        createStateEdge("1040.line11", "bridge.nj.starting_point", "carryforward"),
        ...(returnKind === "part_year_resident"
          ? [
              createStateEdge("bridge.nj.starting_point", "nj.nj1040py.line42"),
              createStateEdge("nj.nj1040py.line42", "nj.summary.total_tax"),
            ]
          : []),
        createStateEdge("bridge.nj.starting_point", "nj.nj1040nr.line39b"),
        createStateEdge("nj.nj1040nr.line39a", "nj.nj1040nr.line41"),
        createStateEdge("nj.nj1040nr.line39b", "nj.nj1040nr.line41"),
        createStateEdge("nj.nj1040nr.line41", "nj.nj1040nr.line42"),
        createStateEdge("nj.nj1040nr.line42", "nj.summary.total_tax"),
        createStateEdge("nj.nj1040.line66", "nj.summary.total_payments"),
      ],
      nodes: [
        createStateNode({
          formCode: primaryFormCode,
          formulaRef:
            returnKind === "part_year_resident"
              ? "Resident-period New Jersey income plus nonresident-period New Jersey-source income"
              : "New Jersey-source income for NJ-1040NR",
          jurisdiction: NEW_JERSEY_STATE_CODE,
          label:
            returnKind === "part_year_resident"
              ? "Combined New Jersey taxed income"
              : "New Jersey-source income",
          lineCode: "start",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "bridge.nj.starting_point",
          nodeType: "bridge",
          value: totalStartingPoint,
        }),
        ...(returnKind === "part_year_resident"
          ? [
              createStateNode({
                formCode: primaryFormCode,
                formulaRef: "Resident-period income less prorated exclusions and deductions",
                jurisdiction: NEW_JERSEY_STATE_CODE,
                label: "New Jersey resident-period taxable income",
                lineCode: "line42",
                moduleId: args.manifest.plugin_manifest_id,
                nodeId: "nj.nj1040py.line42",
                nodeType: "calculation",
                value: residentLine42TaxableIncome,
              }),
              createStateNode({
                dataType: "string",
                formCode: primaryFormCode,
                formulaRef: "Resident days or resident-period income proxy divided by full-year period",
                jurisdiction: NEW_JERSEY_STATE_CODE,
                label: "New Jersey resident-period proration ratio",
                lineCode: "ratio.resident",
                moduleId: args.manifest.plugin_manifest_id,
                nodeId: "nj.nj1040py.ratio.resident",
                nodeType: "calculation",
                value: residencyRatios.residentRatio.toFixed(4),
              }),
            ]
          : []),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "New Jersey gross income from everywhere for NJ-1040NR",
          jurisdiction: NEW_JERSEY_STATE_CODE,
          label: "New Jersey NJ-1040NR income from everywhere",
          lineCode: "line29a",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "nj.nj1040nr.line29a",
          nodeType: "calculation",
          value: nonresidentLine29aIncomeFromEverywhere,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "New Jersey-source gross income for NJ-1040NR",
          jurisdiction: NEW_JERSEY_STATE_CODE,
          label: "New Jersey NJ-1040NR New Jersey-source income",
          lineCode: "line29b",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "nj.nj1040nr.line29b",
          nodeType: "calculation",
          value: nonresidentLine29bNewJerseySourceIncome,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "NJ-1040NR taxable income from everywhere after prorated deductions",
          jurisdiction: NEW_JERSEY_STATE_CODE,
          label: "New Jersey NJ-1040NR taxable income from everywhere",
          lineCode: "line39a",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "nj.nj1040nr.line39a",
          nodeType: "calculation",
          value: nonresidentLine39aTaxableIncome,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "NJ-1040NR New Jersey-source taxable income after prorated deductions",
          jurisdiction: NEW_JERSEY_STATE_CODE,
          label: "New Jersey NJ-1040NR New Jersey-source taxable income",
          lineCode: "line39b",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "nj.nj1040nr.line39b",
          nodeType: "calculation",
          value: nonresidentLine39bTaxableIncome,
        }),
        createStateNode({
          dataType: "string",
          formCode: primaryFormCode,
          formulaRef: "line39b / line39a",
          jurisdiction: NEW_JERSEY_STATE_CODE,
          label: "New Jersey NJ-1040NR income percentage",
          lineCode: "line41",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "nj.nj1040nr.line41",
          nodeType: "calculation",
          value: nonresidentLine41IncomePercentage.toFixed(4),
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "NJ-1040NR line40 tax multiplied by line41 income percentage",
          jurisdiction: NEW_JERSEY_STATE_CODE,
          label: "New Jersey NJ-1040NR allocated tax",
          lineCode: "line42",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "nj.nj1040nr.line42",
          nodeType: "calculation",
          value: nonresidentLine42Tax,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "State payments and refundable credits",
          jurisdiction: NEW_JERSEY_STATE_CODE,
          label: "New Jersey total payments",
          lineCode: "line66",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "nj.nj1040.line66",
          nodeType: "summary",
          value: payments.totalPayments,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef:
            returnKind === "part_year_resident"
              ? "Combined NJ-1040 resident-period tax and NJ-1040NR allocated tax"
              : "NJ-1040NR total tax due",
          jurisdiction: NEW_JERSEY_STATE_CODE,
          label: "New Jersey total tax summary",
          lineCode: "summary.total_tax",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "nj.summary.total_tax",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.total_tax,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Combined New Jersey taxable income base used for summary reporting",
          jurisdiction: NEW_JERSEY_STATE_CODE,
          label: "New Jersey summary taxable income",
          lineCode: "summary.taxable_income",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "nj.summary.taxable_income",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.taxable_income,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "nj1040 line66",
          jurisdiction: NEW_JERSEY_STATE_CODE,
          label: "New Jersey total payments summary",
          lineCode: "summary.total_payments",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "nj.summary.total_payments",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.total_payments,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "max(total_payments - total_tax, 0)",
          jurisdiction: NEW_JERSEY_STATE_CODE,
          label: "New Jersey refund amount",
          lineCode: "summary.refund_amount",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "nj.summary.refund_amount",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.refund_amount,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "max(total_tax - total_payments, 0)",
          jurisdiction: NEW_JERSEY_STATE_CODE,
          label: "New Jersey amount owed",
          lineCode: "summary.amount_owed",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "nj.summary.amount_owed",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.amount_owed,
        }),
      ],
      summary: summaryWithAllocatedOverrides,
      validationResults,
    };
  }

  const propertyTaxBenefit = calculateNewJerseyPropertyTaxBenefit({
    filingStatus,
    formRecord,
    line39TaxableIncome,
    otherStateCreditAmount: line44CreditForTaxesPaidToOtherJurisdictions,
  });
  const line42NewJerseyTaxableIncome = Math.max(
    line39TaxableIncome - propertyTaxBenefit.line41PropertyTaxDeduction,
    0,
  );
  const line43Tax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ??
      calculateNewJerseyTax(line42NewJerseyTaxableIncome, filingStatus),
  );
  const line45BalanceOfTax = Math.max(
    line43Tax - line44CreditForTaxesPaidToOtherJurisdictions,
    0,
  );
  const line49TotalCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) +
      (asNumber(formRecord?.sheltered_workshop_credit_amount) ?? 0) +
      (asNumber(formRecord?.gold_star_family_counseling_credit_amount) ?? 0) +
      (asNumber(formRecord?.organ_bone_marrow_donor_credit_amount) ?? 0),
  );
  const line50BalanceOfTaxAfterCredits = Math.max(line45BalanceOfTax - line49TotalCredits, 0);
  const line51UseTax = toWholeDollars(asNumber(formRecord?.use_tax_amount) ?? 0);
  const line52EstimatedTaxInterest = toWholeDollars(
    asNumber(formRecord?.estimated_tax_interest_amount) ?? 0,
  );
  const line53cSharedResponsibilityPayment = toWholeDollars(
    asNumber(formRecord?.shared_responsibility_payment_amount) ?? 0,
  );
  const line54TotalTaxDue =
    line50BalanceOfTaxAfterCredits +
    line51UseTax +
    line52EstimatedTaxInterest +
    line53cSharedResponsibilityPayment;
  const refundableCredits = calculateNewJerseyRefundableCredits({
    federalSummary: args.federalSummary,
    filingStatus,
    formRecord,
    input: args.input,
    line42TaxableIncome: line42NewJerseyTaxableIncome,
    line56PropertyTaxCredit: propertyTaxBenefit.line56PropertyTaxCredit,
  });
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: NEW_JERSEY_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line54TotalTaxDue - payments.totalPayments, 0),
    startingPoint: line29NewJerseyGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line42NewJerseyTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line54TotalTaxDue,
  });

  const validationResults = [];

  if (
    retirementExclusion.missingSingleSpouseAllocationOverride &&
    asNumber(formRecord?.pension_exclusion_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "New Jersey pension exclusion on this joint return assumed the full retirement distribution belonged to the single qualifying senior or blind spouse because no spouse-level allocation input was supplied.",
        nodeIds: ["nj.nj1040.line28a"],
        ruleId: "NJ.retirement_exclusion_joint_allocation_review",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    line44CreditForTaxesPaidToOtherJurisdictions > 0 &&
    propertyTaxBenefit.line40aPropertyTaxesPaid > 0 &&
    asNumber(formRecord?.property_tax_credit_amount) == null &&
    asNumber(formRecord?.property_taxes_paid_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "New Jersey property tax benefit defaulted to the property tax deduction because the return also claimed a credit for taxes paid to another jurisdiction and no alternate Worksheet I result was supplied.",
        nodeIds: ["nj.nj1040.line41", "nj.nj1040.line56"],
        ruleId: "NJ.property_tax_benefit_defaulted_to_deduction",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    propertyTaxBenefit.line40aPropertyTaxesPaid === 0 &&
    asNumber(formRecord?.rent_paid_amount) == null &&
    asNumber(formRecord?.property_taxes_paid_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "New Jersey property tax benefit was not claimed because neither homeowner property taxes nor renter-paid rent was supplied on this path.",
        nodeIds: ["nj.nj1040.line40a"],
        ruleId: "NJ.property_tax_benefit_not_claimed",
        severity: "info",
        status: "pass",
      }),
    );
  }

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.nj.starting_point", "carryforward"),
      createStateEdge("bridge.nj.starting_point", "nj.nj1040.line39"),
      createStateEdge("nj.nj1040.line39", "nj.nj1040.line42"),
      createStateEdge("nj.nj1040.line42", "nj.nj1040.line43"),
      createStateEdge("nj.nj1040.line43", "nj.nj1040.line54"),
      createStateEdge("nj.nj1040.line66", "nj.summary.total_payments"),
      createStateEdge("nj.nj1040.line54", "nj.summary.total_tax"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Jersey gross income after retirement exclusions",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey gross income",
        lineCode: "line29",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.nj.starting_point",
        nodeType: "bridge",
        value: line29NewJerseyGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Jersey total income",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey total income",
        lineCode: "line27",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line27",
        nodeType: "calculation",
        value: line27TotalIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Jersey pension and retirement exclusion",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey pension exclusion",
        lineCode: "line28a",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line28a",
        nodeType: "calculation",
        value: retirementExclusion.line28aPensionExclusion,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Jersey other retirement income exclusion",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey other retirement income exclusion",
        lineCode: "line28b",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line28b",
        nodeType: "calculation",
        value: retirementExclusion.line28bOtherRetirementIncomeExclusion,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Total retirement exclusion amount",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey total retirement exclusion",
        lineCode: "line28c",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line28c",
        nodeType: "calculation",
        value: retirementExclusion.line28cTotalRetirementExclusion,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Total exemptions",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey exemption amount",
        lineCode: "line30",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line30",
        nodeType: "calculation",
        value: line30ExemptionAmount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Additional New Jersey deductions",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey additional deductions",
        lineCode: "line37c",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line37c",
        nodeType: "calculation",
        value: line31To37cAdditionalDeductions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Total exemptions and deductions",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey total exemptions and deductions",
        lineCode: "line38",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line38",
        nodeType: "calculation",
        value: line38TotalExemptionsAndDeductions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "line29 - line38",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey taxable income before property tax deduction",
        lineCode: "line39",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line39",
        nodeType: "calculation",
        value: line39TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Property taxes or 18% of rent paid",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey property taxes paid",
        lineCode: "line40a",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line40a",
        nodeType: "calculation",
        value: propertyTaxBenefit.line40aPropertyTaxesPaid,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Jersey property tax deduction",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey property tax deduction",
        lineCode: "line41",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line41",
        nodeType: "calculation",
        value: propertyTaxBenefit.line41PropertyTaxDeduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "line39 - line41",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey taxable income",
        lineCode: "line42",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line42",
        nodeType: "calculation",
        value: line42NewJerseyTaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Jersey tax schedule",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey tax",
        lineCode: "line43",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line43",
        nodeType: "calculation",
        value: line43Tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Credit for taxes paid to other jurisdictions",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey other-jurisdiction credit",
        lineCode: "line44",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line44",
        nodeType: "calculation",
        value: line44CreditForTaxesPaidToOtherJurisdictions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "line43 - line44",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey balance of tax",
        lineCode: "line45",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line45",
        nodeType: "calculation",
        value: line45BalanceOfTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Jersey nonrefundable credits",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey total credits",
        lineCode: "line49",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line49",
        nodeType: "calculation",
        value: line49TotalCredits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Balance of tax after credits",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey balance of tax after credits",
        lineCode: "line50",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line50",
        nodeType: "calculation",
        value: line50BalanceOfTaxAfterCredits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Use tax due",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey use tax",
        lineCode: "line51",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line51",
        nodeType: "calculation",
        value: line51UseTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Estimated tax interest",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey estimated tax interest",
        lineCode: "line52",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line52",
        nodeType: "calculation",
        value: line52EstimatedTaxInterest,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Shared responsibility payment",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey shared responsibility payment",
        lineCode: "line53c",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line53c",
        nodeType: "calculation",
        value: line53cSharedResponsibilityPayment,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Total New Jersey tax due",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey total tax due",
        lineCode: "line54",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line54",
        nodeType: "summary",
        value: line54TotalTaxDue,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Property tax credit",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey property tax credit",
        lineCode: "line56",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line56",
        nodeType: "calculation",
        value: propertyTaxBenefit.line56PropertyTaxCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "State payments and refundable credits",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey total payments",
        lineCode: "line66",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.nj1040.line66",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "nj1040 total tax summary",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey total tax summary",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.summary.total_tax",
        nodeType: "summary",
        value: summary.total_tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "nj1040 total payments summary",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey total payments summary",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.summary.total_payments",
        nodeType: "summary",
        value: summary.total_payments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(total_payments - total_tax, 0)",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey refund amount",
        lineCode: "summary.refund_amount",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.summary.refund_amount",
        nodeType: "summary",
        value: summary.refund_amount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(total_tax - total_payments, 0)",
        jurisdiction: NEW_JERSEY_STATE_CODE,
        label: "New Jersey amount owed",
        lineCode: "summary.amount_owed",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nj.summary.amount_owed",
        nodeType: "summary",
        value: summary.amount_owed,
      }),
    ],
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
