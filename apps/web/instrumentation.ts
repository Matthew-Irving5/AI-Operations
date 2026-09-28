import { assertLocalTestAuthEnvironment } from './lib/local-test-auth';

export async function register(): Promise<void> {
  assertLocalTestAuthEnvironment(process.env);
}
