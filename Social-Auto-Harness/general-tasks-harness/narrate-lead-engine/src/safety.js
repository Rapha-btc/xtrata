export class LeadEngineSafetyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "LeadEngineSafetyError";
    this.details = details;
  }
}

function roundMb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

export function buildMemorySnapshot() {
  const usage = process.memoryUsage();
  return {
    rssMb: roundMb(usage.rss),
    heapUsedMb: roundMb(usage.heapUsed),
    heapTotalMb: roundMb(usage.heapTotal),
    externalMb: roundMb(usage.external),
    arrayBuffersMb: roundMb(usage.arrayBuffers ?? 0),
  };
}

export function assertMemoryWithinLimit({
  job,
  stage,
  extra = {},
} = {}) {
  if (!job?.maxHeapUsedMb) {
    return buildMemorySnapshot();
  }

  const snapshot = buildMemorySnapshot();
  if (snapshot.heapUsedMb > job.maxHeapUsedMb) {
    throw new LeadEngineSafetyError(
      `Stopping in ${stage} because heap usage reached ${snapshot.heapUsedMb} MB, above the configured ${job.maxHeapUsedMb} MB limit.`,
      {
        stage,
        ...snapshot,
        ...extra,
      }
    );
  }

  return snapshot;
}

export function assertCollectedItemBudget({
  job,
  collectedCount,
  stage,
} = {}) {
  if (!job?.maxCollectedItems) return;
  if (collectedCount <= job.maxCollectedItems) return;

  throw new LeadEngineSafetyError(
    `Stopping in ${stage} because ${collectedCount} collected items exceeded the configured ${job.maxCollectedItems} item safety cap.`,
    {
      stage,
      collectedCount,
      maxCollectedItems: job.maxCollectedItems,
    }
  );
}

export async function pauseIfNeeded(adapter, ms) {
  const waitMs = Number.parseInt(ms, 10);
  if (!Number.isFinite(waitMs) || waitMs <= 0) return;
  if (typeof adapter?.wait === "function") {
    await adapter.wait(waitMs);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

export async function closeManagedTab(adapter, navigationLike) {
  const tab = navigationLike?.tab ?? null;
  if (navigationLike?.action !== "opened-new-tab") return false;
  if (!Number.isFinite(tab?.windowId) || !Number.isFinite(tab?.tabIndex)) return false;
  if (typeof adapter?.closeTab !== "function") return false;

  try {
    await adapter.closeTab(tab);
    return true;
  } catch {
    return false;
  }
}

export function truncateText(value, maxLength) {
  const normalized = value?.toString().replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return null;
  if (!Number.isFinite(maxLength) || normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}
