import type {
  ApplicationStatus,
  Pet,
  ReceivedApplication,
} from '@pet-adoption/models';

import {
  findSeedPet,
  isAllowedSeedRequest,
  isRepeatSafeRequest,
  pendingApplicationsOutsideSeed,
} from './seed-guards';

const PET_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_PET_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const APPLICATION_ID = 'cccccccccccccccccccccccc';
const ANA = '111111111111111111111111';
const JELENA = '222222222222222222222222';
const LUKA = '333333333333333333333333';
const VISITOR = '999999999999999999999999';

const pet = (name: string, owner: string, _id = PET_ID): Pet =>
  ({ _id, name, owner }) as Pet;

const received = (
  _id: string,
  applicant: string,
  status: ApplicationStatus,
  petId = PET_ID,
): ReceivedApplication =>
  ({
    _id,
    status,
    pet: { _id: petId },
    applicant: { _id: applicant },
  }) as ReceivedApplication;

describe('isAllowedSeedRequest', () => {
  it.each([
    ['GET', '/pets/mine?page=2&pageSize=50'],
    ['GET', `/applications/mine?pet=${PET_ID}&pageSize=1`],
    ['GET', '/applications/received?page=1&pageSize=50'],
    ['POST', '/auth/login'],
    ['POST', '/auth/register'],
    ['POST', '/pets'],
    ['POST', `/pets/${PET_ID}/images`],
    ['POST', `/pets/${PET_ID}/applications`],
    ['POST', `/applications/${APPLICATION_ID}/accept`],
    ['POST', `/applications/${APPLICATION_ID}/reject`],
    ['POST', `/applications/${APPLICATION_ID}/withdraw`],
  ])('allows %s %s', (method, apiPath) => {
    expect(isAllowedSeedRequest(method, apiPath)).toBe(true);
  });

  it.each([
    // Deleting or editing anything.
    ['DELETE', `/pets/${PET_ID}`],
    ['DELETE', `/pets/${PET_ID}/images/${APPLICATION_ID}`],
    ['PUT', `/pets/${PET_ID}`],
    ['PUT', `/pets/${PET_ID}/image`],
    ['POST', `/pets/${PET_ID}/images/${APPLICATION_ID}/main`],
    // Admin routes and other accounts' data.
    ['POST', `/admin/users/${ANA}/suspend`],
    ['GET', '/admin/users'],
    ['POST', '/auth/logout'],
    // Look-alike paths.
    ['POST', '/pets/mine/applications'],
    ['POST', `/applications/${APPLICATION_ID}/accept/extra`],
    ['GET', '/pets'],
  ])('refuses %s %s', (method, apiPath) => {
    expect(isAllowedSeedRequest(method, apiPath)).toBe(false);
  });
});

describe('findSeedPet', () => {
  it('finds the pet by exact name and owner', () => {
    const max = pet('Max', ANA);

    expect(findSeedPet([pet('Maxi', ANA), max], 'Max', ANA)).toBe(max);
  });

  it("never takes another owner's pet with the same name", () => {
    expect(findSeedPet([pet('Max', VISITOR)], 'Max', ANA)).toBeUndefined();
  });

  it('returns nothing when the pet does not exist yet', () => {
    expect(findSeedPet([], 'Max', ANA)).toBeUndefined();
  });

  it('stops when the owner has two pets with that name', () => {
    expect(() =>
      findSeedPet([pet('Max', ANA), pet('Max', ANA, OTHER_PET_ID)], 'Max', ANA),
    ).toThrow("can't tell which one");
  });
});

// The only requests a dry run sends and the only ones retried after a lost
// response.
describe('isRepeatSafeRequest', () => {
  it.each([
    ['GET', '/pets/mine?page=1&pageSize=50'],
    ['GET', '/ready'],
    ['GET', '/applications/received'],
    ['POST', '/auth/login'],
  ])('treats %s %s as repeat-safe', (method, apiPath) => {
    expect(isRepeatSafeRequest(method, apiPath)).toBe(true);
  });

  it.each([
    ['POST', '/auth/register'],
    ['POST', '/pets'],
    ['POST', `/pets/${PET_ID}/images`],
    ['POST', `/pets/${PET_ID}/applications`],
    ['POST', `/applications/${APPLICATION_ID}/accept`],
    ['POST', `/applications/${APPLICATION_ID}/reject`],
    ['POST', `/applications/${APPLICATION_ID}/withdraw`],
    ['POST', '/auth/login/extra'],
    ['PUT', `/pets/${PET_ID}`],
    ['DELETE', `/pets/${PET_ID}`],
  ])('treats %s %s as a change', (method, apiPath) => {
    expect(isRepeatSafeRequest(method, apiPath)).toBe(false);
  });
});

describe('pendingApplicationsOutsideSeed', () => {
  const seedUserIds = new Set([ANA, JELENA, LUKA]);

  it('is empty when only demo accounts applied', () => {
    expect(
      pendingApplicationsOutsideSeed(
        [
          received(APPLICATION_ID, JELENA, 'pending'),
          received('dddddddddddddddddddddddd', LUKA, 'pending'),
        ],
        PET_ID,
        APPLICATION_ID,
        seedUserIds,
      ),
    ).toEqual([]);
  });

  it('finds a pending application from another account for the same pet', () => {
    const visitor = received('eeeeeeeeeeeeeeeeeeeeeeee', VISITOR, 'pending');

    expect(
      pendingApplicationsOutsideSeed(
        [received(APPLICATION_ID, JELENA, 'pending'), visitor],
        PET_ID,
        APPLICATION_ID,
        seedUserIds,
      ),
    ).toEqual([visitor]);
  });

  it('ignores applications the accept would not change', () => {
    expect(
      pendingApplicationsOutsideSeed(
        [
          // Another pet.
          received(
            'eeeeeeeeeeeeeeeeeeeeeeee',
            VISITOR,
            'pending',
            OTHER_PET_ID,
          ),
          // Already decided or withdrawn.
          received('ffffffffffffffffffffffff', VISITOR, 'rejected'),
          received('fffffffffffffffffffffff1', VISITOR, 'withdrawn'),
        ],
        PET_ID,
        APPLICATION_ID,
        seedUserIds,
      ),
    ).toEqual([]);
  });
});
