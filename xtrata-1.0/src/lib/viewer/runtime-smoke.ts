export type RuntimeSmokeEvent = {
  at?: number;
  level?: string;
  message?: string;
  detail?: Record<string, unknown> | null;
};

export type RuntimeSmokeSummary = {
  status: 'pending' | 'pass' | 'fail';
  primaryFailure: string | null;
  milestoneCounts: {
    passed: number;
    total: number;
  };
  milestones: Record<string, boolean>;
};

const getString = (value: unknown) =>
  typeof value === 'string' ? value : '';

const getDetailUrl = (detail: Record<string, unknown> | null | undefined) => {
  if (!detail) {
    return '';
  }
  const responseUrl = getString(detail.responseUrl);
  if (responseUrl) {
    return responseUrl;
  }
  return getString(detail.url);
};

const includesPath = (
  detail: Record<string, unknown> | null | undefined,
  pathFragment: string
) => getDetailUrl(detail).includes(pathFragment);

export const summarizeRuntimeSmoke = (
  events: RuntimeSmokeEvent[]
): RuntimeSmokeSummary => {
  const milestones = {
    diagnosticsInstalled: false,
    bootstrapInstalled: false,
    patchLoaded: false,
    manifestLoaded: false,
    audioContextRunning: false,
    workletRequested: false,
    workletLoaded: false,
    workletNodeCreated: false,
    destinationConnected: false
  };
  let primaryFailure: string | null = null;

  for (const event of events) {
    const message = getString(event.message);
    const detail = event.detail ?? null;
    if (message === 'Runtime diagnostics installed') {
      milestones.diagnosticsInstalled = true;
    }
    if (message === 'Runtime module bootstrap installed') {
      milestones.bootstrapInstalled = true;
    }
    if (
      message === 'Tracked fetch completed' &&
      includesPath(detail, '/patch.json')
    ) {
      milestones.patchLoaded = true;
    }
    if (
      message === 'Tracked fetch completed' &&
      includesPath(detail, '/manifest.json')
    ) {
      milestones.manifestLoaded = true;
    }
    if (
      (message === 'AudioContext created' ||
        message === 'AudioContext state changed' ||
        message === 'AudioContext resume resolved') &&
      getString(detail && detail.state) === 'running'
    ) {
      milestones.audioContextRunning = true;
    }
    if (message === 'AudioWorklet.addModule called') {
      milestones.workletRequested = true;
    }
    if (message === 'AudioWorklet.addModule resolved') {
      milestones.workletLoaded = true;
    }
    if (message === 'AudioWorkletNode created') {
      milestones.workletNodeCreated = true;
    }
    if (
      message === 'AudioNode connect' &&
      (getString(detail && detail.destination) === 'AudioDestinationNode' ||
        getString(detail && detail.destination) === 'GainNode')
    ) {
      milestones.destinationConnected = true;
    }
    if (
      !primaryFailure &&
      (message === 'AudioWorklet.addModule failed' ||
        message === 'AudioWorkletNode processorerror' ||
        message === 'Unhandled runtime rejection' ||
        message === 'Tracked fetch failed')
    ) {
      primaryFailure =
        getString(detail && detail.error) ||
        getString(detail && detail.message) ||
        message;
    }
  }

  const passed = Object.values(milestones).filter(Boolean).length;
  const total = Object.keys(milestones).length;
  let status: RuntimeSmokeSummary['status'] = 'pending';
  if (primaryFailure) {
    status = 'fail';
  } else if (
    milestones.diagnosticsInstalled &&
    milestones.patchLoaded &&
    milestones.manifestLoaded &&
    milestones.audioContextRunning &&
    milestones.workletRequested &&
    milestones.workletLoaded &&
    milestones.workletNodeCreated
  ) {
    status = 'pass';
  }

  return {
    status,
    primaryFailure,
    milestoneCounts: {
      passed,
      total
    },
    milestones
  };
};
