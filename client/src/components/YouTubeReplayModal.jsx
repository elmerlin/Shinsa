import React from 'react';
import { buildYouTubeEmbedSrc } from '../utils/youtube';

export default function YouTubeReplayModal({ url, title = 'Replay clip', onClose }) {
  const embedSrc = buildYouTubeEmbedSrc(url, { autoplay: true });
  if (!embedSrc) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-piu-border bg-[#07111f] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-piu-border/40 px-4 py-3">
          <p className="pr-4 text-sm font-display font-bold text-white">{title}</p>
          <button
            type="button"
            className="text-sm font-display font-bold text-gray-400 transition-colors hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="relative w-full bg-black" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute inset-0 h-full w-full"
            src={embedSrc}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            frameBorder="0"
          />
        </div>
      </div>
    </div>
  );
}
