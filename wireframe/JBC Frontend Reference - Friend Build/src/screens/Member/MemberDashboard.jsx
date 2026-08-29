import React, { useState, useEffect } from 'react';
import { 
  Building2, Users, Calendar, Clock, ChevronLeft, ChevronRight, Bell, BellOff,
  BarChart3, ShieldAlert, Award, FileSpreadsheet, RotateCcw,
  MessageSquare, Send, CheckCircle, Lock, XCircle, X, User, LogOut, Fingerprint, LogIn, Trophy, TrendingUp,
  Sun, Moon, DollarSign, CreditCard, MapPin, FolderPlus, UserPlus, Menu, Grid
} from 'lucide-react';
import AdminInventoryManager from '../Admin/AdminInventoryManager';

const INITIAL_GUESTS = [
  { id: 'g1', name: 'Vikram S.', date: 'Aug 05', court: 'Court 1', status: 'Booked', type: 'Non-Peak', time: '10:00 AM', fee: 200, collectedAmount: 200, paymentMethod: 'Online', refundIssued: 0, branch: 'Downtown Hub', month: 'Aug 2026' },
  { id: 'g2', name: 'Aditi R.', date: 'Aug 05', court: 'Court 2', status: 'Booked', type: 'Peak', time: '08:00 PM', fee: 400, collectedAmount: 400, paymentMethod: 'Cash', refundIssued: 0, branch: 'Downtown Hub', month: 'Aug 2026' },
  { id: 'g3', name: 'Kabir L.', date: 'Aug 06', court: 'Court 1', status: 'Booked', type: 'Non-Peak', time: '02:00 PM', fee: 200, collectedAmount: 200, paymentMethod: 'Online', refundIssued: 0, branch: 'Suburb Arena', month: 'Aug 2026' }
];

const INITIAL_STUDENTS = [
  { id: 's1', name: 'Rohan M.', batch: 'Beginners Academy', coach: 'Priya N.', progress: 80, attendance: '8/10' },
  { id: 's2', name: 'Sneha G.', batch: 'Advanced Academy', coach: 'Rahul K. (You)', progress: 95, attendance: '10/12' },
  { id: 's3', name: 'Arjun P.', batch: 'Beginners Academy', coach: 'Priya N.', progress: 60, attendance: '6/10' }
];

const INITIAL_TOURNAMENTS = [
  { id: 't1', name: 'Monsoon Singles Open 2026', type: 'Singles', players: 16, status: 'In Progress', nextMatch: 'Rohan M. vs Vikram S.' },
  { id: 't2', name: 'JBC Doubles Cup', type: 'Doubles', players: 8, status: 'Registration Open', nextMatch: 'TBD' }
];

