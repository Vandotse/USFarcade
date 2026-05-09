BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_display_name_lower_unique ON players (lower(display_name));

COMMIT;

