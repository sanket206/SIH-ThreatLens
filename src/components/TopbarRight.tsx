'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TopbarRight() {
  const router = useRouter();
  const [timeStr, setTimeStr] = useState('00:00:00');
  const [dateStr, setDateStr] = useState('—');
  const [fullName, setFullName] = useState('Alex Reyes');
  const [role, setRole] = useState('SOC Analyst');

  useEffect(() => {
    // Clock
    const updateClock = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const secs = String(now.getSeconds()).padStart(2, '0');
      setTimeStr(`${hrs}:${mins}:${secs}`);

      const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      setDateStr(`${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`);
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 1000);

    // Profile Name
    const updateProfile = () => {
      const storedName = localStorage.getItem('ThreatLens_userName');
      if (storedName) {
        setFullName(storedName);
      }
    };
    updateProfile();
    window.addEventListener('profileUpdated', updateProfile);

    return () => {
      clearInterval(clockInterval);
      window.removeEventListener('profileUpdated', updateProfile);
    };
  }, []);

  const initials = fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

  return (
    <>
      <style jsx>{`
        .topbar-right { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
        .clock { font-family: var(--font-mono); font-size: 13px; color: var(--text-dim); text-align: right; display: flex; flex-direction: column; gap: 2px; }
        .clock .time { color: var(--text); font-size: 13.5px; }
        .clock .date { font-size: 10px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.06em; }
        
        .user-chip {
          display: flex; align-items: center; gap: 10px; padding: 6px 12px 6px 6px;
          border: 1px solid var(--glass-border); background: var(--glass-bg); backdrop-filter: blur(10px);
          border-radius: 30px; position: relative; cursor: pointer; transition: border-color .18s ease, background .18s ease, box-shadow .18s ease;
        }
        .user-chip:hover { border-color: rgba(var(--cyan-rgb),0.5); background: var(--glass-bg-hover); box-shadow: 0 6px 22px -8px rgba(var(--cyan-rgb),0.45); }
        .avatar {
          width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, var(--cyan), var(--magenta));
          display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-weight: 600; font-size: 11px; color: #050209; transition: box-shadow .2s ease;
        }
        .user-chip:hover .avatar { box-shadow: 0 0 14px rgba(var(--cyan-rgb),0.5); }
        .user-chip .who { display: flex; flex-direction: column; line-height: 1.2; }
        .user-chip .who .n { font-size: 12.5px; font-weight: 600; color: var(--text); }
        .user-chip .who .r { font-size: 10px; color: var(--text-faint); }
      `}</style>

      <div className="topbar-right">
        <div className="clock">
          <span className="time">{timeStr}</span>
          <span className="date">{dateStr}</span>
        </div>
        
        <div className="user-chip" onClick={() => router.push('/settings')}>
          <div className="avatar">{initials}</div>
          <div className="who">
            <span className="n">{fullName}</span>
            <span className="r">{role}</span>
          </div>
        </div>
      </div>
    </>
  );
}
