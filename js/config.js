// ============================================================
// Prediger Power Performance — Configuration
// ============================================================
// DEMO MODE: Set to true to use sample data without Supabase.
// Set to false and fill in your credentials when ready.
// ============================================================

const DEMO_MODE = true

const SUPABASE_URL          = 'https://YOUR_PROJECT_ID.supabase.co'
const SUPABASE_ANON         = 'YOUR_SUPABASE_ANON_KEY'     // Project Settings → API → anon/public
const SUPABASE_SERVICE_ROLE = 'YOUR_SERVICE_ROLE_KEY'       // Project Settings → API → service_role (keep private!)

// ── EmailJS (for athlete code delivery) ──────────────────────
// Sign up free at emailjs.com, then fill these in:
const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID'   // e.g. 'service_abc123'
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID'  // e.g. 'template_xyz789'
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY'   // found in Account > API Keys

// ── Demo accounts ────────────────────────────────────────────
const DEMO_TRAINER = {
  id: 'trainer-ben', email: 'benprediger@gmail.com',
  full_name: 'Ben Prediger', role: 'trainer', password: 'trainer123', athlete_code: '100'
}

const DEMO_ATHLETES = [
  { id: 'a1', email: 'alex@demo.com',   full_name: 'Alex Johnson', role: 'athlete', sport: 'Baseball',   gender: 'male',   age: 17, grade: '11', athlete_code: '101', password: 'demo' },
  { id: 'a2', email: 'maya@demo.com',   full_name: 'Maya Smith',   role: 'athlete', sport: 'Basketball', gender: 'female', age: 16, grade: '10', athlete_code: '102', password: 'demo' },
  { id: 'a3', email: 'jordan@demo.com', full_name: 'Jordan Lee',   role: 'athlete', sport: 'Football',   gender: 'male',   age: 18, grade: '12', athlete_code: '103', password: 'demo' },
  { id: 'a4', email: 'sam@demo.com',    full_name: 'Sam Parker',   role: 'athlete', sport: 'Baseball',   gender: 'male',   age: 15, grade: '9',  athlete_code: '104', password: 'demo' },
  { id: 'a5', email: 'chris@demo.com',  full_name: 'Chris Davis',  role: 'athlete', sport: 'Track',      gender: 'male',   age: 16, grade: '10', athlete_code: '105', password: 'demo' },
]

// ── Week dates (Mon–Fri of current week) ─────────────────────
const TODAY = new Date().toISOString().split('T')[0]

const WEEK_DATES = (() => {
  const d = new Date(TODAY + 'T00:00:00')
  const dow = d.getDay()
  const mon = new Date(d)
  mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return [0,1,2,3,4].map(i => {
    const day = new Date(mon)
    day.setDate(mon.getDate() + i)
    return day.toISOString().split('T')[0]
  })
})()

