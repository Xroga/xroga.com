// Generated capability registry.
//
// Xroga Connect's business.read capability is included here
// as a controlled Xroga capability.
//
// Raw Composio tools are deliberately NOT registered here.

import {
  attachmentAnalyzeCapability,
} from './modules/attachmentAnalyze.js';

import {
  businessReadCapability,
} from './modules/businessRead.js';

import {
  conversationRespondCapability,
} from './modules/conversationRespond.js';

import {
  publicResearchCapability,
} from './modules/publicResearch.js';

import {
  repositoryReadCapability,
} from './modules/repositoryRead.js';

import {
  repositoryWriteCapability,
} from './modules/repositoryWrite.js';

import {
  softwareImplementCapability,
} from './modules/softwareImplement.js';

import {
  validationRunCapability,
} from './modules/validationRun.js';

import {
  xResearchCapability,
} from './modules/xResearch.js';

export const generatedCapabilities = [
  attachmentAnalyzeCapability,

  businessReadCapability,

  conversationRespondCapability,

  publicResearchCapability,

  repositoryReadCapability,

  repositoryWriteCapability,

  softwareImplementCapability,

  validationRunCapability,

  xResearchCapability,
] as const;
