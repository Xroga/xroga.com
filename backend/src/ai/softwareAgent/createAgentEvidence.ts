import type {
  SoftwareRunEvidence,
} from './contracts.js';

export function createAgentEvidence(): SoftwareRunEvidence {
  return {
    changedFiles: [],
    checks: [],
  };
}