// ── Weekly demo workouts (Mon–Fri, with superset groups) ──────
const DEMO_WORKOUTS = [
  {
    id: 'w1', title: 'Lower Body Power',
    description: 'Explosive lower body — squats, hinges, jumps.',
    scheduled_date: WEEK_DATES[0], athlete_id: null,
    notes: 'Rest 3 min between heavy sets. A1/A2 = superset — no rest between.',
    exercises: [
      { id: 'e1',  name: 'Back Squat',           group: 'A', group_order: 1, sets: 4, reps: 5,  target_weight: 225, notes: 'Pause 1 sec at bottom', order_index: 0 },
      { id: 'e2',  name: 'Box Jump',              group: 'A', group_order: 2, sets: 4, reps: 3,  target_weight: null,notes: 'Max height, full reset', order_index: 1 },
      { id: 'e3',  name: 'Romanian Deadlift',     group: 'B', group_order: 1, sets: 3, reps: 8,  target_weight: 185, notes: null,                    order_index: 2 },
      { id: 'e4',  name: 'Bulgarian Split Squat', group: 'B', group_order: 2, sets: 3, reps: 10, target_weight: 95,  notes: 'Each leg',              order_index: 3 },
      { id: 'e5',  name: 'Calf Raises',           group: 'C', group_order: 1, sets: 4, reps: 15, target_weight: 135, notes: null,                    order_index: 4 },
    ]
  },
  {
    id: 'w2', title: 'Upper Body Strength',
    description: 'Push / pull balance — chest, back, shoulders.',
    scheduled_date: WEEK_DATES[1], athlete_id: null,
    notes: 'Superset A1/A2 with minimal rest between. 2 min rest between supersets.',
    exercises: [
      { id: 'e6',  name: 'Bench Press',     group: 'A', group_order: 1, sets: 4, reps: 6,  target_weight: 185, notes: null,         order_index: 0 },
      { id: 'e7',  name: 'Barbell Row',     group: 'A', group_order: 2, sets: 4, reps: 6,  target_weight: 155, notes: null,         order_index: 1 },
      { id: 'e8',  name: 'DB Incline Press',group: 'B', group_order: 1, sets: 3, reps: 10, target_weight: 65,  notes: 'Each side',  order_index: 2 },
      { id: 'e9',  name: 'Pull-Ups',        group: 'B', group_order: 2, sets: 3, reps: 8,  target_weight: null,notes: 'Bodyweight', order_index: 3 },
      { id: 'e10', name: 'Lateral Raises',  group: 'C', group_order: 1, sets: 3, reps: 15, target_weight: 20,  notes: null,         order_index: 4 },
      { id: 'e11', name: 'Face Pulls',      group: 'C', group_order: 2, sets: 3, reps: 15, target_weight: 40,  notes: null,         order_index: 5 },
    ]
  },
  {
    id: 'w3', title: 'Sprint & Power',
    description: 'Speed development and explosive movement.',
    scheduled_date: WEEK_DATES[2], athlete_id: null,
    notes: 'Full rest between sprint reps. Quality over quantity.',
    exercises: [
      { id: 'e12', name: '10yd Sprint', group: 'A', group_order: 1, sets: 6, reps: 1, target_weight: null, notes: 'Record time each rep',  order_index: 0 },
      { id: 'e13', name: 'Fly 10',      group: 'A', group_order: 2, sets: 4, reps: 1, target_weight: null, notes: 'Flying start',           order_index: 1 },
      { id: 'e14', name: 'Power Clean', group: 'B', group_order: 1, sets: 5, reps: 3, target_weight: 155,  notes: 'Focus on catch',         order_index: 2 },
      { id: 'e15', name: 'Broad Jump',  group: 'B', group_order: 2, sets: 5, reps: 3, target_weight: null, notes: 'Max distance, 3 tries',  order_index: 3 },
    ]
  },
  {
    id: 'w4', title: 'Total Body Strength',
    description: 'Full body compound movements.',
    scheduled_date: WEEK_DATES[3], athlete_id: null,
    notes: 'Focus on technique. Record all working sets.',
    exercises: [
      { id: 'e16', name: 'Deadlift',       group: 'A', group_order: 1, sets: 4, reps: 4, target_weight: 275, notes: 'Brace hard',   order_index: 0 },
      { id: 'e17', name: 'Hang Clean',     group: 'A', group_order: 2, sets: 4, reps: 3, target_weight: 135, notes: null,           order_index: 1 },
      { id: 'e18', name: 'Front Squat',    group: 'B', group_order: 1, sets: 3, reps: 6, target_weight: 165, notes: null,           order_index: 2 },
      { id: 'e19', name: 'Overhead Press', group: 'B', group_order: 2, sets: 3, reps: 8, target_weight: 115, notes: null,           order_index: 3 },
      { id: 'e20', name: 'Chin-Ups',       group: 'C', group_order: 1, sets: 3, reps: 8, target_weight: null,notes: 'Bodyweight',   order_index: 4 },
    ]
  },
  {
    id: 'w5', title: 'Speed & Recovery',
    description: 'Light speed work and movement quality.',
    scheduled_date: WEEK_DATES[4], athlete_id: null,
    notes: 'Keep intensity moderate. Focus on crisp mechanics.',
    exercises: [
      { id: 'e21', name: '40yd Sprint',  group: 'A', group_order: 1, sets: 4, reps: 1,  target_weight: null, notes: 'Record time',   order_index: 0 },
      { id: 'e22', name: 'Vertical Jump',group: 'A', group_order: 2, sets: 5, reps: 3,  target_weight: null, notes: 'Record height', order_index: 1 },
      { id: 'e23', name: 'Goblet Squat', group: 'B', group_order: 1, sets: 3, reps: 12, target_weight: 60,   notes: null,            order_index: 2 },
      { id: 'e24', name: 'Hip Thrust',   group: 'B', group_order: 2, sets: 3, reps: 12, target_weight: 135,  notes: null,            order_index: 3 },
    ]
  },
]

