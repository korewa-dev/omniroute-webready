// OmniRoute WebReady - Cloudflare Worker
// Handles all /v1/* API calls and routes to AI providers

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

// CORS headers for browser access
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Handle preflight
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

// Parse API key from header
function getApiKey(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.replace('Bearer ', '').trim();
}

// Route chat completions
async function handleChatCompletions(request, env, db) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return jsonError('Invalid JSON body', 400);
  }

  const apiKey = getApiKey(request);
  if (!apiKey && env.REQUIRE_API_KEY === 'true') {
    return jsonError('Authentication required', 401);
  }

  // Pick provider based on model
  const model = body.model || 'auto';
  const provider = selectProvider(model);

  if (!provider) {
    return jsonError(`Unknown model: ${model}`, 400);
  }

  // Build upstream request
  const upstreamBody = {
    ...body,
    model: provider.models[0] || model,
  };

  try {
    const upstreamResp = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.UPSTREAM_API_KEY || apiKey}`,
      },
      body: JSON.stringify(upstreamBody),
    });

    const data = await upstreamResp.json();

    // Log usage (async, don't block)
    if (db && data.usage) {
      logUsage(db, {
        model: body.model,
        provider: provider.id,
        tokens: data.usage.total_tokens || 0,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }

    return new Response(JSON.stringify(data), {
      status: upstreamResp.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (err) {
    return jsonError(`Upstream error: ${err.message}`, 502);
  }
}

// Select provider based on model string
function selectProvider(model) {
  if (model === 'auto') {
    return FREE_PROVIDERS[0]; // default to first available
  }
  for (const p of FREE_PROVIDERS) {
    if (p.models.some(m => model.startsWith(m.split('/')[0]) || model === m)) {
      return p;
    }
  }
  return FREE_PROVIDERS[0];
}

// List available models
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

// Log usage to D1
async function logUsage(db, entry) {
  await db
    .prepare('INSERT INTO usage (model, provider, tokens, timestamp) VALUES (?, ?, ?, ?)')
    .bind(entry.model, entry.provider, entry.tokens, entry.timestamp)
    .run();
}

// JSON error response
function jsonError(message, status = 400) {
  return new Response(
    JSON.stringify({ error: { message, type: 'api_error' } }),
    { status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
  );
}

// Health check
function handleHealth() {
  return new Response(
    JSON.stringify({ status: 'ok', version: '3.8.50-cf', providers: FREE_PROVIDERS.length }),
    { headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
  );
}

// Main request handler
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  // Health check
  if (path === '/health' || path === '/v1/health') {
    return handleHealth();
  }

  // Models endpoint
  if (path === '/v1/models') {
    return handleListModels();
  }

  // Chat completions
  if (path === '/v1/chat/completions' && request.method === 'POST') {
    return handleChatCompletions(request, env, env.DB);
  }

  // Unknown endpoint
  return jsonError(`Unknown endpoint: ${path}`, 404);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (err) {
      return jsonError(`Internal error: ${err.message}`, 500);
    }
  },
};
