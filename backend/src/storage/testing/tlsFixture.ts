import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';

/**
 * Disposable TLS material for the database-TLS tests. Everything is generated at test time with openssl into a temp
 * directory and removed afterwards, so the repository never contains a private key. Tests skip (visibly) when openssl
 * is not installed; CI has it.
 */
export function opensslAvailable(): boolean {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

const fwd = (p: string) => p.replace(/\\/g, '/');
const run = (args: string[]) => execFileSync('openssl', args, { stdio: 'ignore', windowsHide: true });

export interface TlsFixture {
  /** a root and a leaf for `host` signed by it */
  caPem: string;
  leafKey: string;
  leafCert: string;
  /** a leaf for another name, signed by the same root (host-name mismatch) */
  wrongNameKey: string;
  wrongNameCert: string;
  /** an unrelated root */
  otherCaPem: string;
  cleanup(): void;
}

export function makeTlsFixture(host: string): TlsFixture {
  const dir = mkdtempSync(join(tmpdir(), 'xroga-tls-'));
  const p = (n: string) => fwd(join(dir, n));
  const root = (name: string, cn: string) => {
    writeFileSync(p(`${name}.cnf`), `[req]\ndistinguished_name=dn\nprompt=no\nx509_extensions=v3\n[dn]\nCN=${cn}\n[v3]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n`);
    run(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', p(`${name}.key`)]);
    run(['req', '-x509', '-new', '-key', p(`${name}.key`), '-sha256', '-days', '3650', '-config', p(`${name}.cnf`), '-out', p(`${name}.pem`)]);
  };
  const leaf = (name: string, forHost: string) => {
    writeFileSync(p(`${name}.cnf`), `[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=${forHost}\n[v3]\nbasicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:${forHost}\n`);
    run(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', p(`${name}.key`)]);
    run(['req', '-new', '-key', p(`${name}.key`), '-config', p(`${name}.cnf`), '-out', p(`${name}.csr`)]);
    run(['x509', '-req', '-in', p(`${name}.csr`), '-CA', p('ca.pem'), '-CAkey', p('ca.key'), '-CAcreateserial', '-days', '3650', '-sha256', '-extfile', p(`${name}.cnf`), '-extensions', 'v3', '-out', p(`${name}.pem`)]);
  };
  try {
    root('ca', 'Xroga Test Root');
    root('other', 'Xroga Unrelated Root');
    leaf('leaf', host);
    leaf('wrong', 'other-name.test.invalid');
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  const read = (n: string) => readFileSync(join(dir, n), 'utf8');
  return {
    caPem: read('ca.pem'),
    leafKey: read('leaf.key'),
    leafCert: read('leaf.pem'),
    wrongNameKey: read('wrong.key'),
    wrongNameCert: read('wrong.pem'),
    otherCaPem: read('other.pem'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Postgres ErrorResponse, which is what a database sends when it refuses a startup packet. */
function fatal(message: string): Buffer {
  const field = (code: string, v: string) => Buffer.concat([Buffer.from(code), Buffer.from(`${v}\0`)]);
  const body = Buffer.concat([field('S', 'FATAL'), field('V', 'FATAL'), field('C', '28000'), field('M', message), Buffer.from('\0')]);
  const head = Buffer.alloc(5);
  head.write('E', 0);
  head.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([head, body]);
}

export interface StubPostgres {
  port: number;
  /** true once a client got through TLS and sent the startup packet (so TLS verification passed) */
  startupSeen(): boolean;
  close(): Promise<void>;
}

/**
 * Speaks only the start of the Postgres protocol: answers SSLRequest with 'S', completes TLS with the given key and
 * certificate, and answers the startup packet with a FATAL error. Listens on loopback.
 */
export function startStubPostgres(key: string, cert: string): Promise<StubPostgres> {
  let startup = false;
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.once('data', (chunk: Buffer | string) => {
      const first = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const isSslRequest = first.length >= 8 && first.readInt32BE(4) === 80877103;
      if (!isSslRequest) return socket.destroy();
      socket.write('S');
      const secure = new tls.TLSSocket(socket, { isServer: true, key, cert });
      secure.on('error', () => undefined);
      secure.once('data', () => {
        startup = true;
        secure.end(fatal('stub database: connection refused after TLS'));
      });
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: (server.address() as net.AddressInfo).port,
        startupSeen: () => startup,
        close: () => new Promise<void>((r) => {
          for (const s of sockets) s.destroy();
          server.close(() => r());
        }),
      });
    });
  });
}
