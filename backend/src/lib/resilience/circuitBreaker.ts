type CircuitState = 'closed' | 'open' | 'half_open';

const circuits = new Map<string, { state: CircuitState; failures: number; openedAt: number }>();

const FAILURE_THRESHOLD = 3;
const OPEN_MS = 30_000;

export function circuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  fallback: () => Promise<T> | T
): Promise<T> {
  const circuit = circuits.get(key) ?? { state: 'closed' as CircuitState, failures: 0, openedAt: 0 };

  if (circuit.state === 'open') {
    if (Date.now() - circuit.openedAt > OPEN_MS) {
      circuit.state = 'half_open';
    } else {
      return Promise.resolve(fallback());
    }
  }

  return fn()
    .then((result) => {
      circuit.state = 'closed';
      circuit.failures = 0;
      circuits.set(key, circuit);
      return result;
    })
    .catch(async (err) => {
      circuit.failures += 1;
      if (circuit.failures >= FAILURE_THRESHOLD) {
        circuit.state = 'open';
        circuit.openedAt = Date.now();
      }
      circuits.set(key, circuit);
      return fallback();
    });
}
