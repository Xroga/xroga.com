// Synchronous configuration dependency, after safe logging and before providers. Clients must never observe
// a partly loaded configuration or run before protected configuration validation.
import { loadProtectedPlatformEnvironment } from './config/platformEnvironment.js';
loadProtectedPlatformEnvironment();
