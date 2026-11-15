import React, { useState, useEffect, useRef, useMemo } from 'react';
import './App.css';

const POSTURE_TYPES = {
  good: { name: '바른 자세', color: '#10b981', en: 'Good' },
  left: { name: '좌측 쏠림 (다리 꼬기)', color: '#f59e0b', en: 'Left Tilt' },
  right: { name: '우측 쏠림 (다리 꼬기)', color: '#6366f1', en: 'Right Tilt' },
  forward: { name: '거북목 / 상체 숙임', color: '#ef4444', en: 'Forward' },
  slouch: { name: '뒤로 눕기 (슬라우칭)', color: '#8b5cf6', en: 'Slouch' },
};

const BASE_DOMAIN = 'smart-chair-web.site';
const PRESSURE_MAX_SUM = 8184;          // 1023 × 8채널
const DEFAULT_SIT_THRESHOLD = 2000;     // 서버 값이 없을 때 사용
const DEFAULT_TILT_ANGLE = 15;
const TILT_GAUGE_MAX = 45;
const RECENT_KEY = 'chair_recent_searches';
const FAVORITE_KEY = 'chair_favorites';
const MAX_RECENT = 8;

const SENSORS = [
  { ch: 0, name: '1번 센서', pos: '후방 좌' }, { ch: 1, name: '2번 센서', pos: '후방 중' },
  { ch: 2, name: '3번 센서', pos: '후방 우' }, { ch: 3, name: '4번 센서', pos: '중앙 좌' },
  { ch: 4, name: '5번 센서', pos: '중앙' }, { ch: 5, name: '6번 센서', pos: '중앙 우' },
  { ch: 6, name: '7번 센서', pos: '전방 좌' }, { ch: 7, name: '8번 센서', pos: '전방 우' },
];

// =============================================================
// 🔍 검색 대상 목록 (제목·설명·키워드 중 한 글자라도 겹치면 검색됨)
// =============================================================
const SEARCH_ITEMS = [
  { id: 'tab-stats', icon: '📊', title: '오늘의 자세 통계', desc: '자세 비율 도넛 차트와 자세별 시간', keywords: ['통계', '도넛', '비율', '차트', '오늘', '분석'], action: 'tab:statistics' },
  { id: 'tab-heatmap', icon: '💺', title: '실시간 센서 히트맵', desc: '압력센서 8개 실시간 분포', keywords: ['압력', '센서', '히트맵', '방석', 'FSR', '분포'], action: 'tab:heatmap' },
  { id: 'history', icon: '📅', title: '지난 자세점수 보기', desc: '연도별·월별·일별 점수 기록', keywords: ['기록', '점수', '과거', '히스토리', '연도', '월별', '일별', '리포트'], action: 'modal:history' },
  { id: 'calibrate', icon: '🎯', title: '바른 자세 0점 설정', desc: '내 체형 기준을 저장 (캘리브레이션)', keywords: ['캘리브레이션', '기준', '보정', '0점', '체형', 'AI'], action: 'modal:calibrate' },
  { id: 'tab-device', icon: '📺', title: '기기 화면', desc: 'LCD 미리보기와 기울기 그래프', keywords: ['기기', '하드웨어', 'LCD', '기울기'], action: 'tab:device' },
  { id: 'lcd', icon: '📟', title: 'LCD 화면 미리보기', desc: '의자 LCD에 지금 표시 중인 내용', keywords: ['LCD', '화면', '디스플레이', '1602', '액정'], action: 'device:card-lcd' },
  { id: 'tilt', icon: '📐', title: '의자 기울기', desc: '실시간 기울기 각도와 경고 기준', keywords: ['각도', '기울기', '틸트', 'MPU6050', '경사'], action: 'device:card-tilt' },
  { id: 'alerts', icon: '🔔', title: '알림 상태', desc: '부저·진동·LED 작동 여부', keywords: ['부저', '진동', 'LED', '알람', '경고', '소리', '모터'], action: 'scroll:sum-alerts' },
  { id: 'score', icon: '💯', title: '실시간 자세 점수', desc: '오늘 바른 자세 비율로 계산한 점수', keywords: ['점수', '스코어', '건강'], action: 'scroll:sum-score' },
  { id: 'status', icon: '🧍', title: '현재 감지 상태', desc: '지금 AI가 판단한 자세', keywords: ['현재', '자세', '상태', '감지', 'AI'], action: 'scroll:sum-posture' },
  { id: 'sittime', icon: '⏱️', title: '오늘 총 착석 시간', desc: '오늘 의자에 앉아 있던 시간', keywords: ['착석', '시간', '앉은', '오늘'], action: 'scroll:sum-sit' },
  { id: 'login', icon: '🔒', title: '로그인 / 회원가입', desc: '서브도메인과 PIN으로 의자 연결', keywords: ['로그인', '가입', '등록', '계정', 'PIN', '서브도메인', '연결'], action: 'auth:login' },
  { id: 'logout', icon: '🔓', title: '로그아웃', desc: '현재 의자 연결 끊기', keywords: ['로그아웃', '연결 해제', '나가기'], action: 'auth:logout' },
  { id: 'delete', icon: '🗑️', title: '기기 등록 해제', desc: '계정 삭제 후 새로 등록', keywords: ['계정 삭제', '해제', '초기화', '탈퇴'], action: 'auth:delete' },
  ...Object.entries(POSTURE_TYPES).map(([key, p]) => ({
    id: `posture-${key}`, icon: '🪑', title: p.name, desc: '오늘 이 자세로 앉아 있던 비율과 시간', keywords: ['자세', p.en], action: `posture:${key}`,
  })),
  ...SENSORS.map((s) => ({
    id: `sensor-${s.ch}`, icon: '🔴', title: `${s.name} (${s.pos})`, desc: '실시간 압력값', keywords: ['압력', '센서', s.pos, `CH${s.ch}`], action: `sensor:${s.ch}`,
  })),
];

const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, '');

// 점수: 제목 완전 일치 > 제목 포함 > 내용 포함 > 단어 일치 > 겹치는 글자 수
function scoreItem(query, item) {
  const q = normalize(query);
  if (!q) return 0;
  const title = normalize(item.title);
  const hay = normalize([item.title, item.desc, ...(item.keywords || [])].join(' '));
  const chars = [...new Set(q)];
  const matched = chars.filter((c) => hay.includes(c)).length;
  if (matched === 0) return 0;                         // 한 글자도 안 겹치면 제외
  let score = matched * 3 + chars.filter((c) => title.includes(c)).length * 2;
  if (title === q) score += 100;
  if (title.includes(q)) score += 50;
  else if (hay.includes(q)) score += 30;
  query.toLowerCase().split(/\s+/).filter(Boolean).forEach((w) => { if (hay.includes(w)) score += 10; });
  return score;
}

