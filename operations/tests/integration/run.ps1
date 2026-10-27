param([switch]$ApprovedIsolatedRun)
$ErrorActionPreference = 'Stop'
if (-not $ApprovedIsolatedRun) { throw 'Explicit approval required. This script never starts Docker or creates containers.' }
$container = 'anabhay-ops-review'
$details = & docker inspect $container | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $details.Count -ne 1) { throw 'Approved isolated container not found.' }
$instance = $details[0]
$bindings = @()
if ($null -ne $instance.HostConfig.PortBindings) { $bindings = @($instance.HostConfig.PortBindings.PSObject.Properties | Where-Object MemberType -eq NoteProperty) }
if ($instance.Config.Labels.'anabhay.operations.synthetic' -ne 'true' -or $instance.Config.Image -ne 'postgres:17' -or $instance.HostConfig.NetworkMode -ne 'none' -or $bindings.Count -ne 0 -or -not $instance.State.Running) { throw 'Container isolation gate failed.' }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
function Invoke-Sql([string]$statement) {
 $result = $statement | & docker exec -i $container psql -X -U postgres -v ON_ERROR_STOP=1 -At
 if ($LASTEXITCODE -ne 0) { throw 'Isolated SQL failed. Preserve container for diagnosis; do not retry or repair automatically.' }
 return $result
}
Invoke-Sql (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'bootstrap.sql')) | Out-Null
foreach ($name in @('001_staff_crm.sql','002_ingestion_outbox.sql','003_atomic_ingestion.sql','004_capabilities.sql')) {
 Invoke-Sql (Get-Content -Raw -LiteralPath (Join-Path $repo ('operations/migrations/'+$name))) | Out-Null
}
Invoke-Sql (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'verify.sql')) | Out-Null
Write-Output 'PASS: local synthetic migration/grants/RLS/rollback checks'
# Avoid a fixed-window boundary during short concurrency checks. No clock mocking.
if ((Invoke-Sql "select extract(second from clock_timestamp())<40;") -notcontains 't') { throw 'Too close to rate-window boundary. Preserve container; use reviewed recovery, not blind rerun.' }
$rateSql = "set role ops_ingestion_api; select operations.consume_enquiry_limit(repeat('c',64));"
$rateJobs = 1..8 | ForEach-Object {
 Start-Job -ArgumentList $container,$rateSql -ScriptBlock {
  param($target,$sql)
  $result=$sql | & docker exec -i $target psql -X -U postgres -v ON_ERROR_STOP=1 -At
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic rate race failed.' }
  $result | Where-Object { $_ -in @('t','f') }
 }
}
try {
 $rateJobs | Wait-Job | Out-Null
 if ($rateJobs.State -contains 'Failed') { throw 'Rate race failed.' }
 $limits=@($rateJobs | Receive-Job -ErrorAction Stop)
 if ($limits.Count -ne 8 -or @($limits | Where-Object { $_ -eq 't' }).Count -ne 5) { throw 'Atomic rate enforcement failed or window boundary crossed; inspect, do not repair.' }
} finally { $rateJobs | Remove-Job -Force }
Write-Output 'PASS: eight simultaneous requests, exactly five permitted'
$payload = '{"schemaVersion":1,"fullName":"Synthetic QA","workEmail":"qa@example.invalid","phone":null,"organisation":null,"projectType":"other","description":"synthetic test enquiry","preferredContactMethod":"email","consent":true,"consentVersion":"enquiry-v1","source":"company-website"}'
$raceKey = '30000000-0000-4000-8000-000000000099'
$statement = "set role ops_ingestion_api; select operations.ingest_enquiry('$raceKey',repeat('a',64),'$payload'::jsonb);"
$jobs = 1..2 | ForEach-Object {
 Start-Job -ArgumentList $container,$statement -ScriptBlock {
  param($target,$sql)
  $value = $sql | & docker exec -i $target psql -X -U postgres -v ON_ERROR_STOP=1 -At
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic idempotency race failed.' }
  $value | Where-Object { $_ -like '{*' } | ConvertFrom-Json
 }
}
try {
 $jobs | Wait-Job | Out-Null
 if ($jobs.State -contains 'Failed') { throw 'Race job failed; inspect isolated container.' }
 $receipts = @($jobs | Receive-Job -ErrorAction Stop)
 if ($receipts.Count -ne 2 -or $receipts[0].enquiryId -ne $receipts[1].enquiryId -or @($receipts | Where-Object replayed).Count -ne 1) { throw 'Concurrent durable receipts differ.' }
} finally { $jobs | Remove-Job -Force }
$checks = @"
DO `$`$ BEGIN
 IF (select count(*) from operations.website_enquiries)<>1 OR (select count(*) from operations.leads)<>1 OR (select count(*) from operations.notification_outbox)<>1 THEN RAISE EXCEPTION 'Race inserted duplicates'; END IF;
