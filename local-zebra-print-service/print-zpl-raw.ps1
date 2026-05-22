param(
  [Parameter(Mandatory = $true)]
  [string]$FilePath,
  [string]$PrinterName = "",
  [string]$JobName = "Tarja ZPL"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-TargetPrinter {
  param([string]$RequestedPrinter)

  if ($RequestedPrinter -and $RequestedPrinter.Trim().Length -gt 0) {
    return $RequestedPrinter.Trim()
  }

  Add-Type -AssemblyName System.Drawing
  $installed = @()
  foreach ($p in [System.Drawing.Printing.PrinterSettings]::InstalledPrinters) {
    $name = [string]$p
    if ($name -and $name.Trim().Length -gt 0) {
      $installed += $name.Trim()
    }
  }

  if ($installed.Count -gt 0) {
    $zebra = @($installed | Where-Object { $_ -match '(?i)zdesigner|zebra' -or $_ -match '(?i)zpl' })
    if ($zebra.Count -gt 0) {
      # Preferimos 203dpi porque la etiqueta generada usa base 203 dpi.
      $zebra203 = @($zebra | Where-Object { $_ -match '(?i)203dpi' })
      if ($zebra203.Count -gt 0) {
        return $zebra203[0]
      }
      return $zebra[0]
    }
  }

  $printerSettings = New-Object System.Drawing.Printing.PrinterSettings
  if (-not $printerSettings.PrinterName -or $printerSettings.PrinterName.Trim().Length -eq 0) {
    throw "No hay impresora predeterminada configurada en Windows."
  }
  return $printerSettings.PrinterName.Trim()
}

try {
  if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "No se encontró el archivo temporal ZPL: $FilePath"
  }

  $targetPrinter = Resolve-TargetPrinter -RequestedPrinter $PrinterName
  $bytes = [System.IO.File]::ReadAllBytes($FilePath)

  # Quitar BOM UTF-8 si el archivo se escribió con él (la Zebra no debe recibir esos 3 bytes antes de ^XA).
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    $newLen = $bytes.Length - 3
    $nb = New-Object byte[] $newLen
    [Array]::Copy($bytes, 3, $nb, 0, $newLen)
    $bytes = $nb
  }

  $peekLen = [Math]::Min($bytes.Length, 600)
  if ($peekLen -lt 3) {
    throw "Archivo ZPL demasiado corto ($peekLen bytes)."
  }
  $peekText = [System.Text.Encoding]::UTF8.GetString($bytes, 0, $peekLen)
  if ($peekText -match '(?i)<!DOCTYPE\s*html|<\s*html[\s>/]') {
    throw "El archivo parece HTML, no ZPL RAW. No se enviará a la impresora."
  }
  $trimStart = $peekText.TrimStart()
  $trimUp = $trimStart.ToUpperInvariant()
  if (-not $trimUp.StartsWith('^XA')) {
    $prev = ($peekText.Substring(0, [Math]::Min(120, $peekText.Length))) -replace "`r`n", ' '
    throw "ZPL inválido: debe empezar con ^XA. Inicio: $prev"
  }

  Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO {
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] bytes, int count, out int written);

    public static void SendRaw(string printerName, byte[] bytes, string docName) {
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFO di = new DOCINFO();
        di.pDocName = string.IsNullOrWhiteSpace(docName) ? "Tarja ZPL" : docName;
        di.pDataType = "RAW";

        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "No se pudo abrir la impresora.");

        try {
            if (!StartDocPrinter(hPrinter, 1, di))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "No se pudo iniciar el documento.");

            try {
                if (!StartPagePrinter(hPrinter))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "No se pudo iniciar la página.");

                try {
                    int written;
                    if (!WritePrinter(hPrinter, bytes, bytes.Length, out written))
                        throw new Win32Exception(Marshal.GetLastWin32Error(), "No se pudo escribir en la impresora.");
                    if (written != bytes.Length)
                        throw new Exception(string.Format("Se enviaron {0} de {1} bytes.", written, bytes.Length));
                } finally {
                    EndPagePrinter(hPrinter);
                }
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
"@

  [RawPrinterHelper]::SendRaw($targetPrinter, $bytes, $JobName)

  @{
    ok = $true
    printer = $targetPrinter
    printed_bytes = $bytes.Length
    message = "Impresión enviada correctamente."
  } | ConvertTo-Json -Compress
  exit 0
}
catch {
  @{
    ok = $false
    message = $_.Exception.Message
  } | ConvertTo-Json -Compress
  exit 1
}
