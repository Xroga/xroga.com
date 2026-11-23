import { explicitlyDisablesResearch } from '../lib/taskClassifier.js';
import { containsCredentialSecretText } from '../security/egress/dataClassification.js';
import { publicHttpsUrl } from '../security/egress/urlPolicy.js';
import { DEEPSEEK_QUERY_MAX, scopeOfficialSearchQuery } from './researchSearchProvider.js';

const publicOfficeLookup = /^who\s+(?:is|was)\s+(?:the\s+)?(?:current\s+)?(?:president|prime minister|governor|mayor|chief executive officer|ceo)\s+of\s+\p{L}[\p{L}\p{M} .,'’-]{1,75}[?!]?$/iu;
const publicInstitutionLeadership = /^[Ww]ho (?:currently )?(?:leads|heads) (?:the )?[A-Z][A-Z0-9]{1,15}[?!]?$/u;
const publicSourceLookup = /\b(?:summari[sz]e|check|compare|find|cite|link)\b[^.!?;]{0,90}\b(?:dated |recent |current )?public sources?\b/iu;
// Check references to a data source or to an identifier. Possessives and
// words such as "private", "internal" and "secret" also describe public topics.
const privateSourceReferences = [
  /\b(?:my|our|your)\s+(?:(?:latest|current|private|confidential|internal|unpublished)\s+){0,3}(?:crm|inbox|mailbox|account|client account|subscription list|acquisition target|draft|notes|files?|records?|policy|audits?|credentials?|bookings?|reservations?)\b/iu,
  /\b(?:my|our|your)\s+(?:private|confidential|internal|unpublished)\s+(?:compan(?:y|ies)|(?:client|customer|patient|employee|vendor)s?)\b|\b(?:leads|heads|(?:president|chief executive officer|ceo) of)\s+(?:my|our|your)\s+company\b/iu,
  /\b(?:from|using|include|compare (?:it )?with)\s+(?:(?:the|my|our|your)\s+)?(?:attached|uploaded|confidential) (?:[\p{L}-]+ ){0,2}(?:files?|documents?|spreadsheets?|lists?|photos?|screenshots?|notes|records?|audits?)\b/iu,
  /\b(?:the )?(?:attached|uploaded)\s+(?:[\p{L}-]+ ){0,2}(?:files?|documents?|spreadsheets?|photos?|screenshots?|notes|audits?|customer names|client records)\b|\b(?:use|include|from|against)\s+(?:the|my|our|your)\s+(?:itinerary|inbox|mailbox|crm)\b/iu,
  /\b(?:this|current|selected|active)\s+(?:project|repository|repo|workspace)\b|\b(?:this|that)\s+(?:private|internal|confidential)\s+(?:crm|files?|documents?|records?|notes?|lists?|audits?)\b|\b(?:as|we) discussed\b|\b(?:earlier|previous) (?:chat|message|answer|conversation)\b|\b(?:these|those)\s+(?:compan(?:y|ies)|providers|vendors|customers)\b/iu,
  /\b(?:customer|client|patient|employee|booking|reservation|account|order|tracking|passport|loyalty) (?:data|records?|details|list|names?|notes|numbers?|codes?|references?|ids?|addresses?)\b|\b(?:date of birth|home address|social security|do not share)\b|(?:'s|’s)\s+(?:address|phone|email)\b/iu,
  /\b(?:nuest(?:ro|ra|ros|ras)|notre|unser\w*)\s+(?:archiv[oa]s?|données|daten|crm|dossier|fichiers?|dateien)\b|بياناتنا\s+الداخلية|ملفاتي|ملفنا|حسابي|ہماری\s+فائل|मेरी\s+फ़ाइल|我们的(?:内部|客户|账户)|客户名单/iu,
];
const personalLookup = /\b(?:personal (?:info(?:rmation)?|details|records?|phone|email|address)|background checks? (?:on|for)|where (?:does|did) .+ (?:live|work)|who (?:is|was) .+ (?:currently )?working for)\b/iu;
const specificIdentityOrUrl = /(?:\b[a-z][a-z\d+.-]*:\/\/|(?:\p{N}[ ().-]*){7,})/iu;
const rawSearchOperator = /(?:^|\s)-?(?:site|url|inurl|cache|link|related):/iu;
const searchText = /^[\p{L}\p{M}\p{N}\p{Sc} ,.'’!?()&–—،؟。？！、।॥:+"“”%#-]+$/u;
const bareDomain = /(?<![\p{L}\p{N}.-])(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}(?![\p{L}\p{N}-]|\.[\p{L}\p{N}])/giu;
// These public software names are also syntactically valid hostnames. Treat
// them as product names only when the turn asks about software releases/docs.
const publicSoftwareNames = new Set(['node.js', 'next.js', 'nuxt.js', 'react.js', 'vue.js', 'express.js', 'three.js', 'd3.js']);
const softwareReleaseSubject = /\b(?:releases?|versions?|changelogs?|documentation|docs|migration guides?|upgrade risks?)\b/iu;
const currencyPeriod = /(\p{Sc}\d{1,6}(?:\.\d{1,2})?)\/(day|week|month|year)\b/giu;
const freshnessFocus = /\b(?:current|latest|live|newest|verified)\s+(?:prices?|pricing|releases?|versions?|fares?|exchange rates?|opening hours|schedules?)\b/iu;
const officialSourceRequest = /\bofficial(?:\s+[\p{L}\p{N}-]+){0,3}\s+(?:sources?|docs?|documentation|websites?|pages?|sites?)\b/iu;
const officialLinkRequest = /\bofficial (?:(?:web |support |documentation |docs )?links?|(?:[\p{L}\p{N}-]+\s+){0,2}(?:websites?|pages?|sites?|urls?))\b|\bprimary sources? (?:for each|each)\b|(?:المواقع|الروابط) الرسمية|网站官网|官方网站|sitios? (?:web )?oficial(?:es)?|sites? (?:web )?officiels?/iu;
const exclusiveOfficialSource = /\b(?:only|exclusively)\b[^.!?]{0,40}\bofficial\b|\bofficial\b[^.!?]{0,40}\b(?:only|exclusively)\b/iu;
const unavailableDomain = /(?:\.(?:example|onion|lan|home|corp)$|(?:^|\.)(?:intranet|staging|private|vpn)(?:\.|$))/iu;
const explicitWebLookup = /^(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:(?:search|browse)\s+(?:the\s+)?(?:public\s+)?(?:web|internet)|(?:search|research|look\s+up)\s+online|(?:do|run|perform|use)\s+(?:(?:a|the)\s+)?(?:web|internet)\s+search(?:es)?|(?:web|internet)\s+search(?=\s+(?:for|about|to)\b))(?=\s|\p{P}|$)(?:\s+(?:for|about|to)(?=\s|$))?\s*/iu;
const contextDependentTopic = /^(?:this|that|these|those|it|them|the same|the previous|the earlier)\b|\b(?:we (?:talked|spoke) about|what (?:i|we) (?:said|shared)|the (?:previous|earlier) (?:topic|result|item|one))\b|\b(?:about|for|on|regarding)\s+(?:this|that|these|those|it|them)$/iu;
const identityDetailLookup = /(?:\b(?:birthdates?|whereabouts|real name|social profiles?|contact details?) (?:of|for)|(?:'s|’s) (?:birthdates?|whereabouts|real name|social profiles?|contact details?))\b/iu;
const personLocationLookup = /^(?:\p{L}+\s+){1,2}\p{L}+\s+(?:in|at|near|from)\s+\p{L}+(?:\s+\p{Lu}\p{Ll}+){0,3}$/u;
const barePersonName = /^(?:\p{Lu}\p{Ll}+[\s-]+){1,3}\p{Lu}\p{Ll}+$/u;
const topicLead = /^(?:(?:an?\s+)?(?:explanation|overview|guide|introduction)\s+(?:of|to|about)|explain|describe|define)\s+/iu;
const citationFooter = /(?:[,.]\s*|(?<!\s)\s+)(?:and\s+)?(?:cite\s+(?:(?:your|the)\s+)?sources?|include\s+(?:(?:your|the)\s+)?(?:source\s+links|citations))[?!.]*$/iu;
const presentationInstruction = /(?:[,.;]\s*|\s+and\s+)(?:please\s+)?(?:give|explain|state|outline|show|describe|include)\s+your\s+(?:(?:ranking|comparison|selection|evaluation)\s+)?(?:criteria|reasoning|rationale|approach|method(?:ology)?|assumptions|recommendation)\b(?=$|\s*(?:[,.;?!]|\band\s+(?:cite|link|include|explain)\b))/giu;
const officialVerificationFooter = /(?:[,.;]\s*|\s+)(?:and\s+)?(?:which official source (?:confirms|verifies) (?:it|this)|cite (?:an?|the) official (?:source|reference))[?!.]*$/iu;
const instructionStart = /^(?:please\s+)?(?:(?:search|browse)\s+(?:(?:the\s+)?(?:public\s+)?(?:web|internet)\s+)?(?:for\s+)?|look up\s+|research\s+|what\s+(?:is|are)\s+(?:the\s+)?)/iu;
const sourcePreface = /^(?:using|from|with)\s+(?:only\s+)?official\s+[^,.:!?]+[,.:!?]\s*/iu;
const namedSourceClause = /\b(?:(?:use|using|from|with|based on|consult)\s+(?:(?:only|exclusively)\s+)?|(?:only|exclusively)\s+)(?:the\s+)?official\s+([\p{L}\p{N} .,&-]{1,120}?)\s+(?:sources?|websites?|pages?|sites?|docs?|documentation|publications?)(?:\s+\([a-z\d-]+(?:\.[a-z\d-]+)+\))?(?=\s*(?:[,:.!?]|$))/iu;
const publisherSourceClause = /\b(?:use|using|consult)\s+(?:(?:only|exclusively)\s+)?(?:the\s+)?(?:(?:current|latest)\s+)?(?:official\s+)?([\p{L}\p{N} .,&-]{1,120}?)\s+(?:sources?|websites?|pages?|sites?|docs?|documentation|publications?)(?=\s*(?:[,:.!?]|for\b|$))/iu;
const sourceSelectionStart = /^(?:use|using|from|based on|consult)\b|^with\s+(?:only|exclusively)\b/iu;
const genericSourceSelection = /\b(?:using|from|based on|consult)\s+(?:(?:only|exclusively)\s+)?(?:the\s+)?official\s+(?:sources?|websites?|pages?|sites?)(?=\s*(?:[,:.!?(]|$))/giu;
const answerOnlySuffix = /(?:[.!?]\s+(?:(?:present|show|put)\s+the\s+(?:results|findings|comparison|[\p{L}-]+\s+names\s+and\s+what\s+each\s+is\s+for)\s+in\s+(?:(?:one|a|an|the|compact|copyable|short)\s+){1,4}(?:table|list)|cite\s+(?:the\s+)?(?:actual\s+)?(?:primary|official)\s+sources?(?:\s+beside\s+the\s+claims)?|(?:do\s+not|don['’]t)\s+take\s+any\s+(?:external\s+)?actions?))+[.!?]?$/iu;
const presentationAfterTopic = /[.!?]\s+(?:For (?:a|an) fictional [^.!?]+,\s*)?(?:make|create|draw|present|render)\s+(?:a|an|one)\s+(?:[\p{L}-]+\s+){0,5}(?:table|chart|diagram|timeline|checklist)\b[^]*$/iu;
const originalSourceRequest = /\b(?:cite|link(?:\s+to)?|use|find|include|verify\s+against)\s+(?:(?:the|a|an|actual|only)\s+)*(original|primary|final)\s+(source|publication|dataset|standard|paper|report|rule)s?\b/iu;
const publishedWorkTopic = /\b(?:frameworks?|standards?|guidelines?|specifications?|regulations?|reports?|papers?)\b/iu;
const versionedWorkDetail = /\b(v?\d+(?:\.\d+)+)\s+(?:functions?|criteria|requirements?|definitions?|principles?|provisions?|sections?|clauses|rules|controls)(?:\s*[,.:].*)?$/iu;
const publicSourcePreface = /^(?:i\s+(?:need|want)|(?:please\s+)?(?:cite|include|use|provide))\s+(?:a\s+)?(?:dated\s+)?public sources?\s*[:：]\s*/iu;
const linkFooter = /\s*;\s*link\s+(?:them|each|all)(?:\s+(?:of them|\d+|one|two|three|four|five|six|seven|eight|nine|ten))?[?!.]*$/iu;

// Only explicit publisher names may select these public hosts. Unknown names
// still need a user-supplied domain for an exclusive source restriction.
const publicPublisherDomains = new Map([
  ['nist', 'nist.gov'],
  ['national institute of standards and technology', 'nist.gov'],
  ['nasa', 'nasa.gov'],
  ['national aeronautics and space administration', 'nasa.gov'],
  ['usgs', 'usgs.gov'],
  ['us geological survey', 'usgs.gov'],
  ['united states geological survey', 'usgs.gov'],
  ['fda', 'fda.gov'],
  ['food and drug administration', 'fda.gov'],
  ['cdc', 'cdc.gov'],
  ['centers for disease control and prevention', 'cdc.gov'],
  ['who', 'who.int'],
  ['world health organization', 'who.int'],
  ['ietf', 'ietf.org'],
  ['internet engineering task force', 'ietf.org'],
  ['w3c', 'w3.org'],
  ['world wide web consortium', 'w3.org'],
]);

// These are the publisher's technical series library and final publication
// catalog. Use them for named works, where the main site also indexes guides
// and user-supplied search queries.
const publicationHosts = new Map([
  ['nist.gov', ['csrc.nist.gov', 'nvlpubs.nist.gov']],
]);

function namedPublisherDomains(publishers: string): string[] {
  const names = publishers.toLowerCase().replace(/\./g, '').trim();
  const publisher = publicPublisherDomains.get(names);
  if (publisher) return [publisher];
  const domains: string[] = [];
  for (const name of names.split(/\s*,\s*(?:and\s+)?|\s+(?:and|&)\s+/u)) {
    const domain = publicPublisherDomains.get(name.trim());
    if (!domain) return [];
    domains.push(domain);
  }
  return [...new Set(domains)];
}

function isPublicSourceHost(domain: string): boolean {
  if (unavailableDomain.test(domain)) return false;
  try { return publicHttpsUrl('https://' + domain).hostname === domain; }
  catch { return false; }
}

function publisherScope(request: string) {
  const namedSource = namedSourceClause.exec(request) ?? publisherSourceClause.exec(request);
  const publisherDomains = namedSource ? namedPublisherDomains(namedSource[1]) : [];
  const asksForOfficial = officialSourceRequest.test(request);
  const isSoftwareName = (host: string) => softwareReleaseSubject.test(request) && publicSoftwareNames.has(host.toLowerCase());
  const explicitDomains = [...new Set([...request.matchAll(bareDomain)]
    .map(([host]) => host.toLowerCase()).filter(host => !isSoftwareName(host)))];
  return { namedSource, publisherDomains, asksForOfficial, isSoftwareName, explicitDomains };
}

export function requestsOfficialLinkCoverage(prompt: string): boolean {
  // Selecting where evidence comes from does not request a separate
  // verified destination for each item in the answer.
  const deliverable = prompt.replace(namedSourceClause, (scope) => sourceSelectionStart.test(scope) ? '' : scope)
    .replace(publisherSourceClause, (scope, publisher: string) => namedPublisherDomains(publisher).length ? '' : scope)
    .replace(genericSourceSelection, '');
  return officialLinkRequest.test(deliverable);
}

export function explicitlyRequestsWorkspaceWebSearch(prompt: string): boolean {
  return explicitWebLookup.test(prompt.trim()) && !explicitlyDisablesResearch(prompt);
}

/** Preserve a direct offline instruction without treating mentions of search
 * settings, quoted UI copy or filter expressions as instructions. */
export function workspaceSearchOptOut(prompt: string): boolean {
  return /(?:^|[.!?;\n]\s*)(?:(?:please\s+)?(?:do not|don['’]t|skip)\s+(?:(?:use|run)\s+)?(?:(?:the\s+)?(?:web|internet)\s+)?(?:search(?:ing)?|brows(?:e|ing)|research)(?:\s+(?:the\s+)?(?:web|internet|online))?|no web search|offline only)\s*[.!?]?\s*$/iu.test(prompt);
}

function isAmbiguousPersonalLookup(topic: string): boolean {
  const subject = topic.replace(topicLead, '');
  return barePersonName.test(subject) || personLocationLookup.test(subject);
}

function publicOfficeTopic(prompt: string): string | undefined {
  const topic = prompt.split(/(?<=\?)\s+/, 1)[0].trim();
  if (publicOfficeLookup.test(topic) || publicInstitutionLeadership.test(topic)) return topic;
}

function plannedPublicQuery(query: string) {
  const topic = query.trim();
  if (!topic || [...topic].length > DEEPSEEK_QUERY_MAX || containsCredentialSecretText(topic)) return;
  for (const [value] of topic.matchAll(/https?:\/\/[^\s"'<>]+/giu)) {
    if (containsCredentialSecretText(value)) return;
    try {
      const url = new URL(value);
      if (url.username || url.password) return;
    } catch { /* Search treats query text as text. */ }
  }
  return topic;
}

/** Public lookup terms must be self-contained and safe to send to Search. */
export function hasNonPublicSearchTerms(prompt: string): boolean {
  const request = prompt.trim().replace(/\s+/gu, ' ').replace(citationFooter, '').replace(presentationInstruction, '');
  const office = publicOfficeTopic(request);
  const remaining = office ? request.slice(office.length).trim() : request;
  const followupIdentity = office && /^who (?:is|was)\s+(.+?)[?!.]*$/i.exec(remaining);
  return containsCredentialSecretText(prompt) || privateSourceReferences.some(reference => reference.test(request))
    || identityDetailLookup.test(request) || personalLookup.test(remaining)
    || Boolean(followupIdentity && isAmbiguousPersonalLookup(followupIdentity[1]));
}

/** Project the typed turn after Workspace selects public Search. This owns the
 * input boundary, while the existing planner decides when retrieval is useful. */
export function workspacePublicSearchQuery(prompt: string, officialOnly = false, plannerQuery?: string | null): {
  query: string; officialDomains: string[]; originalSourceQuestion?: string;
} | undefined {
  if (plannerQuery !== undefined) {
    if (plannerQuery === null || workspaceSearchOptOut(prompt)) return;
    const query = plannedPublicQuery(plannerQuery);
    if (!query) return;

    const { publisherDomains, asksForOfficial, explicitDomains } = publisherScope(prompt);
    const scopedHosts = asksForOfficial ? explicitDomains.filter(host => isPublicSourceHost(host) &&
      (!publisherDomains.length || publisherDomains.some(domain => host === domain || host.endsWith('.' + domain)))) : [];
    const officialDomains = scopedHosts.length ? scopedHosts : publisherDomains;
    if (!officialDomains.length) return { query, officialDomains };

    // Retain the existing recovery for a known, explicitly requested publication.
    const publication = workspacePublicSearchQuery(prompt, officialOnly);
    if (publication?.originalSourceQuestion) return publication;
    const scopedQuery = scopeOfficialSearchQuery(query, officialDomains);
    if (scopedQuery) return { query: scopedQuery, officialDomains };
    return;
  }

  // Compatibility for saved or older plans with no search query. Only this
  // path projects raw message text instead of receiving a search phrase.
  if (prompt.length > 32_000) return;
  const message = prompt.trim().replace(/\s+/gu, ' ');
  if (!message) return;
  // Instructions about how to explain a result carry no retrieval terms.
  // Keep each qualifier and subsequent clause subject to the privacy checks.
  const request = message.replace(publicSourcePreface, '').replace(citationFooter, '').replace(presentationInstruction, '')
    .replace(linkFooter, '').replace(currencyPeriod, '$1 per $2').replace(/\s*;\s*/g, ', ').trimEnd();
  const publicOffice = publicOfficeTopic(request) !== undefined;
  const officialLookup = requestsOfficialLinkCoverage(request) || publicSourceLookup.test(request);
  const { namedSource, publisherDomains, asksForOfficial, isSoftwareName, explicitDomains } = publisherScope(request);
  if (namedSource && /\b(?:only|exclusively)\b/iu.test(namedSource[0]) && !publisherDomains.length && !namedSource[0].includes('(')) return;
  if (explicitlyDisablesResearch(message)
    || hasNonPublicSearchTerms(prompt) || specificIdentityOrUrl.test(message) || rawSearchOperator.test(message)
    || !searchText.test(request)) return;

  // A domain becomes a filter only when the user supplied it in this request
  // with an official-source restriction. Neither a model nor history adds hosts.
  if (explicitDomains.length && (!asksForOfficial || !explicitDomains.every(isPublicSourceHost))) return;
  if (publisherDomains.length && explicitDomains.some(host => !publisherDomains.some(domain => host === domain || host.endsWith('.' + domain)))) return;
  const officialDomains = explicitDomains.length ? explicitDomains : publisherDomains;
  // A model's inferred source policy must never add hosts or turn a public
  // comparison into a sensitive-data approval. A request to cite one official
  // reference still permits discovering sources.
  const requestsOfficialCitation = officialVerificationFooter.test(request);
  if (!officialDomains.length && (exclusiveOfficialSource.test(request)
    || officialOnly && asksForOfficial && !requestsOfficialCitation && !officialLookup)) return;
  const requestsPrimaryPublisherTable = officialDomains.length > 0 &&
    /\b(?:cite|link(?:\s+to)?|use|find|include)\s+(?:the\s+)?(?:primary|original|final)\s+(?:[\p{L}.-]+\s+){0,4}table\b/iu.test(message);

  const scopedRequest = namedSource && (publisherDomains.length || explicitDomains.length && namedSource[0].includes('('))
    ? [request.slice(0, namedSource.index).trimEnd(),
        request.slice(namedSource.index + namedSource[0].length).replace(/^[\s,.:!?]+/u, '')].filter(Boolean).join(' ')
    : request;
  const checkedTopic = scopedRequest.replace(bareDomain, host => isSoftwareName(host) ? host : '').replace(/(?<![\p{L}\p{N}])\(\s*\)/gu, '')
    .replace(explicitWebLookup, '').replace(instructionStart, '').replace(sourcePreface, '').replace(instructionStart, '')
    .replace(presentationAfterTopic, '').replace(answerOnlySuffix, '')
    .replace(/[,.]?\s+(?:and\s+)?cite\s+[^.!?]+[.!?]*$/iu, '')
    .replace(/[?.!؟。？！।॥]+$/u, '').trim();
  // Spend the bounded publisher query on the requested metric and rows.
  const originalSource = originalSourceRequest.exec(message);
  const topic = requestsPrimaryPublisherTable ? checkedTopic.replace(/^(?:find|compare)\s+(?:the\s+)?/iu, '')
    .replace(/\b(?:figures|numbers)\s+(?:for|on)\s+(?:estimated\s+)?/iu, '') : checkedTopic;
  if (contextDependentTopic.test(topic.replace(topicLead, '')) || /^(?:the\s+)?(?:latest|current|new)\s+policy$/iu.test(topic)
    || (!publicOffice && !officialDomains.length && isAmbiguousPersonalLookup(topic))) return;
  const namedPublication = originalSource && versionedWorkDetail.test(topic) && publishedWorkTopic.test(topic);
  const retrievalHosts = namedPublication
    ? officialDomains.flatMap(domain => publicationHosts.get(domain) ?? [domain])
    : officialDomains;
  const scopedPublicationHosts = retrievalHosts.some(host => !officialDomains.includes(host));
  const sites = [...new Set(retrievalHosts)].map(domain => 'site:' + domain).join(' OR ');
  const topicLimit = DEEPSEEK_QUERY_MAX - (sites ? sites.length + 1 : 0);
  if (topicLimit < 1 || !/\p{L}/u.test(topic)
    || /^(?:(?:the\s+)?(?:public\s+)?(?:web|internet)|for)$/iu.test(topic)) return;
  const characters = [...topic];
  const focus = characters.slice(topicLimit).join('').match(freshnessFocus)?.[0];
  const capacity = focus && focus.length + 16 < topicLimit ? topicLimit - focus.length - 1 : topicLimit;
  let terms = characters.slice(0, capacity).join('').trimEnd();
  if (/[\p{L}\p{N}]/u.test(terms.at(-1) ?? '') && /[\p{L}\p{N}]/u.test(characters[capacity] ?? '')) {
    // Avoid half an English word at the provider limit, while still retaining
    // a bounded query for languages that do not put spaces between words.
    terms = terms.replace(/\s+[a-z\d]{1,24}$/iu, '');
  }
  if (focus && capacity < topicLimit) terms += ' ' + focus;
  if (!originalSource && !requestsPrimaryPublisherTable) return { query: sites ? terms + ' ' + sites : terms, officialDomains };

  // Keep the requested work searchable when dropping formatting and citation instructions.
  // Only the checked topic and a fixed source type go to the provider.
  const requestedSource = originalSource?.[2].toLowerCase() ?? 'table';
  const source = requestedSource === 'source' && publishedWorkTopic.test(terms) ? 'publication' : requestedSource;
  const qualifier = originalSource?.[1].toLowerCase() === 'final' ? 'final' : 'original';
  const subject = terms.replace(/^(?:(?:find|compare)\s+)?(?:the\s+)?/iu, '');
  // A named, versioned work is a stronger retrieval target than its subtopic.
  // Keep the latter in the provider's question so its excerpts can address it.
  const versionedWork = officialDomains.length && source !== 'dataset' && (source !== 'source' || publishedWorkTopic.test(subject))
    ? versionedWorkDetail.exec(subject)
    : undefined;
  const publicationQuery = versionedWork && versionedWork.index > 0
    ? `"${subject.slice(0, versionedWork.index).trim()}" ${versionedWork[1]}`
    : terms;
  const searchTerms = [...publicationQuery].length <= topicLimit ? publicationQuery : terms;
  const publicationTerm = !scopedPublicationHosts && source !== 'source' && !searchTerms.toLowerCase().includes(source)
    && [...searchTerms].length + source.length + 1 <= topicLimit ? ' ' + source : '';
  return {
    query: [searchTerms + publicationTerm, sites].filter(Boolean).join(' '),
    officialDomains,
    originalSourceQuestion: requestedSource === 'table' ? `Source table: ${subject}` : `Find the ${qualifier} ${source} for ${subject}.`,
  };
}
