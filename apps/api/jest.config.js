module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '@autocrm/shared-types': '<rootDir>/../../packages/shared-types/src/index.ts',
    '@autocrm/events': '<rootDir>/../../packages/events/src/index.ts',
    '@autocrm/utils/permissions': '<rootDir>/../../packages/utils/src/permissions.ts',
    '@autocrm/utils/seed': '<rootDir>/../../packages/utils/src/seed.ts',
    '@autocrm/utils': '<rootDir>/../../packages/utils/src/index.ts',
  },
}
