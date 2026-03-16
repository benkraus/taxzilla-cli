import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildIlStateArtifacts } from "./core-engine/states/il/index";
import { buildStateArtifacts as buildKyStateArtifacts } from "./core-engine/states/ky/index";
import { buildStateArtifacts as buildMaStateArtifacts } from "./core-engine/states/ma/index";
import { buildStateArtifacts as buildMiStateArtifacts } from "./core-engine/states/mi/index";
import { buildStateArtifacts as buildNcStateArtifacts } from "./core-engine/states/nc/index";
import { buildStateArtifacts as buildPaStateArtifacts } from "./core-engine/states/pa/index";
import { buildStateArtifacts as buildUtStateArtifacts } from "./core-engine/states/ut/index";
import {
  getStateManifest,
  makeFederalSummary,
  makeReturn,
  parseInput,
} from "./core-engine.state-test-helpers";
import {
  calculateResidentStatePayments,
  countPersonalExemptions,
  createStateNode,
  getFederalDeductionBase,
  normalizeResidentFilingStatus,
  readNamedAmountArray,
  readNamedAmountArrayTotal,
  readPluginPaymentTotal,
} from "./core-engine/states/resident";

describe("resident state helper coverage", () => {
  it("normalizes resident filing-status aliases", async () => {
    const jointInput = await parseInput(
      makeReturn("IL", {
        filingStatus: "single",
        stateFilingStatus: "married_filing_jointly",
      }),
    );
    const mfsInput = await parseInput(
      makeReturn("IL", {
        filingStatus: "single",
        stateFilingStatus: "mfs",
      }),
    );
    const hohInput = await parseInput(
      makeReturn("IL", {
        filingStatus: "single",
        stateFilingStatus: "hoh",
      }),
    );

    expect(normalizeResidentFilingStatus(jointInput, jointInput.state_returns.IL!)).toBe(
      "married_filing_jointly",
    );
    expect(normalizeResidentFilingStatus(mfsInput, mfsInput.state_returns.IL!)).toBe(
      "married_filing_separately",
    );
    expect(normalizeResidentFilingStatus(hohInput, hohInput.state_returns.IL!)).toBe(
      "head_of_household",
    );
  });

  it("reads named plugin amounts, payment totals, and deduction bases", () => {
    expect(
      readNamedAmountArray([
        { description: "valid", amount: 20 },
        { description: "skip" },
        "invalid",
      ]),
    ).toEqual([{ description: "valid", amount: 20 }]);
    expect(
      readNamedAmountArrayTotal([
        { description: "first", amount: 20 },
        { amount: 5.4 },
      ]),
    ).toBe(25);
    expect(
      readPluginPaymentTotal({
        additional_payments: [{ amount: 30 }],
        county_withholding: 20,
        estimated_payments: 10,
        extension_payment: 15,
        other_payments: 5,
        payment_carryforward: 7,
        prior_year_credit: 8,
        withholding: 40,
      }),
    ).toBe(135);
    expect(getFederalDeductionBase(undefined, "single")).toBe(15_750);
    expect(
      getFederalDeductionBase(
        makeFederalSummary({
          deduction_strategy: "itemized",
          itemized_deduction_total: 18_000,
        }),
        "single",
      ),
    ).toBe(18_000);
  });

  it("uses explicit state payments and fallback payment flows", () => {
    const explicitPayments = calculateResidentStatePayments({
      additionalPaymentTotal: 25,
      input: {
        facts: {
          payments: {
            estimated_payments: [],
            extension_payments: [],
            withholdings: [],
          },
        },
      } as any,
      refundableCreditsTotal: 40,
      stateCode: "IL",
      stateReturn: {
        state_code: "IL",
        state_payments: [{ amount: 100 }],
      } as any,
    });
    const fallbackPayments = calculateResidentStatePayments({
      additionalPaymentTotal: 25,
      input: {
        facts: {
          payments: {
            estimated_payments: [{ jurisdiction: "state", state_code: "IL", amount: 10 }],
            extension_payments: [{ jurisdiction: "state", state_code: "IL", amount: 15 }],
            withholdings: [{ jurisdiction: "state", state_code: "IL", amount: 50 }],
          },
        },
      } as any,
      refundableCreditsTotal: 40,
      stateCode: "IL",
      stateReturn: {
        state_code: "IL",
        state_payments: [],
      } as any,
    });

    expect(explicitPayments.totalPayments).toBe(140);
    expect(fallbackPayments.totalPayments).toBe(140);
  });

  it("defaults optional payment totals and state-node data types", () => {
    const defaultedPayments = calculateResidentStatePayments({
      input: {
        facts: {
          payments: {
            estimated_payments: [],
            extension_payments: [],
            withholdings: [],
          },
        },
      } as any,
      stateCode: "IL",
      stateReturn: {
        state_code: "IL",
        state_payments: [],
      } as any,
    });
    const moneyNode = createStateNode({
      formCode: undefined,
      formulaRef: "money value",
      jurisdiction: "IL",
      label: "Money node",
      lineCode: "line1",
      moduleId: "test.module",
      nodeId: "test.money",
      nodeType: "summary",
      value: 1,
    });
    const stringNode = createStateNode({
      formCode: undefined,
      formulaRef: "string value",
      jurisdiction: "IL",
      label: "String node",
      lineCode: "line2",
      moduleId: "test.module",
      nodeId: "test.string",
      nodeType: "summary",
      value: "ready",
    });
    const booleanNode = createStateNode({
      dataType: "boolean",
      formCode: undefined,
      formulaRef: "boolean value",
      jurisdiction: "IL",
      label: "Boolean node",
      lineCode: "line3",
      moduleId: "test.module",
      nodeId: "test.boolean",
      nodeType: "summary",
      value: true,
    });

    expect(defaultedPayments.additionalPaymentTotal).toBe(0);
    expect(defaultedPayments.refundableCreditsTotal).toBe(0);
    expect(moneyNode.data_type).toBe("money");
    expect(stringNode.data_type).toBe("string");
    expect(booleanNode.data_type).toBe("boolean");
  });

  it("counts joint and single personal exemptions with dependent-claim rules", async () => {
    const jointInput = await parseInput(
      makeReturn("KY", {
        filingStatus: "married_filing_jointly",
        spouse: {
          person_id: "spouse",
          date_of_birth: "1991-01-01",
          can_be_claimed_as_dependent: true,
        },
      }),
    );
    const dependentSingleInput = await parseInput(
      makeReturn("IL", {
        taxpayer: {
          can_be_claimed_as_dependent: true,
        },
      }),
    );

    expect(countPersonalExemptions(jointInput, "married_filing_jointly")).toBe(1);
    expect(countPersonalExemptions(dependentSingleInput, "single")).toBe(0);
  });

  it("falls back to federal filing status when the state return does not supply one", async () => {
    const customReturn = makeReturn("IL", {
      filingStatus: "head_of_household",
    });

    delete customReturn.state_returns.IL.state_filing_status;

    const input = await parseInput(customReturn);

    expect(normalizeResidentFilingStatus(input, input.state_returns.IL!)).toBe("head_of_household");
  });

  it("uses household-level dependent flags when person-level values are absent", async () => {
    const input = await parseInput(
      makeReturn("KY", {
        filingStatus: "married_filing_jointly",
        householdCanBeClaimedAsDependent: true,
        spouse: {
          person_id: "spouse",
          date_of_birth: "1991-01-01",
          can_be_claimed_as_dependent: undefined,
        },
        stateFilingStatus: "married_filing_jointly",
        taxpayer: {
          can_be_claimed_as_dependent: undefined,
        },
      }),
    );

    expect(countPersonalExemptions(input, "married_filing_jointly")).toBe(0);
  });

  it("falls back to non-dependent treatment when no dependent flags are provided", async () => {
    const customReturn = makeReturn("KY", {
      filingStatus: "married_filing_jointly",
      spouse: {
        person_id: "spouse",
        date_of_birth: "1991-01-01",
        can_be_claimed_as_dependent: undefined,
      },
      stateFilingStatus: "married_filing_jointly",
      taxpayer: {
        can_be_claimed_as_dependent: undefined,
      },
    });

    customReturn.household.can_be_claimed_as_dependent = undefined;

    const input = await parseInput(customReturn);

    expect(countPersonalExemptions(input, "married_filing_jointly")).toBe(2);
  });

  it("builds default or omitted spouse data through the shared test helper", () => {
    const jointReturn = makeReturn("KY", {
      filingStatus: "married_filing_jointly",
    });
    const spouseNullReturn = makeReturn("IL", {
      spouse: null,
    });

    expect(jointReturn.household.spouse).toEqual({
      person_id: "spouse",
      date_of_birth: "1991-01-01",
      is_blind: false,
      can_be_claimed_as_dependent: false,
    });
    expect(spouseNullReturn.household.spouse).toBeUndefined();
  });
});

