import { asBoolean, asNumber } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import { deriveCombinedStateTaxedIncome } from "../return-kind";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countBlindTaxpayers,
  countDependentExemptions,
  countPersonalExemptions,
  countSeniorTaxpayers,
  createStateEdge,
  createStateNode,
  getStatePluginRecord,
  normalizeResidentFilingStatus,
  readNamedAmountArrayTotal,
  readPluginPaymentTotal,
  supportsAllocatedResidentComputation,
  sumStateAdditionAmounts,
  sumStateNonrefundableCredits,
  sumStateSubtractionAmounts,
  toWholeDollars,
} from "../resident";

const OREGON_STATE_CODE = "OR";
const OREGON_STATE_NAME = "Oregon";
const OREGON_FORM_RECORD_KEY = "or40";
const OREGON_EXEMPTION_CREDIT_AMOUNT = 256;
const OREGON_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 4_560,
  married_filing_jointly: 5_670,
  married_filing_separately: 2_835,
  qualifying_surviving_spouse: 5_670,
  single: 2_835,
} as const;
const OREGON_ADDITIONAL_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 1_200,
  married_filing_jointly: 1_000,
  married_filing_separately: 1_000,
  qualifying_surviving_spouse: 1_000,
  single: 1_200,
} as const;
const OREGON_EXEMPTION_PHASEOUT_THRESHOLD_BY_FILING_STATUS = {
  head_of_household: 200_000,
  married_filing_jointly: 200_000,
  married_filing_separately: 100_000,
  qualifying_surviving_spouse: 200_000,
  single: 100_000,
} as const;

type OregonFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

function roundOregonPercentage(args: {
  readonly federalIncomeAfterSubtractions: number;
  readonly oregonIncomeAfterSubtractions: number;
}): number {
  const federalAmount = args.federalIncomeAfterSubtractions;
  const oregonAmount = args.oregonIncomeAfterSubtractions;

  if (federalAmount === 0) {
    return oregonAmount > 0 ? 1 : 0;
  }

  if (federalAmount > 0 && oregonAmount <= 0) {
    return 0;
  }

  if (federalAmount < 0 && oregonAmount > 0) {
    return 1;
  }

  if (federalAmount < 0 && oregonAmount < 0) {
    const federalAbsoluteAmount = Math.abs(federalAmount);
    const oregonAbsoluteAmount = Math.abs(oregonAmount);

    if (oregonAbsoluteAmount <= federalAbsoluteAmount) {
      return 1;
    }

    return Math.round((federalAbsoluteAmount / oregonAbsoluteAmount) * 10_000) / 10_000;
  }

  return Math.min(
    Math.max(Math.round((oregonAmount / federalAmount) * 10_000) / 10_000, 0),
    1,
  );
}

