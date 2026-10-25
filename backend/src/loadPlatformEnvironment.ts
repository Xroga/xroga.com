// Synchronous first dependency of index.ts. Provider clients must never observe
// a partly loaded configuration or run before protected configuration validation.
import { loadProtectedPlatformEnvironment } from './config/platformEnvironment.js';
loadProtectedPlatformEnvironment();
