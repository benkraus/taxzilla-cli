import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildMdStateArtifacts } from "./core-engine/states/md/index";
import { buildStateArtifacts as buildMnStateArtifacts } from "./core-engine/states/mn/index";
import { buildStateArtifacts as buildMtStateArtifacts } from "./core-engine/states/mt/index";
import { buildStateArtifacts as buildNjStateArtifacts } from "./core-engine/states/nj/index";
import { buildStateArtifacts as buildNyStateArtifacts } from "./core-engine/states/ny/index";
import { buildStateArtifacts as buildVtStateArtifacts } from "./core-engine/states/vt/index";
import {
  buildArtifacts,
  getStateManifest,
  makeFederalSummary,
  makeReturn,
} from "./core-engine.state-test-helpers";

describe("resident state eighth batch builders", () => {
  it("computes Maryland resident tax with Baltimore City local tax", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMdStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MD", {
        localReturns: [
          {
            jurisdiction_code: "510",
            jurisdiction_name: "Baltimore City",
            resident_status: "resident",
            additions: [],
            subtractions: [],
            credits: [],
            payments: [],
            plugin_fact_bag: {},
          },
        ],
        stateWithholding: 8_000,
      }),
      stateCode: "MD",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MD",
      plugin_manifest_id: getStateManifest("MD").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 93_450,
      total_tax: 7_376,
      total_payments: 8_000,
      refund_amount: 624,
      amount_owed: 0,
    });
  });

  it("computes Maryland itemized deduction adjustments and capital gain additional tax from current inputs", async () => {
    const inputReturn = makeReturn("MD", {
      adjustedGrossIncome: 400_000,
      capitalTransactions: [
        {
          source_document_id: "1099b-1",
          proceeds: 40_000,
          cost_basis: 10_000,
          gain_or_loss: 30_000,
          term: "long",
        },
      ],
      localReturns: [
        {
          jurisdiction_code: "510",
          jurisdiction_name: "Baltimore City",
          resident_status: "resident",
          additions: [],
          subtractions: [],
          credits: [],
          payments: [],
          plugin_fact_bag: {},
        },
      ],
      saltDeduction: 12_000,
      stateWithholding: 20_000,
    });

    inputReturn.facts.itemized_deductions.real_estate_taxes = 8_000;

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 400_000,
      builder: buildMdStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 60_000,
      }),
      inputReturn,
      stateCode: "MD",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MD.itemized_deduction_proxy_used",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MD.capital_gain_additional_tax_override_missing",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "md.form502.line17a", value: 60_000 }),
        expect.objectContaining({ node_id: "md.form502.line17b", value: 12_000 }),
        expect.objectContaining({ node_id: "md.form502.line17c", value: 22_500 }),
        expect.objectContaining({ node_id: "md.form502.line17", value: 25_500 }),
        expect.objectContaining({ node_id: "md.form502.line20a", value: 30_000 }),
        expect.objectContaining({ node_id: "md.form502.line21b", value: 600 }),
      ]),
    );
  });

  it("computes Minnesota resident tax with additions and subtractions", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMnStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MN", {
        stateAdditions: [{ description: "Minnesota addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Minnesota subtraction", amount: 500 }],
        stateWithholding: 3_000,
      }),
      stateCode: "MN",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MN",
      plugin_manifest_id: getStateManifest("MN").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 84_750,
      total_tax: 5_291,
      total_payments: 3_000,
      refund_amount: 0,
      amount_owed: 2_291,
    });
  });

  it("computes Montana resident tax from federal taxable income with modifications", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMtStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 80_000,
      }),
      inputReturn: makeReturn("MT", {
        stateAdditions: [{ description: "Montana addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Montana subtraction", amount: 500 }],
        stateWithholding: 2_500,
      }),
      stateCode: "MT",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MT",
      plugin_manifest_id: getStateManifest("MT").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 80_000,
      taxable_income: 80_500,
      total_tax: 4_496,
      total_payments: 2_500,
      refund_amount: 0,
      amount_owed: 1_996,
    });
  });

  it("computes Vermont resident tax with childcare and child tax credits", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildVtStateArtifacts,
      federalSummary: makeFederalSummary({
        child_and_dependent_care_credit: 600,
      }),
      inputReturn: makeReturn("VT", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2020-02-02" }],
        scheduleCBusinesses: [
          {
            business_id: "business-1",
            owner_person_id: "taxpayer",
            gross_receipts_or_sales: 10_000,
            returns_and_allowances: 0,
            cost_of_goods_sold: 0,
            other_business_income: 0,
            expenses: [{ description: "Expense", amount: 2_000 }],
            home_office_deduction: 0,
          },
        ],
        stateWithholding: 3_000,
      }),
      stateCode: "VT",
    });

    expect(artifacts.summary).toEqual({
      state_code: "VT",
      plugin_manifest_id: getStateManifest("VT").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 81_750,
      total_tax: 2_368,
      total_payments: 3_000,
      refund_amount: 632,
      amount_owed: 0,
    });
  });

  it("computes New Jersey resident tax with the property tax deduction path and refundable credits", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildNjStateArtifacts,
      federalSummary: makeFederalSummary({
        child_and_dependent_care_credit: 600,
        line27a_earned_income_credit: 1_000,
      }),
      inputReturn: makeReturn("NJ", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2021-05-05" }],
        taxpayer: {
          date_of_birth: "1950-01-01",
        },
        stateWithholding: 4_000,
        pluginFactBag: {
          nj1040: {
            property_taxes_paid_amount: 10_000,
          },
        },
      }),
      stateCode: "NJ",
    });

    expect(artifacts.summary).toEqual({
      state_code: "NJ",
      plugin_manifest_id: getStateManifest("NJ").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 86_500,
      total_tax: 3_384,
      total_payments: 4_580,
      refund_amount: 1_196,
      amount_owed: 0,
    });
  });

  it("computes New York resident tax with New York City tax and school credits", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildNyStateArtifacts,
      federalSummary: makeFederalSummary({
        line4b_taxable_ira_distributions: 0,
      }),
      inputReturn: makeReturn("NY", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        localReturns: [
          {
            jurisdiction_code: "NYC",
            jurisdiction_name: "New York City",
            resident_status: "resident",
            additions: [],
            subtractions: [],
            credits: [],
            payments: [],
            plugin_fact_bag: {},
          },
        ],
        stateWithholding: 5_000,
      }),
      stateCode: "NY",
    });

    expect(artifacts.summary).toEqual({
      state_code: "NY",
      plugin_manifest_id: getStateManifest("NY").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 91_000,
      total_tax: 8_294,
      total_payments: 5_264,
      refund_amount: 0,
      amount_owed: 3_030,
    });
  });
});
