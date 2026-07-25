type CircuitState = 'closed' | 'open' | 'half_open';

const circuits = new Map<string, { state: CircuitState; failures: number; openedAt: number }>();

const failureThreshold = () => Math.max(1, Number(process.env.XROGA_CIRCUIT_FAILURE_THRESHOLD) || 3);
const recoveryMs = () => Math.max(1_000, Number(process.env.MODEL_CIRCUIT_RECOVERY_MS) || 30_000);

export function circuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  fallback: () => Promise<T> | T
): Promise<T> {
  const circuit = circuits.get(key) ?? { state: 'closed' as CircuitState, failures: 0, openedAt: 0 };

  if (circuit.state === 'open') {
    if (Date.now() - circuit.openedAt > recoveryMs()) {
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
      if (circuit.failures >= failureThreshold()) {
        circuit.state = 'open';
        circuit.openedAt = Date.now();
      }
      circuits.set(key, circuit);
      return fallback();
    });
}

export function circuitStatus(key: string): {
  state: CircuitState;
  failures: number;
  openedAt?: string;
} {
  const circuit = circuits.get(key);
  return circuit
    ? {
        state: circuit.state,
        failures: circuit.failures,
        openedAt: circuit.openedAt ? new Date(circuit.openedAt).toISOString() : undefined,
      }
    : { state: 'closed', failures: 0 };
}

export function resetCircuits(): void {
  circuits.clear();
}
