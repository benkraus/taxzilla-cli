import { describe, expect, it } from "vitest";

import { statesRegistryTy2025 } from "../../index";
import {
  buildArtifacts,
  makeFederalSummary,
  makeReturn,
} from "./test-helpers";
import { stateArtifactBuilders } from "./index";

const ALL_STATE_CODES = statesRegistryTy2025.map((manifest) => manifest.state_code);
const FEDERAL_SUMMARY = makeFederalSummary({
  line15_taxable_income: 80_000,
  line24_total_tax: 8_000,
  standard_deduction: 15_000,
});

function makeAllocatedReturn(
  stateCode: string,
  options: {
    readonly allocationProfile: Record<string, unknown>;
    readonly residencyDetermination: Record<string, unknown>;
    readonly returnKind: "nonresident" | "part_year_resident";
  },
) {
  return makeReturn(stateCode, {
    adjustedGrossIncome: 100_000,
    allocationProfile: options.allocationProfile,
    requestedStates: [stateCode],
    residencyDetermination: options.residencyDetermination,
    returnKind: options.returnKind,
    startingPointStrategy: stateCode === "CA" ? "federal_agi" : "custom",
    stateWithholding: 0 as any,
  });
}

describe("state return kinds", () => {
  it.each(ALL_STATE_CODES)(
    "supports allocation-profile driven part-year and nonresident computation for %s",
    async (stateCode) => {
      const builder = stateArtifactBuilders[stateCode]!;
      const residentArtifacts = await buildArtifacts({
        adjustedGrossIncome: 100_000,
        builder,
        federalSummary: FEDERAL_SUMMARY,
        inputReturn: makeReturn(stateCode, {
          adjustedGrossIncome: 100_000,
          requestedStates: [stateCode],
          startingPointStrategy: stateCode === "CA" ? "federal_agi" : "custom",
          stateWithholding: 0 as any,
        }),
        stateCode,
      });
      const partYearArtifacts = await buildArtifacts({
        adjustedGrossIncome: 100_000,
        builder,
        federalSummary: FEDERAL_SUMMARY,
        inputReturn: makeAllocatedReturn(stateCode, {
          allocationProfile: {
            allocation_method: "ratio",
            apportionment_ratio: 0.4,
            everywhere_income: 100_000,
            resident_period_income: 40_000,
          },
          residencyDetermination: {
            days_everywhere: 365,
            days_in_state: 146,
            determination_method: "allocation_test_fixture",
            domicile_state_code: stateCode,
            resolved_return_kind: "part_year_resident",
          },
          returnKind: "part_year_resident",
        }),
        stateCode,
      });
      const nonresidentArtifacts = await buildArtifacts({
        adjustedGrossIncome: 100_000,
        builder,
        federalSummary: FEDERAL_SUMMARY,
        inputReturn: makeAllocatedReturn(stateCode, {
          allocationProfile: {
            allocation_method: "ratio",
            everywhere_income: 100_000,
            nonresident_source_income: 25_000,
            source_income_ratio: 0.25,
            state_source_income: 25_000,
          },
          residencyDetermination: {
            days_everywhere: 365,
            days_in_state: 90,
            determination_method: "allocation_test_fixture",
            domicile_state_code: "ZZ",
            resolved_return_kind: "nonresident",
          },
          returnKind: "nonresident",
        }),
        stateCode,
      });

      for (const artifacts of [partYearArtifacts, nonresidentArtifacts]) {
        expect(artifacts.validationResults.some((result: any) => result.rule_id === `${stateCode}.allocation_profile_applied`)).toBe(true);
        expect(artifacts.validationResults.some((result: any) => result.rule_id === `${stateCode}.resident_only`)).toBe(false);
        expect(artifacts.summary.adjusted_gross_income_or_starting_point).toBeLessThanOrEqual(
          residentArtifacts.summary.adjusted_gross_income_or_starting_point,
        );
      }

      expect(partYearArtifacts.summary).toMatchObject({
        return_kind: "part_year_resident",
        starting_point_strategy: stateCode === "CA" ? "federal_agi" : "custom",
        allocation_ratio: 0.4,
        resident_taxable_income: partYearArtifacts.summary.taxable_income,
      });
      expect(nonresidentArtifacts.summary).toMatchObject({
        return_kind: "nonresident",
        starting_point_strategy: stateCode === "CA" ? "federal_agi" : "custom",
        allocation_ratio: 0.25,
        resident_taxable_income: null,
      });
    },
  );

  it("still falls back when part-year computation lacks allocation inputs", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: stateArtifactBuilders.CO!,
      federalSummary: FEDERAL_SUMMARY,
      inputReturn: makeReturn("CO", {
        adjustedGrossIncome: 100_000,
        requestedStates: ["CO"],
        returnKind: "part_year_resident",
        stateWithholding: 0 as any,
      }),
      stateCode: "CO",
    });

    expect(artifacts.validationResults.some((result: any) => result.rule_id === "CO.resident_only")).toBe(
      true,
    );
  });
});