// ── Demo metrics (all athletes) ───────────────────────────────
const DEMO_METRICS = [
  { id: 'm1',  athlete_id: 'a1', metric_type: 'vertical_jump', value: 34.5, unit: 'in',  recorded_date: TODAY },
  { id: 'm2',  athlete_id: 'a1', metric_type: 'body_weight',   value: 185,  unit: 'lbs', recorded_date: TODAY },
  { id: 'm3',  athlete_id: 'a1', metric_type: 'sprint_40yd',   value: 4.52, unit: 'sec', recorded_date: TODAY },
  { id: 'm4',  athlete_id: 'a2', metric_type: 'vertical_jump', value: 28.0, unit: 'in',  recorded_date: TODAY },
  { id: 'm5',  athlete_id: 'a2', metric_type: 'body_weight',   value: 145,  unit: 'lbs', recorded_date: TODAY },
  { id: 'm6',  athlete_id: 'a2', metric_type: 'sprint_40yd',   value: 4.78, unit: 'sec', recorded_date: TODAY },
  { id: 'm7',  athlete_id: 'a3', metric_type: 'vertical_jump', value: 31.0, unit: 'in',  recorded_date: TODAY },
  { id: 'm8',  athlete_id: 'a3', metric_type: 'body_weight',   value: 172,  unit: 'lbs', recorded_date: TODAY },
  { id: 'm9',  athlete_id: 'a3', metric_type: 'sprint_40yd',   value: 4.65, unit: 'sec', recorded_date: TODAY },
  { id: 'm10', athlete_id: 'a4', metric_type: 'vertical_jump', value: 36.2, unit: 'in',  recorded_date: TODAY },
  { id: 'm11', athlete_id: 'a4', metric_type: 'body_weight',   value: 198,  unit: 'lbs', recorded_date: TODAY },
  { id: 'm12', athlete_id: 'a4', metric_type: 'sprint_40yd',   value: 4.44, unit: 'sec', recorded_date: TODAY },
  { id: 'm13', athlete_id: 'a5', metric_type: 'vertical_jump', value: 29.5, unit: 'in',  recorded_date: TODAY },
  { id: 'm14', athlete_id: 'a5', metric_type: 'body_weight',   value: 165,  unit: 'lbs', recorded_date: TODAY },
  { id: 'm15', athlete_id: 'a5', metric_type: 'sprint_40yd',   value: 4.71, unit: 'sec', recorded_date: TODAY },
]

// ── Demo messages ─────────────────────────────────────────────
const DEMO_MESSAGES = [
  {
    id: 'msg1',
    author_id: 'trainer-ben',
    recipient_id: null,   // public
    content: "Great work this week everyone! Remember to log your body weight before every session. Next week we're testing maxes on Monday — come ready to go!",
    is_pinned: true,
    created_at: new Date(Date.now() - 2 * 864e5).toISOString(),
    author: { full_name: 'Ben Prediger', role: 'trainer' }
  },
  {
    id: 'msg2',
    author_id: 'trainer-ben',
    recipient_id: null,
    content: "Tuesday's session starts at 6:00 AM sharp. Don't be late — we're doing sprint testing at the top of the hour.",
    is_pinned: false,
    created_at: new Date(Date.now() - 864e5).toISOString(),
    author: { full_name: 'Ben Prediger', role: 'trainer' }
  },
  {
    id: 'msg3',
    author_id: 'a1',
    recipient_id: null,
    content: "Feeling strong this week! Back squat PR is coming soon.",
    is_pinned: false,
    created_at: new Date(Date.now() - 12 * 36e5).toISOString(),
    author: { full_name: 'Alex Johnson', role: 'athlete' }
  },
  {
    id: 'msg4',
    author_id: 'a4',
    recipient_id: null,
    content: "Just hit a new vertical jump record in practice. Let's go!",
    is_pinned: false,
    created_at: new Date(Date.now() - 4 * 36e5).toISOString(),
    author: { full_name: 'Sam Parker', role: 'athlete' }
  },
]

