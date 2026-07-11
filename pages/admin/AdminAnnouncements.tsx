import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { firestoreService } from '../../lib/services';
import { useAuth } from '../../lib/AuthContext';

interface Announcement {
  id: string;
  title: string;
  content: string;
  audience: string;
  createdAt?: string;
}

export const AdminAnnouncements: React.FC = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', content: '', audience: 'all' });
  const [filterAudience, setFilterAudience] = useState<string>('all-filter');

  useEffect(() => {
    // Subscribing to all announcements
    const unsub = firestoreService.getAnnouncements(null, (data) => {
      setAnnouncements(data as Announcement[]);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnouncement.title.trim() || !newAnnouncement.content.trim()) {
      alert("Please fill in both the title and content.");
      return;
    }
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
          type: 'config_change'
        });
      }

      setNewAnnouncement({ title: '', content: '', audience: 'all' });
    } catch (err) {
      console.error("Failed to post announcement:", err);
      alert("Failed to publish notice. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (window.confirm(`Are you sure you want to delete the notice "${title}"?`)) {
      try {
        await firestoreService.deleteAnnouncement(id);
        
        if (user) {
          await firestoreService.logActivity({
            userId: user.uid,
            userEmail: user.email || '',
            userName: user.name || '',
            action: 'Delete Announcement',
            details: `Removed notice: "${title}" from the registry`,
            type: 'config_change'
          });
        }
      } catch (err) {
        console.error("Failed to delete announcement:", err);
        alert("Failed to delete notice. Please try again.");
      }
    }
  };

  const filteredAnnouncements = announcements.filter(ann => {
    if (filterAudience === 'all-filter') return true;
    return ann.audience === filterAudience;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Icon name="sync" className="animate-spin text-primary text-4xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
             <span className="font-bold text-slate-900 dark:text-white">Admin Portal</span>
             <span>/</span>
             <span className="font-medium text-primary">Notice Board</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">School Announcements</h1>
          <p className="text-xs text-slate-500 mt-1">Publish bulletins and circulars directly to Teacher and Parent portals.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Composition Form Card */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-5">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Compose Notice</h3>
              <p className="text-slate-400 text-[10px] uppercase font-bold mt-0.5 tracking-wider">Publish news registry</p>
            </div>
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Notice Title</label>
                <input 
                  type="text" 
                  value={newAnnouncement.title}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                  placeholder="e.g. Mid-Term PTA Assembly"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none" 
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Target Audience</label>
                <select
                  value={newAnnouncement.audience}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, audience: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none"
                >
                  <option value="all">All (Teachers & Parents)</option>
                  <option value="teachers">Teachers Only</option>
                  <option value="parents">Parents & Students Only</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Content / Message</label>
                <textarea 
                  value={newAnnouncement.content}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                  placeholder="Type details about dates, agendas, or reminders..."
                  rows={6}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-900 dark:text-white focus:ring-primary focus:border-primary outline-none" 
                  required
                />
              </div>

              <button 
                type="submit" 
                disabled={submitting}
                className="w-full py-3 bg-gradient-to-r from-primary to-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:from-primary/95 hover:to-indigo-750 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Icon name={submitting ? "sync" : "campaign"} className={submitting ? "animate-spin" : ""} />
                {submitting ? "Publishing..." : "Publish Notice"}
              </button>
            </form>
          </div>
        </div>

        {/* Notices Board View */}
        <div className="lg:col-span-2 space-y-6">
          {/* Filters Bar */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
            <span className="text-xs font-bold text-slate-450 uppercase tracking-wider">Filter Notices:</span>
            <div className="flex gap-2">
              {[
                { label: 'All Portals', value: 'all-filter' },
                { label: 'Teachers Only', value: 'teachers' },
                { label: 'Parents Only', value: 'parents' }
              ].map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setFilterAudience(tab.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filterAudience === tab.value 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notices Grid */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">Active Bulletins</h3>
              <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-900 rounded text-[9px] font-black text-slate-500">
                {filteredAnnouncements.length} notices
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredAnnouncements.map((ann) => (
                <div key={ann.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors flex flex-col gap-3 relative group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase ${
                        ann.audience === 'teachers' ? 'bg-indigo-50 text-indigo-650 dark:bg-indigo-900/20' :
                        ann.audience === 'parents' ? 'bg-blue-50 text-blue-650 dark:bg-blue-900/20' : 'bg-emerald-50 text-emerald-650 dark:bg-emerald-900/20'
                      }`}>
                        {ann.audience === 'all' ? 'All Audiences' : `${ann.audience} Portal`}
                      </span>
                      <span className="text-[10px] font-mono font-medium text-slate-400">
                        {ann.createdAt ? new Date(ann.createdAt).toLocaleString() : 'Just now'}
                      </span>
                    </div>
                    <button 
                      onClick={() => handleDelete(ann.id, ann.title)}
                      className="opacity-0 group-hover:opacity-100 transition-all text-slate-300 hover:text-red-500 p-1"
                      title="Delete Notice"
                    >
                      <Icon name="delete" className="text-base" />
                    </button>
                  </div>
                  
                  <h4 className="font-bold text-slate-900 dark:text-white text-base leading-tight">{ann.title}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium whitespace-pre-wrap">{ann.content}</p>
                </div>
              ))}

              {filteredAnnouncements.length === 0 && (
                <div className="p-16 text-center text-slate-400 italic text-sm">
                  No active notices published under this category.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
