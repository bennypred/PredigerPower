// Creates an athlete account (Supabase Auth user + profile row) on behalf of
// a trainer, using the service role key — which stays on the server here and
// is never shipped to the browser. Deploy with:
//   supabase functions deploy create-athlete
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are provided
// automatically by the Supabase platform to every Edge Function; no secrets
// need to be set manually.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''

    // Verify who's calling using their own JWT — never trust the request body alone.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Not authenticated.' })

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

    const { data: callerProfile } = await admin
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'trainer') {
      return json({ error: 'Only trainers can add athletes.' })
    }

    const body   = await req.json()
    const name   = String(body.name || '').trim()
    let   email  = String(body.email || '').trim().toLowerCase()
    let   pass   = String(body.password || '')
    const sport  = body.sport  || null
    const gender = body.gender || null
    const grade  = body.grade  || null
    const age    = body.age ? parseInt(body.age, 10) : null

    if (!name) return json({ error: 'Name is required.' })

    // Next athlete code — same numeric-increment scheme used client-side.
    const { data: codeRows } = await admin.from('profiles').select('athlete_code')
    const nums = (codeRows || [])
      .map((p: { athlete_code: string | null }) => p.athlete_code)
      .filter((c: string | null): c is string => !!c && /^\d+$/.test(c))
      .map((c: string) => parseInt(c, 10))
    const code = String(nums.length ? Math.max(...nums) + 1 : 106).padStart(3, '0')

    // No email/password provided? Athlete will sign in with their code only —
    // Supabase Auth still needs unique placeholders under the hood.
    if (!email) email = `athlete-${code.toLowerCase()}@athletes.p3.local`
    if (!pass)  pass  = crypto.randomUUID()

    const { data: authData, error: createErr } = await admin.auth.admin.createUser({
      email, password: pass,
      user_metadata: { full_name: name, role: 'athlete' },
      email_confirm: true,
    })
    if (createErr) return json({ error: createErr.message })

    const { error: updateErr } = await admin.from('profiles').update({
      athlete_code: code, sport, gender, grade, age,
    }).eq('id', authData.user.id)
    if (updateErr) return json({ error: updateErr.message })

    return json({ code, athlete_id: authData.user.id })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error.' })
  }
})
