import type { Metadata } from 'next';
import GrowthCentreClient from './GrowthCentreClient';

export const metadata: Metadata = { title: 'Growth Centre | Xroga', robots: { index: false, follow: false } };
export default function GrowthCentrePage() { return <GrowthCentreClient />; }
