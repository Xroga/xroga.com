/** Narrow negative checks for known unsafe authorization claims. */
export function requiresAuthorizationReview(answer: string): boolean {
  const prose = answer.replace(/```[^\n]*\n[\s\S]*?```/g, '').replace(/^\s*>.*$/gm, '').replace(/[`*_]/g, '');
  const sentences = prose.split(/(?<=[.!?])\s+|\n+/);
  // The observed answer omitted revocation entirely while deriving tenant
  // authority from a token. A normal stop is not evidence of current access.
  const derivesTenantFromJwt = sentences.some(sentence => /\b(?:reads|extracts|derives)\b[^.!?\n]{0,160}\btenant\b[^.!?\n]{0,160}\bJWT\b/i.test(sentence));
  const mentionsCurrentMembership = /\b(?:current|live|fresh)[^.!?\n]{0,80}\b(?:membership|permissions?|roles?)\b/i.test(prose);
  if (derivesTenantFromJwt && !mentionsCurrentMembership) return true;
  return sentences.some(sentence => {
    if (/^\s*(?:incorrect|false|myth|do not|don't|never|avoid|wrong)\b/i.test(sentence)) return false;
    // An affirmative credential/session conflation is unsafe even when a later
    // paragraph correctly describes RLS. A disclaimer cannot validate that step.
    const serviceRoleSession = /\b(?:user(?:'s)?\s+)?service[- ]?role\s+session\b/i.test(sentence);
    if (serviceRoleSession && !/\b(?:incorrect|invalid|unsafe|misleading|not a valid|does not exist)\b/i.test(sentence)) return true;
    if (/\bservice[- ]?role\b[^.!?\n]{0,100}\b(?:enforces?|honou?rs?|obeys?|respects?)\s+(?:tenant\s+)?(?:RLS|row.level security)\b/i.test(sentence)) return true;
    // Billing state and tenant scope must come from server-verified facts. A sentence that negates the
    // behaviour ("never trust", "instead of", "must not") is guidance against it, not an endorsement.
    if (!/\b(?:never|not|n't|instead of|rather than|without|cannot|avoid)\b/i.test(sentence)) {
      const clientBillingAuthority = /\b(?:success (?:page|url)|redirect(?:s|ed)?|client[- ]side (?:code|callback)|browser|frontend|client-reported)\b[^.!?\n]{0,120}\b(?:grants?|unlocks?|activates?|enables?|marks?|confirms?)\b[^.!?\n]{0,80}\b(?:paid|premium|pro|subscription|plan|billing|payment|access)\b/i.test(sentence);
      const clientTenantAuthority = /\b(?:tenant[ _]?id|organi[sz]ation[ _]?id|org[ _]?id)\b[^.!?\n]{0,80}\b(?:from|in|sent in|passed in|taken from)\b[^.!?\n]{0,60}\b(?:request body|query (?:string|parameter)|url parameter|request header|client request)\b[^.!?\n]{0,100}\b(?:to (?:authorize|scope|decide|grant)|is trusted|as authority|directly)\b/i.test(sentence);
      if (clientBillingAuthority || clientTenantAuthority) return true;
    }
    return /\b(?:RLS|row.level security)\b[^.!?\n]{0,180}\b(?:cannot|can't|can not) be bypassed\b/i.test(sentence)
      || /\b(?:JWT(?: claims| tokens)?|appmetadata(?: claims)?)\s+(?:alone\s+)?(?:provides?|guarantees?|ensures?|proves?|supports?)\s+(?:immediate|instant)\s+revocation\b/i.test(sentence);
  });
}
