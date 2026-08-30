import React from 'react';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/AuthContext';
import { Button, Card, InlineNote } from '../components/ui';

export const GuestView: React.FC = () => {
  const { signOut, user } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark p-6 font-display">
      <Card className="w-full max-w-[440px] p-8 sm:p-10 flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="size-16 rounded-2xl bg-tint-butter text-ink-butter flex items-center justify-center">
            <Icon name="pending" className="text-[32px]" />
          </div>
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.03em] text-slate-900 dark:text-white">Access pending</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              Hello{user?.name ? ', ' : ''}
              <span className="font-semibold text-slate-900 dark:text-slate-200">{user?.name}</span>. Your account exists but
              no role has been assigned to it yet, so there is nothing for you to open.
            </p>
          </div>
        </div>

        {user?.email && (
          <div className="bg-slate-50 dark:bg-slate-900/40 rounded-[14px] p-3.5 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-surface-light dark:bg-surface-dark border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
              <Icon name="mail" className="text-[18px]" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Registered email</p>
              <p className="mt-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{user.email}</p>
            </div>
          </div>
        )}

        <InlineNote icon="info">
          Ask your school administrator to assign you a role under Registration. Once they do, sign in again and your
          portal will open.
        </InlineNote>

        <Button variant="secondary" icon="logout" block onClick={() => signOut()}>
          Sign out
        </Button>
      </Card>
    </div>
  );
};
