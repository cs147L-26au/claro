// Reads configuration from Node's --env-file; never prints credentials or account data.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Missing Supabase URL or public client key.'); process.exit(1); }
const endpoint = new URL(url);
if (endpoint.hostname !== 'hexdjlxqcrodaugntwlw.supabase.co' && endpoint.hostname !== 'localhost' && endpoint.hostname !== '127.0.0.1') {
  console.error('Unexpected project host; inspect EXPO_PUBLIC_SUPABASE_URL locally.'); process.exit(1);
}
const contracts = {
  tasks: 'id,user_id,title,notes,due_date,done',
  decisions: 'id,user_id,title,choice,category,notes,alternatives,review_date,status,created_at,updated_at,priorities',
  options: 'id,task_id,name,ratings',
  universal_priorities: 'user_id,factor,weight,sort_order,name,description,color',
  task_priorities: 'task_id,user_id,factor,weight,sort_order,name,description,color,excluded,inherited',
  post_decision_tasks: 'id,user_id,decision_id,title,notes,due_date,done,created_at',
};
try {
  const results = await Promise.all(Object.entries(contracts).map(async ([table, fields]) => {
    const response = await fetch(`${url}/rest/v1/${table}?select=${fields}&limit=0`, {
      headers: { apikey: key }, signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    return { table, status: response.status, code: result?.code || null,
      state: response.ok ? 'Contract visible' : result?.code === '42501' ? 'Anonymous access denied (expected for private data)' : result?.code === 'PGRST205' ? 'Table unavailable in API schema cache' : result?.code === '42703' ? 'Required columns unavailable' : 'Check project/schema configuration' };
  }));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error('Supabase connection failed:', error.cause?.code || error.name);
  process.exitCode = 1;
}
