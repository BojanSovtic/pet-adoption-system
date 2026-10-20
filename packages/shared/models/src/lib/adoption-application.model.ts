import type { Pet, PetStatus } from './pet.model.js';
import type { User } from './user.model.js';

export const APPLICATION_MESSAGE_MAX_LENGTH = 2000;

export const APPLICATION_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * Application state machine. Every status change goes through one of these
 * actions; there is no way to set a status directly. `autoReject` is not an
 * API action: the system applies it to the other pending applications when
 * one is accepted.
 */
export const APPLICATION_TRANSITIONS = {
  accept: { from: 'pending', to: 'accepted', actor: 'owner' },
  reject: { from: 'pending', to: 'rejected', actor: 'owner' },
  withdraw: { from: 'pending', to: 'withdrawn', actor: 'applicant' },
  autoReject: { from: 'pending', to: 'rejected', actor: 'system' },
} as const satisfies Record<
  string,
  {
    from: ApplicationStatus;
    to: ApplicationStatus;
    actor: 'owner' | 'applicant' | 'system';
  }
>;

export type ApplicationTransition = keyof typeof APPLICATION_TRANSITIONS;

/** Actions a user can trigger through the API. */
export type ApplicationAction = Exclude<ApplicationTransition, 'autoReject'>;
export type ApplicationActor = 'owner' | 'applicant';

/** The target status, or `null` if the transition is not allowed from `status`. */
export const getApplicationTransitionTarget = (
  transition: ApplicationTransition,
  status: ApplicationStatus,
): ApplicationStatus | null => {
  const { from, to } = APPLICATION_TRANSITIONS[transition];

  return status === from ? to : null;
};

/** The API actions `actor` may take on an application in `status`. */
export const getAllowedApplicationActions = (
  status: ApplicationStatus,
  actor: ApplicationActor,
): ApplicationAction[] =>
  (['accept', 'reject', 'withdraw'] as const).filter(
    (action) =>
      APPLICATION_TRANSITIONS[action].actor === actor &&
      APPLICATION_TRANSITIONS[action].from === status,
  );

/**
 * Pet state machine. Pet status is never set by a request; it follows from
 * application events:
 * - available → pending: the first pending application arrives.
 * - pending → available: the last pending application is rejected or withdrawn.
 * - pending → adopted: an application is accepted (final).
 */
export const PET_STATUS_TRANSITIONS = {
  available: ['pending'],
  pending: ['available', 'adopted'],
  adopted: [],
} as const satisfies Record<PetStatus, readonly PetStatus[]>;

export const canTransitionPetStatus = (
  from: PetStatus,
  to: PetStatus,
): boolean =>
  (PET_STATUS_TRANSITIONS[from] as readonly PetStatus[]).includes(to);

/** Pet fields included with applications. Never includes owner details. */
export type ApplicationPetSummary = Pick<
  Pet,
  '_id' | 'name' | 'species' | 'status'
>;

/** Applicant details; only visible to the owner of the pet. */
export type ApplicantSummary = Pick<User, '_id' | 'name' | 'email'>;

type ApplicationBase = {
  _id: string;
  message: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
};

/** An application as its applicant sees it. */
export type MyApplication = ApplicationBase & {
  pet: ApplicationPetSummary;
};

/** An application as the pet's owner sees it. */
export type ReceivedApplication = ApplicationBase & {
  pet: ApplicationPetSummary;
  applicant: ApplicantSummary;
};

export type CreateApplicationInput = {
  message: string;
};
