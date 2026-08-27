import '@testing-library/jest-dom/vitest';
import { config as loadEnv } from 'dotenv';

loadEnv();
process.env.DATABASE_AUTO_SCHEMA = process.env.DATABASE_AUTO_SCHEMA ?? 'true';
