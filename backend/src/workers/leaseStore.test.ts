import { MemoryLeaseStore } from './leaseStore.js';
import { leaseStoreContract } from './leaseStore.contract.js';

leaseStoreContract('MemoryLeaseStore', (clock) => new MemoryLeaseStore(() => clock.now()));
