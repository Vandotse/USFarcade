BEGIN;

CREATE TABLE IF NOT EXISTS season_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, code)
);

ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 2;

INSERT INTO seasons (code, title, starts_at, ends_at)
VALUES ('week-001', 'Week 001: Opening Salvo', '2026-05-01T00:00:00Z', '2026-05-08T00:00:00Z')
ON CONFLICT (code) DO NOTHING;

INSERT INTO season_badges (season_id, code, title, description)
SELECT id, 'week-one-contender', 'Week One Contender', 'Submitted at least one score during the first weekly season.'
FROM seasons
WHERE code = 'week-001'
ON CONFLICT (season_id, code) DO NOTHING;

COMMIT;

