module.exports = {
    clearMocks: true,
    testEnvironment: 'node',
    coverageDirectory: 'coverage',
    coveragePathIgnorePatterns: [
        '<rootDir>/node_modules/(?!@foo)',
    ],
    globals: {
        'ts-jest': {
            'ts-config': 'tsconfig.json',
            diagnostics: true,
        },
    },
    moduleFileExtensions: [
        'js',
        'ts',
        'tsx',
    ],
    moduleNameMapper: {
        '^@/(.*)': '<rootDir>/src/$1',
        //resolve anything to src/
        '^/(.*)$': '<rootDir>/src/$1',
        
    },
    testRegex: '(/tests/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$',
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest',
    },
    transformIgnorePatterns: [
        '<rootDir>/node_modules/(?!@foo)',
    ],
    preset: 'ts-jest',
}
