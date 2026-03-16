import { toWholeDollars } from "../../resident";

type NewYorkFilingStatus =
  | "head_of_household"
  | "married_filing_jointly"
  | "married_filing_separately"
  | "qualifying_surviving_spouse"
  | "single";

type NewYorkTaxBracket = {
  readonly baseTax: number;
  readonly lowerBound: number;
  readonly rate: number;
  readonly upperBound: number;
};

type NewYorkRecaptureBand =
  | {
      readonly agiStart: number;
      readonly baseRate: number;
      readonly kind: "blend";
      readonly taxableIncomeUpperBound: number;
    }
  | {
      readonly agiStart: number;
      readonly incrementalBenefit: number;
      readonly kind: "recapture";
      readonly recaptureBase: number;
      readonly taxableIncomeUpperBound: number;
    };

type NewYorkTaxConfig = {
  readonly brackets: ReadonlyArray<NewYorkTaxBracket>;
  readonly recaptureBands: ReadonlyArray<NewYorkRecaptureBand>;
};

const NEW_YORK_AGI_RECAPTURE_START = 107_650;
const NEW_YORK_AGI_RECAPTURE_WINDOW = 50_000;
const NEW_YORK_AGI_TOP_RATE_START = 25_000_000;
const NEW_YORK_TOP_RATE = 0.109;

