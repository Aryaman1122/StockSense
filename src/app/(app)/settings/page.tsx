'use client';

import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLive } from '@/contexts/WebSocketContext';
import { Button } from '@/components/ui/Button';

// ponytail: read-only profile. The API has no profile-update endpoint; password changes go through the OTP reset flow.
export default function SettingsPage() {
  const { user, isManager, logout } = useAuth();
  const { connected } = useLive();
  const router = useRouter();

  return (
    <div className="max-w-xl space-y-5">
      <section className="rounded-lg border border-b1 bg-s0 p-5">
        <h2 className="mb-4 text-sm font-medium">Profile</h2>
        <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-sm">
          <dt className="text-t3">Login ID</dt><dd>{user?.login_id}</dd>
          <dt className="text-t3">Email</dt><dd>{user?.email}</dd>
          <dt className="text-t3">Role</dt>
          <dd className="capitalize">
            {user?.role}
            <span className="block text-xs normal-case text-t3">
              {isManager ? 'Can manage products, locations, adjustments and the raw ledger.'
                : 'Roles are assigned by an administrator; ask a manager for elevated access.'}
            </span>
          </dd>
        </dl>
      </section>

      <section className="rounded-lg border border-b1 bg-s0 p-5">
        <h2 className="mb-4 text-sm font-medium">Connection</h2>
        <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-sm">
          <dt className="text-t3">API</dt><dd className="font-mono text-xs">{API_URL}</dd>
          <dt className="text-t3">Live updates</dt><dd>{connected ? 'Connected' : 'Disconnected — retrying'}</dd>
        </dl>
      </section>

      <section className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => router.push('/forgot-password')}>Change password</Button>
        <Button variant="danger" onClick={async () => { await logout(); router.replace('/login'); }}>Log out</Button>
      </section>
    </div>
  );
}
