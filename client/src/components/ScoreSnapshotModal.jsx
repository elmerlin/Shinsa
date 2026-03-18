import React from 'react';
import SendToDirectMessageButton from './SendToDirectMessageButton';
import ScoreSnapshotCard from './ScoreSnapshotCard';

export default function ScoreSnapshotModal({
  score,
  jacketUrl = '',
  chartLink = '',
  onClose,
  directMessageLinkShare = null,
  modalLabel = 'Run details',
}) {
  if (!score) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/82 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[23.5rem]" onClick={(event) => event.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] text-cyan-200/75">
            {modalLabel}
          </p>
          <div className="flex items-center gap-2">
            {directMessageLinkShare ? (
              <SendToDirectMessageButton
                linkShare={directMessageLinkShare}
                variant="icon"
                title="Send to DM"
                className="h-10 w-10 justify-center rounded-2xl border border-white/10 bg-black/25 text-gray-100 hover:border-cyan-300/30 hover:bg-black/40 hover:text-white"
              />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-gray-200 transition-colors hover:border-white/20 hover:bg-black/40 hover:text-white"
              aria-label="Close score details"
              title="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>

        <ScoreSnapshotCard
          score={score}
          jacketUrl={jacketUrl}
          chartLink={chartLink}
        />
      </div>
    </div>
  );
}
