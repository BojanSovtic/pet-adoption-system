import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  PET_IMAGE_MAX_BYTES,
  PET_IMAGE_MAX_COUNT,
  type Pet,
  type PetImageType,
} from '@pet-adoption/models';

import { detectImageType } from '../pets/pet-image';
import type { PetSpec } from './demo-data';

/**
 * Demo photo files, shared by prepare-demo-images (which creates them) and
 * seed-demo (which uploads them). Only these scripts read the folder; the API
 * itself never does.
 *
 * Naming rule, in apps/api/src/scripts/demo-images/:
 *   <pet>.<ext>    the pet's first (main) photo, e.g. max.jpg
 *   <pet>-N.<ext>  further photos, N = 2..5, e.g. max-2.webp
 * <pet> is the pet's name in lowercase letters only, and the whole name must
 * match: "maxi-2.jpg" belongs to Maxi, never to Max.
 */
export const DEMO_IMAGE_DIR = path.resolve('apps/api/src/scripts/demo-images');

/** Extensions in order of precedence when one photo exists in several. */
export const DEMO_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
] as const;
type DemoImageExtension = (typeof DEMO_IMAGE_EXTENSIONS)[number];

const TYPE_BY_EXTENSION: Record<DemoImageExtension, PetImageType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const NAME_PATTERN = /^([a-z]+)(?:-([2-5]))?\.(jpg|jpeg|png|webp)$/;

export type DemoImageName = {
  pet: string;
  /** 1 for "<pet>.<ext>", N for "<pet>-N.<ext>". */
  position: number;
  extension: DemoImageExtension;
};

/** Parses a prepared file name, or returns `null` for anything else. */
export const parseDemoImageName = (fileName: string): DemoImageName | null => {
  const match = NAME_PATTERN.exec(fileName);

  if (!match) {
    return null;
  }

  return {
    pet: match[1],
    position: match[2] ? Number(match[2]) : 1,
    extension: `.${match[3]}` as DemoImageExtension,
  };
};

export const demoImageFileName = (
  petName: string,
  position: number,
  extension: string,
): string =>
  `${petName.toLowerCase()}${position > 1 ? `-${position}` : ''}${extension}`;

export const demoImageType = (fileName: string): PetImageType =>
  TYPE_BY_EXTENSION[path.extname(fileName).toLowerCase() as DemoImageExtension];

/**
 * The prepared photos of one pet in display order (at most
 * PET_IMAGE_MAX_COUNT). If one position exists with several extensions, the
 * first in DEMO_IMAGE_EXTENSIONS wins. Returns file names, not paths.
 */
export const findDemoImages = (
  directory: string,
  petName: string,
): string[] => {
  if (!existsSync(directory)) {
    return [];
  }

  const byPosition = new Map<number, string>();
  const rank = (fileName: string) =>
    DEMO_IMAGE_EXTENSIONS.indexOf(path.extname(fileName) as DemoImageExtension);

  for (const fileName of readdirSync(directory)) {
    const parsed = parseDemoImageName(fileName);

    if (!parsed || parsed.pet !== petName.toLowerCase()) {
      continue;
    }

    const existing = byPosition.get(parsed.position);

    if (!existing || rank(fileName) < rank(existing)) {
      byPosition.set(parsed.position, fileName);
    }
  }

  return [...byPosition.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, fileName]) => fileName)
    .slice(0, PET_IMAGE_MAX_COUNT);
};

/**
 * The seed's rule for reruns: photos are added only to a pet that has none,
 * so rerunning never duplicates or replaces photos. To refresh a demo pet's
 * photos, remove them in the edit form (or reset the demo) and seed again.
 */
export const demoImagesToUpload = (
  pet: Pick<Pet, 'images'>,
  files: string[],
): string[] => (pet.images.length > 0 ? [] : files);

/** mapping.json: which source file becomes which pet's photo, in order. */
export type DemoImageMapping = {
  pets: Record<string, string[]>;
};

export type PreparationStep = {
  pet: string;
  source: string;
  target: string;
  action: 'copy' | 'unchanged';
};

export type PreparationPlan = {
  steps: PreparationStep[];
  /** Problems that stop the preparation; nothing is copied if any exist. */
  errors: string[];
  /** Worth knowing, but nothing to fix. */
  warnings: string[];
};

const SPECIES_PREFIXES = { cat: 'cat', dog: 'dog' } as const;

