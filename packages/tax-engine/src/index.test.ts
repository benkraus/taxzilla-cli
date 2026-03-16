import { Either } from "effect";
import { describe, expect, it } from "vitest";

import {
  decodeCanonicalReturnEnvelope,
  decodeFederalModuleCatalog,
  decodeFormsGraphSnapshot,
  decodeStatePluginManifest,
  decodeStatePluginRegistry,
  federalModuleCatalogTy2025,
  sampleFormsGraphTy2025,
  sampleReturnTy2025,
  sampleStatePluginCaTy2025,
  statePluginManifestTy2025JsonSchema,
  statesRegistryTy2025,
  taxEngineBlueprintPaths,
} from "./index";

describe("@taxzilla/tax-engine", () => {
  it("exports stable paths to the imported blueprint bundle", () => {
    expect(taxEngineBlueprintPaths.root).toBe("docs/tax_engine_blueprint_ty2025");
    expect(taxEngineBlueprintPaths.schemas.canonicalReturn).toContain("taxfacts-ty2025");
    expect(taxEngineBlueprintPaths.partnerAdapterOpenApi).toMatch(/partner-filing-adapter\.openapi\.yaml$/);
  });

  it("decodes the imported federal module catalog", () => {
    const result = decodeFederalModuleCatalog(federalModuleCatalogTy2025);

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right).toHaveLength(20);
      expect(result.right[0]?.module_id).toBe("federal.form1040.core");
    }
  });

  it("decodes the imported state registry and sample manifest", () => {
    const registry = decodeStatePluginRegistry(statesRegistryTy2025);
    const sampleManifest = decodeStatePluginManifest(sampleStatePluginCaTy2025);

    expect(Either.isRight(registry)).toBe(true);
    expect(Either.isRight(sampleManifest)).toBe(true);

    if (Either.isRight(registry)) {
      expect(registry.right).toHaveLength(50);
    }

    if (Either.isRight(sampleManifest)) {
      expect(sampleManifest.right.state_code).toBe("CA");
      expect(sampleManifest.right.status).toBe("stub");
    }
  });

  it("decodes the canonical return envelope starter contract", () => {
    const result = decodeCanonicalReturnEnvelope(sampleReturnTy2025);

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.tax_year).toBe(2025);
      expect(result.right.requested_jurisdictions.states).toEqual(["CA"]);
      expect(Object.keys(result.right.provenance_index)).toHaveLength(2);
    }
  });

  it("decodes the forms graph snapshot starter contract", () => {
    const result = decodeFormsGraphSnapshot(sampleFormsGraphTy2025);

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.modules).toHaveLength(3);
      expect(result.right.nodes).toHaveLength(9);
      expect(result.right.edges).toHaveLength(8);
    }
  });

  it("re-exports the raw JSON schema documents for deeper validation work", () => {
    expect(statePluginManifestTy2025JsonSchema.type).toBe("object");
    expect(statePluginManifestTy2025JsonSchema.properties).toHaveProperty("state_code");
  });
});
