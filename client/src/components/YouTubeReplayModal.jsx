import React from 'react';
import ItemCommentSection from './ItemCommentSection';
import { getPlayComments, addPlayComment, deletePlayComment } from '../utils/api';
import { buildYouTubeEmbedSrc } from '../utils/youtube';

export default function YouTubeReplayModal({ url, title = 'Replay clip', onClose, children, commentThread = null }) {
  const embedSrc = buildYouTubeEmbedSrc(url, { autoplay: true });
  if (!embedSrc) return null;
  const hasCommentThread = Number(commentThread?.itemId) > 0;
  const hasFooter = !!children || hasCommentThread;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className={`w-full max-w-3xl overflow-hidden rounded-2xl border border-piu-border bg-[#07111f] shadow-2xl${hasFooter ? ' max-h-[88vh] overflow-y-auto' : ''}`}
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
        {hasCommentThread ? (
          <div className="border-t border-piu-border/30 bg-[#081628] px-4 py-3">
            <ItemCommentSection
              itemId={commentThread.itemId}
              commentType="play"
              getCommentsFn={getPlayComments}
              addCommentFn={addPlayComment}
              deleteCommentFn={deletePlayComment}
              initialOpen={commentThread.initialOpen !== undefined ? !!commentThread.initialOpen : true}
              externalOpen={commentThread.externalOpen}
              onOpenChange={commentThread.onOpenChange}
              ownerId={commentThread.ownerId || ''}
              focusCommentId={commentThread.focusCommentId}
              onCountChange={commentThread.onCountChange}
            />
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
