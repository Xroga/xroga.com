import { explicitlyDisablesResearch } from '../lib/taskClassifier.js';
import { containsCredentialSecretText } from '../security/egress/dataClassification.js';
import { publicHttpsUrl } from '../security/egress/urlPolicy.js';
import { DEEPSEEK_QUERY_MAX } from './researchSearchProvider.js';

const publicLookup = /\b(?:search|browse|research|look up|find|compare|current(?:ly)?|latest|newest|today(?:'s)?|now|recent(?:ly)?|live|up[- ]to[- ]date|this (?:week|month|year|weekend))\b/iu;
const publicFactSubject = /\b(?:prices?|pricing|fares?|exchange rates?|stock quotes?|weather|forecasts?|official announcements?|news|publications?|press releases?|releases?|documentation|docs|versions?|changelogs?|deprecations?|updates?|changes?|schedules?|timetables?|current developments?|recent developments?|dates?|hours|airports?|flights?|results?|public holidays?|regulations?|standards?|lifespans?|habitats?|populations?|historical timelines?)\b/iu;
const weatherLookup = /^(?:what(?:['’]s| is)\s+(?:the\s+)?)?(?:weather(?: forecast)?|forecast)\s+(?:in|for|at)\s+\p{L}[\p{L}\p{M} .,'’-]{1,75}[?!]?$/iu;
const publicOfficeLookup = /^who\s+(?:is|was)\s+(?:the\s+)?(?:current\s+)?(?:president|prime minister|governor|mayor|chief executive officer|ceo)\s+of\s+\p{L}[\p{L}\p{M} .,'’-]{1,75}[?!]?$/iu;
const publicInstitutionLeadership = /^[Ww]ho (?:currently )?(?:leads|heads) (?:the )?[A-Z][A-Z0-9]{1,15}[?!]?$/u;
const publicPolicyPublisher = /\b(?:which|what)\s+(?:government(?:al)?\s+)?(?:agency|department|ministry|regulator|commission|public authority|city council)\s+(?:recently\s+)?(?:published|issued|released|announced)\b[^.!?]{0,96}\b(?:polic(?:y|ies)|guidance|directives?|rules?)\b/iu;
const publicSourceLookup = /\b(?:summari[sz]e|check|compare|find|cite|link)\b[^.!?;]{0,90}\b(?:dated |recent |current )?public sources?\b/iu;
// Implicit discovery covers entities with public descriptions and observable
// rankings. The semantic plan decides whether retrieval is useful. These
// independent signals only admit a self-contained query from the current turn.
const discoveryIntent = /\b(?:best|top|rank(?:ed|ing|ings)?|leading|leaders|recommend\w*|compar(?:e|ison)|latest|recent|current\w*|most popular|market share|mejores?|principales|comparar|recientes?|meilleurs?|principaux|comparer|récents?|melhores|principais|comparação|neueste\w*|beste\w*|vergleich)\b|أفضل|أبرز|مقارنة|أحدث|सबसे\s+(?:अच्छ[ीेा]|बेहतर)|शीर्ष|तुलना|नवीनतम|最好|领先|排名|比较|最新/iu;
const discoverySubject = /\b(?:compan(?:y|ies)|businesses|firms|providers?|services?|vendors?|brands?|products?|platforms?|models?|industr(?:y|ies)|markets?|universit(?:y|ies)|colleges?|schools?|museums?|destinations?|hotels?|restaurants?|vehicles?|cars?|airlines?|libraries|frameworks?|tools?|software|empresas?|universidades?|proveedores?|servicios?|productos?|modelos?|entreprises?|universités?|fournisseurs?|produits?|marchés?|unternehme[nr]|anbieter|universitäten)\b|شرك(?:ات|ة)|جامع(?:ات|ة)|منتج(?:ات)?|مزود|خدمات|कंपन(?:ियाँ|ियाँ|ियां|ी)|विश्वविद्यालय|उत्पाद|सेवा|मॉडल|公司|企业|大学|产品|服务|模型/iu;
// Preserve the literal search terms while tolerating transposed characters
// in longer category words. A spelling match cannot exempt any privacy check.
const categorySpellingKey = (word: string) => word.slice(0, 3) + ':' + [...word.slice(3)].sort().join('');
const discoverySpellings = new Set([
  'company', 'companies', 'providers', 'services', 'products', 'platforms', 'universities',
  'colleges', 'destinations', 'restaurants', 'airlines', 'libraries', 'frameworks', 'software',
].map(categorySpellingKey));
const privateOrContextual = /\b(?:my|our|your|mine(?!\s+(?:production|output)\b)|ours|private|confidential|proprietary|internal|secret|password|token|credentials?|non[- ]?public|unpublished|unreleased|attached|upload(?:ed)?|above|screenshot|spreadsheet|inbox|mailbox|date of birth|home address|social security|passport|do not share|(?:this|current|selected|active)\s+(?:project|repository|repo|workspace)|(?:as|we) discussed|earlier (?:chat|message)|(?:customer|client|patient|employee|account|order|tracking) (?:data|records?|details|list|names?|notes|numbers?|ids?|addresses?))\b/iu;
const privateDiscoveryContext = /\b(?:crm|(?:these|those)\s+(?:compan(?:y|ies)|providers|vendors|customers)|(?:the\s+)?previous\s+(?:answer|message|conversation)|customer\s+(?:names?|information)|nuest(?:ro|ra|ros|ras)|confidencial|privad[oa]s?|intern[oa]s?|adjunt[oa]s?|notre|confidentiel\w*|privé\w*|internes?|unser\w*)\b|بياناتنا|الداخلية|سري(?:ة)?|ملفاتي|ملفنا|المرفق|حسابي|ہماری|میرے|خفیہ|اندرونی|हमार[ाेी]|मेरे|मेरी|गोपनीय|आंतरिक|संलग्न|我的|我们的|内部|机密|客户名单|附件/iu;
const personalLookup = /\b(?:who (?:is|was)|contact (?:info(?:rmation)?|details)|phone numbers?|email addresses?|personal (?:info(?:rmation)?|details|records?)|background checks?|where (?:does|did) .+ (?:live|work))\b/iu;
const specificIdentityOrUrl = /(?:\b[a-z][a-z\d+.-]*:\/\/|(?:\p{N}[ ().-]*){7,})/iu;
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
const explanatoryLookup = /^(?:(?:explain|describe|define|compare)\s+|(?:how|why)\s+(?!to\b)|what\s+(?:is|are)\s+(?:the\s+)?(?:differences?|definitions?|meanings?)\s+(?:of|between)\s+)/iu;
const contextDependentTopic = /^(?:this|that|these|those|it|them|the same|the previous|the earlier)\b|\b(?:we (?:talked|spoke) about|what (?:i|we) (?:said|shared)|the (?:previous|earlier) (?:topic|result|item|one))\b/iu;
const privateTopicLookup = /\b(?:birthdates?|whereabouts|real name|social profiles?|contact details?|personal (?:phone|email|address))\b/iu;
const personLocationLookup = /^(?:\p{L}+\s+){1,2}\p{L}+\s+(?:in|at|near|from)\s+\p{L}/iu;
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

/** Explicit public Search can take an unfamiliar subject from the typed turn.
 * Require a self-contained description before admitting an otherwise unknown phrase. */
function isStandaloneSearchTopic(topic: string): boolean {
  if (contextDependentTopic.test(topic) || privateTopicLookup.test(topic)) return false;
  if (explanatoryLookup.test(topic)) return true;
  const subject = topic.replace(/^(?:an?\s+)?(?:explanation|overview|guide|introduction)\s+(?:of|to|about)\s+/iu, '');
  // A short person-name-like lookup remains ambiguous without a public role or
  // factual qualifier. Longer explanatory phrases do not need a topic allowlist.
  if (subject !== topic) {
    return (subject.match(/\p{L}[\p{L}\p{M}]*/gu)?.length ?? 0) >= 3
      && !/^(?:\p{Lu}\p{Ll}+[\s-]+){1,3}\p{Lu}\p{Ll}+[.!?]*$/u.test(subject)
      && !contextDependentTopic.test(subject) && !personLocationLookup.test(subject);
  }
  return !personLocationLookup.test(subject) && /\b(?:for|of|about|between|versus|using)\s+\p{L}/iu.test(subject);
}

function publicOfficeTopic(prompt: string): string | undefined {
  const topic = prompt.split(/(?<=\?)\s+/, 1)[0].trim();
  if (publicOfficeLookup.test(topic) || publicInstitutionLeadership.test(topic)) return topic;
}

/** Public lookup terms must be self-contained and safe to send to Search. */
export function hasNonPublicSearchTerms(prompt: string): boolean {
  const request = prompt.trim().replace(citationFooter, '').replace(presentationInstruction, '');
  const office = publicOfficeTopic(request);
  return containsCredentialSecretText(prompt) || privateOrContextual.test(request)
    || privateDiscoveryContext.test(request) || personalLookup.test(office ? request.slice(office.length) : request);
}

/** A public lookup sends only terms from this turn. The semantic planner can
 * select research, but cannot declassify its input. */
export function workspacePublicSearchQuery(prompt: string, officialOnly = false): {
  query: string; officialDomains: string[]; originalSourceQuestion?: string;
} | undefined {
  const message = prompt.trim();
  if (!message || message.length > 32_000) return;
  // Instructions about how to explain a result carry no retrieval terms.
  // Keep each qualifier and subsequent clause subject to the privacy checks.
  const request = message.replace(publicSourcePreface, '').replace(citationFooter, '').replace(presentationInstruction, '')
    .replace(linkFooter, '').replace(currencyPeriod, '$1 per $2').replace(/\s*;\s*/g, ', ').trimEnd();
  const publicOffice = publicOfficeTopic(request) !== undefined;
  const officialLookup = requestsOfficialLinkCoverage(request) || publicSourceLookup.test(request);
  const explicitLookup = explicitlyRequestsWorkspaceWebSearch(request);
  const namedSource = namedSourceClause.exec(request) ?? publisherSourceClause.exec(request);
  const publisherDomains = namedSource ? namedPublisherDomains(namedSource[1]) : [];
  if (namedSource && /\b(?:only|exclusively)\b/iu.test(namedSource[0]) && !publisherDomains.length && !namedSource[0].includes('(')) return;
  const discovery = discoveryIntent.test(request) && (discoverySubject.test(request)
    || (request.toLowerCase().match(/\b[a-z]{7,}\b/g) ?? []).some(word => discoverySpellings.has(categorySpellingKey(word))));
  if ((!explicitLookup && !publicLookup.test(request) && !discovery && !weatherLookup.test(request) && !publicOffice && !officialLookup && !publisherDomains.length)
    || explicitlyDisablesResearch(message)
    || hasNonPublicSearchTerms(message) || specificIdentityOrUrl.test(message)
    || !/^[\p{L}\p{M}\p{N}\p{Sc} ,.'’!?()&–،؟。？！、-]+$/u.test(request)) return;

  // A domain becomes a filter only when the user supplied it in this request
  // with an official-source restriction. Neither a model nor history adds hosts.
  const asksForOfficial = officialSourceRequest.test(request);
  const isSoftwareName = (host: string) => softwareReleaseSubject.test(request) && publicSoftwareNames.has(host.toLowerCase());
  const explicitDomains = [...new Set([...request.matchAll(bareDomain)].map(([host]) => host.toLowerCase()).filter(host => !isSoftwareName(host)))];
  if (explicitDomains.length && (!asksForOfficial || !explicitDomains.every(isPublicSourceHost))) return;
  if (publisherDomains.length && explicitDomains.some(host => !publisherDomains.some(domain => host === domain || host.endsWith('.' + domain)))) return;
  const officialDomains = explicitDomains.length ? explicitDomains : publisherDomains;
  // A model's inferred source policy must never add hosts or turn a public
  // comparison into a sensitive-data approval. A request to cite one official
  // reference still permits discovering sources.
  const requestsOfficialCitation = officialVerificationFooter.test(request);
  if (!officialDomains.length && (exclusiveOfficialSource.test(request)
    || officialOnly && asksForOfficial && !requestsOfficialCitation && !officialLookup)) return;
  const publicFact = publicFactSubject.test(request) || publicPolicyPublisher.test(request);

  const scopedRequest = namedSource && (publisherDomains.length || explicitDomains.length && namedSource[0].includes('('))
    ? [request.slice(0, namedSource.index).trimEnd(),
        request.slice(namedSource.index + namedSource[0].length).replace(/^[\s,.:!?]+/u, '')].filter(Boolean).join(' ')
    : request;
  const topic = scopedRequest.replace(bareDomain, host => isSoftwareName(host) ? host : '').replace(/\(\s*\)/g, '')
    .replace(explicitWebLookup, '').replace(instructionStart, '').replace(sourcePreface, '').replace(instructionStart, '')
    .replace(presentationAfterTopic, '').replace(answerOnlySuffix, '')
    .replace(/[,.]?\s+(?:and\s+)?cite\s+[^.!?]+[.!?]*$/iu, '')
    .replace(/[?.!؟。？！]+$/u, '').trim();
  if (!officialDomains.length && !publicFact && !discovery && !publicOffice && !officialLookup
    && !(explicitLookup && isStandaloneSearchTopic(topic))) return;
  const sites = officialDomains.map(domain => 'site:' + domain).join(' OR ');
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
  const originalSource = originalSourceRequest.exec(message);
  const requestsPrimaryPublisherTable = officialDomains.length > 0 &&
    /\b(?:cite|link(?:\s+to)?|use|find|include)\s+(?:the\s+)?(?:primary|original|final)\s+(?:[\p{L}.-]+\s+){0,4}table\b/iu.test(message);
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
  const publicationTerm = source !== 'source' && !searchTerms.toLowerCase().includes(source)
    && [...searchTerms].length + source.length + 1 <= topicLimit ? ' ' + source : '';
  return {
    query: [searchTerms + publicationTerm, sites].filter(Boolean).join(' '),
    officialDomains,
    originalSourceQuestion: `Find the ${qualifier} ${source} for ${subject}.`,
  };
}
