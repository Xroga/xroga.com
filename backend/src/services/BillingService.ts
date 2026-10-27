import crypto, {
  randomUUID,
} from 'node:crypto';

import {
  getSupabaseAdmin,
} from '../config/supabase.js';

import {
  GALACTIC_PLANS,
  getPlanByTier,
} from '../config/plans.js';

import {
  getProviderEntitlementStatus,
} from '../ai/providerBudget.js';
import {readWhopCheckoutOwner,whopCheckoutOwnerFromResponse} from './whopCheckoutOwnership.js';
import {requireTenantContext,requireResourceOwner,type TenantContext} from '../security/tenantContext.js';
import {authorityContextForPermit,consumeAuthorityPermit,AuthorityError} from '../security/authority/enforce.js';
import type {AuthorityPermit} from '../security/authority/types.js';
import {actionPlanDigest,businessActionAuthorityScope,snapshotBusinessActionPlan,type BusinessActionPlan} from './integrations/businessAction.js';
import {enforceEgress,EgressDenied} from '../security/egress/egressPolicy.js';
import {persistSecurityDecision} from '../security/egress/securityDecision.js';
import {isDeepStrictEqual} from 'node:util';


export const WHOP_API_VERSION_DATE =
  '2026-09-06';

export const WHOP_WEBHOOK_MAX_AGE_SECONDS =
  300;


const WHOP_API_BASE =
  'https://api.whop.com/api/v1';

const EXPECTED_TIER =
  'spark';

const EXPECTED_SOURCE =
  'xroga';

const APPROVED_ACCOUNT_ID =
  'biz_qhYONL4RebGX96';

const APPROVED_PLAN_ID =
  'plan_hlV1A10I5QfSP';

const APPROVED_REDIRECT_URL =
  'https://xroga.com/workspace?billing=success';


export type WhopEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'membership.activated'
  | 'membership.cancel_at_period_end_changed'
  | 'membership.deactivated'
  | 'refund.created'
  | 'refund.updated'
  | 'dispute.created'
  | 'dispute.updated';


export interface WhopWebhookEvent {
  id?: string;

  type?:
    | WhopEventType
    | string;

  account_id?: string;
  company_id?: string;

  api_version?: string;
  api_version_date?: string;

  data?: Record<
    string,
    unknown
  >;
}


export interface BillingStatus {
  plan:
    | 'free'
    | 'spark'
    | 'historical';

  publicPlanName:
    string;

  isPaid:
    boolean;

  billingProvider:
    | 'whop'
    | null;

  billingStatus:
    string | null;

  renewalPeriodEnd:
    string | null;

  cancelAtPeriodEnd:
    boolean;

  manageAvailable:
    boolean;

  /**
   * Internal only.
   *
   * Do not render this as a pricing
   * feature or customer-facing limit.
   */
  allowance: {
    concurrency:
      number;
  };

  features: {
    workspace:
      boolean;

    repositories:
      boolean;

    previews:
      boolean;

    fullAccessPacing:
      boolean;

    higherConcurrency:
      boolean;
  };

  entitlement:
    Awaited<
      ReturnType<
        typeof getProviderEntitlementStatus
      >
    >;
}


export class BillingServiceError
  extends Error {

  constructor(
    public readonly code:
      | 'external_setup_required'
      | 'subscription_not_found'
      | 'provider_unavailable'
      | 'storage_unavailable'
      | 'plan_mismatch',

    message:
      string,

    public readonly statusCode:
      number,
  ) {
    super(message);
  }
}


function requiredConfig() {
  const apiKey =
    process.env.WHOP_API_KEY?.trim() ??
    '';

  const accountId =
    process.env.WHOP_COMPANY_ID?.trim() ??
    '';

  const planId =
    process.env.WHOP_PLAN_ID?.trim() ??
    '';

  const redirectUrl =
    process.env.WHOP_REDIRECT_URL?.trim() ??
    '';

  if (
    !apiKey ||
    !accountId ||
    !planId ||
    !redirectUrl
  ) {
    throw new BillingServiceError(
      'external_setup_required',
      'Xroga Pro checkout is not configured',
      409,
    );
  }

  if (
    accountId !==
      APPROVED_ACCOUNT_ID ||
    planId !==
      APPROVED_PLAN_ID
  ) {
    throw new BillingServiceError(
      'plan_mismatch',
      'Xroga Pro billing configuration does not match the approved plan',
      503,
    );
  }

  if (
    redirectUrl !==
    APPROVED_REDIRECT_URL
  ) {
    throw new BillingServiceError(
      'plan_mismatch',
      'Xroga Pro redirect configuration is invalid',
      503,
    );
  }

  return {
    apiKey,
    accountId,
    planId,
    redirectUrl,
  };
}


function whopHeaders(
  apiKey: string,
  extra?: Record<
    string,
    string
  >,
): Record<string, string> {

  return {
    Authorization:
      `Bearer ${apiKey}`,

    Accept:
      'application/json',

    'Content-Type':
      'application/json',

    'Api-Version-Date':
      WHOP_API_VERSION_DATE,

    ...extra,
  };
}


