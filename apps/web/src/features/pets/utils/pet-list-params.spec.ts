import { describe, expect, it } from 'vitest';

import { petQueryKeys } from '../api/pet-query-keys';
import {
  getPetListReturnPath,
  parsePetListParams,
  toPetListQuery,
  toPetListSearchParams,
} from './pet-list-params';

describe('parsePetListParams', () => {
  it('uses defaults for an empty URL', () => {
    expect(parsePetListParams(new URLSearchParams())).toEqual({
      search: '',
      species: undefined,
      status: undefined,
      sort: 'newest',
      page: 1,
    });
  });

  it('reads valid values', () => {
    expect(
      parsePetListParams(
        new URLSearchParams(
          'search=%20milo%20&species=cat&status=pending&sort=name&page=3',
        ),
      ),
    ).toEqual({
      search: 'milo',
      species: 'cat',
      status: 'pending',
      sort: 'name',
      page: 3,
    });
  });

  it('falls back to defaults for invalid values', () => {
    expect(
      parsePetListParams(
        new URLSearchParams('species=dragon&status=lost&sort=price&page=-2'),
      ),
    ).toMatchObject({
      species: undefined,
      status: undefined,
      sort: 'newest',
      page: 1,
    });
    expect(parsePetListParams(new URLSearchParams('page=abc')).page).toBe(1);
  });
});

describe('toPetListSearchParams', () => {
  it('leaves defaults out of the URL', () => {
    expect(
      toPetListSearchParams({ search: '', sort: 'newest', page: 1 }).toString(),
    ).toBe('');
  });

  it('round-trips through parsing', () => {
    const params = {
      search: 'milo',
      species: 'dog' as const,
      status: 'available' as const,
      sort: 'age' as const,
      page: 2,
    };

    expect(parsePetListParams(toPetListSearchParams(params))).toEqual(params);
  });
});

describe('petQueryKeys.list', () => {
  it('includes every parameter, so different lists never share a cache entry', () => {
    const base = toPetListQuery({ search: '', sort: 'newest', page: 1 });

    const keys = [
      petQueryKeys.list(base),
      petQueryKeys.list({ ...base, page: 2 }),
      petQueryKeys.list({ ...base, search: 'milo' }),
      petQueryKeys.list({ ...base, species: 'cat' }),
      petQueryKeys.list({ ...base, status: 'adopted' }),
      petQueryKeys.list({ ...base, sort: 'name' }),
    ].map((key) => JSON.stringify(key));

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('sits under the shared "pets" prefix used for invalidation', () => {
    const key = petQueryKeys.list(
      toPetListQuery({ search: '', sort: 'newest', page: 1 }),
    );

    expect(key.slice(0, 2)).toEqual([...petQueryKeys.lists()]);
    expect(key[0]).toBe(petQueryKeys.all[0]);
  });
});

describe('getPetListReturnPath', () => {
  it('returns to the saved list page, search and filters', () => {
    expect(
      getPetListReturnPath({ petListSearch: '?search=max&status=pending&page=2' }),
    ).toBe('/pets?search=max&status=pending&page=2');
  });

  it.each([
    ['no state (a direct link)', null],
    ['state from another page', { from: '/applications' }],
    ['a non-string value', { petListSearch: 2 }],
    ['the first page with defaults', { petListSearch: '' }],
  ])('falls back to the first list page for %s', (_case, state) => {
    expect(getPetListReturnPath(state)).toBe('/pets');
  });

  it('drops unknown or invalid params', () => {
    expect(
      getPetListReturnPath({ petListSearch: '?page=abc&species=dragon&x=1&sort=name' }),
    ).toBe('/pets?sort=name');
  });
});