// Private messages from trainer to specific athletes
const DEMO_PRIVATE = [
  {
    id: 'pm1',
    author_id: 'trainer-ben',
    recipient_id: 'a1',
    content: "Alex — your squat depth has improved massively. Keep working that hip mobility before sessions. You're on pace for a 315 squat by the end of this cycle.",
    is_pinned: false,
    created_at: new Date(Date.now() - 3 * 864e5).toISOString(),
    author: { full_name: 'Ben Prediger', role: 'trainer' }
  },
  {
    id: 'pm2',
    author_id: 'trainer-ben',
    recipient_id: 'a4',
    content: "Sam — outstanding vertical jump numbers. You're now the top jumper in the group. Let's talk about adding plyometric volume next training block.",
    is_pinned: false,
    created_at: new Date(Date.now() - 864e5).toISOString(),
    author: { full_name: 'Ben Prediger', role: 'trainer' }
  },
  {
    id: 'pm3',
    author_id: 'trainer-ben',
    recipient_id: 'a2',
    content: "Maya — great consistency this month. Your sprint times have dropped by 0.12 seconds since we started. Keep focusing on your drive phase off the blocks.",
    is_pinned: false,
    created_at: new Date(Date.now() - 2 * 864e5).toISOString(),
    author: { full_name: 'Ben Prediger', role: 'trainer' }
  },
]

// Session counts for leaderboard display
const DEMO_SESSION_COUNTS = { a1: 15, a2: 11, a3: 10, a4: 12, a5: 8 }

// ── Default configs (overridden by localStorage) ──────────────
const DEFAULT_LEADERBOARD_CONFIG = {
  metrics: ['vertical_jump', 'sprint_40yd', 'sprint_10yd'],
  lifts:   ['Back Squat', 'Bench Press', 'Deadlift'],
}

const DEFAULT_PROFILE_CONFIG = {
  metrics: ['body_weight', 'vertical_jump', 'sprint_40yd'],
  lifts:   ['Back Squat', 'Bench Press', 'Deadlift'],
}

// ── Historical data generators ────────────────────────────────

function _genLift(athleteId, liftName, startW, endW, startDate, count) {
  const out = []
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i * 14) // every 2 weeks
    const w = Math.round(startW + (endW - startW) * (i / (count - 1)))
    // vary reps realistically: heavy weeks 3, medium 4, light 5
    const reps = i % 3 === 2 ? 3 : i % 3 === 1 ? 4 : 5
    out.push({ athlete_id: athleteId, exercise_name: liftName,
               date: d.toISOString().split('T')[0], weight: w, reps })
  }
  return out
}

function _genMetric(athleteId, metricType, startVal, endVal, unit, startDate, count) {
  const out = []
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i * 14)
    const v = parseFloat((startVal + (endVal - startVal) * (i / (count - 1))).toFixed(2))
    // add small noise for realism
    const noise = (Math.sin(i * 1.7) * 0.5)
    const val = parseFloat((v + (unit === 'lbs' ? noise * 0.5 : noise * 0.05)).toFixed(2))
    out.push({ athlete_id: athleteId, metric_type: metricType,
               value: val, unit, recorded_date: d.toISOString().split('T')[0] })
  }
  return out
}

const _HS = '2025-01-06'  // history start date
const _HN = 11            // number of data points

// ── Historical lift data (for 1RM charts + leaderboard) ───────
const DEMO_LIFT_HISTORY = [
  // Alex Johnson (a1)
  ..._genLift('a1', 'Back Squat',  185, 255, _HS, _HN),
  ..._genLift('a1', 'Bench Press', 135, 185, _HS, _HN),
  ..._genLift('a1', 'Deadlift',    225, 295, _HS, _HN),
  // Maya Smith (a2)
  ..._genLift('a2', 'Back Squat',   95, 135, _HS, _HN),
  ..._genLift('a2', 'Bench Press',  65,  95, _HS, _HN),
  ..._genLift('a2', 'Deadlift',    115, 155, _HS, _HN),
  // Jordan Lee (a3)
  ..._genLift('a3', 'Back Squat',  155, 215, _HS, _HN),
  ..._genLift('a3', 'Bench Press', 115, 155, _HS, _HN),
  ..._genLift('a3', 'Deadlift',    195, 255, _HS, _HN),
  // Sam Parker (a4)
  ..._genLift('a4', 'Back Squat',  235, 305, _HS, _HN),
  ..._genLift('a4', 'Bench Press', 185, 235, _HS, _HN),
  ..._genLift('a4', 'Deadlift',    285, 355, _HS, _HN),
  // Chris Davis (a5)
  ..._genLift('a5', 'Back Squat',  145, 195, _HS, _HN),
  ..._genLift('a5', 'Bench Press', 105, 145, _HS, _HN),
  ..._genLift('a5', 'Deadlift',    185, 245, _HS, _HN),
]

