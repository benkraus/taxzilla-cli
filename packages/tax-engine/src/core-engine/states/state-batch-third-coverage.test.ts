import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildKsStateArtifacts } from "./ks/index";
import { buildStateArtifacts as buildMoStateArtifacts } from "./mo/index";
import { buildStateArtifacts as buildNeStateArtifacts } from "./ne/index";
import { buildStateArtifacts as buildVaStateArtifacts } from "./va/index";
import { buildStateArtifacts as buildWvStateArtifacts } from "./wv/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./test-helpers";

async function buildMissouriBracketArtifacts(args: {
  readonly filingStatus?: string;
  readonly stateFilingStatus?: string;
  readonly taxableIncome: number;
}) {
  return buildArtifacts({
    adjustedGrossIncome: args.taxableIncome,
    builder: buildMoStateArtifacts,
    federalSummary: makeFederalSummary(),
    inputReturn: makeReturn("MO", {
      filingStatus: args.filingStatus ?? "single",
      pluginFactBag: {
        mo1040: {
          deduction_amount: 0,
          federal_tax_deduction_amount: 0,
          other_deductions_amount: 0,
        },
      },
      stateFilingStatus: args.stateFilingStatus ?? args.filingStatus ?? "single",
      stateWithholding: null as any,
    }),
    stateCode: "MO",
  });
}

async function buildNebraskaBracketArtifacts(args: {
  readonly filingStatus: string;
  readonly taxableIncome: number;
}) {
  return buildArtifacts({
    adjustedGrossIncome: args.taxableIncome,
    builder: buildNeStateArtifacts,
    federalSummary: makeFederalSummary(),
    inputReturn: makeReturn("NE", {
      filingStatus: args.filingStatus,
      pluginFactBag: {
        form1040n: {
          personal_exemption_credit_amount: 0,
          standard_deduction_amount: 0,
        },
      },
      stateFilingStatus: args.filingStatus,
      stateWithholding: null as any,
    }),
    stateCode: "NE",
  });
}

async function buildVirginiaBracketArtifacts(taxableIncome: number) {
  return buildArtifacts({
    adjustedGrossIncome: taxableIncome,
    builder: buildVaStateArtifacts,
    federalSummary: makeFederalSummary(),
    inputReturn: makeReturn("VA", {
      pluginFactBag: {
        form760: {
          exemption_amount: 0,
          standard_deduction_amount: 0,
        },
      },
      stateFilingStatus: "single",
      stateWithholding: null as any,
    }),
    stateCode: "VA",
  });
}

async function buildWestVirginiaBracketArtifacts(args: {
  readonly filingStatus?: string;
  readonly taxableIncome: number;
}) {
  return buildArtifacts({
    adjustedGrossIncome: args.taxableIncome,
    builder: buildWvStateArtifacts,
    federalSummary: makeFederalSummary(),
    inputReturn: makeReturn("WV", {
      filingStatus: args.filingStatus ?? "single",
      pluginFactBag: {
        it140: {
          exemption_deduction_amount: 0,
          family_tax_credit_amount: 0,
        },
      },
      stateFilingStatus: args.filingStatus ?? "single",
      stateWithholding: null as any,
    }),
    stateCode: "WV",
  });
}

