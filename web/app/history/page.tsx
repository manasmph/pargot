import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { HistoryView } from '@/components/app/history-view';
import { AUTH_ENABLED } from '@/lib/auth-config';

/**
 * /history — past interviews for the signed-in user. Server-gated: when auth
 * is disabled, or the visitor is anonymous, bounce to the landing page.
 */
export default async function HistoryPage() {
  if (!AUTH_ENABLED) {
    redirect('/');
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }
  return <HistoryView />;
}
