// OmniRoute WebReady — Cloudflare Pages Function
// Handles /v1/* and /health routes

const FREE_PROVIDERS = [
  {
    id: 'oc-free',
    name: 'OpenCode Free',
    baseUrl: 'https://api.opencode.chat/v1',
    models: ['oc/gpt-3.5-turbo', 'oc/gpt-4o-mini'],
  },
  {
    id: 'felo',
    name: 'Felo Free',
    baseUrl: 'https://api.felo.ai/v1',
    models: ['felo/gpt-3.5-turbo', 'felo/llama-3.1-8b'],
  },
  {
    id: 'kimi-free',
    name: 'Kimi Free',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi/moonshot-v1-8k', 'kimi/moonshot-v1-32k'],
    needsAuth: true,
  },
];

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function handleOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function getApiKey(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.replace('Bearer ', '').trim();
}

function selectProvider(model) {
  if (model === 'auto') return FREE_PROVIDERS[0];
  for (const p of FREE_PROVIDERS) {
    if (p.models.some(m => model.startsWith(m.split('/')[0]) || model === m)) {
      return p;
    }
  }
  return FREE_PROVIDERS[0];
}

function jsonError(message, status = 400) {
  return new Response(
    JSON.stringify({ error: { message, type: 'api_error' } }),
    { status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
  );
}

async function handleChatCompletions(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonError('Invalid JSON body', 400);

  const apiKey = getApiKey(request);
  if (!apiKey && env.REQUIRE_API_KEY === 'true') {
    return jsonError('Authentication required', 401);
  }

  const model = body.model || 'auto';
  const provider = selectProvider(model);

  if (!provider) return jsonError(`Unknown model: ${model}`, 400);

  const upstreamBody = {
    ...body,
    model: provider.models[0] || model,
  };

  try {
    const resp = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.UPSTREAM_API_KEY || apiKey}`,
      },
      body: JSON.stringify(upstreamBody),
    });

    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (err) {
    return jsonError(`Upstream error: ${err.message}`, 502);
  }
}

function handleListModels() {
  const models = FREE_PROVIDERS.flatMap(p =>
    p.models.map(model => ({
      id: model,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: p.id,
    }))
  );

  return new Response(
    JSON.stringify({ object: 'list', data: models }),
    { headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
  );
}

function handleHealth() {
  return new Response(
    JSON.stringify({ status: 'ok', version: '3.8.50-cf', providers: FREE_PROVIDERS.length }),
    { headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
  );
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') return handleOptions();
  if (path === '/health' || path === '/v1/health') return handleHealth();
  if (path === '/v1/models') return handleListModels();
  if (path === '/v1/chat/completions' && request.method === 'POST') {
    return handleChatCompletions(request, env);
  }

  return jsonError(`Unknown endpoint: ${path}`, 404);
}
