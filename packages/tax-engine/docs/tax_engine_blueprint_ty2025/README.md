# TY2025 Tax Engine Blueprint Bundle

This bundle is designed for a **self-prep** product that:
- owns the tax facts model and deterministic calculation engine,
- compiles federal and state returns itself,
- and uses a **filing-only partner** to transmit completed filings.

## What is included

1. `schema/taxfacts-ty2025.schema.json`  
   Canonical JSON Schema for the full return record, including:
   - household and filing context,
   - document intake and typed payloads for common federal input forms,
   - normalized tax facts,
   - all-50-state return scaffolding,
   - e-file context,
   - provenance index,
   - immutable evidence log.

2. `schema/forms-graph.snapshot.schema.json`  
   JSON Schema for a computed forms-graph snapshot.

3. `schema/state-plugin-manifest.schema.json`  
   JSON Schema for state plugin manifests.

4. `catalog/federal-module-catalog-ty2025.json`  
   A practical catalog of common federal modules/schedules/forms.

5. `registry/states-registry-ty2025.json`  
   Fifty state manifest stubs. These are **scaffolds**, not production-ready state implementations.

6. `api/partner-filing-adapter.openapi.yaml`  
   OpenAPI 3.1 draft spec for the filing-only partner adapter boundary.

7. `docs/forms-graph-design.md`  
   Graph model, node taxonomy, evaluation model, and module orchestration.

8. `docs/xml-compiler-architecture.md`  
   IRS/State XML compiler design: IR, codegen, validators, package composer, reject mapping.

9. `docs/state-plugin-template.md`  
   A reusable state plugin implementation template.

10. `examples/sample-return-ty2025.json`  
    Example canonical return record that validates against the schema.

11. `examples/sample-forms-graph-ty2025.json`  
    Example forms graph snapshot.

12. `examples/sample-state-plugin-CA.stub.json`  
    Example state plugin stub manifest.

## Assumptions baked into this bundle

- **Tax year:** 2025  
- **Processing year / filing season:** 2026  
- **Product model:** self-prep software  
- **Transmission model:** filing-only partner  
- **Signature model preference:** self-select PIN first, practitioner/ERO flow optional later  
- **Federal scope:** the most common individual consumer modules, not the full MeF accepted-forms universe  
- **State scope:** all 50 states are scaffolded, but state law, line mappings, validation rules, and XML packages still need per-state implementation and legal review

## Common federal input forms explicitly typed in the canonical schema

- Form W-2
- Form W-2G
- Form 1099-INT
- Form 1099-DIV
- Form 1099-B
- Form 1099-R
- Form 1099-G
- Form 1099-NEC
- Form 1099-MISC
- Form 1099-K
- Form 1098
- Form 1098-E
- Form 1098-T
- Form 1095-A
- Form 1099-SA
- Form 5498-SA
- Form 1099-Q
- SSA-1099
- Schedule K-1 (1065 / 1120-S / 1041)
- `OTHER_FEDERAL_DOCUMENT` catch-all

## Important limitations

This is a strong implementation starting point, but it is **not** a production certification package. Before launch you still need:

- final TY2025 IRS schema package alignment and business-rule sync,
- ATS completion,
- partner-specific transport and reject-loop testing,
- per-state legal and technical validation,
- security, privacy, retention, and incident response hardening.

## Suggested build order

1. Start with `taxfacts-ty2025.schema.json`.
2. Implement graph evaluation against `forms-graph.snapshot.schema.json`.
3. Use `federal-module-catalog-ty2025.json` to scope your first federal release.
4. Build the XML compiler pipeline from `xml-compiler-architecture.md`.
5. Put the partner adapter boundary in front of your transmitter integration.
6. Expand state coverage by turning each registry stub into a real plugin manifest and implementation.

## Reference sources you should keep in your engineering wiki

- IRS TY2025 MeF schemas/business rules page
- IRS Publication 4164
- IRS Publication 1436
- IRS Self-Select PIN guidance / Topic 255
- IRS Form 8879 page
- IRS MeF Submission Composition Guide
- FTA Electronic Filing Information (state-by-state)
