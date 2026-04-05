const SKILL_TITLE_REQUIREMENTS = [
  { id: 'beginner', name: 'Beginner', skill_title: 'Beginner lvl. 1', skill_family: 'Beginner', skill_level: 1, level: 0, required_points: 0, tier: 'beginner', index: 0 },

  { id: 'intermediate-1', name: 'Intermediate Lv.1', skill_title: 'Intermediate lvl. 1', skill_family: 'Intermediate', skill_level: 1, level: 10, required_points: 2000, tier: 'bronze', index: 1 },
  { id: 'intermediate-2', name: 'Intermediate Lv.2', skill_title: 'Intermediate lvl. 2', skill_family: 'Intermediate', skill_level: 2, level: 11, required_points: 2200, tier: 'bronze', index: 2 },
  { id: 'intermediate-3', name: 'Intermediate Lv.3', skill_title: 'Intermediate lvl. 3', skill_family: 'Intermediate', skill_level: 3, level: 12, required_points: 2600, tier: 'bronze', index: 3 },
  { id: 'intermediate-4', name: 'Intermediate Lv.4', skill_title: 'Intermediate lvl. 4', skill_family: 'Intermediate', skill_level: 4, level: 13, required_points: 3200, tier: 'bronze', index: 4 },
  { id: 'intermediate-5', name: 'Intermediate Lv.5', skill_title: 'Intermediate lvl. 5', skill_family: 'Intermediate', skill_level: 5, level: 14, required_points: 4000, tier: 'bronze', index: 5 },
  { id: 'intermediate-6', name: 'Intermediate Lv.6', skill_title: 'Intermediate lvl. 6', skill_family: 'Intermediate', skill_level: 6, level: 15, required_points: 5000, tier: 'bronze', index: 6 },
  { id: 'intermediate-7', name: 'Intermediate Lv.7', skill_title: 'Intermediate lvl. 7', skill_family: 'Intermediate', skill_level: 7, level: 16, required_points: 6200, tier: 'bronze', index: 7 },
  { id: 'intermediate-8', name: 'Intermediate Lv.8', skill_title: 'Intermediate lvl. 8', skill_family: 'Intermediate', skill_level: 8, level: 17, required_points: 7600, tier: 'bronze', index: 8 },
  { id: 'intermediate-9', name: 'Intermediate Lv.9', skill_title: 'Intermediate lvl. 9', skill_family: 'Intermediate', skill_level: 9, level: 18, required_points: 9200, tier: 'bronze', index: 9 },
  { id: 'intermediate-10', name: 'Intermediate Lv.10', skill_title: 'Intermediate lvl. 10', skill_family: 'Intermediate', skill_level: 10, level: 19, required_points: 11000, tier: 'bronze', index: 10 },

  { id: 'advanced-1', name: 'Advanced Lv.1', skill_title: 'Advanced lvl. 1', skill_family: 'Advanced', skill_level: 1, level: 20, required_points: 13000, tier: 'silver', index: 11 },
  { id: 'advanced-2', name: 'Advanced Lv.2', skill_title: 'Advanced lvl. 2', skill_family: 'Advanced', skill_level: 2, level: 20, required_points: 26000, tier: 'silver', index: 12 },
  { id: 'advanced-3', name: 'Advanced Lv.3', skill_title: 'Advanced lvl. 3', skill_family: 'Advanced', skill_level: 3, level: 20, required_points: 39000, tier: 'silver', index: 13 },
  { id: 'advanced-4', name: 'Advanced Lv.4', skill_title: 'Advanced lvl. 4', skill_family: 'Advanced', skill_level: 4, level: 21, required_points: 15000, tier: 'silver', index: 14 },
  { id: 'advanced-5', name: 'Advanced Lv.5', skill_title: 'Advanced lvl. 5', skill_family: 'Advanced', skill_level: 5, level: 21, required_points: 30000, tier: 'silver', index: 15 },
  { id: 'advanced-6', name: 'Advanced Lv.6', skill_title: 'Advanced lvl. 6', skill_family: 'Advanced', skill_level: 6, level: 21, required_points: 45000, tier: 'silver', index: 16 },
  { id: 'advanced-7', name: 'Advanced Lv.7', skill_title: 'Advanced lvl. 7', skill_family: 'Advanced', skill_level: 7, level: 22, required_points: 17500, tier: 'silver', index: 17 },
  { id: 'advanced-8', name: 'Advanced Lv.8', skill_title: 'Advanced lvl. 8', skill_family: 'Advanced', skill_level: 8, level: 22, required_points: 35000, tier: 'silver', index: 18 },
  { id: 'advanced-9', name: 'Advanced Lv.9', skill_title: 'Advanced lvl. 9', skill_family: 'Advanced', skill_level: 9, level: 22, required_points: 52500, tier: 'silver', index: 19 },
  { id: 'advanced-10', name: 'Advanced Lv.10', skill_title: 'Advanced lvl. 10', skill_family: 'Advanced', skill_level: 10, level: 22, required_points: 70000, tier: 'silver', index: 20 },

  { id: 'expert-1', name: 'Expert Lv.1', skill_title: 'Expert lvl. 1', skill_family: 'Expert', skill_level: 1, level: 23, required_points: 40000, tier: 'gold', index: 21 },
  { id: 'expert-2', name: 'Expert Lv.2', skill_title: 'Expert lvl. 2', skill_family: 'Expert', skill_level: 2, level: 23, required_points: 80000, tier: 'gold', index: 22 },
  { id: 'expert-3', name: 'Expert Lv.3', skill_title: 'Expert lvl. 3', skill_family: 'Expert', skill_level: 3, level: 24, required_points: 30000, tier: 'gold', index: 23 },
  { id: 'expert-4', name: 'Expert Lv.4', skill_title: 'Expert lvl. 4', skill_family: 'Expert', skill_level: 4, level: 24, required_points: 60000, tier: 'gold', index: 24 },
  { id: 'expert-5', name: 'Expert Lv.5', skill_title: 'Expert lvl. 5', skill_family: 'Expert', skill_level: 5, level: 25, required_points: 20000, tier: 'gold', index: 25 },
  { id: 'expert-6', name: 'Expert Lv.6', skill_title: 'Expert lvl. 6', skill_family: 'Expert', skill_level: 6, level: 25, required_points: 40000, tier: 'gold', index: 26 },
  { id: 'expert-7', name: 'Expert Lv.7', skill_title: 'Expert lvl. 7', skill_family: 'Expert', skill_level: 7, level: 26, required_points: 13000, tier: 'gold', index: 27 },
  { id: 'expert-8', name: 'Expert Lv.8', skill_title: 'Expert lvl. 8', skill_family: 'Expert', skill_level: 8, level: 26, required_points: 26000, tier: 'gold', index: 28 },
  { id: 'expert-9', name: 'Expert Lv.9', skill_title: 'Expert lvl. 9', skill_family: 'Expert', skill_level: 9, level: 27, required_points: 3500, tier: 'blue', index: 29 },
  { id: 'expert-10', name: 'Expert Lv.10', skill_title: 'Expert lvl. 10', skill_family: 'Expert', skill_level: 10, level: 27, required_points: 7000, tier: 'blue', index: 30 },

  { id: 'master', name: 'The Master', skill_title: 'The Master', skill_family: 'Master', skill_level: 1, level: 28, required_points: 1900, tier: 'blue', index: 31 },
];

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeComparable(value) {
  return normalizeString(value).toLowerCase().replace(/\s+/g, ' ');
}

