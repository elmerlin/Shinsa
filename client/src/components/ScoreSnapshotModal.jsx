import React, { useEffect, useMemo, useState } from 'react';
import { createMessageStoryItem, getPlayComments, addPlayComment, deletePlayComment } from '../utils/api';
import SendToDirectMessageButton from './SendToDirectMessageButton';
import ScoreSnapshotCard from './ScoreSnapshotCard';
import ItemCommentSection from './ItemCommentSection';
import YouTubeReplayModal from './YouTubeReplayModal';
import { buildReplayModalTitle } from '../utils/replayTitle';
import {
  buildScoreSnapshotShareData,
  buildScoreSnapshotShareFileName,
  renderScoreSnapshotShareBlob,
} from '../utils/scoreSnapshotShare';

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

function resolveScoreSharePath({
  playId,
  score = null,
  chartLink = '',
  linkShare = null,
}) {
  const explicitPlayId = String(playId || '').trim();
  if (explicitPlayId) return `/play/${encodeURIComponent(explicitPlayId)}`;

  const scorePlayId = String(score?.play_id || score?.playId || '').trim();
  if (scorePlayId) return `/play/${encodeURIComponent(scorePlayId)}`;

  const linkSharePath = String(linkShare?.path || '').trim();
  if (linkSharePath.startsWith('/play/')) return linkSharePath;

  const directChartLink = String(chartLink || '').trim();
  if (directChartLink.startsWith('/play/')) return directChartLink;

  return linkSharePath || directChartLink || '';
}

