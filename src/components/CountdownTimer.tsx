import { useEffect, useState } from 'react';

interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function computeCountdown(targetIso: string): CountdownParts {
  const targetMs = Date.parse(targetIso);
  if (Number.isNaN(targetMs)) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: false };
  }
  const diff = targetMs - Date.now();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds, expired: false };
}

export function CountdownTimer({
  targetIso,
  timezone,
}: {
  targetIso: string;
  timezone: string;
}) {
  const [parts, setParts] = useState<CountdownParts>(() => computeCountdown(targetIso));

  useEffect(() => {
    setParts(computeCountdown(targetIso));
    const timer = window.setInterval(() => {
      setParts(computeCountdown(targetIso));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [targetIso]);

  const cells = [
    { label: 'Days', value: String(parts.days).padStart(2, '0') },
    { label: 'Hours', value: String(parts.hours).padStart(2, '0') },
    { label: 'Minutes', value: String(parts.minutes).padStart(2, '0') },
    { label: 'Seconds', value: String(parts.seconds).padStart(2, '0') },
  ];

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="min-w-[66px] sm:min-w-[82px] border border-[#D6B36A]/25 bg-[#080B12]/75 backdrop-blur-sm rounded-lg px-3 py-2.5 text-center"
          >
            <div className="font-mono tabular-nums text-xl sm:text-2xl font-semibold text-[#F8F7F2] tracking-tight">
              {cell.value}
            </div>
            <div className="text-[11px] font-medium text-[#D6B36A] mt-0.5 tracking-wide">
              {cell.label}
            </div>
          </div>
        ))}
      </div>
      <div className="text-xs text-[#A9DDF5]/80">
        {parts.expired
          ? 'The celebration is underway.'
          : `Countdown synchronized to ${timezone}`}
      </div>
    </div>
  );
}
