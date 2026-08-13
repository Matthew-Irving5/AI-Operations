import Link from 'next/link';
import { requireAal2 } from '../../lib/auth';
import { SessionActivity } from './session-activity';
const links = [
  'Overview',
  'Personal',
  'Health',
  'Finance',
  'Career',
  'Travel',
  'Procurement',
  'Digital Estate',
  'Systems & Automation',
  'Operations',
  'Reports',
  'Approvals',
  'Spend & Forecasting',
  'AI Traces & Audit',
  'Feedback & Quality',
  'Data Sources',
  'Automations',
  'Devices',
  'Settings',
];
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAal2();
  return (
    <div className="shell">
      <nav>
        <strong>AI Operations</strong>
        <SessionActivity />
        {links.map((label) => (
          <Link
            key={label}
            href={'/' + label.toLowerCase().replaceAll(' & ', '-').replaceAll(' ', '-')}
          >
            {label}
          </Link>
        ))}
      </nav>
      <main>{children}</main>
    </div>
  );
}
