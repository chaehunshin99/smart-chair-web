import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const POSTURE_TYPES = {
  good: { name: '바른 자세', color: '#10b981' },
  left: { name: '좌측 쏠림 (다리 꼬기)', color: '#f59e0b' },
  right: { name: '우측 쏠림 (다리 꼬기)', color: '#6366f1' },
  forward: { name: '거북목 / 상체 숙임', color: '#ef4444' },
  slouch: { name: '뒤로 눕기 (슬라우칭)', color: '#8b5cf6' },
};

const BASE_DOMAIN = 'smart-chair-web.site';

// -------------------------------------------------------------
// 📈 연/월/일별 점수 추이를 즉시 렌더링하는 인라인 SVG 차트 컴포넌트
// -------------------------------------------------------------
function TrendChart({ data, xKey, yKey, unit = '점' }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '12px' }}>
        표시할 그래프 데이터가 없습니다.
      </div>
    );
  }

  const width = 380;
  const height = 130;
  const padding = { top: 20, right: 20, bottom: 25, left: 30 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (chartW / Math.max(data.length - 1, 1)) * i;
    const yVal = Math.max(0, Math.min(100, d[yKey]));
    const y = padding.top + chartH - (yVal / 100) * chartH;
    return { x, y, label: d[xKey], val: d[yKey] };
  });

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div style={{ background: '#f8fafc', padding: '10px 8px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
      <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '4px', textAlign: 'right' }}>
        단위: {unit} (기준: 0~100)
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* 기준 가이드라인 */}
        <line x1={padding.left} y1={padding.top} x2={width - padding.right} y2={padding.top} stroke="#e2e8f0" strokeDasharray="3 3" />
        <line x1={padding.left} y1={padding.top + chartH / 2} x2={width - padding.right} y2={padding.top + chartH / 2} stroke="#e2e8f0" strokeDasharray="3 3" />
        <line x1={padding.left} y1={padding.top + chartH} x2={width - padding.right} y2={padding.top + chartH} stroke="#cbd5e1" />

        {/* 꺾은선 트렌드 그래프 */}
        {points.length > 1 && (
          <polyline fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={polylinePoints} />
        )}

        {/* 데이터 포인트 원 및 수치 라벨 */}
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

  // 모달 및 캘리브레이션 상태
  const [activeModal, setActiveModal] = useState(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibProgress, setCalibProgress] = useState(0);
  const [calibStep, setCalibStep] = useState(0);
  const [calibSnapshots, setCalibSnapshots] = useState([]);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const calibTimerRef = useRef(null);

  // -------------------------------------------------------------
  // 🔐 서브도메인 인증 & 보안 잠금 상태 관리
  // -------------------------------------------------------------
  const [serverUrl, setServerUrl] = useState(() =>
    localStorage.getItem('chair_server_url') || ''
  );
  const [subdomain, setSubdomain] = useState(() => {
    const saved = localStorage.getItem('chair_server_url') || '';
    const match = saved.match(/https?:\/\/([^.]+)\./);
    return match ? match[1] : '';
  });
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('chair_server_url'));
  const [isConnected, setIsConnected] = useState(false);

  // 인증 모달 상태: null | 'login' | 'register'
  const [authModal, setAuthModal] = useState(null);
  const [authSubdomain, setAuthSubdomain] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [isDeviceLocked, setIsDeviceLocked] = useState(false);

  // 계정 삭제(초기화) 모달 상태
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePin, setDeletePin] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const [pressures, setPressures] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const [isSitting, setIsSitting] = useState(false);
  const pressuresRef = useRef([0, 0, 0, 0, 0, 0, 0, 0]);

  // -------------------------------------------------------------
  // 🗂️ 계층형 드릴다운 (연도 ➔ 월 ➔ 일) 상태 관리
  // -------------------------------------------------------------
  const [drillLevel, setDrillLevel] = useState('year'); // 'year' | 'month' | 'day'
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMonth, setSelectedMonth] = useState('9');

  // 1. 연도별 기본 통계 데이터
  const [yearlyData, setYearlyData] = useState([
    { year: '2025년', score: 81, avgSitTime: '5시간 10분', topPosture: '바른 자세', feedback: '시스템 도입 초기 양호한 평균 점수를 기록했습니다.' },
    { year: '2026년', score: 86, avgSitTime: '5시간 45분', topPosture: '바른 자세', feedback: '전년 대비 바른 자세 유지율이 5% 향상되었습니다.' },
  ]);

  // 2. 월별 기본 통계 데이터
  const [monthlyData, setMonthlyData] = useState([
    { month: '7월', score: 78, avgSitTime: '6시간 15분', topPosture: '우측 쏠림 (다리 꼬기)', feedback: '우측 골반 하중이 평균 40% 이상 높게 측정되었습니다.' },
    { month: '8월', score: 86, avgSitTime: '5시간 30분', topPosture: '바른 자세', feedback: '골반 불균형 수치가 전월 대비 15% 개선되었습니다.' },
    { month: '9월', score: 88, avgSitTime: '5시간 40분', topPosture: '바른 자세', feedback: '의사결정나무 AI 분석 결과, 최적의 밸런스를 유지하고 있습니다.' },
  ]);

  // 3. 일별 기본 통계 데이터
  const [dailyData, setDailyData] = useState([
    { day: '3일', fullDate: '2026년 9월 3일', score: 85, sitTime: '5시간 15분', topPosture: '바른 자세', feedback: '양호한 자세입니다. 1시간마다 가벼운 스트레칭을 권장합니다.' },
    { day: '4일', fullDate: '2026년 9월 4일', score: 68, sitTime: '7시간 05분', topPosture: '거북목 / 상체 숙임', feedback: '전방 센서 압력이 과도합니다. 모니터 높이를 조정해 보세요.' },
    { day: '5일', fullDate: '2026년 9월 5일', score: 92, sitTime: '4시간 50분', topPosture: '바른 자세', feedback: '매우 훌륭합니다! 불량 자세 비율이 10% 미만입니다.' },
    { day: '6일', fullDate: '2026년 9월 6일', score: 74, sitTime: '6시간 10분', topPosture: '우측 쏠림 (다리 꼬기)', feedback: '오른쪽 다리를 꼬는 자세가 자주 감지되었습니다.' },
    { day: '7일', fullDate: '2026년 9월 7일', score: 88, sitTime: '5시간 40분', topPosture: '바른 자세', feedback: '전체적으로 고른 압력 분포를 유지했습니다.' },
  ]);

  const [postureSeconds, setPostureSeconds] = useState({
    good: 0, left: 0, right: 0, forward: 0, slouch: 0,
  });

  const getCircleStyle = (val) => {
    const rawVal = val || 0;
    const ratio = Math.min(Math.max(rawVal / 1023, 0), 1);
    const size = 18 + ratio * 36;
    const opacity = 0.15 + ratio * 0.85;

    return {
      width: `${size}px`,
      height: `${size}px`,
      backgroundColor: `rgba(239, 68, 68, ${opacity.toFixed(2)})`,
      boxShadow: ratio > 0.5 ? `0 0 ${Math.round(ratio * 10)}px rgba(239, 68, 68, 0.5)` : 'none',
    };
  };

  useEffect(() => {
    const updateDate = () => {
      const now = new Date();
      setTodayDate(now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }));
    };
    updateDate();
    const dateTimer = setInterval(updateDate, 60000);
    return () => clearInterval(dateTimer);
  }, []);

  // -------------------------------------------------------------
  // 🔄 안정화된 실시간 데이터 폴링 (2초 간격 + 타임아웃 방어)
  // -------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    const fetchLiveStatus = async () => {
      if (!serverUrl || !isLoggedIn) {
        if (isMounted) {
          setIsConnected(false);
          setIsSitting(false);
        }
        return;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5초 초과 시 중단

        const response = await fetch(`${serverUrl}/api/live-status`, { 
          signal: controller.signal 
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          if (isMounted) {
            if (data.currentPosture) setCurrentPosture(data.currentPosture);
            if (data.postureSeconds) setPostureSeconds(data.postureSeconds);
            if (data.pressures) {
              setPressures(data.pressures);
              pressuresRef.current = data.pressures;
            }
            if (data.is_sitting !== undefined) setIsSitting(data.is_sitting);
            setIsConnected(true);
          }
        } else {
          if (isMounted) setIsConnected(false);
        }
      } catch {
        if (isMounted) {
          setIsConnected(false);
          setIsSitting(false);
        }
      }
    };

    // 최초 즉시 실행 후 2초 간격 폴링으로 라즈베리파이 부하 최소화
    fetchLiveStatus();
    const dataTimer = setInterval(fetchLiveStatus, 2000);

    return () => {
      isMounted = false;
      clearInterval(dataTimer);
    };
  }, [serverUrl, isLoggedIn]);

  useEffect(() => {
    if (!serverUrl || !isLoggedIn) return;
    fetch(`${serverUrl}/api/history/years`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setYearlyData(d); })
      .catch(() => {});
  }, [serverUrl, isLoggedIn, activeModal]);

  const totalSeconds = Object.values(postureSeconds).reduce((a, b) => a + b, 0);
  const postureStats = Object.keys(POSTURE_TYPES).map((key) => {
    const sec = postureSeconds[key];
    const percentage = totalSeconds > 0 ? (sec / totalSeconds) * 100 : 0;
    return { key, ...POSTURE_TYPES[key], seconds: sec, percentage };
  });

  const healthScore = isConnected && totalSeconds > 0 ? Math.round((postureSeconds.good / totalSeconds) * 100) : 0;

  let cumulativePercent = 0;
  const gradientParts = postureStats.map((stat) => {
    const start = cumulativePercent;
    cumulativePercent += stat.percentage;
    return `${stat.color} ${start}% ${cumulativePercent}%`;
  });
  const donutChartStyle = totalSeconds > 0 ? { background: `conic-gradient(${gradientParts.join(', ')})` } : { background: '#e2e8f0' };

  const formatTime = (totalSec) => {
    if (totalSec === 0) return '0초';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}시간 ${m}분`;
    if (m > 0) return `${m}분 ${s}초`;
    return `${s}초`;
  };

  const getLcdScreenText = () => {
    if (!isConnected) return { line1: 'Smart Chair', line2: 'Starting AI...' };
    if (!isSitting) return { line1: 'Chair Empty', line2: 'Ready...' };

    let enPosture = 'Good';
    if (currentPosture === 'left') enPosture = 'Left Tilt';
    else if (currentPosture === 'right') enPosture = 'Right Tilt';
    else if (currentPosture === 'forward') enPosture = 'Forward';
    else if (currentPosture === 'slouch') enPosture = 'Slouch';

    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return { line1: `Pos: ${enPosture}`, line2: `Time: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` };
  };

  const lcdText = getLcdScreenText();

  // -------------------------------------------------------------
  // 🔐 로그인 & 회원가입 & 계정 삭제 핸들러
  // -------------------------------------------------------------
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    const cleanSub = authSubdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

    if (!cleanSub || authPin.length !== 4) {
      setAuthError('서브도메인과 4자리 숫자 PIN을 모두 올바르게 입력해주세요.');
      return;
    }

    const targetUrl = `https://${cleanSub}.${BASE_DOMAIN}`;

    try {
      const res = await fetch(`${targetUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: cleanSub, pin: authPin }),
      });
      const result = await res.json();

      if (res.status === 403 && result.is_locked) {
        setIsDeviceLocked(true);
        setAuthError(result.message || '🚨 비밀번호 5회 연속 오류로 기기가 영구 잠금되었습니다.');
        return;
      }

      if (!res.ok || !result.success) {
        setAuthError(result.message || '로그인에 실패했습니다.');
        return;
      }

      // 로그인 성공
      localStorage.setItem('chair_server_url', targetUrl);
      setServerUrl(targetUrl);
      setSubdomain(cleanSub);
      setIsLoggedIn(true);
      setAuthModal(null);
      setAuthPin('');
      setIsDeviceLocked(false);
    } catch {
      setAuthError(`[${cleanSub}.${BASE_DOMAIN}] 서버에 연결할 수 없습니다. Cloudflare 터널 및 라즈베리파이 상태를 확인해주세요.`);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    const cleanSub = authSubdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

    if (!cleanSub || authPin.length !== 4) {
      setAuthError('서브도메인과 4자리 숫자 PIN을 모두 올바르게 입력해주세요.');
      return;
    }

    const targetUrl = `https://${cleanSub}.${BASE_DOMAIN}`;

    try {
      const res = await fetch(`${targetUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: cleanSub, pin: authPin }),
      });
      const result = await res.json();

      if (res.status === 403 && result.already_registered) {
        setAuthError(`⚠️ 이 기기에는 이미 [${result.registered_subdomain}] 계정이 등록되어 있습니다. 중복 가입은 불가합니다.`);
        return;
      }

      if (!res.ok || !result.success) {
        setAuthError(result.message || '회원가입에 실패했습니다.');
        return;
      }

      alert(`🎉 [${cleanSub}] 서브도메인이 정상 등록되었습니다! 바로 로그인해주세요.`);
      setAuthModal('login');
      setAuthPin('');
    } catch {
      setAuthError(`[${cleanSub}.${BASE_DOMAIN}] 서버에 연결할 수 없습니다. Cloudflare 터널 상태를 확인해주세요.`);
    }
  };

  const handleLogout = () => {
    if (window.confirm('현재 연결된 스마트 의자 계정에서 로그아웃하시겠습니까?')) {
      localStorage.removeItem('chair_server_url');
      setServerUrl('');
      setSubdomain('');
      setIsLoggedIn(false);
      setIsConnected(false);
      setIsSitting(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDeleteError('');

    if (deletePin.length !== 4) {
      setDeleteError('현재 설정된 4자리 PIN 번호를 입력해주세요.');
      return;
    }

    if (!window.confirm('정말로 이 기기의 등록 계정을 삭제하시겠습니까?\n삭제 후에도 과거 누적된 자세 측정 데이터는 유지되며 새 서브도메인으로 가입할 수 있습니다.')) {
      return;
    }

    const targetUrl = serverUrl || `https://${authSubdomain || subdomain}.${BASE_DOMAIN}`;

    try {
      const res = await fetch(`${targetUrl}/api/auth/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: deletePin }),
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        setDeleteError(result.message || '계정 삭제에 실패했습니다.');
        return;
      }

      alert('🗑️ 기기 계정이 초기화되었습니다. 새로운 서브도메인으로 회원가입할 수 있습니다.');
      localStorage.removeItem('chair_server_url');
      setServerUrl('');
      setSubdomain('');
      setIsLoggedIn(false);
      setIsConnected(false);
      setIsSitting(false);
      setIsDeleteModalOpen(false);
      setDeletePin('');
      setAuthModal('register');
    } catch {
      setDeleteError('서버와 통신할 수 없습니다. 연결 상태를 확인해주세요.');
    }
  };

  // 3회 분할 정밀 캘리브레이션 제어 로직
  const handleStartCalibration = () => {
    if (isCalibrating) return;
    setIsCalibrating(true);
    setCalibProgress(0);

    const stepSnapshots = [];
    let count = 0;
    const totalCount = 30;

    calibTimerRef.current = setInterval(() => {
      stepSnapshots.push([...pressuresRef.current]);
      count++;
      setCalibProgress(Math.round((count / totalCount) * 100));

      if (count >= totalCount) {
        clearInterval(calibTimerRef.current);
        const updatedSnapshots = [...calibSnapshots, ...stepSnapshots];
        setCalibSnapshots(updatedSnapshots);
        setIsCalibrating(false);

        if (calibStep === 0) setCalibStep(1);
        else if (calibStep === 1) setCalibStep(2);
        else if (calibStep === 2) finishCalibration(updatedSnapshots);
      }
    }, 100);
  };

  const finishCalibration = async (finalSnapshots) => {
    const avgSnapshot = finalSnapshots[0].map((_, colIndex) =>
      Math.round(finalSnapshots.reduce((acc, row) => acc + row[colIndex], 0) / finalSnapshots.length)
    );

    try {
      await fetch(`${serverUrl}/api/calibrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ good_baseline: avgSnapshot })
      });
      alert('✅ [3/3] 모든 정밀 측정이 완료되었습니다!\n(최종 평균 데이터가 AI 모델에 성공적으로 적용되었습니다)');
    } catch {
      alert('⚠️ 측정은 끝났으나 서버로 전송하지 못했습니다.\n네트워크 상태를 확인해주세요.');
    }
    closeCalibModal();
  };

  const closeCalibModal = () => {
    if (calibTimerRef.current) clearInterval(calibTimerRef.current);
    setIsCalibrating(false);
    setCalibProgress(0);
    setCalibStep(0);
    setCalibSnapshots([]);
    setActiveModal(null);
  };

  const getRiskInfo = (score) => {
    if (score >= 80) return { label: '안전', class: 'risk-safe' };
    if (score >= 70) return { label: '주의', class: 'risk-warning' };
    return { label: '위험', class: 'risk-danger' };
  };

  const getDisplayUrl = (url) => url ? url.replace(/^https?:\/\//, '') : '';

  // 드릴다운 단계 전환 핸들러
  const handleOpenYearView = () => {
    setDrillLevel('year');
    setActiveModal('history');
  };

  const handleSelectYear = (yearStr) => {
    const rawYear = yearStr.replace(/[^0-9]/g, '');
    setSelectedYear(rawYear);
    setDrillLevel('month');
    if (serverUrl) {
      fetch(`${serverUrl}/api/history/months?year=${rawYear}`)
        .then(r => r.json())
        .then(d => { if (Array.isArray(d)) setMonthlyData(d); })
        .catch(() => {});
    }
  };

  const handleSelectMonth = (monthStr) => {
    const rawMonth = monthStr.replace(/[^0-9]/g, '');
    setSelectedMonth(rawMonth);
    setDrillLevel('day');
    if (serverUrl) {
      fetch(`${serverUrl}/api/history/days?year=${selectedYear}&month=${rawMonth}`)
        .then(r => r.json())
        .then(d => { if (Array.isArray(d)) setDailyData(d); })
        .catch(() => {});
    }
  };

  return (
    <div className="dashboard">
      {/* ==========================================
          1열: 제어 패널, 점수 및 LCD 미니 뷰
          ========================================== */}
      <div className="dashboard-col col-left">
        <header className="header-card">
          <div className="status-indicators">
            <span className={`live-dot ${isConnected ? 'active' : 'inactive'}`}>
              ● {isConnected ? '모니터링 활성' : '연결 대기 중'}
            </span>
            <span className={`connection-badge ${isConnected ? 'online' : 'offline'}`}>
              {isConnected ? `연결됨 (${getDisplayUrl(serverUrl)})` : `연결 대기중 (${getDisplayUrl(serverUrl) || '기기 미연결'})`}
            </span>
          </div>

          <h2 className="date-title">{todayDate}</h2>
          <p className="sub-info">오늘 총 착석 시간: <strong>{formatTime(totalSeconds)}</strong></p>

          <div className="score-badge">
            <div className="score-label">실시간 자세 점수</div>
            <div className="score-number">{healthScore}<span className="score-unit">점</span></div>
          </div>

          <div className="button-group auth-status-bar">
            {isLoggedIn ? (
              <>
                <button className="ip-btn logged-in" onClick={handleLogout}>
                  🔓 [{subdomain}] 로그아웃
                </button>
                <button
                  type="button"
                  className="account-reset-link"
                  onClick={() => {
                    setDeleteError('');
                    setDeletePin('');
                    setIsDeleteModalOpen(true);
                  }}
                >
                  기기 등록 해제 (계정 삭제)
                </button>
              </>
            ) : (
              <button
                className="ip-btn"
                onClick={() => {
                  setAuthSubdomain(subdomain || '');
                  setAuthPin('');
                  setAuthError('');
                  setIsDeviceLocked(false);
                  setAuthModal('login');
                }}
              >
                🔒 로그인 / 회원가입
              </button>
            )}

            {/* 단일 통합 버튼: 지난 자세점수 보기 */}
            <button className="history-btn" onClick={handleOpenYearView}>
              📊 지난 자세점수 보기
            </button>
            <button className="calib-btn" onClick={() => { setCalibStep(0); setCalibSnapshots([]); setActiveModal('calibrate'); }}>
              🎯 바른 자세 0점 설정 (AI)
            </button>
          </div>
        </header>

        <div className="current-status-banner">
          <span>현재 감지 상태: </span>
          {isConnected ? (
            <strong style={{ color: POSTURE_TYPES[currentPosture]?.color || '#10b981' }}>{POSTURE_TYPES[currentPosture]?.name}</strong>
          ) : (
            <strong style={{ color: '#94a3b8' }}>의자 연결 대기 중 (신호 없음)</strong>
          )}
        </div>

        <div className="lcd-display-card">
          <div className="lcd-header">
            <span className="lcd-title">ST7920 그래픽 LCD 화면</span>
            <span className="lcd-model-badge">128x64 SPI</span>
          </div>
          <div className="lcd-screen-frame">
            <div className="lcd-bezel">
              <div className="lcd-pixel-line">{lcdText.line1}</div>
              <div className="lcd-pixel-line">{lcdText.line2}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ==========================================
          2열: 실시간 도넛 차트 및 통계
          ========================================== */}
      <div className="dashboard-col col-center">
        <div className="unified-posture-card">
          <div className="card-title-bar">
            <h3>오늘의 자세 비율 &amp; 상세 분석</h3>
            <span className="card-tag">자정 자동 초기화</span>
          </div>

          <div className="donut-wrap">
            <div className="donut-chart" style={donutChartStyle}>
              <div className="donut-hole">
                <span className="donut-center-label">바른 자세 유지율</span>
                <span className="donut-center-value">
                  {totalSeconds > 0 ? `${postureStats.find(p => p.key === 'good')?.percentage.toFixed(0)}%` : '-'}
                </span>
              </div>
            </div>
          </div>

          <div className="stat-list compact-list">
            {postureStats.map((item) => (
              <div key={item.key} className="stat-item">
                <div className="stat-header">
                  <div className="stat-name-wrap">
                    <span className="color-dot" style={{ backgroundColor: item.color }}></span>
                    <span className="stat-name">{item.name}</span>
                  </div>
                  <div className="stat-values">
                    <span className="stat-ratio">{totalSeconds > 0 ? `${item.percentage.toFixed(1)}%` : '0%'}</span>
                    <span className="stat-time-tag">({formatTime(item.seconds)})</span>
                  </div>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${item.percentage}%`, backgroundColor: item.color }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ==========================================
          3열: 8채널 FSR 압력 센서 히트맵
          ========================================== */}
      <div className="dashboard-col col-right">
        <div className="heatmap-main-card">
          <div className="card-title-bar">
            <div>
              <h3>실시간 압력 분포 히트맵 (8채널)</h3>
              <p className="card-subtext">압력이 높아질수록 붉은 원이 커집니다</p>
            </div>
            <span className={`status-pill ${isConnected && isSitting ? 'sitting' : 'empty'}`}>
              {isConnected && isSitting ? '착석 중' : isConnected ? '빈 의자' : '연결 안 됨'}
            </span>
          </div>

          <div className="chair-visual-container">
            <div className="seat-front-label">▲ 전방 (무릎 / 허벅지)</div>

            <div className="actual-seat-cushion">
              {/* 1열: 전방 7, 8 */}
              <div className="sensor-row front-row">
                {[ { ch: 6, label: '7번 (전방 좌)' }, { ch: 7, label: '8번 (전방 우)' } ].map((s) => {
                  const circle = getCircleStyle(pressures[s.ch]);
                  return (
                    <div key={s.ch} className="sensor-node">
                      <span className="node-id">{s.label}</span>
                      <div className="circle-socket">
                        <div className="pressure-circle" style={circle}></div>
                      </div>
                      <strong className="node-val">{pressures[s.ch]}</strong>
                    </div>
                  );
                })}
              </div>

              {/* 2열: 중앙 4, 5, 6 */}
              <div className="sensor-row center-row">
                {[ { ch: 3, label: '4번 (중앙 좌)' }, { ch: 4, label: '5번 (중앙)' }, { ch: 5, label: '6번 (중앙 우)' } ].map((s) => {
                  const circle = getCircleStyle(pressures[s.ch]);
                  return (
                    <div key={s.ch} className="sensor-node">
                      <span className="node-id">{s.label}</span>
                      <div className="circle-socket">
                        <div className="pressure-circle" style={circle}></div>
                      </div>
                      <strong className="node-val">{pressures[s.ch]}</strong>
                    </div>
                  );
                })}
              </div>

              {/* 3열: 후방 1, 2, 3 */}
              <div className="sensor-row rear-row">
                {[ { ch: 0, label: '1번 (후방 좌)' }, { ch: 1, label: '2번 (후방 중)' }, { ch: 2, label: '3번 (후방 우)' } ].map((s) => {
                  const circle = getCircleStyle(pressures[s.ch]);
                  return (
                    <div key={s.ch} className="sensor-node">
                      <span className="node-id">{s.label}</span>
                      <div className="circle-socket">
                        <div className="pressure-circle" style={circle}></div>
                      </div>
                      <strong className="node-val">{pressures[s.ch]}</strong>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="seat-rear-label">▼ 후방 (등받이 쪽)</div>
          </div>

          <div className="heatmap-compact-footer">
            <div className="pressure-total-wrap">
              <span className="total-title">압력 합계: <strong>{pressures.reduce((a, b) => a + b, 0)}</strong> / 기준 800 (1kΩ)</span>
              <div className="threshold-bar-bg">
                <div className="threshold-bar-fill" style={{ width: `${Math.min((pressures.reduce((a, b) => a + b, 0) / 4000) * 100, 100)}%`, backgroundColor: isConnected && isSitting ? '#ef4444' : '#94a3b8' }}></div>
                <div className="threshold-marker" style={{ left: `${(800 / 4000) * 100}%` }}></div>
              </div>
            </div>
            <div className="circle-mini-legend">
              <div className="mini-legend-item"><span className="mini-dot dot-high"></span> 강함 (&gt;500)</div>
              <div className="mini-legend-item"><span className="mini-dot dot-mid"></span> 보통 (200~499)</div>
              <div className="mini-legend-item"><span className="mini-dot dot-low"></span> 약함 (&lt;200)</div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
          🔐 서브도메인 로그인 / 회원가입 모달
          ========================================================= */}
      {authModal && (
        <div className="modal-overlay" onClick={() => setAuthModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>
                {authModal === 'login' ? '스마트 의자 로그인' : '새 기기 서브도메인 등록'}
              </h3>
              <button className="close-btn" onClick={() => setAuthModal(null)}>✕</button>
            </div>

            <p className="modal-subtext">
              {authModal === 'login'
                ? '라즈베리파이에 등록된 서브도메인과 4자리 PIN을 입력하세요.'
                : '스마트 의자에 연결할 서브도메인과 4자리 PIN을 새로 등록합니다.'}
            </p>

            {/* 영구 잠금 상태 경고 배너 */}
            {isDeviceLocked && (
              <div className="lockout-alert-banner">
                <strong>🔒 기기 접근이 영구 차단되었습니다</strong>
                비밀번호 5회 연속 오류로 기기가 보호 모드에 들어갔습니다.<br />
                소유자 터미널(SSH)에서 잠금을 해제해야 다시 시도할 수 있습니다.
              </div>
            )}

            {/* 일반 에러 메시지 알림 박스 */}
            {authError && !isDeviceLocked && (
              <div className="auth-alert-box error">
                <div>{authError}</div>
                {authError.includes('이미') && (
                  <button
                    type="button"
                    className="account-reset-link"
                    style={{ marginTop: '6px', color: '#b91c1c' }}
                    onClick={() => {
                      setAuthModal(null);
                      setDeleteError('');
                      setDeletePin('');
                      setIsDeleteModalOpen(true);
                    }}
                  >
                    기존 계정을 삭제하고 새로 등록하시겠습니까? ➔
                  </button>
                )}
              </div>
            )}

            <form onSubmit={authModal === 'login' ? handleLogin : handleRegister} className={isDeviceLocked ? 'form-disabled' : ''}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  서브도메인 주소
                </label>
                <div className="subdomain-input-group">
                  <input
                    type="text"
                    placeholder="예: chair01"
                    value={authSubdomain}
                    onChange={(e) => setAuthSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    disabled={isDeviceLocked}
                    autoFocus
                    required
                  />
                  <span className="subdomain-suffix-badge">.{BASE_DOMAIN}</span>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  4자리 숫자 PIN 번호
                </label>
                <input
                  type="password"
                  maxLength={4}
                  className="ip-input pin-input"
                  placeholder="••••"
                  value={authPin}
                  onChange={(e) => setAuthPin(e.target.value.replace(/[^0-9]/g, ''))}
                  disabled={isDeviceLocked}
                  required
                />
                {authModal === 'login' && (
                  <div className="auth-switch-row" style={{ marginTop: '6px' }}>
                    <button
                      type="button"
                      className="auth-text-btn subtle"
                      onClick={() => alert("보안을 위해 비밀번호 분실 시에는 라즈베리파이 터미널(SSH)에서 'python3 reset_pin.py' 명령어로만 재설정할 수 있습니다.")}
                    >
                      비밀번호를 잊으셨나요?
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="modal-confirm-btn"
                disabled={isDeviceLocked}
                style={{ background: authModal === 'login' ? '#2563eb' : '#10b981', color: '#fff' }}
              >
                {authModal === 'login' ? '스마트 의자 연결하기' : '서브도메인 계정 등록하기'}
              </button>

              <div className="auth-switch-row" style={{ marginTop: '14px', justifyContent: 'center' }}>
                {authModal === 'login' ? (
                  <button
                    type="button"
                    className="auth-text-btn"
                    onClick={() => {
                      setAuthModal('register');
                      setAuthError('');
                    }}
                  >
                    새로운 기기인가요? 서브도메인 등록 ➔
                  </button>
                ) : (
                  <button
                    type="button"
                    className="auth-text-btn"
                    onClick={() => {
                      setAuthModal('login');
                      setAuthError('');
                    }}
                  >
                    이미 계정이 있으신가요? 로그인으로 돌아가기 ➔
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          🗑️ 기기 계정 삭제 확인 모달
          ========================================================= */}
      {isDeleteModalOpen && (
        <div className="modal-overlay" onClick={() => setIsDeleteModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, color: '#dc2626' }}>기기 계정 등록 해제</h3>
              <button className="close-btn" onClick={() => setIsDeleteModalOpen(false)}>✕</button>
            </div>

            <p className="modal-subtext">
              현재 기기에 등록된 계정 정보를 삭제합니다.<br />
              본인 확인을 위해 <strong>현재 설정된 4자리 PIN 번호</strong>를 입력해주세요.
            </p>

            {deleteError && (
              <div className="auth-alert-box error" style={{ fontWeight: 'bold' }}>
                ⚠️ {deleteError}
              </div>
            )}

            <form onSubmit={handleDeleteAccount}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  기기 PIN 번호 확인
                </label>
                <input
                  type="password"
                  maxLength={4}
                  className="ip-input pin-input"
                  placeholder="••••"
                  value={deletePin}
                  onChange={(e) => setDeletePin(e.target.value.replace(/[^0-9]/g, ''))}
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="submit"
                  style={{ flex: 1, backgroundColor: '#dc2626', color: '#fff', border: 'none', padding: '11px', borderRadius: '10px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  계정 삭제 확인
                </button>
                <button
                  type="button"
                  style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '11px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                  onClick={() => setIsDeleteModalOpen(false)}
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          📊 계층형 드릴다운 모달 (연별 ➔ 월별 ➔ 일별 + 즉시 표시 그래프)
          ========================================================= */}
      {activeModal === 'history' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>
                {drillLevel === 'year' && '연도별 평균 점수'}
                {drillLevel === 'month' && `${selectedYear}년 월별 평균 점수`}
                {drillLevel === 'day' && `${selectedYear}년 ${selectedMonth}월 일별 평균 점수`}
              </h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>✕</button>
            </div>

            <p className="modal-subtext">
              {drillLevel === 'year' && '연도별 종합 점수 변화 추이와 세부 기록'}
              {drillLevel === 'month' && `${selectedYear}년도의 월간 자세 점수 변화 추이`}
              {drillLevel === 'day' && `${selectedYear}년 ${selectedMonth}월 매일 자정에 기록된 최종 점수`}
            </p>

            {/* 1단계: 연도별 뷰 */}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`risk-tag ${risk.class}`}>{risk.label}</span>
                          <button style={{ padding: '5px 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }} onClick={() => handleSelectYear(item.year)}>
                            월별 평균 점수 보기 📅
                          </button>
                          <button style={{ padding: '5px 6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => { setSelectedDetail({ title: `${item.year} 세부 리포트`, ...item }); setActiveModal('historyDetail'); }}>
                            세부 🔍
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* 2단계: 월별 뷰 */}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`risk-tag ${risk.class}`}>{risk.label}</span>
                          <button style={{ padding: '5px 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }} onClick={() => handleSelectMonth(item.month)}>
                            일별 평균 점수 보기 🗓️
                          </button>
                          <button style={{ padding: '5px 6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => { setSelectedDetail({ title: `${selectedYear}년 ${item.month} 세부 리포트`, ...item }); setActiveModal('historyDetail'); }}>
                            세부 🔍
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* 3단계: 일별 뷰 */}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`risk-tag ${risk.class}`}>{risk.label}</span>
                          <button style={{ padding: '5px 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => { setSelectedDetail({ title: `${item.fullDate || item.day} 세부 리포트`, ...item }); setActiveModal('historyDetail'); }}>
                            세부 데이터 🔍
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* 하단 버튼 영역: '연별로' / '월별로' + '닫기' 나란히 배치 */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              {drillLevel === 'month' && (
                <button
                  type="button"
                  style={{
                    flex: 1,
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    border: '1px solid #bfdbfe',
                    padding: '11px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease',
                  }}
                  onClick={() => setDrillLevel('year')}
                >
                  ◀ 연별로
                </button>
              )}

              {drillLevel === 'day' && (
                <button
                  type="button"
                  style={{
                    flex: 1,
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    border: '1px solid #bfdbfe',
                    padding: '11px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease',
                  }}
                  onClick={() => setDrillLevel('month')}
                >
                  ◀ 월별로
                </button>
              )}

              <button
                className="modal-confirm-btn"
                style={{ flex: 1, width: 'auto' }}
                onClick={() => setActiveModal(null)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 세부 데이터 모달 (연/월/일 공통) */}
      {activeModal === 'historyDetail' && selectedDetail && (
        <div className="modal-overlay" onClick={() => setActiveModal('history')}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedDetail.title || '세부 리포트'}</h3>
              <button className="close-btn" onClick={() => setActiveModal('history')}>✕</button>
            </div>
            <div style={{ background: '#f8f9fa', padding: '14px', borderRadius: '10px', margin: '14px 0', border: '1px solid #e9ecef' }}>
              <p style={{ margin: '0 0 6px 0', fontSize: '13px' }}><strong>가장 빈번했던 자세:</strong> <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{selectedDetail.topPosture || '데이터 없음'}</span></p>
              <p style={{ margin: 0, fontSize: '13px' }}><strong>착석 시간:</strong> {selectedDetail.avgSitTime || selectedDetail.sitTime || '기록 없음'}</p>
            </div>
            <div style={{ background: '#e6fcf5', padding: '14px', borderRadius: '10px', fontSize: '13px', lineHeight: '1.6', border: '1px solid #b2f2bb' }}>
              <strong style={{ display: 'block', marginBottom: '6px', color: '#0ca678' }}>🤖 의사결정나무 AI 피드백</strong>
              {selectedDetail.feedback || 'AI 피드백 데이터가 충분하지 않습니다.'}
            </div>
            <button className="modal-confirm-btn" style={{ marginTop: '16px' }} onClick={() => setActiveModal('history')}>목록으로 돌아가기</button>
          </div>
        </div>
      )}

      {/* 바른 자세 0점 설정 모달 */}
      {activeModal === 'calibrate' && (
        <div className="modal-overlay" onClick={closeCalibModal}>
          <div className="modal-content" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: '0 auto' }}>AI 체형 기준점(0점) 정밀 측정 ({calibStep + 1}/3)</h3>
              {!isCalibrating && <button className="close-btn" onClick={closeCalibModal}>✕</button>}
            </div>

            <p style={{ color: '#555', fontSize: '14px', lineHeight: '1.6', margin: '20px 0', minHeight: '50px' }}>
              {isCalibrating
                ? "움직이지 마세요!\nAI가 센서 노이즈를 제거하며 정밀 측정 중입니다..."
                : calibStep === 0
                  ? "허리를 펴고 의자 깊숙이 바르게 앉아주세요.\n시작 버튼을 누르면 1차 측정을 3초간 진행합니다."
                  : calibStep === 1
                    ? "✅ 1차 측정 완료!\n자세를 그대로 유지한 채 2차 측정을 시작해 주세요."
                    : "✅ 2차 측정 완료!\n마지막 3차 측정을 진행하여 AI 학습을 완료합니다."
              }
            </p>

            <div className="calib-progress-container" style={{ width: '100%', height: '14px', backgroundColor: '#e2e8f0', borderRadius: '7px', overflow: 'hidden', margin: '0 0 20px 0' }}>
              <div
                className="calib-progress-fill"
                style={{ width: `${calibProgress}%`, height: '100%', backgroundColor: '#4263eb', transition: 'width 0.1s linear' }}
              ></div>
            </div>
            <div style={{ fontSize: '13px', color: '#4263eb', fontWeight: 'bold', marginBottom: '20px' }}>
              진행률: {calibProgress}%
            </div>

            <button
              className="modal-confirm-btn"
              onClick={handleStartCalibration}
              disabled={isCalibrating}
              style={{ background: isCalibrating ? '#94a3b8' : '#4263eb', color: 'white', padding: '14px', fontSize: '14px', cursor: isCalibrating ? 'not-allowed' : 'pointer' }}
            >
              {isCalibrating
                ? "측정 진행 중..."
                : calibStep === 0
                  ? "▶️ 1차 측정 시작 (3초)"
                  : calibStep === 1
                    ? "▶️ 2차 측정 시작 (3초)"
                    : "▶️ 3차 측정 및 AI 학습 완료 (3초)"
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
