export type MigrationPhase = '1' | '2' | 'all';

export type MigrationScope = {
  municipio?: string | undefined;
  uf?: string | undefined;
  full: boolean;
};

export type CliOptions = {
  phase: MigrationPhase;
  scope: MigrationScope;
  targetPrefix: string;
  tenantId: string;
  ownerPartyId: string;
  batchSize: number;
  maxRecords?: number | undefined;
  apply: boolean;
  resume: boolean;
  jobId?: string | undefined;
  sourceScn?: string | undefined;
};

export type PhaseStats = {
  loaded: number;
  updated: number;
  skipped: number;
  rejected: number;
  errors: number;
};
