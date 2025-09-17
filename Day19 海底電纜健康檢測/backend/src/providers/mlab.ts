import { CONFIG } from '../config.js';
async function getBigQuery(){ try{ const mod=await import('@google-cloud/bigquery'); const { BigQuery }=mod as any; const options:any={}; if(CONFIG.GCP_PROJECT_ID) options.projectId=CONFIG.GCP_PROJECT_ID; return new BigQuery(options);} catch(e){ throw new Error('BigQuery client not installed. Run scripts\\enable-mlab.bat.'); } }
export async function queryMlabSummary(params:{country:string;days:number}){ const bq=await getBigQuery(); const days=params.days??7; const country=params.country??'TW'; const sql=`
WITH base AS (
  SELECT TIMESTAMP_TRUNC(ts, HOUR) AS hour_ts, SAFE_CAST(download AS FLOAT64) AS download_bps,
         SAFE_CAST(upload AS FLOAT64) AS upload_bps, SAFE_CAST(min_rtt AS FLOAT64) AS min_rtt_ms,
         client.Geo.country_code AS country
  FROM \`measurement-lab.ndt.unified_downloads\`
  WHERE client.Geo.country_code=@country AND ts>=TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
),
up AS (
  SELECT TIMESTAMP_TRUNC(ts, HOUR) AS hour_ts, SAFE_CAST(upload AS FLOAT64) AS upload_bps
  FROM \`measurement-lab.ndt.unified_uploads\`
  WHERE client.Geo.country_code=@country AND ts>=TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
)
SELECT b.hour_ts,
  APPROX_QUANTILES(b.download_bps,100)[OFFSET(50)] AS p50_down_bps,
  APPROX_QUANTILES(b.download_bps,100)[OFFSET(90)] AS p90_down_bps,
  APPROX_QUANTILES(u.upload_bps,100)[OFFSET(50)] AS p50_up_bps
FROM base b JOIN up u USING (hour_ts) GROUP BY b.hour_ts ORDER BY b.hour_ts ASC`; // @ts-ignore
 const [rows]=await bq.query({ query: sql, params:{ country, days } }); return rows; }