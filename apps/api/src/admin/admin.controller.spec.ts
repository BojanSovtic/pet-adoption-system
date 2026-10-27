import mongoose from 'mongoose';
import request from 'supertest';

import { app } from '../app';
import {
  createSignedInAgent,
  type SignedInAgent,
} from '../test/auth-test-helpers';
import { UserModel } from '../users/user.model';
import { AdminAuditModel } from './admin-audit.model';
import { changeUserRole } from './user-role.service';

// Like the admin:grant command: tests provision admins directly in the
// database, never through the API.
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

const ADMIN_READ_ENDPOINTS = [
  '/api/admin/stats',
  '/api/admin/users',
  '/api/admin/pets',
  '/api/admin/applications',
];

describe('admin access control', () => {
  it.each(ADMIN_READ_ENDPOINTS)(
    '%s needs a signed-in user (401)',
    async (path) => {
      const response = await request(app).get(path);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ code: 'UNAUTHENTICATED' });
    },
  );

  it('refuses every admin endpoint to ordinary users (403)', async () => {
    const user = await createSignedInAgent('user@example.com');

    for (const path of ADMIN_READ_ENDPOINTS) {
      const response = await user.agent.get(path);
      expect(response.status, path).toBe(403);
      expect(response.body, path).toEqual({ code: 'ADMIN_REQUIRED' });
    }

    const roleChange = await user.agent
      .put(`/api/admin/users/${user.userId}/role`)
      .send({ role: 'admin' });
    expect(roleChange.status).toBe(403);
    expect(roleChange.body).toEqual({ code: 'ADMIN_REQUIRED' });
  });

  it('denies unknown admin paths by default', async () => {
    const user = await createSignedInAgent('user@example.com');

    expect((await request(app).get('/api/admin/nope')).status).toBe(401);
    expect((await user.agent.get('/api/admin/nope')).status).toBe(403);
  });

  it('lets admins use every admin endpoint', async () => {
    const admin = await createAdmin();

    for (const path of ADMIN_READ_ENDPOINTS) {
      expect((await admin.agent.get(path)).status, path).toBe(200);
    }
  });

  it('reports the role in /auth/me', async () => {
    const admin = await createAdmin();
    const user = await createSignedInAgent('user@example.com');

    expect((await admin.agent.get('/api/auth/me')).body.role).toBe('admin');
    expect((await user.agent.get('/api/auth/me')).body.role).toBe('user');
  });
});

describe('admin provisioning', () => {
  it('never creates an admin through registration', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: 'sneaky@example.com',
      name: 'Sneaky',
      password: 'correct horse battery',
      role: 'admin',
    });

    expect(response.status).toBe(201);
    expect(response.body.role).toBe('user');
    expect(
      (await UserModel.findOne({ email: 'sneaky@example.com' }).lean())?.role,
    ).toBe('user');
  });

  it('treats users stored before roles existed as ordinary users', async () => {
    const legacy = await createSignedInAgent('legacy@example.com');
    await UserModel.updateOne({ _id: legacy.userId }, { $unset: { role: 1 } });

    expect((await legacy.agent.get('/api/auth/me')).body.role).toBe('user');
    expect((await legacy.agent.get('/api/admin/stats')).status).toBe(403);
  });
});