function safeWhopUrl(
  value: unknown,
  label: string,
): string {

  if (
    typeof value !==
      'string' ||
    !value.trim()
  ) {
    throw new BillingServiceError(
      'provider_unavailable',
      `${label} was not returned by Whop`,
      502,
    );
  }

  let url: URL;

  try {
    url =
      new URL(value);
  } catch {
    throw new BillingServiceError(
      'provider_unavailable',
      `${label} returned an invalid destination`,
      502,
    );
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (
      url.hostname !==
        'whop.com' &&
      !url.hostname.endsWith(
        '.whop.com',
      )
    )
  ) {
    throw new BillingServiceError(
      'provider_unavailable',
      `${label} returned an unsafe destination`,
      502,
    );
  }

  return url.toString();
}


function pickString(
  record:
    Record<string, unknown>,

  ...keys:
    string[]
): string {

  for (
    const key
    of keys
  ) {
    const value =
      record[key];

    if (
      typeof value ===
        'string' &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return '';
}


function nestedRecord(
  value: unknown,
): Record<string, unknown> {

  return (
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(value)
  )
    ? value as Record<
        string,
        unknown
      >
    : {};
}


function parseDate(
  value: unknown,
): Date | null {

  if (
    typeof value !==
      'string' ||
    !value.trim()
  ) {
    return null;
  }

  const date =
    new Date(value);

  return Number.isFinite(
    date.getTime(),
  )
    ? date
    : null;
}


export function checkoutIdempotencyKey(
  userId:
    string,

  now =
    Date.now(),
): string {

  const fiveMinuteWindow =
    Math.floor(
      now / 300_000,
    );

  return (
    `xroga-checkout-${
      crypto
        .createHash('sha256')
        .update(
          `${userId}:${fiveMinuteWindow}`,
        )
        .digest('hex')
    }`
  );
}


function whopPlanContractMismatches(
  plan:
    Record<string, unknown>,

  expectedPlanId:
    string,
): string[] {

  const mismatch:
    string[] = [];

  if (
    pickString(
      plan,
      'id',
    ) !==
    expectedPlanId
  ) {
    mismatch.push(
      'plan_id',
    );
  }

  if (
    pickString(
      plan,
      'plan_type',
    ) !==
    'renewal'
  ) {
    mismatch.push(
      'plan_type',
    );
  }

  if (
    Number(
      plan.renewal_price,
    ) !==
    25
  ) {
    mismatch.push(
      'renewal_price',
    );
  }

  if (
    Number(
      plan.billing_period,
    ) !==
    30
  ) {
    mismatch.push(
      'billing_period',
    );
  }

  if (
    plan.trial_period_days !=
      null &&
    Number(
      plan.trial_period_days,
    ) !==
      0
  ) {
    mismatch.push(
      'trial',
    );
  }

  if (
    pickString(
      plan,
      'currency',
    ).toLowerCase() !==
    'usd'
  ) {
    mismatch.push(
      'currency',
    );
  }

  const purchaseUrl =
    pickString(
      plan,
      'purchase_url',
    );

  if (
    purchaseUrl &&
    !/^https:\/\//.test(
      purchaseUrl,
    )
  ) {
    mismatch.push(
      'purchase_url',
    );
  }

  return mismatch;
}


function assertWhopPlanTerms(
  plan:
    Record<string, unknown>,

  expectedPlanId:
    string,
): void {

  const mismatch =
    whopPlanContractMismatches(
      plan,
      expectedPlanId,
    );

  if (
    mismatch.length
  ) {
    throw new BillingServiceError(
      'plan_mismatch',
      `Whop plan contract mismatch: ${mismatch.join(',')}`,
      503,
    );
  }
}


export function assertWhopPlanContract(
  plan:
    Record<string, unknown>,

  expectedAccountId:
    string,

  expectedPlanId:
    string,
): void {

  const companyId =
    pickString(
      plan,
      'account_id',
      'company_id',
    ) ||
    pickString(
      nestedRecord(
        plan.company,
      ),
      'id',
    );

  if (
    companyId !==
    expectedAccountId
  ) {
    throw new BillingServiceError(
      'plan_mismatch',
      'Whop plan contract mismatch: account_id',
      503,
    );
  }

  assertWhopPlanTerms(
    plan,
    expectedPlanId,
  );
}


function whopPlanOwnerId(
  plan:
    Record<string, unknown>,
): string {

  return (
    pickString(
      plan,
      'account_id',
      'company_id',
    ) ||
    pickString(
      nestedRecord(
        plan.company,
      ),
      'id',
    )
  );
}


export function verifyWhopWebhookSignature(
  rawBody:
    string,

  headers: {
    id?: string;
    timestamp?: string;
    signature?: string;
  },

  secret =
    process.env
      .WHOP_WEBHOOK_SECRET,

  nowMs =
    Date.now(),
): boolean {

  if (
    !secret ||
    !headers.id ||
    !headers.timestamp ||
    !headers.signature
  ) {
    return false;
  }

  if (
    !/^\d+$/.test(
      headers.timestamp,
    )
  ) {
    return false;
  }

  const timestampSeconds =
    Number(
      headers.timestamp,
    );

  if (
    !Number.isSafeInteger(
      timestampSeconds,
    ) ||
    Math.abs(
      Math.floor(
        nowMs / 1000,
      ) -
      timestampSeconds,
    ) >
      WHOP_WEBHOOK_MAX_AGE_SECONDS
  ) {
    return false;
  }


  let key:
    Buffer;

  try {
    if (
      secret.startsWith(
        'whsec_',
      )
    ) {
      const encoded =
        secret.slice(
          'whsec_'.length,
        );

      if (
        !encoded ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(
          encoded,
        )
      ) {
        return false;
      }

      key =
        Buffer.from(
          encoded,
          'base64',
        );

      if (
        key.length < 24 ||
        key.length > 64
      ) {
        return false;
      }
    } else {
      key =
        Buffer.from(
          secret,
          'utf8',
        );
    }
  } catch {
    return false;
  }


  const expected =
    crypto
      .createHmac(
        'sha256',
        key,
      )
      .update(
        `${headers.id}.${headers.timestamp}.${rawBody}`,
      )
      .digest();


  const candidates =
    headers.signature
      .split(/\s+/)
      .flatMap(
        (part) => {
          const [
            version,
            signature,
          ] =
            part.split(
              ',',
              2,
            );

          return (
            version ===
              'v1' &&
            signature
          )
            ? [signature]
            : [];
        },
      );


  return candidates.some(
    (candidate) => {

      if (
        !/^[A-Za-z0-9+/]+={0,2}$/.test(
          candidate,
        )
      ) {
        return false;
      }

      const actual =
        Buffer.from(
          candidate,
          'base64',
        );

      return (
        actual.length ===
          expected.length &&
        crypto.timingSafeEqual(
          actual,
          expected,
        )
      );
    },
  );
}


let verifiedPlanUntil =
  0;


export class BillingService {

  static providerConfiguration() {
    const api =
      Boolean(
        process.env
          .WHOP_API_KEY
          ?.trim(),
      );

    const webhook =
      Boolean(
        process.env
          .WHOP_WEBHOOK_SECRET
          ?.trim(),
      );

    const account =
      process.env
        .WHOP_COMPANY_ID
        ?.trim() ===
      APPROVED_ACCOUNT_ID;

    const plan =
      process.env
        .WHOP_PLAN_ID
        ?.trim() ===
      APPROVED_PLAN_ID;

    const redirect =
      process.env
        .WHOP_REDIRECT_URL
        ?.trim() ===
      APPROVED_REDIRECT_URL;

    return {
      provider:
        'whop' as const,

      api,
      webhook,
      account,
      plan,
      redirect,

      ready:
        api &&
        webhook &&
        account &&
        plan &&
        redirect,
    };
  }


  static listPlans() {
    return GALACTIC_PLANS.map(
      (plan) => ({
        tier:
          plan.tier,

        name:
          plan.name,

        priceLabel:
          plan.priceLabel,

        /*
         * Internal metadata.
         * Pricing UI should not display it.
         */
        concurrency:
          plan.concurrency,

        paid:
          plan.paid,

        benefits:
          plan.publicBenefits,
      }),
    );
  }


  static async verifyConfiguredPlan(
    force =
      false,
  ): Promise<void> {

    if (
      !force &&
      verifiedPlanUntil >
        Date.now()
    ) {
      return;
    }


    const {
      apiKey,
      accountId,
      planId,
    } =
      requiredConfig();


    let response:
      Response;
    let plan: Record<string, unknown>;


    try {
      response =
        await fetch(
          `${WHOP_API_BASE}/plans/${encodeURIComponent(planId)}`,
          {
            method: 'GET',
            redirect: 'error',
            headers:
              whopHeaders(
                apiKey,
              ),

            signal:
              AbortSignal.timeout(
                10_000,
              ),
          },
        );
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error('plan_read_denied');
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        if (reader) for (;;) {
          const next = await reader.read();
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > 65_536) throw new Error('plan_receipt_limit');
          chunks.push(next.value);
        }
      } finally {
        await reader?.cancel().catch(() => undefined);
        reader?.releaseLock();
      }
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('plan_receipt_shape');
      plan = parsed as Record<string, unknown>;
    } catch {
      throw new BillingServiceError(
        'provider_unavailable',
        'Whop plan verification is temporarily unavailable',
        502,
      );
    }


    const ownerId =
      whopPlanOwnerId(
        plan,
      );


    if (
      ownerId &&
      ownerId !==
        accountId
    ) {
      throw new BillingServiceError(
        'plan_mismatch',
        'Whop plan contract mismatch: account_id',
        503,
      );
    }


    if (
      ownerId
    ) {
      assertWhopPlanContract(
        plan,
        accountId,
        planId,
      );
    } else {
      assertWhopPlanTerms(
        plan,
        planId,
      );
    }


    verifiedPlanUntil =
      Date.now() +
      300_000;
  }


  /** A checkout link does not charge a card. Its exact external configuration
   * still needs the canonical one-time approval, independent of payment on Whop.
   */
  static async prepareCheckoutPlan(context:TenantContext):Promise<BusinessActionPlan>{
    const actor=requireTenantContext(context),config=requiredConfig();
    await this.verifyConfiguredPlan(true);
    const issuedAt=new Date().toISOString(),nonce=randomUUID();
    const unsigned:Omit<BusinessActionPlan,'planDigest'>={version:'1.0',sessionId:`trs_native_checkout_${nonce}`,
      useCase:'Open Xroga Pro checkout',toolkit:'xroga-native-billing',toolSlug:'XROGA_CREATE_CHECKOUT',
      arguments:{destination:`${WHOP_API_BASE}/checkout_configurations`,custodyEpoch:crypto.createHash('sha256').update(config.apiKey).digest('hex'),body:{
        account_id:config.accountId,plan_id:config.planId,mode:'payment',redirect_url:config.redirectUrl,
        metadata:{xroga_user_id:actor.userId,plan_tier:EXPECTED_TIER,source:EXPECTED_SOURCE,xroga_checkout_id:nonce}}},
      risk:'write',requiresConfirmation:true,forceConfirmation:true,
      summary:'Create a Whop checkout link for Xroga Pro, $25 USD every 30 days. Payment requires a separate confirmation on Whop.',
      requiredScopes:['xroga:checkout'],authority:{version:'1',userId:actor.userId,tenantId:actor.tenantId,
        connectedAccountId:config.accountId,actionClass:'PURCHASE_OR_SPEND',projectId:null,runId:null,issuedAt,
        expiresAt:new Date(Date.parse(issuedAt)+15*60_000).toISOString(),nonce,maxSpendMicroUsd:'25000000',currency:'USD'}};
    return {...unsigned,planDigest:actionPlanDigest(unsigned)};
  }

  static async createCheckout(
    userId:
      string,
    admission?:{plan:BusinessActionPlan;authorityPermit?:AuthorityPermit},
  ): Promise<{
    purchaseUrl:
      string;

    checkoutConfigurationId:
      string | null;
  }> {

    if(!admission)throw new AuthorityError('AUTHORITY_REQUIRED');
    const plan=snapshotBusinessActionPlan(admission.plan),scope=businessActionAuthorityScope(plan);
    const binding={userId,provider:scope.provider,connectedAccountId:scope.connectedAccountId,
      operation:scope.operation,targetDigest:scope.targetDigest,planDigest:scope.planDigest};
    const context=authorityContextForPermit(admission.authorityPermit,binding);requireResourceOwner(context,userId);
    const {
      apiKey,
      accountId,
      planId,
      redirectUrl,
    } =
      requiredConfig();


    const expectedBody={account_id:accountId,plan_id:planId,mode:'payment',redirect_url:redirectUrl,
      metadata:{xroga_user_id:userId,plan_tier:EXPECTED_TIER,source:EXPECTED_SOURCE,xroga_checkout_id:scope.nonce}};
    const destination=`${WHOP_API_BASE}/checkout_configurations`;
    if(plan.toolkit!=='xroga-native-billing'||plan.toolSlug!=='XROGA_CREATE_CHECKOUT'
      ||plan.sessionId!==`trs_native_checkout_${scope.nonce}`||plan.useCase!=='Open Xroga Pro checkout'
      ||plan.risk!=='write'||!plan.requiresConfirmation||plan.forceConfirmation!==true||scope.actionClass!=='PURCHASE_OR_SPEND'
      ||scope.maxSpendMicroUsd!=='25000000'||scope.currency!=='USD'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(scope.nonce)
      ||scope.connectedAccountId!==accountId||scope.projectId!==null||scope.runId!==null
      ||Date.parse(scope.expiresAt)-Date.parse(scope.issuedAt)>15*60_000
      ||plan.summary!=='Create a Whop checkout link for Xroga Pro, $25 USD every 30 days. Payment requires a separate confirmation on Whop.'
      ||!isDeepStrictEqual(plan.requiredScopes,['xroga:checkout'])
      ||!isDeepStrictEqual(plan.arguments,{destination,custodyEpoch:crypto.createHash('sha256').update(apiKey).digest('hex'),body:expectedBody}))throw new AuthorityError('AUTHORITY_SCOPE_MISMATCH');
    await this.verifyConfiguredPlan(true);


    const body = {
      account_id:
        accountId,

      plan_id:
        planId,

      mode:
        'payment',

      redirect_url:
        redirectUrl,

      metadata: {
        xroga_user_id:
          userId,

        plan_tier:
          EXPECTED_TIER,

        source:
          EXPECTED_SOURCE,

        xroga_checkout_id:
          scope.nonce,
      },
    };

    await enforceEgress({context,actionClass:'PURCHASE_OR_SPEND',binding,authorityPermit:admission.authorityPermit,
      destination,recipient:accountId,purpose:'confirmed_xroga_checkout_configuration',
      payload:{sessionId:plan.sessionId,useCase:plan.useCase,toolSlug:plan.toolSlug,arguments:plan.arguments},
      declaredClass:'USER_PRIVATE',toolTrust:'SERVER_REGISTERED'},receipt=>persistSecurityDecision(context,receipt));
    await consumeAuthorityPermit(admission.authorityPermit,binding);
    if(!isDeepStrictEqual(requiredConfig(),{apiKey,accountId,planId,redirectUrl}))throw new AuthorityError('AUTHORITY_SCOPE_MISMATCH');


    let response:
      Response;


    try {
      response =
        await fetch(
          `${WHOP_API_BASE}/checkout_configurations`,
          {
            redirect:'manual',
            method:
              'POST',

            headers:
              whopHeaders(
                apiKey,
                {
                  'Idempotency-Key':
                    `xroga-checkout-${userId}-${scope.nonce}`,
                },
              ),

            body:
              JSON.stringify(
                body,
              ),

            signal:
              AbortSignal.timeout(
                15_000,
              ),
          },
        );
    } catch {
      throw new BillingServiceError(
        'provider_unavailable',
        'Whop checkout is temporarily unavailable',
        502,
      );
    }


    if(response.redirected||response.status>=300&&response.status<400){
      await response.body?.cancel().catch(()=>undefined);throw new EgressDenied('UNSAFE_DESTINATION');
    }
    if(response.status===401||response.status===403){
      await response.body?.cancel().catch(()=>undefined);throw new AuthorityError('AUTHORITY_CREDENTIAL_REJECTED');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(()=>undefined);
      console.error(
        JSON.stringify({
          level:
            'error',

          event:
            'whop_checkout_failed',

          status:
            response.status,

          userId,
        }),
      );

      throw new BillingServiceError(
        'provider_unavailable',
        'Whop could not create checkout',
        502,
      );
    }


    const chunks:Uint8Array[]=[];let size=0;const reader=response.body?.getReader();
    try{if(reader)for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;
      if(size>65_536)throw new BillingServiceError('provider_unavailable','Whop checkout receipt was too large',502);chunks.push(next.value);}}
    finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
    let payload:Record<string,unknown>;
    try{const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();payload=value as Record<string,unknown>;}
    catch{throw new BillingServiceError('provider_unavailable','Whop checkout receipt was invalid',502);}


    if (
      pickString(
        payload,
        'company_id',
        'account_id',
      ) !==
      accountId
    ) {
      throw new BillingServiceError(
        'plan_mismatch',
        'Whop checkout contract mismatch: account_id',
        503,
      );
    }


    assertWhopPlanTerms(
      nestedRecord(
        payload.plan,
      ),
      planId,
    );

    const checkoutId=pickString(payload,'id');
    try{
      const scope={checkoutId,accountId,planId,expectedCheckoutNonce:body.metadata.xroga_checkout_id};
      const owner=payload.metadata===undefined||payload.metadata===null
        ?await readWhopCheckoutOwner({...scope,apiKey,apiVersion:WHOP_API_VERSION_DATE})
        :whopCheckoutOwnerFromResponse(payload,scope);
      if(owner.userId!==userId)throw new Error('checkout_owner_mismatch');
    }catch{
      throw new BillingServiceError('plan_mismatch','Checkout ownership could not be verified',503);
    }


    return {
      purchaseUrl:
        safeWhopUrl(
          payload.purchase_url,
          'Checkout',
        ),

      checkoutConfigurationId:
        checkoutId,
    };
  }


  static async createCustomerPortal(
    userId:
      string,
  ): Promise<{
    manageUrl:
      string;
  }> {

    const {
      data,
      error,
    } =
      await getSupabaseAdmin()
        .from(
          'whop_memberships',
        )
        .select(
          'manage_url,status,renewal_period_end',
        )
        .eq(
          'user_id',
          userId,
        )
        .order(
          'last_synced_at',
          {
            ascending:
              false,
          },
        )
        .limit(1)
        .maybeSingle();


    if (
      error
    ) {
      throw new BillingServiceError(
        'storage_unavailable',
        'Billing account could not be loaded',
        503,
      );
    }


    if (
      !data?.manage_url
    ) {
      throw new BillingServiceError(
        'subscription_not_found',
        'No Xroga Pro subscription is available to manage',
        409,
      );
    }


    return {
      manageUrl:
        safeWhopUrl(
          data.manage_url,
          'Subscription management',
        ),
    };
  }


  static async getUserBillingStatus(
    userId:
      string,
  ): Promise<BillingStatus> {

    const [
      entitlement,
      membershipResult,
    ] =
      await Promise.all([
        getProviderEntitlementStatus(
          userId,
        ),

        getSupabaseAdmin()
          .from(
            'whop_memberships',
          )
          .select(
            'status,renewal_period_end,cancel_at_period_end,manage_url',
          )
          .eq(
            'user_id',
            userId,
          )
          .order(
            'last_synced_at',
            {
              ascending:
                false,
            },
          )
          .limit(1)
          .maybeSingle(),
      ]);


    const membership =
      membershipResult.error
        ? null
        : membershipResult.data;


    const isPaid =
      entitlement.state ===
      'paid_active';


    const historical =
      entitlement.state ===
      'promotional_active';


    const plan =
      getPlanByTier(
        (
          isPaid ||
          historical
        )
          ? 'spark'
          : 'free',
      )!;


    return {
      plan:
        isPaid
          ? 'spark'
          : historical
            ? 'historical'
            : 'free',

      publicPlanName:
        isPaid
          ? 'Xroga Pro'
          : historical
            ? 'Historical access'
            : 'Free',

      isPaid,

      billingProvider:
        isPaid
          ? 'whop'
          : null,

      billingStatus:
        membership?.status ??
        null,

      renewalPeriodEnd:
        membership
          ?.renewal_period_end ??
        entitlement.endsAt,

      cancelAtPeriodEnd:
        Boolean(
          membership
            ?.cancel_at_period_end,
        ),

      manageAvailable:
        isPaid &&
        Boolean(
          membership
            ?.manage_url,
        ),

      allowance: {
        concurrency:
          plan.concurrency,
      },

      features: {
        workspace:
          true,

        repositories:
          true,

        previews:
          true,

        fullAccessPacing:
          isPaid ||
          historical,

        higherConcurrency:
          isPaid ||
          historical,
      },

      entitlement,
    };
  }


  static async handleWebhookEvent(
    event:
      WhopWebhookEvent,

    webhookId:
      string,
  ): Promise<{
    fulfilled:
      boolean;
  }> {

    const type =
      String(
        event.type ??
        '',
      ) as WhopEventType;


    const supported:
      WhopEventType[] = [
        'payment.succeeded',
        'payment.failed',

        'membership.activated',
        'membership.cancel_at_period_end_changed',
        'membership.deactivated',

        'refund.created',
        'refund.updated',

        'dispute.created',
        'dispute.updated',
      ];


    if (
      !supported.includes(
        type,
      )
    ) {
      return {
        fulfilled:
          false,
      };
    }


    // Provider identity and content must stay one immutable intent across awaits.
    const data = JSON.parse(JSON.stringify(nestedRecord(event.data))) as Record<string,unknown>;


    const accountId =
      event.account_id ||
      event.company_id ||
      pickString(
        data,
        'account_id',
        'company_id',
      );


    if (
      accountId !==
      (
        process.env
          .WHOP_COMPANY_ID
          ?.trim() ||
        APPROVED_ACCOUNT_ID
      )
    ) {
      throw new Error(
        'wrong_account',
      );
    }


    if (
      type ===
      'payment.succeeded'
    ) {
      return {
        fulfilled:
          await this
            .fulfillPayment(
              data,
              webhookId,
            ),
      };
    }


    if (
      type ===
      'payment.failed'
    ) {
      await this
        .syncMembership(
          data,
          'payment_failed',
        );

      return {
        fulfilled:
          false,
      };
    }


    if (
      type.startsWith(
        'membership.',
      )
    ) {
      await this
        .syncMembership(
          data,
          type.split(
            '.',
          )[1] ||
          'unknown',
        );

      return {
        fulfilled:
          false,
      };
    }


    console.info(
      JSON.stringify({
        level:
          'info',

        event:
          'whop_financial_state_synced',

        webhookId,

        type,

        objectId:
          pickString(
            data,
            'id',
          ) ||
          null,
      }),
    );


    return {
      fulfilled:
        false,
    };
  }


  private static async fulfillPayment(
    data:
      Record<
        string,
        unknown
      >,

    webhookId:
      string,
  ): Promise<boolean> {

    const plan =
      nestedRecord(
        data.plan,
      );

    const membership =
      nestedRecord(
        data.membership,
      );

    const checkout =
      nestedRecord(
        data.checkout_configuration,
      );


    const metadata = {
      ...nestedRecord(
        checkout.metadata,
      ),

      ...nestedRecord(
        data.metadata,
      ),
    };


    const paymentId =
      pickString(
        data,
        'id',
        'payment_id',
      );


    const planId =
      pickString(
        data,
        'plan_id',
      ) ||
      pickString(
        plan,
        'id',
      ) ||
      pickString(
        membership,
        'plan_id',
      );


    const userId =
      pickString(
        metadata,
        'xroga_user_id',
      );


    if (
      pickString(
        data,
        'status',
      ).toLowerCase() !==
      'succeeded'
    ) {
      throw new Error(
        'payment_not_succeeded',
      );
    }


    if (
      !paymentId
    ) {
      throw new Error(
        'payment_id_required',
      );
    }


    if (
      planId !==
      (
        process.env
          .WHOP_PLAN_ID
          ?.trim() ||
        APPROVED_PLAN_ID
      )
    ) {
      throw new Error(
        'wrong_plan',
      );
    }


    if (
      pickString(
        metadata,
        'plan_tier',
      ) !==
        EXPECTED_TIER ||
      pickString(
        metadata,
        'source',
      ) !==
        EXPECTED_SOURCE
    ) {
      throw new Error(
        'invalid_metadata',
      );
    }


    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        userId,
      )
    ) {
      throw new Error(
        'invalid_user',
      );
    }


    const startsAt =
      parseDate(
        data.paid_at,
      ) ??
      parseDate(
        data.created_at,
      ) ??
      new Date();


    const endsAt =
      parseDate(
        membership
          .renewal_period_end,
      ) ??
      parseDate(
        membership
          .expires_at,
      ) ??
      new Date(
        startsAt.getTime() +
        30 *
        86_400_000,
      );


    const membershipId =
      pickString(
        data,
        'membership_id',
      ) ||
      pickString(
        membership,
        'id',
      );


    const memberId =
      pickString(
        data,
        'member_id',
      ) ||
      pickString(
        membership,
        'member_id',
      );


    const checkoutId =
      pickString(
        data,
        'checkout_configuration_id',
      ) ||
      pickString(
        checkout,
        'id',
      );


    const manageUrl =
      pickString(
        membership,
        'manage_url',
      );

    // A signature establishes the provider, not the app user named by metadata.
    // Existing receipts/memberships retain legacy owner authority. First claims
    // must match the exact canonical checkout created with server-owned metadata.
    if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('billing_authority_unavailable');
    const db=getSupabaseAdmin();
    const previous=await db.from('whop_payment_fulfillments').select('user_id,whop_payment_id').eq('whop_payment_id',paymentId).maybeSingle();
    if(previous.error)throw new Error('payment_fulfillment_failed');
    let knownOwner:string|undefined;
    let checkoutNeedsReadback=false;
    if(previous.data!==null){
      if(previous.data.whop_payment_id!==paymentId||typeof previous.data.user_id!=='string')throw new Error('payment_owner_mismatch');
      knownOwner=previous.data.user_id;
    }else if(membershipId){
      const existing=await db.from('whop_memberships').select('user_id,whop_membership_id,whop_plan_id,whop_account_id,whop_checkout_configuration_id').eq('whop_membership_id',membershipId).maybeSingle();
      if(existing.error)throw new Error('payment_fulfillment_failed');
      if(existing.data!==null){
        if(existing.data.whop_membership_id!==membershipId||existing.data.whop_plan_id!==planId
          ||existing.data.whop_account_id!==(process.env.WHOP_COMPANY_ID?.trim()||APPROVED_ACCOUNT_ID)
          ||typeof existing.data.user_id!=='string')throw new Error('payment_owner_mismatch');
        knownOwner=existing.data.user_id;
        checkoutNeedsReadback=Boolean(checkoutId&&checkoutId!==existing.data.whop_checkout_configuration_id);
      }
    }
    if(!knownOwner||checkoutNeedsReadback){
      const {apiKey,accountId,planId:configuredPlan}=requiredConfig();
      const checkoutOwner=(await readWhopCheckoutOwner({checkoutId,apiKey,accountId,planId:configuredPlan,apiVersion:WHOP_API_VERSION_DATE})).userId;
      if(knownOwner&&knownOwner!==checkoutOwner)throw new Error('payment_owner_mismatch');
      knownOwner=checkoutOwner;
    }
    if(knownOwner!==userId)throw new Error('payment_owner_mismatch');
    const profile=await db.from('profiles').select('id').eq('id',userId).maybeSingle();
    if(profile.error||profile.data?.id!==userId)throw new Error('invalid_user');


    /*
     * Production / Supabase path.
     */
    if (
      process.env
        .SUPABASE_SERVICE_ROLE_KEY
    ) {
      const {
        data:
          fulfilled,

        error,
      } =
      await db
          .rpc(
            'fulfill_whop_payment',
            {
              p_user_id:
                userId,

              p_webhook_id:
                webhookId,

              p_payment_id:
                paymentId,

              p_membership_id:
                membershipId ||
                null,

              p_member_id:
                memberId ||
                null,

              p_checkout_configuration_id:
                checkoutId ||
                null,

              p_plan_id:
                planId,

              p_account_id:
                process.env
                  .WHOP_COMPANY_ID
                  ?.trim() ||
                APPROVED_ACCOUNT_ID,

              p_starts_at:
                startsAt
                  .toISOString(),

              p_ends_at:
                endsAt
                  .toISOString(),

              p_manage_url:
                manageUrl ||
                null,
            },
          );


      if (
        error
      ) {
        throw new Error(
          'payment_fulfillment_failed',
        );
      }


      // The fulfillment transaction already updates the canonical usage budget.
      // A second write could race a newer cycle and cannot be repaired by replay.


      if(typeof fulfilled!=='boolean')throw new Error('payment_fulfillment_failed');
      return fulfilled;
    }
    throw new Error('billing_authority_unavailable');
  }


  private static async syncMembership(
    data:
      Record<
        string,
        unknown
      >,

    fallbackStatus:
      string,
  ): Promise<void> {

    const metadata = {
      ...nestedRecord(
        nestedRecord(
          data
            .checkout_configuration,
        ).metadata,
      ),

      ...nestedRecord(
        data.metadata,
      ),
    };


    let userId =
      pickString(
        metadata,
        'xroga_user_id',
      );


    const membership =
      Object.keys(
        nestedRecord(
          data.membership,
        ),
      ).length
        ? nestedRecord(
            data.membership,
          )
        : data;


    const membershipId =
      pickString(
        data,
        'membership_id',
      ) ||
      pickString(
        membership,
        'id',
      );


    const checkout=nestedRecord(data.checkout_configuration);
    const checkoutId=pickString(data,'checkout_configuration_id')||pickString(checkout,'id')||pickString(membership,'checkout_configuration_id');
    let persistedIdentifiers: { whop_plan_id?: string; whop_account_id?: string; whop_checkout_configuration_id?: string|null } = {};
    // The signed provider event establishes its source, not permission to move
    // an existing membership to the actor named in its metadata.
    if (membershipId) {
      const {
        data:
          existing,
        error: ownershipError,
      } =
        await getSupabaseAdmin()
          .from(
            'whop_memberships',
          )
          .select(
            'user_id,whop_membership_id,whop_plan_id,whop_account_id,whop_checkout_configuration_id',
          )
          .eq(
            'whop_membership_id',
            membershipId,
          )
          .maybeSingle();


      if (ownershipError) throw new Error('membership_sync_failed');
      if (existing!==null) {
        if(typeof existing.user_id!=='string'||!existing.user_id||existing.whop_membership_id!==membershipId
          ||!existing.whop_plan_id||!existing.whop_account_id)throw new Error('membership_owner_mismatch');
        if (userId && userId !== existing.user_id) throw new Error('membership_owner_mismatch');
        userId = existing.user_id;
        persistedIdentifiers = existing;
      }
    }

    if(membershipId&&(!persistedIdentifiers.whop_account_id||(checkoutId&&checkoutId!==persistedIdentifiers.whop_checkout_configuration_id))){
      const {apiKey,accountId,planId}=requiredConfig();
      const owner=await readWhopCheckoutOwner({checkoutId,apiKey,accountId,planId,apiVersion:WHOP_API_VERSION_DATE});
      if(userId&&userId!==owner.userId)throw new Error('membership_owner_mismatch');
      userId=owner.userId;
    }


    if (
      !userId ||
      !membershipId
    ) {
      return;
    }


    const manageUrl =
      pickString(
        membership,
        'manage_url',
      );


    const row = {
      user_id:
        userId,

      whop_membership_id:
        membershipId,

      whop_member_id:
        pickString(
          membership,
          'member_id',
        ) ||
        null,

      whop_payment_id:
        pickString(
          data,
          'payment_id',
        ) ||
        null,

      whop_checkout_configuration_id:
        checkoutId || persistedIdentifiers.whop_checkout_configuration_id ||
        null,

      whop_plan_id:
        pickString(
          membership,
          'plan_id',
        ) ||
        pickString(
          data,
          'plan_id',
        ) ||
        persistedIdentifiers.whop_plan_id ||
        process.env
          .WHOP_PLAN_ID ||
        null,

      whop_account_id:
        pickString(
          membership,
          'account_id',
          'company_id',
        ) ||
        persistedIdentifiers.whop_account_id ||
        process.env
          .WHOP_COMPANY_ID ||
        null,

      billing_provider:
        'whop',

      status:
        pickString(
          membership,
          'status',
        ) ||
        fallbackStatus,

      renewal_period_start:
        parseDate(
          membership
            .renewal_period_start,
        )
          ?.toISOString() ??
        null,

      renewal_period_end:
        (
          parseDate(
            membership
              .renewal_period_end,
          ) ??
          parseDate(
            membership
              .expires_at,
          )
        )
          ?.toISOString() ??
        null,

      cancel_at_period_end:
        Boolean(
          membership
            .cancel_at_period_end,
        ),

      manage_url:
        manageUrl
          ? safeWhopUrl(
              manageUrl,
              'Subscription management',
            )
          : null,

      last_synced_at:
        new Date()
          .toISOString(),
    };


    if (!row.whop_plan_id || !row.whop_account_id) throw new Error('membership_identity_unavailable');
    if(row.whop_account_id!==(process.env.WHOP_COMPANY_ID?.trim()||APPROVED_ACCOUNT_ID)
      ||(persistedIdentifiers.whop_plan_id&&row.whop_plan_id!==persistedIdentifiers.whop_plan_id)
      ||(!persistedIdentifiers.whop_plan_id&&row.whop_plan_id!==(process.env.WHOP_PLAN_ID?.trim()||APPROVED_PLAN_ID)))throw new Error('membership_owner_mismatch');
    // Insert-ignore closes the lookup/insert race. The following mutation must
    // match both the provider ID and its persisted owner and return one row.
    const db = getSupabaseAdmin();
    const inserted = await db.from('whop_memberships').upsert(row, {
      onConflict: 'whop_membership_id', ignoreDuplicates: true,
    });
    if (inserted.error) throw new Error('membership_sync_failed');
    const updated = await db.from('whop_memberships').update(row)
      .eq('whop_membership_id', membershipId).eq('user_id', userId)
      .select('whop_membership_id').maybeSingle();
    if (updated.error) throw new Error('membership_sync_failed');
    if (!updated.data||updated.data.whop_membership_id!==membershipId) throw new Error('membership_owner_mismatch');


    if (
      fallbackStatus ===
      'deactivated'
    ) {
      await getProviderEntitlementStatus(
        userId,
      );

      // The canonical cycle refresh preserves an unexpired paid cycle or
      // atomically establishes a free cycle when needed. An old membership's
      // deactivation must not overwrite a newer payment's budget.
    }
  }
}


export function resetBillingMemoryForTests(): void {
  verifiedPlanUntil =
    0;
}
