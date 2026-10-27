import type { PipelineStage, QueryFilter, Types } from 'mongoose';
import {
  APPLICATION_STATUSES,
  PET_STATUSES,
  type AdminStats,
  type AdminUser,
  type Paginated,
  type UserSummary,
} from '@pet-adoption/models';

import { ApplicationModel } from '../applications/application.model';
import { PetModel } from '../pets/pet.model';
import { escapeRegex, listPets } from '../pets/pet.service';
import { toPetView } from '../pets/pet-view';
import { UserModel, type UserRecord } from '../users/user.model';
import { toPublicUser } from '../users/user.service';
import { listRecentChanges } from './admin-audit.service';
import type {
  ParsedAdminPetListQuery,
  ParsedAdminUserListQuery,
} from './admin.schema';

type SummaryFields = { _id: Types.ObjectId; name: string; email: string };

const toUserSummary = (user: SummaryFields): UserSummary => ({
  _id: user._id.toString(),
  name: user.name,
  email: user.email,
});

// Only these user fields ever leave the admin queries (never the hash).
const USER_SUMMARY_FIELDS = 'name email';

/** Runs an aggregation on one collection (lets one helper serve several models). */
type Aggregate = <T>(pipeline: PipelineStage[]) => Promise<T[]>;

const aggregateOn =
  (model: typeof PetModel | typeof ApplicationModel): Aggregate =>
  (pipeline) =>
    model.aggregate(pipeline).exec();

/** Counts per value of `field`, with 0 for values that have no documents. */
const countBy = async <T extends string>(
  aggregate: Aggregate,
  field: string,
  values: readonly T[],
): Promise<Record<T, number>> => {
  const groups = await aggregate<{ _id: T; count: number }>([
    // `$status` (a field path), not the literal string "status".
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(values.map((value) => [value, 0]));

  for (const { _id, count } of groups) {
    counts[_id] = count;
  }

  return counts as Record<T, number>;
};

const RECENT_ACTIVITY_LIMIT = 5;

export const getAdminStats = async (): Promise<AdminStats> => {
  const [
    users,
    admins,
    suspended,
    pets,
    hiddenPets,
    applications,
    recentActivity,
  ] = await Promise.all([
    UserModel.countDocuments(),
    UserModel.countDocuments({ role: 'admin' }),
    UserModel.countDocuments({ suspendedAt: { $ne: null } }),
    countBy(aggregateOn(PetModel), 'status', PET_STATUSES),
    PetModel.countDocuments({ hiddenAt: { $ne: null } }),
    countBy(aggregateOn(ApplicationModel), 'status', APPLICATION_STATUSES),
    listRecentChanges(RECENT_ACTIVITY_LIMIT),
  ]);

  const sum = (counts: Record<string, number>) =>
    Object.values(counts).reduce((total, count) => total + count, 0);

  return {
    users: { total: users, admins, suspended },
    pets: { total: sum(pets), hidden: hiddenPets, ...pets },
    applications: { total: sum(applications), ...applications },
    recentActivity,
  };
};

/** Number of documents per user id, for the users on one page. */
const countPerUser = async (
  aggregate: Aggregate,
  field: 'owner' | 'applicant',
  userIds: Types.ObjectId[],
): Promise<Map<string, number>> => {
  const groups = await aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { [field]: { $in: userIds } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ]);

  return new Map(groups.map(({ _id, count }) => [_id.toString(), count]));
};

/**
 * Users, newest first. `search` matches name or email literally (any case);
 * `role: 'user'` includes users stored before roles existed.
 */
export const listAdminUsers = async ({
  search,
  role,
  status,
  page,
  pageSize,
}: ParsedAdminUserListQuery): Promise<Paginated<AdminUser>> => {
  const filter: QueryFilter<UserRecord> = {};

  if (role) {
    filter.role = role === 'admin' ? 'admin' : { $ne: 'admin' };
  }

  if (status) {
    // `null` also matches users stored before suspension existed.
    filter.suspendedAt = status === 'suspended' ? { $ne: null } : null;
  }

  if (search) {
    const pattern = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  const [users, totalItems] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<Array<UserRecord & { _id: Types.ObjectId }>>(),
    UserModel.countDocuments(filter),
  ]);

  const ids = users.map((user) => user._id);
  const [petCounts, applicationCounts] = await Promise.all([
    countPerUser(aggregateOn(PetModel), 'owner', ids),
    countPerUser(aggregateOn(ApplicationModel), 'applicant', ids),
  ]);

  return {
    items: users.map((user) => ({
      ...toPublicUser(user),
      petCount: petCounts.get(user._id.toString()) ?? 0,
      applicationCount: applicationCounts.get(user._id.toString()) ?? 0,
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
    })),
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
  };
};

/**
 * The public pet list (same filters and paging), hidden pets included unless
 * `visibility` says otherwise, plus each pet's owner and when it was hidden.
 * Sent as JSON, the result matches `Paginated<AdminPet>`.
 */
export const listAdminPets = async ({
  visibility,
  ...query
}: ParsedAdminPetListQuery) => {
  const page = await listPets(query, visibility ?? 'all');
  const ownerIds = page.items.flatMap((pet) => (pet.owner ? [pet.owner] : []));
  const owners = await UserModel.find(
    { _id: { $in: ownerIds } },
    USER_SUMMARY_FIELDS,
  ).lean<SummaryFields[]>();
  const ownersById = new Map(
    owners.map((owner) => [owner._id.toString(), toUserSummary(owner)]),
  );

  return {
    ...page,
    items: page.items.map((pet) => ({
      ...toPetView(pet),
      // Pets created before ownership existed have no owner.
      ownerDetails: ownersById.get(String(pet.owner)) ?? null,
      hiddenAt: pet.hiddenAt?.toISOString() ?? null,
    })),
  };
};
