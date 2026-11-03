import '../src/env.js';
import { runQuery } from '../src/posthog.js';
import { isoDate, outcomeWindows, shift } from '../src/growth-outcomes.js';
import { mondayOf } from '../src/ai-referrals.js';
import {writeFile} from 'node:fs/promises';
const weekStart=process.argv.find(value=>value.startsWith('--week-start='))?.slice('--week-start='.length) ?? shift(isoDate(mondayOf(new Date())),-7);
const validated=outcomeWindows(weekStart);
const requestedDays=Number(process.argv.find(value=>value.startsWith('--cohort-days='))?.slice('--cohort-days='.length) ?? 6);
if(!Number.isInteger(requestedDays)||requestedDays<1||requestedDays>7)throw new Error('--cohort-days must be between 1 and 7');
const currentEnd=[shift(weekStart,requestedDays-1),validated.activation.current.end].sort()[0];
const previousStart=shift(weekStart,-7),previousEnd=shift(currentEnd,-7);
const until=shift(currentEnd,2)+' 00:00:00';
const base=`WITH installs AS (
 SELECT properties.anonymous_install_id AS iid, min(timestamp) AS installed,
 argMin(toString(properties.extension_version), timestamp) AS install_version
 FROM events WHERE event='extension_installed'
 AND timestamp >= toDateTime('${previousStart} 00:00:00','UTC') AND timestamp < toDateTime('${shift(currentEnd,1)} 00:00:00','UTC')
 AND properties.anonymous_install_id IS NOT NULL AND properties.anonymous_install_id != ''
 GROUP BY iid
), internal_ids AS (
 SELECT DISTINCT properties.anonymous_install_id AS iid FROM events
 WHERE timestamp >= toDateTime('${previousStart} 00:00:00','UTC') AND timestamp < toDateTime('${until}','UTC')
 AND toString(properties.is_internal)='true'
), cohort AS (
 SELECT iid, installed, install_version,
 if(installed < toDateTime('${weekStart} 00:00:00','UTC'),'previous','current') AS period
 FROM installs WHERE iid NOT IN (SELECT iid FROM internal_ids)
 AND NOT (installed >= toDateTime('${shift(previousEnd,1)} 00:00:00','UTC') AND installed < toDateTime('${weekStart} 00:00:00','UTC'))
), observations AS (
 SELECT i.iid, i.installed, i.install_version, i.period, e.event, e.ts,
 e.result_count, e.platform_source, e.running_version, e.reason, e.status, e.failed, e.indexed, e.conversations_indexed, e.surface, e.source
 FROM cohort i LEFT JOIN (
 SELECT properties.anonymous_install_id AS iid, timestamp AS ts, event,
 properties.result_count AS result_count, properties.platform_source AS platform_source,
 properties.extension_version AS running_version, properties.reason AS reason,
 properties.status AS status, properties.failed AS failed, properties.indexed AS indexed,
 properties.conversations_indexed AS conversations_indexed, properties.surface AS surface, properties.source AS source
 FROM events WHERE timestamp >= toDateTime('${previousStart} 00:00:00','UTC') AND timestamp < toDateTime('${until}','UTC')
 ) e ON i.iid=e.iid
 WHERE e.ts >= i.installed AND e.ts < i.installed + INTERVAL 24 HOUR
)`;
const queries={
 versions:base+`SELECT period, install_version, count(), countIf(started>0), countIf(imported>0), countIf(searched>0), countIf(positive>0), countIf(invited>0), countIf(clicked>0), countIf(palette>0)
 FROM (SELECT period,install_version,iid,countIf(event='backfill_started') AS started,countIf(event='backfill_first_completed') AS imported,countIf(event='search_submitted') AS searched,countIf(event='search_submitted' AND toFloat(result_count)>0) AS positive,countIf(event='search_ready_popup_shown') AS invited,countIf(event='search_ready_popup_cta_clicked') AS clicked,countIf(event='search_ready_palette_opened') AS palette FROM observations GROUP BY period,install_version,iid)
 GROUP BY period,install_version ORDER BY period,install_version`,
 platforms:base+`SELECT period,coalesce(nullIf(toString(platform_source),''),'(unknown)') AS platform,event,uniq(iid),count(),sum(toFloat(failed)),sum(toFloat(indexed)),sum(toFloat(conversations_indexed)) FROM observations WHERE event IN ('backfill_started','backfill_completed','backfill_first_completed','backfill_cancelled','backfill_endpoint_error','backfill_extract_error','backfill_discovery_truncated','backfill_auth_missing') GROUP BY period,platform,event ORDER BY period,platform,event`,
 errors:base+`SELECT period,coalesce(nullIf(toString(platform_source),''),'(unknown)') AS platform, toString(running_version) AS running_version,event,toString(reason),toString(status),uniq(iid),count() FROM observations WHERE event IN ('backfill_endpoint_error','backfill_extract_error','backfill_cancelled','backfill_discovery_truncated','backfill_auth_missing') GROUP BY period,platform,running_version,event,toString(reason),toString(status) ORDER BY period,uniq(iid) DESC LIMIT 100`,
 suggestions:base+`SELECT period,event,toString(surface),toString(source),uniq(iid),count() FROM observations WHERE event IN ('search_suggestion_shown','search_suggestion_clicked','search_ready_palette_opened','search_submitted','backfill_started') GROUP BY period,event,toString(surface),toString(source) ORDER BY period,event,uniq(iid) DESC`,
 character_concentration:base+`SELECT period,count(),countIf(character_started>0),countIf(character_started>0 AND imported=0),countIf(character_started=0 AND imported=0),countIf(character_started>0 AND imported>0),countIf(character_started>0 AND positive>0),countIf(character_started=0 AND positive>0),countIf(character_denied>0),countIf(character_denied>0 AND imported=0),countIf(character_denied>0 AND positive>0)
 FROM (SELECT period,iid,countIf(event='backfill_started' AND toString(platform_source)='character_ai') AS character_started,countIf(event='backfill_first_completed') AS imported,countIf(event='search_submitted' AND toFloat(result_count)>0) AS positive,countIf(event='backfill_endpoint_error' AND toString(platform_source)='character_ai' AND toString(status)='403') AS character_denied FROM observations GROUP BY period,iid) GROUP BY period ORDER BY period`,
 ordered:base+`SELECT period,count(),countIf(started>0),countIf(imported>0),countIf(started>0 AND imported=0),countIf(clicked>0),countIf(palette>0),countIf(clicked>0 AND palette>0),countIf(clicked>0 AND searched>0),countIf(clicked>0 AND positive>0),countIf(clicked>0 AND searched>0 AND first_search>=click_ts),countIf(clicked>0 AND positive>0 AND first_positive>=click_ts),countIf(imported>0 AND searched=0),countIf(imported>0 AND positive=0),countIf(searched>0),countIf(positive>0)
 FROM (SELECT period,iid,countIf(event='backfill_started') AS started,countIf(event='backfill_first_completed') AS imported,countIf(event='search_ready_popup_cta_clicked') AS clicked,countIf(event='search_ready_palette_opened') AS palette,countIf(event='search_submitted') AS searched,countIf(event='search_submitted' AND toFloat(result_count)>0) AS positive,minIf(ts,event='search_ready_popup_cta_clicked') AS click_ts,minIf(ts,event='search_submitted') AS first_search,minIf(ts,event='search_submitted' AND toFloat(result_count)>0) AS first_positive FROM observations GROUP BY period,iid) GROUP BY period ORDER BY period`
};
const out={generated_at:new Date().toISOString(),windows:{previous:{start:previousStart,end:previousEnd},current:{start:weekStart,end:currentEnd}},definitions:{unit:'Unique anonymous installation IDs, internal flags excluded. Counts only for version cells below 30.',platforms:'Platform rows overlap across installs. Never sum them into the installation denominator.',ordering:'First submitted/positive search timestamps at or after the first invitation click. Overlap counts are also retained, and are not a strict query-to-open identity join.',limitations:'Install version can differ from running version after an update. Failed imports can still save searchable partial content. The first-completed event is not proof of complete account coverage. Aggregate error events may repeat for the same install.'},results:{},errors:[]};
const columns={versions:['period','install_version','installs','started','first_completed','searched','positive_search','invited','clicked','palette_opened'],platforms:['period','platform','event','installs','events','failed','indexed','conversations_indexed'],errors:['period','platform','running_version','event','reason','status','installs','events'],suggestions:['period','event','surface','source','installs','events'],character_concentration:['period','installs','character_started','character_started_no_completion','other_no_completion','character_started_any_completion','character_started_positive_search','other_positive_search','character_denied','character_denied_no_completion','character_denied_positive_search'],ordered:['period','installs','started','imported','started_no_completion','clicked','palette_opened','clicked_and_palette','clicked_and_searched','clicked_and_positive','first_search_after_first_click','first_positive_after_first_click','imported_no_search','imported_no_positive_search','searched','positive_search']};
const requested=process.argv.filter(value=>value.startsWith('--query=')).map(value=>value.slice('--query='.length));
if(requested.some(name=>!Object.hasOwn(queries,name)))throw new Error('Unknown diagnosis query');
for(const [name,query] of Object.entries(queries).filter(([name])=>!requested.length||requested.includes(name))){
 try { const rows=await runQuery(query); if(rows.some(row=>row.length!==columns[name].length))throw new Error('Unexpected response shape'); out.results[name]={columns:columns[name],rows}; }
 catch(error){out.errors.push({query:name,message:error instanceof Error?error.message:'Query failed'});}
}
const output=process.argv.find(value=>value.startsWith('--output='))?.slice('--output='.length) ?? '.insights/activation-diagnosis.json';
await writeFile(output,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
if(out.errors.length)process.exitCode=1;
