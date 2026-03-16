import {
  FEDERAL_TAX_BRACKETS_BY_FILING_STATUS,
  QUALIFIED_DIVIDEND_FIFTEEN_RATE_THRESHOLD_BY_FILING_STATUS,
  QUALIFIED_DIVIDEND_ZERO_RATE_THRESHOLD_BY_FILING_STATUS,
} from "./constants";
import { roundMoney } from "../../helpers";
import type { FederalFilingStatus, PreferentialRateTaxComputation } from "./types";

function computeRegularIncomeTax(taxableIncome: number, filingStatus: FederalFilingStatus): number {
  let runningTax = 0;
  let previousCeiling = 0;

  for (const bracket of FEDERAL_TAX_BRACKETS_BY_FILING_STATUS[filingStatus]) {
    const taxableAmountInBracket = Math.max(
      Math.min(taxableIncome, bracket.ceiling) - previousCeiling,
      0,
    );

    runningTax += taxableAmountInBracket * bracket.rate;
    previousCeiling = bracket.ceiling;

    if (taxableIncome <= bracket.ceiling) {
      break;
    }
  }

  return roundMoney(runningTax);
}

function computePreferentialRateTax(args: {
  readonly filingStatus: FederalFilingStatus;
  readonly qualifiedDividendsTotal: number;
  readonly scheduleDNetCapitalGainOrLossTotal: number;
  readonly taxableIncome: number;
}): PreferentialRateTaxComputation {
  const netCapitalGain = Math.max(args.scheduleDNetCapitalGainOrLossTotal, 0);
  const preferentialIncome = roundMoney(
    Math.min(args.taxableIncome, args.qualifiedDividendsTotal + netCapitalGain),
  );

  if (args.taxableIncome <= 0 || preferentialIncome <= 0) {
    return {
      method: "ordinary_brackets",
      tax: computeRegularIncomeTax(args.taxableIncome, args.filingStatus),
      usesWorksheet: false,
    };
  }

  const ordinaryIncome = roundMoney(Math.max(args.taxableIncome - preferentialIncome, 0));
  const zeroRateThreshold =
    QUALIFIED_DIVIDEND_ZERO_RATE_THRESHOLD_BY_FILING_STATUS[args.filingStatus];
  const fifteenRateThreshold =
    QUALIFIED_DIVIDEND_FIFTEEN_RATE_THRESHOLD_BY_FILING_STATUS[args.filingStatus];
  const taxedAtZero = roundMoney(
    Math.min(Math.max(zeroRateThreshold - ordinaryIncome, 0), preferentialIncome),
  );
  const remainingAfterZero = roundMoney(Math.max(preferentialIncome - taxedAtZero, 0));
  const taxedAtFifteen = roundMoney(
    Math.min(Math.max(fifteenRateThreshold - ordinaryIncome - taxedAtZero, 0), remainingAfterZero),
  );
  const taxedAtTwenty = roundMoney(Math.max(remainingAfterZero - taxedAtFifteen, 0));

  return {
    method: "qualified_dividends_and_capital_gain_worksheet",
    tax: roundMoney(
      computeRegularIncomeTax(ordinaryIncome, args.filingStatus) +
        taxedAtFifteen * 0.15 +
        taxedAtTwenty * 0.2,
    ),
    usesWorksheet: true,
  };
}

