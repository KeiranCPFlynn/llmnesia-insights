import '../src/env.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { OAuth2Client } from 'google-auth-library';
import { mondayOf } from '../src/ai-referrals.js';
import { isoDate, outcomeCounts, outcomeQuery, outcomeWindows, shift } from '../src/growth-outcomes.js';
import { runQuery } from '../src/posthog.js';

const now=new Date();
const startArg=process.argv.find(v=>v.startsWith('--week-start='))?.slice('--week-start='.length);
const start=startArg ?? shift(isoDate(mondayOf(now)),-7);
const windows=outcomeWindows(start,now);
const service=new BetaAnalyticsDataClient(process.env.GOOGLE_CREDENTIALS_JSON ? {credentials:JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)} : {});
const host={filter:{fieldName:'hostName',inListFilter:{values:['llmnesia.com','www.llmnesia.com']}}};
const output: Record<string,unknown>={generated_at:now.toISOString(),windows,definitions:{
  website:'Production-host GA4 sessions and install_click events. Clicks can repeat and are not confirmed installs.',
  store:'Chrome Web Store GA4 install events and users, when the existing OAuth connection is available. Separate population, not joined to website visitors.',
  activation:'Unique non-internal anonymous_install_id cohorts; any intentional search within 24h. Positive-result search is a separate outcome, not a replacement for the existing activation definition.',
  success:'search_submitted with result_count > 0 within 24h. Search-origin result opens are reported separately; query-level linkage is unavailable.',
  content:'Import completion or capture is only an availability proxy, not proof an index is ready. A positive-result search is direct evidence search worked.',
  return:'Among first-day searchers, another submitted search 24 to 168 hours after install. Only fully mature cohorts; counts retained and rates suppressed below 30 in their denominator.',
  attribution:'Website, store and PostHog populations are separate. No cross-device or source-to-activation identity join is claimed.',
}};
const failures:string[]=[];

for(const [label,window] of Object.entries(windows.acquisition)) {
  try {
    if(!process.env.GA4_PROPERTY_ID_WEBSITE) throw new Error('Website GA4 property is not configured');
    const property=`properties/${process.env.GA4_PROPERTY_ID_WEBSITE}`;
    const dateRanges=[{startDate:window.start,endDate:window.end}];
    const [sessions]=await service.runReport({property,dateRanges,dimensionFilter:host,metrics:[{name:'sessions'}]});
    const [clicks]=await service.runReport({property,dateRanges,dimensions:[{name:'sessionSource'}],metrics:[{name:'eventCount'}],dimensionFilter:{andGroup:{expressions:[host,{filter:{fieldName:'eventName',stringFilter:{value:'install_click',matchType:'EXACT'}}}]}},limit:10000});
    if((clicks.rowCount??0)>(clicks.rows?.length??0)) throw new Error('GA4 click report is incomplete');
    const bySource=Object.fromEntries((clicks.rows??[]).map(r=>[r.dimensionValues?.[0]?.value??'(unknown)',Number(r.metricValues?.[0]?.value??0)]));
    output[`website_${label}`]={status:'verified',window,sessions:Number(sessions.rows?.[0]?.metricValues?.[0]?.value??0),install_click_events:Object.values(bySource).reduce((a,b)=>a+b,0),install_click_events_by_source:bySource,metadata:clicks.metadata};
  } catch(error) { failures.push(`website_${label}`);output[`website_${label}`]={status:'unverified',reason:error instanceof Error?error.message:'Query failed'}; }
}

const storeReady=['GA4_PROPERTY_ID_EXTENSION','GA4_OAUTH_CLIENT_ID','GA4_OAUTH_CLIENT_SECRET','GA4_OAUTH_REFRESH_TOKEN'].every(k=>process.env[k]);
if(storeReady) {
  const authClient=new OAuth2Client({clientId:process.env.GA4_OAUTH_CLIENT_ID,clientSecret:process.env.GA4_OAUTH_CLIENT_SECRET});
  authClient.setCredentials({refresh_token:process.env.GA4_OAUTH_REFRESH_TOKEN});
  const client=new BetaAnalyticsDataClient({authClient:authClient as never});
  for(const [label,window] of Object.entries(windows.acquisition)) {
    try {
      const [r]=await client.runReport({property:`properties/${process.env.GA4_PROPERTY_ID_EXTENSION}`,dateRanges:[{startDate:window.start,endDate:window.end}],metrics:[{name:'eventCount'},{name:'totalUsers'}],dimensionFilter:{filter:{fieldName:'eventName',stringFilter:{value:'install',matchType:'EXACT'}}}});
      output[`store_${label}`]={status:'verified',window,install_events:Number(r.rows?.[0]?.metricValues?.[0]?.value??0),install_users:Number(r.rows?.[0]?.metricValues?.[1]?.value??0),metadata:r.metadata};
    } catch(error) { failures.push(`store_${label}`);output[`store_${label}`]={status:'unverified',reason:error instanceof Error?error.message:'Query failed'}; }
  }
} else { failures.push('store');output.store={status:'unverified',reason:'Existing store OAuth connection is not configured'}; }

