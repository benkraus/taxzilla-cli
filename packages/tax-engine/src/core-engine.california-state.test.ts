import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  evaluateTy2025CoreEngine,
  sampleReturnTy2025,
  sampleStatePluginCaTy2025,
} from "./index";
import {
  parseCanonicalReturnEnvelopeEffect,
  parseCoreEngineInputEffect,
} from "./core-engine/references";
import {
  buildCaliforniaStateArtifacts,
  calculateCaliforniaExemptionCredits,
  calculateCaliforniaLine31Tax,
  calculateCaliforniaRegularTaxFromRateSchedule,
  calculateCaliforniaTaxTableAmount,
  normalizeCaliforniaFilingStatus,
} from "./core-engine/states/ca/index";
import { buildStateArtifacts } from "./core-engine/states";

function cloneReturn(): any {
  return structuredClone(sampleReturnTy2025);
}

async function parseInput(customReturn?: any) {
  const canonicalReturn = await Effect.runPromise(
    parseCanonicalReturnEnvelopeEffect(customReturn ?? cloneReturn()),
  );

  return Effect.runPromise(parseCoreEngineInputEffect(canonicalReturn));
}

describe("California state engine helpers", () => {
  it("normalizes California filing statuses from state and federal input", async () => {
    const input = await parseInput();
    const singleStateReturn = input.state_returns.CA!;

    expect(normalizeCaliforniaFilingStatus(singleStateReturn, input)).toBe("single_or_mfs");

    const headOfHouseholdReturn = cloneReturn();
    headOfHouseholdReturn.household.filing_status = "head_of_household";
    headOfHouseholdReturn.state_returns.CA.state_filing_status = "Head of Household";
    const headOfHouseholdInput = await parseInput(headOfHouseholdReturn);

    expect(
      normalizeCaliforniaFilingStatus(headOfHouseholdInput.state_returns.CA!, headOfHouseholdInput),
    ).toBe("head_of_household");

    const jointFallbackReturn = cloneReturn();
    jointFallbackReturn.household.filing_status = "married_filing_jointly";
    delete jointFallbackReturn.state_returns.CA.state_filing_status;
    const jointFallbackInput = await parseInput(jointFallbackReturn);

    expect(
      normalizeCaliforniaFilingStatus(jointFallbackInput.state_returns.CA!, jointFallbackInput),
    ).toBe("joint_or_qss");

    const survivingSpouseReturn = cloneReturn();
    survivingSpouseReturn.state_returns.CA.state_filing_status = "qss";
    const survivingSpouseInput = await parseInput(survivingSpouseReturn);

    expect(
      normalizeCaliforniaFilingStatus(
        survivingSpouseInput.state_returns.CA!,
        survivingSpouseInput,
      ),
    ).toBe("joint_or_qss");

    const spelledOutSurvivingSpouseReturn = cloneReturn();
    spelledOutSurvivingSpouseReturn.state_returns.CA.state_filing_status =
      "qualifying surviving spouse";
    const spelledOutSurvivingSpouseInput = await parseInput(spelledOutSurvivingSpouseReturn);

    expect(
      normalizeCaliforniaFilingStatus(
        spelledOutSurvivingSpouseInput.state_returns.CA!,
        spelledOutSurvivingSpouseInput,
      ),
    ).toBe("joint_or_qss");

    const headFallbackReturn = cloneReturn();
    headFallbackReturn.household.filing_status = "head_of_household";
    delete headFallbackReturn.state_returns.CA.state_filing_status;
    const headFallbackInput = await parseInput(headFallbackReturn);

    expect(
      normalizeCaliforniaFilingStatus(headFallbackInput.state_returns.CA!, headFallbackInput),
    ).toBe("head_of_household");

    const numericHeadOfHouseholdReturn = cloneReturn();
    numericHeadOfHouseholdReturn.state_returns.CA.state_filing_status = "4";
    const numericHeadOfHouseholdInput = await parseInput(numericHeadOfHouseholdReturn);

    expect(
      normalizeCaliforniaFilingStatus(
        numericHeadOfHouseholdInput.state_returns.CA!,
        numericHeadOfHouseholdInput,
      ),
    ).toBe("head_of_household");

    const singleFallbackReturn = cloneReturn();
    delete singleFallbackReturn.state_returns.CA.state_filing_status;
    const singleFallbackInput = await parseInput(singleFallbackReturn);

    expect(
      normalizeCaliforniaFilingStatus(singleFallbackInput.state_returns.CA!, singleFallbackInput),
    ).toBe("single_or_mfs");
  });

  it("matches the official 2025 California tax table and rate schedule examples", () => {
    expect(calculateCaliforniaRegularTaxFromRateSchedule(0, "single_or_mfs")).toBe(0);
    expect(calculateCaliforniaTaxTableAmount(50, "single_or_mfs")).toBe(0);
    expect(calculateCaliforniaTaxTableAmount(11_151, "single_or_mfs")).toBe(113);
    expect(
      calculateCaliforniaLine31Tax({
        filingStatus: "joint_or_qss",
        taxableIncome: 125_000,
      }),
    ).toEqual({
      line31Tax: 4_768,
      taxComputationMethod: "tax_rate_schedule",
    });
  });

  it("applies the California exemption credit phaseout with the correct MFS step size", () => {
    expect(
      calculateCaliforniaExemptionCredits({
        blindCount: 1,
        dependentCount: 1,
        federalAdjustedGrossIncome: 254_800,
        filingStatus: "single_or_mfs",
        isMarriedFilingSeparately: false,
        personalCount: 1,
        seniorCount: 0,
      }),
    ).toMatchObject({
      reductionStepCount: 2,
      seniorOrBlindCreditAmount: 282,
      dependentCreditAmount: 463,
      line32ExemptionCredits: 745,
    });

    expect(
      calculateCaliforniaExemptionCredits({
        blindCount: 0,
        dependentCount: 0,
        federalAdjustedGrossIncome: 255_000,
        filingStatus: "single_or_mfs",
        isMarriedFilingSeparately: true,
        personalCount: 1,
        seniorCount: 0,
      }),
    ).toMatchObject({
      reductionStepCount: 3,
      seniorOrBlindCreditAmount: 135,
      line32ExemptionCredits: 135,
    });
  });
});

