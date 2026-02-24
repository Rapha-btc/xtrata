import { gameModesCatalog } from '../catalogs/game-modes.mjs';
import { cloneSerializable } from '../framework/clone-serializable.mjs';

export const modesModule = {
  id: 'game-modes',
  priority: 20,
  description: 'Injects scalable game mode metadata for future runtime routing.',
  apply(artifact){
    artifact.runtimePatch.gameModes = cloneSerializable(gameModesCatalog);
    return artifact;
  }
};
