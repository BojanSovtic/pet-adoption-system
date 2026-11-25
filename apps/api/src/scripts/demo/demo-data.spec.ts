import { readdirSync } from 'node:fs';
import path from 'node:path';
import {
  PET_COMPATIBILITY_TARGETS,
  type ApplicationStatus,
  type PetStatus,
} from '@pet-adoption/models';

import { createApplicationSchema } from '../../features/applications/application.schema';
import { registerSchema } from '../../features/auth/auth.schema';
import { createPetSchema } from '../../features/pets/pet.schema';
import {
  APPLICATIONS,
  applicationMessage,
  PETS,
  USERS,
  type ApplicationSpec,
  type Outcome,
  type UserKey,
} from './demo-data';
import { findDemoImages, parseDemoImageName } from './demo-images';

/**
 * The seed sends this data through the real API, so a record the API would
 * refuse stops a seed halfway. These tests catch that before a run, and pin
 * the facts the manual QA cases (docs/manual-qa-test-cases.csv, "Seed data:")
 * rely on. If a QA expectation below fails after a deliberate dataset change,
 * update the QA workbook in the same change.
 */

const DEMO_IMAGE_DIR = path.join(__dirname, 'demo-images');

const petNamed = (name: string) => {
  const pet = PETS.find((spec) => spec.name === name);

  if (!pet) {
    throw new Error(`No demo pet ${name}`);
  }

  return pet;
};

const finalStatus = (outcome: Outcome): ApplicationStatus =>
  outcome === 'autoRejected' ? 'rejected' : outcome;

const applicationsFor = (petName: string): ApplicationSpec[] =>
  APPLICATIONS.filter((spec) => spec.pet === petName);

/** The pet status the seeded applications leave behind (pet state machine). */
const petStatus = (petName: string): PetStatus => {
  const statuses = applicationsFor(petName).map((spec) =>
    finalStatus(spec.outcome),
  );

  if (statuses.includes('accepted')) {
    return 'adopted';
  }

  return statuses.includes('pending') ? 'pending' : 'available';
};

const photoCount = (petName: string) =>
  findDemoImages(DEMO_IMAGE_DIR, petName).length;

/** Case-insensitive substring, like the pet list's `search`. */
const searchNames = (text: string) =>
  PETS.map((pet) => pet.name)
    .filter((name) => name.toLowerCase().includes(text))
    .sort();

const userKeys = Object.keys(USERS) as UserKey[];

