import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import ItemCommentSection from './ItemCommentSection';
import { getPlayComments, addPlayComment, deletePlayComment } from '../utils/api';
import { buildYouTubeEmbedSrc } from '../utils/youtube';

export default function YouTubeReplayModal({ url, title = 'Replay clip', onClose, children, commentThread = null }) {
  const embedSrc = buildYouTubeEmbedSrc(url, { autoplay: true });
  if (!embedSrc) return null;
  const hasCommentThread = Number(commentThread?.itemId) > 0;
  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, []);

  const modal = (
    <div className="fixed inset-0 z-[220] overflow-y-auto bg-black/84 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="flex min-h-full items-start justify-center py-4 sm:items-center sm:py-6">
        <div
          className="my-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-piu-border bg-[#07111f] shadow-2xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-piu-border/40 px-4 py-3">
            <p className="pr-4 text-sm font-display font-bold text-white">{title}</p>
            <button
              type="button"
              className="shrink-0 text-sm font-display font-bold text-gray-400 transition-colors hover:text-white"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <div className="overflow-y-auto">
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
      </div>
    </div>
  );

  return portalTarget ? createPortal(modal, portalTarget) : modal;
}