async function sharePath(path, { title = '', text = '' } = {}) {
  const trimmedPath = String(path || '').trim();
  if (!trimmedPath || typeof window === 'undefined') return false;

  const url = trimmedPath.startsWith('http')
    ? trimmedPath
    : `${window.location.origin}${trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: String(title || '').trim() || undefined,
        text: String(text || '').trim() || undefined,
        url,
      });
      return true;
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return false;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    return true;
  }
}

export function ScoreCardShareButton({
  path = '',
  title = '',
  text = '',
  className = '',
  showLabel = false,
}) {
  const [copied, setCopied] = useState(false);
  const shareSupported = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (!copied || typeof window === 'undefined') return undefined;
    const timeoutId = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  if (!String(path || '').trim()) return null;

  const handleShare = async () => {
    const shared = await sharePath(path, { title, text });
    if (shared) setCopied(true);
  };

  const label = copied ? 'Link copied' : (shareSupported ? 'Share link' : 'Copy link');

  return (
    <button
      type="button"
      onClick={handleShare}
      className={className}
      aria-label={label}
      title={label}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 3.182-3.182L7.5 4.826a2.25 2.25 0 0 0-3.182 3.182l.53.53" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 19.174a2.25 2.25 0 0 0 3.182-3.182l-2.898-2.899a2.25 2.25 0 1 0-3.182 3.182l.53.53" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15.75 15.75 8.25" />
        </svg>
      )}
      {showLabel ? <span className="text-sm font-display font-bold">{label}</span> : null}
    </button>
  );
}

export function ScoreCardImageShareButton({
  score = null,
  jacketUrl = '',
  linkShare = null,
  title = '',
  text = '',
  className = '',
  showLabel = false,
}) {
  const [status, setStatus] = useState('');
  const [sharing, setSharing] = useState(false);
  const shareSupported = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (!status || typeof window === 'undefined') return undefined;
    const timeoutId = window.setTimeout(() => setStatus(''), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  if (!score) return null;

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const snapshot = buildScoreSnapshotShareData(score, jacketUrl, linkShare);
      const blob = await renderScoreSnapshotShareBlob(snapshot);
      const fileName = buildScoreSnapshotShareFileName(snapshot);
      const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
      const canShareFiles = shareSupported
        && typeof navigator.canShare === 'function'
        && navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({
          files: [file],
          title: String(title || '').trim() || undefined,
          text: String(text || '').trim() || undefined,
        });
        setStatus('shared');
        return;
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 1000);
      setStatus('downloaded');
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
      setStatus('error');
    } finally {
      setSharing(false);
    }
  };

  const label = sharing
    ? 'Preparing image'
    : status === 'shared'
      ? 'Image shared'
      : status === 'downloaded'
        ? 'Image downloaded'
        : status === 'error'
          ? 'Try again'
          : (shareSupported ? 'Share image' : 'Download image');

  return (
    <button
      type="button"
      onClick={handleShare}
      className={className}
      aria-label={label}
      title={label}
      disabled={sharing}
    >
      {sharing ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} className="h-5 w-5 animate-spin">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364 6.364-2.121-2.121M8.757 8.757 6.636 6.636m11.728 0-2.121 2.121M8.757 15.243l-2.121 2.121" />
        </svg>
      ) : status === 'shared' || status === 'downloaded' ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v1.125A2.625 2.625 0 0 0 5.625 20.25h12.75A2.625 2.625 0 0 0 21 17.625V16.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 10.5 12 15m0 0 4.5-4.5M12 15V3.75" />
        </svg>
      )}
      {showLabel ? <span className="text-sm font-display font-bold">{label}</span> : null}
    </button>
  );
}

export function buildStoryDraft(score, jacketUrl = '', chartLink = '', linkShare = null, playId = '') {
  const snapshot = buildScoreSnapshotShareData(score, jacketUrl, linkShare);
  const playerName = snapshot.playerName || 'Player';
  const chartLine = formatChartLine(snapshot.song_title, snapshot.mode, snapshot.level);
  const isUpscore = snapshot.old_score > 0;
  const title = String(linkShare?.title || `${playerName}'s ${isUpscore ? 'upscore' : 'score'}`).trim();
  const subtitle = String(linkShare?.subtitle || chartLine).trim();
  const linkPath = resolveScoreSharePath({
    playId,
    score,
    chartLink,
    linkShare,
  });
  const opensPlay = linkPath.startsWith('/play/');

  return {
    storyType: 'score_snapshot',
    title,
    subtitle,
    linkPath,
    linkUrl: String(linkShare?.url || '').trim(),
    linkLabel: String(linkShare?.buttonLabel || (opensPlay ? 'Open score' : (linkPath ? 'Open chart' : 'Open score'))).trim(),
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
  missingJudgmentHint = '',
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
    () => (score ? buildStoryDraft(score, jacketUrl, chartLink, directMessageLinkShare, playId) : null),
    [chartLink, directMessageLinkShare, jacketUrl, playId, score],
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
  const sharePathValue = resolveScoreSharePath({
    playId,
    score,
    chartLink,
    linkShare: directMessageLinkShare,
  });
  const shareTitle = storyDraft?.title || 'Shinsa score';
  const shareText = storyDraft?.subtitle || formatChartLine(score?.song_title || score?.songTitle, score?.mode, score?.level);

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
              <ScoreCardImageShareButton
                score={score}
                jacketUrl={jacketUrl}
                linkShare={directMessageLinkShare}
                title={shareTitle}
                text={shareText}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-gray-100 transition-colors hover:border-cyan-300/30 hover:bg-black/40 hover:text-white disabled:cursor-wait disabled:opacity-70"
              />
              <ScoreCardShareButton
                path={sharePathValue}
                title={shareTitle}
                text={shareText}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-gray-100 transition-colors hover:border-cyan-300/30 hover:bg-black/40 hover:text-white"
              />
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
            missingJudgmentHint={missingJudgmentHint}
          />
          <div className="mt-2 flex flex-wrap gap-2 px-1">
            <ScoreCardImageShareButton
              score={score}
              jacketUrl={jacketUrl}
              linkShare={directMessageLinkShare}
              title={shareTitle}
              text={shareText}
              showLabel
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-cyan-100 transition-colors hover:border-cyan-300/40 hover:bg-cyan-500/16 hover:text-white disabled:cursor-wait disabled:opacity-70"
            />
            <ScoreCardShareButton
              path={sharePathValue}
              title={shareTitle}
              text={shareText}
              showLabel
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-gray-100 transition-colors hover:border-cyan-300/30 hover:bg-black/40 hover:text-white"
            />
          </div>
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
