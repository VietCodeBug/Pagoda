-- Regression fixture: the generated baseline proposed by PR #1.
-- It deliberately has no avatar/text CHECK constraints.
CREATE TABLE vto_players (
  id uuid PRIMARY KEY NOT NULL,
  name varchar(24) NOT NULL,
  avatar integer DEFAULT 0 NOT NULL,
  merit integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE vto_prayers (
  id uuid PRIMARY KEY NOT NULL,
  player_id uuid NOT NULL,
  name varchar(24) NOT NULL,
  text text NOT NULL,
  is_public boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE vto_prayers ADD CONSTRAINT vto_prayers_player_id_vto_players_id_fk
  FOREIGN KEY (player_id) REFERENCES public.vto_players(id);
CREATE INDEX vto_prayers_public_date ON vto_prayers(is_public, created_at);
CREATE INDEX vto_prayers_player_date ON vto_prayers(player_id, created_at);
