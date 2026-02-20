export const metadataModule = {
  id: 'metadata',
  priority: 10,
  description: 'Adds version metadata and migration provenance.',
  apply(artifact){
    artifact.runtimePatch.version = 'game01_astro_blaster-v2';
    artifact.runtimePatch.buildFramework = 'modular-pipeline';
    artifact.runtimePatch.migratedFrom = 'game01_astro_blaster-v2/src/legacy/game01_astro_blaster.legacy.js';
    artifact.runtimePatch.invariants = {
      id: 'astro_blaster',
      scoreMode: 'score',
      requiresGuardedSubmitCall: true,
      stableTestHooks: ['getState', 'completeLevel', 'forceWin', 'setDeterministicSeed']
    };
    return artifact;
  }
};
