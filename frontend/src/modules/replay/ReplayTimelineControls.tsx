import React from 'react';

interface ReplayTimelineControlsProps {
  currentT: number;
  startT: number;
  endT: number;
  isPlaying: boolean;
  playbackRate: number;
  onPlayPause: () => void;
  onSeek: (t: number) => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onRateChange: (rate: number) => void;
  onReset: () => void;
}

export const ReplayTimelineControls: React.FC<ReplayTimelineControlsProps> = ({
  currentT,
  startT,
  endT,
  isPlaying,
  playbackRate,
  onPlayPause,
  onSeek,
  onStepForward,
  onStepBackward,
  onRateChange,
  onReset
}) => {
  // Format simulation time t in seconds to HH:MM:SS
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const percentage = endT > startT ? ((currentT - startT) / (endT - startT)) * 100 : 0;

  return (
    <div style={{
      backgroundColor: '#1b1b1b',
      border: '1px solid #333',
      borderRadius: '8px',
      padding: '15px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
    }}>
      {/* Time & Speed row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#00ffcc',
            backgroundColor: '#111',
            padding: '4px 10px',
            borderRadius: '4px',
            border: '1px solid #222',
            fontWeight: 'bold',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)'
          }}>
            {formatTime(currentT)}
          </div>
          <span style={{ fontSize: '12px', color: '#888' }}>
            Range: <strong style={{ color: '#aaa', fontFamily: 'monospace' }}>{formatTime(startT)}</strong> - <strong style={{ color: '#aaa', fontFamily: 'monospace' }}>{formatTime(endT)}</strong>
          </span>
        </div>

        {/* Speed Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Playback Speed:</span>
          <div style={{ display: 'flex', gap: '2px', backgroundColor: '#111', padding: '2px', borderRadius: '4px', border: '1px solid #222' }}>
            {[0.25, 0.5, 1, 2, 5, 10, 20].map(rate => {
              const active = playbackRate === rate;
              return (
                <button
                  key={rate}
                  onClick={() => onRateChange(rate)}
                  style={{
                    backgroundColor: active ? '#64b5f6' : 'transparent',
                    color: active ? '#000' : '#aaa',
                    border: 'none',
                    borderRadius: '3px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: active ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {rate}x
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Slider range row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace' }}>{formatTime(startT)}</span>
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type="range"
            min={startT}
            max={endT}
            value={currentT}
            onChange={e => onSeek(Number(e.target.value))}
            style={{
              width: '100%',
              height: '6px',
              backgroundColor: '#333',
              borderRadius: '3px',
              outline: 'none',
              cursor: 'pointer',
              WebkitAppearance: 'none'
            }}
          />
          <div style={{
            position: 'absolute',
            left: 0,
            width: `${percentage}%`,
            height: '6px',
            backgroundColor: '#64b5f6',
            borderRadius: '3px',
            pointerEvents: 'none'
          }}></div>
        </div>
        <span style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace' }}>{formatTime(endT)}</span>
      </div>

      {/* Control Buttons row */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px' }}>
        <button
          onClick={onReset}
          title="Reset to Start"
          style={{
            backgroundColor: 'transparent',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#aaa',
            width: '32px',
            height: '32px',
            cursor: 'pointer',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#666'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#444'; }}
        >
          <i className="fa-solid fa-backward-fast"></i>
        </button>

        <button
          onClick={onStepBackward}
          title="Back 5 Seconds"
          style={{
            backgroundColor: 'transparent',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#aaa',
            width: '32px',
            height: '32px',
            cursor: 'pointer',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#666'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#444'; }}
        >
          <i className="fa-solid fa-backward"></i>
        </button>

        <button
          onClick={onPlayPause}
          style={{
            backgroundColor: isPlaying ? '#ffb74d' : '#64b5f6',
            border: 'none',
            borderRadius: '50%',
            color: '#000',
            width: '45px',
            height: '45px',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            transition: 'transform 0.1s, background-color 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1.0)'}
        >
          <i className={isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play"}></i>
        </button>

        <button
          onClick={onStepForward}
          title="Forward 5 Seconds"
          style={{
            backgroundColor: 'transparent',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#aaa',
            width: '32px',
            height: '32px',
            cursor: 'pointer',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#666'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#444'; }}
        >
          <i className="fa-solid fa-forward"></i>
        </button>
      </div>
    </div>
  );
};
