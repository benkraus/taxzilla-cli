import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  getAgeOnLastDayOfTaxYear,
  parseIsoDate,
} from "../../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
import {
  deriveAllocationRatio,
  deriveCombinedStateTaxedIncome,
} from "../../return-kind";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countDependentExemptions,
  countPersonalExemptions,
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
} from "../../resident";

const VIRGINIA_STATE_CODE = "VA";
const VIRGINIA_STATE_NAME = "Virginia";
const VIRGINIA_FORM_RECORD_KEY = "form760";
const VIRGINIA_PERSONAL_EXEMPTION_AMOUNT = 930;
const VIRGINIA_AGE_OR_BLIND_EXEMPTION_AMOUNT = 800;
const VIRGINIA_FULL_AGE_DEDUCTION = 12_000;
const VIRGINIA_SINGLE_AGE_DEDUCTION_THRESHOLD = 50_000;
const VIRGINIA_MARRIED_AGE_DEDUCTION_THRESHOLD = 75_000;

function roundVirginiaPercentage(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function calculateVirginiaTax(taxableIncome: number): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  if (taxableIncome <= 3_000) {
    return toWholeDollars(taxableIncome * 0.02);
  }

  if (taxableIncome <= 5_000) {
    return toWholeDollars(60 + (taxableIncome - 3_000) * 0.03);
  }

  if (taxableIncome <= 17_000) {
    return toWholeDollars(120 + (taxableIncome - 5_000) * 0.05);
  }

  return toWholeDollars(720 + (taxableIncome - 17_000) * 0.0575);
}

function isVirginiaCombinedSeparateReturn(stateFilingStatus: string | undefined): boolean {
  if (!stateFilingStatus) {
    return false;
  }

  const normalized = stateFilingStatus.trim().toLowerCase();

  return normalized === "4" || normalized.includes("combined");
}

function countVirginiaAgeOrBlindExemptions(
  args: StateArtifactsArgs,
  filingStatus: ReturnType<typeof normalizeResidentFilingStatus>,
): number {
  const people = [
    args.input.household.taxpayer,
    filingStatus === "married_filing_jointly" || filingStatus === "qualifying_surviving_spouse"
      ? args.input.household.spouse
      : undefined,
  ];
  let total = 0;

  for (const person of people) {
    if (person == null) {
      continue;
    }

    const age = getAgeOnLastDayOfTaxYear(
      asString(asRecord(person)?.date_of_birth),
      args.input.tax_year,
    );
    const seniorFlag = age != null && age >= 65 ? 1 : 0;
    const blindFlag = asBoolean(asRecord(person)?.is_blind) === true ? 1 : 0;
    total += seniorFlag + blindFlag;
  }

  return total;
}

function countVirginiaResidentDays(args: StateArtifactsArgs): number | null {
  const explicitDaysInState = args.stateReturn.residency_determination?.days_in_state;
  const explicitDaysEverywhere = args.stateReturn.residency_determination?.days_everywhere;

  if (
    typeof explicitDaysInState === "number" &&
    explicitDaysInState >= 0 &&
    typeof explicitDaysEverywhere === "number" &&
    explicitDaysEverywhere > 0
  ) {
    return Math.min(explicitDaysInState, explicitDaysEverywhere);
  }

  let residentDays = 0;

  for (const period of args.stateReturn.residency_periods) {
    if (
      period.state_code !== VIRGINIA_STATE_CODE ||
      period.residency_type.toLowerCase() !== "resident"
    ) {
      continue;
    }

    const start = parseIsoDate(period.start_date);
    const end = parseIsoDate(period.end_date);

    if (!start || !end) {
      continue;
    }

    const clampedStart = start < new Date(Date.UTC(args.input.tax_year, 0, 1))
      ? new Date(Date.UTC(args.input.tax_year, 0, 1))
      : start;
    const clampedEnd = end > new Date(Date.UTC(args.input.tax_year, 11, 31))
      ? new Date(Date.UTC(args.input.tax_year, 11, 31))
      : end;

    if (clampedEnd < clampedStart) {
      continue;
    }

    residentDays += Math.floor((clampedEnd.getTime() - clampedStart.getTime()) / 86_400_000) + 1;
  }

  return residentDays > 0 ? residentDays : null;
}

