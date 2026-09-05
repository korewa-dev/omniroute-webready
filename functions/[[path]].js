// OmniRoute WebReady — Cloudflare Pages Function (catch-all)
// Handles /v1/* and /health

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
  if (model === 'auto') return FREE_PROVIDERS[0];
  for (const p of FREE_PROVIDERS) {
    if (p.models.some(m => model.startsWith(m.split('/')[0]) || model === m)) return p;
  }
  return FREE_PROVIDERS[0];
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  // Health check
  if (path === '/health' || path === '/v1/health') {
    return new Response(
      JSON.stringify({ status: 'ok', version: '1.0.0-cf', providers: FREE_PROVIDERS.length }),
      { headers: { 'Content-Type': 'application/json', ...cors() } }
    );
  }

  // Models list
  if (path === '/v1/models') {
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
      { headers: { 'Content-Type': 'application/json', ...cors() } }
    );
  }

  // Chat completions
  if (path === '/v1/chat/completions' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body) return jsonError('Invalid JSON', 400);

    const apiKey = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    const model = body.model || 'auto';
    const provider = selectProvider(model);

    const upstreamBody = { ...body, model: provider.models[0] || model };

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
        headers: { 'Content-Type': 'application/json', ...cors() },
      });
    } catch (err) {
      return jsonError(`Upstream error: ${err.message}`, 502);
    }
  }

  return jsonError(`Not found: ${path}`, 404);
}
