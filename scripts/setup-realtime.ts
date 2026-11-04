/** Read-only Realtime configuration/probe. Never prints secrets or capabilities. */
import { config } from 'dotenv';
import { createRealtime, rawSql } from '@neon/realtime/server';
import { neonRealtimeConfig, RealtimeConfigurationError } from '../src/lib/server/neon-realtime-config';
import { PUBLIC_PRAYERS_SQL, type PublicPrayer } from '../src/lib/prayer-stream';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });

async function main() {
  let settings;
  try { settings = neonRealtimeConfig(process.env); }
  catch (error) {
    console.log(JSON.stringify({ configured: false, missing: error instanceof RealtimeConfigurationError ? error.missing : ['valid Realtime configuration'] }));
    console.log('Copy NEON_REALTIME_URL and NEON_REALTIME_SECRET from Neon Console > Postgres > Realtime into .env.local. This is separate from Neon Auth.');
    process.exitCode = 2;
    return;
  }
  let realtime;
  try {
    realtime = createRealtime({ secret: settings.secret, db: settings.database, url: settings.url, debugMode: false, logLevel: 'silent' });
    // Validate the SDK secret format and local capability creation even without network probing.
    await realtime.seal({ query: rawSql<PublicPrayer>(PUBLIC_PRAYERS_SQL) });
    console.log(JSON.stringify({ configured: true, host: new URL(settings.url).hostname, database: settings.database, mode: process.argv.includes('--probe') ? 'live-probe' : 'configuration-check' }));
    if (process.argv.includes('--probe')) {
      const subscription = await realtime.subscribe(rawSql<PublicPrayer>(PUBLIC_PRAYERS_SQL));
      try {
        await subscription.awaitRows(() => true, 20_000);
        const snapshot = subscription.getSnapshot();
        console.log(JSON.stringify({ connected: snapshot.status === 'live', status: snapshot.status, publicRows: snapshot.data?.length ?? 0 }));
        if (snapshot.status !== 'live') process.exitCode = 1;
      } finally { subscription.unsubscribe(); }
    }
  } catch {
    console.log(JSON.stringify({ connected: false, error: 'Realtime validation failed. Check the dedicated secret, enabled branch, endpoint and allowed origins.' }));
    process.exitCode = 1;
  } finally { realtime?.close(); }
}

void main();