const NEW_YORK_TAX_CONFIG_BY_STATUS: Record<NewYorkFilingStatus, NewYorkTaxConfig> = {
  married_filing_jointly: {
    brackets: [
      { lowerBound: 0, upperBound: 17_150, baseTax: 0, rate: 0.04 },
      { lowerBound: 17_150, upperBound: 23_600, baseTax: 686, rate: 0.045 },
      { lowerBound: 23_600, upperBound: 27_900, baseTax: 976, rate: 0.0525 },
      { lowerBound: 27_900, upperBound: 161_550, baseTax: 1_202, rate: 0.055 },
      { lowerBound: 161_550, upperBound: 323_200, baseTax: 8_553, rate: 0.06 },
      { lowerBound: 323_200, upperBound: 2_155_350, baseTax: 18_252, rate: 0.0685 },
      { lowerBound: 2_155_350, upperBound: 5_000_000, baseTax: 143_754, rate: 0.0965 },
      { lowerBound: 5_000_000, upperBound: 25_000_000, baseTax: 418_263, rate: 0.103 },
      { lowerBound: 25_000_000, upperBound: Infinity, baseTax: 2_478_263, rate: 0.109 },
    ],
    recaptureBands: [
      {
        agiStart: NEW_YORK_AGI_RECAPTURE_START,
        baseRate: 0.055,
        kind: "blend",
        taxableIncomeUpperBound: 161_550,
      },
      {
        agiStart: 161_550,
        incrementalBenefit: 807,
        kind: "recapture",
        recaptureBase: 333,
        taxableIncomeUpperBound: 323_200,
      },
      {
        agiStart: 323_200,
        incrementalBenefit: 2_747,
        kind: "recapture",
        recaptureBase: 1_140,
        taxableIncomeUpperBound: 2_155_350,
      },
      {
        agiStart: 2_155_350,
        incrementalBenefit: 60_350,
        kind: "recapture",
        recaptureBase: 3_887,
        taxableIncomeUpperBound: 5_000_000,
      },
      {
        agiStart: 5_000_000,
        incrementalBenefit: 32_500,
        kind: "recapture",
        recaptureBase: 64_237,
        taxableIncomeUpperBound: 25_000_000,
      },
    ],
  },
  qualifying_surviving_spouse: {
    brackets: [
      { lowerBound: 0, upperBound: 17_150, baseTax: 0, rate: 0.04 },
      { lowerBound: 17_150, upperBound: 23_600, baseTax: 686, rate: 0.045 },
      { lowerBound: 23_600, upperBound: 27_900, baseTax: 976, rate: 0.0525 },
      { lowerBound: 27_900, upperBound: 161_550, baseTax: 1_202, rate: 0.055 },
      { lowerBound: 161_550, upperBound: 323_200, baseTax: 8_553, rate: 0.06 },
      { lowerBound: 323_200, upperBound: 2_155_350, baseTax: 18_252, rate: 0.0685 },
      { lowerBound: 2_155_350, upperBound: 5_000_000, baseTax: 143_754, rate: 0.0965 },
      { lowerBound: 5_000_000, upperBound: 25_000_000, baseTax: 418_263, rate: 0.103 },
      { lowerBound: 25_000_000, upperBound: Infinity, baseTax: 2_478_263, rate: 0.109 },
    ],
    recaptureBands: [
      {
        agiStart: NEW_YORK_AGI_RECAPTURE_START,
        baseRate: 0.055,
        kind: "blend",
        taxableIncomeUpperBound: 161_550,
      },
      {
        agiStart: 161_550,
        incrementalBenefit: 807,
        kind: "recapture",
        recaptureBase: 333,
        taxableIncomeUpperBound: 323_200,
      },
      {
        agiStart: 323_200,
        incrementalBenefit: 2_747,
        kind: "recapture",
        recaptureBase: 1_140,
        taxableIncomeUpperBound: 2_155_350,
      },
      {
        agiStart: 2_155_350,
        incrementalBenefit: 60_350,
        kind: "recapture",
        recaptureBase: 3_887,
        taxableIncomeUpperBound: 5_000_000,
      },
      {
        agiStart: 5_000_000,
        incrementalBenefit: 32_500,
        kind: "recapture",
        recaptureBase: 64_237,
        taxableIncomeUpperBound: 25_000_000,
      },
    ],
  },
  single: {
    brackets: [
      { lowerBound: 0, upperBound: 8_500, baseTax: 0, rate: 0.04 },
      { lowerBound: 8_500, upperBound: 11_700, baseTax: 340, rate: 0.045 },
      { lowerBound: 11_700, upperBound: 13_900, baseTax: 484, rate: 0.0525 },
      { lowerBound: 13_900, upperBound: 80_650, baseTax: 600, rate: 0.055 },
      { lowerBound: 80_650, upperBound: 215_400, baseTax: 4_271, rate: 0.06 },
      { lowerBound: 215_400, upperBound: 1_077_550, baseTax: 12_356, rate: 0.0685 },
      { lowerBound: 1_077_550, upperBound: 5_000_000, baseTax: 71_413, rate: 0.0965 },
      { lowerBound: 5_000_000, upperBound: 25_000_000, baseTax: 449_929, rate: 0.103 },
      { lowerBound: 25_000_000, upperBound: Infinity, baseTax: 2_509_929, rate: 0.109 },
    ],
    recaptureBands: [
      {
        agiStart: NEW_YORK_AGI_RECAPTURE_START,
        baseRate: 0.06,
        kind: "blend",
        taxableIncomeUpperBound: 215_400,
      },
      {
        agiStart: 215_400,
        incrementalBenefit: 1_831,
        kind: "recapture",
        recaptureBase: 568,
        taxableIncomeUpperBound: 1_077_550,
      },
      {
        agiStart: 1_077_550,
        incrementalBenefit: 30_172,
        kind: "recapture",
        recaptureBase: 2_399,
        taxableIncomeUpperBound: 5_000_000,
      },
      {
        agiStart: 5_000_000,
        incrementalBenefit: 32_500,
        kind: "recapture",
        recaptureBase: 32_571,
        taxableIncomeUpperBound: 25_000_000,
      },
    ],
  },
  married_filing_separately: {
    brackets: [
      { lowerBound: 0, upperBound: 8_500, baseTax: 0, rate: 0.04 },
      { lowerBound: 8_500, upperBound: 11_700, baseTax: 340, rate: 0.045 },
      { lowerBound: 11_700, upperBound: 13_900, baseTax: 484, rate: 0.0525 },
      { lowerBound: 13_900, upperBound: 80_650, baseTax: 600, rate: 0.055 },
      { lowerBound: 80_650, upperBound: 215_400, baseTax: 4_271, rate: 0.06 },
      { lowerBound: 215_400, upperBound: 1_077_550, baseTax: 12_356, rate: 0.0685 },
      { lowerBound: 1_077_550, upperBound: 5_000_000, baseTax: 71_413, rate: 0.0965 },
      { lowerBound: 5_000_000, upperBound: 25_000_000, baseTax: 449_929, rate: 0.103 },
      { lowerBound: 25_000_000, upperBound: Infinity, baseTax: 2_509_929, rate: 0.109 },
    ],
    recaptureBands: [
      {
        agiStart: NEW_YORK_AGI_RECAPTURE_START,
        baseRate: 0.06,
        kind: "blend",
        taxableIncomeUpperBound: 215_400,
      },
      {
        agiStart: 215_400,
        incrementalBenefit: 1_831,
        kind: "recapture",
        recaptureBase: 568,
        taxableIncomeUpperBound: 1_077_550,
      },
      {
        agiStart: 1_077_550,
        incrementalBenefit: 30_172,
        kind: "recapture",
        recaptureBase: 2_399,
        taxableIncomeUpperBound: 5_000_000,
      },
      {
        agiStart: 5_000_000,
        incrementalBenefit: 32_500,
        kind: "recapture",
        recaptureBase: 32_571,
        taxableIncomeUpperBound: 25_000_000,
      },
    ],
  },
  head_of_household: {
    brackets: [
      { lowerBound: 0, upperBound: 12_800, baseTax: 0, rate: 0.04 },
      { lowerBound: 12_800, upperBound: 17_650, baseTax: 512, rate: 0.045 },
      { lowerBound: 17_650, upperBound: 20_900, baseTax: 730, rate: 0.0525 },
      { lowerBound: 20_900, upperBound: 107_650, baseTax: 901, rate: 0.055 },
      { lowerBound: 107_650, upperBound: 269_300, baseTax: 5_672, rate: 0.06 },
      { lowerBound: 269_300, upperBound: 1_616_450, baseTax: 15_371, rate: 0.0685 },
      { lowerBound: 1_616_450, upperBound: 5_000_000, baseTax: 107_651, rate: 0.0965 },
      { lowerBound: 5_000_000, upperBound: 25_000_000, baseTax: 434_163, rate: 0.103 },
      { lowerBound: 25_000_000, upperBound: Infinity, baseTax: 2_494_163, rate: 0.109 },
    ],
    recaptureBands: [
      {
        agiStart: NEW_YORK_AGI_RECAPTURE_START,
        baseRate: 0.06,
        kind: "blend",
        taxableIncomeUpperBound: 269_300,
      },
      {
        agiStart: 269_300,
        incrementalBenefit: 2_289,
        kind: "recapture",
        recaptureBase: 787,
        taxableIncomeUpperBound: 1_616_450,
      },
      {
        agiStart: 1_616_450,
        incrementalBenefit: 45_261,
        kind: "recapture",
        recaptureBase: 3_076,
        taxableIncomeUpperBound: 5_000_000,
      },
      {
        agiStart: 5_000_000,
        incrementalBenefit: 32_500,
        kind: "recapture",
        recaptureBase: 48_337,
        taxableIncomeUpperBound: 25_000_000,
      },
    ],
  },
};

