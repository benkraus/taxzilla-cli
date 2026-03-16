import { Either, Effect } from "effect";
import { describe, expect, it } from "vitest";

import { sampleReturnTy2025, sampleStatePluginCaTy2025, statesRegistryTy2025 } from "../index";
import {
  buildActiveFederalModuleIds,
  buildCapitalTransactionNodeId,
  buildDividendNodeId,
  buildOtherIncomeNodeId,
  buildScheduleBNodeId,
  buildScheduleEActivityNodeId,
  buildWageNodeId,
  findFederalModuleCatalogEntry,
  findStatePluginManifest,
  fromDecodedEither,
  inferFederalModuleType,
  parseCanonicalReturnEnvelopeEffect,
  parseCoreEngineInputEffect,
} from "./references";
import {
  buildStateArtifacts,
  buildStateNodesAndEdges,
  buildStatePluginModule,
  buildStateSummary,
  stateArtifactBuilders,
} from "./states";
import { buildGenericStateArtifacts } from "./states/common";

function cloneReturn(): any {
  return structuredClone(sampleReturnTy2025);
}

describe("core-engine references", () => {
  it("builds stable node ids and infers federal module types", () => {
    expect(buildScheduleBNodeId(2)).toBe("input.1099int.2.box1");
    expect(buildDividendNodeId(3)).toBe("input.1099div.3.box1a");
    expect(buildCapitalTransactionNodeId(1)).toBe("input.8949.1.gain_or_loss");
    expect(buildOtherIncomeNodeId(4)).toBe("input.sch1.other_income.4.amount");
    expect(buildScheduleEActivityNodeId(5)).toBe("sche.activity.5.net");
    expect(buildWageNodeId(6)).toBe("input.w2.6.box1");
    expect(
      inferFederalModuleType({
        module_id: "federal.scheduleA",
        form_code: "Schedule A",
      } as any),
    ).toBe("schedule");
    expect(
      inferFederalModuleType({
        module_id: "federal.form1040.core",
        form_code: "1040",
      } as any),
    ).toBe("form");
  });

  it("finds reference data and surfaces typed failures", async () => {
    const moduleEntry = await Effect.runPromise(findFederalModuleCatalogEntry("federal.form1040.core"));
    const stateManifest = await Effect.runPromise(findStatePluginManifest("CA"));
    const missingModule = await Effect.runPromise(
      Effect.either(findFederalModuleCatalogEntry("missing.module")),
    );
    const missingState = await Effect.runPromise(Effect.either(findStatePluginManifest("ZZ")));

    expect(moduleEntry.module_id).toBe("federal.form1040.core");
    expect(stateManifest.plugin_manifest_id).toBe("ca.ty2025.stub.v1");
    expect(Either.isLeft(missingModule)).toBe(true);
    expect(Either.isLeft(missingState)).toBe(true);

    if (Either.isLeft(missingModule)) {
      expect(missingModule.left.referenceType).toBe("federal_module");
    }

    if (Either.isLeft(missingState)) {
      expect(missingState.left.referenceType).toBe("state_manifest");
    }
  });

  it("wraps decoder results in effects for valid and invalid inputs", async () => {
    const right = await Effect.runPromise(
      fromDecodedEither(Either.right("ok"), () => new Error("nope")),
    );
    const left = await Effect.runPromise(
      Effect.either(fromDecodedEither(Either.left("bad"), (reason) => new Error(reason))),
    );
    const canonical = await Effect.runPromise(parseCanonicalReturnEnvelopeEffect(sampleReturnTy2025));
    const invalidCanonical = await Effect.runPromise(
      Effect.either(parseCanonicalReturnEnvelopeEffect({})),
    );
    const coreInput = await Effect.runPromise(parseCoreEngineInputEffect(canonical));
    const invalidCoreInput = await Effect.runPromise(
      Effect.either(parseCoreEngineInputEffect({ return_id: "bad" } as any)),
    );

    expect(right).toBe("ok");
    expect(Either.isLeft(left)).toBe(true);
    expect(coreInput.return_id).toBe(sampleReturnTy2025.return_id);
    expect(Either.isLeft(invalidCanonical)).toBe(true);
    expect(Either.isLeft(invalidCoreInput)).toBe(true);
  });

  it("derives active module ids from the activation state", () => {
    const moduleIds = buildActiveFederalModuleIds({
      schedule1Activated: true,
      schedule2Activated: true,
      schedule3Activated: true,
      scheduleAActivated: true,
      scheduleBActivated: true,
      scheduleCActivated: true,
      scheduleDActivated: true,
      scheduleEActivated: true,
      scheduleSEActivated: true,
      form2441Activated: true,
      form8812Activated: true,
      form8863Activated: true,
      form8889Activated: true,
      form8949Activated: true,
      form8959Activated: true,
      form8960Activated: true,
      form8962Activated: true,
    });

    expect(moduleIds).toContain("federal.form1040.core");
    expect(moduleIds).toContain("federal.scheduleE");
    expect(moduleIds).toContain("federal.form8962");
    expect(moduleIds).not.toContain("missing.module");
  });
});

