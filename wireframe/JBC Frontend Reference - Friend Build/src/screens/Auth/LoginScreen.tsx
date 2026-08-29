import React, { useState } from 'react';
import { ChevronLeft, Fingerprint } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (role: 'guest' | 'admin' | 'member' | 'student') => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [step, setStep] = useState('phone'); // 'phone' | 'otp'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const handleSendCode = () => {
    if (phone.length < 10) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep('otp');
    }, 800);
  };

  const handleVerify = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess('guest');
    }, 1000);
  };

  const handleMemberGoogleLogin = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep('biometrics');
    }, 800);
  };

  const executeBiometricScanMock = (optIn: boolean) => {
    if (!optIn) {
      onLoginSuccess('member');
      return;
    }
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      onLoginSuccess('member');
    }, 1500);
  };



  if (step === 'biometrics') {
    return (
      <div className="min-h-screen bg-[#14231a] text-slate-100 flex flex-col items-center justify-center p-6 relative font-sans">
        <div className="w-full max-w-[390px] bg-[#192c21] rounded-3xl border border-emerald-800/40 p-6 space-y-8 text-center shadow-2xl relative overflow-hidden">
          
          <div className="space-y-3">
            <h2 className="text-2xl font-black text-white flex items-center justify-center gap-2">
              <Fingerprint className="w-6 h-6 text-emerald-400" /> Biometric Access
            </h2>
            <p className="text-[14px] text-slate-400 px-2 leading-relaxed">
              Enable Touch ID / Fingerprint scanner for fast verification bypass.
            </p>
          </div>

          <div className="py-6 flex justify-center">
            <button 
              onClick={() => executeBiometricScanMock(true)}
              disabled={isScanning}
              className={`w-28 h-28 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                isScanning 
                  ? 'border-amber-400 bg-amber-500/10 animate-pulse text-amber-400 scale-105' 
                  : 'border-emerald-500/30 bg-emerald-950/20 hover:border-emerald-400 text-emerald-400 hover:scale-105 active:scale-95'
              }`}
              title="Touch sensor area"
            >
              <Fingerprint className="w-14 h-14" />
            </button>
          </div>

          {isScanning && (
            <div className="text-[13px] font-mono text-amber-400 animate-pulse uppercase tracking-wider font-extrabold h-14 flex items-center justify-center">
              Calling System API Sensor...
            </div>
          )}

          {!isScanning && (
            <div className="space-y-3 h-14 flex flex-col justify-center">
              <button 
                onClick={() => executeBiometricScanMock(true)}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-[14px] transition cursor-pointer border-none shadow-md"
              >
                Register Device Fingerprint
              </button>
              <button 
                onClick={() => executeBiometricScanMock(false)}
                className="w-full py-2 text-slate-400 hover:text-slate-300 font-extrabold text-[13px] transition cursor-pointer bg-transparent border-none"
              >
                Skip, Use Standard Session Token
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-[#f3f4f6] flex flex-col items-center p-6 relative font-sans">
        <div className="w-full max-w-[390px] h-[844px] bg-[#f9fafb] rounded-[34px] shadow-2xl overflow-hidden relative flex flex-col border border-slate-200">
          
          <div className="bg-[#111827] p-5 flex items-center gap-4 flex-none">
            <button 
              onClick={() => setStep('phone')}
              className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center border-none cursor-pointer hover:bg-slate-700"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="text-base font-bold text-white">Verify your number</div>
          </div>

          <div className="flex-1 p-6 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 className="font-black text-[28px] leading-tight m-0 text-slate-900 tracking-tight">Enter the code</h2>
              <p className="m-0 text-[14px] leading-relaxed text-slate-600">
                Sent by SMS to +91 {phone}. <button onClick={() => setStep('phone')} className="text-emerald-600 font-bold bg-transparent border-none cursor-pointer p-0 underline">Wrong number?</button>
              </p>
            </div>

            <div className="flex gap-2">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <div key={index} className={`flex-1 h-[66px] rounded-2xl border flex items-center justify-center text-2xl font-black bg-white ${index === 3 ? 'border-emerald-600 border-2' : 'border-slate-300 text-slate-900'}`}>
                  {index < 3 ? Math.floor(Math.random() * 9) + 1 : index === 3 ? <div className="w-[2px] h-[26px] bg-emerald-600 animate-pulse" /> : ''}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-[13px]">
              <span className="text-slate-500">Resend in 0:24</span>
              <button className="font-bold text-slate-400 bg-transparent border-none p-0 cursor-not-allowed">Resend code</button>
            </div>

            <button 
              onClick={handleVerify}
              className="mt-2 w-full min-h-[54px] rounded-2xl border-none bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-[15px] cursor-pointer transition-colors shadow-sm"
            >
              {isLoading ? 'Verifying...' : 'Verify and continue'}
            </button>

            <div className="mt-auto bg-emerald-50 rounded-2xl p-4 text-[12.5px] leading-relaxed text-emerald-800 border border-emerald-100">
              Three wrong codes and the number is locked for 15 minutes. One booking per number per day.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] flex flex-col items-center p-6 relative font-sans">
      <div className="w-full max-w-[390px] h-[844px] bg-[#111827] rounded-[34px] shadow-2xl overflow-hidden relative flex flex-col border border-slate-800">
        
        <div className="h-[290px] flex-none bg-[repeating-linear-gradient(115deg,#064e3b_0_12px,#022c22_12px_24px)] flex flex-col justify-between p-8 pt-10">
          <div className="font-black text-4xl text-white tracking-tighter">JBC</div>
          <span className="text-[10.5px] font-bold tracking-[0.06em] text-emerald-100 bg-black/40 px-3 py-1.5 rounded-full self-start uppercase">
            Badminton Arena
          </span>
        </div>

        <div className="flex-1 bg-[#f9fafb] rounded-t-[32px] -mt-6 p-7 flex flex-col gap-6 relative z-10 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
          <div className="flex flex-col gap-2">
            <h2 className="font-black text-[28px] leading-tight m-0 text-slate-900 tracking-tight">Book a court at JBC</h2>
            <p className="m-0 text-[14px] leading-relaxed text-slate-600">
              Sign in once so we know the courts are going to real players.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="text-[11px] font-bold tracking-[0.09em] text-slate-500 uppercase">GUEST · PHONE NUMBER</div>
            <div className="flex items-center gap-3 border border-slate-300 bg-white rounded-2xl px-4 min-h-[56px] focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-200 transition-all shadow-sm">
              <span className="text-[15px] font-bold text-slate-600">+91</span>
              <span className="w-px h-[22px] bg-slate-200"></span>
              <input 
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98450 22119"
                className="flex-1 bg-transparent border-none text-[15px] font-bold text-slate-900 placeholder-slate-300 focus:outline-none"
              />
            </div>
            <button 
              onClick={handleSendCode}
              disabled={phone.length < 10}
              className="w-full min-h-[54px] rounded-2xl border-none bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-[15px] cursor-pointer transition-all shadow-sm mt-1"
            >
              {isLoading ? 'Sending...' : 'Send me a code'}
            </button>
          </div>

          <div className="flex items-center gap-3 py-1">
            <span className="flex-1 h-px bg-slate-200"></span>
            <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">or</span>
            <span className="flex-1 h-px bg-slate-200"></span>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={handleMemberGoogleLogin}
              className="flex items-center justify-center gap-3 min-h-[54px] rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 font-bold text-[15px] text-slate-800 cursor-pointer transition-all shadow-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.47 15 1 12 1 7.35 1 3.39 3.65 1.41 7.53l3.87 3a7.16 7.16 0 0 1 6.72-5.49z"/>
                <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46a5.5 5.5 0 0 1-2.4 3.61l3.73 2.89c2.18-2.01 3.7-4.97 3.7-8.65z"/>
                <path fill="#FBBC05" d="M5.28 14.53a7.11 7.11 0 0 1 0-4.13l-3.87-3A11.95 11.95 0 0 0 1 12c0 1.69.35 3.3 1.41 4.7l3.87-3.17z"/>
                <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.73-2.89a7.14 7.14 0 0 1-10.95-3.67l-3.87 3A11.94 11.94 0 0 0 12 23z"/>
              </svg>
              Member Login (Google)
            </button>
            <div className="text-[12px] leading-relaxed text-slate-500 text-center px-2">
              Members will be prompted for Biometric access.
            </div>
          </div>

          <div className="mt-auto text-[11.5px] leading-relaxed text-slate-400 text-center">
            By continuing you accept the court rules and the 4-hour cancellation policy.
          </div>
        </div>
      </div>
    </div>
  );
}
