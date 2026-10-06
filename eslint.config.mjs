import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'src/generated/**',
    ],
  },
  ...nextVitals,
  ...nextTypescript,
];

export default config;
