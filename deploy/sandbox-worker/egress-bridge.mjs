// Runs INSIDE the sandbox's network namespace for a restricted-network stage. The namespace has only a loopback interface; this exposes the
// worker's allowlisting proxy (a unix socket) to the job as 127.0.0.1:3128, which is where HTTPS_PROXY points. It adds no capability the socket
// itself does not give: every decision (host, port, address) is made by the proxy on the other side.
import net from 'node:net';

const socketPath = process.argv[2];
if (!socketPath) process.exit(2);
net.createServer(client => {
  const upstream = net.connect(socketPath);
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
  client.pipe(upstream); upstream.pipe(client);
}).listen(3128, '127.0.0.1');
