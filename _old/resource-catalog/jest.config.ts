/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
    testEnvironment: 'node',
    transform: {
        '^.+.ts?$': ['ts-jest', {}],
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@app/(.*)$': '<rootDir>/src/application/$1',
        '^@infra/(.*)$': '<rootDir>/src/infra/$1',
        '^@test/(.*)$': '<rootDir>/test/$1',
    },
    setupFiles: ['./jest-setup-files.ts'],
    modulePathIgnorePatterns: ['<rootDir>/dist/'],
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/dist/',
        'diff-match-patch-uncompressed\\.js',
    ],
};
