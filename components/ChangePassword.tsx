import React, { useState } from 'react';
import { Icon } from './Icon';
import { firestoreService } from '../lib/services';
import { Button, Drawer, Field, InlineNote, Input } from './ui';

/**
 * Change your own password.
 *
 * The endpoint and an Admin-only form for it already existed; what was missing was
 * any way for a teacher or parent to reach it, so every password they were issued
 * stayed theirs forever and stayed known to whoever issued it. This is the same
 * flow, lifted out of School Settings so all three portals can open it from the rail.
 *
 * Requires the current password: an unattended, still-signed-in laptop should not
 * be enough to take an account over.
 */

const MIN_LENGTH = 8;

export const ChangePasswordDrawer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setReveal(false);
    setError(null);
    setDone(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  // Mirrors the server's rules so the failure is visible before a round trip.
  // The server re-checks all of them; this is convenience, not the guard.
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const unchanged = next.length > 0 && next === current;
  const canSubmit = !!current && next.length >= MIN_LENGTH && next === confirm && !unchanged && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await firestoreService.changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  const type = reveal ? 'text' : 'password';

  return (
    <Drawer
      open={open}
      onClose={close}
      title={done ? 'Password changed' : 'Change your password'}
      subtitle={done ? undefined : 'You will stay signed in on this device'}
      footer={
        done ? (
          <Button block onClick={close}>
            Done
          </Button>
        ) : (
          <div className="flex gap-2 w-full">
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button className="flex-1" icon="lock" onClick={submit} loading={busy} disabled={!canSubmit}>
              Update password
            </Button>
          </div>
        )
      }
    >
      {done ? (
        <div className="flex flex-col gap-4">
          <InlineNote tone="mint" icon="check_circle">
            Your password has been updated. Use the new one the next time you sign in.
          </InlineNote>
          <InlineNote icon="lock">
            If you were signed in anywhere else, sign out there and back in with the new password.
          </InlineNote>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Current password">
            <Input
              type={type}
              value={current}
              autoComplete="current-password"
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>

          <Field
            label="New password"
            hint={tooShort ? undefined : `At least ${MIN_LENGTH} characters.`}
          >
            <Input type={type} value={next} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} />
          </Field>
          {tooShort && (
            <p className="-mt-2 text-[11.5px] text-ink-blush">Use at least {MIN_LENGTH} characters.</p>
          )}
          {unchanged && (
            <p className="-mt-2 text-[11.5px] text-ink-blush">The new password matches your current one.</p>
          )}

          <Field label="Confirm new password">
            <Input
              type={type}
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {mismatch && <p className="-mt-2 text-[11.5px] text-ink-blush">The two new passwords do not match.</p>}

          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="self-start inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-500 hover:text-primary rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Icon name={reveal ? 'visibility_off' : 'visibility'} className="text-[15px]" />
            {reveal ? 'Hide passwords' : 'Show passwords'}
          </button>

          {error && (
            <InlineNote tone="blush" icon="priority_high">
              {error}
            </InlineNote>
          )}

          {/* Submitting via the footer button, which sits outside this form element. */}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      )}
    </Drawer>
  );
};
