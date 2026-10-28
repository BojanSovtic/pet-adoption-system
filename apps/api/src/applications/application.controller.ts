import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import type { ApplicationAction } from '@pet-adoption/models';

import { getAuthenticatedUserId } from '../auth/require-auth';
import { BadRequestError, NotFoundError } from '../errors/app-error';
import { parseInput } from '../middleware/validate';
import {
  applicationListQuerySchema,
  myApplicationListQuerySchema,
} from './application.schema';
import {
  getApplicationView,
  listMyApplications,
  listReceivedApplications,
  submitApplication,
  transitionApplication,
} from './application.service';

const getObjectIdParam = (req: Request, name: string, code: string): string => {
  const value = req.params[name];

  if (!mongoose.isValidObjectId(value)) {
    throw new BadRequestError(code);
  }

  return value;
};

export const submitApplicationController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  const petId = getObjectIdParam(req, 'petId', 'INVALID_PET_ID');

  const applicationId = await submitApplication(petId, userId, req.body);

  res
    .status(201)
    .json(await getApplicationView(applicationId, userId, 'applicant'));
};

export const listMyApplicationsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = parseInput(myApplicationListQuerySchema, req.query);

  res.json(await listMyApplications(getAuthenticatedUserId(req), query));
};

export const listReceivedApplicationsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = parseInput(applicationListQuerySchema, req.query);

  res.json(await listReceivedApplications(getAuthenticatedUserId(req), query));
};

/** One handler per state-machine action: accept, reject, withdraw. */
export const applicationActionController =
  (action: ApplicationAction) =>
  async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthenticatedUserId(req);
    const applicationId = getObjectIdParam(req, 'id', 'INVALID_APPLICATION_ID');

    const role = await transitionApplication(applicationId, userId, action);
    const view = await getApplicationView(applicationId, userId, role);

    if (!view) {
      throw new NotFoundError('APPLICATION_NOT_FOUND');
    }

    res.json(view);
  };
