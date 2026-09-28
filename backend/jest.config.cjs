module.exports = {
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: './tsconfig.json' }] },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/**/*.module.ts', '!src/**/*.entity.ts', '!src/main.ts', '!src/**/*.dto.ts', '!src/**/*.controller.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
};
