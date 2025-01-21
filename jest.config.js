/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+.tsx?$": ["ts-jest", {"tsConfig": "tsconfig.electron.json", "warnOnly": true}],
  },
  globals: {
    "ts-jest": {
      warnOnly: true,
      ignoreCodes: [2416, 2345, 2322, 2353]
    }
  },
  moduleNameMapper: {
    "^src/(.*)$": "<rootDir>/src/$1"
  }
};
