import nextVitals from 'eslint-config-next/core-web-vitals';
const configuration = [
  { ignores: ['.next/**', '.next-local-qa-*/**', '.open-next/**'] },
  ...nextVitals,
];
export default configuration;
