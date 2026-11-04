-- Additive game data; rerunning does not reset progress.
CREATE TABLE IF NOT EXISTS "vto_activity_scores" (
	"player_id" uuid NOT NULL CONSTRAINT "vto_activity_scores_player_id_vto_players_id_fk" REFERENCES "public"."vto_players"("id"),
	"mode" varchar(24) NOT NULL,
	"plays" integer DEFAULT 0 NOT NULL,
	"best_score" integer DEFAULT 0 NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "vto_activity_scores_player_id_mode_pk" PRIMARY KEY("player_id","mode"),
	CONSTRAINT "vto_activity_scores_nonnegative" CHECK ("vto_activity_scores"."plays" >= 0 AND "vto_activity_scores"."best_score" >= 0 AND "vto_activity_scores"."total_score" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vto_fish_collection" (
	"player_id" uuid NOT NULL CONSTRAINT "vto_fish_collection_player_id_vto_players_id_fk" REFERENCES "public"."vto_players"("id"),
	"species_id" varchar(40) NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"best_size" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "vto_fish_collection_player_id_species_id_pk" PRIMARY KEY("player_id","species_id"),
	CONSTRAINT "vto_fish_collection_nonnegative" CHECK ("vto_fish_collection"."amount" >= 0 AND "vto_fish_collection"."best_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vto_game_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"player_id" uuid NOT NULL CONSTRAINT "vto_game_claims_player_id_vto_players_id_fk" REFERENCES "public"."vto_players"("id"),
	"mode" varchar(24) NOT NULL,
	"reward" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vto_game_wallets" (
	"player_id" uuid PRIMARY KEY NOT NULL CONSTRAINT "vto_game_wallets_player_id_vto_players_id_fk" REFERENCES "public"."vto_players"("id"),
	"coins" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vto_game_wallet_nonnegative" CHECK ("vto_game_wallets"."coins" >= 0 AND "vto_game_wallets"."xp" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vto_game_claims_player_date" ON "vto_game_claims" USING btree ("player_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
REVOKE ALL ON vto_activity_scores,vto_fish_collection,vto_game_claims,vto_game_wallets FROM anonymous,authenticated;
