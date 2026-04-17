import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBuildingLabel } from '../components/petWorld/petWorldBuildings';
import { buildRoom } from '../components/petWorld/PetWorldInterior';
import {
  INTERIOR_BUILDING_TYPES,
  INTERIOR_ITEM_RULES,
  INTERIOR_RELATIONSHIP_SCENES,
  INTERIOR_RULE_GLOSSARY,
  INTERIOR_UNWIRED_ASSETS,
  ROOM_ANCHOR_LABELS,
  ROOM_ANCHOR_ORDER,
  auditInteriorRooms,
  buildInteriorUsageMap,
  getAnchorLabel,
} from '../components/petWorld/petWorldInteriorCatalog';
import '../components/petWorld/petWorldCfUi.css';

const PREVIEW_SCALE = 2;
const LAB_SIZE = { width: 360, height: 250 };
const LAB_WALL_HEIGHT = 88;
const FLOOR_ANCHOR_POINTS = {
  back_left: { x: 74, y: 108 },
  back_center: { x: 180, y: 108 },
  back_right: { x: 286, y: 108 },
  left_edge: { x: 74, y: 156 },
  center: { x: 180, y: 156 },
  right_edge: { x: 286, y: 156 },
  front_left: { x: 100, y: 220 },
  front_center: { x: 180, y: 220 },
  front_right: { x: 260, y: 220 },
};
const WALL_ANCHOR_POINTS = {
  back_left: { x: 88, y: 64 },
  back_center: { x: 180, y: 64 },
  back_right: { x: 272, y: 64 },
};

const SCENE_SIZE = { width: 280, height: 160 };
const CATEGORY_ORDER = ['Wall', 'Sleep', 'Surface', 'Surface Accessory', 'Seating', 'Storage', 'Lighting', 'Nature', 'Workshop', 'Treasure'];

const IMAGE_CACHE = new Map();

function loadImage(src) {
  if (!src || typeof Image === 'undefined') return null;
  if (IMAGE_CACHE.has(src)) return IMAGE_CACHE.get(src);
  const image = new Image();
  const entry = { image, loaded: false };
  image.onload = () => {
    entry.loaded = true;
  };
  image.src = src;
  IMAGE_CACHE.set(src, entry);
  return entry;
}

function getSpriteSize(sprite) {
  if (!sprite) return { width: 0, height: 0 };
  if (sprite.anim) {
    return {
      width: sprite.anim.frameWidth,
      height: sprite.anim.frameHeight,
    };
  }
  return {
    width: sprite.rect[2],
    height: sprite.rect[3],
  };
}

function drawSprite(canvas, sprite, scale = PREVIEW_SCALE) {
  if (!canvas || !sprite) return;
  const entry = loadImage(sprite.sheet);
  const { width, height } = getSpriteSize(sprite);
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width * scale}px`;
  canvas.style.height = `${height * scale}px`;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!entry?.loaded) return;
  ctx.imageSmoothingEnabled = false;
  if (sprite.anim) {
    ctx.drawImage(
      entry.image,
      0,
      0,
      sprite.anim.frameWidth,
      sprite.anim.frameHeight,
      0,
      0,
      width * scale,
      height * scale,
    );
    return;
  }
  ctx.drawImage(
    entry.image,
    sprite.rect[0],
    sprite.rect[1],
    sprite.rect[2],
    sprite.rect[3],
    0,
    0,
    width * scale,
    height * scale,
  );
}

function SpriteThumb({ sprite, scale = PREVIEW_SCALE, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!sprite) return undefined;
    const entry = loadImage(sprite.sheet);
    const canvas = canvasRef.current;
    const refresh = () => {
      drawSprite(canvas, sprite, scale);
    };
    drawSprite(canvas, sprite, scale);
    if (entry?.loaded) return undefined;
    entry?.image?.addEventListener('load', refresh);
    return () => {
      entry?.image?.removeEventListener('load', refresh);
    };
  }, [sprite, scale]);

  const { width, height } = getSpriteSize(sprite);
  if (!sprite) {
    return (
      <div
        className={`rounded-md border border-dashed border-[#8b5e2b]/40 bg-[#f4d9aa]/20 ${className}`}
        style={{ width: 48, height: 48 }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={`image-render-pixelated ${className}`}
      width={width * scale}
      height={height * scale}
      style={{ width: width * scale, height: height * scale, imageRendering: 'pixelated' }}
    />
  );
}

