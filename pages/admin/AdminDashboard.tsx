import React, { useEffect, useState, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, 
  LineChart, Line, CartesianGrid, Legend 
} from 'recharts';
import { firestoreService } from '../../lib/services';
import { View } from '../../types';

// Palette of colors for class lines
const CLASS_COLORS = [
  '#195de6', // Primary Blue
  '#f97316', // Orange
  '#10b981', // Emerald
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
];

export const AdminDashboard: React.FC<{ onNavigate: (view: View) => void }> = ({ onNavigate }) => {
  const [stats, setStats] = useState({ studentsCount: 0, teachersCount: 0 });
  const [finance, setFinance] = useState({ totalCollected: 0, chartData: [] as any[] });
  const [attendanceRate, setAttendanceRate] = useState(0);
  const [distribution, setDistribution] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);

  useEffect(() => {
    const fetchBasicStats = async () => {
      const s = await firestoreService.getGlobalStats();
      setStats(s);
    };
    fetchBasicStats();

    const unsubFees = firestoreService.getAllFees((data) => {
        const total = data.reduce((acc, curr) => acc + (parseFloat(curr.amountPaid) || 0), 0);
        
        // Group by month for chart
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentYear = new Date().getFullYear();
        const monthlyData = months.map(m => ({ name: m, amount: 0 }));
        
        data.forEach(f => {
            const date = f.updatedAt?.toDate ? f.updatedAt.toDate() : (f.createdAt?.toDate ? f.createdAt.toDate() : new Date());
            if (date.getFullYear() === currentYear) {
                monthlyData[date.getMonth()].amount += (parseFloat(f.amountPaid) || 0);
            }
        });

        setFinance({ totalCollected: total, chartData: monthlyData.slice(0, new Date().getMonth() + 1) });
    });

    const unsubAttendance = firestoreService.getAllAttendance((data) => {
        if (data.length === 0) {
            setAttendanceRate(0);
            return;
        }
        const present = data.filter(a => a.status === 'present').length;
        setAttendanceRate(Math.round((present / data.length) * 100));
    });

    const unsubDist = firestoreService.getDistribution(setDistribution);
    const unsubStudents = firestoreService.getStudents((data) => {
      setAllStudents(data);
      const sorted = [...data].sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 4);
      setRecentActivities(sorted.map(s => ({
        name: s.name,
        action: 'Registered as new student',
        date: s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString() : 'Today',
        status: 'Active',
        statusColor: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        img: `https://picsum.photos/seed/${s.id}/100`
      })));
      setLoadingActivities(false);
    });

    const unsubTeachers = firestoreService.getTeachers((teachers) => {
        setRecentActivities(prev => {
            const existingStudents = prev.filter(a => a.type === 'Student');
            const newTeachers = teachers.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 2).map(t => ({
                name: t.name,
                action: 'Joined as Instructor',
                date: t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : 'New',
                status: 'Active',
                type: 'Teacher',
                statusColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
                img: `https://picsum.photos/seed/${t.id}/100`
            }));
            return [...existingStudents, ...newTeachers].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        });
    });

    const unsubReports = firestoreService.getAllReports((data) => {
        setReports(data);
    });

    return () => {
      unsubFees();
      unsubAttendance();
      unsubDist();
      unsubStudents();
      unsubTeachers();
      unsubReports();
    };
  }, []);

  // Process Report Cards to calculate class averages per term and overall
  const performanceStats = useMemo(() => {
    const reportsWithAverages = reports.map(r => {
      const gradesObj = typeof r.grades === 'object' ? r.grades : {};
      const subjectNames = Object.keys(gradesObj);
      let sum = 0;
      let count = 0;
      subjectNames.forEach(sub => {
        const score = parseFloat(gradesObj[sub]?.score);
        if (!isNaN(score)) {
          sum += score;
          count++;
        }
      });
      const average = count > 0 ? sum / count : 0;
      return {
        ...r,
        average
      };
    }).filter(r => r.average > 0 && r.classId);

    // Group Class Averages by Term (Line Chart 1)
    const termsList = Array.from(new Set(reportsWithAverages.map(r => (r.term as string) || 'Term 2'))).sort() as string[];
    const classesList = Array.from(new Set(reportsWithAverages.map(r => r.classId as string))).sort() as string[];

    const termChartData = termsList.map(term => {
      const row: any = { name: term };
      classesList.forEach(cls => {
        const classTermReports = reportsWithAverages.filter(r => r.term === term && r.classId === cls);
        if (classTermReports.length > 0) {
          const avgSum = classTermReports.reduce((sum, r) => sum + r.average, 0);
          row[cls] = Math.round((avgSum / classTermReports.length) * 10) / 10;
        }
      });
      return row;
    });

    // Group Overall Class Averages (Bar Chart 2)
    const classComparisonData = classesList.map(cls => {
      const classReports = reportsWithAverages.filter(r => r.classId === cls);
      const avgSum = classReports.reduce((sum, r) => sum + r.average, 0);
      const overallAvg = classReports.length > 0 ? Math.round((avgSum / classReports.length) * 10) / 10 : 0;
      return {
        className: cls,
        average: overallAvg
      };
    });

    return {
      termChartData,
      classComparisonData,
      classesList
    };
  }, [reports]);

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-8 p-8 animate-in fade-in duration-150">
      {/* Metrics Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Students', value: stats.studentsCount.toLocaleString(), icon: 'groups', color: 'text-primary', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Total Teachers', value: stats.teachersCount.toString(), icon: 'school', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
          { label: 'Fees Collected', value: `GH₵${(finance.totalCollected / 1000).toFixed(1)}k`, sub: `Total Sync`, target: '100% Reality', icon: 'account_balance_wallet', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
          { label: 'Attendance Rate', value: `${attendanceRate}%`, icon: 'co_present', color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-900/20' },
        ].map((stat: any, i) => (
          <div key={i} className="bg-white dark:bg-[#1a202c] rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-4">
              <div className={`size-10 rounded-lg ${stat.bg} flex items-center justify-center ${stat.color}`}>
                <Icon name={stat.icon} />
              </div>
              {stat.target && (
                <span className="flex items-center text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-xs font-medium">
                  {stat.target}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {stat.value} {stat.sub && <span className="text-base font-normal text-slate-400">{stat.sub}</span>}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* Financials & Demographics */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fee Collection trends */}
        <div className="bg-white dark:bg-[#1a202c] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Fee Collection Trends</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Monthly comparison (Last 6 Months)</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={finance.chartData.length > 0 ? finance.chartData : [{name: 'Waiting', amount: 0}]}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {(finance.chartData.length > 0 ? finance.chartData : [{name: 'Waiting', amount: 0}]).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill="#195de6" fillOpacity={0.2 + (index * 0.15)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Student distribution */}
        <div className="bg-white dark:bg-[#1a202c] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Student Distribution</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">By Grade Level</p>
            </div>
          </div>
          <div className="space-y-5">
            {distribution.length === 0 && <p className="text-sm text-slate-500 italic">No distribution data</p>}
            {distribution.map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-xs font-bold text-slate-500 w-16 uppercase">{item.grade}</span>
                <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: (item.count / (stats.studentsCount || 1) * 100) + '%', opacity: 1 - (i * 0.1) }}></div>
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 w-8 text-right">{item.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-sm">
            <span className="text-slate-500">Total capacity usage</span>
            <span className="font-bold text-slate-900 dark:text-white">88%</span>
          </div>
        </div>
      </section>

      {/* NEW SECTION: Academic Performance Insights */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Line graph comparing classes performances over terms */}
        <div className="bg-white dark:bg-[#1a202c] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex flex-col">
          <div className="mb-6">
             <h3 className="text-base font-bold text-slate-900 dark:text-white">Class Performance Over Terms</h3>
             <p className="text-sm text-slate-500 dark:text-slate-400">Line graph tracking averages across different terms</p>
          </div>
          <div className="h-72 w-full flex-grow">
             <ResponsiveContainer width="100%" height="100%">
               <LineChart data={performanceStats.termChartData} margin={{ left: -10, right: 10, bottom: 5, top: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis domain={[50, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-5} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: 12, fontWeight: 'bold' }} />
                  {performanceStats.classesList.map((cls, idx) => (
                    <Line 
                      key={cls}
                      type="monotone"
                      dataKey={cls}
                      stroke={CLASS_COLORS[idx % CLASS_COLORS.length]}
                      strokeWidth={3}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  ))}
               </LineChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Bar chart comparing overall GPA across different classes */}
        <div className="bg-white dark:bg-[#1a202c] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex flex-col">
          <div className="mb-6">
             <h3 className="text-base font-bold text-slate-900 dark:text-white">Class-to-Class Performance</h3>
             <p className="text-sm text-slate-500 dark:text-slate-400">Class GPA comparison registry sheet</p>
          </div>
          <div className="h-72 w-full flex-grow">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceStats.classComparisonData} margin={{ left: -10, right: 10, bottom: 5, top: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="className" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-5} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="average" radius={[4, 4, 0, 0]} maxBarSize={50}>
                     {performanceStats.classComparisonData.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={CLASS_COLORS[index % CLASS_COLORS.length]} />
                     ))}
                  </Bar>
                </BarChart>
             </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Directory section */}
      <section className="flex flex-col gap-4 mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Student Directory BY GRADE</h2>
          <p className="text-xs text-slate-505 font-bold uppercase tracking-widest text-slate-400">Master Enrollment List</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {distribution.map((gradeData, i) => {
                const gradeStudents = allStudents.filter(s => (s.classId || 'Unassigned') === gradeData.grade)
                    .sort((a, b) => a.name.localeCompare(b.name));
                
                return (
                    <div key={gradeData.grade} className="bg-white dark:bg-[#1a202c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/10">
                            <h4 className="font-black text-slate-900 dark:text-white uppercase text-xs tracking-tighter flex items-center gap-2">
                                <span className="size-2 bg-primary rounded-full"></span>
                                {gradeData.grade}
                            </h4>
                            <span className="text-[10px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded uppercase">
                                {gradeStudents.length} Students
                            </span>
                        </div>
                        <div className="p-2 space-y-1 flex-1">
                            {gradeStudents.map(student => (
                                <div key={student.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="size-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-black">
                                            {student.name.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{student.name}</p>
                                            <p className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter">{student.loginId || 'Pending...'}</p>
                                        </div>
                                    </div>
                                    <Icon name="chevron_right" className="text-slate-300 group-hover:text-primary transition-colors text-sm" />
                                </div>
                            ))}
                            {gradeStudents.length === 0 && (
                                <p className="text-xs text-slate-400 italic p-4 text-center">No students registered in this grade.</p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
      </section>
    </div>
  );
};
