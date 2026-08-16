const path = require('path');

module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage|@react-navigation|react-native-screens|react-native-safe-area-context|@react-native-vector-icons)/)',
  ],
  moduleNameMapper: {
    '^react-native($|/.*)': `${path.dirname(require.resolve('react-native'))}/$1`,
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest',
  },
};
