import type {
  ApplicationAction,
  CreateApplicationInput,
  MyApplication,
  MyApplicationListQuery,
  Paginated,
  ReceivedApplication,
  ReceivedApplicationListQuery,
  RejectApplicationInput,
} from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

/**
 * All application data belongs to the signed-in user. Every request parameter
 * is part of the key; invalidating `all` refreshes every page and the pending
 * count.
 */
export const applicationQueryKeys = {
  all: ['applications'] as const,
  mine: (query: MyApplicationListQuery) =>
    ['applications', 'mine', query] as const,
  received: (query: ReceivedApplicationListQuery) =>
    ['applications', 'received', query] as const,
  // Fixed request (`status=pending&pageSize=1`), so no parameters.
  pendingCount: ['applications', 'pendingCount'] as const,
};

export const getMyApplications = async (
  query: MyApplicationListQuery,
): Promise<Paginated<MyApplication>> => {
  const { data } = await http.get<Paginated<MyApplication>>(
    '/applications/mine',
    { params: query },
  );
  return data;
};

export const getReceivedApplications = async (
  query: ReceivedApplicationListQuery,
): Promise<Paginated<ReceivedApplication>> => {
  const { data } = await http.get<Paginated<ReceivedApplication>>(
    '/applications/received',
    { params: query },
  );
  return data;
};

/**
 * How many applications for the user's pets await a decision. Derived by the
 * API from the applications themselves (the list's `totalItems`), so it is
 * never a separately kept counter.
 */
export const getPendingApplicationCount = async (): Promise<number> => {
  const { totalItems } = await getReceivedApplications({
    status: 'pending',
    pageSize: 1,
  });
  return totalItems;
};

export const submitApplication = async (
  petId: string,
  input: CreateApplicationInput,
): Promise<MyApplication> => {
  const { data } = await http.post<MyApplication>(
    `/pets/${petId}/applications`,
    input,
  );
  return data;
};

/** Accept or withdraw; rejecting needs a reason (`rejectApplication`). */
export const runApplicationAction = async (
  applicationId: string,
  action: Exclude<ApplicationAction, 'reject'>,
): Promise<MyApplication | ReceivedApplication> => {
  const { data } = await http.post<MyApplication | ReceivedApplication>(
    `/applications/${applicationId}/${action}`,
  );
  return data;
};

export const rejectApplication = async (
  applicationId: string,
  input: RejectApplicationInput,
): Promise<ReceivedApplication> => {
  const { data } = await http.post<ReceivedApplication>(
    `/applications/${applicationId}/reject`,
    input,
  );
  return data;
};