describe('GET /api/admin/users', () => {
  it('lists users with roles and counts, without credentials', async () => {
    const admin = await createAdmin();
    const owner = await createSignedInAgent('owner@example.com');
    const petResponse = await owner.agent.post('/api/pets').send(validPet);
    await admin.agent
      .post(`/api/pets/${petResponse.body._id}/applications`)
      .send({ message: 'I would love to.' });

    const response = await admin.agent.get('/api/admin/users');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, totalItems: 2 });

    for (const user of response.body.items) {
      expect(Object.keys(user).sort()).toEqual([
        '_id',
        'applicationCount',
        'createdAt',
        'email',
        'name',
        'petCount',
        'role',
        'suspendedAt',
        'updatedAt',
      ]);
    }

    const byEmail = Object.fromEntries(
      response.body.items.map((user: { email: string }) => [user.email, user]),
    );
    expect(byEmail['owner@example.com']).toMatchObject({
      role: 'user',
      petCount: 1,
      applicationCount: 0,
    });
    expect(byEmail['admin@example.com']).toMatchObject({
      role: 'admin',
      petCount: 0,
      applicationCount: 1,
    });
  });

  it('searches name and email literally and filters by role', async () => {
    const admin = await createAdmin();
    await UserModel.insertMany([
      { email: 'luna@example.com', name: 'Luna Lovegood', role: 'user' },
      { email: 'max@example.com', name: 'Max', role: 'admin' },
      // Stored before roles existed: counts as "user".
      { email: 'old@example.com', name: 'Old Timer' },
      { email: 'axb@example.com', name: 'A x B', role: 'user' },
    ]);

    const emails = async (query: string) =>
      (await admin.agent.get(`/api/admin/users?${query}`)).body.items
        .map((user: { email: string }) => user.email)
        .sort();

    expect(await emails('search=LUNA')).toEqual(['luna@example.com']);
    expect(await emails('search=max%40')).toEqual(['max@example.com']);
    // "." is matched literally, not as "any character".
    expect(await emails('search=a.b')).toEqual([]);
    expect(await emails('role=admin')).toEqual([
      'admin@example.com',
      'max@example.com',
    ]);
    expect(await emails('role=user')).toEqual([
      'axb@example.com',
      'luna@example.com',
      'old@example.com',
    ]);
  });

  it('pages through users', async () => {
    const admin = await createAdmin();
    await UserModel.insertMany(
      Array.from({ length: 4 }, (_, index) => ({
        email: `user${index}@example.com`,
        name: `User ${index}`,
      })),
    );

    const first = await admin.agent.get('/api/admin/users?pageSize=2');
    const third = await admin.agent.get('/api/admin/users?pageSize=2&page=3');

    expect(first.body).toMatchObject({
      page: 1,
      pageSize: 2,
      totalItems: 5,
      totalPages: 3,
    });
    expect(first.body.items).toHaveLength(2);
    expect(third.body.items).toHaveLength(1);
  });

  it.each([
    ['pageSize=51', 'pageSize', 'too_big'],
    ['page=0', 'page', 'too_small'],
    ['role=root', 'role', 'invalid_value'],
    [`search=${'a'.repeat(101)}`, 'search', 'too_big'],
  ])('rejects %s', async (query, field, code) => {
    const admin = await createAdmin();

    const response = await admin.agent.get(`/api/admin/users?${query}`);

    expect(response.status).toBe(400);
    expect(response.body.details).toContainEqual({ field, code });
  });
});

