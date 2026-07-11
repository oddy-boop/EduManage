import React from 'react';
import { Icon } from '../../components/Icon';
import { View } from '../../types';

interface ParentReportDetailProps {
  onNavigate: (view: View) => void;
  report?: any;
  child?: any;
}

export const ParentReportDetail: React.FC<ParentReportDetailProps> = ({ onNavigate, report, child }) => {
  // Safe fallbacks for previewing mock data if no real report context is passed
  const studentName = child?.name || 'Johnny Doe';
  const studentId = child?.id || 'STU-2023-0485';
  const studentClass = child?.classId || 'Grade 10-B';
  
  const termName = report?.term || 'Fall 2023';
  const sessionName = report?.session || '2023-24';
  const totalScore = report?.totalScore !== undefined ? report.totalScore : 92;
  const letterGrade = report?.grade || 'A';
  const reportStatus = report?.status || 'published';
  const teacherComments = report?.comments || 'Johnny has shown remarkable growth this semester. His analytical skills have improved significantly. He is a respectful student and a reliable team player during group projects.';

  const caScore = report?.grades?.ca !== undefined ? report.grades.ca : 38;
  const examScore = report?.grades?.exam !== undefined ? report.grades.exam : 54;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Self-contained Print Stylesheet */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide sidebar, navigation and utility controls */
          body * {
            visibility: hidden;
          }
          /* Show and format only the printable card container */
          #printable-report, #printable-report * {
            visibility: visible;
          }
          #printable-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0px !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />

      <button 
        onClick={() => onNavigate(View.PARENT_REPORTS)}
        className="flex items-center gap-1 text-sm font-bold text-primary hover:underline mb-2 no-print"
      >
        <Icon name="arrow_back" className="text-sm" /> Back to Reports
      </button>

      {/* Main Container */}
      <div id="printable-report" className="space-y-6 bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        
        {/* Printable-only Official School Letterhead */}
        <div className="hidden print:flex flex-col items-center text-center pb-6 border-b-2 border-double border-slate-300 mb-6">
          <div className="size-16 bg-primary text-white rounded-full flex items-center justify-center mb-3">
            <Icon name="school" className="text-3xl" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">UNIVERSITY OF GHANA BASIC SCHOOL</h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Office of the Principal • Terminal Assessment Report</p>
        </div>
        
        {/* Header Block */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block px-2.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold uppercase">Official Transcript</span>
              <span className="inline-block px-2.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase">{reportStatus}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">Academic Progress Report</h1>
            <p className="text-slate-500 text-sm mt-1 font-semibold">{termName} Semester ({sessionName})</p>
          </div>
          <div className="flex gap-3 no-print">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
            >
              <Icon name="print" /> Print
            </button>
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
            >
              <Icon name="download" /> Save PDF
            </button>
          </div>
        </div>

        {/* Student Profile Block */}
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Student Name</p>
            <p className="text-base font-bold text-slate-900 dark:text-white">{studentName}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Student Access ID</p>
            <p className="text-base font-mono font-bold text-slate-700 dark:text-slate-300">{studentId}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Assigned Class / Grade</p>
            <p className="text-base font-bold text-slate-900 dark:text-white">{studentClass}</p>
          </div>
        </div>

        {/* Aggregate Summary Block */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
            <div className="size-12 rounded-full bg-blue-50 dark:bg-blue-900/20 text-primary flex items-center justify-center">
              <Icon name="trending_up" className="text-2xl" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Term Cumulative Score</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{totalScore} <span className="text-sm font-medium text-slate-400">/ 100</span></p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
            <div className="size-12 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 flex items-center justify-center">
              <Icon name="emoji_events" className="text-2xl" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Assigned Letter Grade</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{letterGrade}</p>
            </div>
          </div>
        </div>

        {/* Detailed Assessment Ledger */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/10">
            <h3 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs">Terminal Grade Ledger</h3>
          </div>
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-bold text-slate-500">
              <tr>
                <th className="px-6 py-4">Assessment Component</th>
                <th className="px-6 py-4 text-center">Weight</th>
                <th className="px-6 py-4 text-center">Max Marks</th>
                <th className="px-6 py-4 text-center">Marks Obtained</th>
                <th className="px-6 py-4">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                      <Icon name="assignment" />
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">Continuous Assessment</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-center font-medium text-slate-500">40%</td>
                <td className="px-6 py-4 text-center font-medium text-slate-500">40</td>
                <td className="px-6 py-4 text-center font-bold text-slate-900 dark:text-white">{caScore}</td>
                <td className="px-6 py-4 text-xs text-slate-500 italic">Evaluated quizzes, class activities, and projects.</td>
              </tr>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-600 flex items-center justify-center">
                      <Icon name="draw" />
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">End of Semester Exam</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-center font-medium text-slate-500">60%</td>
                <td className="px-6 py-4 text-center font-medium text-slate-500">60</td>
                <td className="px-6 py-4 text-center font-bold text-slate-900 dark:text-white">{examScore}</td>
                <td className="px-6 py-4 text-xs text-slate-500 italic">Comprehensive theoretical and practical examination.</td>
              </tr>
            </tbody>
            <tfoot className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 font-bold">
              <tr>
                <td className="px-6 py-4 text-slate-900 dark:text-white">Cumulative Term Performance</td>
                <td className="px-6 py-4 text-center text-slate-500">100%</td>
                <td className="px-6 py-4 text-center text-slate-500">100</td>
                <td className="px-6 py-4 text-center text-primary text-base font-black">{totalScore}</td>
                <td className="px-6 py-4">
                  <span className="inline-block px-2.5 py-0.5 rounded bg-primary text-white text-xs font-black uppercase">Grade: {letterGrade}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Remarks Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Icon name="format_quote" className="text-primary text-lg" />
              <h3 className="font-bold text-slate-900 dark:text-white">Class Instructor's Remarks</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 italic leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
              "{teacherComments}"
            </p>
          </div>

          {/* Grading Key */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Icon name="info" className="text-slate-400" />
              <h3 className="font-bold text-slate-900 dark:text-white">JHS Grading Scheme</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700"><span>A+</span> <span className="text-slate-500">90-100 (Highest)</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700"><span>C</span> <span className="text-slate-500">60-69 (Pass)</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700"><span>A</span> <span className="text-slate-500">80-89 (Excellent)</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700"><span>D</span> <span className="text-slate-500">50-59 (Weak)</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700"><span>B</span> <span className="text-slate-500">70-79 (Very Good)</span></div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700"><span>F</span> <span className="text-slate-500">Below 50 (Fail)</span></div>
            </div>
          </div>
        </div>

        {/* Printable-only Signature Lines */}
        <div className="hidden print:grid grid-cols-2 gap-12 pt-16 mt-8 border-t border-dashed border-slate-300 text-xs">
          <div className="text-center">
            <div className="border-b border-slate-400 h-8 w-48 mx-auto mb-2"></div>
            <p className="font-bold text-slate-700 uppercase">Class Instructor Signature</p>
            <p className="text-[10px] text-slate-400">Mrs. Clara Oswald</p>
          </div>
          <div className="text-center">
            <div className="border-b border-slate-400 h-8 w-48 mx-auto mb-2"></div>
            <p className="font-bold text-slate-700 uppercase">Headteacher / Supervisor Signature</p>
            <p className="text-[10px] text-slate-400">Mr. Prince Boakye-Sekyerehene</p>
          </div>
        </div>

      </div>
    </div>
  );
};
