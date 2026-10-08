import type { Metadata } from 'next';
import { DesignSystemShowcase } from './showcase';
import './showcase.css';

export const metadata: Metadata = {
  title: 'Design system · AI Operations',
};

export default function DesignSystemPage() {
  return <DesignSystemShowcase />;
}
