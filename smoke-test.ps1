param(
  [string]$Token = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Set-Location $PSScriptRoot

# 1) CONFIGURACION
$BASE_URL = "http://localhost:3000"
$TOKEN = $Token
$DATE_TAG = (Get-Date -Format "yyyyMMdd")

$RECEPTION_NOTE = "SMOKE_IMPORT_TEST_$DATE_TAG"
$RECEPTION_REF = "SMK-REC-$DATE_TAG-001"
$ORDER_NUMBER = "SMK-SO-$DATE_TAG-001"

function Add-Result {
  param(
    [int]$Step,
    [string]$Description,
    [bool]$Ok,
    [string]$Detail = ""
  )
  $script:Results += [pscustomobject]@{
    PASO        = $Step
    DESCRIPCION = $Description
    RESULTADO   = if ($Ok) { "$([char]0x2705)" } else { "$([char]0x274C)" }
    DETALLE     = $Detail
  }
}

function Resolve-Token {
  if (-not [string]::IsNullOrWhiteSpace($script:TOKEN)) {
    return
  }

  if (Test-Path ".env") {
    $envLines = Get-Content ".env" -Encoding UTF8
    foreach ($line in $envLines) {
      if ($line -match "^\s*SMOKE_TOKEN\s*=\s*(.+)\s*$") {
        $script:TOKEN = $Matches[1].Trim().Trim('"')
        break
      }
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($script:TOKEN)) {
    return
  }

  throw "TOKEN no definido. Pasalo con -Token o define SMOKE_TOKEN=... en .env"
}

function Invoke-ImportCsv {
  param(
    [string]$Entity,
    [string]$FilePath
  )
  $raw = & curl.exe -s -X POST "$BASE_URL/api/import/$Entity" -H "Authorization: Bearer $TOKEN" -F "file=@$FilePath"
  if ($LASTEXITCODE -ne 0) {
    throw "curl fallo al importar $Entity"
  }
  if ([string]::IsNullOrWhiteSpace($raw)) {
    throw "Respuesta vacia al importar $Entity"
  }
  try {
    return ($raw | ConvertFrom-Json)
  } catch {
    throw "Respuesta no JSON en import ${Entity}: $raw"
  }
}

function Get-DbState {
  $tmp = Join-Path $PSScriptRoot "tmp-smoke-db-check.js"
  $js = @"
require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'packing_system',
  });
  await c.connect();

  const note = '$RECEPTION_NOTE';
  const order = '$ORDER_NUMBER';

  const rec = await c.query("select count(*)::int as n from receptions where notes = \$1", [note]);
  const recLines = await c.query("select count(*)::int as n from reception_lines rl join receptions r on r.id = rl.reception_id where r.notes = \$1", [note]);
  const recLog = await c.query("select count(*)::int as n from import_logs where entity_key = 'receptions' and total_rows = 3 and inserted >= 1 order by id desc");

  const so = await c.query("select count(*)::int as n from sales_orders where order_number = \$1", [order]);
  const soLines = await c.query("select count(*)::int as n from sales_order_lines sol join sales_orders so on so.id = sol.sales_order_id where so.order_number = \$1", [order]);
  const soFmt = await c.query("select array_agg(pf.format_code order by pf.format_code) as formats from sales_order_lines sol join sales_orders so on so.id = sol.sales_order_id join presentation_formats pf on pf.id = sol.presentation_format_id where so.order_number = \$1", [order]);

  console.log(JSON.stringify({
    receptions_count: rec.rows[0].n,
    reception_lines_count: recLines.rows[0].n,
    import_logs_receptions_count: recLog.rows[0].n,
    sales_orders_count: so.rows[0].n,
    sales_order_lines_count: soLines.rows[0].n,
    sales_order_formats: soFmt.rows[0].formats || []
  }));

  await c.end();
})();
"@
  Set-Content -Path $tmp -Value $js -Encoding UTF8
  try {
    $raw = & node $tmp
    if ($LASTEXITCODE -ne 0) {
      throw "node fallo al consultar BD"
    }
    return ($raw | ConvertFrom-Json)
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
  }
}

function Invoke-Rollback {
  $tmp = Join-Path $PSScriptRoot "tmp-smoke-rollback.js"
  $js = @"
require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'packing_system',
  });
  await c.connect();

  const note = '$RECEPTION_NOTE';
  const order = '$ORDER_NUMBER';

  await c.query('BEGIN');
  await c.query("delete from sales_orders where order_number = \$1", [order]);
  await c.query("delete from raw_material_movements where reception_line_id in (select rl.id from reception_lines rl join receptions r on r.id = rl.reception_id where r.notes = \$1)", [note]);
  await c.query("delete from receptions where notes = \$1", [note]);
  await c.query('COMMIT');

  console.log('ok');
  await c.end();
})();
"@
  Set-Content -Path $tmp -Value $js -Encoding UTF8
  try {
    & node $tmp | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "rollback fallo"
    }
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
  }
}

$Results = @()
$allOk = $true

