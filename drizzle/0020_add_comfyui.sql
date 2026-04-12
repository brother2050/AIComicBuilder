-- ComfyUI Workflows table
CREATE TABLE IF NOT EXISTS comfyui_workflows (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  workflow_json TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  workflow_type TEXT NOT NULL DEFAULT 'custom' CHECK(workflow_type IN ('image', 'video', 'custom')),
  input_schema TEXT DEFAULT '{}',
  output_schema TEXT DEFAULT '{}',
  is_default INTEGER NOT NULL DEFAULT 0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ComfyUI Generations table
CREATE TABLE IF NOT EXISTS comfyui_generations (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_id TEXT NOT NULL REFERENCES comfyui_workflows(id) ON DELETE CASCADE,
  shot_asset_id TEXT,
  project_id TEXT,
  shot_id TEXT,
  input_params TEXT NOT NULL DEFAULT '{}',
  output_urls TEXT NOT NULL DEFAULT '[]',
  comfyui_task_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'queued', 'running', 'completed', 'failed')),
  error TEXT,
  duration INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- ComfyUI Providers table
CREATE TABLE IF NOT EXISTS comfyui_providers (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT DEFAULT '',
  default_workflow_id TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  last_sync_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comfyui_workflows_user ON comfyui_workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_comfyui_workflows_provider ON comfyui_workflows(provider_id);
CREATE INDEX IF NOT EXISTS idx_comfyui_generations_workflow ON comfyui_generations(workflow_id);
CREATE INDEX IF NOT EXISTS idx_comfyui_generations_status ON comfyui_generations(status);
CREATE INDEX IF NOT EXISTS idx_comfyui_providers_user ON comfyui_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_comfyui_generations_project ON comfyui_generations(project_id);