END `$`$;
set role ops_ingestion_api;
DO `$`$ BEGIN
 IF operations.ingest_enquiry('$raceKey',repeat('b',64),'$payload')->>'conflict'<>'true' THEN RAISE EXCEPTION 'Conflict not detected'; END IF;
END `$`$;
reset role;
set role ops_notification_api;
DO `$`$ DECLARE job jsonb; BEGIN
 job:=operations.claim_notification();
 IF job IS NULL THEN RAISE EXCEPTION 'No queued notification'; END IF;
 BEGIN
  perform operations.accept_notification((job->>'id')::uuid,'00000000-0000-4000-8000-000000000000','synthetic-provider-id');
  RAISE EXCEPTION 'Forged lease accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Invalid notification lease' THEN RAISE; END IF; END;
 BEGIN
  perform operations.accept_notification((job->>'id')::uuid,(job->>'leaseToken')::uuid,null);
  RAISE EXCEPTION 'Missing provider receipt accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Invalid provider receipt' THEN RAISE; END IF; END;
 perform operations.accept_notification((job->>'id')::uuid,(job->>'leaseToken')::uuid,'synthetic-provider-id');
 BEGIN
  perform operations.retry_notification((job->>'id')::uuid,(job->>'leaseToken')::uuid,'timeout');
  RAISE EXCEPTION 'Accepted notification retried';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Invalid notification lease' THEN RAISE; END IF; END;
END `$`$;
reset role;
DO `$`$ BEGIN IF (select count(*) from operations.notification_outbox where state='accepted' and provider_message_id='synthetic-provider-id')<>1 THEN RAISE EXCEPTION 'Acceptance not persisted'; END IF; END `$`$;
"@
# Escape PostgreSQL dollar delimiters for PowerShell interpolation.
Invoke-Sql $checks | Out-Null
Write-Output 'PASS: concurrent same-key receipts, conflict and notification lease checks'
# Two simultaneous different payloads/hashes competing for one NEW key.
$conflictKey='30000000-0000-4000-8000-000000000098'
$conflictJobs=@('a','b') | ForEach-Object {
 $hashChar=$_
 $body=$payload.Replace('Synthetic QA',('Synthetic '+$hashChar))
 $sql="set role ops_ingestion_api; select operations.ingest_enquiry('$conflictKey',repeat('$hashChar',64),'$body'::jsonb);"
 Start-Job -ArgumentList $container,$sql -ScriptBlock {
  param($target,$statement)
  $value=$statement | & docker exec -i $target psql -X -U postgres -v ON_ERROR_STOP=1 -At
  if ($LASTEXITCODE -ne 0) { throw 'Conflicting race failed.' }
  $value | Where-Object { $_ -like '{*' } | ConvertFrom-Json
 }
}
try {
 $conflictJobs | Wait-Job | Out-Null
 if ($conflictJobs.State -contains 'Failed') { throw 'Conflict race failed.' }
 $results=@($conflictJobs | Receive-Job -ErrorAction Stop)
 if ($results.Count -ne 2 -or @($results | Where-Object conflict).Count -ne 1 -or @($results | Where-Object persisted).Count -ne 1) { throw 'Concurrent conflicting request behavior failed.' }
} finally { $conflictJobs | Remove-Job -Force }
Invoke-Sql "DO `$`$ BEGIN IF (select count(*) from operations.website_enquiries)<>2 OR (select count(*) from operations.leads)<>2 OR (select count(*) from operations.notification_outbox)<>2 OR (select count(*) from operations.rate_buckets)>4097 THEN RAISE EXCEPTION 'Unexpected durable counts'; END IF; END `$`$;" | Out-Null
Write-Output 'PASS: simultaneous conflicting payloads produce one receipt and one conflict'
Write-Output 'Synthetic race fixture remains in isolated container. No hosted Auth/API or delivery claim.'
