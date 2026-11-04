-- The Data API may read the public projection, never guest profiles/private prayers.
CREATE OR REPLACE VIEW public.vto_public_prayers WITH (security_barrier = true) AS
SELECT id, name, text, created_at AS "createdAt"
FROM public.vto_prayers WHERE is_public = true;
--> statement-breakpoint
REVOKE ALL ON public.vto_players, public.vto_prayers FROM anonymous, authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO anonymous, authenticated;
--> statement-breakpoint
GRANT SELECT ON public.vto_public_prayers TO anonymous, authenticated;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
