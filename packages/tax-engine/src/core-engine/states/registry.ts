import { buildStateArtifacts as buildALStateArtifacts } from './al/index';
import { buildStateArtifacts as buildAKStateArtifacts } from './ak/index';
import { buildStateArtifacts as buildAZStateArtifacts } from './az/index';
import { buildStateArtifacts as buildARStateArtifacts } from './ar/index';
import { buildStateArtifacts as buildCAStateArtifacts } from './ca/index';
import { buildStateArtifacts as buildCOStateArtifacts } from './co/index';
import { buildStateArtifacts as buildCTStateArtifacts } from './ct/index';
import { buildStateArtifacts as buildDEStateArtifacts } from './de/index';
import { buildStateArtifacts as buildFLStateArtifacts } from './fl/index';
import { buildStateArtifacts as buildGAStateArtifacts } from './ga/index';
import { buildStateArtifacts as buildHIStateArtifacts } from './hi/index';
import { buildStateArtifacts as buildIDStateArtifacts } from './id/index';
import { buildStateArtifacts as buildILStateArtifacts } from './il/index';
import { buildStateArtifacts as buildINStateArtifacts } from './in/index';
import { buildStateArtifacts as buildIAStateArtifacts } from './ia/index';
import { buildStateArtifacts as buildKSStateArtifacts } from './ks/index';
import { buildStateArtifacts as buildKYStateArtifacts } from './ky/index';
import { buildStateArtifacts as buildLAStateArtifacts } from './la/index';
import { buildStateArtifacts as buildMEStateArtifacts } from './me/index';
import { buildStateArtifacts as buildMDStateArtifacts } from './md/index';
import { buildStateArtifacts as buildMAStateArtifacts } from './ma/index';
import { buildStateArtifacts as buildMIStateArtifacts } from './mi/index';
import { buildStateArtifacts as buildMNStateArtifacts } from './mn/index';
import { buildStateArtifacts as buildMSStateArtifacts } from './ms/index';
import { buildStateArtifacts as buildMOStateArtifacts } from './mo/index';
import { buildStateArtifacts as buildMTStateArtifacts } from './mt/index';
import { buildStateArtifacts as buildNEStateArtifacts } from './ne/index';
import { buildStateArtifacts as buildNVStateArtifacts } from './nv/index';
import { buildStateArtifacts as buildNHStateArtifacts } from './nh/index';
import { buildStateArtifacts as buildNJStateArtifacts } from './nj/index';
import { buildStateArtifacts as buildNMStateArtifacts } from './nm/index';
import { buildStateArtifacts as buildNYStateArtifacts } from './ny/index';
import { buildStateArtifacts as buildNCStateArtifacts } from './nc/index';
import { buildStateArtifacts as buildNDStateArtifacts } from './nd/index';
import { buildStateArtifacts as buildOHStateArtifacts } from './oh/index';
import { buildStateArtifacts as buildOKStateArtifacts } from './ok/index';
import { buildStateArtifacts as buildORStateArtifacts } from './or/index';
import { buildStateArtifacts as buildPAStateArtifacts } from './pa/index';
import { buildStateArtifacts as buildRIStateArtifacts } from './ri/index';
import { buildStateArtifacts as buildSCStateArtifacts } from './sc/index';
import { buildStateArtifacts as buildSDStateArtifacts } from './sd/index';
import { buildStateArtifacts as buildTNStateArtifacts } from './tn/index';
import { buildStateArtifacts as buildTXStateArtifacts } from './tx/index';
import { buildStateArtifacts as buildUTStateArtifacts } from './ut/index';
import { buildStateArtifacts as buildVTStateArtifacts } from './vt/index';
import { buildStateArtifacts as buildVAStateArtifacts } from './va/index';
import { buildStateArtifacts as buildWAStateArtifacts } from './wa/index';
import { buildStateArtifacts as buildWVStateArtifacts } from './wv/index';
import { buildStateArtifacts as buildWIStateArtifacts } from './wi/index';
import { buildStateArtifacts as buildWYStateArtifacts } from './wy/index';
import type { StateArtifactsBuilder } from './common';

const stateArtifactBuilders: Record<string, StateArtifactsBuilder> = {
  AL: buildALStateArtifacts,
  AK: buildAKStateArtifacts,
  AZ: buildAZStateArtifacts,
  AR: buildARStateArtifacts,
  CA: buildCAStateArtifacts,
  CO: buildCOStateArtifacts,
  CT: buildCTStateArtifacts,
  DE: buildDEStateArtifacts,
  FL: buildFLStateArtifacts,
  GA: buildGAStateArtifacts,
  HI: buildHIStateArtifacts,
  ID: buildIDStateArtifacts,
  IL: buildILStateArtifacts,
  IN: buildINStateArtifacts,
  IA: buildIAStateArtifacts,
  KS: buildKSStateArtifacts,
  KY: buildKYStateArtifacts,
  LA: buildLAStateArtifacts,
  ME: buildMEStateArtifacts,
  MD: buildMDStateArtifacts,
  MA: buildMAStateArtifacts,
  MI: buildMIStateArtifacts,
  MN: buildMNStateArtifacts,
  MS: buildMSStateArtifacts,
  MO: buildMOStateArtifacts,
  MT: buildMTStateArtifacts,
  NE: buildNEStateArtifacts,
  NV: buildNVStateArtifacts,
  NH: buildNHStateArtifacts,
  NJ: buildNJStateArtifacts,
  NM: buildNMStateArtifacts,
  NY: buildNYStateArtifacts,
  NC: buildNCStateArtifacts,
  ND: buildNDStateArtifacts,
  OH: buildOHStateArtifacts,
  OK: buildOKStateArtifacts,
  OR: buildORStateArtifacts,
  PA: buildPAStateArtifacts,
  RI: buildRIStateArtifacts,
  SC: buildSCStateArtifacts,
  SD: buildSDStateArtifacts,
  TN: buildTNStateArtifacts,
  TX: buildTXStateArtifacts,
  UT: buildUTStateArtifacts,
  VT: buildVTStateArtifacts,
  VA: buildVAStateArtifacts,
  WA: buildWAStateArtifacts,
  WV: buildWVStateArtifacts,
  WI: buildWIStateArtifacts,
  WY: buildWYStateArtifacts,
};

export { stateArtifactBuilders };
