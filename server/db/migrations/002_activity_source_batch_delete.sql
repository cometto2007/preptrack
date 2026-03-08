-- Expand the activity_log source CHECK constraint to include batch_delete.
-- The inline CHECK constraint PostgreSQL auto-names as activity_log_source_check.
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_source_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_source_check
  CHECK (source IN ('manual', 'prompt', 'mealie_sync', 'batch_delete'));
