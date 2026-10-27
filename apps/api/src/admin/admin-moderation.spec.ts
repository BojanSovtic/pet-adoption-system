import request from 'supertest';
import { inject } from 'vitest';

import { app } from '../app';
import { ApplicationModel } from '../applications/application.model';
import {
  createSignedInAgent,
  type SignedInAgent,
} from '../test/auth-test-helpers';
import { PetModel } from '../pets/pet.model';
import { UserModel } from '../users/user.model';
import { AdminAuditModel } from './admin-audit.model';
import { verifyAuditChain } from './admin-audit.service';

const PASSWORD = 'correct horse battery';

const makeAdmin = async ({ userId }: SignedInAgent): Promise<void> => {
  await UserModel.updateOne({ _id: userId }, { role: 'admin' });
};

const createAdmin = async (email = 'admin@example.com') => {
  const admin = await createSignedInAgent(email);
  await makeAdmin(admin);
  return admin;
};

const validPet = {
  name: 'Milo',
  species: 'dog',
  age: 3,
  description: 'A friendly dog.',
};

const createPetAs = async ({ agent }: SignedInAgent): Promise<string> =>
  (await agent.post('/api/pets').send(validPet)).body._id;

describe('admin rate limits', () => {
  it('allows normal use, then refuses reads beyond 300 per admin', async () => {
    const admin = await createAdmin();
    const other = await createAdmin('other-admin@example.com');

    for (let index = 0; index < 300; index += 1) {
      const response = await admin.agent.get('/api/admin/stats');
      if (response.status !== 200) {
        throw new Error(`Request ${index + 1} was refused early`);
      }
    }

    const limited = await admin.agent.get('/api/admin/stats');
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ code: 'RATE_LIMITED' });

    // Per admin, not per IP: another admin from the same address is fine.
    expect((await other.agent.get('/api/admin/stats')).status).toBe(200);
  }, 60_000);

  it('refuses changes beyond 30 per admin, separately from reads', async () => {
    const admin = await createAdmin();
    const user = await createSignedInAgent('user@example.com');

    // Reinstating an active user is a no-op, but still counts as a change request.
    for (let index = 0; index < 30; index += 1) {
      const response = await admin.agent.post(
        `/api/admin/users/${user.userId}/reinstate`,
      );
      if (response.status !== 200) {
        throw new Error(`Change ${index + 1} was refused early`);
      }
    }

    const limited = await admin.agent.post(
      `/api/admin/users/${user.userId}/suspend`,
    );
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ code: 'RATE_LIMITED' });
    expect((await UserModel.findById(user.userId).lean())?.suspendedAt).toBe(
      null,
    );

    // Reads have their own budget.
    expect((await admin.agent.get('/api/admin/stats')).status).toBe(200);
  }, 60_000);

  it('ignores spoofed forwarding headers (the key is the admin account)', async () => {
    const admin = await createAdmin();

    for (let index = 0; index < 300; index += 1) {
      await admin.agent
        .get('/api/admin/stats')
        .set('X-Forwarded-For', `203.0.113.${index % 250}`);
    }

    const limited = await admin.agent
      .get('/api/admin/stats')
      .set('X-Forwarded-For', '198.51.100.7');
    expect(limited.status).toBe(429);
  }, 60_000);
});

