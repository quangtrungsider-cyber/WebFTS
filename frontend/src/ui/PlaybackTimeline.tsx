import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AircraftData } from '../data/types';

interface SimInfo {
  simt: number;
  simutc: string;
  state: number;
  speed: number;
  scenname: string;
}

interface Props {
  onClose: () => void;
}

const W = 580;

const pad = (n: number) => String(n).padStart(2, '0');

const fmtSimTime = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

const fmtUTC = (utc: string, fallback: number): string => {
  if (utc) {
    // datetime format: "2026-06-26 00:41:34" or "2026-06-26T00:41:34Z"
    const tIdx = utc.indexOf('T');
    const spIdx = utc.indexOf(' ');
    if (tIdx > 0) return utc.substring(tIdx + 1, tIdx + 9) + ' UTC';
    if (spIdx > 0) return utc.substring(spIdx + 1, spIdx + 9) + ' UTC';
    // pure time "HH:MM:SS..."
    if (utc.includes(':')) return utc.substring(0, 8) + ' UTC';
    // "HHMMSS"
    if (utc.length >= 6) return `${utc.slice(0, 2)}:${utc.slice(2, 4)}:${utc.slice(4, 6)} UTC`;
  }
  return fmtSimTime(fallback) + ' UTC';
};

// One buffered frame of the live aircraft picture, tagged with the engine's
// simt at capture time. Kept purely client-side/in-memory -- this is NOT the
// same thing as the "Simulation Recorder" (which persists to the backend for
// the separate Simulation Replay page); this is a short local ring buffer
// that exists only to make the Playback Timeline's "back" button smooth.
interface HistorySnapshot {
  simt: number;
  data: AircraftData;
}

const HISTORY_MAX_ENTRIES = 1800; // ~30 min at ~1 sample/sec
const HISTORY_SAMPLE_INTERVAL_MS = 1000;

/**
 * Linearly interpolate two buffered AircraftData snapshots at fraction
 * frac (0 = fully `a`, 1 = fully `b`) into a single frame safe to feed
 * straight into stateManager.updateAircraftData(). Matches aircraft between
 * the two snapshots by id (callsign); an id only present in one snapshot
 * (created/deleted between them) is carried through unchanged rather than
 * invented -- same "don't fabricate motion" spirit as replayEngine.ts's
 * interpolateAircraftFrame, just operating on the parallel-array AircraftData
 * shape instead of one sample per callsign.
 */
function interpolateSnapshots(a: HistorySnapshot, b: HistorySnapshot, frac: number): AircraftData {
  const clamped = Math.max(0, Math.min(1, frac));
  const bIndexOf = new Map<string, number>();
  b.data.id.forEach((id, i) => bIndexOf.set(id, i));

  const out: AircraftData = {
    id: [], lat: [], lon: [], alt: [], trk: [], vs: [],
    tas: [], inconf: [], tcpamax: [], nconf_cur: b.data.nconf_cur, nconf_tot: b.data.nconf_tot,
    nlos_cur: b.data.nlos_cur, nlos_tot: b.data.nlos_tot,
  };
  if (a.data.cas || b.data.cas) out.cas = [];
  if (a.data.gs || b.data.gs) out.gs = [];
  if (a.data.actype || b.data.actype) out.actype = [];

  a.data.id.forEach((id, i) => {
    const j = bIndexOf.get(id);
    out.id.push(id);
    if (j === undefined) {
      // Aircraft deleted between a and b -- hold its last known state rather
      // than guessing where it went.
      out.lat.push(a.data.lat[i]);
      out.lon.push(a.data.lon[i]);
      out.alt.push(a.data.alt[i]);
      out.trk.push(a.data.trk[i]);
      out.vs.push(a.data.vs[i]);
      out.tas.push(a.data.tas[i]);
      out.inconf.push(a.data.inconf[i]);
      out.tcpamax.push(a.data.tcpamax[i]);
      if (out.cas) out.cas.push(a.data.cas?.[i] ?? 0);
      if (out.gs) out.gs.push(a.data.gs?.[i] ?? 0);
      if (out.actype) out.actype.push(a.data.actype?.[i] ?? '');
    } else {
      const lerp = (x: number, y: number) => x + (y - x) * clamped;
      out.lat.push(lerp(a.data.lat[i], b.data.lat[j]));
      out.lon.push(lerp(a.data.lon[i], b.data.lon[j]));
      out.alt.push(lerp(a.data.alt[i], b.data.alt[j]));
      out.tas.push(lerp(a.data.tas[i], b.data.tas[j]));
      out.vs.push(lerp(a.data.vs[i], b.data.vs[j]));
      // Heading/conflict/type: snap to whichever endpoint is closer in time,
      // same reasoning as replayEngine.ts (avoids 0/360 wraparound bugs, and
      // booleans/strings have no meaningful "midpoint" anyway).
      const near = clamped < 0.5 ? i : j;
      const nearSnap = clamped < 0.5 ? a.data : b.data;
      out.trk.push(nearSnap.trk[near]);
      out.inconf.push(nearSnap.inconf[near]);
      out.tcpamax.push(nearSnap.tcpamax[near]);
      if (out.cas) out.cas.push(nearSnap.cas?.[near] ?? 0);
      if (out.gs) out.gs.push(nearSnap.gs?.[near] ?? 0);
      if (out.actype) out.actype.push(nearSnap.actype?.[near] ?? '');
    }
  });
  // Aircraft that appear only in b (created between a and b): show them as-is
  // once we're at/near b rather than interpolating from nothing.
  if (clamped > 0.5) {
    b.data.id.forEach((id, j) => {
      if (a.data.id.includes(id)) return;
      out.id.push(id);
      out.lat.push(b.data.lat[j]);
      out.lon.push(b.data.lon[j]);
      out.alt.push(b.data.alt[j]);
      out.trk.push(b.data.trk[j]);
      out.vs.push(b.data.vs[j]);
      out.tas.push(b.data.tas[j]);
      out.inconf.push(b.data.inconf[j]);
      out.tcpamax.push(b.data.tcpamax[j]);
      if (out.cas) out.cas.push(b.data.cas?.[j] ?? 0);
      if (out.gs) out.gs.push(b.data.gs?.[j] ?? 0);
      if (out.actype) out.actype.push(b.data.actype?.[j] ?? '');
    });
  }
  return out;
}

