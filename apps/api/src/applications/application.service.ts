import { mongo, type Types } from 'mongoose';
import {
  APPLICATION_TRANSITIONS,
  getApplicationTransitionTarget,
  type ApplicantSummary,
  type ApplicationAction,
  type ApplicationPetSummary,
  type CreateApplicationInput,
  type MyApplication,
  type ReceivedApplication,
} from '@pet-adoption/models';

import { withTransaction } from '../config/database';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors/app-error';
import { PetModel, type PetRecord } from '../pets/pet.model';
import { lockPet, transitionPetStatus } from '../pets/pet.service';
import { ApplicationModel, type ApplicationRecord } from './application.model';

const DUPLICATE_KEY_ERROR = 11000;

const isDuplicateKeyError = (error: unknown): boolean =>
  error instanceof mongo.MongoServerError && error.code === DUPLICATE_KEY_ERROR;

type StoredApplication = ApplicationRecord & { _id: Types.ObjectId };
type PopulatedPet = Pick<PetRecord, 'name' | 'species' | 'status'> & {
  _id: Types.ObjectId;
};
type PopulatedApplicant = { _id: Types.ObjectId; name: string; email: string };

const PET_SUMMARY_FIELDS = 'name species status';
// Only the pet's owner ever receives these.
const APPLICANT_SUMMARY_FIELDS = 'name email';

const toPetSummary = (pet: PopulatedPet): ApplicationPetSummary => ({
  _id: pet._id.toString(),
  name: pet.name,
  species: pet.species,
  status: pet.status,
});

const toApplicantSummary = (
  applicant: PopulatedApplicant,
): ApplicantSummary => ({
  _id: applicant._id.toString(),
  name: applicant.name,
  email: applicant.email,
});

const toBaseView = (
  application: Pick<
    ApplicationRecord,
    'message' | 'status' | 'createdAt' | 'updatedAt'
  > & { _id: Types.ObjectId },
) => ({
  _id: application._id.toString(),
  message: application.message,
  status: application.status,
  createdAt: application.createdAt.toISOString(),
  updatedAt: application.updatedAt.toISOString(),
});

/** Applicant view: the application with a pet summary (no owner details). */
const findApplicantViews = async (
  filter: Record<string, unknown>,
): Promise<MyApplication[]> => {
  const applications = await ApplicationModel.find(filter)
    .sort({ createdAt: -1 })
    .populate<{ pet: PopulatedPet }>('pet', PET_SUMMARY_FIELDS)
    .lean();

  return applications.map((application) => ({
    ...toBaseView(application),
    pet: toPetSummary(application.pet),
  }));
};

/** Owner view: also includes the applicant's name and email. */
const findOwnerViews = async (
  ownerId: string,
  filter: Record<string, unknown> = {},
): Promise<ReceivedApplication[]> => {
  const ownPetIds = await PetModel.find({ owner: ownerId }).distinct('_id');

  const applications = await ApplicationModel.find({
    ...filter,
    pet: { $in: ownPetIds },
  })
    .sort({ createdAt: -1 })
    .populate<{ pet: PopulatedPet }>('pet', PET_SUMMARY_FIELDS)
    .populate<{ applicant: PopulatedApplicant }>(
      'applicant',
      APPLICANT_SUMMARY_FIELDS,
    )
    .lean();

  return applications.map((application) => ({
    ...toBaseView(application),
    pet: toPetSummary(application.pet),
    applicant: toApplicantSummary(application.applicant),
  }));
};

/** Applications the user submitted, newest first. */
export const listMyApplications = (
  applicantId: string,
): Promise<MyApplication[]> => findApplicantViews({ applicant: applicantId });

/** Applications for pets the user owns, newest first. */
export const listReceivedApplications = (
  ownerId: string,
): Promise<ReceivedApplication[]> => findOwnerViews(ownerId);

export const getApplicationView = async (
  applicationId: string,
  userId: string,
  role: ApplicationRole,
): Promise<MyApplication | ReceivedApplication | undefined> => {
  const [view] =
    role === 'owner'
      ? await findOwnerViews(userId, { _id: applicationId })
      : await findApplicantViews({ _id: applicationId, applicant: userId });

  return view;
};

/**
 * Submits an application. In one transaction: the pet is locked and checked,
 * the application is created as `pending`, and an `available` pet becomes
 * `pending`.
 */