describe("California state engine runtime", () => {
  it("computes a resident California return with itemized deductions, plugin credits, and payment fallback", async () => {
    const californiaReturn = cloneReturn();

    californiaReturn.state_returns.CA.state_payments = [];
    californiaReturn.state_returns.CA.additions = [{ description: "State addition", amount: 50 }];
    californiaReturn.state_returns.CA.subtractions = [
      { description: "State subtraction", amount: 25 },
    ];
    californiaReturn.state_returns.CA.state_specific_income_items = [
      { description: "State-specific income", amount: 200 },
    ];
    californiaReturn.state_returns.CA.state_specific_deductions = [
      { description: "State-specific deduction", amount: 100 },
    ];
    californiaReturn.state_returns.CA.state_specific_credits = [
      { description: "Rent credit carryover", amount: 100 },
    ];
    californiaReturn.state_returns.CA.plugin_fact_bag = {
      schedule_ca: {
        additions: [],
        subtractions: [],
        itemized_deductions_total: 8000,
      },
      form540: {
        line34_other_tax: 50,
        line61_alternative_minimum_tax: 25,
        line63_other_taxes_and_credit_recapture: 10,
        line73_withholding: 100,
        refundable_credits: [{ description: "Refundable renter credit", amount: 200 }],
        use_tax: 40,
        individual_shared_responsibility_penalty: 30,
      },
    };
    californiaReturn.facts.payments.estimated_payments.push({
      jurisdiction: "state",
      state_code: "CA",
      amount: 150,
    });
    californiaReturn.facts.payments.extension_payments.push({
      jurisdiction: "state",
      state_code: "CA",
      amount: 50,
    });

    const input = await parseInput(californiaReturn);
    const stateReturn = input.state_returns.CA!;
    const artifacts = buildCaliforniaStateArtifacts({
      federalAdjustedGrossIncome: 85_045.32,
      input,
      manifest: sampleStatePluginCaTy2025 as any,
      stateReturn,
    });

    expect(artifacts.summary).toEqual({
      state_code: "CA",
      plugin_manifest_id: "ca.ty2025.stub.v1",
      adjusted_gross_income_or_starting_point: 85_270,
      taxable_income: 77_170,
      total_tax: 3_450,
      total_payments: 4_700,
      refund_amount: 1_180,
      amount_owed: 0,
    });
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "ca.form540.line18",
        value: 8_100,
      }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "ca.form540.line64",
        value: 3_450,
      }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "ca.form540.line78",
        value: 4_700,
      }),
    );
    expect(artifacts.validationResults).toContainEqual({
      rule_id: "CA.form540.state_payments.fallback",
      severity: "info",
      status: "pass",
      message:
        "California payments fell back to canonical state withholding, estimated payment, and extension payment facts because state_return.state_payments was empty.",
      node_ids: ["ca.form540.line78"],
    });
    expect(artifacts.validationResults).toContainEqual({
      rule_id: "CA.form540.refundable_credits.applied",
      severity: "info",
      status: "pass",
      message:
        "California refundable credits from plugin_fact_bag.form540 were included in total payments before refund or balance due was computed.",
      node_ids: ["ca.form540.line78", "ca.form540.line97", "ca.form540.line100"],
    });
  });

  it("ignores malformed plugin-bag named amounts that do not include numeric amounts", async () => {
    const californiaReturn = cloneReturn();

    californiaReturn.state_returns.CA.plugin_fact_bag = {
      form540: {
        nonrefundable_credits: [{ description: "Ignored malformed credit" }, { amount: 10 }],
      },
    };

    const input = await parseInput(californiaReturn);
    const artifacts = buildCaliforniaStateArtifacts({
      federalAdjustedGrossIncome: 85_045.32,
      input,
      manifest: sampleStatePluginCaTy2025 as any,
      stateReturn: input.state_returns.CA!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "ca.form540.line47",
        value: 10,
      }),
    );
  });

  it("uses the California dependent standard deduction worksheet when the filer can be claimed", async () => {
    const californiaReturn = cloneReturn();

    californiaReturn.household.can_be_claimed_as_dependent = true;
    californiaReturn.facts.income.wages = [];
    californiaReturn.facts.income.taxable_interest = [];
    californiaReturn.facts.income.schedule_c_businesses = [
      {
        business_id: "biz_dep_1",
        owner_person_id: "p_taxpayer",
        gross_receipts_or_sales: 2200,
        returns_and_allowances: 100,
        cost_of_goods_sold: 300,
        other_business_income: 50,
        expenses: [{ amount: 250 }],
        home_office_deduction: 100,
      },
    ];
    californiaReturn.state_returns.CA.state_payments = [];

    const input = await parseInput(californiaReturn);
    const artifacts = buildCaliforniaStateArtifacts({
      federalAdjustedGrossIncome: 1500,
      input,
      manifest: sampleStatePluginCaTy2025 as any,
      stateReturn: input.state_returns.CA!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "ca.form540.line18",
        value: 1500,
      }),
    );
    expect(artifacts.summary.taxable_income).toBe(0);
  });

  it("falls back to the dependent minimum deduction when Schedule C earned-income fields are omitted", async () => {
    const californiaReturn = cloneReturn();

    californiaReturn.household.can_be_claimed_as_dependent = true;
    californiaReturn.facts.income.wages = [];
    californiaReturn.facts.income.taxable_interest = [];
    californiaReturn.facts.income.schedule_c_businesses = [
      {
        business_id: "biz_dep_sparse",
        owner_person_id: "p_taxpayer",
        expenses: [],
      },
    ];
    californiaReturn.state_returns.CA.state_payments = [];

    const input = await parseInput(californiaReturn);
    const artifacts = buildCaliforniaStateArtifacts({
      federalAdjustedGrossIncome: 500,
      input,
      manifest: sampleStatePluginCaTy2025 as any,
      stateReturn: input.state_returns.CA!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "ca.form540.line18",
        value: 1350,
      }),
    );
  });

  it("treats explicit California MFS status as the AGI-limitation special case and defaults missing dependency flags to false", async () => {
    const californiaReturn = cloneReturn();

    californiaReturn.household.filing_status = "single";
    delete californiaReturn.household.can_be_claimed_as_dependent;
    californiaReturn.state_returns.CA.state_filing_status = "mfs";
    californiaReturn.state_returns.CA.state_payments = [];

    const input = await parseInput(californiaReturn);
    const artifacts = buildCaliforniaStateArtifacts({
      federalAdjustedGrossIncome: 255_000,
      input,
      manifest: sampleStatePluginCaTy2025 as any,
      stateReturn: input.state_returns.CA!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "ca.form540.line32",
        value: 135,
      }),
    );
  });

  it("counts blind and senior exemption credits for California line 32", async () => {
    const californiaReturn = cloneReturn();

    californiaReturn.household.taxpayer.is_blind = true;
    californiaReturn.household.taxpayer.date_of_birth = "1950-01-01";

    const input = await parseInput(californiaReturn);
    const artifacts = buildCaliforniaStateArtifacts({
      federalAdjustedGrossIncome: 85_045.32,
      input,
      manifest: sampleStatePluginCaTy2025 as any,
      stateReturn: input.state_returns.CA!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "ca.form540.line32",
        value: 459,
      }),
    );
  });

  it("uses the California joint personal exemption count when the filing status is joint", async () => {
    const californiaReturn = cloneReturn();

    californiaReturn.household.filing_status = "married_filing_jointly";
    californiaReturn.state_returns.CA.state_filing_status = "married_filing_jointly";

    const input = await parseInput(californiaReturn);
    const artifacts = buildCaliforniaStateArtifacts({
      federalAdjustedGrossIncome: 85_045.32,
      input,
      manifest: sampleStatePluginCaTy2025 as any,
      stateReturn: input.state_returns.CA!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "ca.form540.line32",
        value: 306,
      }),
    );
  });

  it("reduces the California joint personal exemption count when one spouse can be claimed", async () => {
    const californiaReturn = cloneReturn();

    californiaReturn.household.filing_status = "married_filing_jointly";
    californiaReturn.state_returns.CA.state_filing_status = "married_filing_jointly";
    californiaReturn.household.taxpayer.can_be_claimed_as_dependent = true;

    const input = await parseInput(californiaReturn);
    const artifacts = buildCaliforniaStateArtifacts({
      federalAdjustedGrossIncome: 85_045.32,
      input,
      manifest: sampleStatePluginCaTy2025 as any,
      stateReturn: input.state_returns.CA!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "ca.form540.line32",
        value: 153,
      }),
    );
  });

  it("reduces the California joint personal exemption count when the spouse can be claimed", async () => {
    const californiaReturn = cloneReturn();

    californiaReturn.household.filing_status = "married_filing_jointly";
    californiaReturn.state_returns.CA.state_filing_status = "married_filing_jointly";
    californiaReturn.household.spouse = {
      person_id: "p_spouse",
      date_of_birth: "1990-01-01",
      can_be_claimed_as_dependent: true,
      is_blind: false,
    };

    const input = await parseInput(californiaReturn);
    const artifacts = buildCaliforniaStateArtifacts({
      federalAdjustedGrossIncome: 85_045.32,
      input,
      manifest: sampleStatePluginCaTy2025 as any,
      stateReturn: input.state_returns.CA!,
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "ca.form540.line32",
        value: 153,
      }),
    );
  });

  it("computes Behavioral Health Services Tax and uses canonical state payments when provided", async () => {
    const californiaReturn = cloneReturn();

    californiaReturn.household.filing_status = "head_of_household";
    californiaReturn.state_returns.CA.state_filing_status = "head_of_household";
    californiaReturn.facts.income.wages[0].wages_tips_other_compensation = 1_111_512;
    californiaReturn.facts.payments.withholdings[0].amount = 250_000;
    californiaReturn.facts.payments.withholdings[1].amount = 90_000;
    californiaReturn.state_returns.CA.state_payments = [
      {
        description: "California withholding",
        amount: 90_000,
      },
    ];

    const input = await parseInput(californiaReturn);
    const artifacts = buildCaliforniaStateArtifacts({
      federalAdjustedGrossIncome: 1_111_512,
      input,
      manifest: sampleStatePluginCaTy2025 as any,
      stateReturn: input.state_returns.CA!,
    });

    expect(artifacts.summary.total_payments).toBe(90_000);
    expect(artifacts.summary.amount_owed).toBeGreaterThan(0);
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "ca.form540.line62",
        value: 1_001,
      }),
    );
    expect(artifacts.validationResults).toContainEqual({
      rule_id: "CA.form540.tax_rate_schedule_used",
      severity: "info",
      status: "pass",
      message:
        "California Form 540 line 31 used the official 2025 tax rate schedule path for taxable income over $100,000.",
      node_ids: ["ca.form540.line19", "ca.form540.line31"],
    });
    expect(artifacts.validationResults).toContainEqual({
      rule_id: "CA.form540.state_payments.canonical",
      severity: "info",
      status: "pass",
      message:
        "California payments used the explicit state_return.state_payments array as the source of truth before refund or balance due was computed.",
      node_ids: ["ca.form540.line78"],
    });
  });

  it("falls back to the generic state summary path for unsupported California return kinds", async () => {
    const californiaReturn = cloneReturn();

    californiaReturn.state_returns.CA.return_kind = "part_year_resident";

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(californiaReturn));

    expect(result.state_summaries).toEqual([
      {
        state_code: "CA",
        plugin_manifest_id: "ca.ty2025.stub.v1",
        adjusted_gross_income_or_starting_point: 85_045.32,
        taxable_income: 0,
        total_tax: 0,
        total_payments: 4_200,
        refund_amount: 4_200,
        amount_owed: 0,
      },
    ]);
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "CA.form540.return_kind_unsupported",
      severity: "warning",
      status: "fail",
      message:
        "California state computation requires allocation_profile inputs for part-year and nonresident returns. This return stayed on the generic state-summary fallback path.",
      node_ids: ["bridge.ca.starting_point"],
    });
  });

  it("flags unsupported California starting-point strategies and skips states without manifests", async () => {
    const californiaReturn = cloneReturn();

    californiaReturn.state_returns.CA.starting_point_strategy = "custom";

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(californiaReturn));

    expect(result.graph.validation_results).toContainEqual({
      rule_id: "CA.form540.starting_point_unsupported",
      severity: "warning",
      status: "fail",
      message:
        "California state computation currently supports the federal_agi starting-point strategy only. This return stayed on the generic state-summary fallback path.",
      node_ids: ["bridge.ca.starting_point"],
    });

    const parsedInput = await parseInput();
    const artifacts = buildStateArtifacts({
      activeStateReturns: [
        {
          ...parsedInput.state_returns.CA!,
          state_code: "ZZ",
        },
      ] as any,
      adjustedGrossIncome: 85_045.32,
      input: parsedInput,
      stateManifestsByCode: new Map(),
    });

    expect(artifacts).toEqual({
      edges: [],
      nodes: [],
      stateSummaries: [],
      validationResults: [],
    });
  });
});
