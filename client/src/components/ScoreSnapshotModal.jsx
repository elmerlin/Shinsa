import React, { useEffect, useMemo, useState } from 'react';
import { createMessageStoryItem, getPlayComments, addPlayComment, deletePlayComment } from '../utils/api';
import SendToDirectMessageButton from './SendToDirectMessageButton';
import ScoreSnapshotCard from './ScoreSnapshotCard';
import ItemCommentSection from './ItemCommentSection';
import YouTubeReplayModal from './YouTubeReplayModal';
import { buildReplayModalTitle } from '../utils/replayTitle';

function compactText(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatChartLine(songTitle, mode, level) {
  const parts = [compactText(songTitle, 80)];
  const modeLabel = String(mode || '').trim();
  const levelValue = Number(level) || 0;
  if (modeLabel) {
    parts.push(levelValue > 0 ? `${modeLabel} ${levelValue}` : modeLabel);
  } else if (levelValue > 0) {
    parts.push(`Level ${levelValue}`);
  }
  return parts.filter(Boolean).join(' • ');
}

function buildStorySnapshot(score, jacketUrl = '', linkShare = null) {
  const displayScore = Number(score?.new_score ?? score?.score) || 0;
  const oldScore = Number(score?.old_score) || 0;

  return {
    song_title: String(score?.song_title || score?.songTitle || '').trim(),
    mode: String(score?.mode || '').trim(),
    level: Number(score?.level) || 0,
    score: displayScore,
    new_score: displayScore,
    old_score: oldScore,
    grade: String(score?.new_grade || score?.grade || '').trim(),
    new_grade: String(score?.new_grade || score?.grade || '').trim(),
    old_grade: String(score?.old_grade || '').trim(),
    scoreDelta: Number(score?.scoreDelta ?? (displayScore > 0 && oldScore > 0 ? displayScore - oldScore : 0)) || 0,
    over_top100_rank: Number(score?.over_top100_rank ?? score?.overTop100Rank) || 0,
    plate: String(score?.plate || '').trim(),
    perfect: Number(score?.perfect) || 0,
    great: Number(score?.great) || 0,
    good: Number(score?.good) || 0,
    bad: Number(score?.bad) || 0,
    miss: Number(score?.miss) || 0,
    is_stage_break: !!score?.is_stage_break || !!score?.isStageBreak,
    played_at_utc: String(score?.played_at_utc || score?.playedAtUtc || '').trim(),
    date_played: String(score?.played_at_utc || score?.playedAtUtc || score?.date_played || score?.playedAt || '').trim(),
    playerName: String(linkShare?.playerName || score?.playerName || score?.username || '').trim(),
    playerAvatar: String(linkShare?.playerAvatar || score?.playerAvatar || score?.avatar || '').trim(),
    playerSkillTitle: String(linkShare?.playerSkillTitle || score?.playerSkillTitle || score?.skill_title || score?.skillTitle || '').trim(),
    playerRoleLabel: String(linkShare?.playerRoleLabel || score?.playerRoleLabel || score?.roleLabel || '').trim(),
    contextLabel: String(linkShare?.contextLabel || score?.contextLabel || score?.context_label || '').trim(),
    jacket_url: String(jacketUrl || linkShare?.jacketUrl || score?._jacketUrl || score?.jacket_url || score?.background_url || '').trim(),
  };
}

export function buildStoryDraft(score, jacketUrl = '', chartLink = '', linkShare = null) {
  const snapshot = buildStorySnapshot(score, jacketUrl, linkShare);
  const playerName = snapshot.playerName || 'Player';
  const chartLine = formatChartLine(snapshot.song_title, snapshot.mode, snapshot.level);
  const isUpscore = snapshot.old_score > 0;
  const title = String(linkShare?.title || `${playerName}'s ${isUpscore ? 'upscore' : 'score'}`).trim();
  const subtitle = String(linkShare?.subtitle || chartLine).trim();

  return {
    storyType: 'score_snapshot',
    title,
    subtitle,
    linkPath: String(linkShare?.path || chartLink || '').trim(),
    linkUrl: String(linkShare?.url || '').trim(),
    linkLabel: String(linkShare?.buttonLabel || (chartLink ? 'Open chart' : 'Open score')).trim(),
    snapshot,
  };
}

export function StoryShareModal({
  open = false,
  draft = null,
  caption = '',
  submitting = false,
  success = false,
  error = '',
  onCaptionChange,
  onClose,
  onSubmit,
}) {
  if (!open || !draft) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/84 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-[1.35rem] border border-piu-border/60 bg-piu-card/95 shadow-[0_24px_72px_rgba(0,0,0,0.44)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-piu-border/50 px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-display font-semibold text-gray-300">Story</p>
              <h3 className="mt-1 text-2xl font-display font-black text-white">Add this score</h3>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                Share the score to your story while keeping the original player identity on the card.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-piu-border/60 bg-piu-dark/70 text-gray-300 transition-colors hover:border-cyan-400/30 hover:text-white"
              aria-label="Close story share"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl border border-piu-border/60 bg-piu-dark/55 p-4">
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] text-gray-500">Score</p>
            <p className="mt-2 text-base font-display font-black text-white">{draft.title}</p>
            {draft.subtitle ? <p className="mt-1 text-sm text-gray-400">{draft.subtitle}</p> : null}
          </div>

          <div className="rounded-xl border border-piu-border/60 bg-piu-dark/55 p-4">
            <label className="block">
              <span className="text-sm font-display font-black text-white">Caption</span>
              <textarea
                value={caption}
                onChange={(event) => onCaptionChange?.(event.target.value)}
                maxLength={420}
                rows={4}
                placeholder="Add a caption"
                className="mt-3 w-full resize-none rounded-xl border border-piu-border/60 bg-piu-dark/80 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-cyan-400/30 focus:outline-none"
              />
            </label>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">The score card will show the original player details.</p>
              <span className="text-xs text-gray-500">{caption.trim().length}/420</span>
            </div>
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-200">Added to your story.</p> : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-piu-border/50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-piu-border/60 bg-piu-dark/70 px-4 py-2.5 text-sm font-display font-bold text-gray-300 transition-colors hover:border-piu-accent/35 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-4 py-2.5 text-sm font-display font-black text-cyan-100 transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Adding...' : 'Add story'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ScoreSnapshotModal({
  score,
  jacketUrl = '',
  chartLink = '',
  onClose,
  directMessageLinkShare = null,
  modalLabel = 'Run details',
  playId,
  focusCommentId,
}) {
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [commentSectionOpen, setCommentSectionOpen] = useState(!!focusCommentId);
  const [storyCaption, setStoryCaption] = useState('');
  const [storySubmitting, setStorySubmitting] = useState(false);
  const [storyError, setStoryError] = useState('');
  const [storySuccess, setStorySuccess] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);

  const storyDraft = useMemo(
    () => (score ? buildStoryDraft(score, jacketUrl, chartLink, directMessageLinkShare) : null),
    [chartLink, directMessageLinkShare, jacketUrl, score],
  );

  const scoreKey = score
    ? `${score.id || ''}_${score.song_title || score.songTitle || ''}_${score.mode || ''}_${score.level || ''}_${score.score ?? score.new_score ?? ''}`
    : '';

  useEffect(() => {
    if (!scoreKey) return;
    setStoryComposerOpen(false);
    setStoryCaption('');
    setStorySubmitting(false);
    setStoryError('');
    setStorySuccess(false);
    setReplayOpen(false);
  }, [scoreKey]);

  if (!score) return null;

  const replayUrl = String(
    directMessageLinkShare?.replayUrl
    || score?.replayUrl
    || score?.replay_url
    || score?.replayEmbedUrl
    || score?.replay_embed_url
    || ''
  ).trim();
  const replayTitle = buildReplayModalTitle(score);

  const openStoryComposer = () => {
    setStoryError('');
    setStorySuccess(false);
    setStoryComposerOpen(true);
  };

  const closeStoryComposer = () => {
    if (storySubmitting) return;
    setStoryComposerOpen(false);
    setStoryError('');
  };

  const handleAddStory = async () => {
    if (!storyDraft || storySubmitting) return;
    setStorySubmitting(true);
    setStoryError('');
    try {
      await createMessageStoryItem({
        ...storyDraft,
        caption: storyCaption.trim(),
      });
      setStorySuccess(true);
      setStoryComposerOpen(false);
    } catch (err) {
      setStoryError(err?.message || 'Failed to add story.');
    } finally {
      setStorySubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/82 p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="w-full max-w-[23.5rem]" onClick={(event) => event.stopPropagation()}>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] text-cyan-200/75">
              {modalLabel}
            </p>
            <div className="flex items-center gap-2">
              {storyDraft ? (
                <button
                  type="button"
                  onClick={openStoryComposer}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border bg-black/25 transition-colors ${
                    storySuccess
                      ? 'border-emerald-300/30 text-emerald-100 hover:bg-black/40'
                      : 'border-white/10 text-gray-100 hover:border-cyan-300/30 hover:bg-black/40 hover:text-white'
                  }`}
                  aria-label="Add to story"
                  title={storySuccess ? 'Added to story' : 'Add to story'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75c1.67 2.72 3.83 4.88 6.55 6.55-2.72 1.67-4.88 3.83-6.55 6.55-1.67-2.72-3.83-4.88-6.55-6.55 2.72-1.67 4.88-3.83 6.55-6.55Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 15.75v4.5m-2.25-2.25h4.5" />
                  </svg>
                </button>
              ) : null}
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
            replayUrl={replayUrl}
            replayTitle={replayTitle}
            onOpenReplay={replayUrl ? () => setReplayOpen(true) : null}
            commentCount={commentCount}
            onCommentClick={() => setCommentSectionOpen(v => !v)}
          />
          {playId && (
            <div className="mt-2">
              <ItemCommentSection
                itemId={playId}
                commentType="play"
                getCommentsFn={getPlayComments}
                addCommentFn={addPlayComment}
                deleteCommentFn={deletePlayComment}
                initialOpen={false}
                externalOpen={commentSectionOpen}
                onOpenChange={setCommentSectionOpen}
                ownerId={score?.user_id || ''}
                focusCommentId={focusCommentId}
                onCountChange={setCommentCount}
              />
            </div>
          )}
        </div>
      </div>

      <StoryShareModal
        open={storyComposerOpen}
        draft={storyDraft}
        caption={storyCaption}
        submitting={storySubmitting}
        success={storySuccess}
        error={storyError}
        onCaptionChange={setStoryCaption}
        onClose={closeStoryComposer}
        onSubmit={handleAddStory}
      />
      {replayOpen && replayUrl ? (
        <YouTubeReplayModal
          url={replayUrl}
          title={replayTitle}
          onClose={() => setReplayOpen(false)}
          commentThread={playId ? {
            itemId: playId,
            ownerId: score?.user_id || '',
          } : null}
        />
      ) : null}
    </>
  );
}
