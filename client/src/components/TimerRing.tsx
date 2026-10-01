import React from 'react';

interface TimerRingProps {
  seconds: number;
  totalSeconds?: number;
  isPaused?: boolean;
  size?: number;
}

export const TimerRing: React.FC<TimerRingProps> = ({
  seconds,
  totalSeconds = 10,
  isPaused = false,
  size = 120,
}) => {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, seconds / totalSeconds));
  const strokeDashoffset = circumference - progress * circumference;

  let color = 'var(--accent-cyan)';
  let glowColor = 'rgba(0, 242, 254, 0.4)';
  let isUrgent = false;

  if (seconds <= 3 && seconds > 0) {
    color = 'var(--accent-red)';
    glowColor = 'rgba(239, 68, 68, 0.6)';
    isUrgent = true;
  } else if (seconds <= 5) {
    color = 'var(--accent-gold)';
    glowColor = 'rgba(255, 215, 0, 0.5)';
  }

  const formattedTime = `00:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track background */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Active progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.8s ease, stroke 0.3s ease',
            filter: `drop-shadow(0 0 8px ${glowColor})`,
          }}
        />
      </svg>

      <div
        style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          className={`font-mono ${isUrgent ? 'pulse-urgent' : ''}`}
          style={{
            fontSize: size > 100 ? '1.8rem' : '1.25rem',
            fontWeight: 800,
            color: color,
            letterSpacing: '-0.02em',
          }}
        >
          {formattedTime}
        </span>
        {isPaused && (
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 800,
              color: '#f59e0b',
              background: 'rgba(245, 158, 11, 0.2)',
              padding: '2px 6px',
              borderRadius: '4px',
              marginTop: '2px',
            }}
          >
            PAUSED
          </span>
        )}
      </div>
    </div>
  );
};
