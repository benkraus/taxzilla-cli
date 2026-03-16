# @taxzilla/tax-engine

TY2025 tax engine and blueprint bundle used by TaxZilla CLI.

## WARNING

- THIS PACKAGE HAS NOT BEEN REVIEWED, APPROVED, OR VETTED BY CPAS, EAS, TAX ATTORNEYS, OR OTHER TAX PROFESSIONALS.
- THIS PACKAGE IS EXPERIMENTAL.
- THIS PACKAGE IS NOT TAX ADVICE.
- THIS PACKAGE IS NOT LEGAL ADVICE.
- USE THIS PACKAGE AT YOUR OWN RISK.
- NO WARRANTY. NO GUARANTEE OF ACCURACY. NO GUARANTEE OF COMPLETENESS. NO GUARANTEE OF FITNESS FOR ANY PURPOSE.

## Scope

- TY2025 only.
- Exports the public engine surface, the return-IR builder, and the TY2025 blueprint bundle.
- Includes state artifact builders for all 50 states as library assets.
- The published CLI can initialize, validate, run, and export state-aware TY2025 sessions on top of this library.

## Important Non-Guarantees

- The presence of a form, schema, state builder, or sample payload does not mean the package is production-ready, professionally reviewed, or approved for filing.
- State support in the CLI is still local artifact generation only. This package does not submit returns anywhere.
- You are responsible for validating all inputs, outputs, line mappings, elections, and filing decisions before using this package with real taxpayer data.
