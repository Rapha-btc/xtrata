import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logDebug, logInfo } from './logger';

const TAB_ID_KEY = 'xtrata.tab.id';
const LOCK_KEY = 'xtrata.tab.active';
const HEARTBEAT_MS = 2000;
const STALE_MS = 6000;

type TabLock = {
  tabId: string;
  ts: number;
};

const getStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch (error) {
    return null;
  }
};

const parseLock = (raw: string | null): TabLock | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as TabLock;
    if (!parsed || typeof parsed.tabId !== 'string' || typeof parsed.ts !== 'number') {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
};

const getOrCreateTabId = () => {
  if (typeof window === 'undefined') {
    return 'server';
  }
  try {
    const storage = window.sessionStorage;
    const existing = storage.getItem(TAB_ID_KEY);
    if (existing) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `tab-${Math.random().toString(36).slice(2)}`;
    storage.setItem(TAB_ID_KEY, generated);
    return generated;
  } catch (error) {
    return `tab-${Math.random().toString(36).slice(2)}`;
  }
};

const readLock = (storage: Storage | null) =>
  storage ? parseLock(storage.getItem(LOCK_KEY)) : null;

const writeLock = (storage: Storage | null, tabId: string) => {
  if (!storage) {
    return;
  }
  const lock: TabLock = {
    tabId,
    ts: Date.now()
  };
  storage.setItem(LOCK_KEY, JSON.stringify(lock));
};

const isLockStale = (lock: TabLock | null, now: number) =>
  !lock || now - lock.ts > STALE_MS;

export const useActiveTabGuard = () => {
  const storage = getStorage();
  const tabIdRef = useRef(getOrCreateTabId());
  const [isActive, setIsActive] = useState(true);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  const isActiveRef = useRef(isActive);

  const refreshState = useCallback(
    (lock: TabLock | null) => {
      if (!lock) {
        setIsActive(true);
        setActiveTabId(tabIdRef.current);
        setLastSeen(null);
        return;
      }
      setActiveTabId(lock.tabId);
      setLastSeen(lock.ts);
      setIsActive(lock.tabId === tabIdRef.current);
    },
    []
  );

  const claimLock = useCallback(
    (force: boolean) => {
      if (!storage) {
        setIsActive(true);
        return true;
      }
      const now = Date.now();
      const lock = readLock(storage);
      const ownsLock = lock?.tabId === tabIdRef.current;
      if (ownsLock || force || isLockStale(lock, now)) {
        writeLock(storage, tabIdRef.current);
        refreshState({ tabId: tabIdRef.current, ts: now });
        logDebug('tab', 'Tab lock claimed', {
          tabId: tabIdRef.current,
          force,
          previous: lock?.tabId ?? null
        });
        return true;
      }
      refreshState(lock);
      return false;
    },
    [storage, refreshState]
  );

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!storage) {
      setIsActive(true);
      return;
    }

    claimLock(true);

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (isActiveRef.current) {
        writeLock(storage, tabIdRef.current);
      } else {
        claimLock(false);
      }
    }, HEARTBEAT_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        claimLock(true);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LOCK_KEY) {
        return;
      }
      refreshState(parseLock(event.newValue));
    };

    const handleUnload = () => {
      const lock = readLock(storage);
      if (lock?.tabId === tabIdRef.current) {
        storage.removeItem(LOCK_KEY);
        logInfo('tab', 'Released tab lock', { tabId: tabIdRef.current });
      }
    };

    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [storage, claimLock, refreshState]);

  const takeControl = useCallback(() => {
    claimLock(true);
  }, [claimLock]);

  const status = useMemo(() => (isActive ? 'active' : 'standby'), [isActive]);

  return {
    isActive,
    status,
    activeTabId,
    lastSeen,
    tabId: tabIdRef.current,
    takeControl
  };
};
