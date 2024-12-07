import { execSync } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';

// Create certs directory if it doesn't exist
mkdirSync('./certs', { recursive: true });

// Generate self-signed certificate using Node.js
const selfsigned = await import('selfsigned');
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, {
    algorithm: 'sha256',
    days: 365,
    keySize: 2048,
    extensions: [{
        name: 'subjectAltName',
        altNames: [
            { type: 2, value: 'localhost' },
            { type: 2, value: '127.0.0.1' }
        ]
    }]
});

// Write the certificate files
const fs = await import('fs/promises');
await fs.writeFile(join('./certs', 'cert.key'), pems.private);
await fs.writeFile(join('./certs', 'cert.crt'), pems.cert);

console.log('Generated SSL certificates in ./certs directory'); 