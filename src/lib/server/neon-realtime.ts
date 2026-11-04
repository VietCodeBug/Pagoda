import 'server-only';
import { createRealtime, rawSql } from '@neon/realtime/server';
import { PUBLIC_PRAYERS_SQL, type PublicPrayer } from '../prayer-stream';
import { neonRealtimeConfig } from './neon-realtime-config';

/** A short capability for this exact public SELECT; no database credentials leave the server. */
export async function sealPublicPrayers() {
  const config = neonRealtimeConfig(process.env);
  const realtime = createRealtime({ secret: config.secret, db: config.database, debugMode: false });
  const sealedQuery = await realtime.seal({ query: rawSql<PublicPrayer>(PUBLIC_PRAYERS_SQL) });
  return { url: config.url, sealedQuery };
}
