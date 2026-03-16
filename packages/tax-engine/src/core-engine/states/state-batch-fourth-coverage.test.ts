import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildAlStateArtifacts } from "./al/index";
import { buildStateArtifacts as buildNdStateArtifacts } from "./nd/index";
import { buildStateArtifacts as buildOkStateArtifacts } from "./ok/index";
import { buildStateArtifacts as buildRiStateArtifacts } from "./ri/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./test-helpers";

describe("resident state fourth batch coverage branches", () => {
  it("uses Alabama itemized deductions and multistate credit overrides when supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 70_000,
      builder: buildAlStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 20_000,
      }),
      inputReturn: makeReturn("AL", {
        requestedStates: ["AL", "FL"],
        stateWithholding: 500,
        pluginFactBag: {
          form40: {
            federal_tax_deduction_amount: 3_000,
            itemized_deductions_total: 10_500,
            other_state_credit_amount: 250,
          },
        },
      }),
      stateCode: "AL",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "al.form40.line11", value: 10_500 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "AL.itemized_deduction_defaulted_to_standard",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "AL.other_state_credit_review",
    );
  });

  it("warns when Alabama has no federal summary for the federal-tax deduction", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildAlStateArtifacts,
      inputReturn: makeReturn("AL", {
        stateWithholding: 100,
      }),
      stateCode: "AL",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "AL.federal_tax_deduction_default_zero",
    );
  });

  it("falls back to the Alabama standard deduction when federal itemized deductions are present but no state itemized amount is supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildAlStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 15_000,
      }),
      inputReturn: makeReturn("AL", {
        stateWithholding: null as any,
      }),
      stateCode: "AL",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "al.form40.line11", value: 2_500 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "AL.itemized_deduction_defaulted_to_standard",
    );
  });

  it("returns zero Alabama tax when taxable income is zero", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 0,
      builder: buildAlStateArtifacts,
      federalSummary: makeFederalSummary({
        line24_total_tax: 0,
      }),
      inputReturn: makeReturn("AL", {
        stateWithholding: null as any,
        pluginFactBag: {
          form40: {
            standard_deduction_amount: 0,
            federal_tax_deduction_amount: 0,
            personal_exemption_amount: 0,
            dependent_exemption_amount: 0,
          },
        },
      }),
      stateCode: "AL",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "al.form40.line17", value: 0 }),
    );
  });

  it.each([
    ["single", 26_250, 2_975],
    ["married_filing_separately", 13_200, 4_162],
    ["head_of_household", 26_250, 5_065],
    ["married_filing_jointly", 26_250, 8_325],
  ])(
    "uses the Alabama standard deduction table for %s at AGI %d",
    async (filingStatus, adjustedGrossIncome, expectedDeduction) => {
      const artifacts = await buildArtifacts({
        adjustedGrossIncome,
        builder: buildAlStateArtifacts,
        federalSummary: makeFederalSummary({
          line24_total_tax: 0,
        }),
        inputReturn: makeReturn("AL", {
          filingStatus,
          spouse:
            filingStatus === "married_filing_jointly" || filingStatus === "married_filing_separately"
              ? {
                  person_id: "spouse",
                  date_of_birth: "1991-01-01",
                  is_blind: false,
                  can_be_claimed_as_dependent: false,
                }
              : null,
          stateFilingStatus: filingStatus,
          stateWithholding: null as any,
          pluginFactBag: {
            form40: {
              federal_tax_deduction_amount: 0,
              personal_exemption_amount: 0,
              dependent_exemption_amount: 0,
            },
          },
        }),
        stateCode: "AL",
      });

      expect(artifacts.nodes).toContainEqual(
        expect.objectContaining({ node_id: "al.form40.line11", value: expectedDeduction }),
      );
    },
  );

  it.each([
    [2_000, 70],
    [5_000, 210],
    [10_000, 460],
  ])("uses the Alabama tax schedule for taxable income %d", async (taxableIncome, expectedTax) => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: taxableIncome,
      builder: buildAlStateArtifacts,
      federalSummary: makeFederalSummary({
        line24_total_tax: 0,
      }),
      inputReturn: makeReturn("AL", {
        stateWithholding: null as any,
        pluginFactBag: {
          form40: {
            standard_deduction_amount: 0,
            federal_tax_deduction_amount: 0,
            personal_exemption_amount: 0,
            dependent_exemption_amount: 0,
          },
        },
      }),
      stateCode: "AL",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "al.form40.line17", value: expectedTax }),
    );
  });

  it("warns when North Dakota has no federal taxable income summary", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildNdStateArtifacts,
      inputReturn: makeReturn("ND", {
        stateWithholding: 100,
      }),
      stateCode: "ND",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "ND.federal_taxable_income_estimated_from_agi",
    );
  });

  it("suppresses the North Dakota multistate credit warning when an override is supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 80_000,
      builder: buildNdStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 70_000,
      }),
      inputReturn: makeReturn("ND", {
        requestedStates: ["ND", "MN"],
        stateWithholding: null as any,
        pluginFactBag: {
          nd1: {
            tax_paid_to_other_state_credit: 250,
          },
        },
      }),
      stateCode: "ND",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "ND.other_state_credit_review",
    );
  });

  it("warns when North Dakota needs an explicit multistate credit override", async () => {
    const inputReturn = makeReturn("ND", {
      requestedStates: ["ND", "MN"],
      stateWithholding: null as any,
    });

    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [
        {
          jurisdiction_level: "state",
          state_code: "MN",
          tax_type: "withholding",
          amount: 200,
          person_id: "taxpayer",
          local_jurisdiction_code: null,
          source_document_id: "w2-1",
          payer_state_code: "MN",
          work_state_code: "MN",
        },
      ],
      other_state_tax_credit_claims: [],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 80_000,
      builder: buildNdStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 70_000,
      }),
      inputReturn,
      stateCode: "ND",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "ND.other_state_credit_review",
    );
  });

  it.each([
    ["single", 0, 0],
    ["single", 300_000, 7_421],
    ["married_filing_jointly", 300_000, 6_983],
    ["head_of_household", 300_000, 7_302],
  ])(
    "uses the North Dakota full tax schedule for %s taxable income %d",
    async (filingStatus, taxableIncome, expectedTax) => {
      const artifacts = await buildArtifacts({
        adjustedGrossIncome: taxableIncome,
        builder: buildNdStateArtifacts,
        federalSummary: makeFederalSummary({
          line15_taxable_income: taxableIncome,
        }),
        inputReturn: makeReturn("ND", {
          filingStatus,
          spouse:
            filingStatus === "married_filing_jointly"
              ? {
                  person_id: "spouse",
                  date_of_birth: "1991-01-01",
                  is_blind: false,
                  can_be_claimed_as_dependent: false,
                }
              : null,
          stateFilingStatus: filingStatus,
          stateWithholding: null as any,
        }),
        stateCode: "ND",
      });

      expect(artifacts.nodes).toContainEqual(
        expect.objectContaining({ node_id: "nd.nd1.line8", value: expectedTax }),
      );
    },
  );

  it.each([
    ["single", 48_000, 936],
    ["married_filing_jointly", 90_000, 1_778],
    ["head_of_household", 60_000, 1_185],
  ])(
    "uses the North Dakota tax schedule for %s taxable income %d",
    async (filingStatus, taxableIncome, expectedTax) => {
      const artifacts = await buildArtifacts({
        adjustedGrossIncome: taxableIncome,
        builder: buildNdStateArtifacts,
        federalSummary: makeFederalSummary({
          line15_taxable_income: taxableIncome,
        }),
        inputReturn: makeReturn("ND", {
          filingStatus,
          spouse:
            filingStatus === "married_filing_jointly"
              ? {
                  person_id: "spouse",
                  date_of_birth: "1991-01-01",
                  is_blind: false,
                  can_be_claimed_as_dependent: false,
                }
              : null,
          stateFilingStatus: filingStatus,
          stateWithholding: null as any,
        }),
        stateCode: "ND",
      });

      expect(artifacts.nodes).toContainEqual(
        expect.objectContaining({ node_id: "nd.nd1.line8", value: expectedTax }),
      );
    },
  );

  it("derives Oklahoma itemized deductions from canonical facts without an estimate warning", async () => {
    const inputReturn = makeReturn("OK", {
      stateWithholding: null as any,
      pluginFactBag: {
        form511: {
          use_itemized_deductions: true,
        },
      },
    });

    inputReturn.facts.itemized_deductions.medical_and_dental_expenses = 10_000;
    inputReturn.facts.itemized_deductions.state_and_local_income_or_sales_taxes = 4_000;
    inputReturn.facts.itemized_deductions.real_estate_taxes = 2_000;
    inputReturn.facts.itemized_deductions.personal_property_taxes = 500;
    inputReturn.facts.itemized_deductions.other_taxes = 300;
    inputReturn.facts.itemized_deductions.mortgage_interest_items = [
      {
        source_document_id: "1098-1",
        mortgage_interest_received: 4_000,
        points_paid: 0,
        mortgage_insurance_premiums: 0,
        real_estate_taxes_paid: 0,
      },
    ];
    inputReturn.facts.itemized_deductions.charitable_cash_contributions = 3_000;
    inputReturn.facts.itemized_deductions.other_itemized_deductions = [
      { description: "misc", amount: 200 },
    ];

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildOkStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 24_000,
      }),
      inputReturn,
      stateCode: "OK",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "OK.itemized_deduction_estimated",
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ok.form511.line10", value: 20_000 }),
    );
  });

  it("warns when Oklahoma child-related credits are candidates but no override is supplied", async () => {
    const customReturn = makeReturn("OK", {
      stateWithholding: null as any,
    });

    customReturn.facts.credits.candidate_child_tax_credit_dependent_ids = ["dep-1"];

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildOkStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: customReturn,
      stateCode: "OK",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "OK.child_related_credit_not_claimed",
    );
  });

  it.each([
    ["single", 0, 6_350],
    ["married_filing_jointly", 20_000, 12_700],
    ["head_of_household", 20_000, 9_350],
    ["married_filing_separately", 20_000, 6_350],
  ])(
    "uses the Oklahoma standard deduction for %s",
    async (filingStatus, adjustedGrossIncome, expectedDeduction) => {
      const artifacts = await buildArtifacts({
        adjustedGrossIncome,
        builder: buildOkStateArtifacts,
        federalSummary: makeFederalSummary(),
        inputReturn: makeReturn("OK", {
          filingStatus,
          spouse:
            filingStatus === "married_filing_jointly" || filingStatus === "married_filing_separately"
              ? {
                  person_id: "spouse",
                  date_of_birth: "1991-01-01",
                  is_blind: false,
                  can_be_claimed_as_dependent: false,
                }
              : null,
          stateFilingStatus: filingStatus,
          stateWithholding: null as any,
        }),
        stateCode: "OK",
      });

      expect(artifacts.nodes).toContainEqual(
        expect.objectContaining({ node_id: "ok.form511.line10", value: expectedDeduction }),
      );
    },
  );

  it.each([
    [1_000, 3],
    [2_000, 10],
    [3_500, 32],
    [4_500, 57],
    [6_500, 128],
  ])("uses the Oklahoma lower tax brackets for taxable income %d", async (taxableIncome, expectedTax) => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: taxableIncome,
      builder: buildOkStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("OK", {
        stateWithholding: null as any,
        pluginFactBag: {
          form511: {
            exemption_amount: 0,
            standard_deduction_amount: 0,
          },
        },
      }),
      stateCode: "OK",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ok.form511.line14", value: expectedTax }),
    );
  });

  it("does not emit blanket Oklahoma multistate warnings without qualifying proration or credit facts", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildOkStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("OK", {
        requestedStates: ["OK", "TX"],
        stateWithholding: null as any,
      }),
      stateCode: "OK",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toEqual(
      expect.arrayContaining([
        "OK.other_state_credit_review",
        "OK.out_of_state_proration_not_modeled",
      ]),
    );
  });

  it.each([
    ["single", 10_000, 288],
    ["married_filing_jointly", 20_000, 574],
    ["head_of_household", 20_000, 574],
  ])(
    "uses the Oklahoma tax computation path for %s taxable income %d",
    async (filingStatus, adjustedGrossIncome, expectedTax) => {
      const artifacts = await buildArtifacts({
        adjustedGrossIncome,
        builder: buildOkStateArtifacts,
        federalSummary: makeFederalSummary(),
        inputReturn: makeReturn("OK", {
          filingStatus,
          spouse:
            filingStatus === "married_filing_jointly"
              ? {
                  person_id: "spouse",
                  date_of_birth: "1991-01-01",
                  is_blind: false,
                  can_be_claimed_as_dependent: false,
                }
              : null,
          stateFilingStatus: filingStatus,
          stateWithholding: null as any,
          pluginFactBag: {
            form511: {
              exemption_amount: 0,
              standard_deduction_amount: 0,
            },
          },
        }),
        stateCode: "OK",
      });

      expect(artifacts.nodes).toContainEqual(
        expect.objectContaining({ node_id: "ok.form511.line14", value: expectedTax }),
      );
    },
  );

  it("uses Rhode Island exemption and multistate credit overrides when supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 300_000,
      builder: buildRiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("RI", {
        requestedStates: ["RI", "CT"],
        stateWithholding: 1_000,
        pluginFactBag: {
          ri1040: {
            exemption_amount: 5_000,
            other_state_credit_amount: 400,
          },
        },
      }),
      stateCode: "RI",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ri.ri1040.line6", value: 5_000 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "RI.deduction_and_exemption_phaseout_applied",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "RI.other_state_credit_review",
    );
  });

  it.each([
    [50_000, 1_875],
    [100_000, 3_951],
    [200_000, 8_929],
  ])("uses the Rhode Island tax worksheet for taxable income %d", async (taxableIncome, expectedTax) => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: taxableIncome,
      builder: buildRiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("RI", {
        stateWithholding: null as any,
        pluginFactBag: {
          ri1040: {
            standard_deduction_amount: 0,
            exemption_amount: 0,
          },
        },
      }),
      stateCode: "RI",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ri.ri1040.line8", value: expectedTax }),
    );
  });

  it.each([
    ["single", 20_000, 10_900],
    ["head_of_household", 20_000, 16_350],
    ["married_filing_jointly", 20_000, 21_800],
  ])(
    "uses the Rhode Island standard deduction for %s",
    async (filingStatus, adjustedGrossIncome, expectedDeduction) => {
      const artifacts = await buildArtifacts({
        adjustedGrossIncome,
        builder: buildRiStateArtifacts,
        federalSummary: makeFederalSummary(),
        inputReturn: makeReturn("RI", {
          filingStatus,
          spouse:
            filingStatus === "married_filing_jointly"
              ? {
                  person_id: "spouse",
                  date_of_birth: "1991-01-01",
                  is_blind: false,
                  can_be_claimed_as_dependent: false,
                }
              : null,
          stateFilingStatus: filingStatus,
          stateWithholding: null as any,
        }),
        stateCode: "RI",
      });

      expect(artifacts.nodes).toContainEqual(
        expect.objectContaining({ node_id: "ri.ri1040.line4", value: expectedDeduction }),
      );
    },
  );

  it("returns zero Rhode Island tax when taxable income is zero", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 0,
      builder: buildRiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("RI", {
        stateWithholding: null as any,
        pluginFactBag: {
          ri1040: {
            standard_deduction_amount: 0,
            exemption_amount: 0,
          },
        },
      }),
      stateCode: "RI",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ri.ri1040.line8", value: 0 }),
    );
  });
});