function Chip({ children, accent = false, warn = false }) {
  const classes = warn ? 'cf-pill cf-pill-warn' : accent ? 'cf-pill cf-pill-accent' : 'cf-pill';
  return <span className={classes}>{children}</span>;
}

function anchorPoint(anchorId, placementKind) {
  const source = placementKind === 'wall' ? WALL_ANCHOR_POINTS : FLOOR_ANCHOR_POINTS;
  return source[anchorId] || FLOOR_ANCHOR_POINTS.center;
}

function AnchorLab({ rule }) {
  const validAnchors = rule.validAnchors || [];
  const validSet = useMemo(() => new Set(validAnchors), [validAnchors]);
  const [activeAnchor, setActiveAnchor] = useState(validAnchors[0] || 'center');
  const [invalidAnchor, setInvalidAnchor] = useState(null);

  useEffect(() => {
    setActiveAnchor(validAnchors[0] || 'center');
    setInvalidAnchor(null);
  }, [rule.id, validAnchors]);

  const previewPoint = anchorPoint(activeAnchor, rule.placementKind);
  const previewSize = getSpriteSize(rule.sprite);
  const previewScale = 2.2;
  const previewWidth = previewSize.width * previewScale;
  const previewHeight = previewSize.height * previewScale;

  const hasAnchors = validAnchors.length > 0 && rule.placementKind !== 'relationship' && rule.placementKind !== 'surface';

  return (
    <div className="cf-inset p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#7b4d1f]">Example Room</p>
          <p className="text-xs text-[#5e3818]">
            Click a valid anchor to move the selected item. Invalid anchors explain why the placement fails.
          </p>
        </div>
        <Chip accent>{rule.placementKind === 'wall' ? 'Wall Item' : rule.placementKind === 'surface' ? 'Support Only' : rule.placementKind === 'relationship' ? 'Relationship' : 'Floor Item'}</Chip>
      </div>

      <div
        className="relative overflow-hidden rounded-[18px] border-[3px] border-[#6d451e] shadow-[inset_0_1px_0_rgba(255,240,210,0.45),0_14px_28px_rgba(50,20,0,0.18)]"
        style={{
          width: LAB_SIZE.width,
          height: LAB_SIZE.height,
          maxWidth: '100%',
          background: 'linear-gradient(180deg, #6c7a95 0%, #7584a0 100%)',
        }}
      >
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: LAB_WALL_HEIGHT,
            backgroundImage:
              'radial-gradient(circle at 10px 10px, rgba(255,255,255,0.12) 0 8px, transparent 8px), radial-gradient(circle at 26px 18px, rgba(0,0,0,0.08) 0 10px, transparent 10px), linear-gradient(180deg, #6f7f9b 0%, #67748d 100%)',
            backgroundSize: '40px 34px, 46px 34px, 100% 100%',
            borderBottom: '4px solid rgba(56,34,16,0.4)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            top: LAB_WALL_HEIGHT,
            background:
              'linear-gradient(180deg, rgba(90,56,30,0.25) 0%, rgba(90,56,30,0.02) 14%), repeating-linear-gradient(90deg, #8e5c42 0 14px, #87553c 14px 28px), repeating-linear-gradient(180deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 32px)',
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-[16px] bg-[#7d5a31]" />

        {ROOM_ANCHOR_ORDER.map((anchorId) => {
          const point = anchorPoint(anchorId, rule.placementKind);
          const isValid = validSet.has(anchorId);
          const show = rule.placementKind === 'wall' ? Boolean(WALL_ANCHOR_POINTS[anchorId]) : true;
          if (!show) return null;
          return (
            <button
              key={anchorId}
              type="button"
              onClick={() => {
                if (isValid) {
                  setActiveAnchor(anchorId);
                  setInvalidAnchor(null);
                } else {
                  setInvalidAnchor(anchorId);
                }
              }}
              className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-transform hover:scale-105"
              style={{
                left: point.x,
                top: point.y,
                borderColor: isValid ? '#2f7b35' : '#8b5e2b',
                background: isValid ? 'rgba(94,184,94,0.92)' : 'rgba(248,226,191,0.92)',
                boxShadow: isValid ? '0 0 0 3px rgba(94,184,94,0.18)' : '0 0 0 3px rgba(139,94,43,0.08)',
              }}
              title={ROOM_ANCHOR_LABELS[anchorId]}
            >
              <span className="text-[10px] font-black text-[#2c1909]">{ROOM_ANCHOR_LABELS[anchorId][0]}</span>
            </button>
          );
        })}

        {hasAnchors ? (
          <div
            className="absolute"
            style={{
              left: previewPoint.x - previewWidth / 2,
              top: previewPoint.y - previewHeight,
            }}
          >
            <SpriteThumb sprite={rule.sprite} scale={previewScale} />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-semibold text-[#533018]">
            {rule.placementKind === 'relationship'
              ? 'This piece only makes sense in relation to another object. Use the relationship example below.'
              : 'This is a support-only piece. It should be placed on another surface instead of directly into the room.'}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {validAnchors.map((anchorId) => (
          <Chip key={anchorId} accent={activeAnchor === anchorId}>
            {getAnchorLabel(anchorId)}
          </Chip>
        ))}
        {!validAnchors.length && <Chip warn>Uses relationship/support rules instead of room anchors</Chip>}
      </div>

      {invalidAnchor ? (
        <p className="mt-3 text-sm text-[#7a2d18]">
          <strong>{getAnchorLabel(invalidAnchor)} is invalid:</strong> {rule.invalidHint}
        </p>
      ) : null}
    </div>
  );
}

function RelationshipSceneCard({ scene, selectedRuleId }) {
  return (
    <div className="cf-inset p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[#3a2010]">{scene.label}</p>
          <p className="text-xs text-[#5e3818]">{scene.description}</p>
        </div>
        <Chip>{scene.placements.length} pieces</Chip>
      </div>

      <div
        className="relative overflow-hidden rounded-xl border-2 border-[#8b5e2b]/40"
        style={{
          width: SCENE_SIZE.width,
          height: SCENE_SIZE.height,
          maxWidth: '100%',
          background:
            'linear-gradient(180deg, #6f7f9b 0 44%, transparent 44%), linear-gradient(180deg, transparent 0 44%, #8e5c42 44% 100%)',
        }}
      >
        <div className="absolute inset-x-0 top-[44%] h-[3px] bg-[rgba(56,34,16,0.35)]" />
        {scene.placements.map((placement) => {
          const sceneRule = INTERIOR_ITEM_RULES.find((rule) => rule.id === placement.ruleId);
          if (!sceneRule) return null;
          return (
            <div
              key={`${scene.id}-${placement.ruleId}-${placement.x}-${placement.y}`}
              className="absolute rounded-lg p-1"
              style={{
                left: placement.x,
                top: placement.y,
                background: placement.ruleId === selectedRuleId ? 'rgba(94,184,94,0.18)' : 'transparent',
                outline: placement.ruleId === selectedRuleId ? '2px solid rgba(47,123,53,0.55)' : 'none',
              }}
            >
              <SpriteThumb sprite={sceneRule.sprite} scale={1.8} />
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs font-semibold text-[#7a2d18]">{scene.warning}</p>
    </div>
  );
}

function RuleSummaryCard({ rule, usage, issues }) {
  const relatedScenes = useMemo(
    () => INTERIOR_RELATIONSHIP_SCENES.filter((scene) => rule.scenes?.includes(scene.id)),
    [rule],
  );

  return (
    <div className="cf-panel p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-xl border-2 border-[#8b5e2b]/25 bg-[rgba(255,244,220,0.55)] p-3">
            <SpriteThumb sprite={rule.sprite} scale={2.6} />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-black text-[#3a2010]">{rule.label}</h2>
              <Chip accent={rule.status === 'wired'} warn={rule.status !== 'wired'}>
                {rule.status === 'wired' ? 'Wired now' : 'Available art'}
              </Chip>
              <Chip>{rule.category}</Chip>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-[#5a3417]">{rule.notes}</p>
            <div className="flex flex-wrap gap-2">
              {usage.map((buildingType) => (
                <Chip key={buildingType}>{getBuildingLabel({ type: buildingType })}</Chip>
              ))}
              {!usage.length && <Chip warn>Not used by the current generator</Chip>}
            </div>
          </div>
        </div>

        <div className="min-w-[220px] rounded-2xl border-2 border-[#8b5e2b]/25 bg-[rgba(255,244,220,0.52)] p-4 text-sm text-[#4f2c12]">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7b4d1f]">Generator Audit</p>
          <p className="mt-2 text-3xl font-black text-[#3a2010]">{issues.length}</p>
          <p className="text-sm">
            {issues.length === 1 ? 'Current rule violation found.' : 'Current rule violations found.'}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,380px),minmax(0,1fr)]">
        <AnchorLab rule={rule} />

        <div className="space-y-4">
          <div className="cf-inset p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#7b4d1f]">Hard Rules</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {rule.hardRules.map((entry) => (
                <Chip key={entry} warn>{entry}</Chip>
              ))}
            </div>
            {rule.softRules?.length ? (
              <>
                <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#7b4d1f]">Soft Guidance</p>
                <ul className="mt-2 space-y-2 text-sm text-[#5c3818]">
                  {rule.softRules.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {rule.avoid?.length ? (
              <>
                <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#7b4d1f]">Avoid</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {rule.avoid.map((entry) => (
                    <Chip key={entry}>{entry}</Chip>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          {relatedScenes.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {relatedScenes.map((scene) => (
                <RelationshipSceneCard key={scene.id} scene={scene} selectedRuleId={rule.id} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AuditPanel({ issues, onSelectRule }) {
  return (
    <div className="cf-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7b4d1f]">Current Generator Assertions</p>
          <h3 className="text-xl font-black text-[#3a2010]">What the existing interiors are breaking right now</h3>
        </div>
        <Chip warn>{issues.length} active issues</Chip>
      </div>

      <div className="mt-4 grid gap-3">
        {issues.map((issue) => (
          <button
            key={`${issue.ruleId}-${issue.buildingType}-${issue.level}-${issue.message}`}
            type="button"
            onClick={() => onSelectRule(issue.ruleId)}
            className="cf-inset-light flex flex-col gap-1 rounded-xl px-4 py-3 text-left transition hover:bg-[rgba(255,236,208,0.75)]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-[#3a2010]">{getBuildingLabel({ type: issue.buildingType })}</span>
              <Chip>Level {issue.level}</Chip>
              <Chip warn>{INTERIOR_ITEM_RULES.find((rule) => rule.id === issue.ruleId)?.label || issue.itemName}</Chip>
            </div>
            <p className="text-sm text-[#5a3417]">{issue.message}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function RulesTable({ rules, usageMap, issueMap, selectedRuleId, onSelectRule }) {
  return (
    <div className="cf-panel overflow-hidden">
      <div className="border-b-2 border-[#8b5e2b]/15 px-5 py-4 sm:px-6">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7b4d1f]">Full Table</p>
        <h3 className="text-xl font-black text-[#3a2010]">Every interior item and where it belongs</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-[#4b2910]">
          <thead className="bg-[rgba(139,94,43,0.08)] text-[11px] uppercase tracking-[0.16em] text-[#7b4d1f]">
            <tr>
              <th className="px-4 py-3 font-black">Item</th>
              <th className="px-4 py-3 font-black">Placement</th>
              <th className="px-4 py-3 font-black">Relationships</th>
              <th className="px-4 py-3 font-black">Used In</th>
              <th className="px-4 py-3 font-black">Audit</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => {
              const usage = Array.from(usageMap.get(rule.id) || []);
              const issues = issueMap.get(rule.id) || [];
              const isSelected = selectedRuleId === rule.id;
              return (
                <tr
                  key={rule.id}
                  className={`${isSelected ? 'bg-[rgba(94,184,94,0.1)]' : 'bg-transparent'} border-b border-[#8b5e2b]/10 transition hover:bg-[rgba(139,94,43,0.06)]`}
                >
                  <td className="px-4 py-3 align-top">
                    <button type="button" onClick={() => onSelectRule(rule.id)} className="flex items-start gap-3 text-left">
                      <div className="rounded-lg border border-[#8b5e2b]/20 bg-[rgba(255,244,220,0.5)] p-2">
                        <SpriteThumb sprite={rule.sprite} scale={1.8} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-[#3a2010]">{rule.label}</span>
                          <Chip accent={rule.status === 'wired'} warn={rule.status !== 'wired'}>
                            {rule.status === 'wired' ? 'Wired' : 'Available'}
                          </Chip>
                        </div>
                        <p className="mt-1 text-xs text-[#6c4620]">{rule.family}</p>
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      {(rule.validAnchors || []).map((anchorId) => (
                        <Chip key={anchorId}>{getAnchorLabel(anchorId)}</Chip>
                      ))}
                      {!rule.validAnchors?.length && <Chip warn>Support / relation driven</Chip>}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#5b3618]">{rule.hardRules.join(' ')}</p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      {(rule.scenes || []).map((sceneId) => {
                        const scene = INTERIOR_RELATIONSHIP_SCENES.find((candidate) => candidate.id === sceneId);
                        return <Chip key={sceneId}>{scene?.label || sceneId}</Chip>;
                      })}
                      {!rule.scenes?.length && <Chip>Standalone</Chip>}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      {usage.length ? usage.map((buildingType) => (
                        <Chip key={buildingType}>{getBuildingLabel({ type: buildingType })}</Chip>
                      )) : <Chip warn>Not placed yet</Chip>}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {issues.length ? (
                      <div className="space-y-2">
                        <Chip warn>{issues.length} issue{issues.length === 1 ? '' : 's'}</Chip>
                        <p className="text-xs leading-5 text-[#7a2d18]">{issues[0].message}</p>
                      </div>
                    ) : (
                      <Chip accent>Clean</Chip>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PetWorldInteriorRulesPage() {
  const usageMap = useMemo(() => buildInteriorUsageMap(buildRoom, INTERIOR_BUILDING_TYPES), []);
  const issues = useMemo(() => auditInteriorRooms(buildRoom, INTERIOR_BUILDING_TYPES), []);
  const issueMap = useMemo(() => {
    const map = new Map();
    issues.forEach((issue) => {
      if (!map.has(issue.ruleId)) map.set(issue.ruleId, []);
      map.get(issue.ruleId).push(issue);
    });
    return map;
  }, [issues]);

  const initialRule = issues[0]?.ruleId || INTERIOR_ITEM_RULES[0]?.id;
  const [selectedRuleId, setSelectedRuleId] = useState(initialRule);

  useEffect(() => {
    if (!selectedRuleId && initialRule) setSelectedRuleId(initialRule);
  }, [initialRule, selectedRuleId]);

  const selectedRule = useMemo(
    () => INTERIOR_ITEM_RULES.find((rule) => rule.id === selectedRuleId) || INTERIOR_ITEM_RULES[0],
    [selectedRuleId],
  );

  const categoryBuckets = useMemo(() => {
    const buckets = new Map();
    CATEGORY_ORDER.forEach((category) => buckets.set(category, []));
    INTERIOR_ITEM_RULES.forEach((rule) => {
      if (!buckets.has(rule.category)) buckets.set(rule.category, []);
      buckets.get(rule.category).push(rule);
    });
    return buckets;
  }, []);

  const selectedUsage = Array.from(usageMap.get(selectedRule.id) || []);
  const selectedIssues = issueMap.get(selectedRule.id) || [];

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#13200f_0%,#1a2b15_42%,#213619_100%)] pb-16 text-[#3a2010]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="cf-panel relative overflow-hidden p-5 sm:p-6">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(255,240,200,0.34)_0%,rgba(255,240,200,0)_72%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7b4d1f]">Pet World Interior Rulebook</p>
              <h1 className="mt-1 text-3xl font-black leading-tight text-[#3a2010] sm:text-4xl">
                A visual placement guide for every wired interior object
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5a3417] sm:text-base">
                This page turns the interior art into explicit placement rules. Each item now has a visual room lab, a list of hard constraints, relationship examples where needed, and an audit of where the current room generator is still breaking those rules.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/pet/world" className="cf-btn cf-btn-green px-4 py-2 text-sm">Back To Pet World</Link>
              <a href="#full-table" className="cf-btn cf-btn-ghost px-4 py-2 text-sm">Jump To Table</a>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {INTERIOR_RULE_GLOSSARY.map((entry) => (
              <Chip key={entry.id}>{entry.label}</Chip>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[300px,minmax(0,1fr)]">
          <aside className="cf-panel p-4 sm:p-5">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7b4d1f]">Rule Index</p>
            <p className="mt-1 text-sm text-[#5a3417]">Pick any item to inspect its valid anchors, support rules, and relationship scenes.</p>

            <div className="mt-4 space-y-4">
              {Array.from(categoryBuckets.entries()).map(([category, rules]) => {
                if (!rules.length) return null;
                return (
                  <div key={category}>
                    <p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#7b4d1f]">{category}</p>
                    <div className="space-y-2">
                      {rules.map((rule) => {
                        const isSelected = rule.id === selectedRule.id;
                        const ruleIssues = issueMap.get(rule.id) || [];
                        return (
                          <button
                            key={rule.id}
                            type="button"
                            onClick={() => setSelectedRuleId(rule.id)}
                            className={`w-full rounded-xl border-2 px-3 py-2 text-left transition ${
                              isSelected
                                ? 'border-[#2f7b35] bg-[rgba(94,184,94,0.18)]'
                                : 'border-[#8b5e2b]/20 bg-[rgba(255,244,220,0.42)] hover:bg-[rgba(255,244,220,0.7)]'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <SpriteThumb sprite={rule.sprite} scale={1.5} />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="truncate text-sm font-black text-[#3a2010]">{rule.label}</span>
                                  {ruleIssues.length ? <Chip warn>{ruleIssues.length}</Chip> : null}
                                </div>
                                <p className="mt-1 text-xs text-[#6b4520]">{rule.family}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="space-y-6">
            <RuleSummaryCard rule={selectedRule} usage={selectedUsage} issues={selectedIssues} />
            <AuditPanel issues={issues} onSelectRule={setSelectedRuleId} />

            <div className="cf-panel p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7b4d1f]">Available But Unwired</p>
                  <h3 className="text-xl font-black text-[#3a2010]">Interior art that exists but is not yet part of the room generator</h3>
                </div>
                <Chip>{INTERIOR_UNWIRED_ASSETS.length} notes</Chip>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {INTERIOR_UNWIRED_ASSETS.map((asset) => (
                  <div key={asset.id} className="cf-inset flex gap-3 p-4">
                    <div className="rounded-lg border border-[#8b5e2b]/15 bg-[rgba(255,244,220,0.45)] p-2">
                      <SpriteThumb sprite={asset.sprite} scale={1.8} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-[#3a2010]">{asset.label}</p>
                      <p className="mt-1 text-sm text-[#5e3818]">{asset.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div id="full-table">
              <RulesTable
                rules={INTERIOR_ITEM_RULES}
                usageMap={usageMap}
                issueMap={issueMap}
                selectedRuleId={selectedRule.id}
                onSelectRule={setSelectedRuleId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
