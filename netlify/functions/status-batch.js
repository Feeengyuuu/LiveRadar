import { handleBatchStatusRequest } from '../../functions/_shared/platform-status.js';
import { createNetlifyHandler } from '../../functions/_shared/netlify-adapter.js';

export const handler = createNetlifyHandler(handleBatchStatusRequest);
