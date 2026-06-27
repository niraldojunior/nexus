import os from 'os';
import { Worker } from 'snowflake-uuid';

import { env } from '@/shared/infra/config/env/environment-config.service';

const DEFAULT_WORKER_ID = Math.floor(
    os
        .hostname()
        .split('')
        .reduce((acc, char) => acc + char.charCodeAt(0), 0) % 31,
);
const DEFAULT_DATACENTER_ID = process.env.KUBERNETES_SERVICE_HOST
    ? process.env.KUBERNETES_SERVICE_HOST.split('').reduce(
          (acc, char) => acc + char.charCodeAt(0),
          0,
      ) % 31
    : 1;

export const Snowflake = new Worker(
    env<number>('SNOWFLAKE_WORKER_ID', DEFAULT_WORKER_ID),
    env<number>('SNOWFLAKE_DATACENTER_ID', DEFAULT_DATACENTER_ID),
    {
        workerIdBits: 5,
        datacenterIdBits: 5,
        sequenceBits: 12,
        epoch: 1628121600000, // Aug 5, 2021
    },
);
