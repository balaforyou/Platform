import React, { useState } from 'react';
import { Calendar, ChevronRight, X, Clock, MapPin, AlertTriangle, Users } from 'lucide-react';

export default function AdminInventoryManager({ isDark, groups }) {
  const [selectedBranch, setSelectedBranch] = useState('Downtown Hub');
  const [selectedDate, setSelectedDate] = useState('2026-08-11'); // Match mock date
  
  // Format: { id, date, time, court, branch, recurring }
  const [inventorySlots, setInventorySlots] = useState([
    { id: 'i1', date: '2026-08-11', time: '08:00 AM', court: 'Court 1', branch: 'Downtown Hub', recurring: 'None' },
    { id: 'i2', date: '2026-08-11', time: '09:00 AM', court: 'Court 2', branch: 'Downtown Hub', recurring: 'None' },
  ]);

  const [activeCell, setActiveCell] = useState(null); // { time, court, type: 'empty'|'member'|'guest', data }
  const [recurrence, setRecurrence] = useState('None');
  const [publishError, setPublishError] = useState('');

  const branches = ['Downtown Hub', 'Uptown Arena', 'East Coast Courts'];
  const courts = ['Court 1', 'Court 2', 'Court 3'];
  const hours = [
    '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', 
    '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM',
    '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM',
    '09:00 PM', '10:00 PM'
  ];

  // Colors
  const bgClass = isDark ? 'bg-slate-900' : 'bg-white';
  const textClass = isDark ? 'text-white' : 'text-slate-900';
  const borderClass = isDark ? 'border-slate-800' : 'border-slate-200';

  // Helper to determine cell status
  const getCellStatus = (time, court) => {
    // 1. Check for Member Batch (mocking group assignments)
    // We mock Court 1 at 7PM and Court 2 at 7AM based on legacy mock data
    const memberGroup = groups.find(g => 
      g.court === court && g.hour.split(' - ')[0] === time
    );
    if (memberGroup) {
      return { type: 'member', data: memberGroup };
    }

    // 2. Check for Published Guest Slot
    const guestSlot = inventorySlots.find(s => 
      s.date === selectedDate && s.time === time && s.court === court && s.branch === selectedBranch
    );
    if (guestSlot) {
      return { type: 'guest', data: guestSlot };
    }

    // 3. Empty
    return { type: 'empty', data: null };
  };

  const handleCellClick = (time, court) => {
    setPublishError('');
    setRecurrence('None');
    setActiveCell({ time, court, ...getCellStatus(time, court) });
  };

  const handlePublish = () => {
    // Conflict Check (Strict Resolution)
    if (recurrence !== 'None') {
      // Mock conflict: Prevent recurring if it's Tuesday 7PM (hardcoded logic for demo)
      if (activeCell.time === '07:00 PM' && recurrence === 'Weekly') {
        setPublishError('Cannot create recurring slot: Collides with Elite Batch scheduled on future dates.');
        return;
      }
    }

    const newSlot = {
      id: `i_${Date.now()}`,
      date: selectedDate,
      time: activeCell.time,
      court: activeCell.court,
      branch: selectedBranch,
      recurring: recurrence
    };

    setInventorySlots([...inventorySlots, newSlot]);
    setActiveCell(null);
  };

  const handleDelete = () => {
    setInventorySlots(inventorySlots.filter(s => s.id !== activeCell.data.id));
    setActiveCell(null);
  };

  return (
    <div className={`space-y-4 animate-fadeIn pb-24 ${textClass}`}>
      {/* Header Controls */}
      <div className={`p-4 rounded-2xl border ${bgClass} ${borderClass} shadow-sm flex flex-col gap-3.5`}>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-black tracking-tight">Guest Slot Inventory</h2>
          <p className={`text-[13px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Tap empty spaces to publish booking slots for guests.</p>
        </div>
        <div className="flex gap-2.5">
          <select 
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className={`flex-1 min-w-0 px-2.5 py-2.5 rounded-xl border text-sm font-bold outline-none ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
          >
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className={`flex-1 min-w-0 px-2.5 py-2.5 rounded-xl border text-sm font-bold outline-none ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
          />
        </div>
      </div>

      {/* Heatmap Matrix */}
      <div className={`rounded-2xl border ${borderClass} ${bgClass} shadow-sm overflow-hidden flex flex-col`}>
        {/* Matrix Header */}
        <div className={`flex border-b ${borderClass}`}>
          <div className={`w-20 shrink-0 border-r ${borderClass} bg-slate-50/50 p-3 flex items-center justify-center`}>
            <Clock className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          </div>
          <div className="flex-1 flex overflow-x-auto">
            {courts.map(court => (
              <div key={court} className={`flex-1 min-w-[100px] p-3 text-center border-r last:border-r-0 ${borderClass} font-black text-sm`}>
                {court}
              </div>
            ))}
          </div>
        </div>

        {/* Matrix Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto max-h-[60vh] sm:max-h-[70vh]">
          {hours.map(hour => (
            <div key={hour} className={`flex border-b last:border-b-0 ${borderClass}`}>
              {/* Time Column */}
              <div className={`w-20 shrink-0 border-r ${borderClass} p-3 flex items-center justify-center text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {hour.replace(' ', '\n')}
              </div>
              
              {/* Courts Columns */}
              <div className="flex-1 flex overflow-x-auto">
                {courts.map(court => {
                  const status = getCellStatus(hour, court);
                  
                  let cellClasses = `flex-1 min-w-[100px] border-r last:border-r-0 ${borderClass} p-2 cursor-pointer transition-all hover:opacity-80 active:scale-95 `;
                  let content = null;

                  if (status.type === 'member') {
                    cellClasses += isDark ? 'bg-indigo-900/40' : 'bg-indigo-50';
                    content = (
                      <div className="h-full w-full rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex flex-col items-center justify-center p-1">
                        <Users className="w-4 h-4 text-indigo-500 mb-1" />
                        <span className="text-[10px] font-bold text-indigo-600 text-center leading-tight">Member<br/>Batch</span>
                      </div>
                    );
                  } else if (status.type === 'guest') {
                    cellClasses += isDark ? 'bg-emerald-900/20' : 'bg-emerald-50';
                    content = (
                      <div className="h-full w-full rounded-lg bg-emerald-500 shadow-[0_4px_12px_rgba(16,185,129,0.3)] flex flex-col items-center justify-center p-1 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-8 h-8 bg-white/20 rounded-full blur-xl translate-x-4 -translate-y-4" />
                        <span className="text-[11px] font-black text-white text-center">GUEST<br/>SLOT</span>
                      </div>
                    );
                  } else {
                    cellClasses += isDark ? 'bg-transparent hover:bg-slate-800' : 'bg-transparent hover:bg-slate-50';
                    content = (
                      <div className={`h-full w-full rounded-lg border-2 border-dashed ${isDark ? 'border-slate-800' : 'border-slate-200'} flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity`}>
                        <span className="text-xl font-light text-slate-400">+</span>
                      </div>
                    );
                  }

                  return (
                    <div 
                      key={`${hour}-${court}`} 
                      className={cellClasses}
                      onClick={() => handleCellClick(hour, court)}
                      style={{ height: '72px' }}
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tap-to-Publish Bottom Sheet / Modal */}
      {activeCell && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-sm ${bgClass} rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300`}>
            
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-emerald-500" />
                  {activeCell.court}
                </h3>
                <p className={`text-sm font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-1`}>
                  {selectedDate} • {activeCell.time}
                </p>
              </div>
              <button 
                onClick={() => setActiveCell(null)}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* If Member Batch */}
            {activeCell.type === 'member' && (
              <div className="flex flex-col gap-4">
                <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                  <div className="flex items-center gap-2 text-indigo-700 font-black mb-2">
                    <Users className="w-5 h-5" />
                    Member Batch Scheduled
                  </div>
                  <p className="text-sm text-indigo-900/80 font-bold">"{activeCell.data.name}"</p>
                  <p className="text-xs text-indigo-900/60 mt-1">This slot cannot be published for guests because it is reserved for an active member group.</p>
                </div>
                <button 
                  onClick={() => setActiveCell(null)}
                  className={`w-full py-3 rounded-xl font-bold ${isDark ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-800'}`}
                >
                  Close
                </button>
              </div>
            )}

            {/* If Published Guest Slot */}
            {activeCell.type === 'guest' && (
              <div className="flex flex-col gap-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                  <div className="flex items-center gap-2 text-emerald-700 font-black mb-1">
                    <CheckCircle className="w-5 h-5" />
                    Published & Active
                  </div>
                  <p className="text-xs text-emerald-900/60 mt-1">This slot is currently visible to guests on the booking portal.</p>
                </div>
                <button 
                  onClick={handleDelete}
                  className="w-full py-3.5 rounded-xl font-bold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                >
                  Unpublish / Recall Slot
                </button>
              </div>
            )}

            {/* If Empty (Tap to Publish) */}
            {activeCell.type === 'empty' && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Recurrence Pattern</label>
                  <select 
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value)}
                    className={`w-full p-3 rounded-xl border outline-none font-bold ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                  >
                    <option value="None">Just this once</option>
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>

                {publishError && (
                  <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs font-bold flex gap-2 border border-red-200">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {publishError}
                  </div>
                )}

                <button 
                  onClick={handlePublish}
                  className="w-full py-4 rounded-2xl font-black bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-[0_8px_20px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2"
                >
                  Publish Guest Slot
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