/**
 * Checks the mapping against the demo pets and the files, and works out what
 * to copy. Never plans to overwrite: an existing target with different
 * content is an error.
 */
export const planDemoImagePreparation = (
  mapping: DemoImageMapping,
  pets: readonly PetSpec[],
  directory: string,
): PreparationPlan => {
  const plan: PreparationPlan = { steps: [], errors: [], warnings: [] };
  const usedSources = new Map<string, string>();
  const isDemoPet = (name: string) =>
    pets.some((spec) => spec.name.toLowerCase() === name);

  if (!mapping || typeof mapping.pets !== 'object' || mapping.pets === null) {
    plan.errors.push('mapping.json must have a "pets" object.');
    return plan;
  }

  for (const [petKey, sources] of Object.entries(mapping.pets)) {
    const pet = pets.find((spec) => spec.name.toLowerCase() === petKey);

    if (!pet) {
      plan.errors.push(
        `"${petKey}" is not a demo pet. Use one of: ${pets.map((spec) => spec.name.toLowerCase()).join(', ')}.`,
      );
      continue;
    }

    if (!Array.isArray(sources)) {
      plan.errors.push(`${petKey}: expected a list of file names.`);
      continue;
    }

    if (sources.length > PET_IMAGE_MAX_COUNT) {
      plan.errors.push(
        `${petKey}: ${sources.length} photos listed; a pet can have at most ${PET_IMAGE_MAX_COUNT}.`,
      );
      continue;
    }

    sources.forEach((source, index) => {
      const label = `${petKey} photo ${index + 1} (${source})`;
      const sourcePath = path.join(directory, source);
      const extension = path.extname(source).toLowerCase();

      if (path.basename(source) !== source) {
        plan.errors.push(
          `${label}: give a file name in demo-images/, not a path.`,
        );
        return;
      }

      // A file the seed already treats as a pet's photo (e.g. "rex-2.jpg");
      // other simple names like "notes.jpg" are fine as sources.
      const parsedSource = parseDemoImageName(source);

      if (parsedSource && isDemoPet(parsedSource.pet)) {
        plan.errors.push(
          `${label}: this is already a prepared name; list the original file instead.`,
        );
        return;
      }

      const earlier = usedSources.get(source);

      if (earlier) {
        plan.errors.push(`${label}: already used for ${earlier}.`);
        return;
      }

      usedSources.set(source, petKey);

      if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
        plan.errors.push(`${label}: file not found.`);
        return;
      }

      if (!DEMO_IMAGE_EXTENSIONS.includes(extension as DemoImageExtension)) {
        plan.errors.push(`${label}: only .jpg, .jpeg, .png and .webp files.`);
        return;
      }

      const data = readFileSync(sourcePath);

      if (data.length > PET_IMAGE_MAX_BYTES) {
        plan.errors.push(`${label}: larger than 5 MB.`);
        return;
      }

      if (detectImageType(data) !== demoImageType(source)) {
        plan.errors.push(
          `${label}: the content is not a ${extension.slice(1).toUpperCase()} image.`,
        );
        return;
      }

      // The source names say which species a photo shows ("cat.4001.jpg").
      for (const [species, prefix] of Object.entries(SPECIES_PREFIXES)) {
        if (source.startsWith(`${prefix}.`) && pet.species !== species) {
          plan.errors.push(
            `${label}: a ${species} photo for a ${pet.species}.`,
          );
          return;
        }
      }

      const target = demoImageFileName(pet.name, index + 1, extension);
      const targetPath = path.join(directory, target);
      let action: PreparationStep['action'] = 'copy';

      if (existsSync(targetPath)) {
        if (!readFileSync(targetPath).equals(data)) {
          plan.errors.push(
            `${label}: ${target} already exists with different content. Delete ${target} first if you want to replace it.`,
          );
          return;
        }

        action = 'unchanged';
      }

      plan.steps.push({ pet: petKey, source, target, action });
    });

    // Prepared files the mapping doesn't produce are still uploaded by the seed.
    const planned = new Set(
      plan.steps
        .filter((step) => step.pet === petKey)
        .map((step) => step.target),
    );
    const extras = readdirSync(directory).filter((fileName) => {
      const parsed = parseDemoImageName(fileName);
      return parsed?.pet === petKey && !planned.has(fileName);
    });

    if (extras.length > 0) {
      plan.warnings.push(
        `${petKey}: ${extras.join(', ')} not in mapping.json; the seed would still use it. Delete it if it is left over.`,
      );
    }
  }

  return plan;
};
