Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

try {
  Add-Type -AssemblyName System.Drawing
  $defaultPrinter = ""
  $printerSettings = New-Object System.Drawing.Printing.PrinterSettings
  if ($printerSettings.PrinterName) {
    $defaultPrinter = $printerSettings.PrinterName.Trim()
  }

  $items = @()
  foreach ($p in [System.Drawing.Printing.PrinterSettings]::InstalledPrinters) {
    $name = [string]$p
    if (-not $name -or $name.Trim().Length -eq 0) {
      continue
    }
    $clean = $name.Trim()
    $isZebra = ($clean -match '(?i)zebra') -or ($clean -match '(?i)zdesigner') -or ($clean -match '(?i)zpl')
    $dpi = if ($clean -match '(?i)(\d{3,4})\s*dpi') { $matches[1] } else { $null }
    $items += [PSCustomObject]@{
      name = $clean
      isDefault = ($defaultPrinter -and $clean -eq $defaultPrinter)
      isZebra = [bool]$isZebra
      dpi = $dpi
    }
  }

  # Zebra primero para UX de planta.
  $sorted = $items | Sort-Object @{ Expression = { -not $_.isZebra } }, name

  [PSCustomObject]@{
    ok = $true
    defaultPrinter = $defaultPrinter
    printers = $sorted
  } | ConvertTo-Json -Compress -Depth 5
  exit 0
}
catch {
  [PSCustomObject]@{
    ok = $false
    message = $_.Exception.Message
    defaultPrinter = ""
    printers = @()
  } | ConvertTo-Json -Compress -Depth 5
  exit 1
}
