import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { exportToCSV } from '../../lib/exportUtils';
import { WorkSurface } from '../../components/Layouts';
import {
  Avatar, Badge, Button, Card, Chip, EmptyState, Input, NoResults, PageHeader, SkeletonTable, Td, Th, type Tint,
} from '../../components/ui';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'registration', label: 'Registrations' },
  { value: 'fee_update', label: 'Fee updates' },
  { value: 'config_change', label: 'Config changes' },
  { value: 'other', label: 'Other' },
];

const TYPE_TONE: Record<string, Tint> = {
  registration: 'lilac',
  fee_update: 'peach',
  config_change: 'blue',
  other: 'plain',
};

/** Timestamps arrive as a Firestore-ish object, an epoch-seconds object, or a string. */
const toDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate();
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatTimestamp = (timestamp: any) => {
  const d = toDate(timestamp);
  if (!d) return 'Just now';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const AdminAuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  useEffect(() => {
    const unsub = firestoreService.getAuditLogs((data) => {
      setLogs(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredLogs = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return logs.filter((log) => {
      const matchesType = selectedType === 'all' || log.type === selectedType;
      const matchesSearch =
        (log.userName || '').toLowerCase().includes(query) ||
        (log.userEmail || '').toLowerCase().includes(query) ||
        (log.action || '').toLowerCase().includes(query) ||
        (log.details || '').toLowerCase().includes(query);
      return matchesType && matchesSearch;
    });
  }, [logs, searchTerm, selectedType]);

  const handleExport = () => {
    exportToCSV(
      filteredLogs.map((log) => ({
        Timestamp: formatTimestamp(log.timestamp),
        User: log.userName || 'Unknown',
        Email: log.userEmail || '',
        Action: log.action || '',
        Details: log.details || '',
        Category: log.type || 'other',
      })),
      `audit_logs_export_${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  if (loading) {
    return (
      <WorkSurface>
        <div className="h-14 w-56 skeleton rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
        <SkeletonTable rows={6} />
      </WorkSurface>
    );
  }

  return (
    <WorkSurface>
      <PageHeader
        title="Audit Logs"
        subtitle="Every write to student, fee, report and account records"
        actions={
          <Button variant="secondary" icon="file_download" onClick={handleExport} disabled={filteredLogs.length === 0}>
            Export {filteredLogs.length === logs.length ? 'all' : 'filtered'}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c.value} active={selectedType === c.value} onClick={() => setSelectedType(c.value)}>
              {c.label}
            </Chip>
          ))}
        </div>
        <div className="relative">
          <Icon name="search" className="text-[15px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search action, details, user name or email"
            aria-label="Search audit logs"
            className="h-9 w-[320px] max-w-full pl-9"
          />
        </div>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon="history"
          title="No audit entries yet"
          body="Every change to a student, fee, report or account is recorded here with who made it and when."
        />
      ) : filteredLogs.length === 0 ? (
        <NoResults
          title={searchTerm ? `Nothing matches “${searchTerm}”` : 'Nothing in this category'}
          body={`${logs.length} entries recorded in total.`}
          onClear={() => {
            setSearchTerm('');
            setSelectedType('all');
          }}
        />
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[840px]">
              <thead className="bg-slate-50 dark:bg-slate-900/40">
                <tr>
                  <Th className="w-48">When</Th>
                  <Th className="w-44">Action</Th>
                  <Th>Details</Th>
                  <Th className="w-56">By</Th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className={log.type === 'other' ? 'bg-tint-blush/40' : undefined}>
                    <Td className="whitespace-nowrap text-slate-500">{formatTimestamp(log.timestamp)}</Td>
                    <Td>
                      <Badge tone={TYPE_TONE[log.type] ?? 'plain'}>{log.action || log.type || 'Event'}</Badge>
                    </Td>
                    <Td className="text-slate-700 dark:text-slate-300">{log.details || '—'}</Td>
                    <Td>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={log.userName || 'Unknown'} size={28} tint="lilac" />
                        <div className="min-w-0">
                          <p className="text-xs text-slate-700 dark:text-slate-300 truncate">{log.userName || 'Unknown'}</p>
                          {log.userEmail && <p className="text-[10.5px] text-slate-400 truncate">{log.userEmail}</p>}
                        </div>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
            <span className="text-[11.5px] text-slate-500">
              Showing <span className="font-semibold text-slate-900 dark:text-white">{filteredLogs.length}</span> of{' '}
              {logs.length} entries
            </span>
          </div>
        </Card>
      )}
    </WorkSurface>
  );
};
