-- The Data API may read the public projection, never guest profiles/private prayers.
CREATE OR REPLACE VIEW public.vto_public_prayers WITH (security_barrier = true) AS
SELECT id, name, text, created_at AS "createdAt"
FROM public.vto_prayers WHERE is_public = true;
REVOKE ALL ON public.vto_players, public.vto_prayers FROM anonymous, authenticated;
GRANT USAGE ON SCHEMA public TO anonymous, authenticated;
GRANT SELECT ON public.vto_public_prayers TO anonymous, authenticated;
NOTIFY pgrst, 'reload schema';