try {
  Resolve-Token

  $receptionCsv = Join-Path $PSScriptRoot "smoke-receptions.csv"
  $receptionLines = @(
    "received_at,document_number,producer_id,variety_id,gross_weight_lb,net_weight_lb,notes,reference_code,plant_code,mercado_id,lbs_reference,lbs_difference,document_state_id,reception_type_id,weight_basis,quality_intent,reception_reference,species_id,quality_grade_id,returnable_container_id,quantity,gross_lb,tare_lb,net_lb,temperature_f"
    "2026-05-05T13:30:00.000Z,SMK-REC-001,PB,GD,,,$RECEPTION_NOTE,,PINEBLOOM FARMS,USA,,,borrador,hand_picking,net_lb,exportacion,$RECEPTION_REF,,,,,,,,"
    ",,,GD,,,,,,,,,,,,,$RECEPTION_REF,ARA,FB,Lug Blue,60,620,20,600,32"
    ",,,GD,,,,,,,,,,,,,$RECEPTION_REF,ARA,FRESH BERRIES,Lug Blue,45,465,15,450,32"
  )
  Set-Content -Path $receptionCsv -Value $receptionLines -Encoding UTF8

  $salesCsv = Join-Path $PSScriptRoot "smoke-sales-orders.csv"
  $salesLines = @(
    "order_number,cliente_id,requested_pallets,requested_boxes,order_reference,presentation_format_id,unit_price,brand_id,variety_id"
    "$ORDER_NUMBER,ALPINE,,,$ORDER_NUMBER,,,,"
    ",,,600,$ORDER_NUMBER,12x18oz,77.50,,GD"
    ",,,420,$ORDER_NUMBER,PINTA REGULAR,46.00,,FAR"
  )
  Set-Content -Path $salesCsv -Value $salesLines -Encoding UTF8

  # 2) PASO 1 - Import recepciones
  $respRec = Invoke-ImportCsv -Entity "receptions" -FilePath $receptionCsv
  $ok1 = (($respRec.errors | Measure-Object).Count -eq 0 -and [int]$respRec.inserted -eq 1)
  Add-Result 1 "Import recepciones" $ok1 ($respRec | ConvertTo-Json -Depth 5 -Compress)
  if (-not $ok1) { $allOk = $false }

  # 3) PASO 2 - Verify BD recepciones
  $st1 = Get-DbState
  $ok2 = ($st1.receptions_count -eq 1 -and $st1.reception_lines_count -eq 2 -and $st1.import_logs_receptions_count -ge 1)
  Add-Result 2 "Verify BD recep." $ok2 ("receptions=$($st1.receptions_count), lines=$($st1.reception_lines_count), logs=$($st1.import_logs_receptions_count)")
  if (-not $ok2) { $allOk = $false }

  # 4) PASO 3 - Import pedidos
  $respSo = Invoke-ImportCsv -Entity "sales-orders" -FilePath $salesCsv
  $ok3 = (($respSo.errors | Measure-Object).Count -eq 0 -and [int]$respSo.inserted -eq 1)
  Add-Result 3 "Import pedidos" $ok3 ($respSo | ConvertTo-Json -Depth 5 -Compress)
  if (-not $ok3) { $allOk = $false }

  # 5) PASO 4 - Verify BD pedidos
  $st2 = Get-DbState
  $fmt = @($st2.sales_order_formats)
  $hasFmtA = $fmt -contains "12x18oz"
  $hasFmtB = $fmt -contains "PINTA REGULAR"
  $ok4 = ($st2.sales_orders_count -eq 1 -and $st2.sales_order_lines_count -eq 2 -and $hasFmtA -and $hasFmtB)
  Add-Result 4 "Verify BD pedidos" $ok4 ("orders=$($st2.sales_orders_count), lines=$($st2.sales_order_lines_count), formats=$($fmt -join '|')")
  if (-not $ok4) { $allOk = $false }

  # 6) PASO 5 - Rollback
  $ok5 = $true
  try {
    Invoke-Rollback
  } catch {
    $ok5 = $false
  }
  Add-Result 5 "Rollback" $ok5 ""
  if (-not $ok5) { $allOk = $false }

  # 7) PASO 6 - Verify limpio
  $st3 = Get-DbState
  $ok6 = ($st3.receptions_count -eq 0 -and $st3.reception_lines_count -eq 0 -and $st3.sales_orders_count -eq 0 -and $st3.sales_order_lines_count -eq 0)
  Add-Result 6 "Verify limpio" $ok6 ("receptions=$($st3.receptions_count), rec_lines=$($st3.reception_lines_count), orders=$($st3.sales_orders_count), order_lines=$($st3.sales_order_lines_count)")
  if (-not $ok6) { $allOk = $false }
}
catch {
  $allOk = $false
  Add-Result 99 "Script error" $false $_.Exception.Message
}
finally {
  if (Test-Path "smoke-receptions.csv") { Remove-Item "smoke-receptions.csv" -Force }
  if (Test-Path "smoke-sales-orders.csv") { Remove-Item "smoke-sales-orders.csv" -Force }
}

# 7) REPORTE FINAL
Write-Host ""
Write-Host "RESUMEN SMOKE TEST" -ForegroundColor Cyan
$Results | Select-Object PASO, DESCRIPCION, RESULTADO | Format-Table -AutoSize

$fails = @($Results | Where-Object { $_.RESULTADO -eq "$([char]0x274C)" }).Count
if ($allOk -and $fails -eq 0) {
  Write-Host "MODULO LISTO PARA CARGA REAL" -ForegroundColor Green
  exit 0
}

Write-Host "REVISAR ANTES DE CARGAR DATOS" -ForegroundColor Red
exit 1
