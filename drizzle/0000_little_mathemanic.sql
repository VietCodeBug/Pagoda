CREATE TABLE "vto_players" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(24) NOT NULL,
	"avatar" integer DEFAULT 0 NOT NULL,
	"merit" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vto_prayers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"player_id" uuid NOT NULL,
	"name" varchar(24) NOT NULL,
	"text" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vto_prayers" ADD CONSTRAINT "vto_prayers_player_id_vto_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."vto_players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vto_prayers_public_date" ON "vto_prayers" USING btree ("is_public","created_at");--> statement-breakpoint
CREATE INDEX "vto_prayers_player_date" ON "vto_prayers" USING btree ("player_id","created_at");