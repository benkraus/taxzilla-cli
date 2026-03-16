import { buildNoIndividualIncomeTaxStateArtifacts } from '../../common';
import type { StateArtifactsArgs, StateArtifactsResult } from '../../common';

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  return buildNoIndividualIncomeTaxStateArtifacts(args, {
    stateName: 'Washington',
  });
}

export { buildStateArtifacts };
