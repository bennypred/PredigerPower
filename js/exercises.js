// ============================================================
// Exercise Library & Suggestion Engine
// ============================================================

const EXERCISE_LIBRARY = {
  squat: {
    label: 'Squat Pattern', icon: '🏋️', color: '#f97316',
    keywords: ['squat', 'leg press', 'hack'],
    exercises: [
      'Back Squat', 'Front Squat', 'Goblet Squat', 'Box Squat',
      'Hack Squat', 'Leg Press', 'Safety Bar Squat', 'Zercher Squat',
      'Pause Squat', 'Tempo Squat', 'Low Bar Back Squat', 'High Bar Back Squat',
    ]
  },
  split: {
    label: 'Split Stance / Lunge', icon: '🦵', color: '#fb923c',
    keywords: ['lunge', 'split squat', 'bulgarian', 'step-up', 'step up', 'lateral lunge'],
    exercises: [
      'Bulgarian Split Squat', 'Reverse Lunge', 'Forward Lunge', 'Walking Lunge',
      'Step-Up', 'Split Squat', 'Lateral Lunge', 'Crossover Step-Up',
      'Single-Leg Squat', 'Rear-Foot-Elevated Split Squat', 'Single-Leg Press',
    ]
  },
  hinge: {
    label: 'Hip Hinge', icon: '💪', color: '#ef4444',
    keywords: ['deadlift', 'rdl', 'romanian', 'hip thrust', 'glute bridge', 'good morning', 'hamstring curl', 'nordic', 'hinge'],
    exercises: [
      'Deadlift', 'Romanian Deadlift', 'Trap Bar Deadlift', 'Sumo Deadlift',
      'Single-Leg RDL', 'Good Morning', 'Hip Thrust', 'Barbell Glute Bridge',
      'Nordic Hamstring Curl', 'Stiff-Leg Deadlift', 'Snatch-Grip Deadlift',
      'Single-Leg Hip Thrust', 'Kettlebell Swing',
    ]
  },
  push_h: {
    label: 'Horizontal Push', icon: '🤜', color: '#8b5cf6',
    keywords: ['bench press', 'bench', 'push-up', 'pushup', 'chest press', 'dips', 'fly', 'flye'],
    exercises: [
      'Bench Press', 'Incline Bench Press', 'Decline Bench Press',
      'Dumbbell Bench Press', 'Incline DB Press', 'Close-Grip Bench Press',
      'Push-Up', 'Weighted Push-Up', 'Ring Push-Up', 'Dips',
      'Cable Chest Press', 'Dumbbell Fly', 'Cable Fly',
    ]
  },
  push_v: {
    label: 'Vertical Push', icon: '⬆️', color: '#7c3aed',
    keywords: ['overhead press', 'shoulder press', 'arnold', 'push press', 'military press', 'landmine press', 'z-press', 'lateral raise'],
    exercises: [
      'Overhead Press', 'Push Press', 'Dumbbell Shoulder Press', 'Arnold Press',
      'Z-Press', 'Seated Military Press', 'Landmine Press', 'Handstand Push-Up',
      'Dumbbell Lateral Raise', 'Cable Lateral Raise', 'Cable Shoulder Press',
    ]
  },
  pull_h: {
    label: 'Horizontal Pull', icon: '🤛', color: '#2563eb',
    keywords: ['row', 'pull-apart', 'band pull', 'face pull', 'meadows'],
    exercises: [
      'Barbell Row', 'Pendlay Row', 'Dumbbell Row', 'Cable Row',
      'Chest-Supported Row', 'T-Bar Row', 'Machine Row', 'Inverted Row',
      'Meadows Row', 'Band Pull-Apart', 'Face Pull',
    ]
  },
  pull_v: {
    label: 'Vertical Pull', icon: '⬇️', color: '#0891b2',
    keywords: ['pull-up', 'pullup', 'chin-up', 'chinup', 'pulldown', 'lat pulldown', 'lat pull'],
    exercises: [
      'Pull-Up', 'Weighted Pull-Up', 'Chin-Up', 'Neutral-Grip Pull-Up',
      'Lat Pulldown', 'Close-Grip Pulldown', 'Single-Arm Pulldown',
      'Cable Straight-Arm Pulldown', 'Assisted Pull-Up', 'Band-Assisted Pull-Up',
    ]
  },
  core: {
    label: 'Core', icon: '🎯', color: '#059669',
    keywords: ['plank', 'dead bug', 'pallof', 'ab wheel', 'hanging', 'crunch', 'carry', 'rotation', 'anti-rotation', 'l-sit', 'dragon flag'],
    exercises: [
      'Plank', 'Side Plank', 'Dead Bug', 'Pallof Press', 'Ab Wheel',
      'Hanging Leg Raise', 'Hanging Knee Raise', 'Cable Crunch',
      'Landmine Rotation', 'Suitcase Carry', 'Farmer Carry',
      'L-Sit', 'Dragon Flag', 'Copenhagen Plank',
    ]
  },
  olympic: {
    label: 'Olympic / Power', icon: '⚡', color: '#f59e0b',
    keywords: ['power clean', 'hang clean', 'power snatch', 'hang snatch', 'jerk', 'clean pull', 'snatch pull', 'muscle clean', 'clean'],
    exercises: [
      'Power Clean', 'Hang Clean', 'Hang Power Clean', 'Clean from Blocks',
      'Power Snatch', 'Hang Power Snatch', 'Snatch from Blocks',
      'Push Jerk', 'Split Jerk', 'Clean Pull', 'Snatch Pull',
      'Muscle Clean', 'Dumbbell Power Clean',
    ]
  },
  plyometric: {
    label: 'Plyometric', icon: '🚀', color: '#d946ef',
    keywords: ['box jump', 'depth jump', 'broad jump', 'bound', 'hop', 'med ball', 'medicine ball', 'slam', 'jump squat', 'tuck jump', 'hurdle', 'plyo'],
    exercises: [
      'Box Jump', 'Depth Jump', 'Broad Jump', 'Reactive Box Jump',
      'Single-Leg Box Jump', 'Lateral Bound', 'Single-Leg Hop',
      'Medicine Ball Slam', 'Medicine Ball Chest Pass', 'Medicine Ball Side Throw',
      'Jump Squat', 'Tuck Jump', 'Hurdle Hop', 'Ankle Hop',
    ]
  },
  sprint: {
    label: 'Sprint / Conditioning', icon: '💨', color: '#06b6d4',
    keywords: ['sprint', 'sled', 'prowler', 'agility', 'shuttle', 'cone drill', 'assault bike', 'rowing machine', 'run'],
    exercises: [
      '10yd Sprint', '20yd Sprint', '40yd Sprint', 'Hill Sprint',
      'Sled Push', 'Sled Pull', 'Prowler Push', 'Assault Bike',
      'Rowing Machine', 'Pro Agility 5-10-5', 'Shuttle Run',
      'L-Drill', '3-Cone Drill', 'Resisted Sprint',
    ]
  },
}

