INSERT INTO roles (id, name, description, permissions, is_system, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000006',
  'Integration',
  'Machine access: read issues, create issues, comment',
  '["ISSUE_READ","ISSUE_CREATE","COMMENT_CREATE"]'::jsonb,
  true,
  now(),
  now()
)
ON CONFLICT DO NOTHING;
