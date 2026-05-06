#!/usr/bin/env pwsh
<#
  Restaura un dump formato custom (-F c) en Railway usando `docker run postgres:16-alpine pg_restore`
  (útil cuando no instalaste pg_restore en Windows).

  En Railway → Postgres → Connect → DATABASE_URL copialo integramente.

  Uso desde la raíz del repo:

    $env:RAILWAY_DATABASE_URL = 'postgresql://...'
    .\scripts\restore-db-to-railway.ps1

    Con dump explícito y limpiar objetos antes (BD ya existe con esquema):
    .\scripts\restore-db-to-railway.ps1 -DumpPath .\backup_local_completo.dump -Clean
#>
param(
  [string] $DatabaseUrl = $env:RAILWAY_DATABASE_URL,
  [string] $DumpPath,
  [switch] $Clean
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "Definí -DatabaseUrl o `$env:RAILWAY_DATABASE_URL (copiá DATABASE_URL desde Railway)."
}

if ([string]::IsNullOrWhiteSpace($DumpPath)) {
  $DumpPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "backup_local_completo.dump"
}
$dumpFull = (Resolve-Path -LiteralPath $DumpPath).Path
if (-not (Test-Path -LiteralPath $dumpFull)) {
  throw "No existe el dump: $DumpPath"
}

$m = [regex]::Match(
  $DatabaseUrl.Trim(),
  '^postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/([^?]+)'
)
if (-not $m.Success) {
  throw "DATABASE_URL debe ser postgresql://user:pass@host:port/dbname (query params opcionales al final)."
}

$user = $m.Groups[1].Value
$passEnc = $m.Groups[2].Value
$hostPg = $m.Groups[3].Value
$portPg = if ($m.Groups[4].Success) { $m.Groups[4].Value } else { "5432" }
$dbName = $m.Groups[5].Value
$decodedPass = [System.Uri]::UnescapeDataString(($passEnc -replace "\+", "%20"))

$projRoot = Split-Path $dumpFull -Parent
$fileName = Split-Path $dumpFull -Leaf
$fileInContainer = "/backup/$fileName"

$dockerArgs = @(
  "run", "--rm",
  "-e", "PGSSLMODE=require",
  "-e", "PGPASSWORD=$decodedPass",
  "-v", "${projRoot}:/backup",
  "postgres:16-alpine",
  "pg_restore",
  "-h", $hostPg,
  "-p", $portPg,
  "-U", $user,
  "-d", $dbName,
  "--no-owner",
  "--no-acl",
  "-F", "c",
  "-v"
)
if ($Clean) {
  $dockerArgs += @("--clean", "--if-exists")
}
$dockerArgs += $fileInContainer

Write-Host "pg_restore -> ${user}@${hostPg}:${portPg}/${dbName} (dump: $fileName)"
& docker @dockerArgs
if ($LASTEXITCODE -ne 0) {
  throw "pg_restore terminó con código $LASTEXITCODE (si la BD ya tenía datos, probá con -Clean)."
}
Write-Host "Listo."
