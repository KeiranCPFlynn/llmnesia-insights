/**
 * Lists registered Custom Dimensions and Custom Metrics on the GA4 website
 * property, so we can confirm none of our standard event params (install_click,
 * how_it_works_click, etc.) are mistakenly registered as custom definitions.
 *
 * Uses the GA4 Admin REST API directly (no extra npm dep). The same service
 * account used for the Data API has read access to admin resources too.
 */
import '../src/env.js';
import { GoogleAuth } from 'google-auth-library';

async function main(): Promise<void> {
  const propertyId = process.env.GA4_PROPERTY_ID_WEBSITE;
  if (!propertyId) throw new Error('GA4_PROPERTY_ID_WEBSITE is required');

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  if (!token) throw new Error('failed to mint access token');

  const headers = { Authorization: `Bearer ${token}` };
  const base = `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}`;

  const [dimsRes, metricsRes] = await Promise.all([
    fetch(`${base}/customDimensions`, { headers }),
    fetch(`${base}/customMetrics`, { headers }),
  ]);

  if (!dimsRes.ok) throw new Error(`customDimensions ${dimsRes.status}: ${await dimsRes.text()}`);
  if (!metricsRes.ok) throw new Error(`customMetrics ${metricsRes.status}: ${await metricsRes.text()}`);

  const dims = (await dimsRes.json()) as {
    customDimensions?: Array<{
      parameterName?: string;
      displayName?: string;
      scope?: string;
      description?: string;
      disallowAdsPersonalization?: boolean;
    }>;
  };
  const metrics = (await metricsRes.json()) as {
    customMetrics?: Array<{
      parameterName?: string;
      displayName?: string;
      scope?: string;
      measurementUnit?: string;
    }>;
  };

  console.log(`GA4 property ${propertyId} — Custom definitions\n`);

  console.log('=== Custom Dimensions ===');
  if (!dims.customDimensions || dims.customDimensions.length === 0) {
    console.log('  (none registered)');
  } else {
    for (const d of dims.customDimensions) {
      console.log(`  - parameterName: ${d.parameterName}`);
      console.log(`    displayName:   ${d.displayName}`);
      console.log(`    scope:         ${d.scope}`);
      if (d.description) console.log(`    description:   ${d.description}`);
    }
  }

  console.log('\n=== Custom Metrics ===');
  if (!metrics.customMetrics || metrics.customMetrics.length === 0) {
    console.log('  (none registered)');
  } else {
    for (const m of metrics.customMetrics) {
      console.log(`  - parameterName: ${m.parameterName}`);
      console.log(`    displayName:   ${m.displayName}`);
      console.log(`    scope:         ${m.scope}`);
      console.log(`    unit:          ${m.measurementUnit}`);
    }
  }

  // Flag any of our known event names that are mistakenly registered as custom dims.
  const ourEventNames = new Set([
    'page_view',
    'install_click',
    'how_it_works_click',
    'email_signup',
    'contact_submit',
  ]);
  const ourParams = new Set(['page_path', 'content_group']);
  const collisions = (dims.customDimensions ?? []).filter(
    (d) => ourEventNames.has(d.parameterName ?? '') || ourParams.has(d.parameterName ?? ''),
  );
  console.log('\n=== Collisions with our standard events/params ===');
  if (collisions.length === 0) {
    console.log('  None — our event names and params are NOT registered as custom dimensions. Good.');
  } else {
    console.log('  Found unexpected custom-dim entries:');
    for (const c of collisions) {
      console.log(`    - ${c.parameterName} ("${c.displayName}")`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
