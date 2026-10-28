import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';
import express from 'express';

import { createBuilderRouter } from '../routes/builder.js';
import { createTenantContext } from '../security/tenantContext.js';
import { BuilderService } from './service.js';
import { InMemoryBuilderStore } from './store.js';
import { BuilderError } from './types.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROMPT = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';
const CHAT = 'f3b1c7de-0a53-4c0a-9d1e-2f6a8a9a1b11';

describe('chat conversation to builder project', () => {
  it('finds the project a conversation is building, so reopening the chat continues it', async () => {
    const service = new BuilderService({ store: new InMemoryBuilderStore(), runBuild: async () => null });
    assert.equal(await service.projectForConversation(OWNER, CHAT), null);
    const { project } = await service.createProject(OWNER, { prompt: PROMPT, requestKey: 'chat:message-0001', conversationId: CHAT });
    const { project: unrelated } = await service.createProject(OWNER, { prompt: PROMPT, requestKey: 'chat:message-0002', conversationId: 'another-chat' });
    assert.equal((await service.projectForConversation(OWNER, CHAT))?.id, project.id);
    assert.equal((await service.projectForConversation(OWNER, 'another-chat'))?.id, unrelated.id);
    assert.equal(await service.projectForConversation(OWNER, 'a-chat-without-a-project'), null);
  });

  it('is owner scoped: another user\'s conversation id finds nothing, and the same id for two users stays separate', async () => {
    const service = new BuilderService({ store: new InMemoryBuilderStore(), runBuild: async () => null });
    const { project } = await service.createProject(OWNER, { prompt: PROMPT, requestKey: 'chat:message-0003', conversationId: CHAT });
    assert.equal(await service.projectForConversation(OTHER, CHAT), null);
    const { project: theirs } = await service.createProject(OTHER, { prompt: PROMPT, requestKey: 'chat:message-0004', conversationId: CHAT });
    assert.equal((await service.projectForConversation(OWNER, CHAT))?.id, project.id);
    assert.equal((await service.projectForConversation(OTHER, CHAT))?.id, theirs.id);
  });

  it('prefers the most recently updated project when a conversation built more than one', async () => {
    const store = new InMemoryBuilderStore();
    const service = new BuilderService({ store, runBuild: async () => null });
    const { project: first } = await service.createProject(OWNER, { prompt: PROMPT, requestKey: 'chat:message-0005', conversationId: CHAT });
    const { project: second } = await service.createProject(OWNER, { prompt: PROMPT, requestKey: 'chat:message-0006', conversationId: CHAT });
    await new Promise((r) => setTimeout(r, 5));
    await store.setState(OWNER, first.id, 'partial', 'touched later');
    assert.equal((await service.projectForConversation(OWNER, CHAT))?.id, first.id);
    await new Promise((r) => setTimeout(r, 5));
    await store.setState(OWNER, second.id, 'partial', 'touched last');
    assert.equal((await service.projectForConversation(OWNER, CHAT))?.id, second.id);
  });

  it('refuses a malformed conversation id', async () => {
    const service = new BuilderService({ store: new InMemoryBuilderStore(), runBuild: async () => null });
    await assert.rejects(service.projectForConversation(OWNER, 'has spaces/and slashes'), (e) => e instanceof BuilderError && e.code === 'invalid_input');
  });

  describe('route', () => {
    const service = new BuilderService({ store: new InMemoryBuilderStore(), runBuild: async () => null });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const who = req.header('x-test-user');
      if (who) (req as unknown as { tenantContext: unknown }).tenantContext = createTenantContext({ userId: who, via: 'persisted_owner' });
      next();
    });
    app.use('/api/builder', createBuilderRouter(() => service));
    const server = app.listen(0);
    after(() => new Promise((resolve) => server.close(resolve)));
    const get = async (id: string, user: string | null) => {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/builder/conversations/${id}/project`, { headers: user ? { 'x-test-user': user } : {} });
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    };

    it('requires sign-in and returns only the caller\'s project', async () => {
      const { project } = await service.createProject(OWNER, { prompt: PROMPT, requestKey: 'chat:route-0001', conversationId: CHAT });
      assert.equal((await get(CHAT, null)).status, 401);
      assert.equal((await get(CHAT, OWNER)).body.project.id, project.id);
      const foreign = await get(CHAT, OTHER);
      assert.equal(foreign.status, 200);
      assert.equal(foreign.body.project, null, 'no existence leak');
      assert.equal((await get('bad%20id', OWNER)).status, 400);
    });
  });
});
