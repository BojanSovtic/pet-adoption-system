import {
  APPLICATION_STATUSES,
  PET_STATUSES,
  canTransitionPetStatus,
  getAllowedApplicationActions,
  getApplicationTransitionTarget,
  type ApplicationStatus,
  type ApplicationTransition,
  type PetStatus,
} from '@pet-adoption/models';

describe('application state machine', () => {
  const allowed: Record<ApplicationTransition, ApplicationStatus> = {
    accept: 'accepted',
    reject: 'rejected',
    withdraw: 'withdrawn',
    autoReject: 'rejected',
  };

  it.each(Object.entries(allowed))(
    '%s moves a pending application to %s',
    (transition, target) => {
      expect(
        getApplicationTransitionTarget(
          transition as ApplicationTransition,
          'pending',
        ),
      ).toBe(target);
    },
  );

  const finalStatuses = APPLICATION_STATUSES.filter(
    (status) => status !== 'pending',
  );

  it.each(
    finalStatuses.flatMap((status) =>
      Object.keys(allowed).map((transition) => [transition, status] as const),
    ),
  )('%s is not allowed from %s (final state)', (transition, status) => {
    expect(
      getApplicationTransitionTarget(
        transition as ApplicationTransition,
        status,
      ),
    ).toBeNull();
  });

  it('gives each actor only their own actions, and only while pending', () => {
    expect(getAllowedApplicationActions('pending', 'owner')).toEqual([
      'accept',
      'reject',
    ]);
    expect(getAllowedApplicationActions('pending', 'applicant')).toEqual([
      'withdraw',
    ]);

    for (const status of finalStatuses) {
      expect(getAllowedApplicationActions(status, 'owner')).toEqual([]);
      expect(getAllowedApplicationActions(status, 'applicant')).toEqual([]);
    }
  });
});

describe('pet state machine', () => {
  const allowedTransitions: Array<[PetStatus, PetStatus]> = [
    ['available', 'pending'],
    ['pending', 'available'],
    ['pending', 'adopted'],
  ];

  const allPairs = PET_STATUSES.flatMap((from) =>
    PET_STATUSES.map((to) => [from, to] as [PetStatus, PetStatus]),
  );

  it.each(allPairs)('%s → %s', (from, to) => {
    const isAllowed = allowedTransitions.some(
      ([allowedFrom, allowedTo]) => allowedFrom === from && allowedTo === to,
    );

    expect(canTransitionPetStatus(from, to)).toBe(isAllowed);
  });
});
