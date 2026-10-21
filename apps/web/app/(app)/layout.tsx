import { requireAal2 } from '../../lib/auth';
import { AppShell } from './app-shell';

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAal2();
  return <AppShell>{children}</AppShell>;
}
