import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {BusinessActionPlan} from '../../integrations/businessAction.js';
export interface ReleaseConfirmation extends Record<string, unknown> {
  id: string; user_id: string; status: string; plan: BusinessActionPlan; plan_digest: string; expires_at: string; claimed_at: string | null; effect_started_at?: string;
}
/** Synthetic HTTP protocol fixture, never an authority issuer or production store. */
export function nativeReleaseFixture(owner: string) {
  const project = randomUUID(), files = new Map<string, Record<string, unknown>>();
  let row: ReleaseConfirmation | null = null;
  const state = {project, files, get row() {return row;}, owner, projectOwner: owner, audits: 0, mode: 'ok'};
  return Object.assign(state, {async database(url: URL, init?: RequestInit): Promise<Response | undefined> {
    const method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    if (url.pathname.endsWith('/projects')) {
      assert.equal(url.searchParams.get('user_id'), 'eq.' + owner);
      return Response.json({id: project, user_id: state.projectOwner, github_repo_name: 'Owner/repo'});
    }
    if (url.pathname.endsWith('/project_files')) {
      if (method === 'POST') {assert.equal(body?.project_id, project); files.set(String(body!.id), body!); return Response.json(body);}
      const file = files.get(url.searchParams.get('id')?.slice(3) ?? '');
      return Response.json(file ? {...file, projects: {user_id: state.projectOwner}, delivery_version: file.delivery_version ?? 1} : null);
    }
    if (url.pathname.endsWith('/production_audit_log')) {
      assert.equal(body?.user_id, owner); state.audits++;
      if (state.mode === 'audit-fail') return Response.json({message: 'synthetic failure'}, {status: 503});
      if (state.mode === 'cancel-at-audit' && row) row.status = 'cancelled';
      if (state.mode === 'file-at-audit') for (const file of files.values()) file.delivery_version = 2;
      return Response.json(body);
    }
    if (url.pathname.endsWith('/business_action_confirmations')) {
      if (method === 'POST') {
        assert.ok(body && body.user_id === owner && body.status === 'pending' && typeof body.plan_digest === 'string' && typeof body.expires_at === 'string' && body.plan && typeof body.plan === 'object');
        row = {...body, user_id: owner, status: 'pending', plan_digest: body.plan_digest, expires_at: body.expires_at, plan: body.plan as BusinessActionPlan, id: randomUUID(), created_at: new Date().toISOString(), claimed_at: null, completed_at: null}; return Response.json(row);
      }
      if (!row || url.searchParams.get('id') !== 'eq.' + row.id || url.searchParams.get('user_id') !== 'eq.' + owner) return Response.json(null);
      if (method === 'PATCH') Object.assign(row, body);
      return Response.json(row);
    }
    if (!url.pathname.includes('/rpc/')) return undefined;
    assert.ok(body && row); assert.equal(body.p_owner, owner);
    if (url.pathname.endsWith('/claim_business_action_confirmation')) {
      if (row.status !== 'pending' || body.p_digest !== row.plan_digest) return Response.json(null);
      row = {...row, status: 'executing', claimed_at: new Date().toISOString()}; return Response.json(row);
    }
    if (url.pathname.endsWith('/authorize_business_action_dispatch')) {
      const expected = body.p_expected as ReleaseConfirmation;
      const exact = ['id', 'user_id', 'plan', 'plan_digest', 'summary', 'toolkit', 'risk', 'created_at', 'expires_at', 'claimed_at'].every(key => isDeepStrictEqual(expected[key], row![key]));
      if (state.mode === 'cancel-at-claim') row.status = 'cancelled';
      const response = Response.json(exact && row.status === 'executing' && Date.parse(row.expires_at) > Date.now() ? {...row, effect_started_at: row.effect_started_at ??= new Date().toISOString()} : null);
      if (state.mode === 'cancel-after-claim') row.status = 'cancelled';
      if (state.mode === 'expire-after-claim') row.expires_at = new Date(0).toISOString();
      return response;
    }
    if (url.pathname.endsWith('/finish_business_action_confirmation')) {
      if (row.status !== 'executing') return Response.json(null);
      const expected = body.p_expected as ReleaseConfirmation;
      row = {...row, status: String(body.p_status), failure_code: body.p_failure_code, completed_at: new Date().toISOString(), ...(expected.effect_receipt ? {effect_receipt: {...expected.effect_receipt as Record<string, unknown>, outcome: body.p_status === 'consumed' ? 'provider_reported_success' : 'dispatch_uncertain', recordedAt: new Date().toISOString()}} : {})};
      return Response.json(row);
    }
    throw new Error('Unrecognized native release fixture RPC');
  }});
}
