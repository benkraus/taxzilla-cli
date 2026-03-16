import type { FormsGraphValidationResult } from '../../../blueprint';
import { buildGenericStateArtifacts } from '../common';
import type { StateArtifactsArgs, StateArtifactsResult } from '../common';
import { supportsAllocatedResidentComputation } from '../return-kind';
import { buildCaliforniaStateArtifacts } from './graph';

function supportsCaliforniaResidentComputation(stateReturn: StateArtifactsArgs['stateReturn']): boolean {
  return supportsAllocatedResidentComputation(stateReturn, 'federal_agi');
}

function buildUnsupportedCaliforniaValidations(
  stateReturn: StateArtifactsArgs['stateReturn'],
): FormsGraphValidationResult[] {
  const validationResults: FormsGraphValidationResult[] = [];

  if (!supportsAllocatedResidentComputation(stateReturn, 'federal_agi') && stateReturn.return_kind !== 'resident') {
    validationResults.push({
      rule_id: 'CA.form540.return_kind_unsupported',
      severity: 'warning',
      status: 'fail',
      message:
        'California state computation requires allocation_profile inputs for part-year and nonresident returns. This return stayed on the generic state-summary fallback path.',
      node_ids: ['bridge.ca.starting_point'],
    });
  }

  if (stateReturn.starting_point_strategy !== 'federal_agi') {
    validationResults.push({
      rule_id: 'CA.form540.starting_point_unsupported',
      severity: 'warning',
      status: 'fail',
      message:
        'California state computation currently supports the federal_agi starting-point strategy only. This return stayed on the generic state-summary fallback path.',
      node_ids: ['bridge.ca.starting_point'],
    });
  }

  return validationResults;
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (supportsCaliforniaResidentComputation(args.stateReturn)) {
    return buildCaliforniaStateArtifacts({
      federalAdjustedGrossIncome:
        args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
      input: args.input,
      manifest: args.manifest,
      stateReturn: args.stateReturn,
    });
  }

  return buildGenericStateArtifacts(args, {
    validationResults: buildUnsupportedCaliforniaValidations(args.stateReturn),
  });
}

export { buildCaliforniaStateArtifacts, buildStateArtifacts };
export {
  calculateCaliforniaExemptionCredits,
  calculateCaliforniaLine31Tax,
  calculateCaliforniaRegularTaxFromRateSchedule,
  calculateCaliforniaTaxTableAmount,
} from './computation';
export { normalizeCaliforniaFilingStatus } from './types';

export type {
  CaliforniaDeductionStrategy,
  CaliforniaExemptionCreditComputation,
  CaliforniaFilingStatus,
  CaliforniaTaxComputationMethod,
} from './types';
