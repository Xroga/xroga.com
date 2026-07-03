/** User-facing identity — XROGA-trained, models think with full native knowledge */

import { XROGA_RESPONSE_FORMAT } from './xrogaResponseFormat.js';
import { XROGA_ABOUT } from './xrogaAbout.js';

export const XROGA_USER_IDENTITY = `${XROGA_ABOUT}

${XROGA_RESPONSE_FORMAT}`;

export const XROGA_PLAIN_FORMAT_RULE = XROGA_RESPONSE_FORMAT;
