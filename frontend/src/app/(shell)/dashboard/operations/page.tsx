import type { Metadata } from 'next';
import OperationsCentreClient from './OperationsCentreClient';

export const metadata: Metadata = { title: 'Product Operations Centre | Xroga' };

export default function OperationsCentrePage() {
  return <OperationsCentreClient />;
}
