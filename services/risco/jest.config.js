const moduleNameMapper = {
  '^@domain/(.*)$': '<rootDir>/src/@core/domain/$1',
  '^@use-cases/(.*)$': '<rootDir>/src/@core/use-cases/$1',
  '^@infra/(.*)$': '<rootDir>/src/infra/$1',
  '^@app/(.*)$': '<rootDir>/src/app/$1',
  '^@ioc/(.*)$': '<rootDir>/src/ioc/$1',
};

const base = {
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper,
};

module.exports = {
  passWithNoTests: true,
  projects: [
    {
      ...base,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
    },
    {
      ...base,
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/setup-e2e.ts'],
    },
  ],
};