// ── Rep scheme presets ─────────────────────────────────────────
const REP_SCHEMES = [
  { label: 'Max Strength', sets: 5, reps: 2, note: 'Heaviest possible, 4–5 min rest'   },
  { label: 'Strength',     sets: 5, reps: 3, note: 'Very heavy, 3–4 min rest'           },
  { label: 'Strength+',    sets: 4, reps: 5, note: 'Heavy, 2–3 min rest'                },
  { label: '5×5',          sets: 5, reps: 5, note: 'Classic strength / mass builder'    },
  { label: 'Power',        sets: 5, reps: 3, note: 'Explosive intent, 2–3 min rest'     },
  { label: 'Hypertrophy',  sets: 4, reps: 8, note: 'Moderate weight, 60–90 sec rest'   },
  { label: 'Hypertrophy+', sets: 3, reps: 12, note: 'Moderate-light, 60 sec rest'      },
  { label: 'Endurance',    sets: 3, reps: 15, note: 'Light weight, 45 sec rest'         },
  { label: 'Volume',       sets: 5, reps: 10, note: 'Moderate, short rest, high volume' },
]

// ── Matching logic ────────────────────────────────────────────

/**
 * Returns the category key + object that best matches the given exercise name.
 * Returns null if no match found.
 */
function findExerciseCategory(name) {
  if (!name || name.trim().length < 2) return null
  const lower = name.trim().toLowerCase()

  // First pass: check keywords (exact substring match)
  for (const [key, cat] of Object.entries(EXERCISE_LIBRARY)) {
    if (cat.keywords.some(kw => lower.includes(kw) || kw.includes(lower))) {
      return { key, ...cat }
    }
  }

  // Second pass: check if name appears in any exercise list
  for (const [key, cat] of Object.entries(EXERCISE_LIBRARY)) {
    if (cat.exercises.some(ex => ex.toLowerCase().includes(lower) || lower.includes(ex.toLowerCase()))) {
      return { key, ...cat }
    }
  }

  return null
}

/** Returns all exercises from a category, excluding the current one */
function getAlternatives(catKey, excludeName) {
  const cat = EXERCISE_LIBRARY[catKey]
  if (!cat) return []
  return cat.exercises.filter(e => e.toLowerCase() !== (excludeName || '').toLowerCase())
}
