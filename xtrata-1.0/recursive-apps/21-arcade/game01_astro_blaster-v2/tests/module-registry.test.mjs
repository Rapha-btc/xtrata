import assert from 'node:assert/strict';
import { createModuleRegistry } from '../src/framework/module-registry.mjs';

export async function run(){
  const registry = createModuleRegistry();

  registry.register({
    id: 'late',
    priority: 30,
    apply(artifact){
      artifact.order.push('late');
      return artifact;
    }
  });

  registry.register({
    id: 'early',
    priority: 10,
    apply(artifact){
      artifact.order.push('early');
      return artifact;
    }
  });

  const artifact = { order: [], manifest: { modulePipeline: [] } };
  const result = registry.applyAll(artifact, {});

  assert.deepEqual(result.order, ['early', 'late']);
  assert.deepEqual(result.manifest.modulePipeline, ['early', 'late']);

  assert.throws(() => registry.register({ id: 'early', apply(){} }), /already registered/i);
  assert.throws(() => registry.register({ id: '', apply(){} }), /non-empty id/i);
  assert.throws(() => registry.register({ id: 'broken' }), /apply function/i);
}