function calculateNewYorkRateScheduleTax(
  taxableIncome: number,
  filingStatus: NewYorkFilingStatus,
): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  const config = NEW_YORK_TAX_CONFIG_BY_STATUS[filingStatus];

  for (const bracket of config.brackets) {
    if (taxableIncome <= bracket.upperBound) {
      return toWholeDollars(
        bracket.baseTax + (taxableIncome - bracket.lowerBound) * bracket.rate,
      );
    }
  }

  return 0;
}

function calculateRecaptureRatio(adjustedGrossIncome: number, agiStart: number): number {
  if (adjustedGrossIncome <= agiStart) {
    return 0;
  }

  return Math.min(adjustedGrossIncome - agiStart, NEW_YORK_AGI_RECAPTURE_WINDOW) /
    NEW_YORK_AGI_RECAPTURE_WINDOW;
}

function calculateNewYorkStateTax(args: {
  readonly adjustedGrossIncome: number;
  readonly filingStatus: NewYorkFilingStatus;
  readonly taxableIncome: number;
}): number {
  if (args.taxableIncome <= 0) {
    return 0;
  }

  if (args.adjustedGrossIncome > NEW_YORK_AGI_TOP_RATE_START) {
    return toWholeDollars(args.taxableIncome * NEW_YORK_TOP_RATE);
  }

  const config = NEW_YORK_TAX_CONFIG_BY_STATUS[args.filingStatus];
  const rateScheduleTax = calculateNewYorkRateScheduleTax(args.taxableIncome, args.filingStatus);

  if (args.adjustedGrossIncome <= NEW_YORK_AGI_RECAPTURE_START) {
    return rateScheduleTax;
  }

  for (const band of config.recaptureBands) {
    if (args.taxableIncome > band.taxableIncomeUpperBound) {
      continue;
    }

    if (band.kind === "blend") {
      const topRateTax = toWholeDollars(args.taxableIncome * band.baseRate);
      const ratio = calculateRecaptureRatio(args.adjustedGrossIncome, band.agiStart);
      return toWholeDollars(rateScheduleTax + (topRateTax - rateScheduleTax) * ratio);
    }

    const ratio = calculateRecaptureRatio(args.adjustedGrossIncome, band.agiStart);
    return toWholeDollars(
      rateScheduleTax + band.recaptureBase + band.incrementalBenefit * ratio,
    );
  }

  return rateScheduleTax;
}

export {
  calculateNewYorkRateScheduleTax,
  calculateNewYorkStateTax,
};

export type {
  NewYorkFilingStatus,
};