function getVirginiaExemptionProrationRatio(args: StateArtifactsArgs): number | null {
  if (args.returnKindContext?.returnKind !== "part_year_resident") {
    return null;
  }

  const daysEverywhere = args.stateReturn.residency_determination?.days_everywhere ?? 365;
  const residentDays = countVirginiaResidentDays(args);

  if (residentDays == null || daysEverywhere <= 0) {
    return null;
  }

  return roundVirginiaPercentage(residentDays / daysEverywhere);
}

function calculateVirginiaAgeDeduction(args: {
  readonly additions: number;
  readonly federalAdjustedGrossIncome: number;
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const explicitAmount = asNumber(args.formRecord?.age_deduction_amount);

  if (explicitAmount != null) {
    return toWholeDollars(explicitAmount);
  }

  const people: Array<Record<string, unknown> | undefined> = [
    asRecord(args.input.household.taxpayer) ?? undefined,
    args.filingStatus === "married_filing_jointly" ||
    args.filingStatus === "qualifying_surviving_spouse" ||
    args.filingStatus === "married_filing_separately"
      ? (asRecord(args.input.household.spouse) ?? undefined)
      : undefined,
  ];
  const taxableSocialSecurityBenefits = toWholeDollars(
    args.federalSummary?.line6b_taxable_social_security_benefits ?? 0,
  );
  const adjustedFederalAdjustedGrossIncome: number = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.adjusted_federal_adjusted_gross_income_amount) ??
        (args.federalAdjustedGrossIncome + args.additions - taxableSocialSecurityBenefits),
    ),
    0,
  );
  const combinedAdjustedFederalAdjustedGrossIncome: number = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.combined_adjusted_federal_adjusted_gross_income_amount) ??
        asNumber(args.formRecord?.spouse_adjusted_federal_adjusted_gross_income_amount) ??
        adjustedFederalAdjustedGrossIncome,
    ),
    0,
  );
  const incomeBasedThreshold =
    args.filingStatus === "single" || args.filingStatus === "head_of_household"
      ? VIRGINIA_SINGLE_AGE_DEDUCTION_THRESHOLD
      : VIRGINIA_MARRIED_AGE_DEDUCTION_THRESHOLD;
  const reductionBase: number =
    args.filingStatus === "married_filing_separately"
      ? combinedAdjustedFederalAdjustedGrossIncome
      : adjustedFederalAdjustedGrossIncome;
  const incomeBasedDeduction: number = Math.max(
    VIRGINIA_FULL_AGE_DEDUCTION - Math.max(reductionBase - incomeBasedThreshold, 0),
    0,
  );

  return people.reduce<number>((total, person) => {
    if (person == null) {
      return total;
    }

    const dateOfBirth = asString(asRecord(person)?.date_of_birth);

    if (dateOfBirth == null || dateOfBirth.length === 0) {
      return total;
    }

    const age = getAgeOnLastDayOfTaxYear(dateOfBirth, args.input.tax_year);

    if (age == null || age < 65) {
      return total;
    }

    if (dateOfBirth <= "1939-01-01") {
      return total + VIRGINIA_FULL_AGE_DEDUCTION;
    }

    if (dateOfBirth > "1961-01-01") {
      return total;
    }

    return total + incomeBasedDeduction;
  }, 0);
}

function calculateVirginiaOtherStateCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
  readonly virginiaTaxBeforeCredits: number;
  readonly virginiaTaxableIncome: number;
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.tax_paid_to_other_state_credit) ??
    asNumber(args.formRecord?.other_state_credit_amount);

  if (explicitCredit != null) {
    return Math.max(toWholeDollars(explicitCredit), 0);
  }

  if (
    args.stateArtifactsArgs.stateReturn.return_kind === "nonresident" ||
    args.virginiaTaxBeforeCredits <= 0 ||
    args.virginiaTaxableIncome <= 0
  ) {
    return 0;
  }

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter(
        (claim) => claim.resident_state_code === VIRGINIA_STATE_CODE && claim.income_amount > 0,
      )
      .reduce((total, claim) => {
        const virginiaLimitation = toWholeDollars(
          args.virginiaTaxBeforeCredits *
            Math.max(Math.min(claim.income_amount / args.virginiaTaxableIncome, 1), 0),
        );
        const creditableTax = claim.creditable_tax ?? claim.tax_paid;

        return total + Math.min(creditableTax, virginiaLimitation);
      }, 0),
  );
}

