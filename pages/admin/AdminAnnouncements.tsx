import React, { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';
import { WorkSurface } from '../../components/Layouts';
import {
  Badge, Button, Card, Chip, EmptyState, Field, InlineNote, Input, NoResults, PageHeader, SkeletonTable, Textarea,
  type Tint,
} from '../../components/ui';

interface Announcement {
  id: string;
  title: string;
  content: string;
  audience: string;
  createdAt?: string;
}

const AUDIENCES = [
  { value: 'all', label: 'Everyone' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'parents', label: 'Parents' },
  { value: 'students', label: 'Students' },
];

const AUDIENCE_TONE: Record<string, Tint> = {
  all: 'blue',
  teachers: 'lilac',
  parents: 'peach',
  students: 'mint',
};

const audienceLabel = (v: string) => AUDIENCES.find((a) => a.value === v)?.label ?? v;

export const AdminAnnouncements: React.FC = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', content: '', audience: 'all' });
  const [filterAudience, setFilterAudience] = useState<string>('all-filter');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = firestoreService.getAnnouncements(null, (data) => {
      setAnnouncements(data as Announcement[]);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const titleMissing = touched && !newAnnouncement.title.trim();
  const bodyMissing = touched && !newAnnouncement.content.trim();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!newAnnouncement.title.trim() || !newAnnouncement.content.trim()) return;

    setSubmitting(true);
    try {
      await firestoreService.createAnnouncement(newAnnouncement);
      if (user) {
        await firestoreService.logActivity({
          userId: user.uid,
          userEmail: user.email || '',
          userName: user.name || '',
          action: 'Post Announcement',
          details: `Published school-wide notice: "${newAnnouncement.title}" to target audience: ${newAnnouncement.audience}`,
          type: 'config_change',
        });
      }
      setNewAnnouncement({ title: '', content: '', audience: 'all' });
      setTouched(false);
    } catch (err) {
      console.error('Failed to post announcement:', err);
      setError('Could not publish the notice. Your text is still here — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete the notice "${title}"? It disappears from every dashboard immediately.`)) return;
    setError(null);
    try {
      await firestoreService.deleteAnnouncement(id);
      if (user) {
        await firestoreService.logActivity({
          userId: user.uid,
          userEmail: user.email || '',
          userName: user.name || '',
          action: 'Delete Announcement',
          details: `Removed notice: "${title}" from the registry`,
          type: 'config_change',
        });
      }
    } catch (err) {
      console.error('Failed to delete announcement:', err);
      setError('Could not delete that notice. Try again.');
    }
  };

  const visible =
    filterAudience === 'all-filter' ? announcements : announcements.filter((a) => a.audience === filterAudience);

  return (
    <WorkSurface>
      <PageHeader
        title="Announcements"
        subtitle="Notices published to a chosen audience's dashboard"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] text-slate-500 mr-1">Show</span>
            <Chip active={filterAudience === 'all-filter'} onClick={() => setFilterAudience('all-filter')}>
              All
            </Chip>
            {AUDIENCES.filter((a) => a.value !== 'all').map((a) => (
              <Chip key={a.value} active={filterAudience === a.value} onClick={() => setFilterAudience(a.value)}>
                {a.label}
              </Chip>
            ))}
          </div>
        }
      />

      {error && <InlineNote tone="blush" icon="priority_high">{error}</InlineNote>}

      <div className="grid gap-4 lg:grid-cols-[424px_minmax(0,1fr)]">
        <Card className="flex flex-col gap-4 h-fit">
          <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">New announcement</p>

          <form onSubmit={handleCreate} className="flex flex-col gap-4" noValidate>
            <Field label="Title" error={titleMissing ? 'Give the notice a title.' : undefined}>
              <Input
                value={newAnnouncement.title}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                placeholder="e.g. Mid-Term PTA Assembly"
                invalid={titleMissing}
              />
            </Field>

            <Field
              label="Message"
              error={bodyMissing ? 'Add the message body.' : undefined}
              hint="Appears as a card on the dashboard — this does not send an email."
            >
              <Textarea
                rows={5}
                value={newAnnouncement.content}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                placeholder="Keep it short."
              />
            </Field>

            <Field label="Audience">
              <div className="flex flex-wrap gap-2">
                {AUDIENCES.map((a) => (
                  <Chip
                    key={a.value}
                    active={newAnnouncement.audience === a.value}
                    onClick={() => setNewAnnouncement({ ...newAnnouncement, audience: a.value })}
                  >
                    {a.label}
                  </Chip>
                ))}
              </div>
            </Field>

            <InlineNote tone="butter" icon="warning">
              Published immediately and cannot be edited afterwards, only deleted. Deleting removes it from every dashboard.
            </InlineNote>

            <div className="flex gap-2.5">
              <Button
                type="button"
                variant="secondary"
                block
                onClick={() => {
                  setNewAnnouncement({ title: '', content: '', audience: 'all' });
                  setTouched(false);
                }}
              >
                Clear
              </Button>
              <Button type="submit" icon="campaign" block loading={submitting}>
                Publish
              </Button>
            </div>
          </form>
        </Card>

        <div className="flex flex-col gap-2.5">
          {loading ? (
            <SkeletonTable rows={3} />
          ) : announcements.length === 0 ? (
            <EmptyState
              icon="campaign"
              title="No announcements yet"
              body="Notices you publish appear here, and on the dashboard of whichever audience you choose."
            />
          ) : visible.length === 0 ? (
            <NoResults
              title={`Nothing published to ${audienceLabel(filterAudience)}`}
              body={`${announcements.length} notices exist for other audiences.`}
              onClear={() => setFilterAudience('all-filter')}
              clearLabel="Show all"
            />
          ) : (
            visible.map((a) => (
              <Card key={a.id} className="flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <p className="text-[14.5px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">{a.title}</p>
                      <Badge tone={AUDIENCE_TONE[a.audience] ?? 'blue'}>{audienceLabel(a.audience)}</Badge>
                    </div>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-line">
                      {a.content}
                    </p>
                  </div>
                  {/* Always visible, never hover-only — a hover-only delete is
                      unreachable by keyboard and on touch. */}
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id, a.title)}
                    aria-label={`Delete announcement "${a.title}"`}
                    className="size-8 shrink-0 rounded-[10px] bg-slate-50 dark:bg-slate-900/40 text-slate-500 hover:text-danger hover:bg-tint-blush transition-colors flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <Icon name="delete" className="text-[16px]" />
                  </button>
                </div>
                {a.createdAt && (
                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] text-slate-400">
                      {new Date(a.createdAt).toLocaleString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </WorkSurface>
  );
};