describe("core-engine states", () => {
  it("builds state summaries from prepared summaries and payment fallbacks", () => {
    expect(
      buildStateSummary(
        {
          state_code: "CA",
          plugin_manifest_id: "ca.ty2025.stub.v1",
          state_payments: [],
          prepared_summary: {
            adjusted_gross_income_or_starting_point: 123,
            taxable_income: 100,
            total_tax: 45,
            total_payments: 50,
            refund_amount: 5,
            amount_owed: 0,
          },
        } as any,
        999,
      ),
    ).toEqual({
      state_code: "CA",
      plugin_manifest_id: "ca.ty2025.stub.v1",
      adjusted_gross_income_or_starting_point: 123,
      taxable_income: 100,
      total_tax: 45,
      total_payments: 50,
      refund_amount: 5,
      amount_owed: 0,
    });

    expect(
      buildStateSummary(
        {
          state_code: "NY",
          plugin_manifest_id: "ny.ty2025.stub.v1",
          state_payments: [{ amount: 300 }, { amount: 50 }],
        } as any,
        70000,
      ),
    ).toEqual({
      state_code: "NY",
      plugin_manifest_id: "ny.ty2025.stub.v1",
      adjusted_gross_income_or_starting_point: 70000,
      taxable_income: null,
      total_tax: 0,
      total_payments: 350,
      refund_amount: 350,
      amount_owed: 0,
    });
  });

  it("builds plugin modules and state graph nodes while skipping missing manifests", () => {
    expect(
      buildStatePluginModule({
        ...sampleStatePluginCaTy2025,
        form_catalog: [
          {
            form_code: "CA-540",
            role: "supporting_schedule",
          },
        ],
      } as any),
    ).toMatchObject({
      module_id: "ca.ty2025.stub.v1",
      form_code: "CA-540",
      jurisdiction: "CA",
      module_type: "state_plugin",
    });

    const { nodes, edges } = buildStateNodesAndEdges({
      activeStateReturns: [
        {
          state_code: "CA",
          plugin_manifest_id: "ca.ty2025.stub.v1",
          state_payments: [{ amount: 1200 }],
        },
        {
          state_code: "ZZ",
          plugin_manifest_id: "zz.ty2025.stub.v1",
          state_payments: [{ amount: 5 }],
        },
      ] as any,
      stateManifestsByCode: new Map([["CA", sampleStatePluginCaTy2025 as any]]),
      adjustedGrossIncome: 85045.32,
    });

    expect(nodes.map((node) => node.node_id)).toEqual([
      "bridge.ca.starting_point",
      "ca.summary.total_payments",
      "ca.summary.refund_amount",
      "ca.summary.amount_owed",
      "ca.summary.total_tax",
    ]);
    expect(edges).toEqual([
      {
        from_node_id: "1040.line11",
        to_node_id: "bridge.ca.starting_point",
        edge_type: "carryforward",
      },
      {
        from_node_id: "bridge.ca.starting_point",
        to_node_id: "ca.summary.total_tax",
        edge_type: "dependency",
      },
    ]);
    expect(nodes[0]?.value).toBe(85045.32);
    expect(nodes[1]?.value).toBe(1200);
    expect(nodes[3]?.value).toBe(0);
  });

  it("uses the parsed canonical input shape expected by the state engine", async () => {
    const parsed = await Effect.runPromise(
      parseCoreEngineInputEffect(await Effect.runPromise(parseCanonicalReturnEnvelopeEffect(cloneReturn()))),
    );

    expect(parsed.state_returns.CA?.plugin_manifest_id).toBe("ca.ty2025.stub.v1");
    expect(parsed.state_returns.CA?.return_kind).toBe("resident");
    expect(parsed.state_returns.CA?.plugin_fact_bag).toMatchObject({
      schedule_ca: {
        additions: [],
        subtractions: [],
      },
    });
    expect(parsed.requested_jurisdictions.states).toEqual(["CA"]);
  });

  it("resolves every registry state through an explicit module and handles no-income-tax states", async () => {
    const parsed = await Effect.runPromise(
      parseCoreEngineInputEffect(await Effect.runPromise(parseCanonicalReturnEnvelopeEffect(cloneReturn()))),
    );
    const stateManifestsByCode = new Map(
      statesRegistryTy2025.map((manifest) => [manifest.state_code, manifest] as const),
    );
    const activeStateReturns = statesRegistryTy2025.map((manifest) => ({
      state_code: manifest.state_code,
      enabled: true,
      return_kind:
        manifest.state_code === "CA"
          ? "part_year_resident"
          : manifest.implementation_class === "no_individual_income_tax"
            ? "no_return_required"
            : "resident",
      starting_point_strategy:
        manifest.state_code === "CA"
          ? "custom"
          : manifest.implementation_class === "no_individual_income_tax"
            ? "none"
            : "custom",
      residency_periods: [],
      additions: [],
      subtractions: [],
      state_specific_income_items: [],
      state_specific_deductions: [],
      state_specific_credits: [],
      local_returns: [],
      plugin_manifest_id: manifest.plugin_manifest_id,
      state_payments: [{ description: `${manifest.state_code} payment`, amount: 25 }],
    }));

    expect(Object.keys(stateArtifactBuilders).sort()).toEqual(
      statesRegistryTy2025.map((manifest) => manifest.state_code).sort(),
    );

    const artifacts = buildStateArtifacts({
      activeStateReturns: activeStateReturns as any,
      adjustedGrossIncome: 85_045.32,
      input: parsed,
      stateManifestsByCode,
    });

    expect(artifacts.stateSummaries).toHaveLength(50);
    expect(artifacts.stateSummaries).toContainEqual({
      state_code: "AK",
      plugin_manifest_id: "ak.ty2025.stub.v1",
      adjusted_gross_income_or_starting_point: 85_045.32,
      taxable_income: 0,
      total_tax: 0,
      total_payments: 25,
      refund_amount: 25,
      amount_owed: 0,
    });
    expect(artifacts.validationResults).toContainEqual(
      expect.objectContaining({
        rule_id: "AK.no_individual_income_tax",
        severity: "info",
        status: "pass",
      }),
    );
    expect(artifacts.validationResults).toContainEqual(
      expect.objectContaining({
        rule_id: "CA.form540.return_kind_unsupported",
        severity: "warning",
        status: "fail",
      }),
    );
    expect(artifacts.validationResults.some((result) => result.rule_id.endsWith(".plugin.stub"))).toBe(
      false,
    );
  });

  it("skips state artifacts when a manifest exists but no builder is registered", async () => {
    const parsed = await Effect.runPromise(
      parseCoreEngineInputEffect(await Effect.runPromise(parseCanonicalReturnEnvelopeEffect(cloneReturn()))),
    );

    const artifacts = buildStateArtifacts({
      activeStateReturns: [
        {
          state_code: "ZZ",
          enabled: true,
          return_kind: "resident",
          starting_point_strategy: "federal_agi",
          residency_periods: [],
          additions: [],
          subtractions: [],
          state_specific_income_items: [],
          state_specific_deductions: [],
          state_specific_credits: [],
          local_returns: [],
          plugin_manifest_id: "zz.ty2025.stub.v1",
          state_payments: [{ description: "Unknown state payment", amount: 5 }],
        },
      ] as any,
      adjustedGrossIncome: 85_045.32,
      input: parsed,
      stateManifestsByCode: new Map([
        [
          "ZZ",
          {
            ...(sampleStatePluginCaTy2025 as any),
            plugin_manifest_id: "zz.ty2025.stub.v1",
            state_code: "ZZ",
            state_name: "Unknown State",
          },
        ],
      ]),
    });

    expect(artifacts).toEqual({
      edges: [],
      nodes: [],
      stateSummaries: [],
      validationResults: [],
    });
  });

  it("builds generic state artifacts when no optional overrides are provided", async () => {
    const parsed = await Effect.runPromise(
      parseCoreEngineInputEffect(await Effect.runPromise(parseCanonicalReturnEnvelopeEffect(cloneReturn()))),
    );

    const artifacts = buildGenericStateArtifacts({
      adjustedGrossIncome: 85_045.32,
      input: parsed,
      manifest: sampleStatePluginCaTy2025 as any,
      stateReturn: {
        state_code: "CA",
        enabled: true,
        return_kind: "resident",
        starting_point_strategy: "federal_agi",
        residency_periods: [],
        additions: [],
        subtractions: [],
        state_specific_income_items: [],
        state_specific_deductions: [],
        state_specific_credits: [],
        local_returns: [],
        plugin_manifest_id: "ca.ty2025.stub.v1",
        state_payments: [],
      } as any,
    });

    expect(artifacts.summary).toEqual({
      state_code: "CA",
      plugin_manifest_id: "ca.ty2025.stub.v1",
      adjusted_gross_income_or_starting_point: 85_045.32,
      taxable_income: null,
      total_tax: 0,
      total_payments: 0,
      refund_amount: 0,
      amount_owed: 0,
    });
    expect(artifacts.validationResults).toEqual([]);
  });
});