function computeScheduleDTaxWorksheetTax(args: {
  readonly filingStatus: FederalFilingStatus;
  readonly qualifiedDividendsTotal: number;
  readonly scheduleDCollectibles28PercentGainTotal: number;
  readonly scheduleDLongTermCapitalGainOrLossTotal: number;
  readonly scheduleDNetCapitalGainOrLossTotal: number;
  readonly scheduleDUnrecapturedSection1250GainTotal: number;
  readonly taxableIncome: number;
}): PreferentialRateTaxComputation {
  if (
    args.taxableIncome <= 0 ||
    args.scheduleDLongTermCapitalGainOrLossTotal <= 0 ||
    args.scheduleDNetCapitalGainOrLossTotal <= 0
  ) {
    return {
      method: "ordinary_brackets",
      tax: computeRegularIncomeTax(args.taxableIncome, args.filingStatus),
      usesWorksheet: false,
    };
  }

  const zeroRateThreshold =
    QUALIFIED_DIVIDEND_ZERO_RATE_THRESHOLD_BY_FILING_STATUS[args.filingStatus];
  const fifteenRateThreshold =
    QUALIFIED_DIVIDEND_FIFTEEN_RATE_THRESHOLD_BY_FILING_STATUS[args.filingStatus];
  const twentyFourPercentThreshold =
    FEDERAL_TAX_BRACKETS_BY_FILING_STATUS[args.filingStatus][3]!.ceiling;
  const line1TaxableIncome = args.taxableIncome;
  const line6QualifiedDividendsAfterInvestmentInterest = args.qualifiedDividendsTotal;
  const line7ScheduleDGainPortion = Math.min(
    args.scheduleDLongTermCapitalGainOrLossTotal,
    args.scheduleDNetCapitalGainOrLossTotal,
  );
  const line9NetCapitalGainAfterInvestmentInterest = roundMoney(
    Math.max(line7ScheduleDGainPortion, 0),
  );
  const line10QualifiedAndNetCapitalGainTotal = Math.min(
    line1TaxableIncome,
    line6QualifiedDividendsAfterInvestmentInterest + line9NetCapitalGainAfterInvestmentInterest,
  );
  const line11SpecialRateGainTotal =
    args.scheduleDCollectibles28PercentGainTotal + args.scheduleDUnrecapturedSection1250GainTotal;
  const line12SpecialRateGainPortion = Math.min(
    line9NetCapitalGainAfterInvestmentInterest,
    line11SpecialRateGainTotal,
  );
  const line13ReducedQualifiedAndNetCapitalGainTotal = roundMoney(
    Math.max(line10QualifiedAndNetCapitalGainTotal - line12SpecialRateGainPortion, 0),
  );
  const line14TaxableIncomeMinusAdjustedGain = roundMoney(
    Math.max(line1TaxableIncome - line13ReducedQualifiedAndNetCapitalGainTotal, 0),
  );
  const line16ZeroRateThresholdCap = Math.min(line1TaxableIncome, zeroRateThreshold);
  const line17IncomeTaxedAtZeroOrLowerThreshold = Math.min(
    line14TaxableIncomeMinusAdjustedGain,
    line16ZeroRateThresholdCap,
  );
  const line18RemainingIncomeAfterQualifiedAndNetCapitalGain = roundMoney(
    Math.max(line1TaxableIncome - line10QualifiedAndNetCapitalGainTotal, 0),
  );
  const line19TwentyFourPercentThresholdCap = Math.min(
    line1TaxableIncome,
    twentyFourPercentThreshold,
  );
  const line20IncomeTaxedUpToTwentyFourPercentThreshold = Math.min(
    line14TaxableIncomeMinusAdjustedGain,
    line19TwentyFourPercentThresholdCap,
  );
  const line21OrdinaryIncomeTaxBase = Math.max(
    line18RemainingIncomeAfterQualifiedAndNetCapitalGain,
    line20IncomeTaxedUpToTwentyFourPercentThreshold,
  );
  const line22ZeroRateTaxBase = roundMoney(
    Math.max(line16ZeroRateThresholdCap - line17IncomeTaxedAtZeroOrLowerThreshold, 0),
  );
  const line23QualifiedGainBase = Math.min(
    line1TaxableIncome,
    line13ReducedQualifiedAndNetCapitalGainTotal,
  );
  const line24ZeroRateAllocatedGain = line22ZeroRateTaxBase;
  const line25RemainingQualifiedGainBase = roundMoney(
    Math.max(line23QualifiedGainBase - line24ZeroRateAllocatedGain, 0),
  );
  const line27FifteenRateThresholdCap = Math.min(line1TaxableIncome, fifteenRateThreshold);
  const line28BaseAllocatedBeforeFifteenRate = line21OrdinaryIncomeTaxBase + line22ZeroRateTaxBase;
  const line29FifteenRateCapacity = roundMoney(
    Math.max(line27FifteenRateThresholdCap - line28BaseAllocatedBeforeFifteenRate, 0),
  );
  const line30FifteenRateTaxBase = Math.min(
    line25RemainingQualifiedGainBase,
    line29FifteenRateCapacity,
  );
  const line31FifteenRateTax = roundMoney(line30FifteenRateTaxBase * 0.15);
  const line32IncomeAllocatedThroughFifteenRate =
    line24ZeroRateAllocatedGain + line30FifteenRateTaxBase;
  const line33TwentyRateTaxBase = roundMoney(
    Math.max(line23QualifiedGainBase - line32IncomeAllocatedThroughFifteenRate, 0),
  );
  const line34TwentyRateTax = roundMoney(line33TwentyRateTaxBase * 0.2);
  const line35UnrecapturedSection1250TaxBase = Math.min(
    line9NetCapitalGainAfterInvestmentInterest,
    args.scheduleDUnrecapturedSection1250GainTotal,
  );
  const line36SpecialRateWorksheetBase =
    line10QualifiedAndNetCapitalGainTotal + line21OrdinaryIncomeTaxBase;
  const line38UnrecapturedSection1250TwentyRateOverlap = roundMoney(
    Math.max(line36SpecialRateWorksheetBase - line1TaxableIncome, 0),
  );
  const line39UnrecapturedSection1250TaxBase = roundMoney(
    Math.max(
      line35UnrecapturedSection1250TaxBase - line38UnrecapturedSection1250TwentyRateOverlap,
      0,
    ),
  );
  const line40UnrecapturedSection1250Tax = roundMoney(line39UnrecapturedSection1250TaxBase * 0.25);
  const line41TwentyEightRateAllocatedBase =
    line21OrdinaryIncomeTaxBase +
    line22ZeroRateTaxBase +
    line30FifteenRateTaxBase +
    line33TwentyRateTaxBase +
    line39UnrecapturedSection1250TaxBase;
  const line42TwentyEightRateTaxBase = roundMoney(
    Math.max(line1TaxableIncome - line41TwentyEightRateAllocatedBase, 0),
  );
  const line43TwentyEightRateTax = roundMoney(line42TwentyEightRateTaxBase * 0.28);
  const line44OrdinaryIncomeTax = computeRegularIncomeTax(
    line21OrdinaryIncomeTaxBase,
    args.filingStatus,
  );
  const worksheetTax = roundMoney(
    line31FifteenRateTax +
      line34TwentyRateTax +
      line40UnrecapturedSection1250Tax +
      line43TwentyEightRateTax +
      line44OrdinaryIncomeTax,
  );

  return {
    method: "schedule_d_tax_worksheet",
    tax: Math.min(worksheetTax, computeRegularIncomeTax(line1TaxableIncome, args.filingStatus)),
    usesWorksheet: true,
  };
}

export {
  computePreferentialRateTax,
  computeRegularIncomeTax,
  computeScheduleDTaxWorksheetTax,
};