describe('admin audit log', () => {
  it('is only readable by admins', async () => {
    const user = await createSignedInAgent('user@example.com');

    expect((await request(app).get('/api/admin/audit')).status).toBe(401);
    expect((await user.agent.get('/api/admin/audit')).status).toBe(403);
  });

  it('records list views without the search text or the rows', async () => {
    const admin = await createAdmin();

    await admin.agent
      .get('/api/admin/users?search=secret%40example.com&role=user')
      .expect(200);

    const entry = await AdminAuditModel.findOne({
      action: 'users.viewed',
    }).lean();
    expect(entry).toMatchObject({
      outcome: 'succeeded',
      metadata: { page: 1, search: true, filters: ['role'], resultCount: 0 },
    });
    expect(entry?.actor?.toString()).toBe(admin.userId);
    expect(JSON.stringify(entry)).not.toContain('secret');
  });

  it('records refused changes as denied, with the reason code', async () => {
    const admin = await createAdmin();

    await admin.agent
      .put(`/api/admin/users/${admin.userId}/role`)
      .send({ role: 'user' })
      .expect(403);

    const entry = await AdminAuditModel.findOne({
      action: 'user.role.changed',
    }).lean();
    expect(entry).toMatchObject({
      outcome: 'denied',
      metadata: { code: 'CANNOT_CHANGE_OWN_ROLE' },
    });
  });

  it('lists entries newest first, filtered by action, with names', async () => {
    const admin = await createAdmin();
    const user = await createSignedInAgent('user@example.com');
    await admin.agent
      .post(`/api/admin/users/${user.userId}/suspend`)
      .send({ reason: 'Spam listings' });
    await admin.agent.get('/api/admin/users');

    const all = await admin.agent.get('/api/admin/audit');
    const suspensions = await admin.agent.get(
      '/api/admin/audit?action=user.suspended',
    );

    expect(
      all.body.items.map((entry: { action: string }) => entry.action),
    ).toEqual(['users.viewed', 'user.suspended']);
    expect(suspensions.body.items).toEqual([
      expect.objectContaining({
        seq: 1,
        action: 'user.suspended',
        actor: expect.objectContaining({ email: 'admin@example.com' }),
        targetUser: expect.objectContaining({ email: 'user@example.com' }),
        metadata: { reason: 'Spam listings' },
      }),
    ]);
  });

  it('cannot be changed or deleted through the application', async () => {
    const admin = await createAdmin();
    await admin.agent.get('/api/admin/users');

    await expect(
      AdminAuditModel.updateOne({}, { outcome: 'denied' }),
    ).rejects.toThrow('append-only');
    await expect(AdminAuditModel.deleteMany({})).rejects.toThrow('append-only');
    expect(await AdminAuditModel.countDocuments()).toBe(1);
  });

  it('forms a hash chain that detects edits and deletions', async () => {
    const admin = await createAdmin();
    for (let index = 0; index < 3; index += 1) {
      await admin.agent.get('/api/admin/users');
    }

    expect(await verifyAuditChain()).toEqual({
      ok: true,
      entries: 3,
      problems: [],
    });

    // Someone with direct database access edits an entry...
    await AdminAuditModel.collection.updateOne(
      { seq: 2 },
      { $set: { 'metadata.resultCount': 99 } },
    );
    expect((await verifyAuditChain()).problems).toEqual([
      'Entry 2: content does not match its hash',
    ]);

    // ...or deletes one.
    await AdminAuditModel.collection.deleteOne({ seq: 1 });
    const afterDelete = await verifyAuditChain();
    expect(afterDelete.ok).toBe(false);
    expect(afterDelete.problems).toContain('Entry 2: expected seq 1');
  });

  it('signs entries with AUDIT_HMAC_KEY when it is set', async () => {
    const admin = await createAdmin();
    process.env.AUDIT_HMAC_KEY = 'k'.repeat(32);

    try {
      await admin.agent.get('/api/admin/users');
      expect((await AdminAuditModel.findOne().lean())?.keyed).toBe(true);
      expect((await verifyAuditChain()).ok).toBe(true);
    } finally {
      delete process.env.AUDIT_HMAC_KEY;
    }

    // Without the key the signed entry can't be checked (or forged).
    expect((await verifyAuditChain()).problems).toEqual([
      'Entry 1: keyed with AUDIT_HMAC_KEY, which is not set here',
    ]);
  });
});

