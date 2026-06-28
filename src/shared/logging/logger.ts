export type Logger = {
  debug: (details: unknown, message: string) => void;
  info: (details: unknown, message: string) => void;
  warn: (details: unknown, message: string) => void;
  error: (details: unknown, message: string) => void;
};

export const createLogger = (level: string): Logger => {
  const write = (severity: string, details: unknown, message: string): void => {
    const entry = JSON.stringify({
      level: severity,
      message,
      details,
      timestamp: new Date().toISOString(),
    });
    if (severity === 'error' || severity === 'warn') {
      console.error(entry);
      return;
    }
    console.log(entry);
  };

  return {
    debug: (details, message) => {
      if (level === 'debug') write('debug', details, message);
    },
    info: (details, message) => {
      if (['debug', 'info'].includes(level)) write('info', details, message);
    },
    warn: (details, message) => write('warn', details, message),
    error: (details, message) => write('error', details, message),
  };
};