export const submitApplication = async (
  petId: string,
  applicantId: string,
  { message }: CreateApplicationInput,
): Promise<string> => {
  try {
    return await withTransaction(async (session) => {
      const pet = await lockPet(session, petId);

      if (!pet) {
        throw new NotFoundError('PET_NOT_FOUND');
      }

      if (pet.owner?.equals(applicantId)) {
        throw new ForbiddenError('CANNOT_APPLY_TO_OWN_PET');
      }

      // Pets created before ownership existed have no owner to review them.
      if (!pet.owner || pet.status === 'adopted') {
        throw new ConflictError('PET_NOT_AVAILABLE');
      }

      const [application] = await ApplicationModel.create(
        [{ pet: pet._id, applicant: applicantId, message, status: 'pending' }],
        { session },
      );

      if (pet.status === 'available') {
        await transitionPetStatus(session, pet, 'pending');
      }

      return application._id.toString();
    });
  } catch (error) {
    // The unique index: a non-withdrawn application already exists.
    if (isDuplicateKeyError(error)) {
      throw new ConflictError('ALREADY_APPLIED');
    }

    throw error;
  }
};

export type ApplicationRole = 'owner' | 'applicant';

/**
 * Who the user is for this application. Anyone else gets 404, so the API never
 * confirms that someone else's application exists.
 */
const getRole = async (
  applicationId: string,
  userId: string,
): Promise<{ application: StoredApplication; role: ApplicationRole }> => {
  const application =
    await ApplicationModel.findById(applicationId).lean<StoredApplication>();

  if (application) {
    if (application.applicant.equals(userId)) {
      return { application, role: 'applicant' };
    }

    const pet = await PetModel.findById(application.pet).select('owner').lean();

    if (pet?.owner?.equals(userId)) {
      return { application, role: 'owner' };
    }
  }

  throw new NotFoundError('APPLICATION_NOT_FOUND');
};

/**
 * Runs an application state-machine action (accept, reject, withdraw) and the
 * resulting pet transition in one transaction. Returns the user's role, so the
 * caller can return the right view.
 */
export const transitionApplication = async (
  applicationId: string,
  userId: string,
  action: ApplicationAction,
): Promise<ApplicationRole> => {
  const { application, role } = await getRole(applicationId, userId);
  const transition = APPLICATION_TRANSITIONS[action];

  // Permission: each action has exactly one allowed actor.
  if (transition.actor !== role) {
    throw new ForbiddenError(
      transition.actor === 'owner' ? 'NOT_PET_OWNER' : 'NOT_APPLICANT',
    );
  }

  try {
    await withTransaction(async (session) => {
      // Lock first, then read: everything below sees committed, current data.
      const pet = await lockPet(session, application.pet);

      if (!pet) {
        throw new NotFoundError('APPLICATION_NOT_FOUND');
      }

      if (action === 'accept' && pet.status !== 'pending') {
        throw new ConflictError('PET_NOT_AVAILABLE');
      }

      const current = await ApplicationModel.findById(application._id)
        .session(session)
        .lean<StoredApplication>();
      const target = current
        ? getApplicationTransitionTarget(action, current.status)
        : null;

      if (!target) {
        throw new ConflictError('INVALID_STATUS_TRANSITION');
      }

      // Conditional update: only changes an application still in `from`.
      const updated = await ApplicationModel.updateOne(
        { _id: application._id, status: transition.from },
        { status: target },
        { session },
      );

      if (updated.matchedCount === 0) {
        throw new ConflictError('INVALID_STATUS_TRANSITION');
      }

      if (action === 'accept') {
        // The pet is adopted; every other pending application is rejected.
        await ApplicationModel.updateMany(
          {
            pet: pet._id,
            status: APPLICATION_TRANSITIONS.autoReject.from,
            _id: { $ne: application._id },
          },
          { status: APPLICATION_TRANSITIONS.autoReject.to },
          { session },
        );
        await transitionPetStatus(session, pet, 'adopted');
        return;
      }

      // Reject/withdraw: the pet becomes available once nothing is pending.
      const stillPending = await ApplicationModel.exists({
        pet: pet._id,
        status: 'pending',
      }).session(session);

      if (!stillPending && pet.status === 'pending') {
        await transitionPetStatus(session, pet, 'available');
      }
    });
  } catch (error) {
    // The "one accepted application per pet" index: never expected once the
    // pet is locked, but it is the final guarantee.
    if (isDuplicateKeyError(error)) {
      throw new ConflictError('PET_NOT_AVAILABLE');
    }

    throw error;
  }

  return role;
};
