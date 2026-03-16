import { asNumber } from "../../../helpers";
import type { CoreEngineStateReturn } from "../../../input";
import { deriveCombinedStateTaxedIncome } from "../../return-kind";
import { toWholeDollars } from "../../resident";

function roundNewYorkRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function resolveAllocatedNewYorkAdjustedGrossIncome(
  stateReturn: CoreEngineStateReturn,
  formRecord: Record<string, unknown> | undefined,
): number | null {
  const explicitAmount =
    asNumber(formRecord?.new_york_state_adjusted_gross_income_amount) ??
    asNumber(formRecord?.line31_new_york_state_amount);

  if (explicitAmount != null) {
    return toWholeDollars(explicitAmount);
  }

  return deriveCombinedStateTaxedIncome(stateReturn);
}

function calculateNewYorkIncomePercentage(args: {
  readonly federalAdjustedGrossIncome: number;
  readonly newYorkStateAdjustedGrossIncome: number | null;
}): number | null {
  if (args.newYorkStateAdjustedGrossIncome == null) {
    return null;
  }

  if (
    args.federalAdjustedGrossIncome <= 0 ||
    args.newYorkStateAdjustedGrossIncome <= 0
  ) {
    return 0;
  }

  return roundNewYorkRatio(
    args.newYorkStateAdjustedGrossIncome / args.federalAdjustedGrossIncome,
  );
}

function calculateAllocatedNewYorkTaxableIncome(
  fullYearTaxableIncome: number,
  incomePercentage: number | null,
): number | null {
  if (incomePercentage == null) {
    return null;
  }

  return toWholeDollars(fullYearTaxableIncome * incomePercentage);
}

export {
  calculateAllocatedNewYorkTaxableIncome,
  calculateNewYorkIncomePercentage,
  resolveAllocatedNewYorkAdjustedGrossIncome,
};