function cloneAircraftData(data: AircraftData): AircraftData {
  const cloned: AircraftData = {
    id: [...data.id], lat: [...data.lat], lon: [...data.lon], alt: [...data.alt],
    trk: [...data.trk], vs: [...data.vs], tas: [...data.tas], inconf: [...data.inconf],
    tcpamax: [...data.tcpamax], nconf_cur: data.nconf_cur, nconf_tot: data.nconf_tot,
    nlos_cur: data.nlos_cur, nlos_tot: data.nlos_tot,
  };
  if (data.cas) cloned.cas = [...data.cas];
  if (data.gs) cloned.gs = [...data.gs];
  if (data.actype) cloned.actype = [...data.actype];
  return cloned;
}

const PlaybackTimeline: React.FC<Props> = ({ onClose }) => {
  const [simTime, setSimTime]     = useState(0);
  const [simUTC, setSimUTC]       = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [maxTime, setMaxTime]     = useState(3600);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekFallback, setSeekFallback] = useState(false); // true only for the RESET+IC last-resort path
  const [mode, setMode] = useState<'live' | 'reviewing'>('live');

  const [isScrubbingActive, setIsScrubbingActive] = useState(false);
  const [scrubPct, setScrubPct]                   = useState(0);

  const [panelPos, setPanelPos]         = useState<{ x: number; y: number } | null>(null);
  const [isPanelDragging, setIsPanelDragging] = useState(false);
  const panelDragOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  useEffect(() => {
    setPanelPos({
      x: Math.round(window.innerWidth / 2 - W / 2),
      y: Math.round(window.innerHeight - 120),
    });
  }, []);

  const simTimeRef   = useRef(0);
  const maxTimeRef   = useRef(3600);
  const scenNameRef  = useRef('');
  const isPlayingRef = useRef(false);
  const timelineRef  = useRef<HTMLDivElement>(null);

  // Local, in-memory-only history ring buffer -- see HistorySnapshot above.
  const historyRef = useRef<HistorySnapshot[]>([]);
  const modeRef = useRef<'live' | 'reviewing'>('live');
  const reviewSimtRef = useRef(0);
  const wasPlayingBeforeReviewRef = useRef(false);
  const lastSampleAtRef = useRef(0);

  useEffect(() => {
    const tick = setInterval(() => {
      const appInstance = (window as any).app;
      const info: SimInfo | null = appInstance?.getState?.()?.simInfo ?? null;
      if (!info) return;
      simTimeRef.current   = info.simt;
      isPlayingRef.current = info.state === 2;
      scenNameRef.current  = info.scenname || '';
      const grown = Math.max(maxTimeRef.current, info.simt + 600, 3600);
      maxTimeRef.current = grown;

      // Only buffer history while genuinely live -- while reviewing, the
      // engine's simt keeps advancing in the background (we deliberately
      // don't touch it), but its OWN acdata is being dropped at the socket
      // level (see SocketManager.setPauseLiveAircraftUpdates), so sampling
      // it here would just record stale/irrelevant frames.
      if (modeRef.current === 'live') {
        const now = Date.now();
        if (now - lastSampleAtRef.current >= HISTORY_SAMPLE_INTERVAL_MS) {
          lastSampleAtRef.current = now;
          const acData: AircraftData | null = appInstance?.getState?.()?.aircraftData ?? null;
          if (acData && acData.id && acData.id.length > 0) {
            historyRef.current.push({ simt: info.simt, data: cloneAircraftData(acData) });
            if (historyRef.current.length > HISTORY_MAX_ENTRIES) {
              historyRef.current.shift();
            }
          }
        }
      }

      if (!isScrubbingActive && modeRef.current === 'live') {
        setSimTime(info.simt);
        setSimUTC(info.simutc || '');
        setIsPlaying(info.state === 2);
        setMaxTime(grown);
      }
    }, 500);
    return () => clearInterval(tick);
  }, [isScrubbingActive]);

  const sendCommand = useCallback((cmd: string) => {
    (window as any).app?.sendCommand?.(cmd);
  }, []);

  // ── Review-mode history playback (smooth, no engine reset) ────────────────

  /** Find the two buffered snapshots bracketing targetSimt, or null if the
   * buffer doesn't reach back that far. */
  const findBracket = (targetSimt: number): [HistorySnapshot, HistorySnapshot] | null => {
    const hist = historyRef.current;
    if (hist.length === 0 || targetSimt < hist[0].simt) return null;
    if (targetSimt >= hist[hist.length - 1].simt) {
      const last = hist[hist.length - 1];
      return [last, last];
    }
    for (let i = 0; i < hist.length - 1; i++) {
      if (hist[i].simt <= targetSimt && targetSimt <= hist[i + 1].simt) {
        return [hist[i], hist[i + 1]];
      }
    }
    return [hist[hist.length - 1], hist[hist.length - 1]];
  };

  const showHistorySnapshot = (targetSimt: number): boolean => {
    const bracket = findBracket(targetSimt);
    if (!bracket) return false;
    const [a, b] = bracket;
    const frac = b.simt > a.simt ? (targetSimt - a.simt) / (b.simt - a.simt) : 0;
    const frame = interpolateSnapshots(a, b, frac);
    (window as any).app?.getStateManager?.()?.updateAircraftData(frame);
    return true;
  };

  const enterReviewMode = () => {
    if (modeRef.current === 'reviewing') return;
    wasPlayingBeforeReviewRef.current = isPlayingRef.current;
    if (isPlayingRef.current) sendCommand('HOLD');
    (window as any).app?.getSocketManager?.()?.setPauseLiveAircraftUpdates(true);
    modeRef.current = 'reviewing';
    setMode('reviewing');
  };

  const returnToLive = useCallback(() => {
    (window as any).app?.getSocketManager?.()?.setPauseLiveAircraftUpdates(false);
    modeRef.current = 'live';
    setMode('live');
    reviewSimtRef.current = simTimeRef.current;
    setSimTime(simTimeRef.current);
    if (wasPlayingBeforeReviewRef.current) {
      sendCommand('OP');
    }
  }, [sendCommand]);

  // ── Seek ──────────────────────────────────────────────────────────────────

  const seekTo = useCallback(async (targetSec: number) => {
    const current    = simTimeRef.current;
    const scen       = scenNameRef.current;
    setIsSeeking(true);
    const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    const finishFallbackSeek = (wasPlaying: boolean) => {
      sendCommand('HOLD');
      sendCommand('DTMULT 1');
      if (wasPlaying) sendCommand('OP');
      setIsSeeking(false);
      setSeekFallback(false);
    };

    // Reviewing forward, but still not past the real (live) engine time --
    // or backward at all: try the smooth, buffer-based path first. This
    // covers by far the most common case (scrubbing/stepping within the
    // last ~30 min), and never touches the live engine at all.
    if (targetSec <= current) {
      const shown = showHistorySnapshot(targetSec);
      if (shown) {
        enterReviewMode();
        reviewSimtRef.current = targetSec;
        setSimTime(targetSec);
        setIsSeeking(false);
        return;
      }
      // Target is further back than the buffer retains (e.g. panel just
      // opened, or scrubbing past ~30 min) -- only remaining option is the
      // old reset-and-refly-to-there mechanism. Flag it clearly so the user
      // understands *why* this particular seek is slow/flashes, instead of
      // it looking like the same silent glitch as before.
      setSeekFallback(true);
      const wasPlaying = wasPlayingBeforeReviewRef.current || isPlayingRef.current;
      if (modeRef.current === 'reviewing') {
        (window as any).app?.getSocketManager?.()?.setPauseLiveAircraftUpdates(false);
        modeRef.current = 'live';
        setMode('live');
      }
      sendCommand('HOLD');
      await delay(150);
      sendCommand('RESET');
      await delay(500);
      if (scen) {
        const base = scen.replace(/\.scn$/i, '').replace(/^.*[/\\]/, '');
        sendCommand(`IC ${base}`);
        await delay(1000);
      }
      historyRef.current = []; // stale after a real reset
      if (targetSec > 0) {
        const mult   = 200;
        const waitMs = Math.ceil((targetSec / mult) * 1000) + 300;
        sendCommand('OP');
        sendCommand(`DTMULT ${mult}`);
        setTimeout(() => finishFallbackSeek(wasPlaying), waitMs);
      } else {
        finishFallbackSeek(wasPlaying);
      }
      return;
    }

    // Forward, past the real live engine time: this is genuinely asking the
    // simulation to advance faster than real-time, which only the engine
    // itself can do -- unchanged from before (this path was never the
    // complaint; only "back" was reset-y).
    if (modeRef.current === 'reviewing') returnToLive();
    const wasPlaying = isPlayingRef.current;
    sendCommand('HOLD');
    await delay(150);
    const diff   = Math.max(1, targetSec - current);
    const mult   = 200;
    const waitMs = Math.ceil((diff / mult) * 1000) + 300;
    sendCommand('OP');
    sendCommand(`DTMULT ${mult}`);
    setTimeout(() => finishFallbackSeek(wasPlaying), waitMs);
  }, [sendCommand, returnToLive]);

  // ── Scrubber ──────────────────────────────────────────────────────────────

  const pctFromX = (clientX: number) => {
    if (!timelineRef.current) return 0;
    const r = timelineRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  const handleScrubMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsScrubbingActive(true);
    setScrubPct(pctFromX(e.clientX) * 100);
  }, []);

  useEffect(() => {
    if (!isScrubbingActive) return;
    const onMove = (e: MouseEvent) => setScrubPct(pctFromX(e.clientX) * 100);
    const onUp   = (e: MouseEvent) => {
      setIsScrubbingActive(false);
      seekTo(pctFromX(e.clientX) * maxTimeRef.current);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',  onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',  onUp);
    };
  }, [isScrubbingActive, seekTo]);

  // ── Panel drag ────────────────────────────────────────────────────────────

  const handlePanelDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsPanelDragging(true);
    panelDragOrigin.current = {
      mx: e.clientX, my: e.clientY,
      px: panelPos?.x ?? 0, py: panelPos?.y ?? 0,
    };
  }, [panelPos]);

  useEffect(() => {
    if (!isPanelDragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - panelDragOrigin.current.mx;
      const dy = e.clientY - panelDragOrigin.current.my;
      setPanelPos({
        x: Math.max(0, Math.min(window.innerWidth  - W,   panelDragOrigin.current.px + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 100, panelDragOrigin.current.py + dy)),
      });
    };
    const onUp = () => setIsPanelDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',  onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',  onUp);
    };
  }, [isPanelDragging]);

  // Leaving the panel entirely while still "reviewing" would otherwise leave
  // live aircraft updates permanently suppressed -- always resync on unmount.
  useEffect(() => {
    return () => {
      if (modeRef.current === 'reviewing') {
        (window as any).app?.getSocketManager?.()?.setPauseLiveAircraftUpdates(false);
      }
    };
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────

  const togglePlayPause = () => {
    if (modeRef.current === 'reviewing') {
      returnToLive();
      return;
    }
    sendCommand(isPlayingRef.current ? 'HOLD' : 'OP');
  };
  const stepBack        = () => !isSeeking && seekTo(Math.max(0, (modeRef.current === 'reviewing' ? reviewSimtRef.current : simTimeRef.current) - 15));
  const stepForward     = () => !isSeeking && seekTo((modeRef.current === 'reviewing' ? reviewSimtRef.current : simTimeRef.current) + 15);

  const pct = isScrubbingActive ? scrubPct : (maxTime > 0 ? (simTime / maxTime) * 100 : 0);

  const TICK_INTERVAL = 600;
  const ticks: { label: string; pct: number }[] = [];
  for (let t = 0; t <= maxTime; t += TICK_INTERVAL) {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    ticks.push({ label: `${h}:${pad(m)}`, pct: Math.max(0, Math.min(100, (t / maxTime) * 100)) });
  }

  const ctrlBtn = (active = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32,
    background: active ? 'rgba(255,185,0,0.18)' : 'rgba(255,255,255,0.05)',
    border: `1px solid ${active ? 'rgba(255,185,0,0.5)' : 'rgba(255,255,255,0.1)'}`,
    borderRadius: 6,
    color: isSeeking ? 'rgba(255,255,255,0.25)' : (active ? '#ffb900' : 'rgba(255,255,255,0.75)'),
    cursor: isSeeking ? 'not-allowed' : 'pointer',
    fontSize: 13,
    flexShrink: 0,
    transition: 'background 0.15s, border-color 0.15s',
  });

  const playBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36,
    background: isPlaying ? 'rgba(255,185,0,0.22)' : 'rgba(255,255,255,0.08)',
    border: `1px solid ${isPlaying ? 'rgba(255,185,0,0.6)' : 'rgba(255,255,255,0.15)'}`,
    borderRadius: '50%',
    color: isPlaying ? '#ffb900' : 'rgba(255,255,255,0.85)',
    cursor: 'pointer',
    fontSize: 14,
    flexShrink: 0,
    transition: 'background 0.15s, border-color 0.15s',
  };

  if (!panelPos) return null;

  const displaySimTime = mode === 'reviewing' ? reviewSimtRef.current : simTime;

  return (
    <div
      style={{
        position: 'fixed',
        left: panelPos.x,
        top:  panelPos.y,
        width: W,
        zIndex: 2000,
        backgroundColor: 'rgba(10, 12, 20, 0.96)',
        border: `1px solid ${mode === 'reviewing' ? 'rgba(0,204,255,0.35)' : 'rgba(255,185,0,0.22)'}`,
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        onMouseDown={handlePanelDragStart}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 10px',
          borderBottom: '1px solid rgba(255,185,0,0.1)',
          cursor: isPanelDragging ? 'grabbing' : 'grab',
          background: 'rgba(255,185,0,0.03)',
        }}
      >
        <i className="fa-solid fa-grip-lines" style={{ color: 'rgba(255,185,0,0.35)', fontSize: 9 }} />

        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: 700, letterSpacing: '1.5px' }}>
          PLAYBACK TIMELINE
        </span>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#ffb900', fontSize: 13, fontWeight: 700, letterSpacing: 1, fontFamily: 'monospace' }}>
            {mode === 'reviewing' ? fmtSimTime(displaySimTime) + ' UTC' : fmtUTC(simUTC, simTime)}
          </span>
          {isSeeking && !seekFallback && (
            <span style={{ color: 'rgba(255,185,0,0.6)', fontSize: 10 }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 3 }} />
              Seeking…
            </span>
          )}
          {isSeeking && seekFallback && (
            <span style={{ color: 'rgba(255,120,80,0.85)', fontSize: 10 }}>
              <i className="fa-solid fa-rotate fa-spin" style={{ marginRight: 3 }} />
              Đang dựng lại từ đầu kịch bản (ngoài phạm vi bộ nhớ đệm)…
            </span>
          )}
          {!isSeeking && mode === 'reviewing' && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 6,
              color: '#00ccff', fontSize: 10, fontWeight: 700,
              background: 'rgba(0,204,255,0.1)', border: '1px solid rgba(0,204,255,0.3)',
              borderRadius: 4, padding: '2px 8px',
            }}>
              <i className="fa-solid fa-clock-rotate-left" />
              ĐANG XEM LẠI (tạm dừng)
              <button
                onClick={returnToLive}
                onMouseDown={e => e.stopPropagation()}
                style={{
                  background: '#00ccff', color: '#001018', border: 'none',
                  borderRadius: 3, padding: '1px 6px', fontSize: 9, fontWeight: 700,
                  cursor: 'pointer', marginLeft: 4,
                }}
              >
                Về Live
              </button>
            </span>
          )}
        </div>

        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={onClose}
          style={{
            background: 'none', border: 'none',
            color: 'rgba(255,100,100,0.55)', cursor: 'pointer',
            padding: '1px 4px', fontSize: 12, borderRadius: 3,
          }}
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* Controls */}
      <div style={{ padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>

        {/* Buttons + scrubber row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

          {/* Back 15s */}
          <button
            style={ctrlBtn()}
            onClick={stepBack}
            title="Back 15s"
            onMouseDown={e => e.stopPropagation()}
          >
            <i className="fa-solid fa-backward" style={{ fontSize: 11 }} />
            <span style={{ fontSize: 8, marginLeft: 2, opacity: 0.7 }}>15</span>
          </button>

          {/* Play / Pause (acts as "Về Live" while reviewing) */}
          <button
            style={playBtn}
            onClick={togglePlayPause}
            title={mode === 'reviewing' ? 'Về Live' : (isPlaying ? 'Pause' : 'Play')}
            onMouseDown={e => e.stopPropagation()}
          >
            <i className={`fa-solid fa-${mode === 'reviewing' ? 'satellite-dish' : (isPlaying ? 'pause' : 'play')}`} />
          </button>

          {/* Forward 15s */}
          <button
            style={ctrlBtn()}
            onClick={stepForward}
            title="Forward 15s"
            onMouseDown={e => e.stopPropagation()}
          >
            <span style={{ fontSize: 8, marginRight: 2, opacity: 0.7 }}>15</span>
            <i className="fa-solid fa-forward" style={{ fontSize: 11 }} />
          </button>

          {/* Scrubber */}
          <div
            ref={timelineRef}
            onMouseDown={handleScrubMouseDown}
            style={{
              flex: 1, position: 'relative', height: 32,
              cursor: isScrubbingActive ? 'grabbing' : 'pointer',
              padding: '0 4px',
            }}
          >
            {/* Track bg */}
            <div style={{
              position: 'absolute', top: 14, left: 4, right: 4,
              height: 4, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 2,
            }}>
              <div style={{
                position: 'absolute', left: 0,
                width: `${pct}%`, height: '100%',
                background: mode === 'reviewing'
                  ? 'linear-gradient(90deg, rgba(0,204,255,0.5), rgba(0,204,255,0.85))'
                  : 'linear-gradient(90deg, rgba(255,185,0,0.5), rgba(255,185,0,0.85))',
                borderRadius: 2,
                transition: isScrubbingActive ? 'none' : 'width 0.45s linear',
              }} />
            </div>

            {/* Thumb */}
            <div style={{
              position: 'absolute',
              left: `calc(${pct}% + 4px - 7px)`,
              top: 8,
              width: 14, height: 14,
              borderRadius: '50%',
              backgroundColor: mode === 'reviewing' ? '#00ccff' : '#ffb900',
              boxShadow: isScrubbingActive
                ? `0 0 0 4px ${mode === 'reviewing' ? 'rgba(0,204,255,0.2)' : 'rgba(255,185,0,0.2)'}, 0 0 12px ${mode === 'reviewing' ? 'rgba(0,204,255,0.6)' : 'rgba(255,185,0,0.6)'}`
                : `0 0 6px ${mode === 'reviewing' ? 'rgba(0,204,255,0.45)' : 'rgba(255,185,0,0.45)'}`,
              border: '2px solid rgba(255,255,255,0.2)',
              zIndex: 3,
              pointerEvents: 'none',
              transition: isScrubbingActive ? 'none' : 'left 0.45s linear',
            }} />

            {/* Ticks */}
            {ticks.map((tick, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: `calc(${tick.pct}% + 4px)`,
                top: 20,
                transform: 'translateX(-50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{ width: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.12)' }} />
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.22)', marginTop: 1, whiteSpace: 'nowrap' }}>
                  {tick.label}
                </span>
              </div>
            ))}
          </div>

          {/* Current / max time */}
          <span style={{
            fontSize: 11, color: 'rgba(255,255,255,0.45)',
            fontFamily: 'monospace', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {fmtSimTime(displaySimTime)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PlaybackTimeline;
