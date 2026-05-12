/**
 * Plain-English explainers for every metric on the Training screen, lifted
 * verbatim from the web's TrainingPage so the mobile copy stays in sync.
 *
 * Each entry is a self-contained "help sheet" with a title, optional subtitle,
 * and a stack of sections (label + body). The training screen renders these
 * via a generic <HelpSheet> bottom sheet keyed off the registry.
 */

export interface HelpSection {
  label: string;
  body: string;
}

export interface HelpContent {
  title: string;
  subtitle?: string;
  sections: HelpSection[];
}

export type HelpKey =
  | 'zone'
  | 'training_ratio'
  | 'base_skill'
  | 'current_form'
  | 'play_days'
  | 'avg_play_load'
  | 'chronic_clears'
  | 'sparkline'
  | 'likely_pass'
  | 'grade_predictions'
  | 'percentile'
  | 'milestone'
  | 'ceiling';

export const TRAINING_HELP: Record<HelpKey, HelpContent> = {
  zone: {
    title: 'Training Zones',
    subtitle: 'How the system labels your current training state.',
    sections: [
      { label: 'Overclocked (150%+)', body: 'Your recent week is far above your long-term baseline. Usually means you are playing a lot more, pushing harder levels, or stacking long sessions with strong clears. Great for short-term peaks, but it can be hard to sustain and may come with fatigue.' },
      { label: 'In The Zone (100% to 149%)', body: 'Your recent week is matching or outperforming your baseline. Usually means you are clearing solid volume at your normal hard levels, or mixing consistency with some pushes. The healthiest zone for building form and keeping progress moving.' },
      { label: 'Cruising (80% to 99%)', body: 'Your recent week is a bit lighter than baseline, but still close enough to maintain. You are still playing regularly and getting clears, but not quite matching the load or difficulty of your better weeks. More likely maintaining current skill than actively pushing your ceiling.' },
      { label: 'Warming Up (50% to 79%)', body: 'Your recent week is clearly below baseline. Usually means shorter sessions, fewer active days, easier clears, or a comeback after time off. Good for rebuilding rhythm, but usually not enough yet to hold top form.' },
      { label: 'Cooling Down (1% to 49%)', body: 'Your recent week is much lighter than baseline. Very little recent play, very easy sessions, or scattered activity with not many strong clears. Your sharpness may slip here unless you start rebuilding recent load.' },
      { label: 'Calibrating (1 to 6 play days)', body: 'The system does not trust the ratio yet because there is not enough recent history. Usually means you just started syncing, changed mode, or do not have enough separate days logged yet.' },
      { label: 'Idle', body: 'Not enough current activity to classify your training state. Usually means no recent synced play or a fully decayed training profile. Once you start logging sessions again, the system will begin rebuilding your profile.' },
    ],
  },

  training_ratio: {
    title: 'Training Ratio',
    subtitle: 'How your recent week compares with your longer baseline.',
    sections: [
      { label: 'Calculation', body: 'Training Ratio is Current Form divided by Base Skill, multiplied by 100. Around 100% means your recent week matches your baseline. Above that means you are running hot; below that means your recent week has been lighter.' },
      { label: 'Why it matters', body: 'This metric is great for spotting whether you are building, maintaining, or cooling off. It reacts faster than Base Skill alone, but smooths out individual session noise.' },
      { label: 'How to push it up', body: 'Stronger recent sessions, harder clears, or more days played this week will lift Current Form relative to Base Skill. The ratio responds within days, not weeks.' },
    ],
  },

  base_skill: {
    title: 'Base Skill',
    subtitle: 'Your long-term training baseline.',
    sections: [
      { label: 'In plain English', body: 'Every song adds some training-load points. Harder levels and better results add more, while failed songs still add a little. We total those points for each day, then Base Skill smooths the last 28 days with an EWMA — a rolling average that gives more weight to recent days.' },
      { label: 'Why it moves slowly', body: 'Base Skill rewards sustained work over multiple weeks. One big day will not instantly spike it. If Base Skill is falling, it usually means your recent weeks are lighter than your longer-term baseline.' },
      { label: 'How to grow it', body: 'Play and clear more songs across more days, and keep the clears at meaningful levels for 2 to 4 weeks. Higher sustained levels and better grades raise it faster than one-off spikes.' },
    ],
  },

  current_form: {
    title: 'Current Form',
    subtitle: 'Your recent sharpness and momentum.',
    sections: [
      { label: 'In plain English', body: 'Current Form uses the same daily training-load points as Base Skill, but only smooths about the last 7 days. It still uses an EWMA, so recent sessions count more, but it reacts much faster to what you did this week.' },
      { label: 'Why it matters', body: 'This is the quickest metric to react when you go on a hot streak or take a few days off. It tells you whether your recent week is sharper, flatter, or stronger than normal.' },
      { label: 'How to push it up', body: 'Stack a few strong sessions this week. Recent sessions matter a lot here, so harder clears and more volume over the next several days will move it faster than older play.' },
    ],
  },

  play_days: {
    title: 'Play Days',
    subtitle: 'How often you have shown up to play.',
    sections: [
      { label: 'In plain English', body: 'Play Days is the number of distinct local calendar days with at least one logged play in the last 56 days. Twenty songs on one day still count as one play day.' },
      { label: 'Why it matters', body: 'This rewards consistency across days, not marathoning everything into one session. If this number slips, calibration and other training metrics also become slower to trust.' },
      { label: 'How to grow it', body: 'Spread your sessions across more separate days. Even a shorter session counts, so regular cadence works better than saving everything for one long day.' },
    ],
  },

  avg_play_load: {
    title: 'Avg Load / Clear',
    subtitle: 'The average difficulty weight of the clears supporting your profile.',
    sections: [
      { label: 'In plain English', body: 'Avg Load / Clear is Base Skill divided by your smoothed clear count. It is a conservative difficulty baseline, not a pass guarantee.' },
      { label: 'Why it matters', body: 'We use this as one input for comfortable level and pass-ceiling logic, but it is not enough on its own. Stronger clears and better grades push it up; lots of easy clears can pull it down.' },
      { label: 'How to push it up', body: 'Clear harder songs or improve your grades on the songs you are already clearing. A big pile of easy clears can grow the clear count faster than the load, which usually drags this number down.' },
    ],
  },

  chronic_clears: {
    title: 'Chronic Clears',
    subtitle: 'Your smoothed weekly clear count.',
    sections: [
      { label: 'In plain English', body: 'Chronic Clears is an EWMA-smoothed count of your weekly clears. It tells you how many clears per week you sustain on average — not just this week, but weighted recently.' },
      { label: 'Why it matters', body: 'It pairs with Base Skill in the Avg Load / Clear formula. Higher chronic clear counts at lower difficulty can drag your average load down even if you are putting in a lot of plays.' },
    ],
  },

  sparkline: {
    title: 'Form vs Base',
    subtitle: 'Reading the trend chart.',
    sections: [
      { label: 'The filled line', body: 'The colored, filled area is Current Form — your last ~7 days of training load smoothed with an EWMA. It rises quickly when you play harder, drops quickly when you take time off.' },
      { label: 'The dashed line', body: 'The dashed gray line is Base Skill — the same data smoothed over ~28 days. It moves slowly and represents your sustained training baseline over weeks.' },
      { label: 'Reading the gap', body: 'When Form sits above Base, you are running hot — your recent week is harder than your baseline. When Form sits below Base, you are cooling off. The bigger the gap, the bigger the change.' },
    ],
  },

  likely_pass: {
    title: 'Next Target',
    subtitle: 'The level you are most likely to break next.',
    sections: [
      { label: 'How it is picked', body: 'We look at the levels above your comfortable bracket where you have the most attempts and near-passes, and weight them by your current form. The model picks the lowest level where it expects you to clear with a meaningful grade.' },
      { label: 'Confidence', body: 'High confidence = you have multiple recent clears or strong near-passes at this level, and your form supports it. Medium = mixed signals — some clears but inconsistent. Low = the prediction is mostly extrapolation, treat it as a stretch goal.' },
      { label: 'Predicted grade', body: 'The grade chip estimates the grade you would land at this level given your current form. It is a baseline, not a ceiling — peak runs can outperform it.' },
      { label: 'Sample clears', body: 'The clears shown below the headline are examples from the target level — actual songs you have already cleared at this difficulty, with the score and grade you got.' },
    ],
  },

  grade_predictions: {
    title: 'Grade Predictions',
    subtitle: 'Predicted grade for each level you might attempt.',
    sections: [
      { label: 'What you are seeing', body: 'For each level around your comfortable bracket, the system estimates the grade you would be most likely to land if you played a typical chart at that level today. Higher levels = harder predictions.' },
      { label: 'How to read it', body: 'Sky-blue grades (SSS / SSS+) mean you are likely to push the top of the scoring tier. Gold (SS / SS+) is solid clear territory. Below that, you are more likely on the edge of passing or graded clears.' },
      { label: 'Why it matters', body: 'It is a quick scan of where your skill falls off. A clean SSS+ at L19 dropping to A at L23 tells you exactly where to target your training pushes.' },
    ],
  },

  percentile: {
    title: 'Percentile',
    subtitle: 'Where your average load per clear ranks against everyone else in this mode.',
    sections: [
      { label: 'In plain English', body: 'Your Avg Load / Clear is compared against every other player in this mode. Your percentile is the share of players you are ahead of. 80th means you outclear 80% of the player base on this metric.' },
      { label: 'Why this metric', body: "PIU's scoring system assigns exponentially higher base points to harder levels (Lv.20 = 650, Lv.22 = 880, Lv.24 = 1150). When you consistently clear harder charts, your average load per clear rises proportionally. The population ranking then places you against other players using the same scale." },
    ],
  },

  milestone: {
    title: 'Next Milestone',
    subtitle: 'The next average-load bracket above where you are now.',
    sections: [
      { label: 'In plain English', body: 'Milestones are the average-load thresholds tied to each level bracket. The "next" one is the smallest jump above your current Avg Load / Clear. Hit it and your comfort + ceiling estimates both shift up.' },
      { label: 'How to close the gap', body: 'Add stronger clears at higher levels. The metric is an average, so one big clear at a much harder level moves the needle more than ten easy clears.' },
    ],
  },

  ceiling: {
    title: 'Ceiling',
    subtitle: 'The highest level you are likely to clear with effort.',
    sections: [
      { label: 'In plain English', body: 'The ceiling is the highest level the system thinks you can break with focused effort, given your current form and Avg Load / Clear. The "+N from comfort" is how far past your comfortable bracket the ceiling sits.' },
      { label: 'How to push it', body: 'The fastest way to raise the ceiling is to keep grinding the level just above your comfort. Each clear at that level lifts the model\'s estimate of where you can stretch.' },
    ],
  },
};
