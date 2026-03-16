import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildKsStateArtifacts } from "./ks/index";
import { buildStateArtifacts as buildMoStateArtifacts } from "./mo/index";
import { buildStateArtifacts as buildNeStateArtifacts } from "./ne/index";
import { buildStateArtifacts as buildVaStateArtifacts } from "./va/index";
import { buildStateArtifacts as buildWvStateArtifacts } from "./wv/index";
import {
  buildArtifacts,
  getStateManifest,
  makeFederalSummary,
  makeReturn,
} from "./test-helpers";

describe("resident state third batch builders", () => {
  it("computes Kansas resident tax with the senior standard deduction and exemption allowance", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 80_000,
      builder: buildKsStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("KS", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        stateAdditions: [{ description: "Kansas addback", amount: 1_000 }],
        stateSpecificCredits: [{ description: "Kansas credit", amount: 100 }],
        stateSubtractions: [{ description: "Kansas subtraction", amount: 500 }],
        stateWithholding: 3_000,
        taxpayer: {
          date_of_birth: "1950-01-01",
        },
      }),
      stateCode: "KS",
    });

    expect(artifacts.summary).toEqual({
      state_code: "KS",
      plugin_manifest_id: getStateManifest("KS").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 80_500,
      taxable_income: 62_245,
      total_tax: 3_286,
      total_payments: 3_000,
      refund_amount: 0,
      amount_owed: 286,
    });
  });

  it("computes Missouri resident tax with the federal tax deduction and HOH additions", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 90_000,
      builder: buildMoStateArtifacts,
      federalSummary: makeFederalSummary({
        line24_total_tax: 10_000,
      }),
      inputReturn: makeReturn("MO", {
        filingStatus: "head_of_household",
        stateFilingStatus: "head_of_household",
        stateAdditions: [{ description: "Missouri addback", amount: 1_000 }],
        stateSpecificCredits: [{ description: "Missouri credit", amount: 200 }],
        stateSubtractions: [{ description: "Missouri subtraction", amount: 500 }],
        stateWithholding: 2_600,
        taxpayer: {
          date_of_birth: "1950-01-01",
        },
      }),
      stateCode: "MO",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MO",
      plugin_manifest_id: getStateManifest("MO").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 90_500,
      taxable_income: 61_975,
      total_tax: 2_537,
      total_payments: 2_600,
      refund_amount: 63,
      amount_owed: 0,
    });
  });

  it("computes Nebraska resident tax with the standard deduction and exemption credit", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildNeStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("NE", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        filingStatus: "married_filing_jointly",
        stateFilingStatus: "married_filing_jointly",
        spouse: {
          person_id: "spouse",
          date_of_birth: "1959-01-01",
          is_blind: false,
          can_be_claimed_as_dependent: false,
        },
        stateAdditions: [{ description: "Nebraska addback", amount: 1_000 }],
        stateSpecificCredits: [{ description: "Nebraska credit", amount: 100 }],
        stateSubtractions: [{ description: "Nebraska subtraction", amount: 500 }],
        stateWithholding: 2_000,
      }),
      stateCode: "NE",
    });

    expect(artifacts.summary).toEqual({
      state_code: "NE",
      plugin_manifest_id: getStateManifest("NE").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 81_650,
      total_tax: 2_506,
      total_payments: 2_000,
      refund_amount: 0,
      amount_owed: 506,
    });
  });

  it("computes Virginia resident tax with standard deduction and exemption sections", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildVaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("VA", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        filingStatus: "married_filing_jointly",
        stateFilingStatus: "married_filing_jointly",
        spouse: {
          person_id: "spouse",
          date_of_birth: "1959-01-01",
          is_blind: false,
          can_be_claimed_as_dependent: false,
        },
        stateAdditions: [{ description: "Virginia addback", amount: 1_000 }],
        stateSpecificCredits: [{ description: "Virginia credit", amount: 200 }],
        stateSubtractions: [{ description: "Virginia subtraction", amount: 500 }],
        stateWithholding: 4_500,
      }),
      stateCode: "VA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "VA",
      plugin_manifest_id: getStateManifest("VA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 78_480,
      total_tax: 4_055,
      total_payments: 4_500,
      refund_amount: 445,
      amount_owed: 0,
    });
  });

  it("computes West Virginia resident tax with exemption deductions", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 80_000,
      builder: buildWvStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("WV", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        filingStatus: "married_filing_jointly",
        stateFilingStatus: "married_filing_jointly",
        spouse: {
          person_id: "spouse",
          date_of_birth: "1991-01-01",
          is_blind: false,
          can_be_claimed_as_dependent: false,
        },
        stateAdditions: [{ description: "West Virginia addback", amount: 1_000 }],
        stateSpecificCredits: [{ description: "West Virginia credit", amount: 100 }],
        stateSubtractions: [{ description: "West Virginia subtraction", amount: 500 }],
        stateWithholding: 2_400,
      }),
      stateCode: "WV",
    });

    expect(artifacts.summary).toEqual({
      state_code: "WV",
      plugin_manifest_id: getStateManifest("WV").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 80_000,
      taxable_income: 72_500,
      total_tax: 2_556,
      total_payments: 2_400,
      refund_amount: 0,
      amount_owed: 156,
    });
  });
});