function toInt(value) {
  return parseInt(value, 10) || 0;
}

function toNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function normalizeSkillTitleNode(node) {
  if (!node || typeof node !== 'object') return null;
  const name = normalizeString(node.name || node.title_name || node.skill_title);
  if (!name) return null;
  return {
    id: normalizeString(node.id),
    index: toInt(node.index),
    name,
    skill_title: normalizeString(node.skill_title || node.name),
    skill_family: normalizeString(node.skill_family || node.title_family),
    skill_level: toInt(node.skill_level || node.title_level),
    level: toInt(node.level),
    tier: normalizeString(node.tier || node.title_tier),
    required_points: toInt(node.required_points || node.title_required_points),
    earned_points: toInt(node.earned_points || node.title_earned_points),
    remaining_points: toInt(node.remaining_points || node.title_remaining_points),
    progress_percent: toNumber(node.progress_percent || node.title_progress_percent),
    unlocked: node.unlocked == null ? true : !!node.unlocked,
  };
}

function findRequirementMatch(clear = {}) {
  const explicitNode = normalizeSkillTitleNode(clear.title_current_node);
  if (explicitNode?.id) {
    const byId = SKILL_TITLE_REQUIREMENTS.find((title) => title.id === explicitNode.id);
    if (byId) return byId;
  }

  const nameCandidates = [
    clear.title_name,
    clear.song_title,
    explicitNode?.name,
    explicitNode?.skill_title,
  ].map(normalizeComparable).filter(Boolean);
  const family = normalizeComparable(clear.title_family || explicitNode?.skill_family);
  const skillLevel = toInt(clear.title_level || explicitNode?.skill_level);

  let match = null;
  if (family && skillLevel > 0) {
    match = SKILL_TITLE_REQUIREMENTS.find((title) => normalizeComparable(title.skill_family) === family && toInt(title.skill_level) === skillLevel);
  }
  if (!match && nameCandidates.length > 0) {
    match = SKILL_TITLE_REQUIREMENTS.find((title) => {
      const titleNames = [title.name, title.skill_title].map(normalizeComparable);
      return nameCandidates.some((candidate) => titleNames.includes(candidate));
    });
  }
  return match || null;
}

