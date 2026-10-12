-- Additive migration; also safe to apply to an existing database.
BEGIN;
ALTER TABLE comments ALTER COLUMN forum_post_id DROP NOT NULL;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS info_post_id BIGINT REFERENCES info_posts(id) ON DELETE CASCADE;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS event_id BIGINT REFERENCES campus_events(id) ON DELETE CASCADE;
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_one_target;
ALTER TABLE comments ADD CONSTRAINT comments_one_target CHECK (num_nonnulls(forum_post_id, info_post_id, event_id) = 1);
CREATE INDEX IF NOT EXISTS comments_info_idx ON comments(info_post_id, id);
CREATE INDEX IF NOT EXISTS comments_event_idx ON comments(event_id, id);
CREATE TABLE IF NOT EXISTS content_likes (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('info', 'event')),
  target_id BIGINT NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id)
);
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS participant_name TEXT;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS contact TEXT;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS notes TEXT;
UPDATE role_strategies SET can_view_info=true, can_view_internal=true, can_view_alumni=true,
  can_view_forum=true, can_submit_info=true, can_post_forum=true, can_comment=true, can_create_profile=true
WHERE role IN ('student','graduate');
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_student_id_required;
ALTER TABLE campus_events DROP CONSTRAINT IF EXISTS campus_events_status_check;
ALTER TABLE campus_events ADD CONSTRAINT campus_events_status_check CHECK (status IN ('draft','published','cancelled','archived','pending','rejected'));
ALTER TABLE moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_target_type_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_target_type_check CHECK (target_type IN ('info_post','forum_post','comment','alumni_profile','event'));
CREATE OR REPLACE FUNCTION sync_comment_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE forum_posts SET comment_count=(SELECT count(*) FROM comments WHERE forum_post_id=COALESCE(NEW.forum_post_id, OLD.forum_post_id) AND status='approved')
  WHERE id=COALESCE(NEW.forum_post_id, OLD.forum_post_id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_comment_count ON comments;
CREATE TRIGGER trg_comment_count AFTER INSERT OR UPDATE OR DELETE ON comments FOR EACH ROW EXECUTE FUNCTION sync_comment_count();
UPDATE forum_posts p SET comment_count=(SELECT count(*) FROM comments c WHERE c.forum_post_id=p.id AND c.status='approved');
COMMIT;
