INSERT INTO prompt_templates (
  workspace_id,
  name,
  content_type,
  system_prompt,
  user_prompt_template,
  prompt_config,
  is_active
)
SELECT
  w.id,
  'style-analysis-v1',
  'tweet',
  'You are a social media style analyst. Analyze the provided posts semantically and return only valid JSON without markdown or code fences.',
  'Analyze the posts below and return only this JSON object:
{
  "vocabulary": string[] (max 20),
  "humorSarcasmScore": number (0-1),
  "doList": string[] (max 8),
  "dontList": string[] (max 8),
  "brandSafetyNotes": string[] (max 8),
  "hookPatterns": [{ "type": string, "examples": string[] }],
  "writingPersonality": string (2-3 sentences)
}

Posts:
{{posts}}',
  '{"purpose":"style-analysis","schemaVersion":"v1"}'::jsonb,
  false
FROM workspaces w
ON CONFLICT (workspace_id, name)
DO UPDATE SET
  content_type = EXCLUDED.content_type,
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  prompt_config = EXCLUDED.prompt_config,
  is_active = EXCLUDED.is_active,
  updated_at = now();