function mergeNode(baseNode, clear = {}, fallbackNode = null) {
  const fallback = normalizeSkillTitleNode(fallbackNode) || findRequirementMatch(clear);
  const merged = {
    ...(fallback || {}),
    ...(baseNode || {}),
  };
  const normalized = normalizeSkillTitleNode(merged);
  if (!normalized) return null;
  if (!normalized.required_points && fallback?.required_points) normalized.required_points = fallback.required_points;
  if (!normalized.level && fallback?.level) normalized.level = fallback.level;
  if (!normalized.skill_family && fallback?.skill_family) normalized.skill_family = fallback.skill_family;
  if (!normalized.skill_level && fallback?.skill_level) normalized.skill_level = fallback.skill_level;
  if (!normalized.tier && fallback?.tier) normalized.tier = fallback.tier;
  if (!normalized.id && fallback?.id) normalized.id = fallback.id;
  if (!normalized.index && fallback?.index) normalized.index = fallback.index;
  return normalized;
}

export function formatSkillTitleLabel(title) {
  const node = normalizeSkillTitleNode(title);
  if (!node) return 'Skill Title';
  const name = normalizeString(node.name);
  const family = normalizeString(node.skill_family);
  const level = toInt(node.skill_level);
  const pairFromName = name.match(/\b(Beginner|Intermediate|Advanced|Expert|Master)\s*(?:lv|lvl|level)?\.?\s*(\d+)\b/i);
  if (pairFromName) {
    return `${pairFromName[1][0].toUpperCase()}${pairFromName[1].slice(1).toLowerCase()} Lv.${parseInt(pairFromName[2], 10)}`;
  }
  if (/^master$/i.test(family) || /the\s+master/i.test(name)) {
    return level > 1 ? `Master Lv.${level}` : 'The Master';
  }
  if (family && level > 0) return `${family} Lv.${level}`;
  if (family) return family;
  return name || 'Skill Title';
}

export function buildSkillTitleProgressTriplet(clear = {}) {
  const fallback = findRequirementMatch(clear);
  const current = mergeNode(clear.title_current_node, clear, fallback) || mergeNode(fallback, clear, fallback);
  const currentIndex = current ? toInt(current.index) : -1;
  const previousFallback = currentIndex > 0 ? SKILL_TITLE_REQUIREMENTS[currentIndex - 1] : null;
  const nextFallback = currentIndex >= 0 ? SKILL_TITLE_REQUIREMENTS[currentIndex + 1] : null;
  const previous = mergeNode(clear.title_previous_node, clear, previousFallback);
  const next = mergeNode(clear.title_next_node, clear, nextFallback);

  if (current && !current.earned_points) {
    current.earned_points = toInt(clear.title_earned_points) || toInt(clear.title_required_points) || current.required_points;
  }
  if (current && !current.required_points) {
    current.required_points = toInt(clear.title_required_points) || current.required_points;
  }
  if (current && !current.level) {
    current.level = toInt(clear.level) || current.level;
  }

  return { previous, current, next };
}

export { SKILL_TITLE_REQUIREMENTS };
