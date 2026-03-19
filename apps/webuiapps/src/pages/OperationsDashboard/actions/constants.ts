export const APP_ID = 21;
export const APP_NAME = 'operationsDashboard';

export const ActionTypes = {
  GET_FAILURES: 'GET_FAILURES',
  RERUN_JOB: 'RERUN_JOB',
  GET_JOB_LOG: 'GET_JOB_LOG',
  GET_DEPENDENCIES: 'GET_DEPENDENCIES',
  ACKNOWLEDGE_FAILURE: 'ACKNOWLEDGE_FAILURE',
  SYNC_STATE: 'SYNC_STATE',
} as const;
