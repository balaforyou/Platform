import React, { useState, useEffect } from 'react';
import { ChevronDown, Plus, Minus, MapPin, Sun, Moon, LogOut } from 'lucide-react';
import { formatBookingReference, useAuth, useTenant } from '@badminton/ui-shared';

interface GuestBookingProps {
  onLogout: () => void;
}

const badmintonBgStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2310b981' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
};

export default function GuestBooking({ onLogout }: GuestBookingProps) {
  const { tenant } = useTenant();
  
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('smashsync_theme');
    return saved ? saved : 'dark';
  });
  const isDark = theme === 'dark';

  useEffect(() => {
    localStorage.setItem('smashsync_theme', theme);
  }, [theme]);
  
  const [currentView, setCurrentView] = useState<'dashboard' | 'booking'>('dashboard');
  const [myBookings, setMyBookings] = useState<any[]>([]);
  
  const [selectedBranch, setSelectedBranch] = useState('Downtown Hub');
  const [selectedDate, setSelectedDate] = useState('Aug 05');
  const [selectedPeriod, setSelectedPeriod] = useState('Morning');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [duration, setDuration] = useState(60); // minutes
  const [selectedCourt, setSelectedCourt] = useState('Court 1');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Mock data generation
  const branches = ['Downtown Hub', 'Uptown Arena', 'East Coast Courts'];
  const dates = ['Aug 05', 'Aug 06', 'Aug 07', 'Aug 08', 'Aug 09'];
  const periods = ['Morning', 'Afternoon', 'Evening'];
  const courts = ['Court 1', 'Court 2', 'Court 3'];

  // Slots based on period
  const getSlotsForPeriod = (period: string) => {
    if (period === 'Morning') return ['06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM'];
    if (period === 'Afternoon') return ['12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'];
    return ['05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM', '10:00 PM'];
  };

  const slots = getSlotsForPeriod(selectedPeriod);

  const baseRate = 200;
  const multiplier = duration / 60;
  const isPeak = selectedPeriod === 'Evening' || selectedPeriod === 'Morning';
  const peakPremium = isPeak ? 100 : 0;
  const totalPrice = (baseRate + peakPremium) * multiplier;

  const handlePay = () => {
    if (!selectedSlot) return;
    setIsProcessing(true);
    setTimeout(() => {
      setMyBookings([{
        ref: formatBookingReference(Date.now().toString()),
        date: selectedDate,
        time: selectedSlot,
        court: selectedCourt,
        branch: selectedBranch,
        status: 'Confirmed'
      }, ...myBookings]);
      setIsProcessing(false);
      setShowSuccess(true);
    }, 1500);
  };

  const renderOverlays = () => {
    return (
      <>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes rallyBounce {
            0% { transform: translate(-40px, -20px) rotate(-15deg); }
            50% { transform: translate(40px, -20px) rotate(15deg); }
            100% { transform: translate(-40px, -20px) rotate(-15deg); }
          }
          @keyframes goldPulse {
            0% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.7); transform: scale(1); }
            70% { box-shadow: 0 0 0 20px rgba(234, 179, 8, 0); transform: scale(1.05); }
            100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0); transform: scale(1); }
          }
        `}} />
        {isProcessing && (
          <div className="fixed inset-0 bg-slate-900/90 z-[9999] flex flex-col items-center justify-center backdrop-blur-sm">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center relative overflow-hidden shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              <div className="absolute w-full h-1 bg-slate-200 top-1/2 -translate-y-1/2" />
              <svg className="w-6 h-6 text-emerald-500 absolute" style={{ animation: 'rallyBounce 1.2s ease-in-out infinite' }} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L8 10h8L12 2zm0 10a4 4 0 100 8 4 4 0 000-8z"/></svg>
            </div>
            <div className="mt-6 text-emerald-400 font-black text-lg tracking-widest uppercase animate-pulse">Securing Slot...</div>
          </div>
        )}
        {showSuccess && (
          <div className="fixed inset-0 bg-slate-900/95 z-[9999] flex flex-col items-center justify-center p-6 text-center backdrop-blur-md">
            <div className="bg-yellow-500/10 p-8 rounded-full mb-8 border border-yellow-500/30" style={{ animation: 'goldPulse 2s infinite' }}>
              <svg className="w-20 h-20 text-yellow-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L8 10h8L12 2zm0 10a4 4 0 100 8 4 4 0 000-8z"/></svg>
            </div>
            <h2 className="text-3xl font-black text-yellow-400 tracking-tight mb-2">Booking Confirmed!</h2>
            <p className="text-yellow-400/70 font-bold tracking-widest uppercase text-sm mb-8">Court Secured</p>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm mb-8 flex flex-col gap-3">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-sm font-bold">Ref Code</span>
                <span className="font-mono font-bold text-white bg-slate-900 px-3 py-1 rounded-lg border border-slate-700">{formatBookingReference('1234')}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-sm font-bold">Date & Time</span>
                <span className="font-bold text-white">{selectedDate} · {selectedSlot}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-sm font-bold">Court</span>
                <span className="font-bold text-emerald-400">{selectedCourt}</span>
              </div>
            </div>
            <button onClick={() => { setShowSuccess(false); setSelectedSlot(null); setCurrentView('dashboard'); }} className="w-full max-w-sm min-h-[54px] rounded-2xl border-none bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-black text-[16px] cursor-pointer shadow-lg">Done</button>
          </div>
        )}
      </>
    );
  };

  return (
    <div style={badmintonBgStyle} className={`min-h-screen flex flex-col font-sans transition-all duration-350 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      {renderOverlays()}
      
      {/* --- APP SHELL HEADER --- */}
      <header className={`backdrop-blur-md border-b px-4 py-3 sticky top-0 z-40 flex items-center justify-between transition-colors ${
        isDark ? 'bg-[#0f1b14]/80 border-emerald-900/30' : 'bg-white/90 border-slate-200'
      }`}>
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-emerald-500 to-teal-350 bg-clip-text text-transparent">JBC</span>
          <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md uppercase tracking-wider ml-1">Guest</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={`p-1.5 rounded-full transition-colors cursor-pointer border-none bg-transparent ${
              isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
            }`}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={onLogout}
            className={`p-1.5 rounded-full transition-colors cursor-pointer border-none bg-transparent ${
              isDark ? 'text-slate-400 hover:text-red-400 hover:bg-slate-800' : 'text-slate-500 hover:text-red-500 hover:bg-slate-200'
            }`}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      
      {currentView === 'dashboard' && (
        <div className="flex-1 overflow-y-auto p-4 sm:max-w-[480px] sm:mx-auto sm:w-full">
          <div className="flex items-center justify-between mb-6 mt-4">
            <h2 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>My Bookings</h2>
            <button onClick={() => setCurrentView('booking')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md border-none cursor-pointer">
              + New Booking
            </button>
          </div>

          {myBookings.length === 0 ? (
            <div className={`flex flex-col items-center justify-center p-10 mt-10 rounded-[24px] border border-dashed ${isDark ? 'border-slate-800 bg-slate-900/30' : 'border-slate-300 bg-slate-50'}`}>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                <MapPin className={`w-8 h-8 ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
              </div>
              <h3 className={`text-lg font-black mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>No active bookings</h3>
              <p className={`text-sm text-center mb-6 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>You don't have any upcoming court reservations.</p>
              <button onClick={() => setCurrentView('booking')} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md border-none cursor-pointer">
                Book a Court
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {myBookings.map((b, i) => (
                <div key={i} className={`p-5 rounded-[24px] border shadow-sm relative overflow-hidden ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500" />
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className={`font-black text-lg m-0 ${isDark ? 'text-white' : 'text-slate-900'}`}>{b.court}</h4>
                      <p className={`text-xs font-bold mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{b.branch}</p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-md">{b.status}</span>
                  </div>
                  
                  <div className={`p-3 rounded-xl flex items-center justify-between mb-2 ${isDark ? 'bg-slate-950/50' : 'bg-slate-50'}`}>
                    <div className="flex flex-col">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Date</span>
                      <span className={`font-bold text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{b.date}</span>
                    </div>
                    <div className="w-px h-6 bg-slate-700/30" />
                    <div className="flex flex-col text-right">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Time</span>
                      <span className={`font-bold text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{b.time}</span>
                    </div>
                  </div>

                  <div className={`text-[10px] font-bold tracking-widest mt-4 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                    REF: {b.ref}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {currentView === 'booking' && (
        <>
          {/* Main Content */}

      <div className="flex-1 overflow-y-auto pb-[100px] scroll-smooth p-4 sm:max-w-[480px] sm:mx-auto sm:w-full">
        
        {/* BRANCH PICKER */}
        <div className="pb-4">
          <h2 className={`text-sm font-black mb-3 uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Select location</h2>
          <div className="relative group">
            <select 
              value={selectedBranch}
              onChange={(e) => { setSelectedBranch(e.target.value); setSelectedSlot(null); }}
              className={`w-full appearance-none border rounded-[16px] py-3.5 pl-12 pr-12 text-[15px] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer ${
                isDark ? 'bg-slate-900/50 border-emerald-900/40 text-slate-200 hover:border-emerald-700/50' : 'bg-white border-slate-200 text-slate-900 hover:border-emerald-300'
              }`}
            >
              {branches.map(branch => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
            <div className={`absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center ${isDark ? 'bg-emerald-900/30' : 'bg-emerald-50'}`}>
              <MapPin className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <ChevronDown className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            </div>
          </div>
        </div>

        {/* DAY PICKER */}
        <div className="pb-6">
          <h2 className={`text-sm font-black mb-3 uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Pick a day</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {dates.map((date) => {
              const isActive = selectedDate === date;
              return (
                <button
                  key={date}
                  onClick={() => { setSelectedDate(date); setSelectedSlot(null); }}
                  className={`flex-none w-[64px] h-[72px] rounded-[16px] flex flex-col items-center justify-center gap-1 border cursor-pointer transition-all ${
                    isActive 
                      ? 'bg-emerald-600 border-emerald-500 shadow-[0_4px_12px_rgba(16,185,129,0.3)]' 
                      : isDark ? 'bg-slate-900/50 border-slate-800 hover:border-emerald-900/50' : 'bg-white border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  <span className={`text-[11px] font-bold uppercase ${isActive ? 'text-emerald-100' : isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    {date.split(' ')[0]}
                  </span>
                  <span className={`text-[18px] font-black ${isActive ? 'text-white' : isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                    {date.split(' ')[1]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* PERIOD TABS */}
        <div className="pb-6">
          <div className={`p-1 rounded-[16px] flex gap-1 ${isDark ? 'bg-slate-900/50 border border-slate-800' : 'bg-slate-100'}`}>
            {periods.map(period => {
              const isActive = selectedPeriod === period;
              return (
                <button
                  key={period}
                  onClick={() => { setSelectedPeriod(period); setSelectedSlot(null); }}
                  className={`flex-1 h-[40px] rounded-[12px] font-bold text-[13px] border-none cursor-pointer transition-all ${
                    isActive 
                      ? isDark ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm' 
                      : 'bg-transparent text-slate-500 hover:text-slate-400'
                  }`}
                >
                  {period}
                </button>
              );
            })}
          </div>
        </div>

        {/* SLOT GRID */}
        <div className="pb-6">
          <h2 className={`text-sm font-black mb-3 uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Available slots</h2>
          <div className="grid grid-cols-3 gap-3">
            {slots.map((time) => {
              const isActive = selectedSlot === time;
              const isAvailable = Math.random() > 0.2;

              if (!isAvailable) {
                return (
                  <div key={time} className={`h-[60px] rounded-[14px] border flex flex-col items-center justify-center opacity-40 ${isDark ? 'bg-slate-900/30 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                    <span className={`text-[14px] font-bold line-through ${isDark ? 'text-slate-600 decoration-slate-700' : 'text-slate-400 decoration-slate-300'}`}>{time}</span>
                  </div>
                );
              }

              return (
                <button
                  key={time}
                  onClick={() => setSelectedSlot(time)}
                  className={`h-[60px] rounded-[14px] border flex flex-col items-center justify-center cursor-pointer transition-all ${
                    isActive 
                      ? 'bg-emerald-600 border-emerald-500 shadow-[0_4px_12px_rgba(16,185,129,0.3)]' 
                      : isDark ? 'bg-slate-900/50 border-slate-800 hover:border-emerald-500/50 text-slate-300' : 'bg-white border-slate-200 hover:border-emerald-400 text-slate-800'
                  }`}
                >
                  <span className={`text-[14px] font-black ${isActive ? 'text-white' : ''}`}>{time}</span>
                  <span className={`text-[10px] font-bold ${isActive ? 'text-emerald-100' : 'text-emerald-500'}`}>₹{baseRate + peakPremium}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* BELOW FOLD OPTIONS */}
        {selectedSlot && (
          <div className={`mt-4 p-5 rounded-[24px] border animate-in fade-in slide-in-from-bottom-4 duration-300 ${isDark ? 'bg-emerald-950/20 border-emerald-900/30' : 'bg-emerald-50/50 border-emerald-100'}`}>
            
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-black m-0 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>Duration</h3>
                  <p className={`text-[12px] font-bold m-0 mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Consecutive minutes</p>
                </div>
                <div className={`flex items-center gap-4 border rounded-[16px] p-1.5 shadow-sm ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <button onClick={() => setDuration(Math.max(60, duration - 30))} className={`w-10 h-10 rounded-[12px] flex items-center justify-center border-none cursor-pointer transition-colors ${isDark ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                    <Minus className="w-5 h-5" />
                  </button>
                  <span className={`w-8 text-center font-black text-[16px] ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{duration}</span>
                  <button onClick={() => setDuration(Math.min(180, duration + 30))} className={`w-10 h-10 rounded-[12px] flex items-center justify-center border-none cursor-pointer transition-colors ${isDark ? 'bg-emerald-900/40 text-emerald-400 hover:bg-emerald-800/50' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <h3 className={`font-black mb-4 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>Select Court</h3>
              <div className="flex flex-wrap gap-2">
                {courts.map(court => {
                  const isActive = selectedCourt === court;
                  return (
                    <button
                      key={court}
                      onClick={() => setSelectedCourt(court)}
                      className={`h-[44px] px-5 rounded-full border font-bold text-[13px] cursor-pointer transition-all flex items-center gap-2 ${
                        isActive
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20'
                          : isDark ? 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-600' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <MapPin className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-200' : 'text-emerald-500'}`} />
                      {court}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* STICKY BOTTOM BAR */}
      {selectedSlot && (
        <div className={`sticky bottom-0 left-0 right-0 p-4 border-t animate-in slide-in-from-bottom-full duration-300 z-10 pb-8 sm:pb-4 backdrop-blur-xl ${isDark ? 'bg-[#0f1b14]/90 border-emerald-900/30 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]' : 'bg-white/90 border-slate-200 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]'}`}>
          <div className="flex items-center gap-4 sm:max-w-[480px] sm:mx-auto">
            <div className="flex flex-col flex-none min-w-[80px]">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Total Fee</span>
              <span className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>₹{totalPrice}</span>
            </div>
            <button 
              onClick={handlePay}
              className="flex-1 h-[54px] rounded-xl border-none bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[16px] cursor-pointer shadow-[0_4px_16px_rgba(16,185,129,0.4)] flex items-center justify-center gap-2 transition-all"
            >
              Reserve and Pay
            </button>
          </div>
        </div>
      )}


        </>
      )}
    </div>
  );
}