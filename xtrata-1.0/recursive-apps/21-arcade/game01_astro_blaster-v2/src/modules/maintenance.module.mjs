export const maintenanceModule = {
  id: 'maintenance-guidance',
  priority: 40,
  description: 'Adds maintenance metadata used by automation and docs.',
  apply(artifact){
    artifact.runtimePatch.maintenance = {
      buildCommand: 'npm run arcade:astro-v2:build',
      testCommand: 'npm run arcade:astro-v2:test',
      docs: 'recursive-apps/21-arcade/game01_astro_blaster-v2/AGENTS.md'
    };
    return artifact;
  }
};
