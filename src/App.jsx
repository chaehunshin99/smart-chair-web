import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const POSTURE_TYPES = {
  good: { name: '바른 자세', color: '#10b981' },
  left: { name: '좌측 쏠림 (다리 꼬기)', color: '#f59e0b' },
  right: { name: '우측 쏠림 (다리 꼬기)', color: '#6366f1' },
  forward: { name: '거북목 / 상체 숙임', color: '#ef4444' },
  slouch: { name: '뒤로 눕기 (슬라우칭)', color: '#8b5cf6' },
};

const DEFAULT_SERVER_URL = 'https://api.smart-chair-web.site';

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

  const [serverUrl, setServerUrl] = useState(() =>
    localStorage.getItem('chair_server_url') || DEFAULT_SERVER_URL
  );
  const [inputUrl, setInputUrl] = useState('');
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

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

  const handleSaveUrl = (e) => {
    e.preventDefault();
    let clean = inputUrl.trim();
    if (clean) {
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) clean = `https://${clean}`;
      if (clean.endsWith('/')) clean = clean.slice(0, -1);
    } else {
      clean = DEFAULT_SERVER_URL;
    }
    localStorage.setItem('chair_server_url', clean);
    setServerUrl(clean);
    setIsUrlModalOpen(false);
  };

  useEffect(() => {
    const dataTimer = setInterval(async () => {
      if (serverUrl) {
        try {
          const response = await fetch(`${serverUrl}/api/live-status`, { signal: AbortSignal.timeout(900) });
          if (response.ok) {
            const data = await response.json();
            if (data.currentPosture) setCurrentPosture(data.currentPosture);
            if (data.postureSeconds) setPostureSeconds(data.postureSeconds);
            if (data.pressures) {
              setPressures(data.pressures);
              pressuresRef.current = data.pressures;
            }
            if (data.is_sitting !== undefined) setIsSitting(data.is_sitting);
            setIsConnected(true);
            return;
          }
        } catch {
          setIsConnected(false);
          setIsSitting(false);
        }
      } else {
        setIsConnected(false);
        setIsSitting(false);
      }
    }, 1000);
    return () => clearInterval(dataTimer);
  }, [serverUrl]);

  useEffect(() => {
    if (!serverUrl) return;
    fetch(`${serverUrl}/api/history/years`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setYearlyData(d); })
      .catch(() => {});
  }, [serverUrl, activeModal]);

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
              {isConnected ? `연결됨 (${getDisplayUrl(serverUrl)})` : `연결 대기중 (${getDisplayUrl(serverUrl)})`}
            </span>
          </div>

          <h2 className="date-title">{todayDate}</h2>
          <p className="sub-info">오늘 총 착석 시간: <strong>{formatTime(totalSeconds)}</strong></p>

          <div className="score-badge">
            <div className="score-label">실시간 자세 점수</div>
            <div className="score-number">{healthScore}<span className="score-unit">점</span></div>
          </div>

          <div className="button-group">
            <button className="ip-btn" onClick={() => { setInputUrl(serverUrl); setIsUrlModalOpen(true); }}>
              ⚙️ {serverUrl ? '의자 도메인 변경' : '의자 도메인 연결'}
            </button>
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
              <span className="total-title">압력 합계: <strong>{pressures.reduce((a, b) => a + b, 0)}</strong> / 기준 2500</span>
              <div className="threshold-bar-bg">
                <div className="threshold-bar-fill" style={{ width: `${Math.min((pressures.reduce((a, b) => a + b, 0) / 8184) * 100, 100)}%`, backgroundColor: isConnected && isSitting ? '#ef4444' : '#94a3b8' }}></div>
                <div className="threshold-marker" style={{ left: `${(2500 / 8184) * 100}%` }}></div>
              </div>
            </div>
            <div className="circle-mini-legend">
              <div className="mini-legend-item"><span className="mini-dot dot-high"></span> 강함 (&gt;750)</div>
              <div className="mini-legend-item"><span className="mini-dot dot-mid"></span> 보통 (300~749)</div>
              <div className="mini-legend-item"><span className="mini-dot dot-low"></span> 약함 (&lt;300)</div>
            </div>
          </div>
        </div>
      </div>

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

      {/* 개인 스마트 의자 도메인 연결 설정 모달 */}
      {isUrlModalOpen && (
        <div className="modal-overlay" onClick={() => setIsUrlModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>개인 스마트 의자 연결 설정</h3>
              <button className="close-btn" onClick={() => setIsUrlModalOpen(false)}>✕</button>
            </div>
            <p className="modal-subtext">라즈베리파이의 Cloudflare Tunnel HTTPS 주소를 입력하세요.</p>
            <form onSubmit={handleSaveUrl}>
              <input type="text" className="ip-input" placeholder="예: api.smart-chair-web.site" value={inputUrl} onChange={(e) => setInputUrl(e.target.value)} autoFocus />
              <div className="modal-actions" style={{ marginTop: '14px' }}>
                <button type="submit" className="modal-confirm-btn">연결 주소 저장</button>
              </div>
            </form>
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
