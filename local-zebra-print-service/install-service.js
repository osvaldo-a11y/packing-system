/**
 * Instala o desinstala el servicio Windows "Pinebloom Zebra Print" (node-windows).
 *
 *   node install-service.js install    (como Administrador)
 *   node install-service.js uninstall  (como Administrador)
 */
const path = require('path');
const { Service } = require('node-windows');

const SERVICE_NAME = 'Pinebloom Zebra Print';
const SERVICE_DESCRIPTION = 'Servicio local de impresión Zebra para Pinebloom Packing';
const SCRIPT_PATH = path.join(__dirname, 'print-server.js');

const command = (process.argv[2] || '').trim().toLowerCase();

if (command !== 'install' && command !== 'uninstall') {
  console.error('Uso: node install-service.js install | uninstall');
  console.error('Ejecutar la consola como Administrador en Windows.');
  process.exit(1);
}

const svc = new Service({
  name: SERVICE_NAME,
  description: SERVICE_DESCRIPTION,
  script: SCRIPT_PATH,
  nodeOptions: [],
  env: [
    {
      name: 'PRINT_SERVICE_PORT',
      value: process.env.PRINT_SERVICE_PORT || '3001',
    },
  ],
});

if (command === 'install') {
  svc.on('install', () => {
    console.log(`[${SERVICE_NAME}] Servicio instalado. Iniciando…`);
    svc.start();
  });
  svc.on('start', () => {
    console.log(`[${SERVICE_NAME}] En ejecución. Verificar en services.msc o GET http://127.0.0.1:3001/status`);
  });
  svc.on('alreadyinstalled', () => {
    console.log(`[${SERVICE_NAME}] Ya estaba instalado. Iniciando…`);
    svc.start();
  });
  svc.on('error', (err) => {
    console.error(`[${SERVICE_NAME}] Error:`, err);
    process.exit(1);
  });
  svc.install();
} else {
  svc.on('uninstall', () => {
    console.log(`[${SERVICE_NAME}] Servicio desinstalado.`);
  });
  svc.on('error', (err) => {
    console.error(`[${SERVICE_NAME}] Error:`, err);
    process.exit(1);
  });
  svc.uninstall();
}
