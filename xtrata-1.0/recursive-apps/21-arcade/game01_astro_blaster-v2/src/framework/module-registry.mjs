export function createModuleRegistry(){
  const modules = [];
  const byId = new Map();

  function register(moduleDefinition){
    if(!moduleDefinition || typeof moduleDefinition !== 'object'){
      throw new Error('Module definition must be an object.');
    }

    const id = String(moduleDefinition.id || '').trim();
    if(!id){
      throw new Error('Module definition requires a non-empty id.');
    }
    if(byId.has(id)){
      throw new Error(`Module "${id}" is already registered.`);
    }
    if(typeof moduleDefinition.apply !== 'function'){
      throw new Error(`Module "${id}" must define an apply function.`);
    }

    const priority = Number.isFinite(moduleDefinition.priority)
      ? Math.trunc(moduleDefinition.priority)
      : 100;

    const normalized = {
      id,
      priority,
      description: moduleDefinition.description || '',
      apply: moduleDefinition.apply
    };

    modules.push(normalized);
    byId.set(id, normalized);
    return normalized;
  }

  function list(){
    return [...modules]
      .sort((a, b) => (a.priority - b.priority) || a.id.localeCompare(b.id))
      .map((moduleDefinition) => ({
        id: moduleDefinition.id,
        priority: moduleDefinition.priority,
        description: moduleDefinition.description
      }));
  }

  function applyAll(artifact, context){
    const ordered = [...modules].sort((a, b) => (a.priority - b.priority) || a.id.localeCompare(b.id));
    let currentArtifact = artifact;

    for(const moduleDefinition of ordered){
      const maybeNextArtifact = moduleDefinition.apply(currentArtifact, context);
      if(typeof maybeNextArtifact !== 'undefined'){
        currentArtifact = maybeNextArtifact;
      }
      if(currentArtifact && currentArtifact.manifest && Array.isArray(currentArtifact.manifest.modulePipeline)){
        currentArtifact.manifest.modulePipeline.push(moduleDefinition.id);
      }
    }

    return currentArtifact;
  }

  return {
    register,
    list,
    applyAll
  };
}