describe('PUT /api/admin/users/:id/role', () => {
  it('promotes a user, effective on their next request, and audits it', async () => {
    const admin = await createAdmin();
    const user = await createSignedInAgent('user@example.com');

    expect((await user.agent.get('/api/admin/stats')).status).toBe(403);

    const response = await admin.agent
      .put(`/api/admin/users/${user.userId}/role`)
      .send({ role: 'admin' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ _id: user.userId, role: 'admin' });
    expect(response.body).not.toHaveProperty('passwordHash');
    // Same session, no new sign-in: the role is read on every request.
    expect((await user.agent.get('/api/admin/stats')).status).toBe(200);

    const audit = await AdminAuditModel.find({
      action: 'user.role.changed',
    }).lean();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'user.role.changed',
      outcome: 'succeeded',
      metadata: { from: 'user', to: 'admin' },
      source: 'admin-ui',
    });
    expect(audit[0].actor?.toString()).toBe(admin.userId);
    expect(audit[0].targetUser?.toString()).toBe(user.userId);
  });

  it('takes admin access away from an existing session at once', async () => {
    const admin = await createAdmin();
    const other = await createAdmin('other-admin@example.com');

    expect((await other.agent.get('/api/admin/users')).status).toBe(200);

    await admin.agent
      .put(`/api/admin/users/${other.userId}/role`)
      .send({ role: 'user' })
      .expect(200);

    const afterDemotion = await other.agent.get('/api/admin/users');
    expect(afterDemotion.status).toBe(403);
    expect(afterDemotion.body).toEqual({ code: 'ADMIN_REQUIRED' });
  });

  it("forbids changing one's own role", async () => {
    const admin = await createAdmin();
    await createAdmin('other-admin@example.com');

    const response = await admin.agent
      .put(`/api/admin/users/${admin.userId}/role`)
      .send({ role: 'user' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: 'CANNOT_CHANGE_OWN_ROLE' });
    expect((await UserModel.findById(admin.userId).lean())?.role).toBe('admin');
  });

  it('takes the target from the URL and the actor from the session only', async () => {
    const admin = await createAdmin();
    const user = await createSignedInAgent('user@example.com');
    const bystander = await createSignedInAgent('bystander@example.com');

    // A body trying to name another target or actor is ignored.
    const response = await admin.agent
      .put(`/api/admin/users/${user.userId}/role`)
      .send({ role: 'admin', userId: bystander.userId, actorId: user.userId });

    expect(response.status).toBe(200);
    expect((await UserModel.findById(bystander.userId).lean())?.role).toBe(
      'user',
    );
    expect(
      (
        await AdminAuditModel.findOne({ action: 'user.role.changed' }).lean()
      )?.actor?.toString(),
    ).toBe(admin.userId);
  });

  it.each([
    [{ role: 'superadmin' }, 'invalid_value'],
    [{ role: 'ADMIN' }, 'invalid_value'],
    [{}, 'invalid_value'],
  ])('rejects the body %j', async (body, code) => {
    const admin = await createAdmin();
    const user = await createSignedInAgent('user@example.com');

    const response = await admin.agent
      .put(`/api/admin/users/${user.userId}/role`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'role', code }],
    });
  });

  it('rejects an invalid or unknown user id', async () => {
    const admin = await createAdmin();

    const invalid = await admin.agent
      .put('/api/admin/users/not-an-id/role')
      .send({ role: 'admin' });
    const missing = await admin.agent
      .put(`/api/admin/users/${new mongoose.Types.ObjectId()}/role`)
      .send({ role: 'admin' });

    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ code: 'INVALID_USER_ID' });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ code: 'USER_NOT_FOUND' });
  });

  it('is a no-op without an audit entry when the role is unchanged', async () => {
    const admin = await createAdmin();
    const user = await createSignedInAgent('user@example.com');

    await admin.agent
      .put(`/api/admin/users/${user.userId}/role`)
      .send({ role: 'user' })
      .expect(200);

    expect(await AdminAuditModel.countDocuments()).toBe(0);
    expect(
      await AdminAuditModel.countDocuments({ action: 'user.role.changed' }),
    ).toBe(0);
  });

  it('lets only one of two admins demoting each other at once succeed', async () => {
    const first = await createAdmin();
    const second = await createAdmin('second-admin@example.com');

    const responses = await Promise.all([
      first.agent
        .put(`/api/admin/users/${second.userId}/role`)
        .send({ role: 'user' }),
      second.agent
        .put(`/api/admin/users/${first.userId}/role`)
        .send({ role: 'user' }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 403,
    ]);
    expect(await UserModel.countDocuments({ role: 'admin' })).toBe(1);
  });
});