describe("resident state alternate branches", () => {
  it("applies Illinois exemption overrides and the AGI cliff", async () => {
    const overrideReturn = makeReturn("IL", {
      pluginFactBag: {
        il1040: {
          personal_exemption_override: 1_234,
        },
      },
      stateWithholding: 100,
    });
    const cliffReturn = makeReturn("IL", {
      filingStatus: "married_filing_jointly",
      spouse: {
        person_id: "spouse",
        date_of_birth: "1991-01-01",
      },
      stateFilingStatus: "married_filing_jointly",
      stateWithholding: 100,
    });
    const overrideInput = await parseInput(overrideReturn);
    const cliffInput = await parseInput(cliffReturn);

    const overrideArtifacts = buildIlStateArtifacts({
      adjustedGrossIncome: 100_000,
      federalSummary: makeFederalSummary(),
      input: overrideInput,
      manifest: getStateManifest("IL"),
      stateReturn: overrideInput.state_returns.IL!,
    });
    const cliffArtifacts = buildIlStateArtifacts({
      adjustedGrossIncome: 600_000,
      federalSummary: makeFederalSummary(),
      input: cliffInput,
      manifest: getStateManifest("IL"),
      stateReturn: cliffInput.state_returns.IL!,
    });

    expect(overrideArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "il.il1040.line10", value: 1_234 }),
    );
    expect(cliffArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "il.il1040.line10", value: 0 }),
    );
  });

  it("suppresses the Illinois dependent-taxpayer warning when an override is supplied", async () => {
    const customReturn = makeReturn("IL", {
      householdCanBeClaimedAsDependent: true,
      pluginFactBag: {
        il1040: {
          personal_exemption_override: 500,
        },
      },
      stateWithholding: 100,
      taxpayer: {
        can_be_claimed_as_dependent: undefined,
      },
    });
    const input = await parseInput(customReturn);
    const artifacts = buildIlStateArtifacts({
      adjustedGrossIncome: 20_000,
      federalSummary: makeFederalSummary(),
      input,
      manifest: getStateManifest("IL"),
      stateReturn: input.state_returns.IL!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "il.il1040.line10", value: 500 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "IL.dependent_taxpayer_exemption_override_missing",
    );
  });

  it("applies Kentucky overrides and refundable credits without the family-size warning", async () => {
    const customReturn = makeReturn("KY", {
      dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
      pluginFactBag: {
        form740: {
          additional_payments: [{ amount: 10 }],
          family_size_tax_credit_refund: 80,
          nonrefundable_credits: [{ amount: 50 }],
          other_taxes: 100,
          pass_through_entity_credit_refund: 40,
          refundable_credits: [{ amount: 25 }],
          schedule_m_additions: [{ amount: 1_000 }],
          schedule_m_subtractions: [{ amount: 200 }],
          standard_deduction_override: 4_000,
          withholding: 20,
        },
      },
    });
    const input = await parseInput(customReturn);
    const artifacts = buildKyStateArtifacts({
      adjustedGrossIncome: 20_000,
      federalSummary: makeFederalSummary(),
      input,
      manifest: getStateManifest("KY"),
      stateReturn: input.state_returns.KY!,
    });

    expect(artifacts.summary).toMatchObject({
      taxable_income: 16_800,
      total_tax: 642,
      total_payments: 95,
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "KY.family_size_tax_credit_missing",
    );
  });

  it("skips the Kentucky family-size warning when there are no dependents", async () => {
    const customReturn = makeReturn("KY", {
      stateWithholding: 100,
    });
    const input = await parseInput(customReturn);
    const artifacts = buildKyStateArtifacts({
      adjustedGrossIncome: 20_000,
      federalSummary: makeFederalSummary(),
      input,
      manifest: getStateManifest("KY"),
      stateReturn: input.state_returns.KY!,
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "KY.family_size_tax_credit_missing",
    );
  });

  it("disables Michigan EITC when the state plugin explicitly turns it off", async () => {
    const customReturn = makeReturn("MI", {
      pluginFactBag: {
        mi1040: {
          claim_michigan_eitc: false,
        },
      },
      stateWithholding: 100,
    });
    const input = await parseInput(customReturn);
    const artifacts = buildMiStateArtifacts({
      adjustedGrossIncome: 20_000,
      federalSummary: makeFederalSummary({
        line27a_earned_income_credit: 2_000,
      }),
      input,
      manifest: getStateManifest("MI"),
      stateReturn: input.state_returns.MI!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "mi.mi1040.line28", value: 0 }),
    );
  });

  it("uses zero federal EIC and suppresses the Michigan retirement warning when subtractions are supplied", async () => {
    const customReturn = makeReturn("MI", {
      pluginFactBag: {
        mi1040: {
          claim_michigan_eitc: true,
          subtractions: [{ amount: 500 }],
        },
      },
      retirementDistributions: [
        {
          source_document_id: "1099r-1",
          gross_distribution: 5_000,
          taxable_amount: 5_000,
          distribution_codes: ["7"],
          ira_sep_simple: false,
        },
      ],
      stateWithholding: 100,
    });
    const input = await parseInput(customReturn);
    const artifacts = buildMiStateArtifacts({
      adjustedGrossIncome: 20_000,
      input,
      manifest: getStateManifest("MI"),
      stateReturn: input.state_returns.MI!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "mi.mi1040.line28", value: 0 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MI.retirement_subtraction_review",
    );
  });

  it("does not trigger Michigan retirement review for a younger filer with pension income", async () => {
    const customReturn = makeReturn("MI", {
      retirementDistributions: [
        {
          source_document_id: "1099r-1",
          gross_distribution: 5_000,
          taxable_amount: 5_000,
          distribution_codes: ["7"],
          ira_sep_simple: false,
        },
      ],
      stateWithholding: 100,
    });
    const input = await parseInput(customReturn);
    const artifacts = buildMiStateArtifacts({
      adjustedGrossIncome: 20_000,
      federalSummary: makeFederalSummary(),
      input,
      manifest: getStateManifest("MI"),
      stateReturn: input.state_returns.MI!,
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MI.retirement_subtraction_review",
    );
  });

  it("flags Michigan retirement review for an age-eligible filer with pension income and no subtraction", async () => {
    const customReturn = makeReturn("MI", {
      retirementDistributions: [
        {
          source_document_id: "1099r-1",
          gross_distribution: 5_000,
          taxable_amount: 5_000,
          distribution_codes: ["7"],
          ira_sep_simple: false,
        },
      ],
      stateWithholding: 100,
      taxpayer: {
        date_of_birth: "1958-01-01",
      },
    });
    const input = await parseInput(customReturn);
    const artifacts = buildMiStateArtifacts({
      adjustedGrossIncome: 20_000,
      federalSummary: makeFederalSummary(),
      input,
      manifest: getStateManifest("MI"),
      stateReturn: input.state_returns.MI!,
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "MI.retirement_subtraction_review",
    );
  });

  it("ignores Michigan retirement warnings when only taxable amounts are present without gross distributions", async () => {
    const customReturn = makeReturn("MI", {
      retirementDistributions: [
        {
          source_document_id: "1099r-1",
          taxable_amount: 5_000,
          distribution_codes: ["7"],
          ira_sep_simple: false,
        },
      ],
      stateWithholding: 100,
    });
    const input = await parseInput(customReturn);
    const artifacts = buildMiStateArtifacts({
      adjustedGrossIncome: 20_000,
      federalSummary: makeFederalSummary(),
      input,
      manifest: getStateManifest("MI"),
      stateReturn: input.state_returns.MI!,
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MI.retirement_subtraction_review",
    );
  });

  it("uses the North Carolina standard deduction when no federal summary is supplied", async () => {
    const customReturn = makeReturn("NC", {
      stateWithholding: 100,
    });
    const input = await parseInput(customReturn);
    const artifacts = buildNcStateArtifacts({
      adjustedGrossIncome: 30_000,
      input,
      manifest: getStateManifest("NC"),
      stateReturn: input.state_returns.NC!,
    });

    expect(artifacts.summary.taxable_income).toBe(17_250);
  });

  it("adds Pennsylvania tax forgiveness into refundable payments", async () => {
    const customReturn = makeReturn("PA", {
      stateWithholding: 100,
      wages: [
        {
          person_id: "taxpayer",
          source_document_id: "w2-1",
          wages_tips_other_compensation: 10_000,
          federal_income_tax_withheld: 0,
        },
      ],
      pluginFactBag: {
        pa40: {
          tax_forgiveness_credit: 200,
        },
      },
    });
    const input = await parseInput(customReturn);
    const artifacts = buildPaStateArtifacts({
      adjustedGrossIncome: 10_000,
      federalSummary: makeFederalSummary(),
      input,
      manifest: getStateManifest("PA"),
      stateReturn: input.state_returns.PA!,
    });

    expect(artifacts.summary.total_payments).toBe(300);
  });

  it("uses the Utah itemized-deduction credit path and removes state tax from the base", async () => {
    const customReturn = makeReturn("UT", {
      dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
      saltDeduction: 5_000,
    });
    const input = await parseInput(customReturn);
    const artifacts = buildUtStateArtifacts({
      adjustedGrossIncome: 50_000,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 20_000,
      }),
      input,
      manifest: getStateManifest("UT"),
      stateReturn: input.state_returns.UT!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ut.tc40.line18", value: 613 }),
    );
  });

  it("uses Utah taxpayer credit overrides and dependent exemption overrides", async () => {
    const customReturn = makeReturn("UT", {
      pluginFactBag: {
        tc40: {
          additions: [{ amount: 500 }],
          dependent_exemption_count: 2,
          refundable_credits: [{ amount: 50 }],
          subtractions: [{ amount: 200 }],
          taxpayer_tax_credit_override: 400,
        },
      },
    });
    const input = await parseInput(customReturn);
    const artifacts = buildUtStateArtifacts({
      adjustedGrossIncome: 40_000,
      federalSummary: makeFederalSummary(),
      input,
      manifest: getStateManifest("UT"),
      stateReturn: input.state_returns.UT!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ut.tc40.line18", value: 400 }),
    );
    expect(artifacts.summary.total_payments).toBe(50);
  });

  it("uses zero SALT removal when Utah itemized federal data omits that amount", async () => {
    const customReturn = makeReturn("UT");

    customReturn.facts.itemized_deductions.state_and_local_income_or_sales_taxes = undefined;

    const input = await parseInput(customReturn);
    const artifacts = buildUtStateArtifacts({
      adjustedGrossIncome: 40_000,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 20_000,
      }),
      input,
      manifest: getStateManifest("UT"),
      stateReturn: input.state_returns.UT!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ut.tc40.line18", value: 917 }),
    );
  });

  it("uses Massachusetts no-tax-status overrides when supplied", async () => {
    const customReturn = makeReturn("MA", {
      pluginFactBag: {
        form1: {
          no_tax_status_applies: true,
        },
      },
      stateWithholding: 100,
    });
    const input = await parseInput(customReturn);
    const artifacts = buildMaStateArtifacts({
      adjustedGrossIncome: 20_000,
      federalSummary: makeFederalSummary(),
      input,
      manifest: getStateManifest("MA"),
      stateReturn: input.state_returns.MA!,
    });

    expect(artifacts.summary.total_tax).toBe(0);
  });

  it("uses Massachusetts gross-income and limited-income overrides when supplied", async () => {
    const customReturn = makeReturn("MA", {
      pluginFactBag: {
        form1: {
          limited_income_credit_amount: 100,
          massachusetts_gross_income_override: 25_000,
        },
      },
      stateWithholding: 100,
    });
    const input = await parseInput(customReturn);
    const artifacts = buildMaStateArtifacts({
      adjustedGrossIncome: 20_000,
      federalSummary: makeFederalSummary({
        line10_adjustments: 500,
      }),
      input,
      manifest: getStateManifest("MA"),
      stateReturn: input.state_returns.MA!,
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MA.gross_income_override_missing",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MA.gross_income_derived_from_federal_adjustments",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MA.low_income_adjustments_not_claimed",
    );
  });

  it("skips the Massachusetts gross-income warning when federal adjustments are absent", async () => {
    const customReturn = makeReturn("MA", {
      stateWithholding: 100,
    });
    const input = await parseInput(customReturn);
    const artifacts = buildMaStateArtifacts({
      adjustedGrossIncome: 20_000,
      federalSummary: makeFederalSummary({
        line10_adjustments: 500,
      }),
      input,
      manifest: getStateManifest("MA"),
      stateReturn: input.state_returns.MA!,
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "MA.gross_income_derived_from_federal_adjustments",
    );
  });
});
