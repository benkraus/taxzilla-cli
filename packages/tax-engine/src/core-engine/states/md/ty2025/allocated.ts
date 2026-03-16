import type { CoreEngineStateReturn } from "../../../input";
import {
  deriveCombinedStateTaxedIncome,
  deriveNonresidentStateSourceIncome,
  deriveResidentPeriodIncome,
} from "../../return-kind";
import { toWholeDollars } from "../../resident";
import {
  calculateMarylandLocalTax,
  type MarylandFilingStatus,
  type MarylandLocalTaxResult,
} from "./local-tax";

type MarylandAllocatedReturnComputation = {
  readonly combinedMarylandAdjustedGrossIncome: number;
  readonly combinedTaxableNetIncome: number;
  readonly line9IncomeFactor: number;
  readonly nonresidentTaxFactor: number;
  readonly nonresidentTaxableNetIncome: number;
  readonly partYearResidentTaxableNetIncome: number;
  readonly residentLocalTaxResult: MarylandLocalTaxResult | null;
  readonly stateTaxBeforeCredits: number;
  readonly totalLocalTax: number;
  readonly totalTax: number;
};

const MARYLAND_NONRESIDENT_LOCAL_TAX_RATE = 0.0225;

function roundMarylandFactor(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function calculateMarylandIncomeFactor(
  marylandAdjustedGrossIncome: number,
  federalAdjustedGrossIncome: number,
): number {
  if (marylandAdjustedGrossIncome <= 0 || federalAdjustedGrossIncome <= 0) {
    return 0;
  }

  return Math.max(roundMarylandFactor(marylandAdjustedGrossIncome / federalAdjustedGrossIncome), 0);
}

function prorateMarylandAmount(amount: number, factor: number): number {
  return toWholeDollars(amount * factor);
}

function calculateMarylandTaxableNetIncome(args: {
  readonly adjustedGrossIncome: number;
  readonly federalAdjustedGrossIncome: number;
  readonly fullYearDeduction: number;
  readonly fullYearExemptions: number;
}): {
  readonly incomeFactor: number;
  readonly proratedDeduction: number;
  readonly proratedExemptions: number;
  readonly taxableNetIncome: number;
} {
  const incomeFactor = calculateMarylandIncomeFactor(
    args.adjustedGrossIncome,
    args.federalAdjustedGrossIncome,
  );
  const proratedDeduction = prorateMarylandAmount(args.fullYearDeduction, incomeFactor);
  const proratedExemptions = prorateMarylandAmount(args.fullYearExemptions, incomeFactor);

  return {
    incomeFactor,
    proratedDeduction,
    proratedExemptions,
    taxableNetIncome: Math.max(
      args.adjustedGrossIncome - proratedDeduction - proratedExemptions,
      0,
    ),
  };
}

function calculateMarylandAllocatedReturn(args: {
  readonly calculateStateTax: (taxableIncome: number, filingStatus: MarylandFilingStatus) => number;
  readonly filingStatus: MarylandFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly fullYearAdjustedGrossIncome: number;
  readonly fullYearDeduction: number;
  readonly fullYearExemptions: number;
  readonly fullYearStateTax: number;
  readonly fullYearTaxableNetIncome: number;
  readonly input: Parameters<typeof calculateMarylandLocalTax>[0]["input"];
  readonly line21bCapitalGainAdditionalTax: number;
  readonly line24NonrefundableCredits: number;
  readonly stateReturn: CoreEngineStateReturn;
}): MarylandAllocatedReturnComputation {
  const combinedMarylandAdjustedGrossIncome = deriveCombinedStateTaxedIncome(args.stateReturn) ?? 0;
  const residentPeriodAdjustedGrossIncome =
    args.stateReturn.return_kind === "part_year_resident"
      ? deriveResidentPeriodIncome(args.stateReturn) ??
        (combinedMarylandAdjustedGrossIncome -
          (deriveNonresidentStateSourceIncome(args.stateReturn) ?? 0))
      : 0;
  const nonresidentAdjustedGrossIncome =
    args.stateReturn.return_kind === "nonresident"
      ? combinedMarylandAdjustedGrossIncome
      : deriveNonresidentStateSourceIncome(args.stateReturn) ?? 0;

  const combinedTaxableNetIncomeResult = calculateMarylandTaxableNetIncome({
    adjustedGrossIncome: combinedMarylandAdjustedGrossIncome,
    federalAdjustedGrossIncome: args.fullYearAdjustedGrossIncome,
    fullYearDeduction: args.fullYearDeduction,
    fullYearExemptions: args.fullYearExemptions,
  });
  const residentTaxableNetIncomeResult = calculateMarylandTaxableNetIncome({
    adjustedGrossIncome: residentPeriodAdjustedGrossIncome,
    federalAdjustedGrossIncome: args.fullYearAdjustedGrossIncome,
    fullYearDeduction: args.fullYearDeduction,
    fullYearExemptions: args.fullYearExemptions,
  });
  const nonresidentTaxableNetIncomeResult = calculateMarylandTaxableNetIncome({
    adjustedGrossIncome: nonresidentAdjustedGrossIncome,
    federalAdjustedGrossIncome: args.fullYearAdjustedGrossIncome,
    fullYearDeduction: args.fullYearDeduction,
    fullYearExemptions: args.fullYearExemptions,
  });

  const partYearResidentStateTax =
    args.stateReturn.return_kind === "part_year_resident"
      ? args.calculateStateTax(
          residentTaxableNetIncomeResult.taxableNetIncome,
          args.filingStatus,
        )
      : 0;
  const partYearResidentCapitalGainAdditionalTax =
    args.stateReturn.return_kind === "part_year_resident" &&
    args.fullYearTaxableNetIncome > 0
      ? prorateMarylandAmount(
          args.line21bCapitalGainAdditionalTax,
          residentTaxableNetIncomeResult.taxableNetIncome / args.fullYearTaxableNetIncome,
        )
      : 0;
  const residentLocalTaxResult =
    args.stateReturn.return_kind === "part_year_resident" &&
    residentTaxableNetIncomeResult.taxableNetIncome > 0
      ? calculateMarylandLocalTax({
          filingStatus: args.filingStatus,
          input: args.input,
          formRecord: args.formRecord,
          stateReturn: args.stateReturn,
          taxableIncome: residentTaxableNetIncomeResult.taxableNetIncome,
        })
      : null;
  const partYearResidentLocalTax = residentLocalTaxResult?.amount ?? 0;

  const nonresidentTaxFactor =
    nonresidentTaxableNetIncomeResult.taxableNetIncome > 0 && args.fullYearTaxableNetIncome > 0
      ? roundMarylandFactor(
          nonresidentTaxableNetIncomeResult.taxableNetIncome / args.fullYearTaxableNetIncome,
        )
      : 0;
  const nonresidentStateTax =
    nonresidentTaxFactor > 0
      ? prorateMarylandAmount(args.fullYearStateTax, nonresidentTaxFactor)
      : 0;
  const nonresidentCapitalGainAdditionalTax =
    nonresidentTaxFactor > 0
      ? prorateMarylandAmount(args.line21bCapitalGainAdditionalTax, nonresidentTaxFactor)
      : 0;
  const nonresidentLocalTax = prorateMarylandAmount(
    nonresidentTaxableNetIncomeResult.taxableNetIncome,
    MARYLAND_NONRESIDENT_LOCAL_TAX_RATE,
  );

  const stateTaxBeforeCredits =
    partYearResidentStateTax +
    partYearResidentCapitalGainAdditionalTax +
    nonresidentStateTax +
    nonresidentCapitalGainAdditionalTax;
  const totalLocalTax = partYearResidentLocalTax + nonresidentLocalTax;
  const totalTax = Math.max(stateTaxBeforeCredits - args.line24NonrefundableCredits, 0) + totalLocalTax;

  return {
    combinedMarylandAdjustedGrossIncome,
    combinedTaxableNetIncome: combinedTaxableNetIncomeResult.taxableNetIncome,
    line9IncomeFactor: combinedTaxableNetIncomeResult.incomeFactor,
    nonresidentTaxFactor,
    nonresidentTaxableNetIncome: nonresidentTaxableNetIncomeResult.taxableNetIncome,
    partYearResidentTaxableNetIncome: residentTaxableNetIncomeResult.taxableNetIncome,
    residentLocalTaxResult,
    stateTaxBeforeCredits,
    totalLocalTax,
    totalTax,
  };
}

export {
  calculateMarylandAllocatedReturn,
  calculateMarylandIncomeFactor,
  prorateMarylandAmount,
};

export type { MarylandAllocatedReturnComputation };