describe('user suspension', () => {
  it('ends existing sessions and blocks sign-in, keeping the data', async () => {
    const admin = await createAdmin();
    const user = await createSignedInAgent('user@example.com');
    const petId = await createPetAs(user);

    const response = await admin.agent
      .post(`/api/admin/users/${user.userId}/suspend`)
      .send({ reason: 'Scam reports' });
    expect(response.status).toBe(200);

    // The open session stops working on its very next request...
    const blocked = await user.agent.post('/api/pets').send(validPet);
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual({ code: 'ACCOUNT_SUSPENDED' });
    // ...and was ended, so it is now simply signed out.
    expect((await user.agent.get('/api/auth/me')).status).toBe(401);

    // Signing in again is refused, but only with the right password.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body).toEqual({ code: 'ACCOUNT_SUSPENDED' });
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'wrong password' });
    expect(wrong.body).toEqual({ code: 'INVALID_CREDENTIALS' });

    // Nothing is deleted; browsing stays public.
    expect(await PetModel.exists({ _id: petId })).not.toBeNull();
    expect((await request(app).get(`/api/pets/${petId}`)).status).toBe(200);

    const entry = await AdminAuditModel.findOne({
      action: 'user.suspended',
    }).lean();
    expect(entry).toMatchObject({
      outcome: 'succeeded',
      metadata: { reason: 'Scam reports' },
    });
  });

  it('can be lifted: the user signs in again', async () => {
    const admin = await createAdmin();
    const user = await createSignedInAgent('user@example.com');
    await admin.agent.post(`/api/admin/users/${user.userId}/suspend`);

    await admin.agent
      .post(`/api/admin/users/${user.userId}/reinstate`)
      .expect(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
    expect(
      await AdminAuditModel.countDocuments({ action: 'user.reinstated' }),
    ).toBe(1);
  });

  it("keeps a suspended applicant's application pending: reject yes, accept no", async () => {
    const admin = await createAdmin();
    const owner = await createSignedInAgent('owner@example.com');
    const applicant = await createSignedInAgent('applicant@example.com');
    const petId = await createPetAs(owner);
    const application = (
      await applicant.agent
        .post(`/api/pets/${petId}/applications`)
        .send({ message: 'Hello' })
    ).body;
    await admin.agent.post(`/api/admin/users/${applicant.userId}/suspend`);

    expect(
      (await ApplicationModel.findById(application._id).lean())?.status,
    ).toBe('pending');

    const accept = await owner.agent.post(
      `/api/applications/${application._id}/accept`,
    );
    expect(accept.status).toBe(409);
    expect(accept.body).toEqual({ code: 'APPLICANT_SUSPENDED' });
    expect((await PetModel.findById(petId).lean())?.status).toBe('pending');

    const reject = await owner.agent.post(
      `/api/applications/${application._id}/reject`,
    );
    expect(reject.status).toBe(200);
    expect((await PetModel.findById(petId).lean())?.status).toBe('available');
  });

  it('never suspends admins or oneself, and never promotes a suspended user', async () => {
    const admin = await createAdmin();
    const otherAdmin = await createAdmin('other-admin@example.com');
    const user = await createSignedInAgent('user@example.com');

    const suspendAdmin = await admin.agent.post(
      `/api/admin/users/${otherAdmin.userId}/suspend`,
    );
    expect(suspendAdmin.status).toBe(409);
    expect(suspendAdmin.body).toEqual({ code: 'CANNOT_SUSPEND_ADMIN' });

    const suspendSelf = await admin.agent.post(
      `/api/admin/users/${admin.userId}/suspend`,
    );
    expect(suspendSelf.status).toBe(403);
    expect(suspendSelf.body).toEqual({ code: 'CANNOT_SUSPEND_SELF' });

    await admin.agent.post(`/api/admin/users/${user.userId}/suspend`);
    const promote = await admin.agent
      .put(`/api/admin/users/${user.userId}/role`)
      .send({ role: 'admin' });
    expect(promote.status).toBe(409);
    expect(promote.body).toEqual({ code: 'USER_SUSPENDED' });
  });

  it('never ends with a suspended admin when promotion and suspension race', async () => {
    const first = await createAdmin();
    const second = await createAdmin('second-admin@example.com');
    const user = await createSignedInAgent('user@example.com');

    await Promise.all([
      first.agent
        .put(`/api/admin/users/${user.userId}/role`)
        .send({ role: 'admin' }),
      second.agent.post(`/api/admin/users/${user.userId}/suspend`),
    ]);

    const stored = await UserModel.findById(user.userId).lean();
    expect(stored?.role === 'admin' && stored.suspendedAt).toBeFalsy();
  });

  it('lists suspended users with their status and counts them', async () => {
    const admin = await createAdmin();
    const user = await createSignedInAgent('user@example.com');
    await admin.agent.post(`/api/admin/users/${user.userId}/suspend`);

    const suspended = await admin.agent.get(
      '/api/admin/users?status=suspended',
    );
    const active = await admin.agent.get('/api/admin/users?status=active');
    const stats = await admin.agent.get('/api/admin/stats');

    expect(suspended.body.items).toEqual([
      expect.objectContaining({
        email: 'user@example.com',
        suspendedAt: expect.any(String),
      }),
    ]);
    expect(active.body.items).toEqual([
      expect.objectContaining({
        email: 'admin@example.com',
        suspendedAt: null,
      }),
    ]);
    expect(stats.body.users.suspended).toBe(1);
  });
});

