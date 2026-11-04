-- Repair databases initialized by an unguarded generated baseline without changing player data.
-- A legacy row outside these limits must be corrected explicitly; never silently rewrite it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vto_prayers'::regclass AND conname = 'vto_prayers_player_id_vto_players_id_fk'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vto_prayers'::regclass AND conname = 'vto_prayers_player_id_fkey'
  ) THEN
    ALTER TABLE public.vto_prayers
      RENAME CONSTRAINT vto_prayers_player_id_vto_players_id_fk TO vto_prayers_player_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vto_players'::regclass AND conname = 'vto_players_avatar_range'
  ) THEN
    ALTER TABLE public.vto_players
      ADD CONSTRAINT vto_players_avatar_range CHECK (avatar >= 0 AND avatar <= 3);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vto_prayers'::regclass AND conname = 'vto_prayer_length'
  ) THEN
    ALTER TABLE public.vto_prayers
      ADD CONSTRAINT vto_prayer_length CHECK (length(text) BETWEEN 1 AND 500);
  END IF;
END
$$;
