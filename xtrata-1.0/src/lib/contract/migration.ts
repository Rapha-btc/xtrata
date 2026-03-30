import { getContractId } from './config';
import {
  CONTRACT_REGISTRY,
  type ContractRegistryEntry
} from './registry';

export type MigrationFunctionName =
  | 'migrate-from-v1'
  | 'migrate-from-v2-1-0'
  | 'migrate-from-v2-1-1';

export type MigrationRoute = {
  source: ContractRegistryEntry;
  target: ContractRegistryEntry;
  functionName: MigrationFunctionName;
};

const MIGRATION_PROTOCOLS_BY_TARGET: Record<
  ContractRegistryEntry['protocolVersion'],
  readonly ContractRegistryEntry['protocolVersion'][]
> = {
  '1.1.1': [],
  '2.1.0': ['1.1.1'],
  '2.1.1': ['1.1.1'],
  '3.0.0': ['1.1.1', '2.1.0', '2.1.1']
};

const MIGRATION_FUNCTION_BY_SOURCE: Partial<
  Record<ContractRegistryEntry['protocolVersion'], MigrationFunctionName>
> = {
  '1.1.1': 'migrate-from-v1',
  '2.1.0': 'migrate-from-v2-1-0',
  '2.1.1': 'migrate-from-v2-1-1'
};

const dedupeEntries = (entries: readonly ContractRegistryEntry[]) => {
  const seen = new Set<string>();
  const deduped: ContractRegistryEntry[] = [];
  for (const entry of entries) {
    const contractId = getContractId(entry);
    if (seen.has(contractId)) {
      continue;
    }
    seen.add(contractId);
    deduped.push(entry);
  }
  return deduped;
};

export const getMigrationSourceContracts = (
  target: ContractRegistryEntry,
  registry: readonly ContractRegistryEntry[] = CONTRACT_REGISTRY
) => {
  const explicitSourceIds = target.migrationSourceContractIds ?? [];
  if (explicitSourceIds.length > 0) {
    const registryById = new Map(
      registry.map((entry) => [getContractId(entry), entry] as const)
    );
    return dedupeEntries(
      explicitSourceIds
        .map((contractId) => registryById.get(contractId))
        .filter(
          (entry): entry is ContractRegistryEntry =>
            !!entry && entry.network === target.network
        )
    );
  }

  const allowedProtocols = MIGRATION_PROTOCOLS_BY_TARGET[target.protocolVersion] ?? [];
  return dedupeEntries(
    registry.filter(
      (entry) =>
        entry.network === target.network &&
        allowedProtocols.includes(entry.protocolVersion)
    )
  );
};

export const resolveMigrationFunctionName = (
  source: Pick<ContractRegistryEntry, 'protocolVersion'>
): MigrationFunctionName | null =>
  MIGRATION_FUNCTION_BY_SOURCE[source.protocolVersion] ?? null;

export const resolveMigrationRoute = (params: {
  source: ContractRegistryEntry;
  target: ContractRegistryEntry;
  registry?: readonly ContractRegistryEntry[];
}): MigrationRoute | null => {
  if (params.source.network !== params.target.network) {
    return null;
  }

  const functionName = resolveMigrationFunctionName(params.source);
  if (!functionName) {
    return null;
  }

  const supportedSourceIds = new Set(
    getMigrationSourceContracts(
      params.target,
      params.registry ?? CONTRACT_REGISTRY
    ).map((entry) => getContractId(entry))
  );
  const sourceContractId = getContractId(params.source);
  if (!supportedSourceIds.has(sourceContractId)) {
    return null;
  }

  return {
    source: params.source,
    target: params.target,
    functionName
  };
};
