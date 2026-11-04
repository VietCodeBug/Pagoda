import { verifyNextOutput } from './verify.mjs';

export const onPreBuild = ({ utils }) => {
  if (['true', '1'].includes(process.env.NETLIFY_NEXT_PLUGIN_SKIP)) {
    utils.build.failBuild('Remove NETLIFY_NEXT_PLUGIN_SKIP from Netlify environment variables. This game requires the Next.js adapter for its API routes.');
  }
};

// The preceding Next.js plugin swaps the prepared CDN files into PUBLISH_DIR
// during onPostBuild. Checking here verifies what will actually be uploaded.
export const onPostBuild = async ({ constants, utils }) => {
  const issues = await verifyNextOutput({ projectDir: process.cwd(), publishDir: constants.PUBLISH_DIR });
  if (issues.length) {
    utils.build.failBuild(`Next.js deployment output is incomplete:\n${issues.map((issue) => `- ${issue}`).join('\n')}\nCheck that @netlify/plugin-nextjs ran before this plugin; do not upload .next as static files.`);
    return;
  }
  console.log('Verified Netlify Next.js output: catch-all API function, client bundles and game assets.');
};