function calculateOregonDeduction(args: {
  readonly filingStatus: OregonFilingStatus;
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): {
  readonly deduction: number;
  readonly usesItemizedDeduction: boolean;
} {
  const overrideAmount = asNumber(args.formRecord?.deduction_amount);

  if (overrideAmount != null) {
    return {
      deduction: toWholeDollars(overrideAmount),
      usesItemizedDeduction: asBoolean(args.formRecord?.use_itemized_deductions) === true,
    };
  }

  const additionalDeductionCount = countSeniorTaxpayers(args.input) + countBlindTaxpayers(args.input);
  const standardDeduction =
    OREGON_STANDARD_DEDUCTION_BY_FILING_STATUS[args.filingStatus] +
    additionalDeductionCount * OREGON_ADDITIONAL_DEDUCTION_BY_FILING_STATUS[args.filingStatus];
  const itemizedDeductionTotal = toWholeDollars(
    asNumber(args.formRecord?.itemized_deductions_total) ??
      (args.federalSummary?.deduction_strategy === "itemized"
        ? args.federalSummary.itemized_deduction_total
        : 0),
  );
  const useItemizedDeduction =
    asBoolean(args.formRecord?.use_itemized_deductions) === true ||
    (asBoolean(args.formRecord?.force_standard_deduction) !== true &&
      itemizedDeductionTotal > standardDeduction);

  return {
    deduction: useItemizedDeduction ? itemizedDeductionTotal : standardDeduction,
    usesItemizedDeduction: useItemizedDeduction,
  };
}

function calculateOregonFederalTaxSubtraction(args: {
  readonly adjustedGrossIncome: number;
  readonly filingStatus: OregonFilingStatus;
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly formRecord: Record<string, unknown> | undefined;
}): {
  readonly amount: number;
  readonly defaultedToZeroWithoutSource: boolean;
} {
  const overrideAmount = asNumber(args.formRecord?.federal_tax_subtraction_amount);

  if (overrideAmount != null) {
    return {
      amount: toWholeDollars(overrideAmount),
      defaultedToZeroWithoutSource: false,
    };
  }

  const federalTaxBaseInput =
    asNumber(args.formRecord?.federal_tax_liability_amount) ??
    args.federalSummary?.line16_regular_income_tax;
  const federalTaxBase = toWholeDollars(federalTaxBaseInput ?? 0);
  const cap = args.filingStatus === "married_filing_separately" ? 4_250 : 8_500;
  const threshold = OREGON_EXEMPTION_PHASEOUT_THRESHOLD_BY_FILING_STATUS[args.filingStatus];
  const cappedAmount = args.adjustedGrossIncome <= threshold ? Math.min(federalTaxBase, cap) : 0;

  return {
    amount: cappedAmount,
    defaultedToZeroWithoutSource: federalTaxBaseInput == null,
  };
}

function calculateOregonExemptionCredits(args: {
  readonly adjustedGrossIncome: number;
  readonly filingStatus: OregonFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const overrideAmount = asNumber(args.formRecord?.exemption_credit_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  if (args.adjustedGrossIncome > OREGON_EXEMPTION_PHASEOUT_THRESHOLD_BY_FILING_STATUS[args.filingStatus]) {
    return 0;
  }

  const exemptionCount =
    countPersonalExemptions(args.input, args.filingStatus) + countDependentExemptions(args.input);
  return exemptionCount * OREGON_EXEMPTION_CREDIT_AMOUNT;
}

function calculateOregonTax(taxableIncome: number, filingStatus: OregonFilingStatus): number {
  const thresholds =
    filingStatus === "married_filing_jointly" || filingStatus === "qualifying_surviving_spouse"
      ? { first: 8_100, second: 20_400, upper: 250_000 }
      : filingStatus === "head_of_household"
        ? { first: 4_300, second: 10_750, upper: 125_000 }
        : { first: 4_050, second: 10_200, upper: 125_000 };

  if (taxableIncome <= thresholds.first) {
    return toWholeDollars(taxableIncome * 0.0475);
  }

  if (taxableIncome <= thresholds.second) {
    return toWholeDollars(
      thresholds.first * 0.0475 + (taxableIncome - thresholds.first) * 0.0675,
    );
  }

  if (taxableIncome <= thresholds.upper) {
    return toWholeDollars(
      thresholds.first * 0.0475 +
        (thresholds.second - thresholds.first) * 0.0675 +
        (taxableIncome - thresholds.second) * 0.0875,
    );
  }

  return toWholeDollars(
    thresholds.first * 0.0475 +
      (thresholds.second - thresholds.first) * 0.0675 +
      (thresholds.upper - thresholds.second) * 0.0875 +
      (taxableIncome - thresholds.upper) * 0.099,
  );
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: OREGON_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const moduleId = args.manifest.plugin_manifest_id;
  const node = (
    nodeId: string,
    lineCode: string,
    label: string,
    formulaRef: string,
    value: boolean | number | string | null,
    nodeType: "bridge" | "calculation" | "summary" = "calculation",
  ) =>
    createStateNode({
      formCode: primaryFormCode,
      formulaRef,
      jurisdiction: OREGON_STATE_CODE,
      label,
      lineCode,
      moduleId,
      nodeId,
      nodeType,
      value,
    });
  const formRecord = getStatePluginRecord(args.stateReturn, OREGON_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalSummary = args.returnKindContext?.originalFederalSummary ?? args.federalSummary;
  const fullYearAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const additionTotal = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const subtractionTotal = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line7FederalAdjustedGrossIncome = Math.max(
    fullYearAdjustedGrossIncome +
      additionTotal -
      subtractionTotal,
    0,
  );
  const deduction = calculateOregonDeduction({
    filingStatus,
    federalSummary: fullYearFederalSummary,
    formRecord,
    input: args.input,
  });
  const federalTaxSubtraction = calculateOregonFederalTaxSubtraction({
    adjustedGrossIncome: line7FederalAdjustedGrossIncome,
    filingStatus,
    federalSummary: fullYearFederalSummary,
    formRecord,
  });
  const residentLine19TaxableIncome = Math.max(
    line7FederalAdjustedGrossIncome - deduction.deduction - federalTaxSubtraction.amount,
    0,
  );
  const residentLine22Tax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ?? calculateOregonTax(residentLine19TaxableIncome, filingStatus),
  );
  const residentLine27ExemptionCredits = calculateOregonExemptionCredits({
    adjustedGrossIncome: line7FederalAdjustedGrossIncome,
    filingStatus,
    formRecord,
    input: args.input,
  });
  const residentLine32NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );

  if (isAllocatedReturn) {
    const oregonIncomeAfterSubtractions = toWholeDollars(
      asNumber(formRecord?.oregon_income_after_subtractions_amount) ??
        deriveCombinedStateTaxedIncome(args.stateReturn) ??
        args.adjustedGrossIncome,
    );
    const federalIncomeAfterSubtractions =
      toWholeDollars(
        asNumber(formRecord?.federal_income_after_subtractions_amount) ??
          fullYearAdjustedGrossIncome,
      ) +
      sumStateAdditionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.additions)) -
      subtractionTotal;
    const oregonPercentage = roundOregonPercentage({
      federalIncomeAfterSubtractions,
      oregonIncomeAfterSubtractions,
    });
    const line39Deduction = deduction.deduction;
    const line40FederalTaxLiabilitySubtraction = federalTaxSubtraction.amount;
    const line41TotalModifications = toWholeDollars(
      asNumber(formRecord?.modifications_total) ?? 0,
    );
    const line51ExemptionCredit = toWholeDollars(
      residentLine27ExemptionCredits * oregonPercentage,
    );
    const line52StandardCredits = toWholeDollars(
      asNumber(formRecord?.standard_credits_amount) ?? residentLine32NonrefundableCredits,
    );
    const line49AdditionsToTax = toWholeDollars(
      (asNumber(formRecord?.interest_on_installment_sales) ?? 0) +
        (asNumber(formRecord?.tax_recaptures_total) ?? 0),
    );
    const line50TotalTaxBeforeCredits =
      args.returnKindContext?.returnKind === "part_year_resident"
        ? toWholeDollars(
            (asNumber(formRecord?.tax_amount) ?? calculateOregonTax(
              Math.max(
                federalIncomeAfterSubtractions -
                  line39Deduction -
                  line40FederalTaxLiabilitySubtraction -
                  line41TotalModifications,
                0,
              ),
              filingStatus,
            )) * oregonPercentage,
          ) + line49AdditionsToTax
        : toWholeDollars(
            asNumber(formRecord?.tax_amount) ??
              calculateOregonTax(
                Math.max(
                  oregonIncomeAfterSubtractions -
                    toWholeDollars(
                      (line39Deduction +
                        line40FederalTaxLiabilitySubtraction +
                        line41TotalModifications) *
                        oregonPercentage,
                    ) -
                    toWholeDollars(asNumber(formRecord?.modifications_not_multiplied_amount) ?? 0),
                  0,
                ),
                filingStatus,
              ),
          ) + line49AdditionsToTax;
    const apportionedTaxableIncome =
      args.returnKindContext?.returnKind === "part_year_resident"
        ? toWholeDollars(
            Math.max(
              federalIncomeAfterSubtractions -
                line39Deduction -
                line40FederalTaxLiabilitySubtraction -
                line41TotalModifications,
              0,
            ) * oregonPercentage,
          )
        : Math.max(
            oregonIncomeAfterSubtractions -
              toWholeDollars(
                (line39Deduction +
                  line40FederalTaxLiabilitySubtraction +
                  line41TotalModifications) * oregonPercentage,
              ) -
              toWholeDollars(asNumber(formRecord?.modifications_not_multiplied_amount) ?? 0),
            0,
          );
    const totalTax = Math.max(
      line50TotalTaxBeforeCredits - line51ExemptionCredit - line52StandardCredits,
      0,
    );
    const refundableCredits = toWholeDollars(
      readNamedAmountArrayTotal(formRecord?.refundable_credits),
    );
    const payments = calculateResidentStatePayments({
      additionalPaymentTotal: readPluginPaymentTotal(formRecord),
      input: args.input,
      refundableCreditsTotal: refundableCredits,
      stateCode: OREGON_STATE_CODE,
      stateReturn: args.stateReturn,
    });
    const summary = buildResidentStateSummary({
      amountOwed: Math.max(totalTax - payments.totalPayments, 0),
      startingPoint: oregonIncomeAfterSubtractions,
      stateReturn: args.stateReturn,
      taxableIncome: apportionedTaxableIncome,
      totalPayments: payments.totalPayments,
      totalTax,
    });
    const summaryWithAllocatedOverrides = {
      ...summary,
      adjusted_gross_income_or_starting_point: oregonIncomeAfterSubtractions,
      allocation_ratio: oregonPercentage,
    };
    const validationResults = [
      buildValidationResult({
        message:
          args.returnKindContext.returnKind === "part_year_resident"
            ? "Oregon OR-40-P tax was computed from full-year taxable income and reduced by the 2025 Oregon percentage."
            : "Oregon OR-40-N taxable income was computed from Oregon-source income after deductions and modifications multiplied by the 2025 Oregon percentage.",
        nodeIds:
          args.returnKindContext.returnKind === "part_year_resident"
            ? ["or.or40np.line35", "or.or40p.line43", "or.or40p.line45"]
            : ["or.or40np.line35", "or.or40n.line45", "or.or40n.line54"],
        ruleId:
          args.returnKindContext.returnKind === "part_year_resident"
            ? "OR.or40p_percentage_applied"
            : "OR.or40n_percentage_applied",
        severity: "info",
        status: "pass",
      }),
    ];

    if (
      residentLine32NonrefundableCredits > 0 &&
      asNumber(formRecord?.standard_credits_amount) == null
    ) {
      validationResults.push(
        buildValidationResult({
          message:
            "Oregon standard credits were not separated into Schedule OR-ASC-NP categories, so the engine used the aggregated nonrefundable credits amount as the standard-credit total. Supply plugin_fact_bag.or40.standard_credits_amount to override.",
          nodeIds: [
            args.returnKindContext.returnKind === "part_year_resident"
              ? "or.or40p.line52"
              : "or.or40n.line52",
          ],
          ruleId: "OR.standard_credits_override_recommended",
        }),
      );
    }

    return {
      edges: [
        createStateEdge("1040.line11", "bridge.or.starting_point", "carryforward"),
        createStateEdge("bridge.or.starting_point", "or.or40np.line34f"),
        createStateEdge("or.or40np.line34f", "or.or40np.line35"),
        createStateEdge("or.or40np.line34s", "or.or40np.line35"),
        createStateEdge(
          args.returnKindContext.returnKind === "part_year_resident"
            ? "or.or40p.line45"
            : "or.or40n.line54",
          "or.summary.total_tax",
        ),
        createStateEdge(
          args.returnKindContext.returnKind === "part_year_resident"
            ? "or.or40p.line60"
            : "or.or40n.line67",
          "or.summary.total_payments",
        ),
      ],
      nodes: [
        node("bridge.or.starting_point", "line7", "Oregon full-year federal adjusted gross income", "1040.line11 full-year federal adjusted gross income", fullYearAdjustedGrossIncome, "bridge"),
        node("or.or40np.line34f", "line34F", "Oregon federal column income after subtractions", "full-year income after Oregon additions and subtractions", federalIncomeAfterSubtractions),
        node("or.or40np.line34s", "line34S", "Oregon column income after subtractions", "Oregon-taxed income after additions and subtractions", oregonIncomeAfterSubtractions),
        node("or.or40np.line35", "line35", "Oregon percentage", "OR-17 Oregon percentage rules", oregonPercentage.toFixed(4)),
        ...(args.returnKindContext.returnKind === "part_year_resident"
          ? [
              node(
                "or.or40p.line43",
                "line43",
                "Oregon part-year taxable income",
                "max(line36 - line42, 0)",
                Math.max(
                  federalIncomeAfterSubtractions -
                    (line39Deduction +
                      line40FederalTaxLiabilitySubtraction +
                      line41TotalModifications),
                  0,
                ),
              ),
              node(
                "or.or40p.line45",
                "line45",
                "Oregon part-year income tax",
                "Oregon tax on full-year taxable income multiplied by line35",
                line50TotalTaxBeforeCredits - line49AdditionsToTax,
              ),
            ]
          : [
              node(
                "or.or40n.line43",
                "line43",
                "Oregon nonresident modifications not multiplied by percentage",
                "Schedule OR-ASC-NP section E modifications",
                toWholeDollars(asNumber(formRecord?.modifications_not_multiplied_amount) ?? 0),
              ),
              node("or.or40n.line45", "line45", "Oregon nonresident taxable income", "max(line36 - line44, 0)", apportionedTaxableIncome),
            ]),
        node(
          args.returnKindContext.returnKind === "part_year_resident" ? "or.or40p.line54" : "or.or40n.line54",
          "line54",
          "Oregon total tax",
          "tax after exemption and standard credits",
          totalTax,
          "summary",
        ),
        node(
          args.returnKindContext.returnKind === "part_year_resident" ? "or.or40p.line60" : "or.or40n.line67",
          args.returnKindContext.returnKind === "part_year_resident" ? "line60" : "line67",
          "Oregon total payments",
          "state payments plus refundable credits",
          payments.totalPayments,
          "summary",
        ),
        node("or.summary.taxable_income", "summary.taxable_income", "Oregon summary taxable income", args.returnKindContext.returnKind === "part_year_resident" ? "part-year Oregon taxable income proxy" : "OR-40-N line45", apportionedTaxableIncome, "summary"),
        node("or.summary.total_tax", "summary.total_tax", "Oregon summary total tax", args.returnKindContext.returnKind === "part_year_resident" ? "OR-40-P line54" : "OR-40-N line54", totalTax, "summary"),
        node("or.summary.total_payments", "summary.total_payments", "Oregon summary total payments", args.returnKindContext.returnKind === "part_year_resident" ? "OR-40-P payments line" : "OR-40-N payments line", payments.totalPayments, "summary"),
        node("or.summary.refund_amount", "summary.refund_amount", "Oregon refund amount", "max(total_payments - total_tax, 0)", summaryWithAllocatedOverrides.refund_amount, "summary"),
        node("or.summary.amount_owed", "summary.amount_owed", "Oregon amount owed", "max(total_tax - total_payments, 0)", summaryWithAllocatedOverrides.amount_owed, "summary"),
      ],
      summary: summaryWithAllocatedOverrides,
      validationResults,
    };
  }

  const line33TotalTax = Math.max(
    residentLine22Tax - residentLine27ExemptionCredits - residentLine32NonrefundableCredits,
    0,
  );
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: OREGON_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line33TotalTax - payments.totalPayments, 0),
    startingPoint: line7FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: residentLine19TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line33TotalTax,
  });

  const validationResults = [];

  if (federalTaxSubtraction.defaultedToZeroWithoutSource) {
    validationResults.push(
      buildValidationResult({
        message:
          "Oregon federal tax subtraction defaulted to zero because neither a federal summary nor an explicit Oregon federal tax liability or subtraction amount was supplied.",
        nodeIds: ["or.or40.line16"],
        ruleId: "OR.federal_tax_subtraction_default_zero",
      }),
    );
  }

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.or.starting_point", "carryforward"),
      createStateEdge("bridge.or.starting_point", "or.or40.line19"),
      createStateEdge("or.or40.line19", "or.or40.line22"),
      createStateEdge("or.or40.line22", "or.or40.line33"),
      createStateEdge("or.or40.line33", "or.summary.total_tax"),
      createStateEdge("or.or40.line40", "or.summary.total_payments"),
    ],
    nodes: [
      node("bridge.or.starting_point", "line7", "Oregon adjusted gross income", "1040.line11 plus Oregon additions minus Oregon subtractions", line7FederalAdjustedGrossIncome, "bridge"),
      node("or.or40.line11", "line11", "Oregon deduction", "Oregon standard deduction chart or federal itemized deduction common path", deduction.deduction),
      node("or.or40.line16", "line16", "Oregon federal tax subtraction", "Federal tax subtraction cap or override", federalTaxSubtraction.amount),
      node("or.or40.line19", "line19", "Oregon taxable income", "max(line7 - line11 - line16, 0)", residentLine19TaxableIncome),
      node("or.or40.line22", "line22", "Oregon income tax", "Oregon resident marginal tax rates or override", residentLine22Tax),
      node("or.or40.line27", "line27", "Oregon exemption credits", "$256 per Oregon exemption credit unless phased out or overridden", residentLine27ExemptionCredits),
      node("or.or40.line33", "line33", "Oregon total tax", "max(line22 - line27 - nonrefundable credits, 0)", line33TotalTax, "summary"),
      node("or.or40.line40", "line40", "Oregon total payments", "state_payments or canonical payment fallback + refundable credits", payments.totalPayments, "summary"),
      node("or.summary.taxable_income", "summary.taxable_income", "Oregon summary taxable income", "or40.line19", residentLine19TaxableIncome, "summary"),
      node("or.summary.total_tax", "summary.total_tax", "Oregon summary total tax", "or40.line33", line33TotalTax, "summary"),
      node("or.summary.total_payments", "summary.total_payments", "Oregon summary total payments", "or40.line40", payments.totalPayments, "summary"),
      node("or.summary.refund_amount", "summary.refund_amount", "Oregon refund amount", "max(line40 - line33, 0)", summary.refund_amount, "summary"),
      node("or.summary.amount_owed", "summary.amount_owed", "Oregon amount owed", "max(line33 - line40, 0)", summary.amount_owed, "summary"),
    ],
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