const INITIAL_MEMBERS = [
  { id: 'm1', name: 'Rahul K. (You)', rsvpStatus: 'Pending', checkInTime: null, batchId: 'b1', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Pending', 'Sep 2026': 'Pending' }, mobile: '+91 98765 43210', email: 'rahul.k@gmail.com', baseRate: 2000 },
  { id: 'm2', name: 'Ananya S.', rsvpStatus: 'Present', checkInTime: '5:02 PM', batchId: 'b1', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 91234 56789', email: 'ananya.s@gmail.com', baseRate: 2000 },
  { id: 'm3', name: 'Vikram J.', rsvpStatus: 'Present', checkInTime: '5:15 PM', batchId: 'b1', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Pending', 'Sep 2026': 'Pending' }, mobile: '+91 98888 77777', email: 'vikram.j@gmail.com', baseRate: 3500 },
  { id: 'm4', name: 'Amit R.', rsvpStatus: 'Present', checkInTime: '5:30 PM', batchId: 'b1', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 97777 66666', email: 'amit.r@gmail.com', baseRate: 2000 },
  { id: 'm5', name: 'Siddharth M.', rsvpStatus: 'Late Cancel', checkInTime: null, batchId: 'b1', paymentHistory: { 'Jul 2026': 'Pending', 'Aug 2026': 'Pending', 'Sep 2026': 'Pending' }, mobile: '+91 96666 55555', email: 'siddharth.m@gmail.com', baseRate: 3500 },
  { id: 'm6', name: 'Priya N.', rsvpStatus: 'Present', checkInTime: '4:45 PM', batchId: 'b1', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 95555 44444', email: 'priya.n@gmail.com', baseRate: 2000 },
  { id: 'm7', name: 'Kunal P.', rsvpStatus: 'Present', checkInTime: '5:10 PM', batchId: 'b1', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 94444 33333', email: 'kunal.p@gmail.com', baseRate: 2000 },
  // Court 1 (b2) - Beginner Bootcamp
  { id: 'm8', name: 'Arjun M.', rsvpStatus: 'Present', checkInTime: '5:12 PM', batchId: 'b2', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 93333 22222', email: 'arjun.m@gmail.com', baseRate: 2000 },
  { id: 'm9', name: 'Zara H.', rsvpStatus: 'Present', checkInTime: '5:20 PM', batchId: 'b2', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 92222 11111', email: 'zara.h@gmail.com', baseRate: 2000 },
  { id: 'm10', name: 'Rohan D.', rsvpStatus: 'Present', checkInTime: '5:22 PM', batchId: 'b2', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 91111 00000', email: 'rohan.d@gmail.com', baseRate: 2000 },
  { id: 'm11', name: 'Sneha G.', rsvpStatus: 'Present', checkInTime: '5:28 PM', batchId: 'b2', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 90000 99999', email: 'sneha.g@gmail.com', baseRate: 2000 },
  { id: 'm12', name: 'Kabir S.', rsvpStatus: 'Present', checkInTime: '5:35 PM', batchId: 'b2', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 89999 88888', email: 'kabir.s@gmail.com', baseRate: 2000 },
  { id: 'm13', name: 'Divya F.', rsvpStatus: 'Present', checkInTime: '5:40 PM', batchId: 'b2', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 88888 77777', email: 'divya.f@gmail.com', baseRate: 2000 },
  // Court 3 (b3) - Morning Flight
  { id: 'm14', name: 'Neha V.', rsvpStatus: 'Present', checkInTime: '06:05 AM', batchId: 'b3', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 87777 66666', email: 'neha.v@gmail.com', baseRate: 2000 },
  { id: 'm15', name: 'Varun T.', rsvpStatus: 'Present', checkInTime: '05:52 AM', batchId: 'b3', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 86666 55555', email: 'varun.t@gmail.com', baseRate: 2000 },
  { id: 'm16', name: 'Aditi K.', rsvpStatus: 'Present', checkInTime: '05:58 AM', batchId: 'b3', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 85555 44444', email: 'aditi.k@gmail.com', baseRate: 2000 },
  { id: 'm17', name: 'Ishaan B.', rsvpStatus: 'Present', checkInTime: '06:00 AM', batchId: 'b3', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 84444 33333', email: 'ishaan.b@gmail.com', baseRate: 2000 },
  { id: 'm18', name: 'Riya J.', rsvpStatus: 'Present', checkInTime: '05:48 AM', batchId: 'b3', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 83333 22222', email: 'riya.j@gmail.com', baseRate: 2000 },
  { id: 'm19', name: 'Aarav L.', rsvpStatus: 'Present', checkInTime: '05:50 AM', batchId: 'b3', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 82222 11111', email: 'aarav.l@gmail.com', baseRate: 2000 },
  { id: 'm20', name: 'Tanya P.', rsvpStatus: 'Present', checkInTime: '05:54 AM', batchId: 'b3', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 81111 00000', email: 'tanya.p@gmail.com', baseRate: 2000 },
  { id: 'm21', name: 'Manish S.', rsvpStatus: 'Present', checkInTime: '05:57 AM', batchId: 'b3', paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' }, mobile: '+91 80000 99999', email: 'manish.s@gmail.com', baseRate: 2000 }
];

const INITIAL_CALENDAR_HISTORY = {
  1: { status: 'Present', time: 'Evening 7:00 PM', court: 'Court 2' },
  3: { status: 'Present', time: 'Morning 6:00 AM', court: 'Court 1' },
  5: { status: 'Absent', time: 'Evening 7:00 PM', court: 'Court 2' },
  8: { status: 'Present', time: 'Evening 7:00 PM', court: 'Court 2' },
  10: { status: 'Present', time: 'Morning 6:00 AM', court: 'Court 1' },
  12: { status: 'Maybe', time: 'Evening 7:00 PM', court: 'Court 3' },
  15: { status: 'Present', time: 'Evening 7:00 PM', court: 'Court 2' },
  18: { status: 'Absent', time: 'Evening 7:00 PM', court: 'Court 2' },
  20: { status: 'Present', time: 'Morning 6:00 AM', court: 'Court 1' },
  24: { status: 'Present', time: 'Evening 7:00 PM', court: 'Court 2' },
  25: { status: 'Present', time: 'Evening 7:00 PM', court: 'Court 2' }
};

const CALENDAR_STATUS_MAP = {
  // Mock statuses for Nov 2015 simulation matching the user's reference image
  3: 'session', 4: 'session', 5: 'session', 6: 'session', 7: 'session',
  10: 'session', 11: 'session', 13: 'session', 14: 'session',
  19: 'session', 20: 'session', 26: 'session', 27: 'selected', 
  12: 'cancelled', 24: 'cancelled',
  17: 'pending-fee', 18: 'pending-fee', 21: 'pending-fee', 25: 'pending-fee'
};

const ANALYTICS_DATA = {
  branches: [
    { name: 'Downtown Hub', avgPlayers: 92, rate: '91.2%', totalCourts: 4 },
    { name: 'Uptown Arena', avgPlayers: 64, rate: '88.5%', totalCourts: 3 },
    { name: 'East Coast Courts', avgPlayers: 41, rate: '79.4%', totalCourts: 3 }
  ],
  courts: [
    { number: 'Court 1', peak: 'Evening 7:00 PM', noShows: 3 },
    { number: 'Court 2', peak: 'Evening 7:00 PM', noShows: 7 },
    { number: 'Court 3', peak: 'Morning 6:00 AM', noShows: 1 }
  ]
};

export default function MemberDashboard({ onLogout }) {
  const [role, setRole] = useState('member'); 
  const [currentScreen, setCurrentScreen] = useState('slotDetails');
  const [selectedBranch, setSelectedBranch] = useState('Downtown Hub');
  const [isLoading, setIsLoading] = useState(false);

  // Month-Scrolling Calendar States
  const [currentMonthIndex, setCurrentMonthIndex] = useState(7); // default 7 = August (0-indexed)
  const [currentYear, setCurrentYear] = useState(2026); // default 2026
  const [selectedDay, setSelectedDay] = useState(11); // default matches active simulation day

  // Theme configuration: dark / light
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('smashsync_theme');
    return saved ? saved : 'dark';
  });

  // Admin Broadcast Alerts
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [activeBroadcasts, setActiveBroadcasts] = useState([
    { id: 1, type: 'Alert', content: 'Court 2 nets have been re-tensioned today.', date: 'Today' }
  ]);

  // Simulated Time Configuration
  // 5:15 PM -> 17:15, 6:15 PM -> 18:15. Cutoff is 6:00 PM -> 18:00
  const [simulatedTime, setSimulatedTime] = useState('17:15'); 
  
  // Date Simulator: 'due' (August 11 - post 10th cutoff) | 'current' (August 5 - grace period)
  const [simulatedDay, setSimulatedDay] = useState('due');
  const [ledgerFilter, setLedgerFilter] = useState('all'); // 'all' or 'unpaid'
  const [ledgerSubTab, setLedgerSubTab] = useState('members'); // 'members' or 'guests'
  const [globalLedgerMonth, setGlobalLedgerMonth] = useState('Aug 2026');
  const [guestLedgerDateFrom, setGuestLedgerDateFrom] = useState('');
  const [guestLedgerDateTo, setGuestLedgerDateTo] = useState('');
  const [guestLedgerBranch, setGuestLedgerBranch] = useState('All Branches');
  const [expandedLedgerBranch, setExpandedLedgerBranch] = useState(null);
  const [editingCollectedId, setEditingCollectedId] = useState(null);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [dismissedBroadcast, setDismissedBroadcast] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [groups, setGroups] = useState(() => {
    const saved = localStorage.getItem('jbc_groups');
    return saved ? JSON.parse(saved) : [
      { id: 'g1', name: 'Elite Morning Group', court: 'Court 2', hour: '07:00 AM - 08:00 AM', fee: 1500, groupType: 'Premium', memberIds: ['m1', 'm2', 'm6', 'm7'] },
      { id: 'g2', name: 'Beginner Evening Group', court: 'Court 1', hour: '07:00 PM - 08:00 PM', fee: 1200, groupType: 'Normal', memberIds: ['m3', 'm4', 'm8', 'm9'] }
    ];
  });
  const [groupSubTab, setGroupSubTab] = useState('manage'); // 'manage' | 'assign'
  const [activeGroupAssignmentId, setActiveGroupAssignmentId] = useState('g1');
  const [tempAssignedMemberIds, setTempAssignedMemberIds] = useState([]);
  const [isPreviewFullWidth, setIsPreviewFullWidth] = useState(false);
  const [desktopGroupSubTab, setDesktopGroupSubTab] = useState('assign'); // assign | attendance
  const [selectedMobileRosterGroupId, setSelectedMobileRosterGroupId] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [guests, setGuests] = useState(INITIAL_GUESTS);
  const [students, setStudents] = useState(INITIAL_STUDENTS);
  const [tournaments, setTournaments] = useState(INITIAL_TOURNAMENTS);
  const [configBranch, setConfigBranch] = useState('Downtown Hub');
  const [guestAllowedCourts, setGuestAllowedCourts] = useState({
    'Downtown Hub': ['Court 1'],
    'Uptown Arena': ['Court 1', 'Court 2'],
    'East Coast Courts': ['Court 1']
  });
  const [guestSlots, setGuestSlots] = useState({
    'Downtown Hub': [
      { id: 'gs1', time: '10:00 AM', type: 'Non-Peak', recurrence: 'Daily' },
      { id: 'gs2', time: '11:00 AM', type: 'Non-Peak', recurrence: 'Daily' },
      { id: 'gs3', time: '02:00 PM', type: 'Non-Peak', recurrence: 'Daily' },
      { id: 'gs4', time: '08:00 PM', type: 'Peak', recurrence: 'Weekly', details: 'Mon, Wed, Fri' },
      { id: 'gs5', time: '09:00 PM', type: 'Peak', recurrence: 'Weekly', details: 'Mon, Wed, Fri' }
    ],
    'Uptown Arena': [
      { id: 'gs6', time: '10:00 AM', type: 'Non-Peak', recurrence: 'Daily' },
      { id: 'gs7', time: '08:00 PM', type: 'Peak', recurrence: 'Daily' }
    ],
    'East Coast Courts': [
      { id: 'gs8', time: '11:00 AM', type: 'Non-Peak', recurrence: 'Daily' }
    ]
  });
  const [occupancyTab, setOccupancyTab] = useState('members'); // 'members' | 'guests'
  const [guestBlackoutRange, setGuestBlackoutRange] = useState({
    'Downtown Hub': { start: '2026-08-10', end: '2026-08-12', closed: false, reason: 'Maintenance' },
    'Uptown Arena': { start: '', end: '', closed: false, reason: 'Maintenance' },
    'East Coast Courts': { start: '', end: '', closed: false, reason: 'Maintenance' }
  });
  const [showDeleteReasonModal, setShowDeleteReasonModal] = useState(false);
  const [deleteReasonType, setDeleteReasonType] = useState('slot'); // 'slot' | 'booking'
  const [targetIdToDelete, setTargetIdToDelete] = useState(null);
  const [selectedDeleteReason, setSelectedDeleteReason] = useState('Maintenance');
  const [customDeleteReason, setCustomDeleteReason] = useState('');
  
  const [guestCancelPolicy, setGuestCancelPolicy] = useState({
    'Downtown Hub': { applyGlobally: false, slab24: 100, slab12: 50, slab0: 0 },
    'Uptown Arena': { applyGlobally: false, slab24: 100, slab12: 50, slab0: 0 },
    'East Coast Courts': { applyGlobally: false, slab24: 100, slab12: 50, slab0: 0 }
  });

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelBookingTarget, setCancelBookingTarget] = useState(null);
  const [cancelRefundDetails, setCancelRefundDetails] = useState({ refundPercent: 0, refundAmount: 0, hoursRemaining: 0 });
  const [cancelReason, setCancelReason] = useState('Maintenance');
  const [cancelCustomReason, setCancelCustomReason] = useState('');

  const getHoursBeforeSlot = (bTime, bDate) => {
    const dayNum = parseInt(bDate.replace(/\D/g, '')) || selectedDay;
    const currentDay = selectedDay;
    const [currH, currM] = simulatedTime.split(':').map(Number);
    
    let timeStr = bTime.split(' ')[0];
    let ampm = bTime.split(' ')[1] || 'AM';
    let [bH, bM] = timeStr.split(':').map(Number);
    if (ampm === 'PM' && bH !== 12) bH += 12;
    if (ampm === 'AM' && bH === 12) bH = 0;
    
    const currentTotalMins = currentDay * 24 * 60 + currH * 60 + currM;
    const bookingTotalMins = dayNum * 24 * 60 + bH * 60 + bM;
    
    const diffMins = bookingTotalMins - currentTotalMins;
    return diffMins / 60;
  };
  const [guestRates, setGuestRates] = useState({
    'Downtown Hub': { peak: 400, nonPeak: 200 },
    'Uptown Arena': { peak: 450, nonPeak: 250 },
    'East Coast Courts': { peak: 350, nonPeak: 180 }
  });
  const [guestViewTab, setGuestViewTab] = useState('bookings'); // 'bookings' | 'settings'
  const [isDesktopLayout, setIsDesktopLayout] = useState(typeof window !== 'undefined' ? window.innerWidth >= 768 : false);
  const [desktopTab, setDesktopTab] = useState('dashboard'); // dashboard | members | groups | ledger
  const [showCreateGroupForm, setShowCreateGroupForm] = useState(false);
  const [groupCategoryTab, setGroupCategoryTab] = useState('morning'); // morning | afternoon | evening
  const [authState, setAuthState] = useState('loggedIn'); // loggedOut | biometricsPrompt | loggedIn
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [guestSuccessOverlay, setGuestSuccessOverlay] = useState(false);
  const [memberCheckInOverlay, setMemberCheckInOverlay] = useState(false);
  const [scanError, setScanError] = useState(false);

  const [members, setMembers] = useState(() => {
    const saved = localStorage.getItem('smashsync_members');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map(m => {
        if (!m.paymentHistory) {
          return {
            ...m,
            paymentHistory: {
              'Jul 2026': 'Paid',
              'Aug 2026': m.paymentStatus || 'Pending',
              'Sep 2026': 'Pending'
            }
          };
        }
        return m;
      });
    }
    return INITIAL_MEMBERS;
  });

  // User payment status state
  const userPaymentPaid = members.find(m => m.id === 'm1')?.paymentHistory?.[globalLedgerMonth] === 'Paid';

  // Notification Permission State
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  // Keep localStorage sync'ed
  useEffect(() => {
    localStorage.setItem('smashsync_members', JSON.stringify(members));
  }, [members]);

  useEffect(() => {
    localStorage.setItem('smashsync_theme', theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('jbc_groups', JSON.stringify(groups));
  }, [groups]);
  // Resize listener to switch layouts automatically
  useEffect(() => {
    const handleResize = () => {
      setIsPreviewFullWidth(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // Sync temporary assignments when switching active group or tab views
  useEffect(() => {
    const activeG = groups.find(g => g.id === activeGroupAssignmentId);
    if (activeG) {
      setTempAssignedMemberIds(activeG.memberIds || []);
    }
  }, [activeGroupAssignmentId, groups, groupSubTab]);
  // Unified State Syncing: Clean up dead member references from hourly groups when members list is updated
  useEffect(() => {
    const memberIds = new Set(members.map(m => m.id));
    setGroups(prev => prev.map(g => {
      const filtered = g.memberIds.filter(id => memberIds.has(id));
      if (filtered.length !== g.memberIds.length) {
        return { ...g, memberIds: filtered };
      }
      return g;
    }));
  }, [members]);

  // Auto-sync selected day to the simulated day on simulation toggle
  useEffect(() => {
    const simulatedTodayDay = simulatedDay === 'due' ? 11 : 5;
    setSelectedDay(simulatedTodayDay);
    setCurrentMonthIndex(7); // Force August
    setCurrentYear(2026); // Force 2026
  }, [simulatedDay]);

  const todayDay = simulatedDay === 'due' ? 11 : 5;

  // Navigate with custom bounce loader
  const navigateTo = (screen) => {
    setIsLoading(true);
    setTimeout(() => {
      setCurrentScreen(screen);
      setIsLoading(false);
    }, 600);
  };

  // Reset system variables
  const handleResetData = (e) => {
    if (e && !e.isTrusted) return; // Prevent Responsively App click-sync from resetting state
    localStorage.removeItem('smashsync_members');
    setMembers(INITIAL_MEMBERS.map(m => m.id === 'm1' ? { ...m, paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Pending', 'Sep 2026': 'Pending' }, rsvpStatus: 'Pending' } : m));
    setSimulatedTime('17:15');
    setSimulatedDay('due');
    setSelectedDay(11);
    setCurrentMonthIndex(7);
    setCurrentYear(2026);
    setActiveBroadcasts([
      { id: 1, type: 'Alert', content: 'Court 2 nets have been re-tensioned today.', date: 'Today' }
    ]);
    alert('Local state has been reset to pristine default values.');
  };

  // Convert simulated clock string "17:15" into a minutes value for easy logic checks
  const getMinutes = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const currentMinutes = getMinutes(simulatedTime);
  const cutoffMinutes = 18 * 60; // 6:00 PM in minutes
  const isLocked = currentMinutes >= cutoffMinutes;
  const timeRemaining = Math.max(0, cutoffMinutes - currentMinutes);

  // Get current user (Rahul K.) rsvp status
  const currentUserObj = members.find(m => m.id === 'm1');
  const userRsvp = currentUserObj ? currentUserObj.rsvpStatus : 'Pending';

  // Combine past history with today status dynamically (filtered up to simulated today to keep stats in sync)
  const calendarData = {};
  Object.keys(INITIAL_CALENDAR_HISTORY).forEach(d => {
    const dayNum = parseInt(d);
    if (dayNum <= todayDay) {
      calendarData[dayNum] = INITIAL_CALENDAR_HISTORY[dayNum];
    }
  });

  // Fill in past Monday-to-Saturday session days with 'Absent' if they are missing
  for (let d = 1; d < todayDay; d++) {
    const date = new Date(2026, 7, d);
    const dayOfWeek = date.getDay();
    const isSessionDay = dayOfWeek >= 1 && dayOfWeek <= 6; // Monday to Saturday
    if (isSessionDay && !calendarData[d]) {
      calendarData[d] = { status: 'Absent', time: 'Evening 7:00 PM', court: 'Court 2' };
    }
  }

  // Map today's RSVP status to active simulated today day
  if (userRsvp === 'Present') {
    calendarData[todayDay] = { status: 'Present', time: 'Evening 7:00 PM', court: 'Court 2' };
  } else if (userRsvp === 'Maybe') {
    calendarData[todayDay] = { status: 'Maybe', time: 'Evening 7:00 PM', court: 'Court 2' };
  } else if (userRsvp === 'No' || isLocked) {
    calendarData[todayDay] = { status: 'Absent', time: 'Evening 7:00 PM', court: 'Court 2' };
  }

  // Calculate dynamic stats from all Monday-to-Saturday session days up to todayDay
  const sessionDaysUpToToday = [];
  for (let d = 1; d <= todayDay; d++) {
    const date = new Date(2026, 7, d);
    const dayOfWeek = date.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 6) {
      sessionDaysUpToToday.push(d);
    }
  }

  let presentCount = 0;
  let absentCount = 0;
  let maybeCount = 0;

  sessionDaysUpToToday.forEach(d => {
    const dayData = calendarData[d];
    if (dayData) {
      if (dayData.status === 'Present') presentCount++;
      else if (dayData.status === 'Absent') absentCount++;
      else if (dayData.status === 'Maybe') maybeCount++;
    } else {
      if (d === todayDay && userRsvp === 'Pending' && !isLocked) {
        // Excluded from rating until locked
      } else {
        absentCount++;
      }
    }
  });

  const totalRated = presentCount + absentCount;
  const attendanceRate = totalRated > 0 ? ((presentCount / totalRated) * 100).toFixed(1) : '100.0';

  // Set user RSVP status (Present, Maybe, Pending)
  const handleSetRsvpStatus = (status) => {
    if (isLocked) return;

    setMembers(prev => prev.map(m => {
      if (m.id === 'm1') {
        const formattedCheckIn = (status === 'Present' || status === 'Maybe') ? formatTime(simulatedTime) : null;
        return { ...m, rsvpStatus: status, checkInTime: formattedCheckIn };
      }
      return m;
    }));

    if (status === 'Present') {
      triggerLocalNotificationDemo(
        'Attendance Registered Successfully! 🟢',
        'You are confirmed for Evening 7:00 PM Batch on Court 2.'
      );
    } else if (status === 'Maybe') {
      triggerLocalNotificationDemo(
        'Maybe Check-in Logged 🟡',
        'You are marked as Maybe for the Evening 7:00 PM Batch.'
      );
    } else if (status === 'No') {
      triggerLocalNotificationDemo(
        'Not Attending Registered 🔴',
        'You have marked yourself as Not Attending today.'
      );
    }
  };

  // Helper to format 24h string into AM/PM
  const formatTime = (time24) => {
    const [h, m] = time24.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    const displayMin = m < 10 ? `0${m}` : m;
    return `${displayHour}:${displayMin} ${ampm}`;
  };

  // Request Device Notification Engine Access
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('This mobile browser platform does not support native push testing.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        triggerLocalNotificationDemo(
          'Permissions Enabled! 🎉',
          'JBC will notify you 15 minutes before your batch cutoff locks.'
        );
      }
    } catch (err) {
      console.error('Permission requesting execution boundary fault:', err);
    }
  };

  // Immediate Local Notification Execution Hook
  const triggerLocalNotificationDemo = (title, body) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body: body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            vibrate: [100, 50, 100]
          });
        });
      } else {
        new Notification(title, { body });
      }
    }
  };

  // Dispatch global communication broadcast alert
  const triggerBroadcast = (e) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    setActiveBroadcasts([
      { id: Date.now(), type: 'Broadcast', content: broadcastMessage, date: 'Just Now' },
      ...activeBroadcasts
    ]);
    setBroadcastMessage('');
    setDismissedBroadcast(false);
    alert('Broadcast sent instantly to all active member dashboards!');
  };

  // Remind single member of overdue fee
  const pingIndividualPayment = (playerName) => {
    alert(`⚡ Payment notification reminder pinged directly to ${playerName}'s device!`);
  };

  // Remind all unpaid members at once via push broadcast
  const pingAllPayments = () => {
    alert('⚡ Bulk payment reminders broadcasted successfully to all pending members!');
  };

  // Mark personal monthly payment as settled
  const handleAuthorizePayment = () => {
    setMembers(prev => prev.map(m => {
      if (m.id === 'm1') {
        return { ...m, paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Paid', 'Sep 2026': 'Pending' } };
      }
      return m;
    }));
    alert('Payment processed successfully via Mock Gateway! August Subscription has been logged as Paid.');
  };

  // Google OAuth Login simulation handler
  // Dynamic total monthly fee calculator
  // Export hourly court assignments matrix to CSV
  const handleDownloadGroupMatrix = () => {
    let csvContent = 'Group Name,Court,Time Slot,Monthly Fee (INR),Member Count,Assigned Members\n';
    groups.forEach(g => {
      const assignedNames = g.memberIds
        .map(id => members.find(m => m.id === id)?.name || '')
        .filter(Boolean)
        .join('; ');
      
      const groupName = `"${g.name.replace(/"/g, '""')}"`;
      const timeSlot = `"${g.hour.replace(/"/g, '""')}"`;
      const escapedMembers = `"${assignedNames.replace(/"/g, '""')}"`;
      
      csvContent += `${groupName},${g.court},${timeSlot},${g.fee},${g.memberIds.length},${escapedMembers}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'JBC_Court_Assignments_Matrix.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Classify hourly time slots by category tabs
  // Calculate simulated monthly attendance stats
  const getMemberGroupAttendance = (memberId, groupId) => {
    const combinedKey = `${memberId}_${groupId}`;
    const hash = combinedKey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const attended = (hash % 5) + 6; // Attended between 6 and 10 sessions
    const total = 12; // Total sessions in August
    return { attended, total, percentage: Math.round((attended / total) * 100) };
  };

  const getGroupCategory = (hourString) => {
    const h = hourString.toLowerCase();
    if (h.includes('am')) return 'morning';
    if (h.includes('12:00 pm') || h.includes('01:00 pm') || h.includes('02:00 pm') || h.includes('03:00 pm') || h.includes('04:00 pm')) return 'afternoon';
    return 'evening';
  };


  // Badminton Background Pattern
  const badmintonBgStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='120' height='120' viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%2310b981' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' stroke-opacity='${theme === 'dark' ? '0.08' : '0.15'}'%3E%3Cpath d='M25 40 L15 15 L35 15 Z'/%3E%3Cpath d='M20 40 A5 5 0 0 0 30 40'/%3E%3Cline x1='20' y1='25' x2='30' y2='25'/%3E%3Cline x1='18' y1='32' x2='32' y2='32'/%3E%3Cellipse cx='80' cy='80' rx='12' ry='18' transform='rotate(45 80 80)'/%3E%3Cline x1='68' y1='92' x2='50' y2='110'/%3E%3Cline x1='56' y1='104' x2='48' y2='112'/%3E%3Cline x1='75' y1='70' x2='85' y2='90' stroke-width='0.5'/%3E%3Cline x1='70' y1='75' x2='90' y2='85' stroke-width='0.5'/%3E%3C/g%3E%3C/svg%3E")`,
    backgroundSize: '120px 120px',
  };


  const renderGlobalOverlays = () => (
    <>
      <style>{`
        @keyframes rallyBounce {
          0% { transform: translate(-40px, 10px) rotate(-60deg); }
          25% { transform: translate(0px, -40px) rotate(0deg); }
          50% { transform: translate(40px, 10px) rotate(60deg); }
          75% { transform: translate(0px, -40px) rotate(0deg); }
          100% { transform: translate(-40px, 10px) rotate(-60deg); }
        }
        @keyframes goldPulse {
          0% { transform: scale(0.9); filter: drop-shadow(0 0 10px rgba(250,204,21,0.5)); }
          50% { transform: scale(1.1); filter: drop-shadow(0 0 40px rgba(250,204,21,0.9)); }
          100% { transform: scale(0.9); filter: drop-shadow(0 0 10px rgba(250,204,21,0.5)); }
        }
        @keyframes smashWindup {
          0% { transform: rotate(0deg) translateY(0); }
          30% { transform: rotate(-50deg) translateY(-20px); }
          50% { transform: rotate(60deg) translateY(50px); }
          100% { transform: rotate(60deg) translateY(50px); }
        }
        @keyframes smashImpact {
          0%, 45% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 0; transform: scale(2); }
        }
        @keyframes shootDown {
          0%, 45% { opacity: 0; transform: translateY(-50px); }
          50% { opacity: 1; transform: translateY(10px); }
          100% { opacity: 0; transform: translateY(150px); }
        }
      `}</style>

      {/* 1. The Rally - Loader */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-48 h-48 flex items-center justify-center">
            {/* The Net */}
            <svg width="80" height="60" viewBox="0 0 80 60" className="absolute bottom-4 opacity-50">
              <rect x="38" y="0" width="4" height="60" fill="#10b981" />
              <path d="M 0 10 L 80 10 M 0 20 L 80 20 M 0 30 L 80 30" stroke="#10b981" strokeWidth="2" strokeDasharray="4 4" />
            </svg>
            {/* The Shuttlecock bouncing */}
            <div style={{ animation: 'rallyBounce 1.2s infinite ease-in-out' }}>
              <svg width="40" height="40" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                <g fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M35 50 L15 15 L55 15 Z" fill="#10b981" fillOpacity="0.2"/>
                  <path d="M25 50 A10 10 0 0 0 45 50" fill="#10b981" />
                  <line x1="25" y1="30" x2="45" y2="30" />
                </g>
              </svg>
            </div>
            <div className="absolute bottom-0 text-emerald-400 font-bold tracking-widest text-xs uppercase animate-pulse">Processing...</div>
          </div>
        </div>
      )}

      {/* 2. The Golden Shuttle - Booking Success */}
      {guestSuccessOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md animate-fadeIn" onClick={() => setGuestSuccessOverlay(false)}>
          <div className="flex flex-col items-center gap-6">
            <div style={{ animation: 'goldPulse 2s infinite ease-in-out' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                <g fill="none" stroke="#facc15" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M35 80 L15 20 L85 20 L65 80 Z" fill="#facc15" fillOpacity="0.3"/>
                  <path d="M35 80 A15 15 0 0 0 65 80" fill="#facc15" />
                  <line x1="30" y1="45" x2="70" y2="45" />
                  <line x1="25" y1="65" x2="75" y2="65" />
                </g>
              </svg>
            </div>
            <h2 className="text-3xl font-black text-yellow-400 tracking-tight text-center">Booking Confirmed!</h2>
            <p className="text-yellow-400/70 font-bold tracking-widest uppercase text-sm">Court Secured</p>
          </div>
        </div>
      )}

      {/* 3. The Court Smasher - Member Check-In */}
      {memberCheckInOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/90 backdrop-blur-md animate-fadeIn" onClick={() => setMemberCheckInOverlay(false)}>
          <div className="relative flex flex-col items-center justify-center w-64 h-64">
            {/* Racket Winding up and smashing */}
            <div className="absolute" style={{ animation: 'smashWindup 1.5s ease-in-out forwards', transformOrigin: 'bottom right' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                <g fill="none" stroke="#34d399" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="60" cy="40" rx="25" ry="35" fill="#34d399" fillOpacity="0.1" />
                  <line x1="60" y1="75" x2="60" y2="110" />
                  <line x1="52" y1="110" x2="68" y2="110" />
                  <line x1="45" y1="25" x2="75" y2="55" strokeWidth="1" />
                  <line x1="45" y1="55" x2="75" y2="25" strokeWidth="1" />
                </g>
              </svg>
            </div>
            {/* Shuttlecock shooting down */}
            <div className="absolute" style={{ animation: 'shootDown 1.5s ease-in forwards' }}>
              <svg width="40" height="40" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                <g fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M35 50 L15 15 L55 15 Z" fill="#fff"/>
                  <path d="M25 50 A10 10 0 0 0 45 50" fill="#fff" />
                </g>
              </svg>
            </div>
            {/* Impact Shatter */}
            <div className="absolute bottom-0" style={{ animation: 'smashImpact 1.5s ease-out forwards' }}>
              <svg width="160" height="60" viewBox="0 0 160 60" xmlns="http://www.w3.org/2000/svg">
                <g stroke="#10b981" strokeWidth="4" strokeLinecap="round">
                  <line x1="80" y1="30" x2="20" y2="10" />
                  <line x1="80" y1="30" x2="40" y2="50" />
                  <line x1="80" y1="30" x2="140" y2="10" />
                  <line x1="80" y1="30" x2="120" y2="50" />
                </g>
              </svg>
            </div>
            <div className="absolute -bottom-16 text-center w-full">
              <h2 className="text-2xl font-black text-emerald-400 tracking-tighter italic" style={{ animation: 'smashImpact 1.5s ease-out forwards' }}>TIME TO SMASH IT!</h2>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Render premium, high-density desktop admin dashboard
  const renderAdminDesktopDashboard = () => {
    const activeGroup = groups.find(g => g.id === activeGroupAssignmentId);
    const originalIds = activeGroup ? activeGroup.memberIds : [];
    
    // Ledger filtering
    const unpaidMembers = members.filter(m => m.paymentHistory?.[globalLedgerMonth] !== 'Paid');
    const ledgerMembers = ledgerFilter === 'unpaid' ? unpaidMembers : members;

    return (
      <>
      {renderGlobalOverlays()}
      <div style={badmintonBgStyle} className={`min-h-screen flex font-sans transition-all duration-350 ${
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
      }`}>
        {/* Desktop Sidebar */}
        <aside className={`border-r flex flex-col shrink-0 transition-all duration-300 ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        } ${
          isDark ? 'bg-[#0f1b14] border-emerald-950/40 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div className="p-5 border-b border-emerald-800/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shrink-0 font-black text-slate-950">J</div>
              {!isSidebarCollapsed && (
                <div className="animate-fadeIn">
                  <span className="font-extrabold text-sm tracking-wider block whitespace-nowrap">JBC Badminton</span>
                  <span className="text-[9px] text-emerald-500 uppercase tracking-widest font-black block">Club Console</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1 rounded-lg hover:bg-emerald-500/10 text-emerald-500 transition cursor-pointer shrink-0 border-none bg-transparent"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
          
          <nav className={`flex-1 p-4 space-y-1 ${isSidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
            <button
              onClick={() => setDesktopTab('dashboard')}
              className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center cursor-pointer ${
                isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-2.5 text-left'
              } ${
                desktopTab === 'dashboard'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : `hover:bg-emerald-500/10 ${isDark ? 'text-slate-355' : 'text-slate-600'}`
              }`}
              title="Dashboard Overview"
            >
              <Building2 className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span className="animate-fadeIn">Dashboard Overview</span>}
            </button>
            
            <button
              onClick={() => setDesktopTab('members')}
              className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center cursor-pointer ${
                isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-2.5 text-left'
              } ${
                desktopTab === 'members'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : `hover:bg-emerald-500/10 ${isDark ? 'text-slate-355' : 'text-slate-600'}`
              }`}
              title="Manage Members"
            >
              <Users className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span className="animate-fadeIn">Manage Members</span>}
            </button>

            <button
              onClick={() => setDesktopTab('groups')}
              className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center cursor-pointer ${
                isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-2.5 text-left'
              } ${
                desktopTab === 'groups'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : `hover:bg-emerald-500/10 ${isDark ? 'text-slate-355' : 'text-slate-600'}`
              }`}
              title="Manage Court Groups"
            >
              <FolderPlus className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span className="animate-fadeIn">Manage Court Groups</span>}
            </button>

            <button
              onClick={() => setDesktopTab('ledger')}
              className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center cursor-pointer ${
                isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-2.5 text-left'
              } ${
                desktopTab === 'ledger'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : `hover:bg-emerald-500/10 ${isDark ? 'text-slate-355' : 'text-slate-600'}`
              }`}
              title="Subscription Ledger"
            >
              <DollarSign className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span className="animate-fadeIn">Subscription Ledger</span>}
            </button>
            
            <button
              onClick={() => setDesktopTab('guests')}
              className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center cursor-pointer ${
                isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-2.5 text-left'
              } ${
                desktopTab === 'guests'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : `hover:bg-emerald-500/10 ${isDark ? 'text-slate-355' : 'text-slate-600'}`
              }`}
              title="Guest Management"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span className="animate-fadeIn">Guest Management</span>}
            </button>
            <button
              onClick={() => setDesktopTab('inventory')}
              className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center cursor-pointer ${
                isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-2.5 text-left'
              } ${
                desktopTab === 'inventory'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : `hover:bg-emerald-500/10 ${isDark ? 'text-slate-355' : 'text-slate-600'}`
              }`}
              title="Inventory Grid"
            >
              <Calendar className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span className="animate-fadeIn">Inventory</span>}
            </button>
          </nav>
          
          {/* Quick Simulation controls widget inside desktop sidebar */}
          {!isSidebarCollapsed ? (
            <div className="p-4 border-t border-emerald-800/10 space-y-3.5 animate-fadeIn">
              <span className="text-[10px] uppercase font-black tracking-wider text-emerald-500 block">Console Controls</span>
              
              {/* Viewport toggle simulation */}
              <div className="space-y-1">
                <span className="text-[9px] opacity-75 font-bold block">Preview Viewport</span>
                <div className="grid grid-cols-2 gap-1 bg-slate-900/50 p-0.5 rounded-lg border border-emerald-950/20">
                  <button
                    onClick={() => setIsPreviewFullWidth(false)}
                    className={`py-1 text-[9px] font-bold rounded cursor-pointer text-center transition ${
                      !isPreviewFullWidth ? 'bg-emerald-500 text-slate-950 font-extrabold' : 'text-slate-400'
                    }`}
                  >
                    Mobile
                  </button>
                  <button
                    onClick={() => setIsPreviewFullWidth(true)}
                    className={`py-1 text-[9px] font-bold rounded cursor-pointer text-center transition ${
                      isPreviewFullWidth ? 'bg-emerald-500 text-slate-950 font-extrabold' : 'text-slate-400'
                    }`}
                  >
                    Laptop
                  </button>
                </div>
              </div>

              {/* Simulated Date toggles */}
              <div className="space-y-1">
                <span className="text-[9px] opacity-75 font-bold block">Simulated Date</span>
                <div className="grid grid-cols-2 gap-1 bg-slate-900/50 p-0.5 rounded-lg border border-emerald-950/20">
                  <button
                    onClick={() => setSimulatedDay('current')}
                    className={`py-1 text-[9px] font-bold rounded cursor-pointer text-center transition ${
                      simulatedDay === 'current' ? 'bg-emerald-500 text-slate-950 font-extrabold' : 'text-slate-400'
                    }`}
                  >
                    Aug 05
                  </button>
                  <button
                    onClick={() => setSimulatedDay('due')}
                    className={`py-1 text-[9px] font-bold rounded cursor-pointer text-center transition ${
                      simulatedDay === 'due' ? 'bg-emerald-500 text-slate-950 font-extrabold' : 'text-slate-400'
                    }`}
                  >
                    Aug 11
                  </button>
                </div>
              </div>
              
              {/* Simulation clock controls */}
              <div className="space-y-1">
                <span className="text-[9px] opacity-75 font-bold block">Simulated Clock</span>
                <select
                  value={simulatedTime}
                  onChange={e => setSimulatedTime(e.target.value)}
                  className="w-full bg-[#0b140f] border border-emerald-950/40 rounded p-1.5 text-[10px] text-white focus:outline-none"
                >
                  <option value="17:15">5:15 PM (Grace)</option>
                  <option value="17:55">5:55 PM (Cutoff imminent)</option>
                  <option value="18:00">6:00 PM (Lobby Cutoff)</option>
                  <option value="18:15">6:15 PM (Locked)</option>
                </select>
              </div>
            </div>
          ) : (
            /* Collapsed settings widget trigger shortcut */
            <div className="p-4 border-t border-emerald-800/10 flex justify-center">
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(false)}
                className="p-2 rounded-xl bg-[#0b140f] border border-emerald-950/20 text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer"
                title="Expand Settings Panel"
              >
                ⚙️
              </button>
            </div>
          )}
        </aside>
        
        {/* Desktop Main Content container */}
        <div className="flex-1 flex flex-col min-w-0">
          
          {/* Top Navbar */}
          <header className={`px-6 py-4 border-b flex items-center justify-between transition-colors ${
            isDark ? 'bg-[#192c21]/90 border-emerald-800/10' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center">
              {isSidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="mr-3 p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-500 transition cursor-pointer border-none bg-transparent"
                  title="Expand Sidebar"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}
              <div>
                <h2 className="text-base font-black text-emerald-500 tracking-wide uppercase">
                  {desktopTab === 'dashboard' && 'Dashboard Console'}
                  {desktopTab === 'members' && 'Members Registry'}
                  {desktopTab === 'groups' && 'Court Hours Allocation'}
                  {desktopTab === 'ledger' && 'Subscription Balance Sheet'}
                  {desktopTab === 'guests' && 'Guest Booking Console'}
                </h2>
                <span className="text-[10px] text-slate-400">Date context: {simulatedDay === 'due' ? 'August 11, 2026 (Subscription Due)' : 'August 5, 2026 (Grace Stage)'}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Role Toggle Switcher */}
              <div className="flex bg-[#0b140f] p-1 rounded-lg text-[10px] font-bold border border-emerald-950/30">
                <button 
                  className="px-2.5 py-1 rounded transition-colors text-slate-450 hover:text-slate-200 cursor-pointer"
                  onClick={() => { setRole('member'); setCurrentScreen('slotDetails'); }}
                >
                  Member App
                </button>
                <button 
                  className="px-2.5 py-1 rounded bg-emerald-500 text-slate-950 font-black cursor-pointer"
                >
                  Admin Hub
                </button>
              </div>

              {/* Theme Toggle */}
              <button 
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className={`p-2 rounded-full border transition ${
                  isDark ? 'bg-slate-900 border-emerald-950/20 text-emerald-450 hover:bg-emerald-900/10' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {isDark ? '☀️' : '🌙'}
              </button>
              
              {/* Profile drop-down mockup */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-400">RK</div>
                <div className="text-left leading-none">
                  <span className="text-xs font-black block">Rahul K.</span>
                  <span className="text-[9px] text-slate-450">Club Admin</span>
                </div>
              </div>
            </div>
          </header>
          
          {/* Main Workspace Body */}
          <main className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* TAB PANEL 1: DASHBOARD OVERVIEW */}
            {desktopTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Occupancy Sub-tabs (Members vs Guests) */}
                <div className={`flex p-1 rounded-xl border max-w-sm text-xs ${isDark ? 'bg-[#0f1b14] border-emerald-950/20' : 'bg-slate-100 border-slate-200'}`}>
                  <button
                    type="button"
                    onClick={() => setOccupancyTab('members')}
                    className={`flex-1 py-2 text-center rounded-lg font-bold cursor-pointer transition ${
                      occupancyTab === 'members' ? (isDark ? 'bg-emerald-500 text-slate-950 font-black shadow-inner' : 'bg-emerald-500 text-white font-black shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')
                    }`}
                  >
                    👥 Member Occupancy
                  </button>
                  <button
                    type="button"
                    onClick={() => setOccupancyTab('guests')}
                    className={`flex-1 py-2 text-center rounded-lg font-bold cursor-pointer transition ${
                      occupancyTab === 'guests' ? (isDark ? 'bg-emerald-500 text-slate-950 font-black shadow-inner' : 'bg-emerald-500 text-white font-black shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')
                    }`}
                  >
                    🎟️ Guest Occupancy
                  </button>
                </div>

                {/* --- MEMBERS OCCUPANCY SUB-VIEW (DESKTOP) --- */}
                {occupancyTab === 'members' && (
                  <div className="space-y-6 animate-fadeIn">
                    {/* Metrics row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className={`p-4 rounded-2xl border flex flex-col justify-between ${styles.card}`}>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Attendance Rate</span>
                      <h3 className="text-2xl font-black text-emerald-500 mt-1">{attendanceRate}%</h3>
                    </div>
                    <span className="text-[9px] text-slate-455 mt-1.5 block font-mono">Present counts vs absent roster</span>
                  </div>
                  <div className={`p-4 rounded-2xl border flex flex-col justify-between ${styles.card}`}>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Court Groups</span>
                      <h3 className="text-2xl font-black text-emerald-500 mt-1">
                        {groups.length} <span className="text-xs font-normal text-slate-400">Groups</span>
                      </h3>
                    </div>
                    <span className="text-[9px] text-slate-455 mt-1.5 block font-mono">Categorized across shifts</span>
                  </div>
                  <div className={`p-4 rounded-2xl border flex flex-col justify-between ${styles.card}`}>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Total Members</span>
                      <h3 className="text-2xl font-black text-emerald-500 mt-1">
                        {members.length} <span className="text-xs font-normal text-slate-400">Members</span>
                      </h3>
                    </div>
                    <span className="text-[9px] text-slate-455 mt-1.5 block font-mono">Rates auto-calculated</span>
                  </div>
                  <div className={`p-4 rounded-2xl border flex flex-col justify-between ${styles.card}`}>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Subscription Dues</span>
                      <h3 className="text-2xl font-black text-rose-500 mt-1">₹{unpaidMembers.reduce((sum, m) => sum + getMemberMonthlyRate(m.id), 0).toLocaleString()}</h3>
                    </div>
                    <span className="text-[9px] text-slate-455 mt-1.5 block font-mono">{unpaidMembers.length} Unpaid remaining</span>
                  </div>
                </div>

                {/* Sub-sections grid layout */}
                <div className="grid grid-cols-3 gap-6">
                  {/* Active Slots list (Col span 2) */}
                  <div className={`col-span-2 p-5 rounded-2xl border space-y-4 ${styles.card}`}>
                    <h3 className="text-sm font-black uppercase text-emerald-500 tracking-wider">Active Time Slots (Today)</h3>
                    <div className="space-y-3">
                      {['06:00 AM', '07:00 AM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM'].map(time => {
                        const cutoffHour = parseInt(time.split(':')[0]) - 1;
                        const isAm = time.includes('AM');
                        const formatCutoff = `${cutoffHour}:00 ${isAm ? 'AM' : 'PM'}`;
                        
                        // Parse clock
                        const [cHour] = simulatedTime.split(':').map(Number);
                        const isLobbyClosed = !isAm && cHour >= 18;
                        
                        return (
                          <div key={time} className={`p-4 rounded-xl border flex items-center justify-between ${
                            isLobbyClosed ? 'bg-rose-500/5 border-rose-500/10 opacity-70' : 'bg-slate-900/20 border-emerald-950/30'
                          }`}>
                            <div>
                              <h4 className="text-sm font-black">{time} Slot</h4>
                              <p className="text-[10px] opacity-75 mt-0.5">Cutoff check-in gate: {formatCutoff}</p>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${
                              isLobbyClosed ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            }`}>
                              {isLobbyClosed ? '🔒 Check-in Closed' : '🟢 Check-in Open'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Roster sidebar summary */}
                  <div className={`p-5 rounded-2xl border space-y-4 ${styles.card}`}>
                    <h3 className="text-sm font-black uppercase text-emerald-500 tracking-wider">Active Roster Check-ins</h3>
                    <div className="space-y-2 max-h-[480px] overflow-y-auto divide-y divide-emerald-900/10">
                      {members.map(member => (
                        <div key={member.id} className="py-2.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold block">{member.name}</span>
                            <span className="text-[9px] opacity-75 font-mono">{member.mobile}</span>
                          </div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                            member.rsvpStatus === 'Present'
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              : member.rsvpStatus === 'Maybe'
                              ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                          }`}>
                            {member.rsvpStatus === 'Present' ? 'Attending' : member.rsvpStatus === 'Maybe' ? 'Maybe' : 'Absent'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                  </div>
                )}
                
                {/* --- GUEST OCCUPANCY SUB-VIEW (DESKTOP) --- */}
                {occupancyTab === 'guests' && (
                  <div className="space-y-6 animate-fadeIn">
                    {/* Metrics row */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className={`p-4 rounded-2xl border flex flex-col justify-between ${styles.card}`}>
                        <div>
                          <span className="text-[10px] text-slate-405 block font-bold uppercase tracking-wider">Total Guests Today</span>
                          <h3 className="text-2xl font-black text-emerald-500 mt-1">
                            {guests.filter(g => g.status === 'Booked').length}
                          </h3>
                        </div>
                        <span className="text-[9px] text-slate-455 mt-1.5 block font-mono font-semibold">Approved bookings checked in</span>
                      </div>
                      <div className={`p-4 rounded-2xl border flex flex-col justify-between ${styles.card}`}>
                        <div>
                          <span className="text-[10px] text-slate-405 block font-bold uppercase tracking-wider">Guest Slots</span>
                          <h3 className="text-2xl font-black text-emerald-500 mt-1">
                            {(guestSlots[selectedBranch] || []).length} <span className="text-xs font-normal text-slate-400">Active</span>
                          </h3>
                        </div>
                        <span className="text-[9px] text-slate-455 mt-1.5 block font-mono font-semibold">Scheduled across shifts</span>
                      </div>
                      <div className={`p-4 rounded-2xl border flex flex-col justify-between ${styles.card}`}>
                        <div>
                          <span className="text-[10px] text-slate-405 block font-bold uppercase tracking-wider">Guest Utilization</span>
                          <h3 className="text-2xl font-black text-emerald-500 mt-1">
                            {(((guests.filter(g => g.status === 'Booked').length) / (((guestSlots[selectedBranch] || []).length * 8) || 16)) * 100).toFixed(1)}%
                          </h3>
                        </div>
                        <span className="text-[9px] text-slate-455 mt-1.5 block font-mono font-semibold">Capacity check by slots</span>
                      </div>
                      <div className={`p-4 rounded-2xl border flex flex-col justify-between ${styles.card}`}>
                        <div>
                          <span className="text-[10px] text-slate-405 block font-bold uppercase tracking-wider">Dues Collected</span>
                          <h3 className="text-2xl font-black text-emerald-500 mt-1">
                            ₹{guests.filter(g => g.status === 'Booked').reduce((sum, g) => sum + (g.type === 'Peak' ? (guestRates[selectedBranch]?.peak || 0) : (guestRates[selectedBranch]?.nonPeak || 0)), 0).toLocaleString()}
                          </h3>
                        </div>
                        <span className="text-[9px] text-slate-455 mt-1.5 block font-mono font-semibold">Calculated for {selectedBranch}</span>
                      </div>
                    </div>

                    {/* Sub-sections grid layout */}
                    <div className="grid grid-cols-3 gap-6">
                      {/* Guest Slot Monitor (Col span 2) */}
                      <div className={`col-span-2 p-5 rounded-2xl border space-y-4 ${styles.card}`}>
                        <h3 className="text-sm font-black uppercase text-emerald-500 tracking-wider">Upcoming Guest Slot Monitor</h3>
                        <div className="space-y-3">
                          {(guestSlots[selectedBranch] || []).length === 0 ? (
                            <div className="text-center py-6 text-xs text-slate-500 italic">No scheduled guest slots configured.</div>
                          ) : (
                            guestSlots[selectedBranch].map((slot, idx) => {
                              const confirmed = guests.filter(g => g.status === 'Booked' && g.time === slot.time).length;
                              
                              const currentHour = parseInt(simulatedTime.split(':')[0]);
                              const slotHour = parseInt(slot.time.split(':')[0]) + (slot.time.includes('PM') && slot.time.split(':')[0] !== '12' ? 12 : 0);
                              const slotLocked = currentHour > slotHour;

                              return (
                                <div key={idx} className={`p-4 rounded-xl border flex items-center justify-between ${
                                  slotLocked ? 'bg-rose-500/5 border-rose-500/10 opacity-70' : 'bg-slate-900/20 border-emerald-955/35'
                                }`}>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-sm font-black">{slot.time} Slot</h4>
                                      <span className={`text-[8px] font-extrabold px-1 rounded border ${
                                        slot.type === 'Peak' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                      }`}>
                                        {slot.type}
                                      </span>
                                    </div>
                                    <p className="text-[10px] opacity-75 mt-0.5">Recurrence details: {slot.recurrence === 'Weekly' ? `Weekly (${slot.details})` : slot.recurrence}</p>
                                  </div>
                                  
                                  <div className="flex items-center gap-3 text-right">
                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                                      confirmed > 0 ? 'bg-rose-500/10 text-rose-550 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    }`}>
                                      {confirmed > 0 ? '🔴 Booked' : '🟢 Vacant'}
                                    </span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${
                                      slotLocked ? 'bg-rose-500/10 text-rose-550 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    }`}>
                                      {slotLocked ? '🔒 Closed' : '🟢 Active'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Live Guest Allocation (Col span 1) */}
                      <div className={`p-5 rounded-2xl border space-y-4 ${styles.card}`}>
                        <h3 className="text-sm font-black uppercase text-emerald-500 tracking-wider">Live Guest Allocation</h3>
                        <div className="space-y-3">
                          {['Court 1', 'Court 2'].map(court => {
                            const activeRes = guests.find(g => g.court === court && g.status === 'Booked');
                            const hasBooking = !!activeRes;

                            return (
                              <div key={court} className={`p-4.5 rounded-xl border flex flex-col gap-2.5 transition-colors ${
                                hasBooking ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-slate-900/10 border-slate-800/10'
                              }`}>
                                <div className="flex justify-between items-center">
                                  <div>
                                    <span className="font-bold block text-xs">{court}</span>
                                    <span className="text-[9px] opacity-75 font-mono">
                                      {hasBooking ? `Booked: ${activeRes.name}` : 'Vacant / Available'}
                                    </span>
                                  </div>
                                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                                    hasBooking ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                  }`}>
                                    {hasBooking ? 'Reserved' : 'Open'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
      
              </div>
            )}

            {/* TAB PANEL 2: MANAGE MEMBERS */}
            {desktopTab === 'members' && (
              <div className="grid grid-cols-3 gap-6">
                {/* Column 1: Add Member Form */}
                <div className={`p-5 rounded-2xl border space-y-4 h-fit ${styles.card}`}>
                  <h3 className="text-xs font-black text-emerald-500 uppercase tracking-wide flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4" /> Add Club Member
                  </h3>
                  
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = e.target.mname.value.trim();
                      const mobile = e.target.mmobile.value.trim();
                      const email = e.target.memail.value.trim();
                      const rate = parseFloat(e.target.mrate.value);

                      if (!name || !email) {
                        alert('Please fill in Name and Email fields.');
                        return;
                      }

                      const newM = {
                        id: `m${Date.now()}`,
                        name,
                        mobile: mobile || 'N/A',
                        email,
                        baseRate: rate,
                        rsvpStatus: 'Pending',
                        paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Pending', 'Sep 2026': 'Pending' },
                        checkInTime: null
                      };

                      setMembers(prev => [...prev, newM]);
                      alert(`Success! Member "${name}" has been registered.`);
                      e.target.reset();
                    }}
                    className="space-y-4 text-xs"
                  >
                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider block opacity-75">Full Name</label>
                      <input
                        name="mname"
                        type="text"
                        required
                        placeholder="Rahul K."
                        className={`w-full border rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium ${
                          isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-slate-50 border-slate-205 text-slate-800'
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider block opacity-75">Mobile Phone</label>
                      <input
                        name="mmobile"
                        type="text"
                        placeholder="+91 98765 43210"
                        className={`w-full border rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium ${
                          isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-slate-50 border-slate-205 text-slate-800'
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider block opacity-75">Email Address</label>
                      <input
                        name="memail"
                        type="email"
                        required
                        placeholder="rahul@gmail.com"
                        className={`w-full border rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium ${
                          isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-slate-50 border-slate-205 text-slate-800'
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider block opacity-75">Base Rate (₹/mo)</label>
                      <input
                        name="mrate"
                        type="number"
                        defaultValue="2000"
                        required
                        className={`w-full border rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono font-bold ${
                          isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-slate-50 border-slate-205 text-slate-800'
                        }`}
                      />
                    </div>
                    
                    <button
                      type="submit"
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer border-none shadow"
                    >
                      Commit Registration
                    </button>
                  </form>
                </div>

                {/* Column 2: Members Directory list */}
                <div className={`col-span-2 p-5 rounded-2xl border space-y-4 ${styles.card}`}>
                  <h3 className="text-xs font-black text-emerald-500 uppercase tracking-wide">Registered Club Members</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-emerald-800/10 text-slate-400 text-[10px] uppercase font-black tracking-wider">
                          <th className="py-2.5">Name</th>
                          <th className="py-2.5">Mobile</th>
                          <th className="py-2.5">Email</th>
                          <th className="py-2.5">Base Flat Rate</th>
                          <th className="py-2.5">Total Computed Dues</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-900/10">
                        {members.map(member => (
                          <tr key={member.id} className="hover:bg-emerald-500/5 transition">
                            <td className="py-3 font-bold">{member.name}</td>
                            <td className="py-3 font-mono opacity-80">{member.mobile}</td>
                            <td className="py-3 opacity-80">{member.email}</td>
                            <td className="py-3 font-mono font-bold">₹{member.baseRate.toLocaleString()}</td>
                            <td className="py-3 font-mono font-black text-emerald-500">₹{getMemberMonthlyRate(member.id).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB PANEL 3: COURT GROUPS MANAGER */}
            {desktopTab === 'groups' && (
              <div className="grid grid-cols-5 gap-6">
                {/* Column 1: Groups List & Group Creator (Col span 2) */}
                <div className="col-span-2 space-y-4">
                  {/* Collapsible creator card */}
                  <div className={`p-4 rounded-2xl border space-y-3.5 ${styles.card}`}>
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-black text-emerald-500 uppercase tracking-wide">Create Hourly Court Group</h3>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const name = e.target.gname.value.trim();
                        const court = e.target.gcourt.value;
                        const hour = e.target.ghour.value;
                        const fee = parseFloat(e.target.gfee.value);
                        const groupType = e.target.gtype.value;

                        if (!name) {
                          alert('Please specify a group name.');
                          return;
                        }

                        const newGroup = {
                          id: `g${Date.now()}`,
                          name,
                          court,
                          hour,
                          fee,
                          groupType,
                          memberIds: []
                        };

                        setGroups(prev => [...prev, newGroup]);
                        alert(`Success! Group "${name}" has been created.`);
                        e.target.reset();
                      }}
                      className="space-y-3 text-xs"
                    >
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold block opacity-75 uppercase">Group Name</label>
                        <input
                          name="gname"
                          type="text"
                          required
                          placeholder="e.g. Court 2 Morning Aces"
                          className={`w-full border rounded-xl p-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium ${
                            isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-slate-50 border-slate-205 text-slate-800'
                          }`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold block opacity-75 uppercase">Court</label>
                          <select
                            name="gcourt"
                            className={`w-full border rounded-xl p-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                              isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-white border-slate-205 text-slate-800'
                            }`}
                          >
                            <option value="Court 1">Court 1</option>
                            <option value="Court 2">Court 2</option>
                            <option value="Court 3">Court 3</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold block opacity-75 uppercase">Group Class</label>
                          <select
                            name="gtype"
                            onChange={(e) => {
                              const feeInput = e.target.form.gfee;
                              feeInput.value = e.target.value === 'Premium' ? '2000' : '1200';
                            }}
                            className={`w-full border rounded-xl p-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                              isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-white border-slate-205 text-slate-800'
                            }`}
                          >
                            <option value="Normal">Normal Group (₹1,200)</option>
                            <option value="Premium">Premium Group (₹2,000)</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold block opacity-75 uppercase">Time Slot</label>
                          <select
                            name="ghour"
                            className={`w-full border rounded-xl p-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                              isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-white border-slate-205 text-slate-800'
                            }`}
                          >
                            <option value="06:00 AM - 07:00 AM">06:00 AM - 07:00 AM</option>
                            <option value="07:00 AM - 08:00 AM">07:00 AM - 08:00 AM</option>
                            <option value="12:00 PM - 01:00 PM">12:00 PM - 01:00 PM</option>
                            <option value="01:00 PM - 02:00 PM">01:00 PM - 02:00 PM</option>
                            <option value="02:00 PM - 03:00 PM">02:00 PM - 03:00 PM</option>
                            <option value="05:00 PM - 06:00 PM">05:00 PM - 06:00 PM</option>
                            <option value="06:00 PM - 07:00 PM">06:00 PM - 07:00 PM</option>
                            <option value="07:00 PM - 08:00 PM">07:00 PM - 08:00 PM</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold block opacity-75 uppercase">Monthly Fee (₹)</label>
                          <input
                            name="gfee"
                            type="number"
                            defaultValue="1200"
                            required
                            className={`w-full border rounded-xl p-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono font-bold ${
                              isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-slate-50 border-slate-205 text-slate-800'
                            }`}
                          />
                        </div>
                      </div>
                      
                      <button
                        type="submit"
                        className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer border-none shadow"
                      >
                        Create Group
                      </button>
                    </form>
                  </div>

                  {/* Active hourly groups categorized by shifts */}
                  <div className={`p-4 rounded-2xl border space-y-3.5 ${styles.card}`}>
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-black text-emerald-500 uppercase tracking-wide">Active Groups Directory</h3>
                      <button
                        onClick={handleDownloadGroupMatrix}
                        className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-lg text-[9px] font-extrabold transition cursor-pointer flex items-center gap-1"
                      >
                        <FileSpreadsheet className="w-3 h-3" /> Export Matrix
                      </button>
                    </div>

                    <div className={`p-1 rounded-xl border flex gap-1 items-center transition-all ${
                      isDark ? 'bg-[#0f1b14] border-emerald-950/40' : 'bg-slate-100 border-slate-200'
                    }`}>
                      {['morning', 'afternoon', 'evening'].map(category => (
                        <button
                          key={category}
                          onClick={() => setGroupCategoryTab(category)}
                          className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition cursor-pointer text-center ${
                            groupCategoryTab === category
                              ? (isDark ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-white text-slate-800 shadow-sm')
                              : `${styles.textMuted}`
                          }`}
                        >
                          {category}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2.5 max-h-64 overflow-y-auto">
                      {groups.filter(g => getGroupCategory(g.hour) === groupCategoryTab).length === 0 ? (
                        <div className="text-center py-6 text-xs text-slate-450 border border-dashed rounded-xl border-emerald-950/20">
                          No hourly groups under the {groupCategoryTab} tab.
                        </div>
                      ) : (
                        groups
                          .filter(g => getGroupCategory(g.hour) === groupCategoryTab)
                          .map(group => (
                            <div 
                              key={group.id} 
                              onClick={() => {
                                setActiveGroupAssignmentId(group.id);
                                setTempAssignedMemberIds(group.memberIds || []);
                              }}
                              className={`p-3 rounded-xl border transition-all cursor-pointer text-left flex justify-between items-center ${
                                activeGroupAssignmentId === group.id
                                  ? 'bg-emerald-500/10 border-emerald-500'
                                  : `${styles.card} hover:border-emerald-500/25`
                              }`}
                            >
                              <div>
                                <h4 className="font-bold text-xs flex items-center gap-1.5">
                                  {group.name}
                                  <span className={`text-[8px] px-1 py-0.2 rounded font-extrabold uppercase ${
                                    group.groupType === 'Premium' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-500/10 text-slate-400'
                                  }`}>
                                    {group.groupType}
                                  </span>
                                </h4>
                                <span className="text-[9px] opacity-75 font-mono">{group.court} • {group.hour}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-mono text-emerald-500 text-xs font-bold block">₹{group.fee}</span>
                                <span className="text-[8px] opacity-60 block">{group.memberIds.length} players</span>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Column 2: Assign members (Col span 3) */}
                {/* Column 2: Assign members & Roster List (Col span 3) */}
                <div className={`col-span-3 p-5 rounded-2xl border space-y-4 h-fit ${styles.card}`}>
                  <div className="flex justify-between items-center pb-1 border-b border-emerald-800/10">
                    <div>
                      <h3 className="text-xs font-black text-emerald-500 uppercase tracking-wide">Group Roster Administration</h3>
                      <span className="text-[10px] text-slate-400">Target Group: <strong className="text-emerald-400">{activeGroup ? activeGroup.name : 'None selected'}</strong></span>
                    </div>
                    
                    {/* Sub-tab selection toggles */}
                    <div className="flex bg-[#0b140f] p-0.5 rounded-lg text-[9px] font-bold border border-emerald-950/20">
                      <button
                        type="button"
                        onClick={() => setDesktopGroupSubTab('assign')}
                        className={`px-2.5 py-1 rounded transition cursor-pointer ${
                          desktopGroupSubTab === 'assign' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-400'
                        }`}
                      >
                        Assignments
                      </button>
                      <button
                        type="button"
                        onClick={() => setDesktopGroupSubTab('attendance')}
                        className={`px-2.5 py-1 rounded transition cursor-pointer ${
                          desktopGroupSubTab === 'attendance' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-400'
                        }`}
                      >
                        Monthly Roster
                      </button>
                    </div>
                  </div>

                  {desktopGroupSubTab === 'assign' ? (
                    <div className="space-y-4">
                      <div className={`rounded-xl border max-h-[440px] overflow-y-auto divide-y divide-emerald-900/15 ${
                        isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-slate-50 border-slate-205 text-slate-800'
                      }`}>
                        {members.map(member => {
                          const isChecked = tempAssignedMemberIds.includes(member.id);
                          const isNewlySelected = isChecked && !originalIds.includes(member.id);
                          const highlightClass = isNewlySelected
                            ? (isDark ? 'bg-emerald-500/10 border-l-2 border-emerald-500' : 'bg-emerald-50/80 border-l-2 border-emerald-500')
                            : '';
                            
                          return (
                            <div key={member.id} className={`p-3 flex items-center justify-between text-xs transition-all ${highlightClass}`}>
                              <label className="flex items-center gap-3 cursor-pointer flex-1 py-1">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    setTempAssignedMemberIds(prev => {
                                      const exists = prev.includes(member.id);
                                      return exists ? prev.filter(id => id !== member.id) : [...prev, member.id];
                                    });
                                  }}
                                  className="w-4.5 h-4.5 accent-emerald-500 rounded cursor-pointer text-emerald-505 bg-slate-900 border-slate-700"
                                />
                                <div>
                                  <span className="font-bold text-xs block">{member.name}</span>
                                  <span className="text-[9px] opacity-70 font-mono block">{member.mobile}</span>
                                </div>
                              </label>
                              <div className="text-right">
                                <span className="font-mono text-emerald-505 font-bold block mt-0.5">
                                  Dynamic Rate: ₹{getMemberMonthlyRate(member.id).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Save/Cancel actions row */}
                      <div className="flex gap-2.5 pt-2 border-t border-emerald-850/20">
                        <button
                          type="button"
                          onClick={() => {
                            setGroups(prev => prev.map(g => {
                              if (g.id === activeGroupAssignmentId) {
                                return { ...g, memberIds: tempAssignedMemberIds };
                              }
                              return g;
                            }));
                            alert('Assignments changes saved and locked successfully!');
                          }}
                          className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer border-none shadow"
                        >
                          Save Changes
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeGroup) {
                              setTempAssignedMemberIds(activeGroup.memberIds || []);
                            }
                            alert('Discarded unsaved selection changes.');
                          }}
                          className={`px-6 py-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                            isDark 
                              ? 'bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 border-rose-500/20' 
                              : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                          }`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Attendance Performance Roster */
                    <div className="space-y-4">
                      {activeGroup && activeGroup.memberIds.length === 0 ? (
                        <div className="text-center py-12 text-xs text-slate-450 border border-dashed rounded-xl border-emerald-950/20">
                          No players assigned to this court group yet. Use the "Assignments" tab to enroll members.
                        </div>
                      ) : (
                        <div className="overflow-y-auto max-h-[500px]">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-emerald-800/10 text-slate-400 text-[10px] uppercase font-black tracking-wider">
                                <th className="py-2.5">Player Name</th>
                                <th className="py-2.5 text-center">Today</th>
                                <th className="py-2.5 text-center">Monthly Attendance</th>
                                <th className="py-2.5 text-right">Attendance Rate</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-emerald-900/10">
                              {members
                                .filter(m => activeGroup ? activeGroup.memberIds.includes(m.id) : false)
                                .map(m => {
                                  const stats = getMemberGroupAttendance(m.id, activeGroupAssignmentId);
                                  const isLowAttendance = stats.percentage < 60;
                                  
                                  return (
                                    <tr key={m.id} className="hover:bg-emerald-500/5 transition">
                                      <td className="py-3 font-bold">{m.name}</td>
                                      <td className="py-3 text-center">
                                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                                          m.rsvpStatus === 'Present'
                                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                            : m.rsvpStatus === 'Maybe'
                                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                            : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                        }`}>
                                          {m.rsvpStatus === 'Present' ? 'Yes' : m.rsvpStatus === 'Maybe' ? 'Maybe' : 'No'}
                                        </span>
                                      </td>
                                      <td className="py-3">
                                        <div className="flex items-center justify-center gap-3">
                                          <span className="font-mono font-bold w-10 text-center">{stats.attended} / {stats.total}</span>
                                          <div className={`w-24 h-1.5 rounded-full overflow-hidden border ${
                                            isDark ? 'bg-slate-950 border-emerald-950/20' : 'bg-slate-100 border-slate-205'
                                          }`}>
                                            <div
                                              className={`h-full transition-all duration-300 ${isLowAttendance ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                              style={{ width: `${stats.percentage}%` }}
                                            />
                                          </div>
                                        </div>
                                      </td>
                                      <td className={`py-3 font-mono font-extrabold text-right ${isLowAttendance ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {stats.percentage}%
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB PANEL 4: SUBSCRIPTION LEDGER */}
            {desktopTab === 'ledger' && (
              <div className="space-y-6">

                {/* Ledger Sub-tab Switch and Global Month Pills */}
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div className={`p-1 rounded-xl border flex gap-1 items-center w-fit transition-all ${
                    isDark ? 'bg-[#0f1b14] border-emerald-950/40' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <button
                      onClick={() => setLedgerSubTab('members')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition cursor-pointer ${
                        ledgerSubTab === 'members'
                          ? (isDark ? 'bg-emerald-500 text-slate-950' : 'bg-emerald-500 text-white shadow-sm')
                          : styles.textMuted
                      }`}
                    >
                      📋 Members Subscription
                    </button>
                    <button
                      onClick={() => setLedgerSubTab('guests')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition cursor-pointer ${
                        ledgerSubTab === 'guests'
                          ? (isDark ? 'bg-emerald-500 text-slate-950' : 'bg-emerald-500 text-white shadow-sm')
                          : styles.textMuted
                      }`}
                    >
                      🎟️ Guest Transactions
                    </button>
                  </div>
                  
                  <div className={`p-1 rounded-xl border flex gap-1 items-center transition-all ${
                    isDark ? 'bg-[#0f1b14] border-emerald-950/40' : 'bg-slate-100 border-slate-200'
                  }`}>
                    {['Jul 2026', 'Aug 2026', 'Sep 2026'].map(m => (
                      <button key={m} onClick={() => { setGlobalLedgerMonth(m); setGuestLedgerDateFrom(''); setGuestLedgerDateTo(''); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition cursor-pointer ${
                          globalLedgerMonth === m && !guestLedgerDateFrom
                            ? (isDark ? 'bg-emerald-500 text-slate-950' : 'bg-emerald-500 text-white shadow-sm')
                            : styles.textMuted
                        }`}>{m}</button>
                    ))}
                    <div className="relative">
                      <input 
                        type="month" 
                        title="Select Past Month"
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" onClick={(e) => { try { e.target.showPicker(); } catch(err) {} }}
                        onChange={(e) => {
                          if (e.target.value) {
                            const [y, m] = e.target.value.split('-');
                            const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10) - 1];
                            setGlobalLedgerMonth(`${mo} ${y}`);
                            setGuestLedgerDateFrom('');
                            setGuestLedgerDateTo('');
                          }
                        }}
                      />
                      <button className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition pointer-events-none ${!['Jul 2026', 'Aug 2026', 'Sep 2026'].includes(globalLedgerMonth) ? (isDark ? 'bg-emerald-500 text-slate-950' : 'bg-emerald-500 text-white shadow-sm') : styles.textMuted}`}>
                        {!['Jul 2026', 'Aug 2026', 'Sep 2026'].includes(globalLedgerMonth) ? globalLedgerMonth : '📅 More'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── MEMBERS SUBSCRIPTION VIEW ── */}
                {ledgerSubTab === 'members' && (<>
                {/* Ledger header filters and actions */}
                <div className="flex justify-between items-center gap-4">
                  <div className={`p-1 rounded-xl border flex gap-1 items-center transition-all w-fit ${
                    isDark ? 'bg-[#0f1b14] border-emerald-950/40' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <button
                      onClick={() => setLedgerFilter('all')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition cursor-pointer text-center ${
                        ledgerFilter === 'all'
                          ? (isDark ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-white text-slate-800 shadow-sm')
                          : `${styles.textMuted}`
                      }`}
                    >
                      Show All ({members.length})
                    </button>
                    <button
                      onClick={() => setLedgerFilter('unpaid')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition cursor-pointer text-center ${
                        ledgerFilter === 'unpaid'
                          ? (isDark ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-white text-slate-800 shadow-sm')
                          : `${styles.textMuted}`
                      }`}
                    >
                      Unpaid Only ({unpaidMembers.length})
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      if (unpaidMembers.length === 0) {
                        alert('No outstanding balances. All accounts fully settled!');
                        return;
                      }
                      unpaidMembers.forEach(m => {
                        const alertId = `alert_${m.id}_${Date.now()}`;
                        setSystemNotifications(prev => [
                          {
                            id: alertId,
                            title: '📢 Subscriptions Overdue Notification',
                            body: `Dear ${m.name}, subscription payment of ₹${getMemberMonthlyRate(m.id).toLocaleString()} for ${globalLedgerMonth} is ${simulatedDay === 'current' ? 'due soon' : 'overdue'}.`,
                            timestamp: 'Just Now',
                            type: 'alert'
                          },
                          ...prev
                        ]);
                      });
                      alert(`Success! Broadcasted ${unpaidMembers.length} overdue alerts successfully.`);
                    }}
                    className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow transition cursor-pointer border-none"
                  >
                    📢 Broadcast Unpaid Reminders ({unpaidMembers.length})
                  </button>
                </div>

                {/* Ledger Data Table */}
                <div className={`p-5 rounded-2xl border space-y-4 ${styles.card}`}>
                  {ledgerMembers.length === 0 ? (
                    <div className="text-center py-12 text-xs text-slate-450 border border-dashed rounded-xl border-emerald-950/20">
                      No unpaid subscriptions found! All records are fully settled.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-emerald-800/10 text-slate-400 text-[10px] uppercase font-black tracking-wider">
                            <th className="py-2.5">Member Name</th>
                            <th className="py-2.5">Mobile Contact</th>
                            <th className="py-2.5">Assigned Groups</th>
                            <th className="py-2.5 text-right">Computed Rate</th>
                            <th className="py-2.5 text-center">Status</th>
                            <th className="py-2.5 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-900/10">
                          {ledgerMembers.map(member => {
                            const memberGroups = groups.filter(g => g.memberIds.includes(member.id));
                            const computedRate = getMemberMonthlyRate(member.id);
                            
                            return (
                              <tr key={member.id} className="hover:bg-emerald-500/5 transition">
                                <td className="py-3 font-bold">{member.name}</td>
                                <td className="py-3 font-mono opacity-80">{member.mobile}</td>
                                <td className="py-3 opacity-80">
                                  {memberGroups.length === 0 ? (
                                    <span className="text-[10px] text-slate-500 italic">No assigned groups</span>
                                  ) : (
                                    memberGroups.map(g => (
                                      <span key={g.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 mr-1 inline-block">
                                        {g.name}
                                      </span>
                                    ))
                                  )}
                                </td>
                                <td className="py-3 font-mono font-black text-right pr-4 text-emerald-500">₹{computedRate.toLocaleString()}</td>
                                <td className="py-3 text-center">
                                  <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                                    member.paymentHistory?.[globalLedgerMonth] === 'Paid'
                                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                      : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                  }`}>
                                    {member.paymentHistory?.[globalLedgerMonth] || 'Pending'}
                                  </span>
                                </td>
                                <td className="py-3 text-center">
                                  <div className="flex gap-1 justify-center">
                                    <button
                                      onClick={() => {
                                        const alertId = `alert_${member.id}_${Date.now()}`;
                                        setSystemNotifications(prev => [
                                          {
                                            id: alertId,
                                            title: '📢 Subscription Reminder Alert',
                                            body: `Dear ${member.name}, subscription payment of ₹${computedRate.toLocaleString()} for August 2026 is due. Click here to clear.`,
                                            timestamp: 'Just Now',
                                            type: 'alert'
                                          },
                                          ...prev
                                        ]);
                                        alert(`Success! Sent alert reminder directly to ${member.name}.`);
                                      }}
                                      className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 hover:border-emerald-500/35 rounded-lg text-[9px] font-extrabold transition cursor-pointer"
                                    >
                                      Send Alert
                                    </button>
                                    
                                    <button
                                      onClick={() => handleDownloadReceipt(member.id, computedRate)}
                                      className="px-2 py-1 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-800/20 rounded-lg text-[9px] font-extrabold transition cursor-pointer"
                                    >
                                      Receipt
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                </>)}

                {/* ── GUEST TRANSACTIONS VIEW ── */}
                {ledgerSubTab === 'guests' && (() => {
                  const MONTHS = ['Jul 2026', 'Aug 2026', 'Sep 2026'];
                  const BRANCHES_LIST = ['All Branches', 'Downtown Hub', 'Suburb Arena'];
                  const filteredGuests = guests.filter(g => {
                    const monthMatch = guestLedgerDateFrom && guestLedgerDateTo
                      ? true
                      : (g.month || 'Aug 2026') === globalLedgerMonth;
                    const branchMatch = guestLedgerBranch === 'All Branches' || (g.branch || 'Downtown Hub') === guestLedgerBranch;
                    return monthMatch && branchMatch;
                  });
                  const bookedGuests = filteredGuests.filter(g => g.status === 'Booked');
                  const cancelledGuests = filteredGuests.filter(g => g.status === 'Cancelled');
                  const grossCollected = bookedGuests.reduce((s, g) => s + (g.collectedAmount ?? g.fee ?? 0), 0);
                  const refundsIssued = cancelledGuests.reduce((s, g) => s + (g.refundIssued ?? 0), 0);
                  const netRevenue = grossCollected - refundsIssued;
                  const branchGroups = {};
                  filteredGuests.forEach(g => {
                    const b = g.branch || 'Downtown Hub';
                    if (!branchGroups[b]) branchGroups[b] = [];
                    branchGroups[b].push(g);
                  });
                  return (
                  <div className="space-y-5 animate-fadeIn">
                    {/* Timeline Controls */}
                    <div className="flex flex-wrap gap-3 items-end">
                      <select value={guestLedgerBranch} onChange={e => setGuestLedgerBranch(e.target.value)}
                        className={`px-3 py-2 border rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 ${isDark ? 'bg-[#0f1b14] border-emerald-950/40 text-white' : 'bg-slate-100 border-slate-200 text-slate-800'}`}>
                        {BRANCHES_LIST.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase ${styles.textMuted}`}>From</span>
                        <input type="date" value={guestLedgerDateFrom} onChange={e => setGuestLedgerDateFrom(e.target.value)}
                          className={`px-2 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 ${isDark ? 'bg-[#0f1b14] border-emerald-950/40 text-white' : 'bg-slate-100 border-slate-200'}`} />
                        <span className={`text-[10px] font-bold uppercase ${styles.textMuted}`}>To</span>
                        <input type="date" value={guestLedgerDateTo} onChange={e => setGuestLedgerDateTo(e.target.value)}
                          className={`px-2 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 ${isDark ? 'bg-[#0f1b14] border-emerald-950/40 text-white' : 'bg-slate-100 border-slate-200'}`} />
                        {guestLedgerDateFrom && <button onClick={() => { setGuestLedgerDateFrom(''); setGuestLedgerDateTo(''); }} className="text-rose-400 text-[10px] font-black cursor-pointer">✕ Clear</button>}
                      </div>
                    </div>
                    {/* Summary Metrics */}
                    <div className="grid grid-cols-4 gap-4">
                      {[
                        { label: 'Total Bookings', value: filteredGuests.length, color: styles.textPrimary, mono: false },
                        { label: 'Gross Collected', value: `₹${grossCollected}`, color: 'text-emerald-500', mono: true },
                        { label: 'Refunds Issued', value: `₹${refundsIssued}`, color: 'text-rose-400', mono: true },
                        { label: 'Net Revenue', value: `₹${netRevenue}`, color: netRevenue >= 0 ? 'text-emerald-500' : 'text-rose-500', mono: true },
                      ].map(card => (
                        <div key={card.label} className={`p-5 rounded-2xl border ${styles.card}`}>
                          <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>{card.label}</span>
                          <span className={`text-2xl font-black block mt-1 ${card.color} ${card.mono ? 'font-mono' : ''}`}>{card.value}</span>
                        </div>
                      ))}
                    </div>
                    {/* Per-Branch Collapsible Sections */}
                    {filteredGuests.length === 0 ? (
                      <div className="text-center py-12 text-xs text-slate-450 border border-dashed rounded-xl border-emerald-950/20">
                        No guest bookings found for the selected period.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {Object.entries(branchGroups).map(([branchName, branchGuests]) => {
                          const bCollected = branchGuests.filter(g => g.status === 'Booked').reduce((s, g) => s + (g.collectedAmount ?? g.fee ?? 0), 0);
                          const bRefunds = branchGuests.filter(g => g.status === 'Cancelled').reduce((s, g) => s + (g.refundIssued ?? 0), 0);
                          const isExpanded = expandedLedgerBranch === null || expandedLedgerBranch === branchName;
                          return (
                            <div key={branchName} className={`rounded-2xl border overflow-hidden ${styles.card}`}>
                              <button onClick={() => setExpandedLedgerBranch(expandedLedgerBranch === branchName ? null : branchName)}
                                className={`w-full flex justify-between items-center p-4 text-xs cursor-pointer ${isDark ? 'hover:bg-emerald-900/20' : 'hover:bg-slate-50'} transition`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-base">🏢</span>
                                  <span className={`font-black ${styles.textPrimary}`}>{branchName}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${isDark ? 'border-emerald-900/30 text-slate-400' : 'border-slate-200 text-slate-500'}`}>{branchGuests.length} bookings</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-black text-emerald-500 font-mono">₹{bCollected} collected</span>
                                  {bRefunds > 0 && <span className="font-bold text-rose-400 font-mono">-₹{bRefunds} refunded</span>}
                                  <span className={`text-sm ${styles.textMuted}`}>{isExpanded ? '▲' : '▼'}</span>
                                </div>
                              </button>
                              {isExpanded && (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                      <tr className={`border-y text-[10px] uppercase font-black tracking-wider ${isDark ? 'border-emerald-900/20 text-slate-500 bg-[#0f1b14]' : 'border-slate-100 text-slate-400 bg-slate-50'}`}>
                                        <th className="py-2 px-4">Guest</th>
                                        <th className="py-2 px-2">Date</th>
                                        <th className="py-2 px-2">Time</th>
                                        <th className="py-2 px-2">Court</th>
                                        <th className="py-2 px-2">Type</th>
                                        <th className="py-2 px-2">Method</th>
                                        <th className="py-2 px-2 text-right">Fee</th>
                                        <th className="py-2 px-2 text-right">Collected ✏️</th>
                                        <th className="py-2 px-2 text-center">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody className={`divide-y ${isDark ? 'divide-emerald-900/10' : 'divide-slate-100'}`}>
                                      {branchGuests.map(g => (
                                        <tr key={g.id} className={`transition ${g.status === 'Cancelled' ? (isDark ? 'opacity-60 bg-rose-900/5' : 'opacity-60 bg-rose-50/50') : (isDark ? 'hover:bg-emerald-900/10' : 'hover:bg-slate-50')}`}>
                                          <td className="py-3 px-4 font-bold">{g.name}</td>
                                          <td className="py-3 px-2 opacity-75">{g.date}</td>
                                          <td className="py-3 px-2 font-mono opacity-75">{g.time || '—'}</td>
                                          <td className="py-3 px-2 opacity-75">{g.court}</td>
                                          <td className="py-3 px-2">
                                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${g.type === 'Peak' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-800/20'}`}>{g.type}</span>
                                          </td>
                                          <td className="py-3 px-2">
                                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${(g.paymentMethod || 'Cash') === 'Online' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>{g.paymentMethod || 'Cash'}</span>
                                          </td>
                                          <td className="py-3 px-2 text-right font-mono opacity-60">₹{g.fee}</td>
                                          <td className="py-3 px-2 text-right">
                                            {g.status === 'Cancelled' ? (
                                              <span className="font-mono text-rose-400 font-bold">-₹{g.refundIssued || 0}</span>
                                            ) : editingCollectedId === g.id ? (
                                              <input type="number" defaultValue={g.collectedAmount ?? g.fee} autoFocus
                                                onBlur={e => {
                                                  const val = parseFloat(e.target.value) || 0;
                                                  setGuests(prev => prev.map(item => item.id === g.id ? { ...item, collectedAmount: val } : item));
                                                  setEditingCollectedId(null);
                                                }}
                                                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingCollectedId(null); }}
                                                className={`w-20 p-1 border rounded text-xs font-mono text-right focus:outline-none focus:ring-1 focus:ring-emerald-500 ${isDark ? 'bg-slate-950 border-emerald-950/40 text-white' : 'bg-white border-slate-300'}`}
                                              />
                                            ) : (
                                              <button onClick={() => setEditingCollectedId(g.id)}
                                                className="font-mono font-black text-emerald-500 hover:underline cursor-pointer text-right w-full">
                                                ₹{g.collectedAmount ?? g.fee}
                                              </button>
                                            )}
                                          </td>
                                          <td className="py-3 px-2 text-center">
                                            <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                                              g.status === 'Booked' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                            }`}>{g.status}</span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className={`p-4 rounded-2xl border flex justify-between items-center ${isDark ? 'bg-emerald-900/10 border-emerald-800/20' : 'bg-emerald-50 border-emerald-200'}`}>
                          <span className={`text-xs font-black uppercase tracking-widest ${styles.textMuted}`}>Net Revenue — {globalLedgerMonth}</span>
                          <span className={`text-xl font-black font-mono ${netRevenue >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>₹{netRevenue}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })()}

              </div>
            )}

            {/* TAB PANEL 5: GUEST BOOKINGS PANEL (DESKTOP) */}
            {desktopTab === 'inventory' && (
              <div className="space-y-4 animate-fadeIn">
                <AdminInventoryManager isDark={isDark} groups={groups} />
              </div>
            )}
            
            {desktopTab === 'guests' && (
              <div className="grid grid-cols-12 gap-6 animate-fadeIn text-xs">
                {/* Left Pane - Reservations (Col span 7) */}
                <div className="col-span-7 space-y-6">
                  {/* Blackout Warnings */}
                  {guestBlackoutRange[selectedBranch]?.closed && (
                    <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-bold rounded-2xl flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">🚫</span>
                        <span className="font-extrabold">Guest bookings closed at {selectedBranch}</span>
                      </div>
                      <div className="pl-5 text-rose-455 font-normal">
                        Period: {guestBlackoutRange[selectedBranch].start} to {guestBlackoutRange[selectedBranch].end}
                        <br />
                        Reason: <strong className="font-black text-rose-500">{guestBlackoutRange[selectedBranch].reason || 'Maintenance'}</strong>
                      </div>
                    </div>
                  )}

                  {/* Guest Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`p-5 rounded-2xl border ${styles.card}`}>
                      <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Total Guest Bookings</span>
                      <span className={`text-2xl font-black block mt-1 transition-colors ${styles.textPrimary}`}>{guests.length}</span>
                    </div>
                    <div className={`p-5 rounded-2xl border ${styles.card}`}>
                      <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Dues Collected ({selectedBranch})</span>
                      <span className="text-2xl font-black text-emerald-555 block mt-1 font-mono">
                        ₹{guests.filter(g => g.status === 'Booked').reduce((sum, g) => sum + (g.type === 'Peak' ? (guestRates[selectedBranch]?.peak || 0) : (guestRates[selectedBranch]?.nonPeak || 0)), 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Guest Reservations List */}
                  <div className={`p-5 rounded-2xl border space-y-4 ${styles.card}`}>
                    <h3 className="text-sm font-black uppercase text-emerald-550 tracking-wider">Reservations Roster ({selectedBranch})</h3>
                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                      {guests.length === 0 ? (
                        <div className="text-center py-8 text-xs text-slate-500 italic">No guest reservations registered today.</div>
                      ) : (
                        guests.map(g => {
                          const rates = guestRates[selectedBranch] || { peak: 400, nonPeak: 200 };
                          const fee = g.type === 'Peak' ? rates.peak : rates.nonPeak;
                          return (
                            <div key={g.id} className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${styles.subCard}`}>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`font-extrabold block text-sm transition-colors ${styles.textPrimary}`}>{g.name}</span>
                                  <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border ${
                                    g.type === 'Peak'
                                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                      : 'bg-slate-500/10 text-slate-405 border-slate-500/20'
                                  }`}>
                                    {g.type === 'Peak' ? '🔥 Peak' : '🟢 Non-Peak'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-550 font-mono">
                                  <span>{g.date}</span>
                                  <span>•</span>
                                  <span>{g.court}</span>
                                  <span>•</span>
                                  <span className="text-emerald-500 font-bold">₹{fee}</span>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-1.5">
                                {g.status === 'Cancelled' ? (
                                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border bg-rose-500/10 text-rose-500 border-rose-500/20">
                                    Cancelled
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                      Booked
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const hoursRemaining = getHoursBeforeSlot(g.time || '10:00 AM', g.date || 'Aug 05');
                                        const policy = guestCancelPolicy[selectedBranch] || { slab24: 100, slab12: 50, slab0: 0 };
                                        let refundPercent = 0;
                                        if (hoursRemaining >= 24) refundPercent = policy.slab24;
                                        else if (hoursRemaining >= 12) refundPercent = policy.slab12;
                                        else refundPercent = policy.slab0;
                                        const fee = g.fee || 0;
                                        const refundAmount = Math.round((fee * refundPercent) / 100);
                                        setCancelBookingTarget(g);
                                        setCancelRefundDetails({ refundPercent, refundAmount, hoursRemaining });
                                        setCancelReason('Maintenance');
                                        setCancelCustomReason('');
                                        setShowCancelModal(true);
                                      }}
                                      className="px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[10px] font-black cursor-pointer border-none shadow transition"
                                    >
                                      Force Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Add Guest Form */}
                  <div className={`p-5 rounded-2xl border space-y-3 ${styles.card}`}>
                    <h3 className="text-xs font-black uppercase text-emerald-550 tracking-wider">Quick Add Guest ({selectedBranch})</h3>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const name = e.target.gname.value.trim();
                        const court = e.target.gcourt.value;
                        const slotId = e.target.gslot.value;
                        
                        if (!name) return alert('Please enter guest name.');
                        
                        const allowedCourts = guestAllowedCourts[selectedBranch] || [];
                        if (!allowedCourts.includes(court)) {
                          return alert(`Booking failed: ${court} is not authorized for guest play under rules at ${selectedBranch}.`);
                        }
                        
                        const blackout = guestBlackoutRange[selectedBranch] || { start: '', end: '', closed: false };
                        if (blackout.closed) {
                          return alert(`Booking failed: Guest bookings are currently blocked under blackout rules for ${selectedBranch}.`);
                        }

                        const branchSlots = guestSlots[selectedBranch] || [];
                        const selectedSlot = branchSlots.find(s => s.id === slotId);
                        if (!selectedSlot) return alert('Please select a valid scheduled slot.');
                        
                        const rates = guestRates[selectedBranch] || { peak: 400, nonPeak: 200 };
                        const fee = selectedSlot.type === 'Peak' ? rates.peak : rates.nonPeak;
                        
                        const newGuest = {
                          id: `g${Date.now()}`,
                          name,
                          date: 'Aug 05',
                          court,
                          status: 'Booked',
                          type: selectedSlot.type,
                          time: selectedSlot.time,
                          fee,
                          collectedAmount: fee,
                          paymentMethod: 'Cash',
                          refundIssued: 0,
                          branch: selectedBranch,
                          month: 'Aug 2026'
                        };
                        setIsProcessing(true);
                        setTimeout(() => {
                          setGuests(prev => [...prev, newGuest]);
                          e.target.reset();
                          setIsProcessing(false);
                          setGuestSuccessOverlay(true);
                          setTimeout(() => setGuestSuccessOverlay(false), 3000);
                        }, 1200);
                      }}
                      className="space-y-2 text-xs"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          name="gname"
                          placeholder="Guest Name"
                          required
                          className={`p-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                            isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-55 border-slate-200'
                          }`}
                        />
                        <select
                          name="gcourt"
                          className={`p-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                            isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-55 border-slate-200'
                          }`}
                        >
                          <option value="Court 1">Court 1</option>
                          <option value="Court 2">Court 2</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] opacity-75 font-bold uppercase tracking-wider block">Choose Guest Slot</label>
                        <select
                          name="gslot"
                          className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                            isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-55 border-slate-200'
                          }`}
                        >
                          {(guestSlots[selectedBranch] || []).length === 0 ? (
                            <option value="">No Active Slots - Add in Setup Rules</option>
                          ) : (
                            guestSlots[selectedBranch].map(s => (
                              <option key={s.id} value={s.id}>
                                {s.time} ({s.type} • {s.recurrence === 'Weekly' ? `Weekly (${s.details})` : s.recurrence})
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-xs cursor-pointer border-none shadow transition"
                      >
                        Create Guest Booking
                      </button>
                    </form>
                  </div>
                </div>

                {/* Right Pane - Settings & Setup Rules (Col span 5) */}
                <div className="col-span-5 space-y-6">
                  {/* Select Branch to Configure */}
                  <div className={`p-5 rounded-2xl border space-y-3 ${styles.card}`}>
                    <label className={`text-[10px] font-extrabold uppercase tracking-widest block ${styles.textMuted}`}>
                      Select Branch to Configure
                    </label>
                    <div className="relative text-xs">
                      <select
                        value={configBranch}
                        onChange={(e) => setConfigBranch(e.target.value)}
                        className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 appearance-none font-bold transition-all ${
                          isDark ? 'bg-[#192c21] border-emerald-800/30 text-white' : 'bg-white border-slate-250 text-slate-800 shadow-sm'
                        }`}
                      >
                        <option value="Downtown Hub">Downtown Hub (HQ)</option>
                        <option value="Uptown Arena">Uptown Arena</option>
                        <option value="East Coast Courts">East Coast Courts</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-455">
                        <MapPin className="w-4 h-4 text-emerald-555" />
                      </div>
                    </div>
                  </div>

                  {/* 1. Court Allocations */}
                  <div className={`p-4 rounded-2xl border space-y-2.5 ${styles.card}`}>
                    <h3 className="text-xs font-black uppercase text-emerald-555 tracking-wider">Authorized Guest Courts ({configBranch})</h3>
                    <div className="flex gap-4 text-xs">
                      {['Court 1', 'Court 2'].map(court => {
                        const allowed = guestAllowedCourts[configBranch] || [];
                        const isAllowed = allowed.includes(court);
                        return (
                          <label key={court} className="flex items-center gap-2 cursor-pointer font-bold select-none">
                            <input
                              type="checkbox"
                              checked={isAllowed}
                              onChange={() => {
                                setGuestAllowedCourts(prev => {
                                  const currentList = prev[configBranch] || [];
                                  const newList = isAllowed ? currentList.filter(c => c !== court) : [...currentList, court];
                                  return { ...prev, [configBranch]: newList };
                                });
                              }}
                              className="w-4.5 h-4.5 border border-emerald-800 rounded bg-slate-900 accent-emerald-500 focus:ring-0 focus:ring-offset-0"
                            />
                            <span>{court}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Custom Pricing Rates */}
                  <div className={`p-4 rounded-2xl border space-y-3.5 ${styles.card}`}>
                    <h3 className="text-xs font-black uppercase text-emerald-555 tracking-wider">Custom Pricing Rates ({configBranch})</h3>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <label className="text-[9px] opacity-75 uppercase block font-bold font-semibold">Standard Rate (₹/hr)</label>
                        <input
                          type="number"
                          value={guestRates[configBranch]?.nonPeak || 0}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setGuestRates(prev => ({
                              ...prev,
                              [configBranch]: { ...prev[configBranch], nonPeak: val }
                            }));
                          }}
                          className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                            isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] opacity-75 uppercase block font-bold font-semibold">Peak Rate (₹/hr)</label>
                        <input
                          type="number"
                          value={guestRates[configBranch]?.peak || 0}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setGuestRates(prev => ({
                              ...prev,
                              [configBranch]: { ...prev[configBranch], peak: val }
                            }));
                          }}
                          className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                            isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-55 border-slate-200'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3. Blackout System */}
                  <div className={`p-4 rounded-2xl border space-y-3.5 ${styles.card}`}>
                    <div className="flex justify-between items-center text-xs">
                      <h3 className="text-xs font-black uppercase text-emerald-555 tracking-wider">Date Blackout Closure ({configBranch})</h3>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={guestBlackoutRange[configBranch]?.closed || false}
                          onChange={() => {
                            setGuestBlackoutRange(prev => {
                              const current = prev[configBranch] || { start: '', end: '', closed: false, reason: 'Maintenance' };
                              return { ...prev, [configBranch]: { ...current, closed: !current.closed } };
                            });
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-900 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 peer-checked:after:bg-emerald-500 after:border-slate-400 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-950 border border-emerald-955/20"></div>
                        <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                          {guestBlackoutRange[configBranch]?.closed ? 'Closed' : 'Active'}
                        </span>
                      </label>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <label className="text-[9px] opacity-75 uppercase block font-bold font-semibold">Start Date</label>
                        <input
                          type="date"
                          value={guestBlackoutRange[configBranch]?.start || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setGuestBlackoutRange(prev => {
                              const current = prev[configBranch] || { start: '', end: '', closed: false, reason: 'Maintenance' };
                              return { ...prev, [configBranch]: { ...current, start: val } };
                            });
                          }}
                          className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-505 font-bold ${
                            isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] opacity-75 uppercase block font-bold font-semibold">End Date</label>
                        <input
                          type="date"
                          value={guestBlackoutRange[configBranch]?.end || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setGuestBlackoutRange(prev => {
                              const current = prev[configBranch] || { start: '', end: '', closed: false, reason: 'Maintenance' };
                              return { ...prev, [configBranch]: { ...current, end: val } };
                            });
                          }}
                          className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-505 font-bold ${
                            isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-55 border-slate-200'
                          }`}
                        />
                      </div>
                    </div>
                    <div className="space-y-1 text-xs">
                      <label className="text-[9px] opacity-75 uppercase block font-bold font-mono">Blackout Reason</label>
                      <select
                        value={guestBlackoutRange[configBranch]?.reason || 'Maintenance'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGuestBlackoutRange(prev => {
                            const current = prev[configBranch] || { start: '', end: '', closed: false, reason: 'Maintenance' };
                            return { ...prev, [configBranch]: { ...current, reason: val } };
                          });
                        }}
                        className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <option value="Power cut">Power cut</option>
                        <option value="Maintenance">Maintenance</option>
                        <option value="Tournament">Tournament</option>
                        <option value="Corporate Event">Corporate Event</option>
                      </select>
                    </div>
                  </div>

                  {/* 4. Cancellation & Refund Policy */}
                  <div className={`p-4 rounded-2xl border space-y-3.5 ${styles.card}`}>
                    <h3 className="text-xs font-black uppercase text-emerald-555 tracking-wider">Cancellation & Refund Policy</h3>
                    
                    <label className="flex items-center gap-2 cursor-pointer font-bold select-none mb-3 text-xs">
                      <input
                        type="checkbox"
                        checked={guestCancelPolicy[configBranch]?.applyGlobally || false}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setGuestCancelPolicy(prev => {
                            const updated = {};
                            for (const br of Object.keys(prev)) {
                              updated[br] = { ...prev[br], applyGlobally: checked };
                            }
                            return updated;
                          });
                        }}
                        className="w-4.5 h-4.5 border border-emerald-800 rounded bg-slate-900 accent-emerald-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <span>Apply cancellation policy globally to all branches</span>
                    </label>

                    <div className="grid grid-cols-3 gap-2 text-[9px]">
                      <div className="space-y-1">
                        <label className="opacity-75 uppercase block font-bold">&amp;gt;24 Hrs (Refund %)</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={guestCancelPolicy[configBranch]?.slab24 || 0}
                          onChange={(e) => {
                            const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                            setGuestCancelPolicy(prev => {
                              const updated = { ...prev };
                              const global = prev[configBranch]?.applyGlobally;
                              for (const br of Object.keys(prev)) {
                                if (global || br === configBranch) {
                                  updated[br] = { ...updated[br], slab24: val };
                                }
                              }
                              return updated;
                            });
                          }}
                          className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                            isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="opacity-75 uppercase block font-bold">12-24 Hrs (Refund %)</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={guestCancelPolicy[configBranch]?.slab12 || 0}
                          onChange={(e) => {
                            const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                            setGuestCancelPolicy(prev => {
                              const updated = { ...prev };
                              const global = prev[configBranch]?.applyGlobally;
                              for (const br of Object.keys(prev)) {
                                if (global || br === configBranch) {
                                  updated[br] = { ...updated[br], slab12: val };
                                }
                              }
                              return updated;
                            });
                          }}
                          className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                            isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="opacity-75 uppercase block font-bold">&amp;lt;12 Hrs (Refund %)</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={guestCancelPolicy[configBranch]?.slab0 || 0}
                          onChange={(e) => {
                            const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                            setGuestCancelPolicy(prev => {
                              const updated = { ...prev };
                              const global = prev[configBranch]?.applyGlobally;
                              for (const br of Object.keys(prev)) {
                                if (global || br === configBranch) {
                                  updated[br] = { ...updated[br], slab0: val };
                                }
                              }
                              return updated;
                            });
                          }}
                          className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                            isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-55 border-slate-200'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 5. Dynamic Guest Scheduler */}
                  <div className={`p-4 rounded-2xl border space-y-4.5 ${styles.card}`}>
                    <h3 className="text-xs font-black uppercase text-emerald-555 tracking-wider">Dynamic Guest Scheduler ({configBranch})</h3>
                    
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 text-xs">
                      {(guestSlots[configBranch] || []).length === 0 ? (
                        <div className="text-center py-4 text-xs text-slate-500 italic">No guest slots scheduled for this branch yet.</div>
                      ) : (
                        guestSlots[configBranch].map(s => (
                          <div key={s.id} className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${styles.subCard}`}>
                            <div>
                              <div className="flex items-center gap-1.5 font-bold">
                                <span>{s.time}</span>
                                <span className={`text-[7px] font-black uppercase px-1 rounded border ${
                                  s.type === 'Peak'
                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                    : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                }`}>
                                  {s.type}
                                </span>
                              </div>
                              <span className="text-[9px] opacity-75 font-mono">
                                {s.recurrence === 'Weekly' ? `Weekly (${s.details})` : s.recurrence}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteReasonType('slot');
                                setTargetIdToDelete(s.id);
                                setSelectedDeleteReason('Maintenance');
                                setCustomDeleteReason('');
                                setShowDeleteReasonModal(true);
                              }}
                              className="p-1 px-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded border border-rose-500/20 text-[9px] font-black cursor-pointer transition"
                            >
                              Delete
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const time = e.target.stime.value;
                        const type = e.target.stype.value;
                        const recurrence = e.target.srecurrence.value;
                        const details = e.target.sdetails.value.trim();

                        const newSlot = {
                          id: `gs${Date.now()}`,
                          time,
                          type,
                          recurrence,
                          details: details || 'Daily'
                        };
                        
                        setGuestSlots(prev => {
                          const currentList = prev[configBranch] || [];
                          return { ...prev, [configBranch]: [...currentList, newSlot] };
                        });
                        
                        e.target.reset();
                        alert(`New guest slot published for ${configBranch}: ${time} (${type} • ${recurrence})`);
                      }}
                      className="p-3 bg-slate-900/30 border border-emerald-955/20 rounded-xl space-y-2.5 text-xs"
                    >
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-500 block">Create New Guest Slot</span>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          name="stime"
                          className={`p-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                            isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-55 border-slate-200'
                          }`}
                        >
                          {['06:00 AM', '07:00 AM', '08:00 AM', '10:00 AM', '11:00 AM', '02:00 PM', '03:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM'].map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <select
                          name="stype"
                          className={`p-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-emerald-555/40 text-white ${isDark ? 'bg-[#0b140f]' : 'bg-slate-55'}`}
                        >
                          <option value="Non-Peak">Non-Peak Rate</option>
                          <option value="Peak">Peak Rate</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          name="srecurrence"
                          className={`p-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-emerald-555/40 text-white ${isDark ? 'bg-[#0b140f]' : 'bg-slate-55'}`}
                        >
                          <option value="Daily">Daily</option>
                          <option value="Weekly">Weekly</option>
                          <option value="Monthly">Monthly</option>
                          <option value="Single Day">Single Day</option>
                        </select>
                        <input
                          name="sdetails"
                          placeholder="Details (e.g. Mon, Wed, Fri)"
                          className={`p-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                            isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-55 border-slate-200'
                          }`}
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded text-[9px] cursor-pointer border-none shadow transition"
                      >
                        Publish Guest Slot
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

          {/* Confirm Cancellation Modal Overlay */}
      {showCancelModal && cancelBookingTarget && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-sm rounded-2xl border p-5 space-y-4 animate-scaleUp ${
            isDark ? 'bg-slate-900 border-emerald-955/20' : 'bg-white border-slate-200 shadow-2xl'
          }`}>
            <div className="space-y-1">
              <h3 className={`font-black text-sm tracking-tight transition-colors ${styles.textPrimary}`}>
                Confirm Guest Cancellation
              </h3>
              <p className={`text-[11px] ${styles.textMuted}`}>
                Calculate refund policy for <strong>{cancelBookingTarget.name}</strong>.
              </p>
            </div>

            <div className={`p-3 rounded-xl space-y-1.5 text-[11px] border font-medium ${
              isDark ? 'bg-slate-950/40 border-slate-800 text-slate-350' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <div className="flex justify-between">
                <span>Booked Date/Time:</span>
                <span className="font-bold">{cancelBookingTarget.date} • {cancelBookingTarget.time || '10:00 AM'}</span>
              </div>
              <div className="flex justify-between">
                <span>Hours Remaining:</span>
                <span className="font-bold">{cancelRefundDetails.hoursRemaining < 0 ? '0.0 hrs (Past Slot)' : `${cancelRefundDetails.hoursRemaining.toFixed(1)} hrs`}</span>
              </div>
              <div className="flex justify-between">
                <span>Slab Refund %:</span>
                <span className="font-extrabold text-emerald-500">{cancelRefundDetails.refundPercent}%</span>
              </div>
              <div className="flex justify-between border-t border-slate-800/10 pt-1.5">
                <span>Calculated Refund:</span>
                <span className="font-black text-emerald-500 font-mono">₹{cancelRefundDetails.refundAmount}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[9px] opacity-75 font-bold uppercase block mb-1">Cancellation Reason</label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                    isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <option value="Power cut">Power cut</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Tournament">Tournament</option>
                  <option value="Corporate Event">Corporate Event</option>
                  <option value="Other">Other (Specify below...)</option>
                </select>
              </div>

              {cancelReason === 'Other' && (
                <div className="space-y-1 animate-fadeIn">
                  <label className="text-[9px] opacity-75 font-bold uppercase block mb-1">Custom Reason</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter custom reason here..."
                    value={cancelCustomReason}
                    onChange={(e) => setCancelCustomReason(e.target.value)}
                    className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                      isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelBookingTarget(null);
                }}
                className={`flex-1 py-2 rounded-xl font-bold border transition cursor-pointer ${
                  isDark ? 'bg-slate-800 border-slate-700 text-slate-350' : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const finalReason = cancelReason === 'Other' ? cancelCustomReason.trim() : cancelReason;
                  if (cancelReason === 'Other' && !finalReason) {
                    return alert('Please enter a custom reason.');
                  }
                  
                  // Filter out booking
                  setGuests(prev => prev.map(g => g.id === cancelBookingTarget.id
                    ? { ...g, status: 'Cancelled', refundIssued: cancelRefundDetails.refundAmount }
                    : g
                  ));
                  
                  alert(`Booking for ${cancelBookingTarget.name} cancelled successfully!\nRefund: ₹${cancelRefundDetails.refundAmount} (${cancelRefundDetails.refundPercent}%)\nReason: ${finalReason}`);
                  
                  setShowCancelModal(false);
                  setCancelBookingTarget(null);
                }}
                className="flex-1 py-2 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-xl cursor-pointer border-none shadow transition"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Deletion Reason Modal Overlay */}
      {showDeleteReasonModal && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-sm rounded-2xl border p-5 space-y-4 animate-scaleUp ${
            isDark ? 'bg-slate-900 border-emerald-950/30' : 'bg-white border-slate-200 shadow-2xl'
          }`}>
            <div className="space-y-1">
              <h3 className={`font-black text-sm tracking-tight transition-colors ${styles.textPrimary}`}>
                Specify Deletion Reason
              </h3>
              <p className={`text-[11px] ${styles.textMuted}`}>
                Please state the reason for deleting this ${deleteReasonType === 'slot' ? 'scheduled slot' : 'guest booking'}.
              </p>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-[9px] opacity-75 font-bold uppercase block mb-1">Predefined Reason</label>
                <select
                  value={selectedDeleteReason}
                  onChange={(e) => setSelectedDeleteReason(e.target.value)}
                  className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                    isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <option value="Power cut">Power cut</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Tournament">Tournament</option>
                  <option value="Corporate Event">Corporate Event</option>
                  <option value="Other">Other (Specify below...)</option>
                </select>
              </div>

              {selectedDeleteReason === 'Other' && (
                <div className="space-y-1 animate-fadeIn">
                  <label className="text-[9px] opacity-75 font-bold uppercase block mb-1">Custom Reason</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter custom reason here..."
                    value={customDeleteReason}
                    onChange={(e) => setCustomDeleteReason(e.target.value)}
                    className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                      isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteReasonModal(false);
                  setCustomDeleteReason('');
                  setTargetIdToDelete(null);
                }}
                className={`flex-1 py-2 rounded-xl font-bold border transition cursor-pointer ${
                  isDark ? 'bg-slate-800 border-slate-700 text-slate-350' : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const finalReason = selectedDeleteReason === 'Other' ? customDeleteReason.trim() : selectedDeleteReason;
                  if (selectedDeleteReason === 'Other' && !finalReason) {
                    return alert('Please enter a custom reason.');
                  }
                  
                  if (deleteReasonType === 'slot') {
                    setGuestSlots(prev => {
                      const currentList = prev[configBranch] || [];
                      const newList = currentList.filter(s => s.id !== targetIdToDelete);
                      return { ...prev, [configBranch]: newList };
                    });
                    alert(`Slot deleted for ${configBranch}. Reason: ${finalReason}`);
                  } else {
                    setGuests(prev => prev.filter(g => g.id !== targetIdToDelete));
                    alert(`Guest booking rejected. Reason: ${finalReason}`);
                  }
                  
                  setShowDeleteReasonModal(false);
                  setCustomDeleteReason('');
                  setTargetIdToDelete(null);
                }}
                className="flex-1 py-2 bg-rose-500 hover:bg-rose-605 text-white font-black rounded-xl cursor-pointer border-none shadow transition"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
        </div>
      </div>
      </>
    );
  };

  const getMemberMonthlyRate = (memberId) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return 0;
    const base = member.baseRate || 2000;
    const groupFees = groups
      .filter(g => g.memberIds.includes(memberId))
      .reduce((sum, g) => sum + g.fee, 0);
    return base + groupFees;
  };
  const handleGoogleLoginMock = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      // Verify hardware sensors and route to setup scan
      if (window.PublicKeyCredential) {
        setAuthState('biometricsPrompt');
      } else {
        setAuthState('loggedIn'); // Fallback if device lacks hardware sensors
        setMemberCheckInOverlay(true);
        setTimeout(() => setMemberCheckInOverlay(false), 3500);
      }
    }, 800);
  };

  // WebAuthn device biometrics setup simulation
  const executeBiometricScanMock = (optIn) => {
    if (!optIn) {
      setBiometricEnabled(false);
      setAuthState('loggedIn');
      setMemberCheckInOverlay(true);
      setTimeout(() => setMemberCheckInOverlay(false), 3500);
      return;
    }

    setIsScanning(true);
    setScanError(false);

    // Simulate Hardware Sensor Scan latency
    setTimeout(() => {
      setIsScanning(false);
      setBiometricEnabled(true);
      setAuthState('loggedIn');
      setMemberCheckInOverlay(true);
      setTimeout(() => setMemberCheckInOverlay(false), 3500);
    }, 1500);
  };

  // Dynamic invoice/receipt text generation and client-side browser download
  const handleDownloadReceipt = (monthName, year, amount, datePaid, txnId) => {
    const invoiceContent = `=========================================
          JBC BADMINTON CLUB
               INVOICE RECEIPT
=========================================
Invoice No:    INV-${year}-${monthName.substring(0, 3).toUpperCase()}
Date Issued:   ${datePaid}
Status:        PAID
-----------------------------------------
MEMBER DETAILS:
Name:          Rahul K.
Batch:         Elite Smashers (Evening 7:00 PM)
Branch:        Downtown Hub
-----------------------------------------
BILLING DETAILS:
Description:   Monthly Subscription Fee (${monthName} ${year})
Amount Paid:   INR ${amount}
Payment Mode:  UPI / Bank Transfer
Txn ID:        ${txnId}
=========================================
     Thank you for playing with us!
=========================================`;

    const blob = new Blob([invoiceContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Receipt_${monthName}_${year}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    alert(`Receipt downloaded successfully for ${monthName} ${year}!`);
  };

  // Filter roster members for Batch 1, 2
  const b1Roster = members.filter(m => m.batchId === 'b1');
  const b2Roster = members.filter(m => m.batchId === 'b2');

  // Trigger alert and export CSV
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Branch Performance Report\n';
    csvContent += 'Branch Name,Average Daily Players,Cumulative Attendance Rate%\n';
    ANALYTICS_DATA.branches.forEach(b => {
      csvContent += `"${b.name}",${b.avgPlayers},"${b.rate}"\n`;
    });
    
    csvContent += '\nCourt Utilization Metrics\n';
    csvContent += 'Court Number,Peak Demand Time Slot,Total No-Shows This Month\n';
    ANALYTICS_DATA.courts.forEach(c => {
      csvContent += `"${c.number}","${c.peak}",${c.noShows}\n`;
    });

    const summaryMessage = `📊 CSV Data Read-Out Verification:\n\n` +
      `Branch Performance Summary:\n` +
      ANALYTICS_DATA.branches.map(b => `- ${b.name}: ${b.avgPlayers} avg/day (${b.rate})`).join('\n') +
      `\n\nCourt Utilization:\n` +
      ANALYTICS_DATA.courts.map(c => `- ${c.number} (${c.peak}): ${c.noShows} no-shows`).join('\n') +
      `\n\nClick OK to initiate file download.`;

    alert(summaryMessage);

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'JBC_Analytics_Report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Month scrolling math
  const monthsList = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const handleMonthScroll = (direction) => {
    setIsLoading(true);
    setTimeout(() => {
      if (direction === 'prev') {
        if (currentMonthIndex === 0) {
          setCurrentMonthIndex(11);
          setCurrentYear(prev => prev - 1);
        } else {
          setCurrentMonthIndex(prev => prev - 1);
        }
      } else {
        if (currentMonthIndex === 11) {
          setCurrentMonthIndex(0);
          setCurrentYear(prev => prev + 1);
        } else {
          setCurrentMonthIndex(prev => prev + 1);
        }
      }
      setIsLoading(false);
    }, 405);
  };

  // Generate calendar grid structure dynamically
  const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonthIndex, 1).getDay();
  const calendarCells = [];

  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(d);
  }

  const isDark = theme === 'dark';
  
  // Design styles mapping: Dark (Tennis Green theme) vs Light (Crisp Court theme)
  const styles = {
    canvas: isDark 
      ? 'bg-[#14231a] bg-gradient-to-b from-[#14231a] to-[#0b130e] text-slate-100 border-emerald-950/20' 
      : 'bg-[#f4faf7] text-slate-800 border-emerald-100',
    card: isDark 
      ? 'bg-[#192c21] border-emerald-800/30 shadow-lg shadow-black/10' 
      : 'bg-white border-emerald-200 shadow-sm shadow-emerald-900/5',
    subCard: isDark
      ? 'bg-[#0f1b14] border-emerald-900/40'
      : 'bg-emerald-50/50 border-emerald-100',
    header: isDark
      ? 'bg-[#192c21]/90 border-emerald-800/30 text-white'
      : 'bg-white border-emerald-150 text-slate-900 shadow-sm',
    footer: isDark
      ? 'bg-[#192c21]/95 border-emerald-850'
      : 'bg-white border-emerald-200 shadow-xl',
    textPrimary: isDark ? 'text-white' : 'text-slate-900',
    textMuted: isDark ? 'text-slate-400' : 'text-slate-555',
    btnGhost: isDark
      ? 'bg-[#0b140f] text-emerald-400 border border-emerald-900/30 hover:bg-[#0f1b14]'
      : 'bg-emerald-55/60 text-emerald-800 border border-emerald-200 hover:bg-emerald-100',
    tableBorder: isDark ? 'border-emerald-900/20' : 'border-emerald-150',
    tableHeader: isDark ? 'bg-[#0f1b14] text-emerald-400 border-emerald-900/30' : 'bg-emerald-55/60 text-emerald-800 border-emerald-150'
  };

  // SCREEN STATE 0: OUTSIDE PROTOCOL GATE (GOOGLE OAUTH DEMO)
  if (authState === 'loggedOut') {
    return (
      <div className="min-h-screen bg-[#14231a] text-slate-100 flex flex-col justify-center p-6 max-w-md mx-auto shadow-2xl relative border-x border-emerald-900/30">
        <div className="space-y-6 text-center">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-inner animate-pulse">
            <Lock className="w-8 h-8 text-emerald-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
              Welcome to <span className="bg-gradient-to-r from-emerald-500 to-emerald-300 bg-clip-text text-transparent">JBC</span>
            </h1>
            <p className="text-xs text-slate-450 max-w-xs mx-auto leading-relaxed">Sign in to access your attendance registry, court slots, and subscription billing.</p>
          </div>
          <button 
            onClick={handleGoogleLoginMock}
            className="w-full py-3.5 bg-white hover:bg-slate-100 text-slate-900 font-extrabold rounded-xl text-xs flex items-center justify-center gap-2.5 transition active:scale-95 shadow-md cursor-pointer border-none"
          >
            {/* Google Vector Drawing */}
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.47 15 1 12 1 7.35 1 3.39 3.65 1.41 7.53l3.87 3a7.16 7.16 0 0 1 6.72-5.49z"/>
              <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46a5.5 5.5 0 0 1-2.4 3.61l3.73 2.89c2.18-2.01 3.7-4.97 3.7-8.65z"/>
              <path fill="#FBBC05" d="M5.28 14.53a7.11 7.11 0 0 1 0-4.13l-3.87-3A11.95 11.95 0 0 0 1 12c0 1.69.35 3.3 1.41 4.7l3.87-3.17z"/>
              <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.73-2.89a7.14 7.14 0 0 1-10.95-3.67l-3.87 3A11.94 11.94 0 0 0 12 23z"/>
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  // SCREEN STATE 1: WEBAUTHN FINGERPRINT ONBOARDING PROMPT
  if (authState === 'biometricsPrompt') {
    return (
      <div className="min-h-screen bg-[#14231a] text-slate-100 flex flex-col justify-center p-6 max-w-md mx-auto shadow-2xl relative border-x border-emerald-900/30">
        <div className="bg-[#192c21] rounded-3xl border border-emerald-800/40 p-5 space-y-6 text-center shadow-2xl relative overflow-hidden">
          
          <div className="space-y-2">
            <h2 className="text-xl font-black text-white flex items-center justify-center gap-1.5">
              <Fingerprint className="w-5.5 h-5.5 text-emerald-400" /> Biometric Access
            </h2>
            <p className="text-xs text-slate-450 px-2 leading-relaxed">Enable Touch ID / Fingerprint scanner for fast verification bypass.</p>
          </div>

          {/* Interactive Hardware Scan Simulation Container */}
          <div className="py-4 flex justify-center">
            <button 
              onClick={() => executeBiometricScanMock(true)}
              disabled={isScanning}
              className={`w-24 h-24 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                isScanning 
                  ? 'border-amber-400 bg-amber-500/10 animate-pulse text-amber-450 scale-105' 
                  : 'border-emerald-500/30 bg-emerald-950/20 hover:border-emerald-400 text-emerald-400 hover:scale-105 active:scale-95'
              }`}
              title="Touch sensor area"
            >
              <Fingerprint className="w-12 h-12" />
            </button>
          </div>

          {isScanning && (
            <div className="text-xs font-mono text-amber-400 animate-pulse uppercase tracking-wider font-extrabold">
              Calling System API Sensor...
            </div>
          )}

          {!isScanning && (
            <div className="space-y-2 pt-2">
              <button 
                onClick={() => executeBiometricScanMock(true)}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer border-none"
              >
                Register Device Fingerprint
              </button>
              <button 
                onClick={() => executeBiometricScanMock(false)}
                className="w-full py-2 text-slate-450 hover:text-slate-350 font-extrabold text-xs transition cursor-pointer bg-transparent border-none"
              >
                Skip, Use Standard Session Token
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Intercept layout rendering: use high-density Desktop dashboard on laptop/tablet viewports
  // Intercept layout rendering: only use high-density Desktop dashboard if physical viewport is tablet/laptop and full width is active
  const isWideScreen = typeof window !== 'undefined' && window.innerWidth >= 768;
  if (role === 'admin' && isPreviewFullWidth && isWideScreen) {
    return renderAdminDesktopDashboard();
  }

  return (
    <>
    {renderGlobalOverlays()}
    <div style={badmintonBgStyle} className={`min-h-screen flex flex-col font-sans relative transition-all duration-350 ${
      isPreviewFullWidth ? 'w-full' : 'max-w-md mx-auto shadow-2xl border-x border-emerald-900/30'
    } ${styles.canvas}`}>
      
      {/* --- SIMULATION STATUS WIDGET PANEL --- */}
      <section className={`p-3 border-b flex flex-col gap-2 transition-colors ${styles.subCard}`}>
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1.5 text-emerald-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Simulation Dashboard
          </div>
          <button 
            onClick={handleResetData}
            className={`flex items-center gap-1 transition ${styles.textMuted} hover:text-rose-500`}
            title="Reset system variables"
          >
            <RotateCcw className="w-3 h-3" />
            Reset State
          </button>
        </div>

        {/* Time Toggles */}
        <div className="grid grid-cols-4 gap-1.5 text-[10px] font-bold">
          <button 
            onClick={() => setSimulatedTime('17:15')}
            className={`py-1.5 px-1 rounded-lg border text-center transition ${
              simulatedTime === '17:15' 
                ? 'bg-emerald-550 text-slate-950 border-emerald-500 font-extrabold' 
                : `${styles.btnGhost}`
            }`}
          >
            5:15 PM
            <span className="block text-[8px] font-normal opacity-70">45m left</span>
          </button>
          <button 
            onClick={() => setSimulatedTime('17:55')}
            className={`py-1.5 px-1 rounded-lg border text-center transition ${
              simulatedTime === '17:55' 
                ? 'bg-amber-500 text-slate-950 border-amber-500 font-extrabold' 
                : `${styles.btnGhost}`
            }`}
          >
            5:55 PM
            <span className="block text-[8px] font-normal opacity-70">5m left</span>
          </button>
          <button 
            onClick={() => setSimulatedTime('18:00')}
            className={`py-1.5 px-1 rounded-lg border text-center transition ${
              simulatedTime === '18:00' 
                ? 'bg-rose-550 text-white border-rose-500 font-extrabold' 
                : `${styles.btnGhost}`
            }`}
          >
            6:00 PM
            <span className="block text-[8px] font-normal opacity-70">Cutoff</span>
          </button>
          <button 
            onClick={() => setSimulatedTime('18:15')}
            className={`py-1.5 px-1 rounded-lg border text-center transition ${
              simulatedTime === '18:15' 
                ? 'bg-rose-600 text-white border-rose-600 font-extrabold' 
                : `${styles.btnGhost}`
            }`}
          >
            6:15 PM
            <span className="block text-[8px] font-normal opacity-70">Locked</span>
          </button>
        </div>

        {/* Date Toggles */}
        <div className="flex gap-2 items-center text-xs">
          <span className={`${styles.textMuted} font-semibold shrink-0`}>Simulated Date:</span>
          <button
            onClick={() => setSimulatedDay('current')}
            className={`flex-1 py-1 rounded-lg border font-bold text-[10px] transition ${
              simulatedDay === 'current'
                ? 'bg-emerald-500 text-slate-950 border-emerald-555'
                : `${styles.btnGhost}`
            }`}
          >
            Aug 05 (Grace period)
          </button>
          <button
            onClick={() => setSimulatedDay('due')}
            className={`flex-1 py-1 rounded-lg border font-bold text-[10px] transition ${
              simulatedDay === 'due'
                ? 'bg-amber-500 text-slate-950 border-amber-500'
                : `${styles.btnGhost}`
            }`}
          >
            Aug 11 (Overdue post 10th)
          </button>
        </div>
        {/* Layout Preview Mode */}
        <div className="flex gap-2 items-center text-xs">
          <span className={`${styles.textMuted} font-semibold shrink-0`}>Preview Screen:</span>
          <button
            type="button"
            onClick={() => setIsPreviewFullWidth(false)}
            className={`flex-1 py-1 rounded-lg border font-bold text-[10px] transition cursor-pointer ${
              !isPreviewFullWidth
                ? 'bg-emerald-500 text-slate-950 border-emerald-500 font-extrabold'
                : `${styles.btnGhost}`
            }`}
          >
            📱 Mobile View
          </button>
          <button
            type="button"
            onClick={() => setIsPreviewFullWidth(true)}
            className={`flex-1 py-1 rounded-lg border font-bold text-[10px] transition cursor-pointer ${
              isPreviewFullWidth
                ? 'bg-emerald-500 text-slate-950 border-emerald-500 font-extrabold'
                : `${styles.btnGhost}`
            }`}
          >
            💻 Laptop/Tablet
          </button>
        </div>

        <div className={`flex justify-between items-center text-[10px] p-2 rounded-lg border transition-colors ${styles.canvas}`}>
          <span className={styles.textMuted}>Clock: <strong className={styles.textPrimary}>{formatTime(simulatedTime)}</strong></span>
          <span className={styles.textMuted}>Date Context: <strong className="text-emerald-500 font-bold">{simulatedDay === 'due' ? 'August 11, 2026' : 'August 5, 2026'}</strong></span>
        </div>
      </section>

      {/* --- INTERACTIVE BADMINTON LOADER OVERLAY --- */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#0f1b14]/95 z-55 flex flex-col items-center justify-center space-y-4 animate-fadeIn">
          <div className="relative w-16 h-16 animate-bounce">
            <svg viewBox="0 0 64 64" className="w-16 h-16 text-emerald-400 animate-spin" style={{ animationDuration: '2.5s' }}>
              <path fill="currentColor" d="M32 4C24 20 22 40 32 52C42 40 40 20 32 4Z" opacity="0.3"/>
              <path fill="currentColor" d="M26 20 L38 20 M24 32 L40 32 M22 42 L42 42" stroke="currentColor" strokeWidth="2"/>
              <circle cx="32" cy="56" r="6" fill="#f43f5e" />
            </svg>
          </div>
          <span className="text-xs tracking-widest text-emerald-500 font-extrabold uppercase animate-pulse">Syncing Courts...</span>
        </div>
      )}

      {/* --- APP SHELL HEADER --- */}
      <header className={`backdrop-blur-md border-b px-4 py-3 sticky top-0 z-40 flex items-center justify-between transition-colors ${styles.header}`}>
        <div className="flex items-center gap-2">
          {currentScreen !== 'slotDetails' && currentScreen !== 'adminHub' && (
            <button 
              onClick={() => navigateTo(role === 'admin' ? 'adminHub' : 'slotDetails')}
              className={`p-1 rounded-full transition-all ${
                isDark ? 'text-slate-400 hover:text-slate-100 hover:bg-emerald-900/30' : 'text-slate-500 hover:text-slate-900 hover:bg-emerald-55'
              }`}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-emerald-500 to-emerald-300 bg-clip-text text-transparent">JBC</span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Role switcher */}
          <div className={`flex p-0.5 rounded-lg border text-xs shadow-inner ${
            isDark ? 'bg-slate-950/80 border-emerald-900/40' : 'bg-slate-200/40 border-slate-250'
          }`}>
            <button 
              className={`px-2.5 py-1 rounded transition-all font-bold cursor-pointer ${
                role === 'member' 
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10' 
                  : (isDark ? 'text-slate-400 hover:text-slate-205' : 'text-slate-500 hover:text-slate-800')
              }`}
              onClick={() => { 
                setRole('member'); 
                navigateTo('slotDetails'); 
              }}
            >
              Member
            </button>
            <button 
              className={`px-2.5 py-1 rounded transition-all font-bold cursor-pointer ${
                role === 'admin' 
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10' 
                  : (isDark ? 'text-slate-400 hover:text-slate-205' : 'text-slate-500 hover:text-slate-800')
              }`}
              onClick={() => { 
                setRole('admin'); 
                navigateTo('adminHub'); 
              }}
            >
              Admin
            </button>
          </div>

          {/* Light/Dark Toggle */}
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`p-1.5 rounded-xl transition border cursor-pointer ${
              isDark 
                ? 'bg-[#192c21] border-emerald-800/30 text-amber-400 hover:bg-[#203a2b]' 
                : 'bg-slate-100 border-slate-200 text-indigo-650 hover:bg-slate-200 shadow-inner'
            }`}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowProfilePanel(!showProfilePanel);
                setShowNotificationPanel(false); // Close notification panel if open
              }}
              className={`p-1.5 rounded-xl transition border cursor-pointer relative ${
                isDark 
                  ? 'bg-[#192c21] border-emerald-800/30 text-emerald-450 hover:bg-[#203a2b]' 
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-205 shadow-inner'
              }`}
              title="Profile Menu"
            >
              <User className="w-4 h-4" />
            </button>

            {/* Profile Dropdown Panel */}
            {showProfilePanel && (
              <div className={`absolute right-0 mt-2.5 w-64 rounded-2xl border shadow-xl p-4 space-y-4.5 z-50 transition-all ${
                isDark ? 'bg-[#192c21] border-emerald-800/35 text-white' : 'bg-white border-slate-250 text-slate-800'
              }`}>
                <div className="flex items-center justify-between border-b pb-2 transition-colors border-emerald-800/10">
                  <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-500" /> Member Profile
                  </h3>
                  <button 
                    onClick={() => setShowProfilePanel(false)}
                    className={`p-1 rounded-md transition cursor-pointer ${isDark ? 'hover:bg-emerald-900/30 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Profile Details */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className={styles.textMuted}>Name:</span>
                    <span className={`font-bold ${styles.textPrimary}`}>Rahul K.</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={styles.textMuted}>Mobile:</span>
                    <span className={`font-mono font-bold ${styles.textPrimary}`}>+91 98765 43210</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={styles.textMuted}>Email:</span>
                    <span className={`font-bold ${styles.textPrimary}`}>rahul.k@gmail.com</span>
                  </div>
                </div>

                {/* Logout Button */}
                <button
                  onClick={(e) => {
                    if (!e.isTrusted) return; // Prevent Responsively App click-sync from logging out
                    setShowProfilePanel(false);
                    alert('Logging out of JBC Badminton System... State has been reset.');
                    localStorage.removeItem('smashsync_members');
                    localStorage.removeItem('smashsync_theme');
                    window.location.reload();
                  }}
                  className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 hover:text-rose-455 border border-rose-500/20 hover:border-rose-500/35 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Log Out
                </button>
              </div>
            )}
          </div>

          {/* Notification Bell Icon with Dropdown List (Moved to last!) */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotificationPanel(!showNotificationPanel);
                setShowProfilePanel(false); // Close profile panel if open
              }}
              className={`p-1.5 rounded-xl transition border cursor-pointer relative ${
                isDark 
                  ? 'bg-[#192c21] border-emerald-800/30 text-emerald-455 hover:bg-[#203a2b]' 
                  : 'bg-slate-100 border-slate-205 text-slate-700 hover:bg-slate-200 shadow-inner'
              }`}
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {(activeBroadcasts.length > 0 || (role === 'member' && !userPaymentPaid)) && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
              )}
            </button>

            {/* Notification Dropdown Panel */}
            {showNotificationPanel && (
              <div className={`absolute right-0 mt-2.5 w-72 rounded-2xl border shadow-xl p-4 space-y-3 z-50 transition-all ${
                isDark ? 'bg-[#192c21] border-emerald-800/35 text-white' : 'bg-white border-slate-250 text-slate-800'
              }`}>
                <div className="flex items-center justify-between border-b pb-2 transition-colors border-emerald-800/10">
                  <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-emerald-500" /> Notifications
                  </h3>
                  <button 
                    onClick={() => setShowNotificationPanel(false)}
                    className={`p-1 rounded-md transition cursor-pointer ${isDark ? 'hover:bg-emerald-900/30 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {/* Payment pending warning for members */}
                  {role === 'member' && !userPaymentPaid && (
                    <div 
                      onClick={() => {
                        navigateTo('payments');
                        setShowNotificationPanel(false);
                      }}
                      className={`p-2.5 rounded-xl border text-[11px] leading-relaxed cursor-pointer transition ${
                        isDark ? 'bg-amber-500/5 border-amber-500/20 text-amber-305 hover:bg-amber-500/10' : 'bg-amber-55 border-amber-205 text-amber-900 hover:bg-amber-100'
                      }`}
                    >
                      <span className="font-bold block uppercase tracking-wide text-[8px] text-amber-500 mb-0.5">⚠️ Payment Action Required</span>
                      August Subscription Fee is overdue. Tap here to pay & avoid check-in lockouts.
                    </div>
                  )}

                  {/* Active global broadcasts */}
                  {activeBroadcasts.length === 0 && (role === 'admin' || userPaymentPaid) ? (
                    <div className={`text-center py-4 text-[10px] ${styles.textMuted}`}>
                      No active alerts or announcements.
                    </div>
                  ) : (
                    activeBroadcasts.map((log) => (
                      <div key={log.id} className={`p-2.5 rounded-xl border text-[11px] leading-relaxed ${
                        isDark ? 'bg-emerald-950/20 border-emerald-800/20 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`font-bold uppercase tracking-wide text-[8px] ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>Announcement</span>
                          <span className={`text-[8px] ${styles.textMuted}`}>{log.date}</span>
                        </div>
                        {log.content}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* --- NOTIFICATION REGISTRATION PROMPT BANNER --- */}
      {notificationPermission !== 'granted' && notificationPermission !== 'denied' && (
        <div className={`border-b px-4 py-2.5 flex items-center justify-between text-xs animate-fadeIn transition-colors ${
          isDark 
            ? 'bg-gradient-to-r from-emerald-950/80 to-slate-900 border-emerald-500/20 text-slate-300' 
            : 'bg-gradient-to-r from-emerald-50 to-slate-105 border-emerald-200 text-slate-700'
        }`}>
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-500 animate-pulse shrink-0" />
            <span>Enable alerts for 1-hour cutoff reminders?</span>
          </div>
          <button 
            onClick={requestNotificationPermission}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-2.5 py-1 rounded font-bold transition whitespace-nowrap shadow-sm cursor-pointer"
          >
            Allow
          </button>
        </div>
      )}

      {/* --- BROADCAST HEADLINE PANEL FOR MEMBERS --- */}
      {/* --- BROADCAST HEADLINE PANEL FOR MEMBERS --- */}
      {role === 'member' && activeBroadcasts.length > 0 && !dismissedBroadcast && (
        <div className={`px-4 py-2.5 text-xs flex items-start gap-2.5 border-b transition-all ${
          isDark 
            ? 'bg-[#241314]/80 border-rose-900/20 text-rose-250' 
            : 'bg-rose-50 border-rose-100 text-rose-900'
        }`}>
          <MessageSquare className="w-4 h-4 text-rose-505 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className={`font-extrabold uppercase tracking-wider text-[9px] block ${
              isDark ? 'text-rose-400' : 'text-rose-600'
            }`}>
              Notice Bulletin
            </span>
            <p className={`font-semibold mt-0.5 ${
              isDark ? 'text-slate-205' : 'text-rose-950'
            }`}>
              {activeBroadcasts[0].content}
            </p>
          </div>
          
          <button
            onClick={() => setDismissedBroadcast(true)}
            className={`p-1 rounded-md transition-all hover:scale-105 active:scale-95 cursor-pointer ${
              isDark ? 'hover:bg-rose-900/20 text-slate-450 hover:text-slate-200' : 'hover:bg-rose-105 text-rose-700 hover:text-rose-900'
            }`}
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* --- APP BODY DISPLAY ARCHITECTURE --- */}
      <main className="flex-1 p-4 overflow-y-auto space-y-4 pb-24">
        
        {/* VIEW 1: MEMBER TODAY'S SLOT MODULE */}
        {role === 'member' && currentScreen === 'slotDetails' && (
          <div className="space-y-4 animate-fadeIn">
            
            {/* Payment Overdue Notification Banner (post-10th & unpaid) */}
            {simulatedDay === 'due' && !userPaymentPaid && (
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-3.5 rounded-2xl text-slate-950 flex items-center justify-between shadow-lg border border-amber-400/20 animate-fadeIn">
                <div className="space-y-0.5">
                  <h4 className="font-black text-xs uppercase tracking-tight flex items-center gap-1">
                    <DollarSign className="w-4 h-4" /> Monthly Fee Overdue
                  </h4>
                  <p className="text-[11px] font-semibold opacity-95">Membership fees were due on the 10th. Actions restricted.</p>
                </div>
                <button 
                  onClick={() => navigateTo('payments')}
                  className="bg-slate-950 hover:bg-slate-900 text-amber-400 text-xs px-3 py-1.5 rounded-xl font-extrabold transition shadow flex items-center gap-1 cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" /> Pay
                </button>
              </div>
            )}

            {/* Club and Batch Titles */}
            <div className="flex flex-col gap-0.5">
              <h1 className={`text-lg font-extrabold tracking-tight flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                <Building2 className="w-5 h-5 text-emerald-500" />
                Smashers Badminton Academy
              </h1>
              <p className={`text-xs font-semibold ${styles.textMuted}`}>
                Batch: <span className={isDark ? 'text-slate-205' : 'text-slate-800'}>Elite Smashers - Advanced Batch</span>
              </p>
            </div>

            {/* Today's Active Slot Card */}
            <div className={`p-5 rounded-2xl border space-y-4 shadow-lg transition-all ${styles.card}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h2 className={`text-lg font-black flex items-center gap-2 transition-colors ${styles.textPrimary}`}>
                    <Clock className="w-5 h-5 text-emerald-500" /> Evening 7:00 PM
                  </h2>
                  <p className={`text-xs mt-0.5 flex items-center gap-1 ${styles.textMuted}`}>
                    <MapPin className="w-3.5 h-3.5 text-slate-500" /> Downtown Hub • Court 2
                  </p>
                </div>
                <span className="bg-emerald-500/10 text-emerald-600 text-[10px] px-2.5 py-1 rounded-full border border-emerald-500/20 font-extrabold tracking-wider uppercase">
                  Advanced
                </span>
              </div>

              {/* Lockdown Banner Warning */}
              <div className={`p-3 rounded-xl flex items-start gap-3 text-xs leading-relaxed transition-all ${
                isLocked 
                  ? (isDark ? 'bg-rose-500/15 border border-rose-500/30 text-rose-350' : 'bg-rose-50 border border-rose-200 text-rose-700')
                  : (isDark ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300' : 'bg-emerald-50 border border-emerald-250 text-emerald-700')
              }`}>
                <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  {isLocked ? (
                    <>
                      <p className="font-bold">🔒 Attendance Locked</p>
                      <p className="mt-0.5 opacity-90">Registration closed exactly 1 hour before the slot.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold">🟢 Attendance check in is open</p>
                      <p className="mt-0.5 opacity-90">{timeRemaining} minutes remaining to adjust your attendance status.</p>
                    </>
                  )}
                </div>
              </div>

              {/* Attendance Selector Display */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className={`font-bold ${styles.textMuted}`}>Attendance Selection:</span>
                  {userRsvp === 'Present' ? (
                    <span className="text-emerald-500 font-extrabold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Confirmed Attending
                    </span>
                  ) : userRsvp === 'Maybe' ? (
                    <span className="text-amber-500 font-extrabold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Maybe
                    </span>
                  ) : userRsvp === 'No' ? (
                    <span className="text-rose-500 font-extrabold flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 text-rose-500" /> Not Attending
                    </span>
                  ) : (
                    <span className="text-slate-450 font-bold animate-pulse">Pending Registration</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    disabled={isLocked}
                    onClick={() => handleSetRsvpStatus('Present')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all transform active:scale-95 shadow cursor-pointer ${
                      isLocked
                        ? (userRsvp === 'Present' ? 'bg-[#203a2b] text-slate-400 border border-emerald-900/30' : 'bg-[#0b140f]/40 text-slate-600 cursor-not-allowed opacity-50')
                        : (userRsvp === 'Present' ? 'bg-sky-500 text-white font-black shadow shadow-sky-500/10' : `${styles.btnGhost}`)
                    }`}
                  >
                    {isLocked && userRsvp === 'Present' ? '🔒 Yes' : 'Yes, Attending'}
                  </button>

                  <button
                    disabled={isLocked}
                    onClick={() => handleSetRsvpStatus('Maybe')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all transform active:scale-95 shadow cursor-pointer ${
                      isLocked
                        ? (userRsvp === 'Maybe' ? 'bg-[#203a2b] text-slate-400 border border-emerald-900/30' : 'bg-[#0b140f]/40 text-slate-600 cursor-not-allowed opacity-50')
                        : (userRsvp === 'Maybe' ? 'bg-amber-400 text-slate-950 font-black shadow shadow-amber-500/10' : `${styles.btnGhost}`)
                    }`}
                  >
                    {isLocked && userRsvp === 'Maybe' ? '🔒 Maybe' : 'Maybe'}
                  </button>

                  <button
                    disabled={isLocked}
                    onClick={() => handleSetRsvpStatus('No')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all transform active:scale-95 shadow cursor-pointer ${
                      isLocked
                        ? (userRsvp === 'No' ? 'bg-[#203a2b] text-slate-400 border border-emerald-900/30' : 'bg-[#0b140f]/40 text-slate-600 cursor-not-allowed opacity-50')
                        : (userRsvp === 'No' ? 'bg-rose-500/20 text-rose-450 border border-rose-500/30 font-black' : 'bg-rose-50 text-rose-600 border border-rose-205 font-black')
                    }`}
                  >
                    {isLocked && userRsvp === 'No' ? '🔒 No' : 'Not Attending'}
                  </button>
                </div>
              </div>
            </div>
            {/* Batch Roster section */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-bold flex items-center gap-1.5 ${styles.textPrimary}`}>
                  <Users className="w-4.5 h-4.5 text-emerald-500" />
                  Roster Visibility
                </h3>
                <span className={`text-xs font-bold font-mono px-2.5 py-0.5 rounded-full border transition-colors ${
                  isDark ? 'text-slate-350 bg-[#0f1b14] border-emerald-905' : 'text-slate-600 bg-white border-emerald-150 shadow-sm'
                }`}>
                  {b1Roster.filter(m => m.rsvpStatus === 'Present').length} Yes • {b1Roster.filter(m => m.rsvpStatus === 'Maybe').length} Maybe • {b1Roster.filter(m => m.rsvpStatus === 'No' || m.rsvpStatus === 'Pending' || m.rsvpStatus === 'Late Cancel').length} No
                </span>
              </div>
              
              <div className={`rounded-2xl border overflow-hidden divide-y transition-all ${
                isDark ? 'bg-[#192c21] border-emerald-800/30 divide-emerald-900/35' : 'bg-white border-emerald-150 divide-emerald-50'
              }`}>
                {b1Roster.map((member) => (
                  <div 
                    key={member.id} 
                    className={`p-3.5 flex justify-between items-center text-sm transition-all ${
                      member.id === 'm1' 
                        ? (member.rsvpStatus === 'Present' 
                            ? (isDark ? 'bg-emerald-550/5 border-l-2 border-emerald-550 pl-3 font-semibold' : 'bg-emerald-50/50 border-l-2 border-emerald-500 pl-3 font-semibold')
                            : member.rsvpStatus === 'Maybe'
                              ? (isDark ? 'bg-amber-500/5 border-l-2 border-amber-500 pl-3 font-semibold' : 'bg-amber-50/50 border-l-2 border-amber-500 pl-3 font-semibold')
                              : (isDark ? 'bg-rose-500/5 border-l-2 border-rose-500 pl-3 font-semibold' : 'bg-rose-50/50 border-l-2 border-rose-500 pl-3 font-semibold'))
                        : 'bg-transparent'
                    }`}
                  >
                    <span className={member.id === 'm1' 
                      ? (member.rsvpStatus === 'Present' ? 'text-sky-400 font-bold' : member.rsvpStatus === 'Maybe' ? 'text-amber-500 font-bold' : 'text-rose-500 font-bold') 
                      : (isDark ? 'text-slate-200' : 'text-slate-700')}>
                      {member.name}
                    </span>
                    
                    <span className={`text-xs font-mono px-2.5 py-0.5 rounded-md border transition-colors ${
                      member.rsvpStatus === 'Present' 
                        ? (isDark ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                        : member.rsvpStatus === 'Maybe'
                          ? (isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-705 border-amber-200')
                          : (isDark ? 'bg-rose-500/10 text-rose-450 border-rose-500/20' : 'bg-rose-50 text-rose-605 border-rose-200')
                    }`}>
                      {member.rsvpStatus === 'Present' 
                        ? 'Yes' 
                        : member.rsvpStatus === 'Maybe' 
                          ? 'Maybe' 
                          : 'No'}
                    </span>
                  </div>
                ))}
              </div>
                  </div>
          </div>
        )}

        {/* VIEW 2: MEMBER WORKFLOW HISTORY LOG */}
        {role === 'member' && currentScreen === 'history' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Stats Block */}
            <div className={`p-5 rounded-2xl border shadow-xl space-y-4 transition-all ${styles.card}`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors ${
                  isDark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-55 border-emerald-200'
                }`}>
                  <Trophy className="w-6 h-6 text-emerald-505" />
                </div>
                <div>
                  <h2 className={`text-base font-bold transition-colors ${styles.textPrimary}`}>Rahul K.</h2>
                  <p className={`text-xs ${styles.textMuted}`}>Club Member since Jan 2026</p>
                </div>
              </div>

              <div className={`grid grid-cols-3 gap-2 pt-2 border-t text-center transition-colors ${
                isDark ? 'border-emerald-900/30' : 'border-emerald-150'
              }`}>
                <div>
                  <span className={`text-[10px] font-extrabold uppercase block tracking-wider font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Sessions</span>
                  <span className={`text-2xl font-black mt-1 block font-mono ${styles.textPrimary}`}>{presentCount}</span>
                </div>
                <div className={`border-x ${isDark ? 'border-emerald-900/30' : 'border-emerald-150'}`}>
                  <span className={`text-[10px] font-extrabold uppercase block tracking-wider font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Attendance</span>
                  <span className="text-2xl font-black text-sky-450 mt-1 block font-mono">{attendanceRate}%</span>
                </div>
                <div>
                  <span className={`text-[10px] font-extrabold uppercase block tracking-wider font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Absent / Cancel</span>
                  <span className="text-2xl font-black text-rose-500 mt-1 block font-mono">{absentCount}</span>
                </div>
              </div>
            </div>

            {/* Premium Scrolling Calendar Widget */}
            <div className={`p-4 rounded-2xl border transition-all ${styles.card}`}>
              {/* Month Selector */}
              <div className="flex justify-between items-center mb-4 px-1">
                <button 
                  onClick={() => handleMonthScroll('prev')}
                  className={`p-1.5 rounded-full transition ${isDark ? 'hover:bg-emerald-900/30' : 'hover:bg-emerald-50'}`}
                >
                  <ChevronLeft className={`w-5 h-5 ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`} />
                </button>
                <div className={`font-black text-sm tracking-wide transition-colors ${styles.textPrimary}`}>
                  {monthsList[currentMonthIndex]}, {currentYear}
                </div>
                <button 
                  onClick={() => handleMonthScroll('next')}
                  className={`p-1.5 rounded-full transition ${isDark ? 'hover:bg-emerald-900/30' : 'hover:bg-emerald-50'}`}
                >
                  <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`} />
                </button>
              </div>

              {/* Day Labels */}
              <div className={`grid grid-cols-7 text-center text-[9px] font-bold uppercase tracking-widest mb-2 transition-colors border-b pb-2 ${
                isDark ? 'text-slate-500 border-emerald-900/20' : 'text-slate-400 border-emerald-100'
              }`}>
                <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
              </div>

              {/* Calendar Grid Cells */}
              <div className="grid grid-cols-7 gap-y-2.5 justify-items-center items-center text-xs font-semibold">
                {calendarCells.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} className="w-8 h-8" />;
                  
                  const isCurrentlySelected = selectedDay === day;

                  let statusClass = isDark 
                    ? 'text-slate-500 border border-transparent hover:border-emerald-800 hover:text-slate-355' 
                    : 'text-slate-405 border border-transparent hover:border-emerald-150 hover:text-slate-700';

                  let statusType = null;

                  // 1. November 2015 layout verification matching user reference image
                  if (currentMonthIndex === 10 && currentYear === 2015) {
                    statusType = CALENDAR_STATUS_MAP[day];
                  }
                  // 2. August 2026 active simulated month
                  else if (currentMonthIndex === 7 && currentYear === 2026) {
                    const dayData = calendarData[day];
                    if (dayData) {
                      if (dayData.status === 'Present') statusType = 'session';
                      else if (dayData.status === 'Absent') statusType = 'cancelled';
                      else if (dayData.status === 'Maybe') statusType = 'pending-fee';
                    }
                  }
                  // 3. Fallback mock logs for any other scrolled months to keep it colorful
                  else {
                    const date = new Date(currentYear, currentMonthIndex, day);
                    const dayOfWeek = date.getDay();
                    if (dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5) {
                      statusType = 'session'; // Mon, Wed, Fri
                    } else if (dayOfWeek === 2 || dayOfWeek === 4) {
                      statusType = 'pending-fee'; // Tue, Thu
                    } else if (dayOfWeek === 6 && day % 12 === 0) {
                      statusType = 'cancelled'; // select Saturdays
                    }
                  }

                  // Class assignment based on statusType (November Image style)
                  if (statusType === 'session' || statusType === 'selected') {
                    statusClass = 'bg-sky-500 text-white font-bold shadow shadow-sky-500/20';
                  } else if (statusType === 'cancelled') {
                    statusClass = 'bg-rose-500 text-white font-bold shadow shadow-rose-955/20';
                  } else if (statusType === 'pending-fee') {
                    statusClass = 'bg-amber-400 text-slate-950 font-black shadow shadow-amber-500/20';
                  }

                  const activeRing = isCurrentlySelected 
                    ? (isDark 
                        ? 'ring-4 ring-emerald-500/40 border border-white/50 scale-105 z-10' 
                        : 'ring-4 ring-emerald-500/30 border border-slate-700/50 scale-105 z-10')
                    : '';

                  return (
                    <button 
                      key={`day-${day}`}
                      onClick={() => setSelectedDay(day)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition duration-150 ${statusClass} ${activeRing}`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              {/* Calendar Legend */}
              <div className={`mt-5 pt-3.5 border-t flex flex-wrap gap-x-4 gap-y-1.5 justify-center text-[10px] font-bold transition-colors ${
                isDark ? 'border-emerald-900/20 text-slate-400' : 'border-emerald-100 text-slate-500'
              }`}>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500 block shadow shadow-sky-500/25" />
                  <span>Attended</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 block shadow shadow-rose-955/25" />
                  <span>Absent / Cancelled</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 block shadow shadow-amber-500/25" />
                  <span>Pending / Maybe</span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* VIEW 3: MEMBER BILLING PROFILE / GATEWAY SIMULATOR */}
        {role === 'member' && currentScreen === 'payments' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex flex-col gap-0.5">
              <h1 className={`text-lg font-extrabold tracking-tight flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                <CreditCard className="w-5 h-5 text-emerald-500" />
                Monthly Subscriptions
              </h1>
              <p className={`text-xs ${styles.textMuted}`}>August Club Fee ledger & receipts</p>
            </div>

            {/* Billing Card */}
            <div className={`p-5 rounded-2xl border space-y-4 transition-all ${styles.card}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className={`text-base font-black transition-colors ${styles.textPrimary}`}>August Subscription Fee</h3>
                  <p className={`text-xs mt-0.5 ${styles.textMuted}`}>Elite Smashers - Advanced Batch</p>
                </div>
                <span className={`text-[11px] font-extrabold uppercase px-3 py-1 rounded-full border transition-colors ${
                  userPaymentPaid 
                    ? (isDark ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                    : (isDark ? 'bg-amber-500/10 text-amber-450 border-amber-500/20' : 'bg-amber-50 text-amber-705 border-amber-250')
                }`}>
                  {userPaymentPaid ? 'Paid' : 'Pending'}
                </span>
              </div>

              <div className="flex items-baseline gap-1.5 py-2 border-y transition-colors border-emerald-800/10">
                <span className="text-3xl font-black text-emerald-500 font-mono">₹{getMemberMonthlyRate('m1').toLocaleString()}</span>
                <span className={`text-xs font-semibold ${styles.textMuted}`}>/ month</span>
              </div>

              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className={styles.textMuted}>Due Date:</span>
                  <span className={`font-semibold ${styles.textPrimary}`}>10th of every month</span>
                </div>
                <div className="flex justify-between">
                  <span className={styles.textMuted}>Billing Cycle:</span>
                  <span className={`font-semibold ${styles.textPrimary}`}>Aug 1 - Aug 31, 2026</span>
                </div>
              </div>

              {/* Mock Settle Action */}
              {!userPaymentPaid ? (
                <div className="pt-2 space-y-2">
                  <button
                    onClick={handleAuthorizePayment}
                    className="w-full py-3.5 bg-[#10b981] hover:bg-[#0d9468] text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer border-none"
                  >
                    <DollarSign className="w-4 h-4 text-slate-950" />
                    Authorize Settle (UPI / CARD)
                  </button>
                  <p className={`text-[9px] text-center leading-normal ${styles.textMuted}`}>
                    *Note: This is a static demonstration simulating local payment collection processing endpoints.
                  </p>
                </div>
              ) : (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 transition-all ${
                  isDark ? 'bg-sky-950/20 border-sky-500/20 text-sky-400' : 'bg-emerald-50 border-emerald-200 text-emerald-850'
                }`}>
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Invoice fully settled. Receipt logged in system ledger profile.</span>
                </div>
              )}
            </div>

            {/* Past Payments History Ledger */}
            <div className="space-y-3 pt-2">
              <h3 className={`text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                Receipts & Payment History
              </h3>

              <div className="space-y-2.5">
                {/* Dynamically display active August cycle if settled */}
                {userPaymentPaid && (
                  <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${styles.card}`}>
                    <div className="space-y-0.5">
                      <h4 className={`text-xs font-bold transition-colors ${styles.textPrimary}`}>August Subscription</h4>
                      <p className={`text-[10px] ${styles.textMuted}`}>Paid on Aug 11, 2026 • Txn: SS-UPI-99238</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-mono">₹{getMemberMonthlyRate('m1').toLocaleString()}</span>
                      <button
                        onClick={() => handleDownloadReceipt('August', '2026', getMemberMonthlyRate('m1').toLocaleString(), 'Aug 11, 2026', 'SS-UPI-99238')}
                        className={`p-1.5 rounded-lg border transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                          isDark ? 'bg-emerald-950/20 border-emerald-800/30 text-emerald-400 hover:bg-emerald-900/20' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                        }`}
                        title="Download Receipt"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Past Cycles */}
                {[
                  { month: 'July', date: 'July 08, 2026', txn: 'SS-UPI-88412' },
                  { month: 'June', date: 'June 09, 2026', txn: 'SS-UPI-77103' },
                  { month: 'May', date: 'May 07, 2026', txn: 'SS-UPI-66291' }
                ].map((item, idx) => (
                  <div key={idx} className={`p-4 rounded-xl border flex items-center justify-between transition-all ${styles.card}`}>
                    <div className="space-y-0.5">
                      <h4 className={`text-xs font-bold transition-colors ${styles.textPrimary}`}>{item.month} Subscription</h4>
                      <p className={`text-[10px] ${styles.textMuted}`}>Paid on {item.date} • Txn: {item.txn}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-mono">₹{getMemberMonthlyRate('m1').toLocaleString()}</span>
                      <button
                        onClick={() => handleDownloadReceipt(item.month, '2026', getMemberMonthlyRate('m1').toLocaleString(), item.date, item.txn)}
                        className={`p-1.5 rounded-lg border transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                          isDark ? 'bg-emerald-950/20 border-emerald-800/30 text-emerald-400 hover:bg-emerald-900/20' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                        }`}
                        title="Download Receipt"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: ADMIN HUB CORE DASHBOARD */}
        {role === 'admin' && currentScreen === 'adminHub' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Branch Selector Dropdown */}
            <div className="space-y-1.5">
              <label className={`text-[10px] font-extrabold uppercase tracking-widest block ${styles.textMuted}`}>
                Select Active Venue Branch
              </label>
              
              <div className="relative">
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 appearance-none font-bold transition-all ${
                    isDark ? 'bg-[#192c21] border-emerald-800/30 text-white' : 'bg-white border-slate-250 text-slate-800 shadow-sm'
                  }`}
                >
                  <option value="Downtown Hub">Downtown Hub (HQ)</option>
                  <option value="Uptown Arena">Uptown Arena</option>
                  <option value="East Coast Courts">East Coast Courts</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                  <MapPin className="w-4 h-4 text-emerald-500" />
                </div>
              </div>
            </div>

            {/* Occupancy Sub-tabs (Members vs Guests) */}
            <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl border text-xs ${isDark ? 'bg-[#0f1b14] border-emerald-950/20' : 'bg-slate-100 border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setOccupancyTab('members')}
                className={`py-2 text-center rounded-lg font-bold cursor-pointer transition ${
                  occupancyTab === 'members' ? (isDark ? 'bg-emerald-500 text-slate-950 font-black shadow-inner' : 'bg-emerald-500 text-white font-black shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')
                }`}
              >
                👥 Member Occupancy
              </button>
              <button
                type="button"
                onClick={() => setOccupancyTab('guests')}
                className={`py-2 text-center rounded-lg font-bold cursor-pointer transition ${
                  occupancyTab === 'guests' ? (isDark ? 'bg-emerald-500 text-slate-950 font-black shadow-inner' : 'bg-emerald-500 text-white font-black shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')
                }`}
              >
                🎟️ Guest Occupancy
              </button>
            </div>

            {/* --- MEMBERS OCCUPANCY TAB SUB-VIEW --- */}
            {occupancyTab === 'members' && (
              <div className="space-y-5 animate-fadeIn">
                {/* Attendance Counters and Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-4 rounded-2xl border transition-all ${styles.card}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Total Confirmed Today</span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className={`text-2xl font-black transition-colors ${styles.textPrimary}`}>
                        {selectedBranch === 'Downtown Hub' 
                          ? 84 + (userRsvp === 'Present' ? 1 : 0) 
                          : selectedBranch === 'Uptown Arena' 
                            ? 52 
                            : 31}
                      </span>
                      <span className="text-xs text-slate-550 font-semibold font-mono">
                        / {selectedBranch === 'Downtown Hub' ? '110' : selectedBranch === 'Uptown Arena' ? '80' : '60'}
                      </span>
                    </div>
                    <div className={`text-[10px] mt-1 font-semibold transition-colors ${styles.textMuted}`}>
                      Maybe: {selectedBranch === 'Downtown Hub' ? (2 + (userRsvp === 'Maybe' ? 1 : 0)) : 1} Players
                    </div>
                    
                    {/* Progress bar */}
                    <div className={`w-full h-1.5 rounded-full mt-2 overflow-hidden border transition-colors ${
                      isDark ? 'bg-slate-950 border-emerald-955/20' : 'bg-slate-100 border-slate-200'
                    }`}>
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                        style={{ 
                          width: selectedBranch === 'Downtown Hub' 
                            ? `${((84 + (userRsvp === 'Present' ? 1 : 0)) / 110) * 100}%` 
                            : selectedBranch === 'Uptown Arena' 
                              ? '65%' 
                              : '51.6%' 
                        }}
                      />
                    </div>
                  </div>

                  <div className={`p-4 rounded-2xl border transition-all ${styles.card}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Utilization Rate</span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-black text-emerald-555 font-mono">
                        {selectedBranch === 'Downtown Hub' 
                          ? `${((84 + (userRsvp === 'Present' ? 1 : 0)) / 110 * 100).toFixed(1)}%` 
                          : selectedBranch === 'Uptown Arena' 
                            ? '65.0%' 
                            : '51.6%'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-semibold mt-2.5 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-emerald-500" /> +3.2% vs Last Week
                    </span>
                  </div>
                </div>

                {/* Upcoming 3-Hour Slot Monitor */}
                <div className={`p-4 rounded-2xl border space-y-3 shadow-lg transition-all ${styles.card}`}>
                  <div>
                    <h3 className={`text-sm font-bold flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                      <Clock className="w-4 h-4 text-emerald-555" />
                      Upcoming 3-Hour Slot Monitor
                    </h3>
                    <p className={`text-[10px] mt-0.5 transition-colors ${styles.textMuted}`}>Active monitoring of player count and cutoff states</p>
                  </div>

                  <div className="space-y-2 text-xs">
                    {(() => {
                      const currentHour = parseInt(simulatedTime.split(':')[0]);
                      const slots = [
                        { hour: (currentHour + 1) % 24 },
                        { hour: (currentHour + 2) % 24 },
                        { hour: (currentHour + 3) % 24 }
                      ];

                      return slots.map((s, idx) => {
                        const slotHourStr = s.hour < 10 ? `0${s.hour}:00` : `${s.hour}:00`;
                        const slotTimeStr = formatTime(slotHourStr);
                        
                        const cutoffHour = (s.hour - 1 + 24) % 24;
                        const cutoffTimeStr = formatTime(cutoffHour < 10 ? `0${cutoffHour}:00` : `${cutoffHour}:00`);

                        const slotCutoffMinutes = cutoffHour * 60;
                        const slotLocked = currentMinutes >= slotCutoffMinutes;

                        let confirmed = 0;
                        let maybe = 0;
                        if (s.hour === 19) { // 7:00 PM
                          confirmed = b1Roster.filter(m => m.rsvpStatus === 'Present').length + b2Roster.filter(m => m.rsvpStatus === 'Present').length;
                          maybe = b1Roster.filter(m => m.rsvpStatus === 'Maybe').length + b2Roster.filter(m => m.rsvpStatus === 'Maybe').length;
                        } else if (s.hour === 18) { // 6:00 PM
                          confirmed = 6;
                          maybe = 1;
                        } else { 
                          confirmed = 3;
                          maybe = 2;
                        }

                        return (
                          <div key={idx} className={`p-3 rounded-xl border flex justify-between items-center gap-2 transition-colors ${styles.subCard}`}>
                            <div>
                              <div className={`font-extrabold flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-555" />
                                {slotTimeStr}
                              </div>
                              <div className="text-[10px] text-slate-505 mt-0.5">
                                Cutoff: {cutoffTimeStr}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className={`font-bold font-mono transition-colors ${styles.textPrimary}`}>
                                {confirmed} Yes • {maybe} Maybe
                              </div>
                              <span className={`inline-block mt-1 text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded tracking-wide border ${
                                slotLocked 
                                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' 
                                  : 'bg-emerald-500/10 text-emerald-650 border-emerald-500/20'
                              }`}>
                                {slotLocked ? '🔒 Locked' : 'Active Check-in'}
                              </span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Live Court Attendance Tracker */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className={`text-sm font-bold flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                      <Award className="w-4.5 h-4.5 text-emerald-500" />
                      Live Court Allocation
                    </h3>
                    <span className={`text-xs font-mono px-2.5 py-0.5 rounded border transition-colors ${
                      isDark ? 'text-slate-400 bg-[#0f1b14] border-emerald-905' : 'text-slate-500 bg-white border-emerald-155 shadow-sm'
                    }`}>
                      Evening 7:00 PM Batch
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Court 1 */}
                    <div className={`p-4 rounded-2xl border flex flex-col gap-2.5 transition-all ${styles.card}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className={`text-xs font-bold flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                            Court 1 <span className="text-slate-505 font-normal">| Beginners</span>
                          </h4>
                          <p className={`text-[10px] mt-0.5 transition-colors ${styles.textMuted}`}>Capacity Check: Safe capacity threshold</p>
                        </div>
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border transition-colors ${
                          isDark ? 'text-slate-205 bg-slate-955 border-emerald-955/20' : 'text-slate-655 bg-slate-50 border-slate-205'
                        }`}>
                          {b2Roster.filter(m => m.rsvpStatus === 'Present').length} Confirmed {b2Roster.filter(m => m.rsvpStatus === 'Maybe').length > 0 ? `(${b2Roster.filter(m => m.rsvpStatus === 'Maybe').length} Maybe)` : ''}
                        </span>
                      </div>
                      <div className={`w-full h-2 rounded-full overflow-hidden border transition-colors ${
                        isDark ? 'bg-slate-955 border-emerald-955/20' : 'bg-slate-100 border-slate-205'
                      }`}>
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${(b2Roster.filter(m => m.rsvpStatus === 'Present').length / 8) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Court 2 */}
                    <div className={`p-4 rounded-2xl border flex flex-col gap-2.5 transition-all ${styles.card}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className={`text-xs font-bold flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                            Court 2 <span className="text-slate-505 font-normal">| Elite Smashers (You)</span>
                          </h4>
                          <p className={`text-[10px] mt-0.5 transition-colors ${styles.textMuted}`}>
                            {userRsvp === 'Present' ? '🟢 Your Check-in: Yes' : userRsvp === 'Maybe' ? '🟡 Your Check-in: Maybe' : userRsvp === 'No' ? '🔴 Your Check-in: No' : '⚪ Your Check-in: Pending'}
                          </p>
                        </div>
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border transition-colors ${
                          isDark ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' : 'text-emerald-700 bg-emerald-55 border-emerald-200 shadow-sm'
                        }`}>
                          {b1Roster.filter(m => m.rsvpStatus === 'Present').length} Confirmed {b1Roster.filter(m => m.rsvpStatus === 'Maybe').length > 0 ? `(${b1Roster.filter(m => m.rsvpStatus === 'Maybe').length} Maybe)` : ''}
                        </span>
                      </div>
                      <div className={`w-full h-2 rounded-full overflow-hidden border transition-colors ${
                        isDark ? 'bg-slate-955 border-emerald-955/20' : 'bg-slate-100 border-slate-205'
                      }`}>
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${(b1Roster.filter(m => m.rsvpStatus === 'Present').length / 8) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- GUESTS OCCUPANCY TAB SUB-VIEW --- */}
            {occupancyTab === 'guests' && (
              <div className="space-y-5 animate-fadeIn">
                {/* Guest Stats and Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-4 rounded-2xl border transition-all ${styles.card}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Total Guests Today</span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className={`text-2xl font-black transition-colors ${styles.textPrimary}`}>
                        {guests.filter(g => g.status === 'Booked').length}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold font-mono">
                        / {(guestSlots[selectedBranch] || []).length * 8 || 16} Max
                      </span>
                    </div>
                    <div className={`text-[10px] mt-1 font-semibold transition-colors ${styles.textMuted}`}>
                      Pending: {guests.filter(g => g.status === 'Pending').length} Bookings
                    </div>
                    
                    <div className={`w-full h-1.5 rounded-full mt-2 overflow-hidden border transition-colors ${
                      isDark ? 'bg-slate-955 border-emerald-955/20' : 'bg-slate-100 border-slate-200'
                    }`}>
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ 
                          width: `${(guests.filter(g => g.status === 'Booked').length / (((guestSlots[selectedBranch] || []).length * 8) || 16)) * 100}%` 
                        }}
                      />
                    </div>
                  </div>

                  <div className={`p-4 rounded-2xl border transition-all ${styles.card}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Guest Utilization</span>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-black text-emerald-555 font-mono">
                        {(((guests.filter(g => g.status === 'Booked').length) / (((guestSlots[selectedBranch] || []).length * 8) || 16)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-505 font-semibold mt-2.5 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-emerald-555" /> Configured Slots
                    </span>
                  </div>
                </div>

                {/* Upcoming Guest Slot Monitor */}
                <div className={`p-4 rounded-2xl border space-y-3 shadow-lg transition-all ${styles.card}`}>
                  <div>
                    <h3 className={`text-sm font-bold flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                      <Clock className="w-4 h-4 text-emerald-555" />
                      Upcoming Guest Slot Monitor
                    </h3>
                    <p className={`text-[10px] mt-0.5 transition-colors ${styles.textMuted}`}>Active scheduled guest bookings status</p>
                  </div>

                  <div className="space-y-2 text-xs">
                    {(guestSlots[selectedBranch] || []).length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-500 italic">No scheduled guest slots configured.</div>
                    ) : (
                      guestSlots[selectedBranch].map((slot, idx) => {
                        const confirmed = guests.filter(g => g.status === 'Booked' && g.time === slot.time).length;
                        const pending = guests.filter(g => g.status === 'Pending' && g.time === slot.time).length;
                        
                        // Compare with simulated hour
                        const currentHour = parseInt(simulatedTime.split(':')[0]);
                        const slotHour = parseInt(slot.time.split(':')[0]) + (slot.time.includes('PM') && slot.time.split(':')[0] !== '12' ? 12 : 0);
                        const slotLocked = currentHour > slotHour;

                        return (
                          <div key={idx} className={`p-3 rounded-xl border flex justify-between items-center gap-2 transition-colors ${styles.subCard}`}>
                            <div>
                              <div className={`font-extrabold flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${slot.type === 'Peak' ? 'bg-amber-500' : 'bg-emerald-555'}`} />
                                {slot.time} 
                                <span className="text-[7.5px] opacity-75 font-mono ml-1">({slot.type} • {slot.recurrence})</span>
                              </div>
                              <div className="text-[10px] text-slate-505 mt-0.5">
                                Branch: {selectedBranch}
                              </div>
                            </div>

                            <div className="text-right flex flex-col items-end gap-1">
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                                confirmed > 0
                                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              }`}>
                                {confirmed > 0 ? '🔴 Booked' : '🟢 Vacant'}
                              </span>
                              <span className={`inline-block text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded tracking-wide border ${
                                slotLocked 
                                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' 
                                  : 'bg-emerald-500/10 text-emerald-650 border-emerald-500/20'
                              }`}>
                                {slotLocked ? '🔒 Closed' : 'Active'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Live Guest Court Allocation */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className={`text-sm font-bold flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                      <Award className="w-4.5 h-4.5 text-emerald-500" />
                      Live Guest Court Allocation
                    </h3>
                    <span className={`text-xs font-mono px-2.5 py-0.5 rounded border transition-colors ${
                      isDark ? 'text-slate-400 bg-[#0f1b14] border-emerald-905' : 'text-slate-505 bg-white border-emerald-155 shadow-sm'
                    }`}>
                      Active Guest Slots Roster
                    </span>
                  </div>

                  <div className="space-y-3">
                    {['Court 1', 'Court 2'].map(court => {
                      const activeRes = guests.find(g => g.court === court && g.status === 'Booked');
                      const hasBooking = !!activeRes;

                      return (
                        <div key={court} className={`p-4 rounded-2xl border flex flex-col gap-2.5 transition-all ${styles.card}`}>
                          <div className="flex justify-between items-center">
                            <div>
                              <h4 className={`text-xs font-bold flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                                {court} <span className="text-slate-505 font-normal">| {hasBooking ? `Booked by ${activeRes.name}` : 'Unassigned / Open'}</span>
                              </h4>
                              <p className={`text-[10px] mt-0.5 transition-colors ${styles.textMuted}`}>
                                {hasBooking ? `Slot Time: ${activeRes.time} (${activeRes.type})` : 'Available for guest bookings'}
                              </p>
                            </div>
                            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border transition-colors ${
                              hasBooking 
                                ? (isDark ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' : 'text-emerald-700 bg-emerald-50 border-emerald-200 shadow-sm')
                                : (isDark ? 'text-slate-400 bg-slate-950 border-emerald-950/20' : 'text-slate-655 bg-slate-50 border-slate-200')
                            }`}>
                              {hasBooking ? 'Reserved' : 'Available'}
                            </span>
                          </div>
                          <div className={`w-full h-2 rounded-full overflow-hidden border transition-colors ${
                            isDark ? 'bg-slate-955 border-emerald-955/20' : 'bg-slate-105 border-slate-205'
                          }`}>
                            <div 
                              className={`h-full transition-all duration-300 ${hasBooking ? 'bg-emerald-500' : 'bg-slate-555/20'}`}
                              style={{ width: hasBooking ? '100%' : '0%' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {role === 'admin' && currentScreen === 'adminInventory' && (
          <div className="space-y-4 animate-fadeIn">
            <AdminInventoryManager isDark={isDark} groups={groups} />
            <button
              type="button"
              onClick={() => navigateTo('adminApps')}
              className={`w-full py-2.5 border rounded-xl text-xs font-bold transition cursor-pointer ${
                isDark ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Back to Command Center
            </button>
          </div>
        )}

        {role === 'admin' && currentScreen === 'adminApps' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex flex-col gap-0.5">
              <h1 className={`text-lg font-extrabold tracking-tight flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                <Grid className="w-5 h-5 text-emerald-500" />
                Command Center
              </h1>
              <p className={`text-xs ${styles.textMuted}`}>Administrative panels & add-on applications</p>
            </div>

            {/* Grid of Core Tools */}
            <div className="space-y-3">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-500 block">Core Utilities</span>
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  onClick={() => navigateTo('adminAddMember')}
                  className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 hover:scale-105 active:scale-95 transition-all shadow cursor-pointer ${styles.card}`}
                >
                  <User className="w-5 h-5 text-emerald-500" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wide block">Add Member</span>
                </button>
                <button
                  onClick={() => navigateTo('adminGroupManager')}
                  className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 hover:scale-105 active:scale-95 transition-all shadow cursor-pointer ${styles.card}`}
                >
                  <Users className="w-5 h-5 text-emerald-500" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wide block">Groups</span>
                </button>
                  <button
                    onClick={() => navigateTo('adminInventory')}
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 hover:scale-105 active:scale-95 transition-all shadow cursor-pointer ${styles.card}`}
                  >
                    <Calendar className="w-5 h-5 text-emerald-500" />
                    <span className="text-[9px] font-extrabold uppercase tracking-wide block">Inventory</span>
                  </button>
                <button
                  onClick={() => navigateTo('adminAnalytics')}
                  className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 hover:scale-105 active:scale-95 transition-all shadow cursor-pointer ${styles.card}`}
                >
                  <BarChart3 className="w-5 h-5 text-emerald-500" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wide block">Data Logs</span>
                </button>
              </div>
            </div>

            {/* Grid of Add-On Services */}
            <div className="space-y-3">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-500 block">Add-On Applications</span>
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  onClick={() => navigateTo('adminGuestBookings')}
                  className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 hover:scale-105 active:scale-95 transition-all shadow cursor-pointer ${styles.card}`}
                >
                  <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wide block">Guests</span>
                </button>
                <button
                  onClick={() => navigateTo('adminStudentTraining')}
                  className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 hover:scale-105 active:scale-95 transition-all shadow cursor-pointer ${styles.card}`}
                >
                  <Award className="w-5 h-5 text-emerald-500" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wide block">Students</span>
                </button>
                <button
                  onClick={() => navigateTo('adminTournaments')}
                  className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 hover:scale-105 active:scale-95 transition-all shadow cursor-pointer ${styles.card}`}
                >
                  <Trophy className="w-5 h-5 text-emerald-500" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wide block">Tourneys</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {role === 'admin' && currentScreen === 'adminGuestBookings' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex flex-col gap-0.5">
              <h1 className={`text-lg font-extrabold tracking-tight flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                Guest Bookings
              </h1>
              <p className={`text-xs ${styles.textMuted}`}>Manage non-member slot reservations</p>
            </div>

            {/* Sub-tabs to toggle between Reservations list and Setup rules */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900/40 rounded-xl border border-emerald-950/20 text-xs">
              <button
                type="button"
                onClick={() => setGuestViewTab('bookings')}
                className={`py-2 text-center rounded-lg font-bold cursor-pointer transition ${
                  guestViewTab === 'bookings' ? 'bg-emerald-500 text-slate-950 font-black shadow-inner' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                📋 Reservations
              </button>
              <button
                type="button"
                onClick={() => setGuestViewTab('settings')}
                className={`py-2 text-center rounded-lg font-bold cursor-pointer transition ${
                  guestViewTab === 'settings' ? 'bg-emerald-500 text-slate-950 font-black shadow-inner' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ⚙️ Setup Rules
              </button>
            </div>

            {guestViewTab === 'bookings' ? (
              <div className="space-y-5 animate-fadeIn">
                {/* Blackout Warnings */}
                {guestBlackoutRange[selectedBranch]?.closed && (
                  <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-bold rounded-2xl flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs">🚫</span>
                      <span className="font-extrabold">Guest bookings closed at {selectedBranch}</span>
                    </div>
                    <div className="pl-5 text-rose-400 font-normal">
                      Period: {guestBlackoutRange[selectedBranch].start} to {guestBlackoutRange[selectedBranch].end}
                      <br />
                      Reason: <strong className="font-black text-rose-500">{guestBlackoutRange[selectedBranch].reason || 'Maintenance'}</strong>
                    </div>
                  </div>
                )}

                {/* Guest Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-4 rounded-2xl border ${styles.card}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Total Bookings</span>
                    <span className={`text-2xl font-black block mt-1 transition-colors ${styles.textPrimary}`}>{guests.length}</span>
                  </div>
                  <div className={`p-4 rounded-2xl border ${styles.card}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Dues Collected</span>
                    <span className="text-2xl font-black text-emerald-500 block mt-1 font-mono">
                      ₹{guests.filter(g => g.status === 'Booked').reduce((sum, g) => sum + (g.type === 'Peak' ? (guestRates[selectedBranch]?.peak || 0) : (guestRates[selectedBranch]?.nonPeak || 0)), 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Guest Roster */}
                <div className="space-y-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-500 block">Reservations Roster ({selectedBranch})</span>
                  <div className="space-y-2.5">
                    {guests.length === 0 ? (
                      <div className="text-center py-6 text-xs text-slate-500 italic">No guest reservations registered today.</div>
                    ) : (
                      guests.map(g => {
                        const rates = guestRates[selectedBranch] || { peak: 400, nonPeak: 200 };
                        const fee = g.type === 'Peak' ? rates.peak : rates.nonPeak;
                        return (
                          <div key={g.id} className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${styles.card}`}>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`font-extrabold block text-sm transition-colors ${styles.textPrimary}`}>{g.name}</span>
                                <span className={`text-[8px] font-extrabold px-1 py-0.5 rounded border ${
                                  g.type === 'Peak'
                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                    : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                }`}>
                                  {g.type === 'Peak' ? '🔥 Peak' : '🟢 Non-Peak'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 font-mono">
                                <span>{g.date}</span>
                                <span>•</span>
                                <span>{g.court}</span>
                                <span>•</span>
                                <span className="text-emerald-500 font-bold">₹{fee}</span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1.5">
                              {g.status === 'Cancelled' ? (
                                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border bg-rose-500/10 text-rose-500 border-rose-500/20">
                                  Cancelled
                                </span>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                    Booked
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const hoursRemaining = getHoursBeforeSlot(g.time || '10:00 AM', g.date || 'Aug 05');
                                      const policy = guestCancelPolicy[selectedBranch] || { slab24: 100, slab12: 50, slab0: 0 };
                                      let refundPercent = 0;
                                      if (hoursRemaining >= 24) refundPercent = policy.slab24;
                                      else if (hoursRemaining >= 12) refundPercent = policy.slab12;
                                      else refundPercent = policy.slab0;
                                      const fee = g.fee || 0;
                                      const refundAmount = Math.round((fee * refundPercent) / 100);
                                      setCancelBookingTarget(g);
                                      setCancelRefundDetails({ refundPercent, refundAmount, hoursRemaining });
                                      setCancelReason('Maintenance');
                                      setCancelCustomReason('');
                                      setShowCancelModal(true);
                                    }}
                                    className="px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[10px] font-black cursor-pointer border-none shadow transition"
                                  >
                                    Force Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Add Guest Form Mockup */}
                <div className={`p-4 rounded-2xl border space-y-3 ${styles.card}`}>
                  <h3 className={`text-xs font-black uppercase text-emerald-500 tracking-wide`}>Quick Add Guest ({selectedBranch})</h3>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = e.target.gname.value.trim();
                      const court = e.target.gcourt.value;
                      const slotId = e.target.gslot.value;
                      
                      if (!name) return alert('Please enter guest name.');
                      
                      const allowedCourts = guestAllowedCourts[selectedBranch] || [];
                      if (!allowedCourts.includes(court)) {
                        return alert(`Booking failed: ${court} is not authorized for guest play under rules at ${selectedBranch}.`);
                      }
                      
                      const blackout = guestBlackoutRange[selectedBranch] || { start: '', end: '', closed: false };
                      if (blackout.closed) {
                        return alert(`Booking failed: Guest bookings are currently blocked under blackout rules for ${selectedBranch}.`);
                      }

                      const branchSlots = guestSlots[selectedBranch] || [];
                      const selectedSlot = branchSlots.find(s => s.id === slotId);
                      if (!selectedSlot) return alert('Please select a valid scheduled slot.');
                      
                      const rates = guestRates[selectedBranch] || { peak: 400, nonPeak: 200 };
                      const fee = selectedSlot.type === 'Peak' ? rates.peak : rates.nonPeak;
                      
                      const newGuest = {
                        id: `g${Date.now()}`,
                        name,
                        date: 'Aug 05',
                        court,
                        status: 'Booked',
                        type: selectedSlot.type,
                        time: selectedSlot.time,
                        fee,
                        collectedAmount: fee,
                        paymentMethod: 'Cash',
                        refundIssued: 0,
                        branch: selectedBranch,
                        month: 'Aug 2026'
                      };
                      setIsProcessing(true);
                        setTimeout(() => {
                          setGuests(prev => [...prev, newGuest]);
                          e.target.reset();
                          setIsProcessing(false);
                          setGuestSuccessOverlay(true);
                          setTimeout(() => setGuestSuccessOverlay(false), 3000);
                        }, 1200);
                    }}
                    className="space-y-2 text-xs"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        name="gname"
                        placeholder="Guest Name"
                        required
                        className={`p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                      <select
                        name="gcourt"
                        className={`p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <option value="Court 1">Court 1</option>
                        <option value="Court 2">Court 2</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] opacity-75 font-bold uppercase tracking-wider block">Choose Guest Slot</label>
                      <select
                        name="gslot"
                        className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        {(guestSlots[selectedBranch] || []).length === 0 ? (
                          <option value="">No Active Slots - Add in Setup Rules</option>
                        ) : (
                          guestSlots[selectedBranch].map(s => (
                            <option key={s.id} value={s.id}>
                              {s.time} ({s.type} • {s.recurrence === 'Weekly' ? `Weekly (${s.details})` : s.recurrence})
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-[10px] cursor-pointer border-none shadow transition"
                    >
                      Create Guest Booking
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="space-y-5 animate-fadeIn text-xs">
                {/* Select Branch to Configure */}
                <div className="space-y-1.5">
                  <label className={`text-[10px] font-extrabold uppercase tracking-widest block ${styles.textMuted}`}>
                    Select Branch to Configure
                  </label>
                  <div className="relative">
                    <select
                      value={configBranch}
                      onChange={(e) => setConfigBranch(e.target.value)}
                      className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 appearance-none font-bold transition-all ${
                        isDark ? 'bg-[#192c21] border-emerald-800/30 text-white' : 'bg-white border-slate-250 text-slate-800 shadow-sm'
                      }`}
                    >
                      <option value="Downtown Hub">Downtown Hub (HQ)</option>
                      <option value="Uptown Arena">Uptown Arena</option>
                      <option value="East Coast Courts">East Coast Courts</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                      <MapPin className="w-4 h-4 text-emerald-555" />
                    </div>
                  </div>
                </div>

                {/* 1. Court Allocations */}
                <div className={`p-4 rounded-2xl border space-y-2.5 ${styles.card}`}>
                  <h3 className="text-xs font-black uppercase text-emerald-555 tracking-wider">Authorized Guest Courts ({configBranch})</h3>
                  <div className="flex gap-4">
                    {['Court 1', 'Court 2'].map(court => {
                      const allowed = guestAllowedCourts[configBranch] || [];
                      const isAllowed = allowed.includes(court);
                      return (
                        <label key={court} className="flex items-center gap-2 cursor-pointer font-bold select-none">
                          <input
                            type="checkbox"
                            checked={isAllowed}
                            onChange={() => {
                              setGuestAllowedCourts(prev => {
                                const currentList = prev[configBranch] || [];
                                const newList = isAllowed ? currentList.filter(c => c !== court) : [...currentList, court];
                                return { ...prev, [configBranch]: newList };
                              });
                            }}
                            className="w-4.5 h-4.5 border border-emerald-800 rounded bg-slate-900 accent-emerald-500 focus:ring-0 focus:ring-offset-0"
                          />
                          <span>{court}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Custom Peak Rates */}
                <div className={`p-4 rounded-2xl border space-y-3.5 ${styles.card}`}>
                  <h3 className="text-xs font-black uppercase text-emerald-555 tracking-wider">Custom Pricing Rates ({configBranch})</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] opacity-75 uppercase tracking-wider block font-bold">Standard Rate (₹/hr)</label>
                      <input
                        type="number"
                        value={guestRates[configBranch]?.nonPeak || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setGuestRates(prev => ({
                            ...prev,
                            [configBranch]: { ...prev[configBranch], nonPeak: val }
                          }));
                        }}
                        className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] opacity-75 uppercase tracking-wider block font-bold">Peak Rate (₹/hr)</label>
                      <input
                        type="number"
                        value={guestRates[configBranch]?.peak || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setGuestRates(prev => ({
                            ...prev,
                            [configBranch]: { ...prev[configBranch], peak: val }
                          }));
                        }}
                        className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Blackout System */}
                <div className={`p-4 rounded-2xl border space-y-3.5 ${styles.card}`}>
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black uppercase text-emerald-555 tracking-wider">Date Blackout Closure ({configBranch})</h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={guestBlackoutRange[configBranch]?.closed || false}
                        onChange={() => {
                          setGuestBlackoutRange(prev => {
                            const current = prev[configBranch] || { start: '', end: '', closed: false };
                            return { ...prev, [configBranch]: { ...current, closed: !current.closed } };
                          });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-900 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 peer-checked:after:bg-emerald-500 after:border-slate-400 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-950 border border-emerald-955/20"></div>
                      <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {guestBlackoutRange[configBranch]?.closed ? 'Closed' : 'Active'}
                      </span>
                    </label>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] opacity-75 uppercase tracking-wider block font-bold">Start Date</label>
                      <input
                        type="date"
                        value={guestBlackoutRange[configBranch]?.start || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGuestBlackoutRange(prev => {
                            const current = prev[configBranch] || { start: '', end: '', closed: false, reason: 'Maintenance' };
                            return { ...prev, [configBranch]: { ...current, start: val } };
                          });
                        }}
                        className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] opacity-75 uppercase tracking-wider block font-bold">End Date</label>
                      <input
                        type="date"
                        value={guestBlackoutRange[configBranch]?.end || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGuestBlackoutRange(prev => {
                            const current = prev[configBranch] || { start: '', end: '', closed: false, reason: 'Maintenance' };
                            return { ...prev, [configBranch]: { ...current, end: val } };
                          });
                        }}
                        className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] opacity-75 uppercase tracking-wider block font-bold">Blackout Reason</label>
                    <select
                      value={guestBlackoutRange[configBranch]?.reason || 'Maintenance'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setGuestBlackoutRange(prev => {
                          const current = prev[configBranch] || { start: '', end: '', closed: false, reason: 'Maintenance' };
                          return { ...prev, [configBranch]: { ...current, reason: val } };
                        });
                      }}
                      className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                        isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <option value="Power cut">Power cut</option>
                      <option value="Maintenance">Maintenance</option>
                      <option value="Tournament">Tournament</option>
                      <option value="Corporate Event">Corporate Event</option>
                    </select>
                  </div>
                </div>

                {/* 4. Cancellation & Refund Policy */}
                <div className={`p-4 rounded-2xl border space-y-3.5 ${styles.card}`}>
                  <h3 className="text-xs font-black uppercase text-emerald-555 tracking-wider">Cancellation & Refund Policy</h3>
                  
                  <label className="flex items-center gap-2 cursor-pointer font-bold select-none mb-3">
                    <input
                      type="checkbox"
                      checked={guestCancelPolicy[configBranch]?.applyGlobally || false}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setGuestCancelPolicy(prev => {
                          const updated = {};
                          for (const br of Object.keys(prev)) {
                            updated[br] = { ...prev[br], applyGlobally: checked };
                          }
                          return updated;
                        });
                      }}
                      className="w-4.5 h-4.5 border border-emerald-800 rounded bg-slate-900 accent-emerald-500 focus:ring-0 focus:ring-offset-0"
                    />
                    <span>Apply cancellation policy globally to all branches</span>
                  </label>

                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div className="space-y-1">
                      <label className="opacity-75 uppercase block font-bold">&gt;24 Hrs (Refund %)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={guestCancelPolicy[configBranch]?.slab24 || 0}
                        onChange={(e) => {
                          const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                          setGuestCancelPolicy(prev => {
                            const updated = { ...prev };
                            const global = prev[configBranch]?.applyGlobally;
                            for (const br of Object.keys(prev)) {
                              if (global || br === configBranch) {
                                updated[br] = { ...updated[br], slab24: val };
                              }
                            }
                            return updated;
                          });
                        }}
                        className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="opacity-75 uppercase block font-bold">12-24 Hrs (Refund %)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={guestCancelPolicy[configBranch]?.slab12 || 0}
                        onChange={(e) => {
                          const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                          setGuestCancelPolicy(prev => {
                            const updated = { ...prev };
                            const global = prev[configBranch]?.applyGlobally;
                            for (const br of Object.keys(prev)) {
                              if (global || br === configBranch) {
                                updated[br] = { ...updated[br], slab12: val };
                              }
                            }
                            return updated;
                          });
                        }}
                        className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="opacity-75 uppercase block font-bold">&lt;12 Hrs (Refund %)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={guestCancelPolicy[configBranch]?.slab0 || 0}
                        onChange={(e) => {
                          const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                          setGuestCancelPolicy(prev => {
                            const updated = { ...prev };
                            const global = prev[configBranch]?.applyGlobally;
                            for (const br of Object.keys(prev)) {
                              if (global || br === configBranch) {
                                updated[br] = { ...updated[br], slab0: val };
                              }
                            }
                            return updated;
                          });
                        }}
                        className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Active Slots & Scheduler */}
                <div className={`p-4 rounded-2xl border space-y-4.5 ${styles.card}`}>
                  <h3 className="text-xs font-black uppercase text-emerald-555 tracking-wider">Dynamic Guest Scheduler ({configBranch})</h3>
                  
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {(guestSlots[configBranch] || []).length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-500 italic">No guest slots scheduled for this branch yet.</div>
                    ) : (
                      guestSlots[configBranch].map(s => (
                        <div key={s.id} className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${styles.subCard}`}>
                          <div>
                            <div className="flex items-center gap-1.5 font-bold">
                              <span>{s.time}</span>
                              <span className={`text-[7px] font-black uppercase px-1 rounded border ${
                                s.type === 'Peak'
                                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                  : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                              }`}>
                                {s.type}
                              </span>
                            </div>
                            <span className="text-[9px] opacity-75 font-mono">
                              {s.recurrence === 'Weekly' ? `Weekly (${s.details})` : s.recurrence}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteReasonType('slot');
                              setTargetIdToDelete(s.id);
                              setSelectedDeleteReason('Maintenance');
                              setCustomDeleteReason('');
                              setShowDeleteReasonModal(true);
                            }}
                            className="p-1 px-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded border border-rose-500/20 text-[9px] font-black cursor-pointer transition"
                          >
                            Delete
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const time = e.target.stime.value;
                      const type = e.target.stype.value;
                      const recurrence = e.target.srecurrence.value;
                      const details = e.target.sdetails.value.trim();

                      const newSlot = {
                        id: `gs${Date.now()}`,
                        time,
                        type,
                        recurrence,
                        details: details || 'Daily'
                      };
                      
                      setGuestSlots(prev => {
                        const currentList = prev[configBranch] || [];
                        return { ...prev, [configBranch]: [...currentList, newSlot] };
                      });
                      
                      e.target.reset();
                      alert(`New guest slot published for ${configBranch}: ${time} (${type} • ${recurrence})`);
                    }}
                    className="p-3 bg-slate-900/30 border border-emerald-950/20 rounded-xl space-y-2.5"
                  >
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-500 block">Create New Guest Slot</span>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        name="stime"
                        className={`p-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        {['06:00 AM', '07:00 AM', '08:00 AM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM'].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <select
                        name="stype"
                        className={`p-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <option value="Non-Peak">Non-Peak Rate</option>
                        <option value="Peak">Peak Rate</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        name="srecurrence"
                        className={`p-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Single Day">Single Day</option>
                      </select>
                      <input
                        name="sdetails"
                        placeholder="Details (e.g. Mon, Wed, Fri)"
                        className={`p-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded text-[9px] cursor-pointer border-none shadow transition"
                    >
                      Publish Guest Slot
                    </button>
                  </form>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => navigateTo('adminApps')}
              className={`w-full py-2.5 border rounded-xl text-xs font-bold transition cursor-pointer ${
                isDark ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Back to Command Center
            </button>
          </div>
        )}        {role === 'admin' && currentScreen === 'adminStudentTraining' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex flex-col gap-0.5">
              <h1 className={`text-lg font-extrabold tracking-tight flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                <Award className="w-5 h-5 text-emerald-500" />
                Student Training
              </h1>
              <p className={`text-xs ${styles.textMuted}`}>JBC Junior & Beginners Coaching Academy</p>
            </div>

            {/* Student Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-4 rounded-2xl border ${styles.card}`}>
                <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Enrolled Students</span>
                <span className={`text-2xl font-black block mt-1 transition-colors ${styles.textPrimary}`}>{students.length}</span>
              </div>
              <div className={`p-4 rounded-2xl border ${styles.card}`}>
                <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Academy Coach</span>
                <span className="text-sm font-black text-emerald-555 block mt-2">Priya N. / Rahul K.</span>
              </div>
            </div>

            {/* Students List */}
            <div className="space-y-3">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-500 block">Student Registry</span>
              <div className="space-y-2.5">
                {students.map(s => (
                  <div key={s.id} className={`p-4 rounded-2xl border space-y-3 transition-all ${styles.card}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className={`font-extrabold block text-sm transition-colors ${styles.textPrimary}`}>{s.name}</span>
                        <span className="text-[10px] text-slate-505 font-mono mt-0.5 block">{s.batch}</span>
                      </div>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                        {s.attendance} Classes
                      </span>
                    </div>
                    
                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold">
                        <span className={styles.textMuted}>Coached by: <strong className={styles.textPrimary}>{s.coach}</strong></span>
                        <span className="text-emerald-500 font-mono">{s.progress}% skill score</span>
                      </div>
                      <div className={`w-full h-1 rounded-full overflow-hidden border transition-colors ${
                        isDark ? 'bg-slate-950 border-emerald-950/20' : 'bg-slate-100 border-slate-200'
                      }`}>
                        <div className="h-full bg-emerald-500" style={{ width: `${s.progress}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Enroll Student Form Mockup */}
            <div className={`p-4 rounded-2xl border space-y-3 ${styles.card}`}>
              <h3 className={`text-xs font-black uppercase text-emerald-500 tracking-wide`}>Quick Register Student</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = e.target.sname.value.trim();
                  const coach = e.target.scoach.value;
                  if (!name) return alert('Please enter student name.');
                  
                  const newStudent = {
                    id: `s${Date.now()}`,
                    name,
                    batch: 'Beginners Academy',
                    coach,
                    progress: 50,
                    attendance: '0/10'
                  };
                  setStudents(prev => [...prev, newStudent]);
                  e.target.reset();
                  alert(`Registered student ${name} into academy!`);
                }}
                className="space-y-2 text-xs"
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    name="sname"
                    placeholder="Student Name"
                    className={`p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                      isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                  <select
                    name="scoach"
                    className={`p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                      isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <option value="Priya N.">Coach Priya N.</option>
                    <option value="Rahul K. (You)">Coach Rahul K.</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-[10px] cursor-pointer border-none shadow transition"
                >
                  Register Academy Student
                </button>
              </form>
            </div>

            <button
              type="button"
              onClick={() => navigateTo('adminApps')}
              className={`w-full py-2.5 border rounded-xl text-xs font-bold transition cursor-pointer ${
                isDark ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Back to Command Center
            </button>
          </div>
        )}

        {role === 'admin' && currentScreen === 'adminTournaments' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex flex-col gap-0.5">
              <h1 className={`text-lg font-extrabold tracking-tight flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                <Trophy className="w-5 h-5 text-emerald-500" />
                Tournament Brackets
              </h1>
              <p className={`text-xs ${styles.textMuted}`}>Manage club draws, match schedules & scorings</p>
            </div>

            {/* Tournament list */}
            <div className="space-y-3">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-500 block">Active Championships</span>
              <div className="space-y-2.5">
                {tournaments.map(t => (
                  <div key={t.id} className={`p-4 rounded-2xl border space-y-3.5 transition-all ${styles.card}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className={`font-black block text-sm transition-colors ${styles.textPrimary}`}>{t.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">{t.type} Draw • {t.players} Players</span>
                      </div>
                      <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                        t.status === 'In Progress' 
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                          : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      }`}>
                        {t.status}
                      </span>
                    </div>
                    
                    {/* Next Match details */}
                    <div className={`p-3 rounded-xl border flex items-center justify-between ${styles.subCard}`}>
                      <div>
                        <span className="text-[9px] text-slate-500 block font-bold uppercase">Up Next</span>
                        <span className={`text-xs font-bold transition-colors ${styles.textPrimary}`}>{t.nextMatch}</span>
                      </div>
                      {t.status === 'In Progress' && (
                        <button
                          type="button"
                          onClick={() => {
                            alert(`Scoring system open for: ${t.nextMatch}`);
                          }}
                          className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-[9px] font-black cursor-pointer border-none shadow transition"
                        >
                          Score Match
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Create Tournament Form Mockup */}
            <div className={`p-4 rounded-2xl border space-y-3 ${styles.card}`}>
              <h3 className={`text-xs font-black uppercase text-emerald-500 tracking-wide`}>Draft New Tournament</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = e.target.tname.value.trim();
                  const draw = e.target.tdraw.value;
                  if (!name) return alert('Please enter tournament name.');
                  
                  const newTourney = {
                    id: `t${Date.now()}`,
                    name,
                    type: draw,
                    players: 8,
                    status: 'Registration Open',
                    nextMatch: 'TBD (Draw pending)'
                  };
                  setTournaments(prev => [...prev, newTourney]);
                  e.target.reset();
                  alert(`Created new draw: ${name}!`);
                }}
                className="space-y-2 text-xs"
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    name="tname"
                    placeholder="Championship Title"
                    className={`p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                      isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                  <select
                    name="tdraw"
                    className={`p-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                      isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <option value="Singles">Singles Draw</option>
                    <option value="Doubles">Doubles Draw</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-[10px] cursor-pointer border-none shadow transition"
                >
                  Draft Tournament Draw
                </button>
              </form>
            </div>

            <button
              type="button"
              onClick={() => navigateTo('adminApps')}
              className={`w-full py-2.5 border rounded-xl text-xs font-bold transition cursor-pointer ${
                isDark ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Back to Command Center
            </button>
          </div>
        )}

        {/* VIEW 5: ADMIN BROADCASTING CONTROL LAYER */}
        {role === 'admin' && currentScreen === 'adminCommunications' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex flex-col gap-0.5">
              <h1 className={`text-lg font-extrabold tracking-tight flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                <MessageSquare className="w-5 h-5 text-emerald-505" />
                Broadcasting Center
              </h1>
              <p className={`text-xs ${styles.textMuted}`}>Send announcements & emergency slot updates</p>
            </div>

            <div className={`p-5 rounded-2xl border space-y-4 transition-all ${styles.card}`}>
              <form onSubmit={triggerBroadcast} className="space-y-3.5">
                <div>
                  <label className={`text-[10px] font-extrabold uppercase tracking-wider block ${styles.textMuted}`}>
                    Alert Message Content
                  </label>
                  <textarea
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    placeholder="e.g., Court 2 net tension adjusted. Please wear non-marking shoes."
                    className={`w-full border rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 min-h-[90px] mt-1.5 transition-colors ${
                      isDark ? 'bg-slate-955 border-emerald-900/60' : 'bg-slate-50 border-emerald-250 text-slate-800 shadow-inner'
                    }`}
                  />
                </div>
                
                <button
                  type="submit"
                  className="w-full py-3 bg-[#10b981] hover:bg-[#0d9468] text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer border-none"
                >
                  <Send className="w-4 h-4 text-slate-950" />
                  Dispatch Alert Loop
                </button>
              </form>
            </div>

            {/* Broadcast Logs */}
            <div className="space-y-3">
              <h3 className={`text-xs font-extrabold uppercase tracking-widest ${styles.textMuted}`}>
                Active Broadcast Logs
              </h3>

              <div className="space-y-2.5">
                {activeBroadcasts.map((log) => (
                  <div key={log.id} className={`p-4 rounded-xl border flex flex-col gap-1 transition-all ${styles.card}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black uppercase text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                        {log.type}
                      </span>
                      <span className={`text-[9px] font-semibold ${styles.textMuted}`}>{log.date}</span>
                    </div>
                    <p className={`text-xs font-semibold mt-1 transition-colors ${isDark ? 'text-slate-205' : 'text-slate-750'}`}>
                      {log.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 6: ADMIN MONTHLY PAYMENT BALANCES LEDGER */}
        {role === 'admin' && currentScreen === 'adminLedger' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex flex-col gap-0.5">
              <h1 className={`text-lg font-extrabold tracking-tight flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                <DollarSign className="w-5 h-5 text-emerald-505" />
                Payments Ledger
              </h1>
              <p className={`text-xs ${styles.textMuted}`}>Roster fee settlement checklist & reminders</p>
            </div>

            {/* Ledger Sub-tab Switch */}
            <div className={`p-1 rounded-xl border flex gap-1 items-center transition-all ${
              isDark ? 'bg-[#0f1b14] border-emerald-950' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={() => setLedgerSubTab('members')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  ledgerSubTab === 'members'
                    ? (isDark ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-emerald-500 text-white shadow-sm')
                    : styles.textMuted
                }`}
              >
                📋 Members
              </button>
              <button
                onClick={() => setLedgerSubTab('guests')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  ledgerSubTab === 'guests'
                    ? (isDark ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-emerald-500 text-white shadow-sm')
                    : styles.textMuted
                }`}
              >
                🎟️ Guests
              </button>
            </div>

            {/* Global Month Pills (Mobile) */}
            <div className={`p-1 rounded-xl border flex gap-1 items-center ${isDark ? 'bg-[#0f1b14] border-emerald-950' : 'bg-slate-100 border-slate-200'}`}>
              {['Jul 2026', 'Aug 2026', 'Sep 2026'].map(m => (
                <button key={m} onClick={() => setGlobalLedgerMonth(m)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition cursor-pointer ${
                    globalLedgerMonth === m ? (isDark ? 'bg-emerald-500 text-slate-950' : 'bg-emerald-500 text-white shadow-sm') : styles.textMuted
                  }`}>{m}</button>
              ))}
              <div className="relative flex-1">
                <input 
                  type="month" 
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" onClick={(e) => { try { e.target.showPicker(); } catch(err) {} }}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [y, m] = e.target.value.split('-');
                      const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10) - 1];
                      setGlobalLedgerMonth(`${mo} ${y}`);
                    }
                  }}
                />
                <button className={`w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition pointer-events-none ${!['Jul 2026', 'Aug 2026', 'Sep 2026'].includes(globalLedgerMonth) ? (isDark ? 'bg-emerald-500 text-slate-950' : 'bg-emerald-500 text-white shadow-sm') : styles.textMuted}`}>
                  {!['Jul 2026', 'Aug 2026', 'Sep 2026'].includes(globalLedgerMonth) ? globalLedgerMonth : '📅 More'}
                </button>
              </div>
            </div>

            {/* ── MOBILE GUEST TRANSACTIONS VIEW ── */}
            {ledgerSubTab === 'guests' && (() => {
              const MONTHS = ['Jul 2026', 'Aug 2026', 'Sep 2026'];
              const BRANCHES_LIST = ['All Branches', 'Downtown Hub', 'Suburb Arena'];
              const filteredGuests = guests.filter(g => {
                const monthMatch = (g.month || 'Aug 2026') === globalLedgerMonth;
                const branchMatch = guestLedgerBranch === 'All Branches' || (g.branch || 'Downtown Hub') === guestLedgerBranch;
                return monthMatch && branchMatch;
              });
              const grossCollected = filteredGuests.filter(g => g.status === 'Booked').reduce((s, g) => s + (g.collectedAmount ?? g.fee ?? 0), 0);
              const refundsIssued = filteredGuests.filter(g => g.status === 'Cancelled').reduce((s, g) => s + (g.refundIssued ?? 0), 0);
              const netRevenue = grossCollected - refundsIssued;
              return (
              <div className="space-y-4 animate-fadeIn">
                {/* Branch Dropdown */}
                <select value={guestLedgerBranch} onChange={e => setGuestLedgerBranch(e.target.value)}
                  className={`w-full p-2.5 border rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 ${isDark ? 'bg-[#0f1b14] border-emerald-950 text-white' : 'bg-slate-100 border-slate-200 text-slate-800'}`}>
                  {BRANCHES_LIST.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-4 rounded-2xl border ${styles.card}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Bookings</span>
                    <span className={`text-2xl font-black block mt-1 ${styles.textPrimary}`}>{filteredGuests.length}</span>
                  </div>
                  <div className={`p-4 rounded-2xl border ${styles.card}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Gross Collected</span>
                    <span className="text-xl font-black block mt-1 text-emerald-500 font-mono">₹{grossCollected}</span>
                  </div>
                  <div className={`p-4 rounded-2xl border ${styles.card}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Refunds Issued</span>
                    <span className="text-xl font-black block mt-1 text-rose-400 font-mono">₹{refundsIssued}</span>
                  </div>
                  <div className={`p-4 rounded-2xl border ${isDark ? 'bg-emerald-900/10 border-emerald-800/20' : 'bg-emerald-50 border-emerald-200'}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>Net Revenue</span>
                    <span className={`text-xl font-black block mt-1 font-mono ${netRevenue >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>₹{netRevenue}</span>
                  </div>
                </div>
                {/* Transaction Cards */}
                <div>
                  <h3 className={`text-xs font-extrabold uppercase tracking-widest mb-2 ${styles.textMuted}`}>Guest Transactions — {globalLedgerMonth}</h3>
                  <div className={`rounded-2xl border overflow-hidden divide-y transition-all ${isDark ? 'bg-[#192c21] border-emerald-800/30 divide-emerald-900/35' : 'bg-white border-emerald-150 divide-emerald-50 shadow-sm'}`}>
                    {filteredGuests.length === 0 ? (
                      <div className={`p-8 text-center text-xs ${styles.textMuted}`}>No bookings for {globalLedgerMonth}.</div>
                    ) : filteredGuests.map(g => (
                      <div key={g.id} className={`p-3.5 flex justify-between items-start text-xs ${g.status === 'Cancelled' ? 'opacity-60' : ''}`}>
                        <div>
                          <div className={`font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{g.name}</div>
                          <div className={`text-[10px] mt-0.5 font-mono ${styles.textMuted}`}>{g.date} • {g.time || '—'} • {g.court}</div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${g.type === 'Peak' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-800/20'}`}>{g.type}</span>
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${(g.paymentMethod || 'Cash') === 'Online' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>{g.paymentMethod || 'Cash'}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          {g.status === 'Cancelled'
                            ? <span className="font-mono font-black text-rose-400">-₹{g.refundIssued || 0}</span>
                            : <span className="font-mono font-black text-emerald-500">₹{g.collectedAmount ?? g.fee}</span>
                          }
                          <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                            g.status === 'Booked' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                          }`}>{g.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              );
            })()}

            {/* ── MOBILE MEMBERS VIEW ── */}
            {ledgerSubTab === 'members' && (<>

            {/* Overview Summary */}
            <div className={`p-4 rounded-2xl border transition-all ${styles.card}`}>
              <div className="flex justify-between items-center">
                <div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider block ${styles.textMuted}`}>{globalLedgerMonth.split(' ')[0]} Ledger Overview</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className={`text-2xl font-black transition-colors ${styles.textPrimary}`}>
                      {members.filter(m => m.paymentHistory?.[globalLedgerMonth] === 'Pending').length} Pending
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded border ${
                  simulatedDay === 'current'
                    ? 'bg-emerald-500/10 text-emerald-555 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                }`}>
                  {simulatedDay === 'current' ? 'Grace Period' : 'Post-10th Cutoff'}
                </span>
              </div>
            </div>

            {/* Payments List */}
            <div className="space-y-2.5">

            {/* Filter Toggle and Bulk Action Controls */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pb-1">
              <div className={`p-1 rounded-xl border flex gap-1 items-center transition-all ${
                isDark ? 'bg-[#0f1b14] border-emerald-950' : 'bg-slate-100 border-slate-200'
              }`}>
                <button
                  onClick={() => setLedgerFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    ledgerFilter === 'all'
                      ? (isDark ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-emerald-500 text-white shadow-sm')
                      : `${styles.textMuted}`
                  }`}
                >
                  All ({members.length})
                </button>
                <button
                  onClick={() => setLedgerFilter('unpaid')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    ledgerFilter === 'unpaid'
                      ? (isDark ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-white text-slate-850 shadow')
                      : `${styles.textMuted}`
                  }`}
                >
                  Unpaid ({members.filter(m => m.paymentHistory?.[globalLedgerMonth] === 'Pending').length})
                </button>
              </div>

              <button
                onClick={pingAllPayments}
                disabled={members.filter(m => m.paymentHistory?.[globalLedgerMonth] === 'Pending').length === 0}
                className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 hover:text-rose-455 border border-rose-500/20 hover:border-rose-500/35 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Bell className="w-3.5 h-3.5" />
                Remind All Unpaid
              </button>
            </div>

              <h3 className={`text-xs font-extrabold uppercase tracking-widest ${styles.textMuted}`}>
                Roster Fee Settlement Directory
              </h3>

              <div className={`rounded-2xl border overflow-hidden divide-y transition-all ${
                isDark ? 'bg-[#192c21] border-emerald-800/30 divide-emerald-900/35' : 'bg-white border-emerald-150 divide-emerald-50 shadow-sm'
              }`}>
                {members.filter(m => ledgerFilter === 'all' || m.paymentHistory?.[globalLedgerMonth] === 'Pending').length === 0 ? (
                  <div className={`p-8 text-center text-xs transition-colors ${styles.textMuted}`}>
                    🎉 No unpaid subscriptions found! All records are fully settled.
                  </div>
                ) : (
                  members
                    .filter(m => ledgerFilter === 'all' || m.paymentHistory?.[globalLedgerMonth] === 'Pending')
                    .map((member) => (
                      <div key={member.id} className="p-3.5 flex justify-between items-center text-sm">
                        <div>
                          <div className={`font-bold transition-colors ${isDark ? 'text-white' : 'text-slate-805'}`}>{member.name}</div>
                          <div className={`text-[10px] transition-colors mt-0.5 ${styles.textMuted}`}>
                            {member.batchId === 'b1' ? 'Elite Batch' : member.batchId === 'b2' ? 'Beginner Batch' : 'Morning Batch'}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2.5 py-0.5 rounded font-extrabold font-mono border transition-colors ${
                            member.paymentHistory?.[globalLedgerMonth] === 'Paid' 
                              ? (isDark ? 'text-emerald-450 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-700 bg-emerald-50 border-emerald-200')
                              : (isDark ? 'text-amber-450 bg-amber-500/10 border-amber-500/20' : 'text-amber-705 bg-amber-50 border-amber-250')
                          }`}>
                            {member.paymentHistory?.[globalLedgerMonth] || 'Pending'}
                          </span>
                          
                          {member.paymentHistory?.[globalLedgerMonth] === 'Pending' && (
                            <button
                              onClick={() => pingIndividualPayment(member.name)}
                              className={`p-1.5 rounded-lg border transition ${
                                isDark 
                                  ? 'bg-slate-950 border-emerald-950 hover:bg-[#0f1b14] text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/40' 
                                  : 'bg-slate-100 border-slate-205 hover:bg-slate-200 text-emerald-800'
                              }`}
                              title="Send device push reminder"
                            >
                              <Bell className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
            </>)}
          </div>
        )}

        {/* VIEW 7: ADMIN CROSS-BRANCH ANALYTICS */}
        {role === 'admin' && currentScreen === 'adminAnalytics' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex flex-col gap-0.5">
              <h1 className={`text-base font-extrabold tracking-tight flex items-center gap-1.5 transition-colors ${styles.textPrimary}`}>
                <BarChart3 className="w-5 h-5 text-emerald-505" />
                Cross-Branch Analytics & Logs
              </h1>
              <p className={`text-xs ${styles.textMuted}`}>Club performance and metrics tracking</p>
            </div>

            {/* Performance table */}
            <div className="space-y-2">
              <h3 className={`text-xs font-extrabold uppercase tracking-widest flex items-center gap-1.5 ${
                isDark ? 'text-slate-350' : 'text-slate-500 font-bold'
              }`}>
                1. Performance by Branch
              </h3>
              
              <div className={`border rounded-xl overflow-hidden shadow transition-all ${
                isDark ? 'bg-[#192c21] border-emerald-900/30' : 'bg-white border-emerald-200'
              }`}>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className={`font-bold border-b transition-colors ${styles.tableHeader}`}>
                      <th className="p-3">Branch Name</th>
                      <th className="p-3 text-right">Avg / Day</th>
                      <th className="p-3 text-right">Rate %</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y transition-colors ${isDark ? 'divide-emerald-900/35' : 'divide-emerald-150'}`}>
                    {ANALYTICS_DATA.branches.map((b, i) => (
                      <tr key={i} className={`transition-colors ${
                        isDark ? 'hover:bg-emerald-900/20 text-slate-100' : 'hover:bg-slate-55 text-slate-800'
                      }`}>
                        <td className="p-3 font-bold">{b.name}</td>
                        <td className="p-3 text-right font-mono">{b.avgPlayers}</td>
                        <td className="p-3 text-right text-emerald-500 font-mono font-black">{b.rate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Utilization per Court Table */}
            <div className="space-y-2">
              <h3 className={`text-xs font-extrabold uppercase tracking-widest flex items-center gap-1.5 ${
                isDark ? 'text-slate-350' : 'text-slate-500 font-bold'
              }`}>
                2. Utilization Metrics per Court
              </h3>
              
              <div className={`border rounded-xl overflow-hidden shadow transition-all ${
                isDark ? 'bg-[#192c21] border-emerald-900/30' : 'bg-white border-emerald-200'
              }`}>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className={`font-bold border-b transition-colors ${styles.tableHeader}`}>
                      <th className="p-3">Court Number</th>
                      <th className="p-3">Peak Demand Time</th>
                      <th className="p-3 text-right">No-Shows (Mtd)</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y transition-colors ${isDark ? 'divide-emerald-900/35' : 'divide-emerald-150'}`}>
                    {ANALYTICS_DATA.courts.map((c, i) => (
                      <tr key={i} className={`transition-colors ${
                        isDark ? 'hover:bg-emerald-900/20 text-slate-100' : 'hover:bg-slate-55 text-slate-800'
                      }`}>
                        <td className="p-3 font-bold">{c.number}</td>
                        <td className="p-3">{c.peak}</td>
                        <td className={`p-3 text-right font-mono font-bold ${c.noShows > 5 ? 'text-rose-500' : ''}`}>
                          {c.noShows}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Export Trigger Action Button */}
            <div className="pt-2">
              <button
                onClick={handleExportCSV}
                className="w-full py-3.5 bg-[#10b981] hover:bg-[#0d9468] text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all cursor-pointer border-none"
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-950" />
                Export Report (CSV Sheet)
              </button>
            </div>
          </div>
        )}

        {/* VIEW 8: ADMIN ADD MEMBER SCREEN */}
        {role === 'admin' && currentScreen === 'adminAddMember' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center gap-2 pb-1 border-b border-emerald-800/10">
              <User className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-bold ${styles.textPrimary}`}>Add New Club Member</h2>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = e.target.name.value.trim();
                const mobile = e.target.mobile.value.trim();
                const email = e.target.email.value.trim();
                const type = e.target.type.value;
                const rate = parseFloat(e.target.rate.value);

                if (!name || !mobile || !email) {
                  alert('Please fill out all required fields.');
                  return;
                }

                const newMember = {
                  id: `m${Date.now()}`,
                  name,
                  mobile,
                  email,
                  memberType: type,
                  baseRate: rate,
                  rsvpStatus: 'Pending',
                  checkInTime: null,
                  batchId: 'b1',
                  paymentHistory: { 'Jul 2026': 'Paid', 'Aug 2026': 'Pending', 'Sep 2026': 'Pending' }
                };

                setMembers(prev => [...prev, newMember]);
                alert(`Success! ${name} has been added as a JBC ${type} member.`);
                e.target.reset();
                navigateTo('adminHub');
              }}
              className={`p-4 rounded-2xl border space-y-4 ${styles.card}`}
            >
              <div className="space-y-1">
                <label className={`text-[10px] font-extrabold uppercase tracking-wider block ${styles.textMuted}`}>Full Name *</label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Priyanshu Sharma"
                  className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium ${
                    isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-slate-50 border-slate-205 text-slate-800'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className={`text-[10px] font-extrabold uppercase tracking-wider block ${styles.textMuted}`}>Mobile Number *</label>
                <input
                  name="mobile"
                  type="tel"
                  required
                  placeholder="e.g. +91 99887 76655"
                  className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono font-medium ${
                    isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-slate-50 border-slate-205 text-slate-800'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className={`text-[10px] font-extrabold uppercase tracking-wider block ${styles.textMuted}`}>Email Address *</label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="e.g. priyanshu.s@gmail.com"
                  className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium ${
                    isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-slate-50 border-slate-205 text-slate-800'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <label className={`text-[10px] font-extrabold uppercase tracking-wider block ${styles.textMuted}`}>Base Rate (₹/mo)</label>
                  <input
                    name="rate"
                    type="number"
                    defaultValue="2000"
                    required
                    className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono font-bold ${
                      isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-slate-50 border-slate-205 text-slate-800'
                    }`}
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer border-none"
                >
                  Save Member Record
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo('adminApps')}
                  className={`px-4 py-3 border rounded-xl text-xs font-bold transition cursor-pointer ${
                    isDark ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* VIEW 9: ADMIN GROUP MANAGER SCREEN */}
        {role === 'admin' && currentScreen === 'adminGroupManager' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center gap-2 pb-1 border-b border-emerald-800/10">
              <Users className="w-5 h-5 text-emerald-505" />
              <h2 className={`text-base font-bold ${styles.textPrimary}`}>Hourly Court Groups</h2>
            </div>

            {/* TAB SELECTOR: View/Create vs Assign Members */}
            <div className={`p-1 rounded-xl border flex gap-1 items-center transition-all ${
              isDark ? 'bg-[#0f1b14] border-emerald-950' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={() => setGroupSubTab('manage')}
                className={`flex-1 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  groupSubTab === 'manage'
                    ? (isDark ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-emerald-500 text-white shadow-sm')
                    : `${styles.textMuted}`
                }`}
              >
                Groups & Creator
              </button>
              <button
                onClick={() => setGroupSubTab('assign')}
                className={`flex-1 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  groupSubTab === 'assign'
                    ? (isDark ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-white text-slate-850 shadow')
                    : `${styles.textMuted}`
                }`}
              >
                Assign Members
              </button>
            </div>

            {groupSubTab === 'manage' ? (
              <div className="space-y-4">
                {/* Toggle Button for Creator */}
                <div className="flex justify-between items-center pb-1">
                  <button
                    type="button"
                    onClick={() => setShowCreateGroupForm(!showCreateGroupForm)}
                    className={`px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer border-none`}
                  >
                    {showCreateGroupForm ? '✕ Close Creator' : '➕ Create New Group'}
                  </button>
                </div>

                {/* Collapsible Create Group Form */}
                {showCreateGroupForm && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = e.target.gname.value.trim();
                      const court = e.target.gcourt.value;
                      const hour = e.target.ghour.value;
                      const fee = parseFloat(e.target.gfee.value);

                      if (!name) {
                        alert('Please specify a group name.');
                        return;
                      }

                      const newGroup = {
                        id: `g${Date.now()}`,
                        name,
                        court,
                        hour,
                        fee,
                        memberIds: []
                      };

                      setGroups(prev => [...prev, newGroup]);
                      alert(`Success! Group "${name}" has been created.`);
                      e.target.reset();
                      setShowCreateGroupForm(false); // Collapses the form automatically!
                    }}
                    className={`p-4 rounded-2xl border space-y-3.5 animate-fadeIn ${styles.card}`}
                  >
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-emerald-500">Create Hourly Group</h3>
                    
                    <div className="space-y-1">
                      <label className={`text-[10px] font-extrabold uppercase tracking-wider block ${styles.textMuted}`}>Group Name</label>
                      <input
                        name="gname"
                        type="text"
                        required
                        placeholder="e.g. Court 2 Morning Aces"
                        className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium ${
                          isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-slate-50 border-slate-205 text-slate-800'
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className={`text-[10px] font-extrabold uppercase tracking-wider block ${styles.textMuted}`}>Court</label>
                        <select
                          name="gcourt"
                          className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                            isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-white border-slate-205 text-slate-800'
                          }`}
                        >
                          <option value="Court 1">Court 1</option>
                          <option value="Court 2">Court 2</option>
                          <option value="Court 3">Court 3</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[10px] font-extrabold uppercase tracking-wider block ${styles.textMuted}`}>Monthly Fee (₹)</label>
                        <input
                          name="gfee"
                          type="number"
                          defaultValue="1500"
                          required
                          className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono font-bold ${
                            isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-slate-50 border-slate-205 text-slate-800'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className={`text-[10px] font-extrabold uppercase tracking-wider block ${styles.textMuted}`}>Time Slot (Hourly)</label>
                      <select
                        name="ghour"
                        className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                          isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-white border-slate-205 text-slate-800'
                        }`}
                      >
                        <option value="06:00 AM - 07:00 AM">06:00 AM - 07:00 AM (Morning)</option>
                        <option value="07:00 AM - 08:00 AM">07:00 AM - 08:00 AM (Morning)</option>
                        <option value="12:00 PM - 01:00 PM">12:00 PM - 01:00 PM (Afternoon)</option>
                        <option value="01:00 PM - 02:00 PM">01:00 PM - 02:00 PM (Afternoon)</option>
                        <option value="02:00 PM - 03:00 PM">02:00 PM - 03:00 PM (Afternoon)</option>
                        <option value="05:00 PM - 06:00 PM">05:00 PM - 06:00 PM (Evening)</option>
                        <option value="06:00 PM - 07:00 PM">06:00 PM - 07:00 PM (Evening)</option>
                        <option value="07:00 PM - 08:00 PM">07:00 PM - 08:00 PM (Evening)</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer border-none"
                    >
                      Add Hourly Group
                    </button>
                  </form>
                )}

                {/* Existing Groups Directory */}
                <div className="space-y-3.5">
                  <div className="flex justify-between items-center">
                    <h3 className={`text-xs font-extrabold uppercase tracking-wider ${styles.textMuted}`}>Active Hourly Groups</h3>
                    <button
                      type="button"
                      onClick={handleDownloadGroupMatrix}
                      className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 hover:border-emerald-500/35 rounded-lg text-[9px] font-extrabold transition-all cursor-pointer flex items-center gap-1"
                    >
                      <FileSpreadsheet className="w-3 h-3" /> Export Matrix
                    </button>
                  </div>

                  {/* Segmented Categories Tab Bar */}
                  <div className={`p-1 rounded-xl border flex gap-1 items-center transition-all ${
                    isDark ? 'bg-[#0f1b14] border-emerald-950/40' : 'bg-slate-100 border-slate-200'
                  }`}>
                    {['morning', 'afternoon', 'evening'].map(category => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setGroupCategoryTab(category)}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all cursor-pointer text-center ${
                          groupCategoryTab === category
                            ? (isDark ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-white text-slate-800 shadow-sm')
                            : `${styles.textMuted}`
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>

                  {/* Category Filtered Groups list */}
                  <div className="space-y-2.5">
                    {groups.filter(g => getGroupCategory(g.hour) === groupCategoryTab).length === 0 ? (
                      <div className={`text-center py-8 text-xs transition-colors border border-dashed rounded-2xl ${
                        isDark ? 'border-emerald-900/30 text-slate-400 bg-[#14231a]/40' : 'border-slate-205 text-slate-500 bg-slate-50/50'
                      }`}>
                        No hourly groups created under the <span className="font-extrabold text-emerald-500">{groupCategoryTab}</span> segment yet.
                      </div>
                    ) : (
                      groups
                        .filter(g => getGroupCategory(g.hour) === groupCategoryTab)
                        .map(group => (
                          <div key={group.id} className={`p-3.5 rounded-2xl border transition-all ${styles.card}`}>
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className={`text-xs font-bold transition-colors ${styles.textPrimary}`}>{group.name}</h4>
                                <p className={`text-[10px] mt-0.5 ${styles.textMuted}`}>
                                  {group.court} • {group.hour}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded border font-mono bg-emerald-500/15 border-emerald-500/20 text-emerald-500">
                                  ₹{group.fee}/mo
                                </span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-extrabold ${
                                  group.groupType === 'Premium' 
                                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                                    : 'bg-slate-500/10 text-slate-450 border border-slate-800/20'
                                }`}>
                                  {group.groupType} Group
                                </span>
                              </div>
                            </div>
                            <div className="mt-2.5 pt-2.5 border-t border-dashed border-emerald-800/10 flex justify-between items-center text-[10px]">
                              <span className={styles.textMuted}>Members:</span>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-emerald-500">{group.memberIds.length} assigned</span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedMobileRosterGroupId(group.id)}
                                  className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 hover:border-emerald-500/35 rounded-lg text-[9px] font-extrabold transition cursor-pointer"
                                >
                                  📊 Roster Stats
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Assign Members Tab */
              <div className={`p-4 rounded-2xl border space-y-4 ${styles.card}`}>
                <div className="space-y-1.5">
                  <label className={`text-[10px] font-extrabold uppercase tracking-wider block ${styles.textMuted}`}>Select Target Group</label>
                  <select
                    value={activeGroupAssignmentId}
                    onChange={(e) => setActiveGroupAssignmentId(e.target.value)}
                    className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                      isDark ? 'bg-slate-950 border-emerald-950 text-white' : 'bg-white border-slate-205 text-slate-800'
                    }`}
                  >
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.groupType} - {g.court})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className={`text-[10px] font-extrabold uppercase tracking-wider block ${styles.textMuted}`}>Assign / Remove Members</label>
                  <div className={`rounded-xl border max-h-60 overflow-y-auto divide-y transition-all ${
                    isDark ? 'bg-slate-950 border-emerald-950 divide-emerald-900/30' : 'bg-slate-50 border-slate-205 divide-slate-100'
                  }`}>
                    {members.map(member => {
                      const activeG = groups.find(g => g.id === activeGroupAssignmentId);
                      const isChecked = tempAssignedMemberIds.includes(member.id);
                      const originalIds = activeG ? activeG.memberIds : [];
                      
                      // Highlight with subtle background if newly selected (originally unchecked, now checked)
                      const isNewlySelected = isChecked && !originalIds.includes(member.id);
                      const highlightClass = isNewlySelected 
                        ? (isDark ? 'bg-emerald-500/10 border-l-2 border-emerald-500' : 'bg-emerald-50/80 border-l-2 border-emerald-500') 
                        : '';
                      
                      return (
                        <div key={member.id} className={`p-3 flex items-center justify-between text-xs transition-all ${highlightClass}`}>
                          <label className="flex items-center gap-2 cursor-pointer flex-1 py-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setTempAssignedMemberIds(prev => {
                                  const exists = prev.includes(member.id);
                                  return exists ? prev.filter(id => id !== member.id) : [...prev, member.id];
                                });
                              }}
                              className="accent-emerald-500 rounded cursor-pointer w-4 h-4 text-emerald-505 bg-slate-900 border-slate-700 focus:ring-0"
                            />
                            <div>
                              <span className={`font-bold block ${isDark ? 'text-white' : 'text-slate-800'}`}>{member.name}</span>
                              <span className="text-[9px] opacity-70 block font-mono">{member.mobile}</span>
                            </div>
                          </label>

                          <div className="text-right">
                            <span className="font-mono text-emerald-505 font-bold block mt-0.5">
                              Total: ₹{getMemberMonthlyRate(member.id).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Transactional Action Buttons */}
                <div className="flex gap-2.5 pt-1.5 border-t border-emerald-800/10">
                  <button
                    type="button"
                    onClick={() => {
                      setGroups(prev => prev.map(g => {
                        if (g.id === activeGroupAssignmentId) {
                          return { ...g, memberIds: tempAssignedMemberIds };
                        }
                        return g;
                      }));
                      alert('Assignments changes saved and locked successfully!');
                    }}
                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer border-none shadow"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const activeG = groups.find(g => g.id === activeGroupAssignmentId);
                      if (activeG) {
                        setTempAssignedMemberIds(activeG.memberIds || []);
                      }
                      alert('Discarded unsaved selection changes.');
                    }}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      isDark 
                        ? 'bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 border-rose-500/20' 
                        : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={() => navigateTo('adminHub')}
              className={`w-full py-2.5 border rounded-xl text-xs font-bold transition cursor-pointer ${
                isDark ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Back to Command Center
            </button>
          </div>
        )}

      </main>

      {/* --- RESPONSIVE BOTTOM NAVIGATION SYSTEM FOOTER --- */}
      <footer className={`fixed bottom-0 left-0 right-0 max-w-md mx-auto border-t grid py-2 px-2 z-40 shadow-xl transition-colors ${styles.footer} ${
          role === 'member' ? 'grid-cols-3' : 'grid-cols-5'
        }`}>
        {role === 'member' ? (
          <>
            <button 
              type="button"
              onClick={() => navigateTo('slotDetails')}
              className={`flex flex-col items-center gap-0.5 py-1.5 transition cursor-pointer ${
                currentScreen === 'slotDetails' 
                  ? 'text-emerald-500 font-black scale-105' 
                  : `${styles.textMuted} hover:text-slate-350`
              }`}
            >
              <Clock className="w-5 h-5" />
              <span className="text-[9px]">Today's Slot</span>
            </button>
            <button 
              type="button"
              onClick={() => navigateTo('history')}
              className={`flex flex-col items-center gap-0.5 py-1.5 transition cursor-pointer ${
                currentScreen === 'history' 
                  ? 'text-emerald-500 font-black scale-105' 
                  : `${styles.textMuted} hover:text-slate-350`
              }`}
            >
              <Calendar className="w-5 h-5" />
              <span className="text-[9px]">My History</span>
            </button>
            <button 
              type="button"
              onClick={() => navigateTo('payments')}
              className={`flex flex-col items-center gap-0.5 py-1.5 transition cursor-pointer relative ${
                currentScreen === 'payments' 
                  ? 'text-emerald-500 font-black scale-105' 
                  : `${styles.textMuted} hover:text-slate-350`
              }`}
            >
              <div className="relative">
                <CreditCard className="w-5 h-5" />
                {simulatedDay === 'due' && !userPaymentPaid && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                )}
              </div>
              <span className="text-[9px]">Payments</span>
            </button>
          </>
        ) : (
          <>
            <button 
              type="button"
              onClick={() => navigateTo('adminHub')}
              className={`flex flex-col items-center gap-0.5 py-1.5 transition cursor-pointer ${
                currentScreen === 'adminHub' 
                  ? 'text-emerald-500 font-black scale-105' 
                  : `${styles.textMuted} hover:text-slate-350`
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              <span className="text-[9px]">Occupancy</span>
            </button>
            <button 
              type="button"
              onClick={() => navigateTo('adminCommunications')}
              className={`flex flex-col items-center gap-0.5 py-1.5 transition cursor-pointer ${
                currentScreen === 'adminCommunications' 
                  ? 'text-emerald-500 font-black scale-105' 
                  : `${styles.textMuted} hover:text-slate-350`
              }`}
            >
              <MessageSquare className="w-5 h-5" />
              <span className="text-[9px]">Comms</span>
            </button>
            <button 
              type="button"
              onClick={() => navigateTo('adminLedger')}
              className={`flex flex-col items-center gap-0.5 py-1.5 transition cursor-pointer ${
                currentScreen === 'adminLedger' 
                  ? 'text-emerald-500 font-black scale-105' 
                  : `${styles.textMuted} hover:text-slate-350`
              }`}
            >
              <DollarSign className="w-5 h-5" />
              <span className="text-[9px]">Ledger</span>
            </button>
                        <button 
              type="button"
              onClick={() => navigateTo('adminInventory')}
              className={`flex flex-col items-center gap-0.5 py-1.5 transition cursor-pointer ${
                currentScreen === 'adminInventory' 
                  ? 'text-emerald-500 font-black scale-105' 
                  : `${styles.textMuted} hover:text-slate-350`
              }`}
            >
              <Calendar className="w-5 h-5" />
              <span className="text-[9px]">Inventory</span>
            </button>
<button 
              type="button"
              onClick={() => navigateTo('adminApps')}
              className={`flex flex-col items-center gap-0.5 py-1.5 transition cursor-pointer ${
                currentScreen === 'adminApps' || currentScreen === 'adminInventory' || currentScreen === 'adminGuestBookings' || currentScreen === 'adminStudentTraining' || currentScreen === 'adminTournaments' || currentScreen === 'adminAddMember' || currentScreen === 'adminGroupManager' || currentScreen === 'adminAnalytics'
                  ? 'text-emerald-500 font-black scale-105' 
                  : `${styles.textMuted} hover:text-slate-350`
              }`}
            >
              <Grid className="w-5 h-5" />
              <span className="text-[9px]">Apps</span>
            </button>
          </>
        )}
      </footer>
      {/* Mobile Attendance Roster Drawer Overlay */}
      {selectedMobileRosterGroupId && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col justify-end animate-fadeIn">
          {/* Backdrop dismiss trigger */}
          <div className="flex-1" onClick={() => setSelectedMobileRosterGroupId(null)} />
          
          {/* Drawer Sheet */}
          <div className={`p-5 rounded-t-3xl border-t space-y-4 max-h-[75vh] overflow-y-auto transition-all ${
            isDark ? 'bg-[#192c21] border-emerald-950 text-white' : 'bg-white border-slate-205 text-slate-800'
          }`}>
            <div className="flex justify-between items-center pb-2.5 border-b border-emerald-800/10">
              <div>
                <h3 className="font-black text-xs text-emerald-500 uppercase tracking-wide">
                  {groups.find(g => g.id === selectedMobileRosterGroupId)?.name || 'Group Roster'}
                </h3>
                <span className="text-[10px] text-slate-400">Monthly Attendance Performance</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMobileRosterGroupId(null)}
                className={`p-1.5 rounded-full border transition font-bold ${
                  isDark ? 'bg-slate-900 border-emerald-950/20 text-slate-400 hover:text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-850'
                }`}
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3 divide-y divide-emerald-900/10">
              {(groups.find(g => g.id === selectedMobileRosterGroupId)?.memberIds || []).length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500 italic">
                  No members assigned to this group yet.
                </div>
              ) : (
                members
                  .filter(m => groups.find(g => g.id === selectedMobileRosterGroupId)?.memberIds.includes(m.id))
                  .map(m => {
                    const stats = getMemberGroupAttendance(m.id, selectedMobileRosterGroupId);
                    const isLowAttendance = stats.percentage < 60;
                    return (
                      <div key={m.id} className="pt-3 flex items-center justify-between text-xs animate-fadeIn">
                        <div>
                          <span className="font-bold block text-sm">{m.name}</span>
                          <span className="text-[9px] opacity-75 font-mono">{m.mobile}</span>
                        </div>
                        
                        <div className="text-right">
                          <span className={`text-[10px] font-mono font-black ${isLowAttendance ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {stats.attended} / {stats.total} ({stats.percentage}%)
                          </span>
                          <div className={`w-20 h-1.5 rounded-full overflow-hidden border mt-1 ${
                            isDark ? 'bg-slate-950 border-emerald-950/20' : 'bg-slate-100 border-slate-205'
                          }`}>
                            <div
                              className={`h-full ${isLowAttendance ? 'bg-rose-500' : 'bg-emerald-500'}`}
                              style={{ width: `${stats.percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}


      {/* Confirm Cancellation Modal Overlay (Mobile) */}
      {showCancelModal && cancelBookingTarget && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-sm rounded-2xl border p-5 space-y-4 animate-scaleUp ${
            isDark ? 'bg-slate-900 border-emerald-955/20' : 'bg-white border-slate-200 shadow-2xl'
          }`}>
            <div className="space-y-1">
              <h3 className={`font-black text-sm tracking-tight transition-colors ${styles.textPrimary}`}>
                Confirm Guest Cancellation
              </h3>
              <p className={`text-[11px] ${styles.textMuted}`}>
                Calculate refund policy for <strong>{cancelBookingTarget.name}</strong>.
              </p>
            </div>

            <div className={`p-3 rounded-xl space-y-1.5 text-[11px] border font-medium ${
              isDark ? 'bg-slate-950/40 border-slate-800 text-slate-350' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <div className="flex justify-between">
                <span>Booked Date/Time:</span>
                <span className="font-bold">{cancelBookingTarget.date} • {cancelBookingTarget.time || '10:00 AM'}</span>
              </div>
              <div className="flex justify-between">
                <span>Hours Remaining:</span>
                <span className="font-bold">{cancelRefundDetails.hoursRemaining < 0 ? '0.0 hrs (Past Slot)' : `${cancelRefundDetails.hoursRemaining.toFixed(1)} hrs`}</span>
              </div>
              <div className="flex justify-between">
                <span>Slab Refund %:</span>
                <span className="font-extrabold text-emerald-500">{cancelRefundDetails.refundPercent}%</span>
              </div>
              <div className="flex justify-between border-t border-slate-800/10 pt-1.5">
                <span>Calculated Refund:</span>
                <span className="font-black text-emerald-500 font-mono">₹{cancelRefundDetails.refundAmount}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[9px] opacity-75 font-bold uppercase block mb-1">Cancellation Reason</label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                    isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <option value="Power cut">Power cut</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Tournament">Tournament</option>
                  <option value="Corporate Event">Corporate Event</option>
                  <option value="Other">Other (Specify below...)</option>
                </select>
              </div>

              {cancelReason === 'Other' && (
                <div className="space-y-1 animate-fadeIn">
                  <label className="text-[9px] opacity-75 font-bold uppercase block mb-1">Custom Reason</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter custom reason here..."
                    value={cancelCustomReason}
                    onChange={(e) => setCancelCustomReason(e.target.value)}
                    className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                      isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-55 border-slate-200'
                    }`}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelBookingTarget(null);
                }}
                className={`flex-1 py-2 rounded-xl font-bold border transition cursor-pointer ${
                  isDark ? 'bg-slate-800 border-slate-700 text-slate-350' : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const finalReason = cancelReason === 'Other' ? cancelCustomReason.trim() : cancelReason;
                  if (cancelReason === 'Other' && !finalReason) {
                    return alert('Please enter a custom reason.');
                  }
                  
                  // Filter out booking
                  setGuests(prev => prev.map(g => g.id === cancelBookingTarget.id
                    ? { ...g, status: 'Cancelled', refundIssued: cancelRefundDetails.refundAmount }
                    : g
                  ));
                  
                  alert(`Booking for ${cancelBookingTarget.name} cancelled successfully!\nRefund: ₹${cancelRefundDetails.refundAmount} (${cancelRefundDetails.refundPercent}%)\nReason: ${finalReason}`);
                  
                  setShowCancelModal(false);
                  setCancelBookingTarget(null);
                }}
                className="flex-1 py-2 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-xl cursor-pointer border-none shadow transition"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Deletion Reason Modal Overlay (Mobile) */}
      {showDeleteReasonModal && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-sm rounded-2xl border p-5 space-y-4 animate-scaleUp ${
            isDark ? 'bg-slate-900 border-emerald-950/30' : 'bg-white border-slate-200 shadow-2xl'
          }`}>
            <div className="space-y-1">
              <h3 className={`font-black text-sm tracking-tight transition-colors ${styles.textPrimary}`}>
                Specify Deletion Reason
              </h3>
              <p className={`text-[11px] ${styles.textMuted}`}>
                Please state the reason for deleting this ${deleteReasonType === 'slot' ? 'scheduled slot' : 'guest booking'}.
              </p>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-[9px] opacity-75 font-bold uppercase block mb-1">Predefined Reason</label>
                <select
                  value={selectedDeleteReason}
                  onChange={(e) => setSelectedDeleteReason(e.target.value)}
                  className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                    isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <option value="Power cut">Power cut</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Tournament">Tournament</option>
                  <option value="Corporate Event">Corporate Event</option>
                  <option value="Other">Other (Specify below...)</option>
                </select>
              </div>

              {selectedDeleteReason === 'Other' && (
                <div className="space-y-1 animate-fadeIn">
                  <label className="text-[9px] opacity-75 font-bold uppercase block mb-1">Custom Reason</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter custom reason here..."
                    value={customDeleteReason}
                    onChange={(e) => setCustomDeleteReason(e.target.value)}
                    className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold ${
                      isDark ? 'bg-[#0b140f] border-emerald-950/40 text-white' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteReasonModal(false);
                  setCustomDeleteReason('');
                  setTargetIdToDelete(null);
                }}
                className={`flex-1 py-2 rounded-xl font-bold border transition cursor-pointer ${
                  isDark ? 'bg-slate-800 border-slate-700 text-slate-350' : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const finalReason = selectedDeleteReason === 'Other' ? customDeleteReason.trim() : selectedDeleteReason;
                  if (selectedDeleteReason === 'Other' && !finalReason) {
                    return alert('Please enter a custom reason.');
                  }
                  
                  if (deleteReasonType === 'slot') {
                    setGuestSlots(prev => {
                      const currentList = prev[configBranch] || [];
                      const newList = currentList.filter(s => s.id !== targetIdToDelete);
                      return { ...prev, [configBranch]: newList };
                    });
                    
                    alert(`Scheduled guest slot deleted successfully!\nReason: ${finalReason}`);
                  } else {
                    setGuests(prev => prev.filter(g => g.id !== targetIdToDelete));
                    alert(`Guest booking rejected successfully!\nReason: ${finalReason}`);
                  }
                  
                  setShowDeleteReasonModal(false);
                  setCustomDeleteReason('');
                  setTargetIdToDelete(null);
                }}
                className="flex-1 py-2 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-xl cursor-pointer border-none shadow transition"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
