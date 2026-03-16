import { Either, Effect } from "effect";
import { describe, expect, it } from "vitest";

import { sampleReturnTy2025 } from "./index";
import {
  buildTy2025ReturnIr,
  decodeFederalReturnIR,
  decodeTy2025ReturnIrBundle,
  evaluateTy2025CoreEnginePipeline,
} from "./return-ir";

describe("evaluateTy2025CoreEnginePipeline", () => {
  it("builds filing-oriented IR with propagated provenance for derived federal lines", async () => {
    const result = await Effect.runPromise(evaluateTy2025CoreEnginePipeline(sampleReturnTy2025));

    expect(result.return_ir.federal_return.primary_taxpayer.full_legal_name).toBe("Alex Rivera");
    expect(result.return_ir.federal_return.forms.map((form) => form.form_code)).toEqual(["1040"]);
    expect(result.return_ir.federal_return.schedules.map((form) => form.form_code)).toEqual([
      "Schedule A",
      "Schedule B",
    ]);
    expect(result.return_ir.federal_return.payment_context.refund_direct_deposit).toEqual({
      bank_name: "Example Bank",
      account_type: "checking",
      last4_account_number: "6789",
      last4_routing_number: "4321",
    });

    const adjustedGrossIncomeMapping = result.return_ir.federal_return.mapping_index.find(
      (entry) => entry.graph_node_id === "1040.line11",
    );

    expect(adjustedGrossIncomeMapping).toEqual({
      emitted_target_path: "federal.targets.1040.11",
      graph_node_id: "1040.line11",
      canonical_json_pointers: [
        "/facts/income/wages/0/wages_tips_other_compensation",
        "/facts/income/taxable_interest/0/interest_income",
      ],
      human_label: "Adjusted gross income",
      jurisdiction: "federal",
      form_code: "1040",
      line_code: "11",
    });
    expect(result.return_ir.submission_package).toMatchObject({
      submission_mode: "federal_and_state_bundle",
      partner_metadata: {
        partner_name: "Example Filing Partner",
        adapter_version: "1.0.0",
        environment: "sandbox",
        requested_state_codes: ["CA"],
      },
    });
  });

  it("emits state return ir and falls back to federal-only package mode when no states are active", async () => {
    const federalOnlyReturn = structuredClone(sampleReturnTy2025) as any;
    federalOnlyReturn.requested_jurisdictions.states = [];
    federalOnlyReturn.state_returns = {};

    const federalOnly = await Effect.runPromise(evaluateTy2025CoreEnginePipeline(federalOnlyReturn));

    expect(federalOnly.return_ir.state_returns).toEqual([]);
    expect(federalOnly.return_ir.submission_package.submission_mode).toBe("federal_only");

    const withState = await Effect.runPromise(evaluateTy2025CoreEnginePipeline(sampleReturnTy2025));

    expect(withState.return_ir.state_returns).toHaveLength(1);
    expect(withState.return_ir.state_returns[0]).toMatchObject({
      state_code: "CA",
      plugin_manifest_id: "ca.ty2025.stub.v1",
      return_kind: "resident",
      starting_point_source: {
        strategy: "federal_agi",
        federal_graph_node_id: "1040.line11",
        value: 85045,
      },
      residency_context: {
        return_kind: "resident",
        residency_period_count: 1,
        local_return_count: 0,
      },
      allocation_context: {
        starting_point_strategy: "federal_agi",
        apportionment_ratio: null,
      },
      payment_context: {
        total_state_payments: 4200,
        total_local_payments: 0,
        state_payment_count: 1,
        local_payment_count: 0,
      },
      local_returns: [],
      local_returns_count: 0,
      summary: {
        taxable_income: 79339,
        refund_amount: 539,
      },
    });
  });

  it("decodes the generated return ir bundle against its exported schema", async () => {
    const pipeline = await Effect.runPromise(evaluateTy2025CoreEnginePipeline(sampleReturnTy2025));
    const directBuild = buildTy2025ReturnIr(sampleReturnTy2025, pipeline.core_engine);
    const decoded = decodeTy2025ReturnIrBundle(directBuild);

    expect(Either.isRight(decoded)).toBe(true);
    if (Either.isRight(decoded)) {
      expect(decoded.right.submission_package.idempotency_key).toBe(
        `submission:${sampleReturnTy2025.return_id}:${pipeline.core_engine.graph.graph_id}`,
      );
    }
  });

  it("builds state-only submission ir from sparse custom graph data", () => {
    const customReturn = {
      return_id: "return_custom_state_only",
      tax_year: 2025,
      schema_version: "taxfacts.ty2025.v1",
      household: {
        filing_status: "single",
        taxpayer: {
          person_id: "p_taxpayer",
          name: {
            first: "Casey",
          },
        },
        spouse: null,
        dependents: [{ person_id: "p_child" }],
      },
      requested_jurisdictions: {
        federal: false,
        states: ["CA"],
      },
      facts: {
        payments: {},
      },
      efile: {
        signers: [
          {
            person_id: "p_taxpayer",
            signed_at: "2026-01-01",
            prior_year_agi: 12345,
          },
          {
            signed_at: "2026-01-01",
          },
        ],
      },
      state_returns: {
        CA: {
          return_kind: "bogus",
          starting_point_strategy: 42,
          local_returns: [{}],
        },
      },
      partner_filing: {},
    } as any;
    const customCoreEngineResult = {
      federal_summary: {
        federal_withholding: 0,
      },
      state_summaries: [
        {
          state_code: "CA",
          plugin_manifest_id: "ca.ty2025.stub.v1",
          adjusted_gross_income_or_starting_point: 60000,
          taxable_income: 50000,
          total_tax: 100,
          total_payments: 50,
          refund_amount: 0,
          amount_owed: 50,
        },
      ],
      graph: {
        graph_id: "graph_custom",
        modules: [
          {
            module_id: "federal.form1040.core",
            jurisdiction: "federal",
            module_type: "form",
            form_code: "1040",
          },
          {
            module_id: "federal.empty.worksheet",
            jurisdiction: "federal",
            module_type: "worksheet",
            form_code: "Empty Worksheet",
          },
          {
            module_id: "ca.ty2025.stub.v1",
            jurisdiction: "CA",
            module_type: "state_plugin",
            form_code: "540",
          },
        ],
        nodes: [
          {
            node_id: "input.source",
            node_type: "input",
            jurisdiction: "federal",
            module_id: "input",
            label: "Source input",
            data_type: "money",
            value: 1,
            source_json_pointers: ["/facts/income/wages/0"],
          },
          {
            node_id: "1040.line11",
            node_type: "line",
            jurisdiction: "federal",
            module_id: "federal.form1040.core",
            form_code: "1040",
            line_code: "11",
            label: "Adjusted gross income",
            data_type: "money",
            value: 60000,
          },
          {
            node_id: "federal.summary.custom",
            node_type: "summary",
            jurisdiction: "federal",
            module_id: "federal.form1040.core",
            label: "Custom summary node",
            data_type: "string",
            value: "custom",
          },
          {
            node_id: "bridge.ca.starting_point",
            node_type: "bridge",
            jurisdiction: "CA",
            module_id: "ca.ty2025.stub.v1",
            form_code: "540",
            line_code: "start",
            label: "CA starting point",
            data_type: "money",
            value: "not-a-number",
          },
          {
            node_id: "ca.summary.total_tax",
            node_type: "summary",
            jurisdiction: "CA",
            module_id: "ca.ty2025.stub.v1",
            label: "CA total tax",
            data_type: "money",
            value: 100,
          },
          {
            node_id: "cycle.one",
            node_type: "line",
            jurisdiction: "federal",
            module_id: "federal.form1040.core",
            label: "Cycle One",
            data_type: "money",
            value: 0,
          },
          {
            node_id: "cycle.two",
            node_type: "line",
            jurisdiction: "federal",
            module_id: "federal.form1040.core",
            label: "Cycle Two",
            data_type: "money",
            value: 0,
          },
        ],
        edges: [
          {
            from_node_id: "input.source",
            to_node_id: "1040.line11",
            edge_type: "dependency",
          },
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
          {
            from_node_id: "cycle.one",
            to_node_id: "cycle.two",
            edge_type: "dependency",
          },
          {
            from_node_id: "cycle.two",
            to_node_id: "cycle.one",
            edge_type: "dependency",
          },
        ],
      },
    } as any;

    const result = buildTy2025ReturnIr(customReturn, customCoreEngineResult);

    expect(result.submission_package.submission_mode).toBe("state_only");
    expect(result.submission_package.partner_metadata).toEqual({
      partner_name: null,
      adapter_version: null,
      environment: null,
      requested_state_codes: ["CA"],
    });
    expect(result.federal_return.signature_context.signers).toEqual([
      {
        person_id: "p_taxpayer",
        signed_at: "2026-01-01",
        prior_year_agi: 12345,
      },
    ]);
    expect(result.federal_return.payment_context.refund_direct_deposit).toBeNull();
    expect(result.federal_return.worksheets).toEqual([]);
    expect(result.state_returns[0]).toMatchObject({
      state_code: "CA",
      return_kind: null,
      residency_context: {
        return_kind: null,
        residency_period_count: 0,
        local_return_count: 1,
      },
      allocation_context: {
        starting_point_strategy: "unknown",
      },
      payment_context: {
        total_state_payments: 50,
        total_local_payments: 0,
        state_payment_count: 0,
        local_payment_count: 0,
      },
      local_returns: [
        {
          jurisdiction_code: "unknown",
          jurisdiction_name: "Unknown local jurisdiction",
          resident_status: "unknown",
          payment_total: 0,
        },
      ],
      local_returns_count: 1,
      starting_point_source: {
        strategy: "unknown",
        federal_graph_node_id: "1040.line11",
        value: 60000,
      },
    });
    expect(
      result.state_returns[0]?.mapping_index.find((entry) => entry.graph_node_id === "ca.summary.total_tax"),
    ).toEqual({
      emitted_target_path: "state.ca.summary.ca_ty2025_stub_v1.ca_summary_total_tax",
      graph_node_id: "ca.summary.total_tax",
      canonical_json_pointers: ["/facts/income/wages/0"],
      human_label: "CA total tax",
      jurisdiction: "CA",
      form_code: null,
      line_code: null,
    });
  });

  it("fails with a typed canonical-return error before building IR when the input is invalid", async () => {
    const result = await Effect.runPromise(Effect.either(evaluateTy2025CoreEnginePipeline({})));

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("InvalidCanonicalReturnError");
    }

    expect(Either.isLeft(decodeFederalReturnIR({}))).toBe(true);
  });

  it("normalizes spouse and sparse federal form metadata when the IR is built directly", () => {
    const customReturn = {
      return_id: "return_married_joint",
      tax_year: 2025,
      schema_version: "taxfacts.ty2025.v1",
      household: {
        filing_status: "married_filing_jointly",
        taxpayer: {
          person_id: "p_taxpayer",
        },
        spouse: {
          person_id: "p_spouse",
          name: {
            last: "Rivera",
            full_legal_name: "Taylor Rivera",
          },
        },
        dependents: {
          unexpected: true,
        },
      },
      requested_jurisdictions: {
        federal: true,
        states: [],
      },
      facts: {
        payments: {
          refund_direct_deposit: {},
        },
      },
      efile: {
        signers: [
          {
            person_id: "p_taxpayer",
            prior_year_agi: "bad",
          },
        ],
      },
      state_returns: {},
    } as any;
    const customCoreEngineResult = {
      federal_summary: {
        federal_withholding: 10,
      },
      state_summaries: [],
      graph: {
        graph_id: "graph_sparse",
        modules: [
          {
            module_id: "federal.custom.form",
            jurisdiction: "federal",
            module_type: "form",
          },
        ],
        nodes: [
          {
            node_id: "federal.node",
            node_type: "line",
            jurisdiction: "federal",
            module_id: "federal.custom.form",
            label: "Federal custom node",
            data_type: "money",
            value: 1,
          },
        ],
        edges: [],
      },
    } as any;

    const result = buildTy2025ReturnIr(customReturn, customCoreEngineResult);

    expect(result.federal_return.spouse).toEqual({
      person_id: "p_spouse",
      first_name: null,
      last_name: "Rivera",
      full_legal_name: "Taylor Rivera",
    });
    expect(result.federal_return.dependents).toEqual([]);
    expect(result.federal_return.forms).toEqual([
      {
        module_id: "federal.custom.form",
        form_code: null,
        jurisdiction: "federal",
        fields: [
          {
            graph_node_id: "federal.node",
            line_code: null,
            label: "Federal custom node",
            data_type: "money",
            value: 1,
            formula_ref: null,
            source_json_pointers: [],
          },
        ],
      },
    ]);
    expect(result.federal_return.mapping_index).toContainEqual({
      emitted_target_path: "federal.targets.federal_custom_form.federal_node",
      graph_node_id: "federal.node",
      canonical_json_pointers: [],
      human_label: "Federal custom node",
      jurisdiction: "federal",
      form_code: null,
      line_code: null,
    });
    expect(result.federal_return.signature_context.signers).toEqual([
      {
        person_id: "p_taxpayer",
        signed_at: null,
        prior_year_agi: null,
      },
    ]);
  });
});
