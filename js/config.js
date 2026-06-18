// ============================================================
// Prediger Power Performance — Configuration
// ============================================================
// Set DEMO_MODE to false and fill in Supabase credentials
// when you are ready to go fully live.
// ============================================================

const DEMO_MODE = true

const SUPABASE_URL          = 'https://YOUR_PROJECT_ID.supabase.co'
const SUPABASE_ANON         = 'YOUR_SUPABASE_ANON_KEY'
const SUPABASE_SERVICE_ROLE = 'YOUR_SERVICE_ROLE_KEY'

// ── EmailJS (for athlete code delivery) ──────────────────────
const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID'
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID'
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY'

// ── Trainer account ───────────────────────────────────────────
const DEMO_TRAINER = {
  id: 'trainer-ben', email: 'benprediger@gmail.com',
  full_name: 'Ben Prediger', role: 'trainer', password: '#Joshben1199', athlete_code: '100'
}

// No built-in demo athletes — real athletes sign up via signup.html
const DEMO_ATHLETES       = []
const DEMO_WORKOUTS       = []
const DEMO_METRICS        = []
const DEMO_METRIC_HISTORY = []
const DEMO_LIFT_HISTORY   = []
const DEMO_MESSAGES       = []
const DEMO_PRIVATE        = []
const DEMO_SESSION_COUNTS = {}
const DEMO_ATTENDANCE     = []

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

// ── Default configs ───────────────────────────────────────────
const DEFAULT_LEADERBOARD_CONFIG = {
  metrics: ['vertical_jump', 'sprint_40yd', 'sprint_10yd'],
  lifts:   ['Back Squat', 'Bench Press', 'Deadlift'],
}

const DEFAULT_PROFILE_CONFIG = {
  metrics: ['body_weight', 'vertical_jump', 'sprint_40yd'],
  lifts:   ['Back Squat', 'Bench Press', 'Deadlift'],
}

// ── Epley 1RM estimate ────────────────────────────────────────
function epley1RM(weight, reps) {
  if (!weight || !reps || reps < 1) return null
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30))
}

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