describe('demo dataset', () => {
  describe('users', () => {
    it('registers every user with the default demo password', () => {
      for (const { name, email } of Object.values(USERS)) {
        expect(
          registerSchema.safeParse({ name, email, password: 'demo-password' })
            .success,
          email,
        ).toBe(true);
      }
    });

    it('uses unique addresses on the reserved example.com domain', () => {
      const emails = Object.values(USERS).map((user) => user.email);

      expect(new Set(emails).size).toBe(emails.length);
      for (const email of emails) {
        expect(email).toMatch(/@demo\.example\.com$/);
      }
    });
  });

  describe('pets', () => {
    it('passes the API create schema', () => {
      for (const { owner, ...input } of PETS) {
        const result = createPetSchema.safeParse(input);

        expect(result.success, input.name).toBe(true);
        // Given values arrive unchanged (not trimmed or coerced); omitted
        // ones such as `breed` get the schema's default.
        expect(result.data, input.name).toMatchObject(input);
        expect(userKeys, input.name).toContain(owner);
      }
    });

    it('sets every profile fact explicitly', () => {
      for (const pet of PETS) {
        expect(pet.sex, pet.name).toBeDefined();
        expect(pet.aloneTime, pet.name).toBeDefined();
        expect(Object.keys(pet.compatibility ?? {}).sort(), pet.name).toEqual(
          [...PET_COMPATIBILITY_TARGETS].sort(),
        );
      }
    });

    // The seed finds a pet by name, and photo files are named after it
    // (lowercase letters only, see demo-images.ts).
    it('has unique names that can name photo files', () => {
      const names = PETS.map((pet) => pet.name.toLowerCase());

      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        expect(name).toMatch(/^[a-z]+$/);
      }
    });
  });

  describe('applications', () => {
    it('sends messages the API accepts', () => {
      for (const spec of APPLICATIONS) {
        expect(
          createApplicationSchema.safeParse({
            message: applicationMessage(spec.pet),
          }).success,
          spec.pet,
        ).toBe(true);
      }
    });

    it('applies for existing pets of other users', () => {
      for (const spec of APPLICATIONS) {
        expect(userKeys).toContain(spec.applicant);
        expect(
          petNamed(spec.pet).owner,
          `${spec.applicant} → ${spec.pet}`,
        ).not.toBe(spec.applicant);
      }
    });

    it('has one application per applicant and pet', () => {
      const pairs = APPLICATIONS.map((spec) => `${spec.applicant}|${spec.pet}`);

      expect(new Set(pairs).size).toBe(pairs.length);
    });

    // The seed submits every application before any decision. Accepting
    // adopts the pet and auto-rejects its other pending applications, so on
    // a pet with an accept every other application can only end
    // auto-rejected, and auto-rejected needs an accept.
    it('auto-rejects exactly the other applications of an adopted pet', () => {
      for (const pet of PETS) {
        const specs = applicationsFor(pet.name);
        const accepted = specs.filter((spec) => spec.outcome === 'accepted');

        expect(accepted.length, pet.name).toBeLessThanOrEqual(1);

        for (const spec of specs) {
          if (spec.outcome !== 'accepted') {
            expect(
              spec.outcome === 'autoRejected',
              `${spec.applicant} → ${pet.name}: ${spec.outcome}`,
            ).toBe(accepted.length === 1);
          }
        }
      }
    });
  });

  describe('photos', () => {
    // A prepared photo of a renamed or removed pet would silently be ignored.
    it('has prepared photos only for demo pets', () => {
      const names = new Set(PETS.map((pet) => pet.name.toLowerCase()));

      for (const fileName of readdirSync(DEMO_IMAGE_DIR)) {
        const parsed = parseDemoImageName(fileName);

        if (parsed) {
          expect(names, fileName).toContain(parsed.pet);
        }
      }
    });
  });

  // Facts the manual QA cases name ("Seed data: ..."), by case id.
  describe('manual QA expectations', () => {
    it('has 4 users, 14 pets (more than one page of 12) and 13 applications', () => {
      expect(userKeys).toHaveLength(4);
      expect(PETS).toHaveLength(14); // PETS-003
      expect(APPLICATIONS).toHaveLength(13);
    });

    it('gives the QA roles their pets and received applications', () => {
      const ownedBy = (key: UserKey) =>
        PETS.filter((pet) => pet.owner === key).length;
      const receivedBy = (key: UserKey) =>
        APPLICATIONS.filter((spec) => petNamed(spec.pet).owner === key).length;

      // Checklist roles: Owner = Ana, Another user = Marko, Adopters = Jelena, Luka.
      expect(ownedBy('ana')).toBe(9);
      expect(receivedBy('ana')).toBe(11); // OWN-004: more than 10 per page
      expect(ownedBy('marko')).toBe(5);
      expect(ownedBy('jelena')).toBe(0);
      expect(ownedBy('luka')).toBe(0); // PETS-012
    });

    it('has similar names for search', () => {
      // PETS-002
      expect(searchNames('max')).toEqual(['Max', 'Maxi']);
      expect(searchNames('bel')).toEqual(['Bella', 'Bello']);
    });

    it('owns the pets the cases open as Ana', () => {
      // PETS-006, PETS-008, PETS-009, PETS-011, APP-003, UPL-002, UPL-005
      for (const name of [
        'Max',
        'Maxi',
        'Nala',
        'Rex',
        'Bella',
        'Kiki',
        'Toby',
      ]) {
        expect(petNamed(name).owner, name).toBe('ana');
      }
    });

    it('leaves the pets in the statuses the cases expect', () => {
      expect(petStatus('Max')).toBe('pending'); // PETS-009, PETS-011
      expect(petStatus('Maxi')).toBe('adopted'); // APP-006, PROF-001, PETS-011
      expect(petStatus('Bella')).toBe('available'); // APP-001
      expect(petStatus('Coco')).toBe('available'); // APP-005
    });

    it('has the applications the cases decide or withdraw', () => {
      const pending = (petName: string) =>
        applicationsFor(petName)
          .filter((spec) => spec.outcome === 'pending')
          .map((spec) => spec.applicant)
          .sort();

      // PETS-009: Jelena's pending application for Max.
      expect(pending('Max')).toContain('jelena');
      // OWN-002, OWN-006: Rex has pending applications from Luka and Marko.
      expect(pending('Rex')).toEqual(['luka', 'marko']);
      // OWN-003: Luka's is the only pending application for Toby.
      expect(pending('Toby')).toEqual(['luka']);
      // APP-004: Jelena's is the only (pending) application for Kiki.
      expect(applicationsFor('Kiki')).toEqual([
        { pet: 'Kiki', applicant: 'jelena', outcome: 'pending' },
      ]);
      // APP-006: Maxi was adopted by Jelena; Marko never applied.
      expect(
        applicationsFor('Maxi').find((spec) => spec.outcome === 'accepted')
          ?.applicant,
      ).toBe('jelena');
      expect(
        applicationsFor('Maxi').map((spec) => spec.applicant),
      ).not.toContain('marko');
      // OWN-005: Marko did not apply for Max.
      expect(
        applicationsFor('Max').map((spec) => spec.applicant),
      ).not.toContain('marko');
      // APP-001, APP-005, MSG-001: Jelena hasn't applied for Bella or Coco.
      for (const name of ['Bella', 'Coco']) {
        expect(
          applicationsFor(name).map((spec) => spec.applicant),
          name,
        ).not.toContain('jelena');
      }
    });

    it('covers every application outcome', () => {
      expect(new Set(APPLICATIONS.map((spec) => spec.outcome))).toEqual(
        new Set<Outcome>([
          'pending',
          'accepted',
          'rejected',
          'withdrawn',
          'autoRejected',
        ]),
      );
    });

    it('has the gallery sizes the upload cases use', () => {
      expect(photoCount('Max')).toBe(5); // UPL-002, UPL-006
      expect(photoCount('Rex')).toBe(3); // UPL-005
      expect(photoCount('Toby')).toBe(1); // UPL-006
      expect(photoCount('Kiki')).toBe(0); // UPL-006
      // README: 11 of the 14 pets have photos.
      expect(PETS.filter((pet) => photoCount(pet.name) > 0)).toHaveLength(11);
    });
  });
});
