/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/out', '<rootDir>/dist'],
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/extension.ts',
  ],
};
