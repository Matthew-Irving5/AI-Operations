import nextVitals from 'eslint-config-next/core-web-vitals';
const configuration = [{ ignores: ['.next/**', '.open-next/**'] }, ...nextVitals];
export default configuration;
