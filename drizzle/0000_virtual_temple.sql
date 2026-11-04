-- Additive and namespaced: these tables do not touch existing application data.
CREATE TABLE IF NOT EXISTS vto_players (
  id uuid PRIMARY KEY,
  name varchar(24) NOT NULL,
  avatar integer NOT NULL DEFAULT 0,
  merit integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vto_players_avatar_range CHECK (avatar >= 0 AND avatar <= 3)
);
CREATE TABLE IF NOT EXISTS vto_prayers (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES vto_players(id),
  name varchar(24) NOT NULL,
  text text NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vto_prayer_length CHECK (length(text) BETWEEN 1 AND 500)
);
CREATE INDEX IF NOT EXISTS vto_prayers_public_date ON vto_prayers(is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS vto_prayers_player_date ON vto_prayers(player_id, created_at DESC);