function HighlightText({ text, query }) {
  const qChars = new Set(normalize(query));
  return (
    <>
      {[...text].map((ch, i) => (qChars.has(ch.toLowerCase()) ? <mark key={i}>{ch}</mark> : <span key={i}>{ch}</span>))}
    </>
  );
}

const loadList = (key) => {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const saveList = (key, list) => { try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* 저장 실패 무시 */ } };

// 📈 연/월/일별 점수 추이 차트
function TrendChart({ data, xKey, yKey, unit = '점' }) {
  if (!data || data.length === 0) {
    return <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '12px' }}>표시할 그래프 데이터가 없습니다.</div>;
  }
  const width = 380, height = 130;
  const padding = { top: 20, right: 20, bottom: 25, left: 30 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const points = data.map((d, i) => {
    const x = padding.left + (chartW / Math.max(data.length - 1, 1)) * i;
    const yVal = Math.max(0, Math.min(100, d[yKey]));
    const y = padding.top + chartH - (yVal / 100) * chartH;
    return { x, y, label: d[xKey], val: d[yKey] };
  });
  return (
    <div style={{ background: '#f8fafc', padding: '10px 8px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
      <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '4px', textAlign: 'right' }}>단위: {unit} (기준: 0~100)</div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={padding.left} y1={padding.top} x2={width - padding.right} y2={padding.top} stroke="#e2e8f0" strokeDasharray="3 3" />
        <line x1={padding.left} y1={padding.top + chartH / 2} x2={width - padding.right} y2={padding.top + chartH / 2} stroke="#e2e8f0" strokeDasharray="3 3" />
        <line x1={padding.left} y1={padding.top + chartH} x2={width - padding.right} y2={padding.top + chartH} stroke="#cbd5e1" />
        {points.length > 1 && <polyline fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points.map((p) => `${p.x},${p.y}`).join(' ')} />}
        {points.map((p, idx) => (
          <g key={idx}>
            <circle cx={p.x} cy={p.y} r="4" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
            <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#1e293b">{p.val}</text>
            <text x={p.x} y={height - 6} textAnchor="middle" fontSize="9" fill="#64748b">{p.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function App() {
  const [todayDate, setTodayDate] = useState('');
  const [currentPosture, setCurrentPosture] = useState('good');
  const [activeTab, setActiveTab] = useState('statistics');

  // 모달 · 캘리브레이션
  const [activeModal, setActiveModal] = useState(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibProgress, setCalibProgress] = useState(0);
  const [calibStep, setCalibStep] = useState(0);
  const [calibSnapshots, setCalibSnapshots] = useState([]);
  const [calibMessage, setCalibMessage] = useState('');
  const [selectedDetail, setSelectedDetail] = useState(null);
  const calibTimerRef = useRef(null);

  // 인증
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem('chair_server_url') || '');
  const [subdomain, setSubdomain] = useState(() => {
    const match = (localStorage.getItem('chair_server_url') || '').match(/https?:\/\/([^.]+)\./);
    return match ? match[1] : '';
  });
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('chair_server_url'));
  const [isConnected, setIsConnected] = useState(false);
  const [authModal, setAuthModal] = useState(null);
  const [authSubdomain, setAuthSubdomain] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [isDeviceLocked, setIsDeviceLocked] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePin, setDeletePin] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // 실시간 데이터
  const [pressures, setPressures] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const [isSitting, setIsSitting] = useState(false);
  const [angle, setAngle] = useState(0);
  const [sittingTime, setSittingTime] = useState(null);
  const [continuousSit, setContinuousSit] = useState(0);
  const [alertType, setAlertType] = useState('');
  const [isBuzzerOn, setIsBuzzerOn] = useState(false);
  const [isMotorOn, setIsMotorOn] = useState(false);
  const [isLedOn, setIsLedOn] = useState(false);
  const [sitThreshold, setSitThreshold] = useState(DEFAULT_SIT_THRESHOLD);
  const [tiltAlarmAngle, setTiltAlarmAngle] = useState(DEFAULT_TILT_ANGLE);
  const [aiModel, setAiModel] = useState('');
  const [postureSeconds, setPostureSeconds] = useState({ good: 0, left: 0, right: 0, forward: 0, slouch: 0 });

  // 검색 · 최근 검색 · 즐겨찾기
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const [recentSearches, setRecentSearches] = useState(() => loadList(RECENT_KEY));
  const [favorites, setFavorites] = useState(() => loadList(FAVORITE_KEY));
  const [highlightId, setHighlightId] = useState('');
  const searchBoxRef = useRef(null);
  const searchInputRef = useRef(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountRef = useRef(null);

  // 기록
  const [drillLevel, setDrillLevel] = useState('year');
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMonth, setSelectedMonth] = useState('9');
  const [yearlyData, setYearlyData] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [dailyData, setDailyData] = useState([]);

  // ---------------- 날짜 ----------------
  useEffect(() => {
    const updateDate = () => setTodayDate(new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }));
    updateDate();
    const t = setInterval(updateDate, 60000);
    return () => clearInterval(t);
  }, []);

  // ---------------- 실시간 폴링 (1초) ----------------
  useEffect(() => {
    let isMounted = true;
    const fetchLiveStatus = async () => {
      if (!serverUrl || !isLoggedIn) {
        if (isMounted) { setIsConnected(false); setIsSitting(false); }
        return;
      }
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const response = await fetch(`${serverUrl}/api/live-status`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) { if (isMounted) setIsConnected(false); return; }
        const d = await response.json();
        if (!isMounted) return;
        if (d.currentPosture) setCurrentPosture(d.currentPosture);
        if (d.postureSeconds) setPostureSeconds(d.postureSeconds);
        if (Array.isArray(d.pressures)) setPressures(d.pressures);
        if (d.is_sitting !== undefined) setIsSitting(d.is_sitting);
        if (typeof d.angle === 'number') setAngle(d.angle);
        if (typeof d.sitting_time === 'number') setSittingTime(d.sitting_time);
        setIsBuzzerOn(!!d.is_buzzer_on);
        setIsMotorOn(!!d.is_motor_on);
        setIsLedOn(d.is_led_on !== undefined ? !!d.is_led_on : !!d.is_buzzer_on);
        setAlertType(d.alert_type || '');
        if (typeof d.continuous_sit_seconds === 'number') setContinuousSit(d.continuous_sit_seconds);
        if (typeof d.sit_threshold === 'number') setSitThreshold(d.sit_threshold);
        if (typeof d.tilt_alarm_angle === 'number') setTiltAlarmAngle(d.tilt_alarm_angle);
        setAiModel(d.ai_model || '');
        setIsConnected(true);
      } catch {
        if (isMounted) { setIsConnected(false); setIsSitting(false); }
      }
    };
    fetchLiveStatus();
    const t = setInterval(fetchLiveStatus, 1000);
    return () => { isMounted = false; clearInterval(t); };
  }, [serverUrl, isLoggedIn]);

  useEffect(() => {
    if (!serverUrl || !isLoggedIn || activeModal !== 'history') return;
    fetch(`${serverUrl}/api/history/years`).then((r) => r.json()).then((d) => { if (Array.isArray(d)) setYearlyData(d); }).catch(() => {});
  }, [serverUrl, isLoggedIn, activeModal]);

  // 검색창 바깥 클릭 시 닫기
  useEffect(() => {
    const onDown = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) setIsSearchOpen(false);
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // 강조 표시 2초 뒤 해제
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(''), 2200);
    return () => clearTimeout(t);
  }, [highlightId]);

  // ---------------- 계산 값 ----------------
  const totalSeconds = Object.values(postureSeconds).reduce((a, b) => a + b, 0);
  const sitSeconds = sittingTime ?? totalSeconds;
  const postureStats = Object.keys(POSTURE_TYPES).map((key) => {
    const sec = postureSeconds[key] || 0;
    return { key, ...POSTURE_TYPES[key], seconds: sec, percentage: totalSeconds > 0 ? (sec / totalSeconds) * 100 : 0 };
  });
  const healthScore = isConnected && totalSeconds > 0 ? Math.round(((postureSeconds.good || 0) / totalSeconds) * 100) : 0;
  let cumulative = 0;
  const gradientParts = postureStats.map((s) => { const start = cumulative; cumulative += s.percentage; return `${s.color} ${start}% ${cumulative}%`; });
  const donutChartStyle = totalSeconds > 0 ? { background: `conic-gradient(${gradientParts.join(', ')})` } : { background: '#e2e8f0' };
  const pressureSum = pressures.reduce((a, b) => a + b, 0);
  const isTiltOver = angle >= tiltAlarmAngle;

  const formatTime = (sec) => {
    if (!sec) return '0초';
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return `${h}시간 ${m}분`;
    if (m > 0) return `${m}분 ${s}초`;
    return `${s}초`;
  };
  const pad2 = (n) => String(n).padStart(2, '0');

  const getCircleStyle = (val) => {
    const ratio = Math.min(Math.max((val || 0) / 1023, 0), 1);
    const size = 12 + ratio * 24;
    return {
      width: `${size}px`, height: `${size}px`,
      backgroundColor: `rgba(239, 68, 68, ${(0.15 + ratio * 0.85).toFixed(2)})`,
      boxShadow: ratio > 0.5 ? `0 0 ${Math.round(ratio * 10)}px rgba(239, 68, 68, 0.5)` : 'none',
    };
  };

  // 📺 실제 의자 LCD(app.py update_lcd)와 같은 규칙으로 표시
  const getLcdScreenText = () => {
    const L = (s) => s.padEnd(16, ' ').slice(0, 16);
    const en = POSTURE_TYPES[currentPosture]?.en || 'Good';
    const ang = `${angle.toFixed(1).padStart(5, ' ')} deg`;
    if (!isConnected) return { line1: L('Smart Chair'), line2: L('Connecting...') };
    if (alertType === 'tilt') return { line1: L('!! Be careful !!'), line2: L(`Angle:${ang}`) };
    if (alertType === 'posture') return { line1: L('Fix your posture'), line2: L(`Pos: ${en}`) };
    if (alertType === 'sit') return { line1: L('Please stand up!'), line2: L(`Sitting: ${pad2(Math.floor(continuousSit / 60))}:${pad2(continuousSit % 60)}`) };
    if (isSitting) {
      const h = Math.floor(sitSeconds / 3600), m = Math.floor((sitSeconds % 3600) / 60), s = sitSeconds % 60;
      return { line1: L(`Pos: ${en}`), line2: L(`Time: ${pad2(h)}:${pad2(m)}:${pad2(s)}`) };
    }
    return { line1: L('Chair Empty'), line2: L(`Tilt:${ang}`) };
  };
  const lcdText = getLcdScreenText();

  const alertMessage = {
    tilt: `의자가 ${tiltAlarmAngle}° 이상 기울어졌어요 — 조심하세요!`,
    posture: '나쁜 자세가 계속되고 있어요 — 자세를 바로 해 주세요',
    sit: '오래 앉아 있었어요 — 잠깐 일어나 스트레칭하세요',
  }[alertType] || (isConnected ? '정상 — 울리는 알림이 없어요' : '의자 연결 대기 중');

  // ---------------- 인증 ----------------
  const handleLogin = async (e) => {
    e.preventDefault(); setAuthError('');
    const cleanSub = authSubdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!cleanSub || authPin.length !== 4) return setAuthError('서브도메인과 4자리 숫자 PIN을 확인해주세요.');
    const targetUrl = `https://${cleanSub}.${BASE_DOMAIN}`;
    try {
      const res = await fetch(`${targetUrl}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: cleanSub, pin: authPin }),
      });
      const result = await res.json();
      if (res.status === 403 && result.is_locked) { setIsDeviceLocked(true); return setAuthError(result.message || '🚨 기기가 잠금되었습니다.'); }
      if (!res.ok || !result.success) return setAuthError(result.message || '로그인 실패.');
      localStorage.setItem('chair_server_url', targetUrl);
      setServerUrl(targetUrl); setSubdomain(cleanSub); setIsLoggedIn(true);
      setAuthModal(null); setAuthPin(''); setIsDeviceLocked(false);
    } catch {
      setAuthError(`[${cleanSub}.${BASE_DOMAIN}] 서버에 연결할 수 없습니다. 라즈베리파이와 Cloudflare 터널 상태를 확인해주세요.`);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault(); setAuthError('');
    const cleanSub = authSubdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!cleanSub || authPin.length !== 4) return setAuthError('서브도메인과 4자리 PIN을 입력하세요.');
    const targetUrl = `https://${cleanSub}.${BASE_DOMAIN}`;
    try {
      const res = await fetch(`${targetUrl}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: cleanSub, pin: authPin }),
      });
      const result = await res.json();
      if (res.status === 403 && result.already_registered) return setAuthError(`⚠️ 이미 [${result.registered_subdomain}] 계정이 등록되어 있습니다.`);
      if (!res.ok || !result.success) return setAuthError(result.message || '회원가입 실패.');
      alert(`🎉 [${cleanSub}] 정상 등록 완료! 로그인해주세요.`);
      setAuthModal('login'); setAuthPin('');
    } catch { setAuthError('서버 연결 실패.'); }
  };

  const handleLogout = () => {
    if (window.confirm('로그아웃하시겠습니까?')) {
      localStorage.removeItem('chair_server_url');
      setServerUrl(''); setSubdomain(''); setIsLoggedIn(false); setIsConnected(false); setIsSitting(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault(); setDeleteError('');
    if (deletePin.length !== 4) return setDeleteError('4자리 PIN을 입력하세요.');
    if (!window.confirm('정말로 기기 계정을 삭제하시겠습니까?')) return;
    const targetUrl = serverUrl || `https://${authSubdomain || subdomain}.${BASE_DOMAIN}`;
    try {
      const res = await fetch(`${targetUrl}/api/auth/delete-account`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: deletePin }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) return setDeleteError(result.message || '삭제 실패.');
      alert('🗑️ 계정이 초기화되었습니다.');
      localStorage.removeItem('chair_server_url');
      setServerUrl(''); setSubdomain(''); setIsLoggedIn(false); setIsConnected(false); setIsSitting(false);
      setIsDeleteModalOpen(false); setDeletePin(''); setAuthModal('register');
    } catch { setDeleteError('통신 오류.'); }
  };

  const openLoginModal = () => { setAuthSubdomain(subdomain || ''); setAuthPin(''); setAuthError(''); setIsDeviceLocked(false); setAuthModal('login'); };

  // ---------------- 캘리브레이션 (서버에서 직접 0.5초마다 6번 측정) ----------------
  const openCalibModal = () => { setCalibStep(0); setCalibSnapshots([]); setCalibMessage(''); setActiveModal('calibrate'); };

  const handleStartCalibration = () => {
    if (isCalibrating) return;
    if (!isConnected) return setCalibMessage('⚠️ 의자가 연결되어 있지 않습니다. 먼저 로그인해주세요.');
    setCalibMessage(''); setIsCalibrating(true); setCalibProgress(0);
    const stepSnapshots = [];
    let count = 0;
    const totalCount = 6;
    calibTimerRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${serverUrl}/api/live-status`);
        const d = await r.json();
        if (Array.isArray(d.pressures)) stepSnapshots.push(d.pressures);
      } catch { /* 한 번 실패는 건너뜀 */ }
      count++;
      setCalibProgress(Math.round((count / totalCount) * 100));
      if (count >= totalCount) {
        clearInterval(calibTimerRef.current);
        setIsCalibrating(false);
        if (stepSnapshots.length === 0) return setCalibMessage('⚠️ 센서 값을 받지 못했습니다. 연결 상태를 확인해주세요.');
        const updated = [...calibSnapshots, ...stepSnapshots];
        setCalibSnapshots(updated);
        if (calibStep < 2) setCalibStep(calibStep + 1);
        else finishCalibration(updated);
      }
    }, 500);
  };

  const finishCalibration = async (snaps) => {
    const avg = snaps[0].map((_, i) => Math.round(snaps.reduce((acc, row) => acc + row[i], 0) / snaps.length));
    if (avg.reduce((a, b) => a + b, 0) <= sitThreshold) {
      setCalibStep(0); setCalibSnapshots([]);
      return setCalibMessage('⚠️ 앉은 상태로 측정되지 않았어요. 의자에 바르게 앉은 뒤 다시 시작해주세요.');
    }
    try {
      const res = await fetch(`${serverUrl}/api/calibrate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ good_baseline: avg }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.status !== 'success') {
        setCalibStep(0); setCalibSnapshots([]);
        return setCalibMessage(`⚠️ ${result.message || '서버가 기준값을 저장하지 못했습니다.'}`);
      }
      alert('✅ 바른 자세 기준과 기울기 0° 기준이 저장되었습니다!');
      closeCalibModal();
    } catch {
      setCalibMessage('⚠️ 서버로 전송하지 못했습니다. 네트워크 상태를 확인해주세요.');
    }
  };

  const closeCalibModal = () => {
    if (calibTimerRef.current) clearInterval(calibTimerRef.current);
    setIsCalibrating(false); setCalibProgress(0); setCalibStep(0); setCalibSnapshots([]); setCalibMessage(''); setActiveModal(null);
  };

  // ---------------- 기록 ----------------
  const getRiskInfo = (score) => {
    if (score >= 80) return { label: '안전', class: 'risk-safe' };
    if (score >= 70) return { label: '주의', class: 'risk-warning' };
    return { label: '위험', class: 'risk-danger' };
  };
  const getDisplayUrl = (url) => (url ? url.replace(/^https?:\/\//, '') : '');
  const handleOpenYearView = () => { setDrillLevel('year'); setActiveModal('history'); };
  const handleSelectYear = (yearStr) => {
    const rawYear = yearStr.replace(/[^0-9]/g, '');
    setSelectedYear(rawYear); setDrillLevel('month'); setMonthlyData([]);
    if (serverUrl) fetch(`${serverUrl}/api/history/months?year=${rawYear}`).then((r) => r.json()).then((d) => { if (Array.isArray(d)) setMonthlyData(d); }).catch(() => {});
  };
  const handleSelectMonth = (monthStr) => {
    const rawMonth = monthStr.replace(/[^0-9]/g, '');
    setSelectedMonth(rawMonth); setDrillLevel('day'); setDailyData([]);
    if (serverUrl) fetch(`${serverUrl}/api/history/days?year=${selectedYear}&month=${rawMonth}`).then((r) => r.json()).then((d) => { if (Array.isArray(d)) setDailyData(d); }).catch(() => {});
  };

  // ---------------- 검색 ----------------
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return SEARCH_ITEMS.map((item) => ({ item, score: scoreItem(searchQuery, item) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((r) => r.item);
  }, [searchQuery]);

  const favoriteItems = favorites.map((id) => SEARCH_ITEMS.find((it) => it.id === id)).filter(Boolean);

  const addRecent = (text) => {
    const t = text.trim();
    if (!t) return;
    const next = [t, ...recentSearches.filter((r) => r !== t)].slice(0, MAX_RECENT);
    setRecentSearches(next); saveList(RECENT_KEY, next);
  };
  const removeRecent = (text) => { const next = recentSearches.filter((r) => r !== text); setRecentSearches(next); saveList(RECENT_KEY, next); };
  const clearRecent = () => { setRecentSearches([]); saveList(RECENT_KEY, []); };

  const toggleFavorite = (id) => {
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    setFavorites(next); saveList(FAVORITE_KEY, next);
  };

  const scrollAndHighlight = (elementId) => {
    setHighlightId(elementId);
    setTimeout(() => document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  };

  const runAction = (item) => {
    const [type, arg] = item.action.split(':');
    if (type === 'tab') { setActiveTab(arg); scrollAndHighlight({ statistics: 'tile-stats', heatmap: 'tile-heatmap', device: 'card-lcd' }[arg] || 'card-tabs'); }
    else if (type === 'modal') { if (arg === 'history') handleOpenYearView(); else if (arg === 'calibrate') openCalibModal(); }
    else if (type === 'scroll') scrollAndHighlight(arg);
    else if (type === 'device') { setActiveTab('device'); scrollAndHighlight(arg); }
    else if (type === 'posture') { setActiveTab('statistics'); scrollAndHighlight(`stat-${arg}`); }
    else if (type === 'sensor') { setActiveTab('heatmap'); scrollAndHighlight(`sensor-node-${arg}`); }
    else if (type === 'auth') {
      if (arg === 'login') { if (isLoggedIn) alert(`이미 [${subdomain}] 계정으로 로그인되어 있어요.`); else openLoginModal(); }
      else if (arg === 'logout') { if (isLoggedIn) handleLogout(); else alert('로그인되어 있지 않아요.'); }
      else if (arg === 'delete') { if (isLoggedIn) { setDeleteError(''); setDeletePin(''); setIsDeleteModalOpen(true); } else openLoginModal(); }
    }
  };

  const selectResult = (item) => {
    addRecent(searchQuery || item.title);
    setIsSearchOpen(false);
    setSearchQuery('');
    runAction(item);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveResult((i) => Math.min(i + 1, Math.max(searchResults.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveResult((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults[activeResult]) selectResult(searchResults[activeResult]);
      else if (searchQuery.trim()) addRecent(searchQuery);
    } else if (e.key === 'Escape') { setIsSearchOpen(false); searchInputRef.current?.blur(); }
  };

  const hl = (id) => (highlightId === id ? ' flash-highlight' : '');

  // =============================================================
  return (
    <div className="app">
      {/* ===================== 상단: 학교 배너 (로고 · 검색 · 계정) ===================== */}
      <div className="hero">
      <header className="top-bar">
        <div className="brand">
          <span className="brand-logo">⚡</span>
          <span className="brand-text">
            <span className="brand-name">BARO Chair</span>
            <span className="brand-school">수도전기공업고등학교</span>
          </span>
        </div>

        <div className="search-box" ref={searchBoxRef}>
          <span className="search-icon" aria-hidden="true">🔍</span>
          <input
            ref={searchInputRef}
            className="search-input"
            type="search"
            enterKeyHint="search"
            placeholder="기능 검색 (예: 기울기, 점수, 센서)"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setActiveResult(0); setIsSearchOpen(true); }}
            onFocus={() => setIsSearchOpen(true)}
            onKeyDown={handleSearchKeyDown}
          />
          {searchQuery && <button className="search-clear" onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }} aria-label="검색어 지우기">✕</button>}

          {isSearchOpen && (
            <div className="search-dropdown">
              {!searchQuery.trim() ? (
                <>
                  <div className="dropdown-section-title">
                    <span>최근 검색</span>
                    {recentSearches.length > 0 && <button className="text-btn" onClick={clearRecent}>전체 삭제</button>}
                  </div>
                  {recentSearches.length === 0 ? (
                    <div className="dropdown-empty">최근 검색한 기록이 없어요.</div>
                  ) : (
                    <div className="recent-chips">
                      {recentSearches.map((r) => (
                        <span key={r} className="recent-chip">
                          <button onClick={() => { setSearchQuery(r); setActiveResult(0); searchInputRef.current?.focus(); }}>{r}</button>
                          <button className="chip-x" onClick={() => removeRecent(r)} aria-label={`${r} 삭제`}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="dropdown-section-title"><span>즐겨찾기</span></div>
                  {favoriteItems.length === 0 ? (
                    <div className="dropdown-empty">검색 결과의 ☆를 누르면 여기에 저장돼요.</div>
                  ) : (
                    favoriteItems.map((item) => (
                      <div key={item.id} className="result-row" onClick={() => selectResult(item)}>
                        <span className="result-icon">{item.icon}</span>
                        <div className="result-text"><div className="result-title">{item.title}</div><div className="result-desc">{item.desc}</div></div>
                        <button className="star-btn on" onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }} aria-label="즐겨찾기 해제">★</button>
                      </div>
                    ))
                  )}
                </>
              ) : searchResults.length === 0 ? (
                <div className="dropdown-empty">'{searchQuery}'와(과) 겹치는 기능이 없어요.</div>
              ) : (
                <>
                  <div className="dropdown-section-title"><span>검색 결과 {searchResults.length}개</span><span className="hint">↑↓ 이동 · Enter 선택</span></div>
                  {searchResults.map((item, idx) => {
                    const isFav = favorites.includes(item.id);
                    return (
                      <div key={item.id} className={`result-row${idx === activeResult ? ' active' : ''}`} onMouseEnter={() => setActiveResult(idx)} onClick={() => selectResult(item)}>
                        <span className="result-icon">{item.icon}</span>
                        <div className="result-text">
                          <div className="result-title"><HighlightText text={item.title} query={searchQuery} /></div>
                          <div className="result-desc">{item.desc}</div>
                        </div>
                        <button className={`star-btn${isFav ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }} aria-label={isFav ? '즐겨찾기 해제' : '즐겨찾기 추가'}>{isFav ? '★' : '☆'}</button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <div className="account-area" ref={accountRef}>
          {isLoggedIn ? (
            <>
              <button className={`account-btn ${isConnected ? 'online' : 'offline'}`} onClick={() => setAccountMenuOpen((v) => !v)}>
                <span className="dot">●</span><span className="account-name">{subdomain}</span><span className="caret">▾</span>
              </button>
              {accountMenuOpen && (
                <div className="account-menu">
                  <div className="account-menu-info">{isConnected ? `연결됨 · ${getDisplayUrl(serverUrl)}` : '연결 대기 중'}</div>
                  <button onClick={() => { setAccountMenuOpen(false); handleLogout(); }}>🔓 로그아웃</button>
                  <button className="danger" onClick={() => { setAccountMenuOpen(false); setDeleteError(''); setDeletePin(''); setIsDeleteModalOpen(true); }}>🗑️ 기기 등록 해제</button>
                </div>
              )}
            </>
          ) : (
            <button className="account-btn login" onClick={openLoginModal}>로그인</button>
          )}
        </div>
      </header>

        <div className="hero-copy">
          <span className="hero-eyebrow">⚡ SUDO ELECTRIC TECHNICAL HIGH SCHOOL · YOUNG MEISTER</span>
          <h1 className="hero-title">세상의 빛이 되자, <b>바른 자세</b>부터</h1>
          <div className="hero-tags">
            <span>전기</span><span>전자</span><span>기계</span><span>정보통신</span><span>IoT</span><span>AI</span><span>마이스터</span>
          </div>
        </div>
        <svg className="hero-wave" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,60 C360,0 900,70 1440,10 L1440,60 Z" />
        </svg>
      </div>

      {favoriteItems.length > 0 && (
        <div className="favorite-bar">
          {favoriteItems.map((item) => (
            <span key={item.id} className="favorite-chip">
              <button className="chip-main" onClick={() => runAction(item)}>{item.icon} {item.title}</button>
              <button className="chip-remove" onClick={() => toggleFavorite(item.id)} aria-label={`${item.title} 즐겨찾기 해제`}>✕</button>
            </span>
          ))}
        </div>
      )}

      <main className="bento">
        {/* ── 왼쪽: 핵심 숫자 + 알림 + 버튼 ── */}
        <section className="col-left">
          <div className="mini-grid">
        <div id="sum-score" className={`tile tile-score${alertType ? ' alerting' : ''}${hl('sum-score')}`}>
          <div className="tile-head">
            <span className={`live-dot ${isConnected ? 'active' : 'inactive'}`}>● {isConnected ? '실시간' : '연결 대기'}</span>
            <span className="date-small">{todayDate}</span>
          </div>
          <div className="score-number" style={{ color: healthScore >= 80 ? '#059669' : healthScore >= 60 ? '#d97706' : isConnected && totalSeconds > 0 ? '#dc2626' : '#94a3b8' }}>
            {isConnected && totalSeconds > 0 ? healthScore : '-'}<span className="score-unit">점</span>
          </div>
          <div className="tile-label">오늘 자세 점수</div>
        </div>

        <div id="sum-posture" className={`tile tile-mini${hl('sum-posture')}`}>
          <span className="tile-label">현재 자세</span>
          <strong className="mini-value" style={{ color: !isConnected ? '#94a3b8' : isSitting ? POSTURE_TYPES[currentPosture]?.color : '#64748b' }}>
            {!isConnected ? '-' : isSitting ? (POSTURE_TYPES[currentPosture]?.name || '').split(' (')[0].split(' / ')[0] : '빈 의자'}
          </strong>
          {isConnected && aiModel && <span className="mini-sub">🤖 AI 판단</span>}
        </div>

        <div className={`tile tile-mini${isTiltOver ? ' warn' : ''}`}>
          <span className="tile-label">기울기</span>
          <strong className="mini-value" style={{ color: isTiltOver ? '#dc2626' : undefined }}>{isConnected ? `${angle.toFixed(1)}°` : '-'}</strong>
          <span className="mini-sub">경고 {tiltAlarmAngle}° 이상</span>
        </div>

        <div id="sum-sit" className={`tile tile-mini${hl('sum-sit')}`}>
          <span className="tile-label">오늘 착석</span>
          <strong className="mini-value">{formatTime(sitSeconds)}</strong>
          <span className="mini-sub">자정에 초기화</span>
        </div>

          </div>
        <div id="sum-alerts" className={`tile tile-alert${alertType ? ' alerting' : ''}${hl('sum-alerts')}`}>
          <div className="alert-chips">
            <span className={`alert-chip${isBuzzerOn ? ' on buzzer' : ''}`}>🔊<em>부저</em></span>
            <span className={`alert-chip${isMotorOn ? ' on motor' : ''}`}>📳<em>진동</em></span>
            <span className={`alert-chip${isLedOn ? ' on led' : ''}`}>💡<em>LED</em></span>
          </div>
          <span className="alert-message">{alertMessage}</span>
        </div>

        <div className="tile tile-actions">
          <button className="action-btn" onClick={handleOpenYearView}>📊 지난 기록</button>
          <button className="action-btn primary" onClick={openCalibModal}>🎯 바른 자세 설정</button>
        </div>

        </section>

        {/* ── 오른쪽: 탭으로 나눈 상세 화면 ── */}
        <section className="col-right">
          <div id="card-tabs" className={`tab-navigation${hl('card-tabs')}`}>
            <button className={`tab-btn ${activeTab === 'statistics' ? 'active' : ''}`} onClick={() => setActiveTab('statistics')}>📊 통계</button>
            <button className={`tab-btn ${activeTab === 'heatmap' ? 'active' : ''}`} onClick={() => setActiveTab('heatmap')}>💺 센서</button>
            <button className={`tab-btn ${activeTab === 'device' ? 'active' : ''}`} onClick={() => setActiveTab('device')}>📺 기기 화면</button>
          </div>

          {activeTab === 'statistics' && (
        <div id="tile-stats" className={`tile tile-panel tile-stats${hl('tile-stats')}`}>
          <div className="card-title-bar"><h3>오늘의 자세 비율</h3><span className="card-tag">자정 초기화</span></div>
          <div className="stats-layout">
            <div className="donut-chart" style={donutChartStyle}>
              <div className="donut-hole">
                <span className="donut-center-label">바른 자세</span>
                <span className="donut-center-value">{totalSeconds > 0 ? `${postureStats.find((p) => p.key === 'good')?.percentage.toFixed(0)}%` : '-'}</span>
              </div>
            </div>
            <div className="compact-list">
              {postureStats.map((item) => (
                <div key={item.key} id={`stat-${item.key}`} className={`stat-item${hl(`stat-${item.key}`)}`}>
                  <div className="stat-header">
                    <div className="stat-name-wrap"><span className="color-dot" style={{ backgroundColor: item.color }}></span><span className="stat-name">{item.name}</span></div>
                    <div className="stat-values"><span className="stat-ratio">{totalSeconds > 0 ? `${item.percentage.toFixed(0)}%` : '0%'}</span><span className="stat-time-tag">{formatTime(item.seconds)}</span></div>
                  </div>
                  <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${item.percentage}%`, backgroundColor: item.color }}></div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
          )}

          {activeTab === 'heatmap' && (
        <div id="tile-heatmap" className={`tile tile-panel tile-heatmap${hl('tile-heatmap')}`}>
          <div className="card-title-bar">
            <h3>압력 분포</h3>
            <span className={`status-pill ${isConnected && isSitting ? 'sitting' : 'empty'}`}>{isConnected && isSitting ? '착석 중' : isConnected ? '빈 의자' : '연결 안 됨'}</span>
          </div>
          <div className="seat-grid">
            <span className="seat-edge">▲ 앞</span>
            {[[6, 7], [3, 4, 5], [0, 1, 2]].map((chs, r) => (
              <div key={r} className={`seat-row cols-${chs.length}`}>
                {chs.map((ch) => (
                  <div key={ch} id={`sensor-node-${ch}`} className={`seat-cell${hl(`sensor-node-${ch}`)}`} title={`${ch + 1}번 ${SENSORS[ch].pos}`}>
                    <div className="circle-socket"><div className="pressure-circle" style={getCircleStyle(pressures[ch])}></div></div>
                    <span className="cell-text"><b>{ch + 1}</b> {pressures[ch]}</span>
                  </div>
                ))}
              </div>
            ))}
            <span className="seat-edge">▼ 등받이</span>
          </div>
          <div className="heat-footer">
            <span className="total-title">합계 <strong>{pressureSum}</strong> / 착석 기준 {sitThreshold}</span>
            <div className="threshold-bar-bg">
              <div className="threshold-bar-fill" style={{ width: `${Math.min(pressureSum / PRESSURE_MAX_SUM, 1) * 100}%`, backgroundColor: isConnected && isSitting ? '#ef4444' : '#94a3b8' }}></div>
              <div className="threshold-marker" style={{ left: `${Math.min(sitThreshold / PRESSURE_MAX_SUM, 1) * 100}%` }}></div>
            </div>
          </div>
        </div>
          )}

          {activeTab === 'device' && (
            <div className="tile-panel device-grid">
        <div id="card-lcd" className={`tile tile-lcd${hl('card-lcd')}`}>
          <div className="card-title-bar"><h3>LCD 미리보기</h3><span className="card-tag">1602 LCD</span></div>
          <div className="lcd-screen-frame">
            <div className="lcd-bezel-1602">
              <div className="lcd-text-1602">{lcdText.line1}</div>
              <div className="lcd-text-1602">{lcdText.line2}</div>
            </div>
          </div>
        </div>
        <div id="card-tilt" className={`tile tile-tilt${hl('card-tilt')}`}>
          <div className="card-title-bar"><h3>의자 기울기</h3><span className={`card-tag${isTiltOver ? ' danger' : ''}`}>경고 {tiltAlarmAngle}° 이상</span></div>
          <div className="tilt-value" style={{ color: isTiltOver ? '#dc2626' : '#0f172a' }}>{isConnected ? angle.toFixed(1) : '-'}<span>°</span></div>
          <div className="tilt-bar-bg">
            <div className="tilt-bar-fill" style={{ width: `${Math.min(angle / TILT_GAUGE_MAX, 1) * 100}%`, backgroundColor: isTiltOver ? '#ef4444' : '#3b82f6' }}></div>
            <div className="threshold-marker" style={{ left: `${Math.min(tiltAlarmAngle / TILT_GAUGE_MAX, 1) * 100}%` }}></div>
          </div>
          <div className="tilt-scale"><span>0°</span><span>{TILT_GAUGE_MAX}°</span></div>
        </div>
            </div>
          )}
        </section>
      </main>

      {/* ===================== 하단: 학교 정보 ===================== */}
      <footer className="school-footer">
        <span className="footer-emblem">⚡</span>
        <div className="footer-text">
          <strong>Sudo Electric Technical High School</strong>
          <span>창의 · 열정 · 도전 — 미래 에너지 산업을 이끌어 갈 영 마이스터</span>
        </div>
        <span className="footer-project">BARO Chair · Smart Posture IoT Project</span>
      </footer>

      {/* ===================== 모달 ===================== */}
      {authModal && (
        <div className="modal-overlay" onClick={() => setAuthModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title-with-logo">{authModal === 'login' ? '스마트 의자 로그인' : '새 기기 서브도메인 등록'}</h3>
              <button className="close-btn" onClick={() => setAuthModal(null)}>✕</button>
            </div>
            <p className="modal-subtext">{authModal === 'login' ? '등록된 서브도메인과 4자리 PIN을 입력하세요.' : '연결할 서브도메인과 4자리 PIN을 새로 등록합니다.'}</p>
            {isDeviceLocked && (
              <div className="lockout-alert-banner">
                <strong>🔒 기기 접근이 영구 차단되었습니다</strong>
                라즈베리파이 터미널에서 <code>python3 reset_pin.py unlock</code> 으로 잠금을 해제할 수 있어요.
              </div>
            )}
            {authError && !isDeviceLocked && <div className="auth-alert-box error"><div>{authError}</div></div>}
            <form onSubmit={authModal === 'login' ? handleLogin : handleRegister} className={isDeviceLocked ? 'form-disabled' : ''}>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">서브도메인 주소</label>
                <div className="subdomain-input-group">
                  <input type="text" placeholder="예: chair01" value={authSubdomain} onChange={(e) => setAuthSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} disabled={isDeviceLocked} autoFocus required />
                  <span className="subdomain-suffix-badge">.{BASE_DOMAIN}</span>
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label className="form-label">4자리 숫자 PIN 번호</label>
                <input type="password" maxLength={4} className="ip-input pin-input" placeholder="••••" value={authPin} onChange={(e) => setAuthPin(e.target.value.replace(/[^0-9]/g, ''))} disabled={isDeviceLocked} required />
              </div>
              <button type="submit" className="modal-confirm-btn" disabled={isDeviceLocked} style={{ background: authModal === 'login' ? '#2563eb' : '#10b981', color: '#fff' }}>
                {authModal === 'login' ? '스마트 의자 연결하기' : '서브도메인 계정 등록하기'}
              </button>
              <div className="auth-switch-row" style={{ marginTop: '14px', justifyContent: 'center' }}>
                {authModal === 'login'
                  ? <button type="button" className="auth-text-btn" onClick={() => { setAuthModal('register'); setAuthError(''); }}>새로운 기기인가요? 서브도메인 등록 ➔</button>
                  : <button type="button" className="auth-text-btn" onClick={() => { setAuthModal('login'); setAuthError(''); }}>이미 계정이 있으신가요? 로그인으로 돌아가기 ➔</button>}
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="modal-overlay" onClick={() => setIsDeleteModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3 style={{ margin: 0, color: '#dc2626' }}>기기 계정 등록 해제</h3><button className="close-btn" onClick={() => setIsDeleteModalOpen(false)}>✕</button></div>
            <p className="modal-subtext">본인 확인을 위해 <strong>현재 4자리 PIN 번호</strong>를 입력해주세요.</p>
            {deleteError && <div className="auth-alert-box error" style={{ fontWeight: 'bold' }}>⚠️ {deleteError}</div>}
            <form onSubmit={handleDeleteAccount}>
              <div style={{ marginBottom: '14px' }}>
                <input type="password" maxLength={4} className="ip-input pin-input" placeholder="••••" value={deletePin} onChange={(e) => setDeletePin(e.target.value.replace(/[^0-9]/g, ''))} autoFocus required />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" className="danger-btn">계정 삭제 확인</button>
                <button type="button" className="secondary-btn" onClick={() => setIsDeleteModalOpen(false)}>취소</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeModal === 'history' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>
                {drillLevel === 'year' && '연도별 평균 점수'}
                {drillLevel === 'month' && `${selectedYear}년 월별 평균 점수`}
                {drillLevel === 'day' && `${selectedYear}년 ${selectedMonth}월 일별 점수`}
              </h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <p className="modal-subtext">{isLoggedIn ? '해당 기간의 종합 점수 변화 추이와 세부 기록입니다.' : '로그인하면 의자에 저장된 실제 기록을 볼 수 있어요.'}</p>

            {drillLevel === 'year' && (
              <>
                <TrendChart data={yearlyData} xKey="year" yKey="score" />
                <div className="history-list">
                  {yearlyData.map((item, index) => {
                    const risk = getRiskInfo(item.score);
                    return (
                      <div key={index} className="history-item">
                        <div className="history-info">
                          <span className="history-text"><strong>{item.year}</strong> 평균 <span className="highlight-score">{item.score}점</span></span>
                          <span className="history-sit-time">(일평균 착석: {item.avgSitTime})</span>
                        </div>
                        <div className="history-actions">
                          <span className={`risk-tag ${risk.class}`}>{risk.label}</span>
                          <button className="mini-btn blue" onClick={() => handleSelectYear(item.year)}>월별 보기</button>
                          <button className="mini-btn" onClick={() => { setSelectedDetail({ title: `${item.year} 세부 리포트`, ...item }); setActiveModal('historyDetail'); }}>세부</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {drillLevel === 'month' && (
              <>
                <TrendChart data={monthlyData} xKey="month" yKey="score" />
                <div className="history-list">
                  {monthlyData.map((item, index) => {
                    const risk = getRiskInfo(item.score);
                    return (
                      <div key={index} className="history-item">
                        <div className="history-info">
                          <span className="history-text"><strong>{item.month}</strong> 평균 <span className="highlight-score">{item.score}점</span></span>
                          <span className="history-sit-time">(일평균 착석: {item.avgSitTime})</span>
                        </div>
                        <div className="history-actions">
                          <span className={`risk-tag ${risk.class}`}>{risk.label}</span>
                          <button className="mini-btn green" onClick={() => handleSelectMonth(item.month)}>일별 보기</button>
                          <button className="mini-btn" onClick={() => { setSelectedDetail({ title: `${selectedYear}년 ${item.month} 세부 리포트`, ...item }); setActiveModal('historyDetail'); }}>세부</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {drillLevel === 'day' && (
              <>
                <TrendChart data={dailyData} xKey="day" yKey="score" />
                <div className="history-list">
                  {dailyData.map((item, index) => {
                    const risk = getRiskInfo(item.score);
                    return (
                      <div key={index} className="history-item">
                        <div className="history-info">
                          <span className="history-text"><strong>{item.fullDate || item.day}</strong> <span className="highlight-score">{item.score}점</span></span>
                          <span className="history-sit-time">(총 착석: {item.sitTime})</span>
                        </div>
                        <div className="history-actions">
                          <span className={`risk-tag ${risk.class}`}>{risk.label}</span>
                          <button className="mini-btn" onClick={() => { setSelectedDetail({ title: `${item.fullDate || item.day} 세부 리포트`, ...item }); setActiveModal('historyDetail'); }}>세부 데이터</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              {drillLevel === 'month' && <button type="button" className="back-btn" onClick={() => setDrillLevel('year')}>◀ 연별로</button>}
              {drillLevel === 'day' && <button type="button" className="back-btn" onClick={() => setDrillLevel('month')}>◀ 월별로</button>}
              <button className="modal-confirm-btn" style={{ flex: 1, width: 'auto' }} onClick={() => setActiveModal(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'historyDetail' && selectedDetail && (
        <div className="modal-overlay" onClick={() => setActiveModal('history')}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>{selectedDetail.title || '세부 리포트'}</h3><button className="close-btn" onClick={() => setActiveModal('history')}>✕</button></div>
            <div className="detail-box">
              <p><strong>가장 빈번했던 자세:</strong> <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{selectedDetail.topPosture || '데이터 없음'}</span></p>
              <p><strong>착석 시간:</strong> {selectedDetail.avgSitTime || selectedDetail.sitTime || '기록 없음'}</p>
            </div>
            <div className="ai-feedback-box">
              <strong>🤖 랜덤 포레스트 AI 피드백</strong>
              {selectedDetail.feedback || 'AI 피드백 데이터가 충분하지 않습니다.'}
            </div>
            <button className="modal-confirm-btn" style={{ marginTop: '16px' }} onClick={() => setActiveModal('history')}>목록으로 돌아가기</button>
          </div>
        </div>
      )}

      {activeModal === 'calibrate' && (
        <div className="modal-overlay" onClick={() => { if (!isCalibrating) closeCalibModal(); }}>
          <div className="modal-content" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3 style={{ margin: '0 auto' }}>AI 체형 기준점 측정 ({calibStep + 1}/3)</h3>{!isCalibrating && <button className="close-btn" onClick={closeCalibModal}>✕</button>}</div>
            <p className="calib-guide">
              {isCalibrating ? '움직이지 마세요!\n센서 값을 0.5초마다 측정하고 있어요...'
                : calibStep === 0 ? '의자를 바로 세우고, 바르게 앉은 뒤 시작 버튼을 누르세요.\n(바른 자세 기준과 기울기 0° 기준이 함께 저장돼요)'
                  : calibStep === 1 ? '✅ 1차 완료!\n자세를 유지한 채 2차를 시작하세요.' : '✅ 2차 완료!\n마지막 3차 측정을 진행합니다.'}
            </p>
            {calibMessage && <div className="auth-alert-box error" style={{ textAlign: 'left' }}>{calibMessage}</div>}
            <div className="calib-progress-container"><div className="calib-progress-fill" style={{ width: `${calibProgress}%` }}></div></div>
            <button className="modal-confirm-btn" onClick={handleStartCalibration} disabled={isCalibrating} style={{ background: isCalibrating ? '#94a3b8' : '#4263eb', color: 'white', padding: '14px' }}>
              {isCalibrating ? '측정 진행 중...' : `▶️ ${calibStep + 1}차 측정 시작 (3초)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