describe('listing moderation', () => {
  const setUp = async () => {
    const admin = await createAdmin();
    const owner = await createSignedInAgent('owner@example.com');
    const visitor = await createSignedInAgent('visitor@example.com');
    const petId = await createPetAs(owner);

    return { admin, owner, visitor, petId };
  };

  it('hides a listing from everyone but its owner and admins', async () => {
    const { admin, owner, visitor, petId } = await setUp();

    const hide = await admin.agent
      .post(`/api/admin/pets/${petId}/hide`)
      .send({ reason: 'Duplicate listing' });
    expect(hide.status).toBe(200);
    expect(hide.body).toMatchObject({ _id: petId, hidden: true });
    expect(hide.body).not.toHaveProperty('hiddenAt');

    expect((await request(app).get('/api/pets')).body.totalItems).toBe(0);
    expect((await request(app).get(`/api/pets/${petId}`)).status).toBe(404);
    expect((await visitor.agent.get(`/api/pets/${petId}`)).status).toBe(404);
    expect((await owner.agent.get(`/api/pets/${petId}`)).body).toMatchObject({
      hidden: true,
    });
    expect((await admin.agent.get(`/api/pets/${petId}`)).status).toBe(200);

    const apply = await visitor.agent
      .post(`/api/pets/${petId}/applications`)
      .send({ message: 'Hello' });
    expect(apply.status).toBe(404);
    expect(apply.body).toEqual({ code: 'PET_NOT_FOUND' });
  });

  it('leaves existing applications to the owner, and can be restored', async () => {
    const { admin, owner, visitor, petId } = await setUp();
    const application = (
      await visitor.agent
        .post(`/api/pets/${petId}/applications`)
        .send({ message: 'Hello' })
    ).body;

    await admin.agent.post(`/api/admin/pets/${petId}/hide`).expect(200);

    // The adoption rules are unchanged: the owner still decides.
    await owner.agent
      .post(`/api/applications/${application._id}/accept`)
      .expect(200);
    expect((await PetModel.findById(petId).lean())?.status).toBe('adopted');

    await admin.agent.post(`/api/admin/pets/${petId}/restore`).expect(200);
    expect((await request(app).get(`/api/pets/${petId}`)).status).toBe(200);
    expect(
      (
        await AdminAuditModel.find({ targetPet: petId }).sort({ seq: 1 }).lean()
      ).map((entry) => entry.action),
    ).toEqual(['pet.hidden', 'pet.restored']);
  });

  it('cannot be undone by the owner through the edit form', async () => {
    const { admin, owner, petId } = await setUp();
    await admin.agent.post(`/api/admin/pets/${petId}/hide`).expect(200);

    const edit = await owner.agent
      .put(`/api/pets/${petId}`)
      .send({ ...validPet, name: 'Milo 2', hidden: false, hiddenAt: null });

    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({ name: 'Milo 2', hidden: true });
    expect((await request(app).get('/api/pets')).body.totalItems).toBe(0);
  });

  it('shows hidden listings to admins, filterable', async () => {
    const { admin, petId } = await setUp();
    await admin.agent.post(`/api/admin/pets/${petId}/hide`);

    const hidden = await admin.agent.get('/api/admin/pets?visibility=hidden');
    const visible = await admin.agent.get('/api/admin/pets?visibility=visible');

    expect(hidden.body.items).toEqual([
      expect.objectContaining({
        _id: petId,
        hidden: true,
        hiddenAt: expect.any(String),
      }),
    ]);
    expect(visible.body.totalItems).toBe(0);
  });

  it('refuses non-admins and unknown pets', async () => {
    const { admin, owner, petId } = await setUp();

    expect(
      (await owner.agent.post(`/api/admin/pets/${petId}/hide`)).status,
    ).toBe(403);
    const missing = await admin.agent.post(
      '/api/admin/pets/507f1f77bcf86cd799439011/hide',
    );
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ code: 'PET_NOT_FOUND' });
  });
});

describe('admin:grant configuration', () => {
  it('needs only MONGODB_URI (no SESSION_SECRET or CORS_ORIGIN)', async () => {
    const { spawnSync } = await import('node:child_process');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');

    const user = await createSignedInAgent('cli-user@example.com');
    const root = path.resolve(__dirname, '../../../..');
    const run = (env: Record<string, string>) =>
      spawnSync(
        process.execPath,
        [
          path.join(root, 'node_modules/tsx/dist/cli.mjs'),
          path.join(root, 'apps/api/src/scripts/admin-role.ts'),
          'grant',
          'cli-user@example.com',
          '--yes',
        ],
        {
          // An empty directory: no apps/api/.env is picked up.
          cwd: mkdtempSync(path.join(tmpdir(), 'admin-cli-')),
          env: {
            PATH: process.env.PATH ?? '',
            SystemRoot: process.env.SystemRoot ?? '',
            ...env,
          },
          encoding: 'utf8',
        },
      );

    const missing = run({});
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('MONGODB_URI is required');

    const granted = run({ MONGODB_URI: inject('mongoUri') });
    expect(granted.stderr).toBe('');
    expect(granted.status).toBe(0);
    expect(granted.stdout).toContain('Done: the role is now "admin"');
    expect((await UserModel.findById(user.userId).lean())?.role).toBe('admin');
  }, 60_000);
});