// ── Historical metric data (for trend charts) ─────────────────
const DEMO_METRIC_HISTORY = [
  // Alex Johnson
  ..._genMetric('a1', 'body_weight',   183,   185, 'lbs', _HS, _HN),
  ..._genMetric('a1', 'vertical_jump',  31.0,  34.5, 'in',  _HS, _HN),
  ..._genMetric('a1', 'sprint_40yd',    4.72,  4.52, 'sec', _HS, _HN),
  // Maya Smith
  ..._genMetric('a2', 'body_weight',   143,   145, 'lbs', _HS, _HN),
  ..._genMetric('a2', 'vertical_jump',  25.5,  28.0, 'in',  _HS, _HN),
  ..._genMetric('a2', 'sprint_40yd',    4.95,  4.78, 'sec', _HS, _HN),
  // Jordan Lee
  ..._genMetric('a3', 'body_weight',   170,   172, 'lbs', _HS, _HN),
  ..._genMetric('a3', 'vertical_jump',  28.5,  31.0, 'in',  _HS, _HN),
  ..._genMetric('a3', 'sprint_40yd',    4.82,  4.65, 'sec', _HS, _HN),
  // Sam Parker
  ..._genMetric('a4', 'body_weight',   200,   198, 'lbs', _HS, _HN),
  ..._genMetric('a4', 'vertical_jump',  33.5,  36.2, 'in',  _HS, _HN),
  ..._genMetric('a4', 'sprint_40yd',    4.62,  4.44, 'sec', _HS, _HN),
  // Chris Davis
  ..._genMetric('a5', 'body_weight',   164,   165, 'lbs', _HS, _HN),
  ..._genMetric('a5', 'vertical_jump',  27.0,  29.5, 'in',  _HS, _HN),
  ..._genMetric('a5', 'sprint_40yd',    4.89,  4.71, 'sec', _HS, _HN),
]

// Epley 1RM estimate formula
function epley1RM(weight, reps) {
  if (!weight || !reps || reps < 1) return null
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30))
}

// Get best estimated 1RM per athlete for a given lift name
function getBestLiftPerAthlete(liftName, historyData) {
  const bests = {}
  historyData
    .filter(e => e.exercise_name.toLowerCase() === liftName.toLowerCase())
    .forEach(e => {
      const est = epley1RM(e.weight, e.reps)
      if (!est) return
      const prev = bests[e.athlete_id]
      if (!prev || est > prev.estimated1RM) {
        bests[e.athlete_id] = { ...e, estimated1RM: est }
      }
    })
  return Object.values(bests).sort((a, b) => b.estimated1RM - a.estimated1RM)
}

// ── Attendance demo data ──────────────────────────────────────
// Deterministic present/absent based on athlete id + date string

function _hashPresent(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i)
  return ((h >>> 0) % 100) < 85  // ~85% attendance rate
}

const DEMO_ATTENDANCE = (function () {
  const records = []
  const todayDate = new Date(TODAY + 'T00:00:00')
  const dow = todayDate.getDay()
  // Find this week's Monday
  const monday = new Date(todayDate)
  monday.setDate(todayDate.getDate() - (dow === 0 ? 6 : dow - 1))

  // Generate 11 full past weeks (Mon/Wed/Fri only)
  for (let w = 11; w >= 1; w--) {
    const weekMon = new Date(monday)
    weekMon.setDate(monday.getDate() - w * 7)

    ;[0, 1, 2, 3, 4].forEach(offset => {  // Mon–Fri
      const d = new Date(weekMon)
      d.setDate(weekMon.getDate() + offset)
      const dateStr = d.toISOString().split('T')[0]

      DEMO_ATHLETES.forEach(a => {
        records.push({
          athlete_id: a.id,
          date:       dateStr,
          status:     _hashPresent(a.id + dateStr) ? 'present' : 'absent'
        })
      })
    })
  }
  return records
})()
