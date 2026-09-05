-- OmniRoute WebReady Schema

CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT 'default',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used TEXT,
    total_requests INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    display_name TEXT,
    context_length INTEGER DEFAULT 4096,
    enabled INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
);

CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key_id INTEGER,
    provider_id TEXT,
    model TEXT,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    status INTEGER DEFAULT 200,
    latency_ms INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_log(model);

-- Insert default providers
INSERT OR IGNORE INTO providers (id, name, base_url, priority) VALUES
    ('openai', 'OpenAI', 'https://api.openai.com/v1', 1),
    ('anthropic', 'Anthropic', 'https://api.anthropic.com/v1', 2),
    ('google', 'Google AI', 'https://generativelanguage.googleapis.com/v1beta', 3),
    ('groq', 'Groq', 'https://api.groq.com/openai/v1', 4),
    ('together', 'Together AI', 'https://api.together.xyz/v1', 5),
    ('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 6);

-- Insert default models
INSERT OR IGNORE INTO models (id, provider_id, display_name, context_length) VALUES
    ('gpt-4o-mini', 'openai', 'GPT-4o Mini', 128000),
    ('gpt-4o', 'openai', 'GPT-4o', 128000),
    ('claude-3-5-sonnet-20241022', 'anthropic', 'Claude 3.5 Sonnet', 200000),
    ('claude-3-5-haiku-20241022', 'anthropic', 'Claude 3.5 Haiku', 200000),
    ('gemini-1.5-flash', 'google', 'Gemini 1.5 Flash', 1000000),
    ('gemini-1.5-pro', 'google', 'Gemini 1.5 Pro', 2000000),
    ('llama-3.1-8b-instant', 'groq', 'LLaMA 3.1 8B', 8192),
    ('mixtral-8x7b-32768', 'groq', 'Mixtral 8x7B', 32768);
