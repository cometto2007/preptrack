-- Expand the activity_log source CHECK constraint to include
-- action types used when resolving notification prompts.
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_source_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_source_check
  CHECK (source IN ('manual', 'prompt', 'mealie_sync', 'batch_delete', 'defrost', 'used_freezer'));
