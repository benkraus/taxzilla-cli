import { statesRegistryTy2025 } from "@taxzilla/tax-engine";
import { describe, expect, it } from "vitest";

import {
  buildStarterStateReturns,
  parseRequestedStateCodes,
} from "./state-support";

describe("state support", () => {
  it("normalizes and de-duplicates requested state codes", () => {
    expect(parseRequestedStateCodes(["ca", "ny,nj", "CA"])).toEqual([
      "CA",
      "NY",
      "NJ",
    ]);
  });

  it("builds starter returns for every registered state", () => {
    const requestedStateCodes = statesRegistryTy2025.map((manifest) => manifest.state_code);
    const stateReturns = buildStarterStateReturns({
      filingStatus: "single",
      requestedStateCodes,
    });

    expect(Object.keys(stateReturns)).toHaveLength(50);
    expect(stateReturns.CA).toMatchObject({
      state_code: "CA",
      enabled: true,
      return_kind: "resident",
      state_filing_status: "single",
      plugin_manifest_id: "ca.ty2025.stub.v1",
    });
    expect(stateReturns.WY).toMatchObject({
      state_code: "WY",
      enabled: true,
      return_kind: "no_return_required",
      starting_point_strategy: "none",
      plugin_manifest_id: "wy.ty2025.stub.v1",
    });
  });
});
