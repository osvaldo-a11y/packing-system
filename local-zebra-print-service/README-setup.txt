================================================================================
  Pinebloom — Servicio local de impresión Zebra (Windows)
  Carpeta: local-zebra-print-service
================================================================================

Este servicio escucha en http://127.0.0.1:3001 y envía ZPL en modo RAW a la
primera impresora Zebra detectada en el PC (sin configurar el nombre a mano).

--------------------------------------------------------------------------------
REQUISITOS
--------------------------------------------------------------------------------
  • Windows 10/11 o Windows Server con impresora Zebra instalada (driver ZPL)
  • Node.js 20 LTS o superior (https://nodejs.org)
  • Permisos de administrador solo para instalar el servicio Windows

--------------------------------------------------------------------------------
INSTALACIÓN EN UNA NUEVA PLANTA (primera vez)
--------------------------------------------------------------------------------

1) Instalar Node.js
   Descargar el instalador LTS desde nodejs.org e instalar con opciones por
   defecto (incluir en PATH).

2) Copiar el proyecto (o al menos la carpeta local-zebra-print-service) al PC
   de planta donde está conectada la impresora por USB.

3) Abrir PowerShell o CMD como usuario normal y ejecutar:

      cd ruta\al\proyecto\local-zebra-print-service
      npm install

4) Probar en consola (opcional, sin servicio Windows):

      npm start

   En otra ventana:

      curl http://127.0.0.1:3001/status

   Debe responder algo como:
      {"printer":"…nombre de su Zebra…","status":"ready","source":"auto"}

5) Instalar como servicio Windows (OBLIGATORIO ejecutar como Administrador):

      cd ruta\al\proyecto\local-zebra-print-service
      node install-service.js install

6) Verificar en services.msc que el servicio
      "Pinebloom Zebra Print"
   está en estado "En ejecución" (Running) y tipo de inicio "Automático".

7) Abrir el sistema Pinebloom en el navegador del mismo PC e imprimir una
   tarja de prueba desde Unidad PT → Imprimir.

--------------------------------------------------------------------------------
AUTODETECCIÓN DE IMPRESORA
--------------------------------------------------------------------------------
  Al arrancar, el servicio lista impresoras con:

      wmic printer get name

  y elige la primera cuyo nombre contenga (sin importar mayúsculas):
      zebra, zt, zd, gk, zpl

  Ejemplos que suelen coincidir: ZDesigner GK420d ZPL, ZT421, ZD230, etc.

  Override manual (solo si hace falta en una planta especial):

      Variable de entorno del sistema: ZEBRA_PRINTER_NAME
      Valor: nombre exacto de la cola en Windows (Panel de impresión)

--------------------------------------------------------------------------------
DESINSTALAR EL SERVICIO
--------------------------------------------------------------------------------
  PowerShell o CMD como Administrador:

      cd ruta\al\proyecto\local-zebra-print-service
      node install-service.js uninstall

--------------------------------------------------------------------------------
DIAGNÓSTICO
--------------------------------------------------------------------------------
  • GET http://127.0.0.1:3001/status
        → impresora detectada y "ready" o "no_printer"

  • GET http://127.0.0.1:3001/printers
        → lista detallada (script PowerShell)

  • Si status es no_printer: instalar driver Zebra ZPL y reiniciar el servicio.

  • Si la etiqueta imprime texto/HTML en lugar de gráficos: la impresora puede
    estar en modo diagnóstico (hex dump); apagar, mantener FEED al encender para
    salir del modo diagnóstico (ver manual GK/ZD/ZT).

  • Logs del servicio: visor de eventos de Windows o consola si corre con npm start.

--------------------------------------------------------------------------------
PUERTO
--------------------------------------------------------------------------------
  Por defecto: 3001. Cambiar con variable de entorno PRINT_SERVICE_PORT antes de
  instalar el servicio (o reinstalar tras cambiarla).

================================================================================
