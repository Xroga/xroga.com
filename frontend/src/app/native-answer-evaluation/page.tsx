import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { authorizeFounderRequest } from '@/lib/osFounderAccess';
import Evaluation from '@/components/native-openui/Evaluation';

export const dynamic = 'force-dynamic';

export default async function NativeAnswerEvaluationPage() {
  const owner = process.env.NATIVE_OPENUI_EVALUATOR_ID;
  if (!owner) notFound();
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
  return <Evaluation />;
}
