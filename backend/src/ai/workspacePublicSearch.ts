import { explicitlyDisablesResearch } from '../lib/taskClassifier.js';
import { containsCredentialSecretText } from '../security/egress/dataClassification.js';
import { publicHttpsUrl } from '../security/egress/urlPolicy.js';
import { DEEPSEEK_QUERY_MAX } from './researchSearchProvider.js';

const publicLookup = /\b(?:search|browse|research|look up|find|compare|current(?:ly)?|latest|today(?:'s)?|now|recent(?:ly)?|live|up[- ]to[- ]date|this (?:week|month|year|weekend))\b/iu;
const publicFactSubject = /\b(?:price[s]?|fares?|exchange rates?|stock quotes?|weather|forecast[s]?|official announcement[s]?|news|publication[s]?|press release[s]?|release[s]?|documentation|docs|version[s]?|changelog[s]?|schedule[s]?|timetable[s]?|current developments?|recent developments?|dates?|hours|airport[s]?|flights?|results?|public holidays?|regulation[s]?|standards?|lifespans?|habitats?|populations?|historical timelines?)\b/iu;
const weatherLookup = /^(?:what(?:['’]s| is)\s+(?:the\s+)?)?(?:weather(?: forecast)?|forecast)\s+(?:in|for|at)\s+\p{L}[\p{L}\p{M} .,'’-]{1,75}[?!]?$/iu;
const publicOfficeLookup = /^who\s+(?:is|was)\s+(?:the\s+)?(?:current\s+)?(?:president|prime minister|governor|mayor|chief executive officer|ceo)\s+of\s+\p{L}[\p{L}\p{M} .,'’-]{1,75}[?!]?$/iu;
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
const privateOrContextual = /\b(?:my|our|your|mine|ours|private|confidential|proprietary|internal|secret|password|token|credentials?|non[- ]?public|unpublished|unreleased|attached|upload(?:ed)?|above|screenshot|spreadsheet|inbox|mailbox|date of birth|home address|social security|passport|do not share|(?:this|current|selected|active)\s+(?:project|repository|repo|workspace)|(?:as|we) discussed|earlier (?:chat|message)|(?:customer|client|patient|employee|account|order|tracking) (?:data|records?|details|list|notes|numbers?|ids?|addresses?))\b/iu;
const privateDiscoveryContext = /\b(?:crm|(?:these|those)\s+(?:compan(?:y|ies)|providers|vendors|customers)|(?:the\s+)?previous\s+(?:answer|message|conversation)|customer\s+(?:names?|information)|nuest(?:ro|ra|ros|ras)|confidencial|privad[oa]s?|intern[oa]s?|adjunt[oa]s?|notre|confidentiel\w*|privé\w*|internes?|unser\w*)\b|بياناتنا|الداخلية|سري(?:ة)?|ملفاتي|ملفنا|المرفق|حسابي|ہماری|میرے|خفیہ|اندرونی|हमार[ाेी]|मेरे|मेरी|गोपनीय|आंतरिक|संलग्न|我的|我们的|内部|机密|客户名单|附件/iu;
const personalLookup = /\b(?:who (?:is|was)|contact (?:info(?:rmation)?|details)|phone numbers?|email addresses?|personal (?:info(?:rmation)?|details|records?)|background checks?|where (?:does|did) .+ (?:live|work))\b/iu;
const specificIdentityOrUrl = /(?:\b[a-z][a-z\d+.-]*:\/\/|(?:\p{N}[ ().-]*){7,})/iu;
const bareDomain = /(?<![\p{L}\p{N}.-])(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}(?![\p{L}\p{N}-])/giu;
const officialSourceRequest = /\bofficial(?:\s+[\p{L}\p{N}-]+){0,3}\s+(?:sources?|docs?|documentation|sites?)\b/iu;
const exclusiveOfficialSource = /\b(?:only|exclusively)\b[^.!?]{0,40}\bofficial\b|\bofficial\b[^.!?]{0,40}\b(?:only|exclusively)\b/iu;
const unavailableDomain = /(?:\.(?:example|onion|lan|home|corp)$|(?:^|\.)(?:intranet|staging|private|vpn)(?:\.|$))/iu;
const explicitWebLookup = /^(?:please\s+)?(?:search|browse)\s+(?:the\s+)?(?:public\s+)?(?:web|internet)\s+(?:(?:for|to)\s+)?/iu;
const explanatoryLookup = /^(?:(?:explain|describe|define|compare)\s+|(?:how|why)\s+(?!to\b)|what\s+(?:is|are)\s+(?:the\s+)?(?:differences?|definitions?|meanings?)\s+(?:of|between)\s+)/iu;
const citationFooter = /(?:[,.]\s*|(?<!\s)\s+)(?:and\s+)?(?:cite\s+(?:(?:your|the)\s+)?sources?|include\s+(?:(?:your|the)\s+)?(?:source\s+links|citations))[?!.]*$/iu;
const instructionStart = /^(?:please\s+)?(?:(?:search|browse)\s+(?:(?:the\s+)?(?:public\s+)?(?:web|internet)\s+)?(?:for\s+)?|look up\s+|research\s+|what\s+(?:is|are)\s+(?:the\s+)?)/iu;
const sourcePreface = /^(?:using|from|with)\s+(?:only\s+)?official\s+[^.!?]+[.!?]\s*/iu;

function isPublicSourceHost(domain: string): boolean {
  if (unavailableDomain.test(domain)) return false;
  try { return publicHttpsUrl('https://' + domain).hostname === domain; }
  catch { return false; }
}

/** Egress still needs exact review when a request actually refers to private,
 * personal or conversation data. A bare routing miss is not such evidence. */
export function workspaceSearchNeedsExactReview(prompt: string): boolean {
  const request = prompt.trim().replace(citationFooter, '');
  return containsCredentialSecretText(prompt) || privateOrContextual.test(request)
    || privateDiscoveryContext.test(request) || (personalLookup.test(request) && !publicOfficeLookup.test(request));
}

/** A public lookup sends only terms from this turn. The semantic planner can
 * select research, but cannot declassify its input. */
export function workspacePublicSearchQuery(prompt: string, officialOnly = false): {
  query: string; officialDomains: string[];
} | undefined {
  const message = prompt.trim();
  if (!message || message.length > 32_000) return;
  // A presentation-only footer such as "cite your sources" carries no search
  // terms. Leave everything else in the turn subject to the privacy checks.
  const request = message.replace(citationFooter, '').trimEnd();
  const publicOffice = publicOfficeLookup.test(request);
  const discovery = discoveryIntent.test(request) && (discoverySubject.test(request)
    || (request.toLowerCase().match(/\b[a-z]{7,}\b/g) ?? []).some(word => discoverySpellings.has(categorySpellingKey(word))));
  if ((!publicLookup.test(request) && !discovery && !weatherLookup.test(request) && !publicOffice)
    || explicitlyDisablesResearch(message)
    || workspaceSearchNeedsExactReview(message) || specificIdentityOrUrl.test(request)
    || !/^[\p{L}\p{M}\p{N}\p{Sc} ,.'’!?()&–،؟。？！、-]+$/u.test(request)) return;

  // A domain becomes a filter only when the user supplied it in this request
  // with an official-source restriction. Neither a model nor history adds hosts.
  const asksForOfficial = officialSourceRequest.test(request);
  const officialDomains = [...new Set([...request.matchAll(bareDomain)].map(([host]) => host.toLowerCase()))];
  if (officialDomains.length && (!asksForOfficial || !officialDomains.every(isPublicSourceHost))) return;
  // A model's inferred source policy must never add hosts or turn a public
  // comparison into a sensitive-data approval. An explicit official-source
  // restriction still requires a literal, verifiable domain.
  if (!officialDomains.length && (exclusiveOfficialSource.test(request) || officialOnly && asksForOfficial)) return;
  const explicitExplanation = explicitWebLookup.test(request)
    && explanatoryLookup.test(request.replace(explicitWebLookup, ''));
  if (!officialDomains.length && !publicFactSubject.test(request) && !explicitExplanation && !discovery && !publicOffice) return;

  const topic = request.replace(bareDomain, '').replace(/\(\s*\)/g, '')
    .replace(explicitWebLookup, '').replace(instructionStart, '').replace(sourcePreface, '')
    .replace(/[,.]?\s+(?:and\s+)?cite\s+[^.!?]+[.!?]*$/iu, '')
    .replace(/[?.!؟。？！]+$/u, '').trim();
  const sites = officialDomains.map(domain => 'site:' + domain).join(' OR ');
  const topicLimit = DEEPSEEK_QUERY_MAX - (sites ? sites.length + 1 : 0);
  if (topicLimit < 1 || !/\p{L}/u.test(topic)
    || /^(?:(?:the\s+)?(?:public\s+)?(?:web|internet)|for)$/iu.test(topic)) return;
  const terms = [...topic].slice(0, topicLimit).join('').trimEnd();
  return { query: sites ? terms + ' ' + sites : terms, officialDomains };
}
