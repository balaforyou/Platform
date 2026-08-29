import React, { useState } from 'react';
import LoginScreen from './screens/Auth/LoginScreen';
import GuestBooking from './screens/Guest/GuestBooking';
import AdminDashboard from './screens/Admin/AdminDashboard';
import MemberDashboard from './screens/Member/MemberDashboard';
import StudentDashboard from './screens/Student/StudentDashboard';

export default function App() {
  const [role, setRole] = useState(null); // null means logged out
  const [isPreviewMode, setIsPreviewMode] = useState(true); // Development Preview Toolbar

  const handleLogin = (userRole) => {
    setRole(userRole);
  };

  const handleLogout = () => {
    setRole(null);
  };

  const renderActiveApp = () => {
    if (!role) {
      return <LoginScreen onLoginSuccess={handleLogin} />;
    }
    
    switch(role) {
      case 'guest':
        return <GuestBooking onLogout={handleLogout} />;
      case 'admin':
        return <AdminDashboard onLogout={handleLogout} />;
      case 'member':
        return <MemberDashboard onLogout={handleLogout} />;
      case 'student':
        return <StudentDashboard onLogout={handleLogout} />;
      default:
        return <LoginScreen onLoginSuccess={handleLogin} />;
    }
  };

  // Preview Wrapper allows the developer/user to force roles while testing
  return (
    <div className="relative">
      {isPreviewMode && (
        <div className="fixed top-0 left-0 right-0 h-10 bg-indigo-900 text-white z-[99999] flex items-center justify-between px-4 text-xs font-mono font-bold shadow-md">
          <div className="flex items-center gap-4">
            <span className="text-indigo-300">SYSTEM PREVIEW</span>
            <span>Current Role: {role || 'LOGGED OUT'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-indigo-400 mr-2">FORCE SWITCH:</span>
            <button onClick={() => setRole(null)} className="px-3 py-1 bg-indigo-800 hover:bg-indigo-700 rounded text-white border-none cursor-pointer">Logout</button>
            <button onClick={() => setRole('guest')} className="px-3 py-1 bg-indigo-800 hover:bg-indigo-700 rounded text-white border-none cursor-pointer">Guest</button>
            <button onClick={() => setRole('member')} className="px-3 py-1 bg-indigo-800 hover:bg-indigo-700 rounded text-white border-none cursor-pointer">Member</button>
            <button onClick={() => setRole('admin')} className="px-3 py-1 bg-indigo-800 hover:bg-indigo-700 rounded text-white border-none cursor-pointer">Admin</button>
            <button onClick={() => setRole('student')} className="px-3 py-1 bg-indigo-800 hover:bg-indigo-700 rounded text-white border-none cursor-pointer">Student</button>
            <button onClick={() => setIsPreviewMode(false)} className="ml-4 px-2 py-1 bg-red-900/50 hover:bg-red-800 rounded text-red-200 border-none cursor-pointer">✕ Close Bar</button>
          </div>
        </div>
      )}
      
      <div className={isPreviewMode ? "pt-10" : ""}>
        {renderActiveApp()}
      </div>
    </div>
  );
}
