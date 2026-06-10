import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') || '';

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: caller } = await userClient.auth.getUser();
  if (!caller.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const { data: profile } = await adminClient
    .from('prode_profiles')
    .select('is_admin')
    .eq('id', caller.user.id)
    .single();

  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: corsHeaders });
  }

  const body = await req.json();
  const action = body.action;

  if (action === 'create_user') {
    const email = `${body.username}@prodeamigos.local`;
    const { data: userData, error } = await adminClient.auth.admin.createUser({
      email,
      password: body.password || 'prode2026',
      email_confirm: true,
    });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });

    const { data: avatar } = await adminClient.from('prode_avatars').select('id').eq('code', body.avatar_code || 'PA').maybeSingle();
    const { error: profileError } = await adminClient.from('prode_profiles').insert({
      id: userData.user.id,
      username: body.username,
      real_name: body.real_name,
      avatar_id: avatar?.id,
      is_admin: Boolean(body.is_admin),
    });
    if (profileError) return new Response(JSON.stringify({ error: profileError.message }), { status: 400, headers: corsHeaders });

    if (body.league_id) {
      await adminClient.from('prode_league_members').insert({
        league_id: body.league_id,
        user_id: userData.user.id,
        role: body.is_admin ? 'admin' : 'player',
      });
    }
    return new Response(JSON.stringify({ user: userData.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (action === 'reset_password') {
    const { error } = await adminClient.auth.admin.updateUserById(body.user_id, { password: body.password });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
});
