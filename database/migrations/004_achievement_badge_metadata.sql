BEGIN;

ALTER TABLE achievements
  ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'award',
  ADD COLUMN IF NOT EXISTS rarity TEXT NOT NULL DEFAULT 'bronze';

INSERT INTO achievements (code, title, description, game_slug, icon, rarity)
VALUES
  ('sub-250', 'Sub 250 Club', 'Submit a reaction time under 250 ms.', 'reaction-speed', 'zap', 'gold'),
  ('perfect-grid', 'Perfect Grid', 'Complete Memory Match in 12 moves or fewer.', 'memory-match', 'brain', 'silver')
ON CONFLICT (code) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    game_slug = EXCLUDED.game_slug,
    icon = EXCLUDED.icon,
    rarity = EXCLUDED.rarity;

COMMIT;
