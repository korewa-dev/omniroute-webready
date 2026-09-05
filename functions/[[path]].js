// OmniRoute WebReady — Cloudflare Pages Function (catch-all)
// Handles all /v1/* API calls with D1-backed routing, auth, and usage tracking

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', needsKey: true, models: ['gpt-4o-mini','gpt-4o','gpt-4-turbo','gpt-3.5-turbo'] },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', needsKey: true, models: ['claude-3-5-sonnet-20241022','claude-3-5-haiku-20241022','claude-3-opus-20240229'] },
  { id: 'google', name: 'Google AI', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', needsKey: true, models: ['gemini-1.5-flash','gemini-1.5-pro','gemini-1.0-pro'] },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', needsKey: true, models: ['llama-3.1-8b-instant','llama-3.1-70b-versatile','mixtral-8x7b-32768','gemma2-9b-it'] },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', needsKey: true, models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo','mistralai/Mixtral-8x7B-Instruct-v0.1'] },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, models: ['auto','anthropic/claude-3.5-sonnet','google/gemini-1.5-flash','meta-llama/llama-3.1-8b-instruct'] },
  { id: 'oc-free', name: 'OpenCode Free', baseUrl: 'https://api.opencode.chat/v1', needsKey: false, models: ['oc/gpt-3.5-turbo','oc/gpt-4o-mini'] },
  { id: 'felo', name: 'Felo Free', baseUrl: 'https://api.felo.ai/v1', needsKey: false, models: ['felo/gpt-3.5-turbo','felo/llama-3.1-8b'] },
  { id: 'kimi-free', name: 'Kimi Free', baseUrl: 'https://api.moonshot.cn/v1', needsKey: true, models: ['kimi/moonshot-v1-8k','kimi/moonshot-v1-32k'] },
];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonError(msg, status = 400) {
  return new Response(
    JSON.stringify({ error: { message: msg, type: 'api_error' } }),
    { status, headers: { 'Content-Type': 'application/json', ...cors() } }
  );
}

function selectProvider(model) {
  if (!model || model === 'auto') return PROVIDERS.find(p => !p.needsKey) || PROVIDERS[0];
  
  // Exact match first
  for (const p of PROVIDERS) {
    if (p.models?.some(m => m === model)) return p;
  }
  
  // Prefix match (e.g. "gpt-4o" matches provider that has "gpt-4o-mini")
  for (const p of PROVIDERS) {
    if (p.models?.some(m => m.startsWith(model) || model.startsWith(m))) return p;
  }
  
  // Model name starts with provider id (e.g. "openai/gpt-4o")
  for (const p of PROVIDERS) {
    if (model.startsWith(p.id + '/')) return p;
  }
  
  return PROVIDERS.find(p => !p.needsKey) || PROVIDERS[0];
}

async function getApiKeyFromDB(db, key) {
  if (!key) return null;
  const row = await db.prepare('SELECT * FROM api_keys WHERE key = ? AND enabled = 1').bind(key).first();
  return row;
}

async function logUsage(db, data) {
  if (!db) return;
  await db.prepare(
    'INSERT INTO usage_log (api_key_id, provider_id, model, prompt_tokens, completion_tokens, total_tokens, status, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    data.apiKeyId || null,
    data.providerId || null,
    data.model || null,
    data.promptTokens || 0,
    data.completionTokens || 0,
    data.totalTokens || 0,
    data.status || 200,
    data.latencyMs || 0
  ).run().catch(() => {});
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  // Health check
  if (path === '/health' || path === '/v1/health') {
    return new Response(
      JSON.stringify({ status: 'ok', version: '1.0.0-cf', providers: PROVIDERS.length }),
      { headers: { 'Content-Type': 'application/json', ...cors() } }
    );
  }

  // Models list
  if (path === '/v1/models') {
    const models = PROVIDERS.flatMap(p =>
      (p.models || []).map(m => ({
        id: m,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: p.id,
      }))
    );
    return new Response(
      JSON.stringify({ object: 'list', data: models }),
      { headers: { 'Content-Type': 'application/json', ...cors() } }
    );
  }

  // Chat completions
  if (path === '/v1/chat/completions' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body) return jsonError('Invalid JSON', 400);

    const apiKeyHeader = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    const model = body.model || 'auto';
    const provider = selectProvider(model);
    const startTime = Date.now();

    // Check auth if required
    if (provider.needsKey && !apiKeyHeader) {
      return jsonError('Authentication required for this provider', 401);
    }

    // Check DB for key validation if DB available
    let apiKeyId = null;
    if (env.DB && apiKeyHeader) {
      const dbKey = await getApiKeyFromDB(env.DB, apiKeyHeader);
      if (!dbKey && env.REQUIRE_API_KEY === 'true') {
        return jsonError('Invalid API key', 401);
      }
      if (dbKey) apiKeyId = dbKey.id;
    }

    // Build upstream request — use the model as-is or map to provider's model
    let upstreamModel = model;
    if (model.includes('/')) {
      // e.g. "openai/gpt-4o" → "gpt-4o"
      upstreamModel = model.split('/').slice(1).join('/');
    } else if (model !== 'auto' && provider.models && provider.models.length > 0) {
      // Find exact or prefix match in provider's models
      const exact = provider.models.find(m => m === model);
      const prefix = provider.models.find(m => m.startsWith(model) || model.startsWith(m));
      upstreamModel = exact || prefix || provider.models[0];
    } else if (model === 'auto' && provider.models && provider.models.length > 0) {
      upstreamModel = provider.models[0];
    }

    const upstreamBody = { ...body, model: upstreamModel };
    const headers = { 'Content-Type': 'application/json' };
    if (apiKeyHeader) headers['Authorization'] = `Bearer ${apiKeyHeader}`;

    try {
      const resp = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(upstreamBody),
      });
      const data = await resp.json();
      const latency = Date.now() - startTime;

      // Log usage
      await logUsage(env.DB, {
        apiKeyId,
        providerId: provider.id,
        model: body.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        status: resp.status,
        latencyMs: latency,
      });

      return new Response(JSON.stringify(data), {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', ...cors() },
      });
    } catch (err) {
      return jsonError(`Upstream error: ${err.message}`, 502);
    }
  }

  return jsonError(`Not found: ${path}`, 404);
}
