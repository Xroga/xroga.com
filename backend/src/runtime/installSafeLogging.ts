/**
 * Side-effect module: importing it (as the first import after environment loading) redacts every later console line. See safeLogging.ts.
 * It is a separate module so the installation order is fixed by import order, before any other module can log.
 */
import { installCredentialSafeConsole } from './safeLogging.js';

installCredentialSafeConsole();
