import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const EMPTY_SNAPSHOT = {
  status: 'idle', posture: 'unknown', metrics: null, landmarks: [], color: '#22c55e',
  message: 'Kamera belum aktif', mode: 'work', startedAt: null,
};
const PostureMonitorContext = createContext(null);

export function PostureMonitorProvider({ children }) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [stream, setStream] = useState(null);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const controls = useRef({});

  const openMonitor = useCallback((options = {}) => { setTestMode(Boolean(options.testMode)); setMounted(true); setIsOpen(true); }, []);
  const minimizeMonitor = useCallback(() => setIsOpen(false), []);
  const restoreMonitor = useCallback(() => { setMounted(true); setIsOpen(true); }, []);
  const closeMonitor = useCallback(() => {
    setIsOpen(false); setMounted(false); setTestMode(false); setStream(null); setSnapshot(EMPTY_SNAPSHOT);
  }, []);
  const publishSnapshot = useCallback((update) => setSnapshot((current) => ({ ...current, ...update })), []);
  const registerControls = useCallback((next) => { controls.current = next || {}; }, []);
  const invoke = useCallback((name) => controls.current[name]?.(), []);
  const togglePause = useCallback(() => invoke('togglePause'), [invoke]);
  const finish = useCallback(() => {
    setIsOpen(true);
    return invoke('finish');
  }, [invoke]);

  useEffect(() => {
    const desktop = window.bungkokDesktop;
    if (!desktop) return undefined;
    desktop.setMonitoringState?.({ status: snapshot.status, posture: snapshot.posture, isOpen });
    return desktop.onMonitorAction?.((action) => {
      if (action === 'open') restoreMonitor();
      else if (action === 'pause') togglePause();
      else if (action === 'finish') finish();
    });
  }, [snapshot.status, snapshot.posture, isOpen, restoreMonitor, togglePause, finish]);

  return <PostureMonitorContext.Provider value={{
    mounted, isOpen, testMode, stream, snapshot, openMonitor, minimizeMonitor, restoreMonitor,
    closeMonitor, setMonitorStream: setStream, publishSnapshot, registerControls,
    togglePause, finish,
  }}>{children}</PostureMonitorContext.Provider>;
}

export function usePostureMonitor() {
  const value = useContext(PostureMonitorContext);
  if (!value) throw new Error('usePostureMonitor must be used within PostureMonitorProvider');
  return value;
}
