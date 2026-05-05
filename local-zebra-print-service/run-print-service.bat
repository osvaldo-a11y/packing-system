@echo off
setlocal

REM Inicia el servicio local de impresion Zebra en Windows.
REM Ejecutar este .bat en el PC conectado a la impresora.

cd /d "%~dp0"

if not exist "node_modules" (
  echo [zebra-print-service] Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo [zebra-print-service] ERROR instalando dependencias.
    pause
    exit /b 1
  )
)

echo [zebra-print-service] Iniciando servicio en http://127.0.0.1:3001 ...
call npm start

endlocal