function hasPotentialVirginiaOtherStateCreditInputs(args: StateArtifactsArgs): boolean {
  const stateFacts = args.input.facts.state;

  if (stateFacts == null) {
    return false;
  }

  if (
    stateFacts.other_state_tax_credit_claims.some(
      (claim) => claim.resident_state_code === VIRGINIA_STATE_CODE,
    )
  ) {
    return true;
  }

  if (
    stateFacts.withholding.some(
      (entry) =>
        entry.jurisdiction_level === "state" &&
        entry.state_code !== "" &&
        entry.state_code !== VIRGINIA_STATE_CODE &&
        entry.amount > 0,
    )
  ) {
    return true;
  }

  return stateFacts.income_sourcing.some(
    (entry) =>
      entry.state_code !== "" &&
      entry.state_code !== VIRGINIA_STATE_CODE &&
      Math.max(
        entry.resident_period_amount ?? 0,
        entry.state_source_amount ?? 0,
        entry.total_amount,
      ) > 0,
  );
}

function calculateVirginiaDeduction(args: {
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): {
  readonly line10ItemizedDeduction: number;
  readonly line11StandardDeduction: number;
} {
  const line10ItemizedDeduction = toWholeDollars(
    asNumber(args.formRecord?.itemized_deductions_total) ??
      (args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized"
        ? args.stateArtifactsArgs.federalSummary.itemized_deduction_total
        : 0),
  );
  const line11StandardDeduction =
    asNumber(args.formRecord?.standard_deduction_amount) ??
    (args.filingStatus === "married_filing_jointly" ||
    args.filingStatus === "qualifying_surviving_spouse"
      ? 17_500
      : 8_750);

  if (args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized") {
    return {
      line10ItemizedDeduction,
      line11StandardDeduction: 0,
    };
  }

  return {
    line10ItemizedDeduction: 0,
    line11StandardDeduction: toWholeDollars(line11StandardDeduction),
  };
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: VIRGINIA_STATE_NAME,
    });
  }

  if (isVirginiaCombinedSeparateReturn(args.stateReturn.state_filing_status)) {
    return buildResidentUnsupportedArtifacts(args, {
      reasonNodeId: "bridge.va.starting_point",
      startingPointStrategy: "custom",
      stateName: VIRGINIA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, VIRGINIA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isPartYearResident = args.returnKindContext?.returnKind === "part_year_resident";
  const isNonresident = args.returnKindContext?.returnKind === "nonresident";
  const isAllocatedReturn = isPartYearResident || isNonresident;
  const fullYearFederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const virginiaTaxedIncome = isAllocatedReturn
    ? toWholeDollars(deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome)
    : fullYearFederalAdjustedGrossIncome;
  const allocationRatio =
    deriveAllocationRatio(args.stateReturn) ??
    (isAllocatedReturn && fullYearFederalAdjustedGrossIncome > 0
      ? virginiaTaxedIncome / fullYearFederalAdjustedGrossIncome
      : null);
  const line1FederalAdjustedGrossIncome = fullYearFederalAdjustedGrossIncome;
  const line2Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line10And11Deduction = calculateVirginiaDeduction({
    filingStatus,
    formRecord,
    stateArtifactsArgs:
      fullYearFederalAdjustedGrossIncome === args.adjustedGrossIncome
        ? args
        : {
            ...args,
            adjustedGrossIncome: fullYearFederalAdjustedGrossIncome,
            federalSummary: args.returnKindContext?.originalFederalSummary ?? args.federalSummary,
          },
  });
  const line7AgeDeduction = calculateVirginiaAgeDeduction({
    additions: line2Additions,
    federalAdjustedGrossIncome: line1FederalAdjustedGrossIncome,
    federalSummary: args.federalSummary,
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line7Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions) +
      line7AgeDeduction,
  );
  const line9AdjustedGrossIncomeAfterSubtractions = Math.max(line1FederalAdjustedGrossIncome + line2Additions - line7Subtractions, 0);
  const baseExemptionAmount = toWholeDollars(
    asNumber(formRecord?.exemption_amount) ??
      (countPersonalExemptions(args.input, filingStatus) + countDependentExemptions(args.input)) *
        VIRGINIA_PERSONAL_EXEMPTION_AMOUNT +
      countVirginiaAgeOrBlindExemptions(args, filingStatus) * VIRGINIA_AGE_OR_BLIND_EXEMPTION_AMOUNT,
  );
  const partYearAllocatedAdditions = isPartYearResident
    ? toWholeDollars(
        asNumber(formRecord?.schedule_of_income_additions_total) ??
          line2Additions * Math.max(allocationRatio ?? 0, 0),
      )
    : line2Additions;
  const partYearAllocatedSubtractions = isPartYearResident
    ? toWholeDollars(
        asNumber(formRecord?.schedule_of_income_subtractions_total) ??
          line7Subtractions * Math.max(allocationRatio ?? 0, 0),
      )
    : line7Subtractions;
  const allocatedAdditions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.schedule_of_income_additions_total) ??
          line2Additions * Math.max(allocationRatio ?? 0, 0),
      )
    : line2Additions;
  const allocatedSubtractions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.schedule_of_income_subtractions_total) ??
          line7Subtractions * Math.max(allocationRatio ?? 0, 0),
      )
    : line7Subtractions;
  const line7IncomeOutsideVirginia = isPartYearResident
    ? Math.max(
        line1FederalAdjustedGrossIncome -
          toWholeDollars(asNumber(formRecord?.virginia_taxed_income_amount) ?? virginiaTaxedIncome),
        0,
      )
    : 0;
  const partYearExemptionProrationRatio = getVirginiaExemptionProrationRatio(args);
  const partYearStandardDeductionRatio =
    isPartYearResident && line1FederalAdjustedGrossIncome > 0 && virginiaTaxedIncome > 0
      ? roundVirginiaPercentage(virginiaTaxedIncome / line1FederalAdjustedGrossIncome)
      : null;
  const partYearItemizedDeduction = isPartYearResident
    ? toWholeDollars(
        line10And11Deduction.line10ItemizedDeduction *
          Math.max(partYearStandardDeductionRatio ?? 0, 0),
      )
    : line10And11Deduction.line10ItemizedDeduction;
  const partYearStandardDeduction = isPartYearResident
    ? toWholeDollars(
        line10And11Deduction.line11StandardDeduction *
          Math.max(partYearStandardDeductionRatio ?? 0, 0),
      )
    : line10And11Deduction.line11StandardDeduction;
  const line12Exemptions = isPartYearResident
    ? toWholeDollars(
        baseExemptionAmount * Math.max(partYearExemptionProrationRatio ?? 0, 0),
      )
    : baseExemptionAmount;
  const partYearLine9VirginiaAdjustedGrossIncome = isPartYearResident
    ? Math.max(
        line1FederalAdjustedGrossIncome -
          line7IncomeOutsideVirginia +
          partYearAllocatedAdditions -
          partYearAllocatedSubtractions,
        0,
      )
    : line9AdjustedGrossIncomeAfterSubtractions;
  const line15VirginiaTaxableIncome = Math.max(
    (isPartYearResident ? partYearLine9VirginiaAdjustedGrossIncome : line9AdjustedGrossIncomeAfterSubtractions) -
      partYearItemizedDeduction -
      partYearStandardDeduction -
      line12Exemptions,
    0,
  );
  const line16Tax = isNonresident
    ? roundVirginiaPercentage(
        Math.max(virginiaTaxedIncome + allocatedAdditions - allocatedSubtractions, 0) /
          Math.max(line9AdjustedGrossIncomeAfterSubtractions, 1),
      )
    : asNumber(formRecord?.income_tax_amount) ?? calculateVirginiaTax(line15VirginiaTaxableIncome);
  const line17NonresidentTaxableIncome = isNonresident
    ? toWholeDollars(line15VirginiaTaxableIncome * line16Tax)
    : null;
  const line18NonresidentTax = isNonresident
    ? toWholeDollars(
        asNumber(formRecord?.income_tax_amount) ??
          calculateVirginiaTax(line17NonresidentTaxableIncome ?? 0),
      )
    : null;
  const line17OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const otherStateCredit = calculateVirginiaOtherStateCredit({
    formRecord,
    stateArtifactsArgs: args,
    virginiaTaxBeforeCredits: isNonresident ? line18NonresidentTax ?? 0 : (line16Tax as number),
    virginiaTaxableIncome: isNonresident
      ? line17NonresidentTaxableIncome ?? 0
      : line15VirginiaTaxableIncome,
  });
  const line24NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) + otherStateCredit,
  );
  const line28TotalTax = Math.max(
    (isNonresident ? line18NonresidentTax ?? 0 : (line16Tax as number)) +
      line17OtherTaxes -
      line24NonrefundableCredits,
    0,
  );
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: VIRGINIA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line28TotalTax - payments.totalPayments, 0),
    startingPoint: isAllocatedReturn
      ? isPartYearResident
        ? partYearLine9VirginiaAdjustedGrossIncome
        : line17NonresidentTaxableIncome ?? line1FederalAdjustedGrossIncome
      : line1FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: isNonresident ? line17NonresidentTaxableIncome ?? 0 : line15VirginiaTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line28TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point: isPartYearResident
          ? partYearLine9VirginiaAdjustedGrossIncome
          : line17NonresidentTaxableIncome ?? summary.adjusted_gross_income_or_starting_point,
        allocation_ratio:
          (isPartYearResident ? partYearStandardDeductionRatio : line16Tax) ??
          summary.allocation_ratio ??
          null,
      }
    : summary;

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Virginia whole-dollar rules",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia Form 760 federal adjusted gross income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.va.starting_point",
      nodeType: "bridge",
      value: line1FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.form760.additions",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia additions",
      lineCode: "line2",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "va.form760.line2",
      nodeType: "calculation",
      value: line2Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.form760.subtractions + age deduction override",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia subtractions",
      lineCode: "line7",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "va.form760.line7",
      nodeType: "calculation",
      value: line7Subtractions,
    }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line1 + line2 - line7, 0)",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia adjusted gross income",
      lineCode: "line9",
      moduleId: args.manifest.plugin_manifest_id,
        nodeId: "va.form760.line9",
        nodeType: "calculation",
        value: isPartYearResident ? partYearLine9VirginiaAdjustedGrossIncome : line9AdjustedGrossIncomeAfterSubtractions,
      }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Virginia Schedule A itemized deductions",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia itemized deductions",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
        nodeId: "va.form760.line10",
        nodeType: "calculation",
      value: partYearItemizedDeduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Virginia standard deduction",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia standard deduction",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "va.form760.line11",
      nodeType: "calculation",
      value: partYearStandardDeduction,
    }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "$930 personal/dependent exemptions plus $800 age-or-blind exemptions or override",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia exemptions",
      lineCode: "line12",
      moduleId: args.manifest.plugin_manifest_id,
        nodeId: "va.form760.line12",
        nodeType: "calculation",
      value: line12Exemptions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: isNonresident
        ? "full-year resident taxable income before Form 763 percentage"
        : "max(line9 - line10 - line11 - line12, 0)",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia taxable income",
      lineCode: "line15",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "va.form760.line15",
      nodeType: "calculation",
      value: line15VirginiaTaxableIncome,
    }),
      createStateNode({
        formCode: primaryFormCode,
      formulaRef: isNonresident
        ? "Virginia Form 763 line 16 nonresident percentage"
        : "Virginia tax table or tax rate schedule common path",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: isNonresident ? "Virginia nonresident percentage" : "Virginia income tax",
      lineCode: "line16",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "va.form760.line16",
      nodeType: "calculation",
      value: isNonresident ? (line16Tax as number).toFixed(4) : line16Tax,
    }),
    ...(isNonresident
      ? [
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Virginia Form 763 line 15 * line 16",
            jurisdiction: VIRGINIA_STATE_CODE,
            label: "Virginia nonresident taxable income",
            lineCode: "line17",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "va.form763.line17",
            nodeType: "calculation",
            value: line17NonresidentTaxableIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Virginia Form 763 tax on line 17",
            jurisdiction: VIRGINIA_STATE_CODE,
            label: "Virginia nonresident income tax",
            lineCode: "line18",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "va.form763.line18",
            nodeType: "calculation",
            value: line18NonresidentTax,
          }),
        ]
      : []),
    ...(isPartYearResident
      ? [
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Virginia Form 760PY line 7 income attributable to period outside Virginia",
            jurisdiction: VIRGINIA_STATE_CODE,
            label: "Virginia part-year income outside Virginia",
            lineCode: "line7_outside_va",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "va.form760py.line7",
            nodeType: "calculation",
            value: line7IncomeOutsideVirginia,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Virginia Form 760PY standard deduction proration ratio",
            jurisdiction: VIRGINIA_STATE_CODE,
            label: "Virginia part-year deduction ratio",
            lineCode: "worksheet.standard_deduction_ratio",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "va.form760py.standard_deduction_ratio",
            nodeType: "calculation",
            value: partYearStandardDeductionRatio?.toFixed(4) ?? "0.0000",
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Virginia Form 760PY exemption proration ratio",
            jurisdiction: VIRGINIA_STATE_CODE,
            label: "Virginia part-year exemption ratio",
            lineCode: "worksheet.exemption_ratio",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "va.form760py.exemption_ratio",
            nodeType: "calculation",
            value: partYearExemptionProrationRatio?.toFixed(4) ?? "0.0000",
          }),
        ]
      : []),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line16 + line17 - line24, 0)",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia total tax",
      lineCode: "line28",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "va.form760.line28",
      nodeType: "summary",
      value: line28TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia total payments",
      lineCode: "line31",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "va.form760.line31",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "form760.line15",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
        nodeId: "va.summary.taxable_income",
        nodeType: "summary",
      value: isNonresident ? line17NonresidentTaxableIncome ?? 0 : line15VirginiaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form760.line28",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "va.summary.total_tax",
      nodeType: "summary",
      value: line28TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form760.line31",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "va.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line31 - line28, 0)",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
        nodeId: "va.summary.refund_amount",
        nodeType: "summary",
      value: summaryWithAllocatedOverrides.refund_amount,
    }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line28 - line31, 0)",
      jurisdiction: VIRGINIA_STATE_CODE,
      label: "Virginia amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
        nodeId: "va.summary.amount_owed",
        nodeType: "summary",
      value: summaryWithAllocatedOverrides.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.va.starting_point", "carryforward"),
    createStateEdge("bridge.va.starting_point", "va.form760.line9"),
    createStateEdge("va.form760.line2", "va.form760.line9"),
    createStateEdge("va.form760.line7", "va.form760.line9"),
    createStateEdge("va.form760.line9", "va.form760.line15"),
    createStateEdge("va.form760.line10", "va.form760.line15"),
    createStateEdge("va.form760.line11", "va.form760.line15"),
    createStateEdge("va.form760.line12", "va.form760.line15"),
    ...(isNonresident
      ? [
          createStateEdge("va.form760.line16", "va.form763.line17"),
          createStateEdge("va.form760.line15", "va.form763.line17"),
          createStateEdge("va.form763.line17", "va.form763.line18"),
          createStateEdge("va.form763.line18", "va.form760.line28"),
        ]
      : [createStateEdge("va.form760.line16", "va.form760.line28")]),
    createStateEdge("va.form760.line28", "va.summary.total_tax"),
    createStateEdge("va.form760.line31", "va.summary.total_payments"),
  ];

  const validationResults: StateArtifactsResult["validationResults"] = [];

  if (line7AgeDeduction > 0) {
    validationResults.push(
      buildValidationResult({
        message:
          "Virginia age deduction was computed using the TY2025 age-deduction thresholds and adjusted federal adjusted gross income rules.",
        nodeIds: ["va.form760.line7", "va.form760.line12"],
        ruleId: "VA.age_deduction_computed",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    otherStateCredit === 0 &&
    hasPotentialVirginiaOtherStateCreditInputs(args) &&
    !args.stateReturn.state_specific_credits.some(
      (credit) => asString(credit.description)?.toLowerCase().includes("other state"),
    )
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Virginia credit for tax paid to another state stayed at zero because no Schedule OSC style claim amount was supplied for the available multistate facts.",
        nodeIds: ["va.form760.line28"],
        ruleId: "VA.other_state_credit_review",
        severity: "info",
      }),
    );
  }

  if (isNonresident) {
    validationResults.push(
      buildValidationResult({
        message:
          "Virginia Form 763 nonresident taxable income was computed by applying the nonresident percentage to full-year resident taxable income, then taxing the apportioned amount.",
        nodeIds: ["va.form760.line15", "va.form760.line16", "va.form763.line17", "va.form763.line18"],
        ruleId: "VA.form763_nonresident_percentage_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (isPartYearResident) {
    validationResults.push(
      buildValidationResult({
        message:
          "Virginia Form 760PY part-year income, deduction, and exemption proration were applied using Virginia-source income and part-year residency ratios.",
        nodeIds: [
          "va.form760py.line7",
          "va.form760py.standard_deduction_ratio",
          "va.form760py.exemption_ratio",
          "va.form760.line15",
        ],
        ruleId: "VA.form760py_proration_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  return {
    edges,
    nodes,
    summary: summaryWithAllocatedOverrides,
    validationResults,
  };
}

export { buildStateArtifacts };
