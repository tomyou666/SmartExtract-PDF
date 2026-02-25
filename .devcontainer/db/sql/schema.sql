-- PDF × LLM Chat Web App schema
-- Drop legacy table if present
DROP TABLE IF EXISTS sample;

-- Uploaded PDFs
CREATE TABLE pdfs (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    storage_path VARCHAR(512) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Chat sessions (optionally linked to a PDF)
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pdf_id INTEGER REFERENCES pdfs(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL DEFAULT '新規チャット',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Chat messages (content_json: text + optional image refs)
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);

-- LLM settings (single row; api_key stored encrypted or env)
CREATE TABLE llm_settings (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(64) NOT NULL DEFAULT 'openai',
    api_key_encrypted TEXT,
    model VARCHAR(128) NOT NULL DEFAULT 'gpt-4o',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure exactly one row for LLM settings
INSERT INTO llm_settings (id, provider, model) VALUES (1, 'openai', 'gpt-4o');