for(const kind of ['activation','retention'] as const) {
  for(const label of ['current','previous'] as const) {
    const window=windows[kind][label];
    try {
      const rows=await runQuery(outcomeQuery(window.start,window.end));
      const [quality]=await runQuery(`SELECT count(), countIf(properties.anonymous_install_id IS NULL OR properties.anonymous_install_id = '') FROM events WHERE event = 'extension_installed' AND timestamp >= toDateTime('${window.start} 00:00:00', 'UTC') AND timestamp < toDateTime('${shift(window.end,1)} 00:00:00', 'UTC')`);
      if(!quality)throw new Error('Install ID coverage query returned no result');
      output[`${kind}_${label}`]={status:'verified',window,...outcomeCounts(rows[0],kind==='retention'?7:1),install_events_total:Number(quality[0]),install_events_missing_id:Number(quality[1])};
    } catch(error) {failures.push(`${kind}_${label}`);output[`${kind}_${label}`]={status:'unverified',window,reason:error instanceof Error?error.message:'Query failed'};}
  }
}
output.status=failures.length?'partial':'complete';
output.unverified=failures;
const target=path.resolve(process.cwd(),process.argv.find(v=>v.startsWith('--output='))?.slice('--output='.length)??'.insights/growth-outcomes.json');
await mkdir(path.dirname(target),{recursive:true});
await writeFile(target,JSON.stringify(output,null,2)+'\n');
const evidence=(key:string)=>output[key] as Record<string,unknown> | undefined;
const lines=['# Growth outcomes', '',`Generated ${now.toISOString()}. Read-only evidence, no Insights review published.`,''];
for(const [section,currentKey,previousKey,metrics] of [
  ['Website','website_current','website_previous',['sessions','install_click_events']],
  ['Chrome Web Store','store_current','store_previous',['install_events','install_users']],
  ['Mature 24-hour install cohorts','activation_current','activation_previous',['external_installs','intentional_search_24h','search_with_results_24h','intentional_search_rate_24h','search_with_results_rate_24h','result_open_origin_unknown_installs']],
  ['Mature seven-day return cohorts','retention_current','retention_previous',['intentional_search_24h','returned_after_first_day','return_rate_among_first_day_searchers']],
] as const) {
  const current=evidence(currentKey),previous=evidence(previousKey);
  lines.push(`## ${section}`,'');
  if(current?.status!=='verified'||previous?.status!=='verified') {lines.push('Comparison unverified. See the JSON report for the failing source.','');continue;}
  lines.push(`Previous: ${JSON.stringify(previous.window)}. Current: ${JSON.stringify(current.window)}.`, '', '| Measure | Previous | Current |', '| --- | ---: | ---: |');
  for(const metric of metrics) lines.push(`| ${metric.replaceAll('_',' ')} | ${previous[metric] ?? 'Unavailable'} | ${current[metric] ?? 'Unavailable'} |`);
  lines.push('');
}
lines.push('## Interpretation and next action','',
  'Prioritize the number and share of mature new installs that get search results, then return. Read these alongside store installs to separate acquisition from activation. Observational changes do not establish which product change caused them.', '',
  'Keep website clicks, store installs and extension install cohorts separate; they are different populations and time zones. There is no source-to-activation identity join. Content/import events do not prove indexing. Result opens with unknown origin are exposed, and their rate is unavailable rather than a false zero. Seven-day return uses an older cohort. Rates below 30 in their denominator are suppressed.', '',
  `Omitted immature installation dates: ${windows.activation.omitted_install_dates.join(', ') || 'none'}.`, '',
  'For acquisition losses, inspect the referral report and matched Bing/Google page evidence. Compare affected pages against their intervention baseline once the pages are actually published, and assess several completed weeks.');
const markdownTarget=target.replace(/\.json$/,'')+'.md';
await writeFile(markdownTarget,lines.join('\n')+'\n');
console.log(lines.join('\n'));
console.log(`Wrote ${target}`);
console.log(`Wrote ${markdownTarget}`);
if(failures.length)process.exitCode=1;
