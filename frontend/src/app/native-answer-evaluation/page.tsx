import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { authorizeFounderRequest } from '@/lib/osFounderAccess';
import { readNativeOpenUiRun } from '../../../../backend/src/ai/nativeOpenUiRun';
import Evaluation from '@/components/native-openui/Evaluation';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function NativeAnswerEvaluationPage() {
  const owner = process.env.NATIVE_OPENUI_EVALUATOR_ID;
  const run = readNativeOpenUiRun(process.env.XROGA_DEPLOYMENT_ENVIRONMENT, process.env.NATIVE_OPENUI_EVALUATION_RUN);
  if (!owner || !run) notFound();
  const client = await createClient();
  const result = await authorizeFounderRequest({
    getUser: async () => {
      const { data, error } = await client.auth.getUser();
      return !error && data.user?.id === owner ? data.user : null;
    },
    getRole: async () => {
      const { data, error } = await client.rpc('current_community_role');
      return error ? null : data;
    },
    getAal: async () => {
      const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      return error ? null : data.currentLevel;
    },
  });
  if (!result.allowed) notFound();
  return <Evaluation slots={run.slots} />;
}
