/* eslint-disable no-console */
import path from 'path';
import {
    multistream,
    MultiStreamRes,
    transport,
    TransportTargetOptions,
} from 'pino';

import { env } from '../config/env/environment-config.service';
import {
    Environment,
    LogLevel,
    LogType,
} from '../config/env/environment-config.validation';
import { getLogLevel } from './common.logger';

const transportOptions: Record<string, TransportTargetOptions> = {
    file: {
        target: 'pino/file',
        level: getLogLevel(env<LogLevel>('LOG_LEVEL_FILE', LogLevel.Error)),
        options: {
            destination: `${path.join(__dirname, '..', '..', '..', '..', 'log.txt')}`,
            sync: true,
        },
    },
    logstash: {
        target: 'pino-socket',
        level: getLogLevel(env('LOG_LEVEL_LOGSTASH')),
        options: {
            address: env('LOGSTASH_HOST'),
            port: env<number>('LOGSTASH_PORT'),
            mode: 'tcp',
            reconnect: true,
            recovery: env<boolean>('LOGSTASH_RECOVERY', false),
            recoveryQueueMaxSize: env<number>(
                'LOGSTASH_RECOVERY_QUEUE_MAX_SIZE',
                1024,
            ),
        },
    },
    raw: {
        target: 'pino/file',
        level: getLogLevel(env<LogLevel>('LOG_LEVEL_RAW')),
        options: { destination: 1 },
    },
    terminal: {
        target: 'pino-pretty',
        level: getLogLevel(env<LogLevel>('LOG_LEVEL_TERMINAL')),
        options: {
            singleLine: env<boolean>('LOG_CONFIG_SINGLE_LINE', false),
            colorize: env<Environment>('NODE_ENV') !== Environment.Production,
            colorizeObjects:
                env<Environment>('NODE_ENV') !== Environment.Production,
            messageKey: 'message',
            minimumLevel: getLogLevel(env('LOG_LEVEL_TERMINAL')),
            ...(env<boolean>('LOG_CONFIG_NANOSECONDS')
                ? {
                      timestampKey: 'x_now',
                      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l Z',
                  }
                : {}),
        },
    },
};

const getTransportConfigTargets = () => {
    const targets: LogType[] = [];

    if (env<LogType>('LOG_TYPE') === LogType.Logstash) {
        targets.push(LogType.Logstash);
    }

    if (env<boolean>('LOG_CONFIG_FILE')) {
        targets.push(LogType.File);
    }

    if (env<boolean>('LOG_CONFIG_TERMINAL') || !targets.length) {
        if (
            env<LogType>('LOG_TYPE') === LogType.Terminal ||
            (env<Environment>('NODE_ENV') === Environment.Local &&
                env<LogType>('LOG_TYPE') !== LogType.Raw)
        ) {
            targets.push(LogType.Terminal);
        } else {
            targets.push(LogType.Raw);
        }
    }

    console.log(new Date(), '[pino] targets:', targets);

    return targets.map((target) => transportOptions[target]);
};

const addEventListeners = (stream: any): void => {
    stream.on('socketError', (err: Error) => {
        console.error(new Date(), `[logstash] socketError:`, err);
    });
    stream.on('socketClose', (err: Error) => {
        console.log(new Date(), `[logstash] socketClose:`, err);
    });
    stream.on('open', (address: string) => {
        console.log(new Date(), `[logstash] open:`, address);
    });
    stream.on('reconnect', (address: string) => {
        console.log(new Date(), `[logstash] reconnect:`, address);
    });
    stream.on('reconnectFailure', (address: string) => {
        console.error(new Date(), `[logstash] reconnectFailure:`, address);
    });
    stream.on('error', (err: Error) => {
        console.error(new Date(), '[logstash] error:', err);
        // 'error' event emitted by the transport must be considered a
        // fatal error and the process must be terminated.
        // Error events are not recoverable.
        throw err;
    });
};

// const pinoTransport = () => {
//     const targets = getTransportConfigTargets();
//     const { target, options } = targets[0];

//     const stream = transport({
//         level: getLogLevel(env('LOG_LEVEL')),
//         target,
//         options,
//         dedupe: false,
//         // @ts-expect-error ignore
//         sync: env('LOG_CONFIG_SYNC') === 'true',
//     });

//     if (target === 'pino-socket') {
//         addEventListeners(stream);
//     }

//     return stream;
// };

export const pinoMultiStream = (): MultiStreamRes<
    'error' | 'fatal' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
> => {
    const targets = getTransportConfigTargets();
    const streams = targets.map((target) => {
        const { level, ...options } = target;
        const stream = transport(options);

        if (target.target === 'pino-socket') {
            addEventListeners(stream);
        }

        return { level, stream };
    });

    return multistream(streams) as any;
};

export const pinoDestinationStream = (): MultiStreamRes<
    'error' | 'fatal' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
> => {
    // return pinoTransport();
    return pinoMultiStream() as any;
};
