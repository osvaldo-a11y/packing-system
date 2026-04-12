/* eslint-disable @typescript-eslint/no-require-imports */
const bcrypt = require('bcrypt');

const plain = process.argv[2];
if (!plain) {
  console.error('Uso: npm run auth:hash-password -- <contraseña>');
  process.exit(1);
}

const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
bcrypt
  .hash(plain, rounds)
  .then((hash) => {
    console.log(hash);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