describe("resident state third batch coverage branches", () => {
  it("uses Kansas deduction and exemption overrides and suppresses the multistate warning when credit is supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildKsStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("KS", {
        filingStatus: "qualifying_surviving_spouse",
        requestedStates: ["KS", "MO"],
        spouse: {
          person_id: "spouse",
          date_of_birth: "1959-01-01",
          is_blind: false,
          can_be_claimed_as_dependent: false,
        },
        stateFilingStatus: "qualifying_surviving_spouse",
        stateWithholding: null as any,
        pluginFactBag: {
          k40: {
            credit_for_taxes_paid_to_other_states: 100,
            deduction_amount: 9_999,
            exemption_allowance_amount: 7_777,
          },
        },
      }),
      stateCode: "KS",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ks.k40.line4", value: 9_999 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ks.k40.line5", value: 7_777 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "KS.other_state_credit_review",
    );
  });

  it("emits a Kansas itemized-deduction fallback notice when itemized deductions are requested without a Kansas amount", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 25_000,
      builder: buildKsStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("KS", {
        requestedStates: ["KS", "NE"],
        stateFilingStatus: "single",
        stateWithholding: null as any,
        pluginFactBag: {
          k40: {
            use_itemized_deductions: true,
          },
        },
      }),
      stateCode: "KS",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["KS.itemized_deduction_defaulted_to_standard"]),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "KS.other_state_credit_review",
    );
  });

  it("uses the Kansas joint-rate path below the threshold", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildKsStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("KS", {
        filingStatus: "married_filing_jointly",
        spouse: {
          person_id: "spouse",
          date_of_birth: "1991-01-01",
          is_blind: false,
          can_be_claimed_as_dependent: false,
        },
        stateFilingStatus: "married_filing_jointly",
        stateWithholding: null as any,
        pluginFactBag: {
          k40: {
            deduction_amount: 0,
            exemption_allowance_amount: 0,
          },
        },
      }),
      stateCode: "KS",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ks.k40.line8", value: 1_040 }),
    );
  });

  it("uses Missouri deduction and federal-tax-deduction overrides", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildMoStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MO", {
        filingStatus: "qualifying_surviving_spouse",
        requestedStates: ["MO", "IL"],
        spouse: {
          person_id: "spouse",
          date_of_birth: "1991-01-01",
          is_blind: false,
          can_be_claimed_as_dependent: false,
        },
        stateFilingStatus: "qualifying_surviving_spouse",
        stateWithholding: null as any,
        pluginFactBag: {
          mo1040: {
            deduction_amount: 9_000,
            federal_tax_deduction_amount: 1_234,
            other_state_credit_amount: 50,
          },
        },
      }),
      stateCode: "MO",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "mo.mo1040.line13", value: 1_234 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "mo.mo1040.line14", value: 9_000 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MO.other_state_credit_review",
    );
  });

  it("emits Missouri deduction and multistate warnings when required inputs are missing", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildMoStateArtifacts,
      inputReturn: makeReturn("MO", {
        requestedStates: ["MO", "IA"],
        stateFilingStatus: "single",
        stateWithholding: null as any,
        pluginFactBag: {
          mo1040: {
            use_itemized_deductions: true,
          },
        },
      }),
      stateCode: "MO",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "MO.federal_tax_deduction_default_zero",
        "MO.itemized_deduction_standard_used",
        "MO.other_state_credit_review",
      ]),
    );
  });

  it.each([
    [1_000, 0],
    [2_000, 14],
    [3_000, 35],
    [4_500, 76],
    [6_000, 124],
    [7_000, 161],
    [8_500, 225],
    [10_000, 294],
  ])("uses the Missouri tax bracket for taxable income %d", async (taxableIncome, expectedTax) => {
    const artifacts = await buildMissouriBracketArtifacts({ taxableIncome });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "mo.mo1040.line30", value: expectedTax }),
    );
  });

  it("uses Nebraska standard deduction and personal-exemption overrides", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildNeStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("NE", {
        stateFilingStatus: "single",
        stateWithholding: null as any,
        pluginFactBag: {
          form1040n: {
            income_tax_amount: 500,
            personal_exemption_credit_amount: 400,
            standard_deduction_amount: 9_000,
          },
        },
      }),
      stateCode: "NE",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ne.form1040n.line6", value: 9_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ne.form1040n.line18", value: 400 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ne.form1040n.line15", value: 500 }),
    );
  });

  it("emits Nebraska itemized-estimate and multistate warnings when those credits are absent", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildNeStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 12_000,
      }),
      inputReturn: makeReturn("NE", {
        requestedStates: ["NE", "CO"],
        stateFilingStatus: "single",
        stateWithholding: null as any,
      }),
      stateCode: "NE",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "NE.itemized_deduction_derived_from_federal_schedule_a",
        "NE.other_state_credit_review",
      ]),
    );
  });

  it.each([
    ["single", 3_000, 74],
    ["single", 10_000, 309],
    ["single", 30_000, 1_099],
    ["single", 50_000, 2_122],
    ["married_filing_jointly", 5_000, 123],
    ["married_filing_jointly", 20_000, 618],
    ["married_filing_jointly", 60_000, 2_198],
    ["married_filing_jointly", 90_000, 3_724],
    ["head_of_household", 7_000, 172],
    ["head_of_household", 20_000, 623],
    ["head_of_household", 50_000, 1_847],
    ["head_of_household", 70_000, 2_873],
    ["married_filing_separately", 10_000, 309],
  ])(
    "uses the Nebraska tax calculation schedule for %s taxable income %d",
    async (filingStatus, taxableIncome, expectedTax) => {
      const artifacts = await buildNebraskaBracketArtifacts({ filingStatus, taxableIncome });

      expect(artifacts.nodes).toContainEqual(
        expect.objectContaining({ node_id: "ne.form1040n.line15", value: expectedTax }),
      );
    },
  );

  it("uses the Virginia generic fallback for combined separate filings", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildVaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("VA", {
        stateFilingStatus: "4",
        stateWithholding: 100,
      }),
      stateCode: "VA",
    });

    expect(artifacts.summary.total_tax).toBe(0);
    expect(artifacts.summary.total_payments).toBe(0);
  });

  it("uses the Virginia itemized branch when the federal return itemizes", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildVaStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 9_000,
      }),
      inputReturn: makeReturn("VA", {
        stateFilingStatus: "single",
        stateWithholding: null as any,
      }),
      stateCode: "VA",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "va.form760.line10", value: 9_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "va.form760.line11", value: 0 }),
    );
  });

  it("emits Virginia age-deduction and multistate warnings when those inputs are absent", async () => {
    const inputReturn = makeReturn("VA", {
      requestedStates: ["VA", "NC"],
      stateFilingStatus: "single",
      stateWithholding: null as any,
      taxpayer: {
        date_of_birth: "1950-01-01",
      },
    });
    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [
        {
          jurisdiction_level: "state",
          state_code: "NC",
          tax_type: "withholding",
          person_id: "taxpayer",
          locality_code: null,
          amount: 300,
          source_document_id: "w2-1",
          payer_state_code: "NC",
          work_state_code: "NC",
        },
      ],
      other_state_tax_credit_claims: [],
      local_jurisdictions: [],
      overrides: [],
    };
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildVaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "VA",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["VA.age_deduction_computed", "VA.other_state_credit_review"]),
    );
  });

  it.each([
    [2_000, 40],
    [4_000, 90],
    [10_000, 370],
    [20_000, 893],
  ])("uses the Virginia tax bracket for taxable income %d", async (taxableIncome, expectedTax) => {
    const artifacts = await buildVirginiaBracketArtifacts(taxableIncome);

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "va.form760.line16", value: expectedTax }),
    );
  });

  it("uses West Virginia low-income, exemption, and income-tax overrides", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildWvStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("WV", {
        requestedStates: ["WV", "PA"],
        stateFilingStatus: "single",
        stateWithholding: null as any,
        pluginFactBag: {
          it140: {
            exemption_deduction_amount: 7_000,
            family_tax_credit_amount: 50,
            income_tax_amount: 123,
            low_income_earned_income_exclusion_amount: 500,
            tax_paid_to_other_state_credit: 20,
          },
        },
      }),
      stateCode: "WV",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "wv.it140.line5", value: 500 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "wv.it140.line6", value: 7_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "wv.it140.line8", value: 123 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "WV.other_state_credit_review",
    );
  });

  it("uses the West Virginia minimum exemption amount when the return has no exemptions", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 5_000,
      builder: buildWvStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("WV", {
        householdCanBeClaimedAsDependent: true,
        stateFilingStatus: "single",
        stateWithholding: null as any,
        taxpayer: {
          can_be_claimed_as_dependent: true,
        },
      }),
      stateCode: "WV",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "wv.it140.line6", value: 500 }),
    );
  });

  it("emits all West Virginia warnings when override-only inputs are absent", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 5_000,
      builder: buildWvStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("WV", {
        requestedStates: ["WV", "VA"],
        stateFilingStatus: "single",
        stateWithholding: null as any,
      }),
      stateCode: "WV",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "WV.low_income_exclusion_not_claimed",
        "WV.family_tax_credit_not_claimed",
        "WV.other_state_credit_review",
      ]),
    );
  });

  it.each([
    [undefined, 5_000, 111],
    [undefined, 15_000, 370],
    [undefined, 30_000, 833],
    [undefined, 50_000, 1_610],
    [undefined, 70_000, 2_536],
    ["married_filing_separately", 4_000, 89],
    ["married_filing_separately", 8_000, 200],
    ["married_filing_separately", 15_000, 416],
    ["married_filing_separately", 25_000, 805],
    ["married_filing_separately", 35_000, 1_268],
  ])(
    "uses the West Virginia tax schedule for filing status %s taxable income %d",
    async (filingStatus, taxableIncome, expectedTax) => {
      const artifacts = await buildWestVirginiaBracketArtifacts({
        filingStatus: filingStatus as string | undefined,
        taxableIncome,
      });

      expect(artifacts.nodes).toContainEqual(
        expect.objectContaining({ node_id: "wv.it140.line8", value: expectedTax }),
      );
    },
  );
});
