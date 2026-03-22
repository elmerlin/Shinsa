import React, { useState, useEffect } from 'react';
import { FORMAT_LABELS, FORMAT_ICONS } from '../../utils/tournamentConstants';

export default function PhaseTransition({ phaseName, phaseFormat, onComplete }) {
  const [step, setStep] = useState(0); // 0=countdown3, 1=countdown2, 2=countdown1, 3=reveal, 4=done

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 800),
      setTimeout(() => setStep(2), 1600),
      setTimeout(() => setStep(3), 2400),
      setTimeout(() => { setStep(4); onComplete?.(); }, 4000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  if (step >= 4) return null;

  const countdownNumber = step < 3 ? 3 - step : null;
  const label = phaseName || FORMAT_LABELS[phaseFormat] || phaseFormat;
  const icon = FORMAT_ICONS[phaseFormat] || '';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="text-center">
        {countdownNumber !== null ? (
          <div
            key={countdownNumber}
            className="animate-[scaleIn_0.6s_ease-out]"
          >
            <span className="font-display font-black text-[8rem] sm:text-[12rem] leading-none text-piu-accent/80 drop-shadow-[0_0_40px_rgba(255,51,102,0.4)]">
              {countdownNumber}
            </span>
          </div>
        ) : (
          <div className="animate-[slideUp_0.5s_ease-out]">
            <div className="text-5xl sm:text-7xl mb-4">{icon}</div>
            <h2 className="font-display font-black text-3xl sm:text-5xl text-white tracking-wider mb-2 drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
              {label}
            </h2>
            <div className="w-24 h-1 bg-piu-accent mx-auto rounded-full mt-4 animate-[expandWidth_0.6s_ease-out]" />
          </div>
        )}
      </div>

      <style>{`
        @keyframes scaleIn {
          0% { transform: scale(2.5); opacity: 0; }
          50% { transform: scale(0.9); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes slideUp {
          0% { transform: translateY(40px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes expandWidth {
          0% { width: 0; }
          100% { width: 6rem; }
        }
      `}</style>
    </div>
  );
}