describe('changeUserRole (shared by the API and admin:grant)', () => {
  it('never removes the last admin', async () => {
    const admin = await createAdmin();

    await expect(
      changeUserRole({ targetId: admin.userId, role: 'user', source: 'cli' }),
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    expect((await UserModel.findById(admin.userId).lean())?.role).toBe('admin');
  });

  it('records CLI changes without an actor', async () => {
    const user = await createSignedInAgent('user@example.com');

    await changeUserRole({
      targetId: user.userId,
      role: 'admin',
      source: 'cli',
    });

    const entry = await AdminAuditModel.findOne().lean();
    expect(entry).toMatchObject({
      source: 'cli',
      outcome: 'succeeded',
      metadata: { from: 'user', to: 'admin' },
    });
    expect(entry?.actor).toBeUndefined();
  });

  it('refuses an actor who is no longer an admin', async () => {
    const former = await createSignedInAgent('former@example.com');
    const user = await createSignedInAgent('user@example.com');

    await expect(
      changeUserRole({
        targetId: user.userId,
        role: 'admin',
        actorId: former.userId,
        source: 'admin-ui',
      }),
    ).rejects.toMatchObject({ code: 'ADMIN_REQUIRED' });
  });
});

describe('platform oversight', () => {
  const setUpAdoption = async () => {
    const admin = await createAdmin();
    const owner = await createSignedInAgent('owner@example.com');
    const applicant = await createSignedInAgent('applicant@example.com');
    const pet = (await owner.agent.post('/api/pets').send(validPet)).body;
    const application = (
      await applicant.agent
        .post(`/api/pets/${pet._id}/applications`)
        .send({ message: 'Private message for the owner.' })
    ).body;

    return { admin, owner, applicant, pet, application };
  };

  it('counts users, pets and applications by status, with recent activity', async () => {
    const { admin, applicant } = await setUpAdoption();
    await admin.agent
      .put(`/api/admin/users/${applicant.userId}/role`)
      .send({ role: 'admin' });

    const response = await admin.agent.get('/api/admin/stats');

    expect(response.body).toMatchObject({
      users: { total: 3, admins: 2, suspended: 0 },
      pets: { total: 1, hidden: 0, available: 0, pending: 1, adopted: 0 },
      applications: {
        total: 1,
        pending: 1,
        accepted: 0,
        rejected: 0,
        withdrawn: 0,
      },
    });
    expect(response.body.recentActivity).toEqual([
      expect.objectContaining({
        action: 'user.role.changed',
        actor: expect.objectContaining({ email: 'admin@example.com' }),
        targetUser: expect.objectContaining({
          email: 'applicant@example.com',
        }),
        outcome: 'succeeded',
        metadata: { from: 'user', to: 'admin' },
        source: 'admin-ui',
      }),
    ]);
  });

  it("lists pets with their owner's name and email", async () => {
    const { admin } = await setUpAdoption();

    const response = await admin.agent.get('/api/admin/pets?status=pending');

    expect(response.body.totalItems).toBe(1);
    expect(response.body.items[0]).toMatchObject({
      name: 'Milo',
      ownerDetails: { name: 'Test User', email: 'owner@example.com' },
    });
  });

  it('lists applications with the people involved but not the message', async () => {
    const { admin } = await setUpAdoption();

    const all = await admin.agent.get('/api/admin/applications');
    const accepted = await admin.agent.get(
      '/api/admin/applications?status=accepted',
    );

    expect(all.body.totalItems).toBe(1);
    expect(all.body.items[0]).toMatchObject({
      status: 'pending',
      pet: { name: 'Milo' },
      applicant: { email: 'applicant@example.com' },
      owner: { email: 'owner@example.com' },
    });
    expect(all.body.items[0]).not.toHaveProperty('message');
    expect(accepted.body.totalItems).toBe(0);
  });

  it('gives admins no way around ownership or the adoption rules', async () => {
    const { admin, pet, application } = await setUpAdoption();

    const accept = await admin.agent.post(
      `/api/applications/${application._id}/accept`,
    );
    const edit = await admin.agent
      .put(`/api/pets/${pet._id}`)
      .send({ ...validPet, name: 'Taken over' });
    const remove = await admin.agent.delete(`/api/pets/${pet._id}`);

    // Not the owner: the application is hidden, the pet is not theirs.
    expect(accept.status).toBe(404);
    expect(edit.status).toBe(403);
    expect(remove.status).toBe(403);
  });
});
