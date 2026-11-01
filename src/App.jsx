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

function App() {
  const [todayDate, setTodayDate] = useState('');
  const [currentPosture, setCurrentPosture] = useState('good');
  
  // 모달 및 캘리브레이션 상태
  const [activeModal, setActiveModal] = useState(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibProgress, setCalibProgress] = useState(0); // 0 ~ 100% 진행률
  const [calibStep, setCalibStep] = useState(0); // 0(1차), 1(2차), 2(3차) 측정 단계
  const [calibSnapshots, setCalibSnapshots] = useState([]); // 1,2,3차의 모든 측정 데이터를 누적 저장
  const [selectedDetail, setSelectedDetail] = useState(null);
  const calibTimerRef = useRef(null); // 타이머 제어용 참조

  const [serverUrl, setServerUrl] = useState(() => 
    localStorage.getItem('chair_server_url') || DEFAULT_SERVER_URL
  );
  const [inputUrl, setInputUrl] = useState('');
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const [pressures, setPressures] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const [isSitting, setIsSitting] = useState(false);
  const pressuresRef = useRef([0, 0, 0, 0, 0, 0, 0, 0]); // 실시간 측정 캡처용 최신값 참조

  const [historyScores, setHistoryScores] = useState([
    { date: '2026년 9월 7일', score: 88, sitTime: '5시간 40분', topPosture: '바른 자세', feedback: '의사결정나무 AI 분석 결과, 전체적으로 바른 자세를 잘 유지했습니다.' },
    { date: '2026년 9월 6일', score: 74, sitTime: '6시간 10분', topPosture: '우측 쏠림 (다리 꼬기)', feedback: '의사결정나무 분석 결과, 오른쪽 다리를 꼬는 습관이 있습니다.' },
    { date: '2026년 9월 5일', score: 92, sitTime: '4시간 50분', topPosture: '바른 자세', feedback: '매우 훌륭합니다! 불량 자세 비율이 10% 미만입니다.' },
    { date: '2026년 9월 4일', score: 68, sitTime: '7시간 05분', topPosture: '거북목 / 상체 숙임', feedback: '전방 센서에 압력이 과도합니다. 모니터 높이를 확인해 보세요.' },
    { date: '2026년 9월 3일', score: 85, sitTime: '5시간 15분', topPosture: '바른 자세', feedback: '양호한 자세입니다. 1시간마다 스트레칭을 권장합니다.' },
  ]);

  const [monthlyScores, setMonthlyScores] = useState([
    { month: '2026년 8월', score: 86, avgSitTime: '5시간 30분', topPosture: '바른 자세', feedback: '전월 대비 골반 불균형 수치가 15% 개선되었습니다.' },
    { month: '2026년 7월', score: 78, avgSitTime: '6시간 15분', topPosture: '우측 쏠림 (다리 꼬기)', feedback: '우측 골반 하중이 평균 40% 이상 높게 측정되었습니다.' },
    { month: '2026년 6월', score: 82, avgSitTime: '5시간 50분', topPosture: '바른 자세', feedback: '걸터앉는 자세만 조금 더 줄여보세요.' },
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
              pressuresRef.current = data.pressures; // 실시간 캡처용 참조 업데이트
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
    fetch(`${serverUrl}/api/history`).then(r => r.json()).then(d => { if (Array.isArray(d)) setHistoryScores(d); }).catch(()=>{});
    fetch(`${serverUrl}/api/monthly`).then(r => r.json()).then(d => { if (Array.isArray(d)) setMonthlyScores(d); }).catch(()=>{});
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

  // -------------------------------------------------------------
  // [완벽 업데이트] 3회 분할 x 3초 정밀 측정 (0.1초 간격, 회당 30번 캡처)
  // -------------------------------------------------------------
  const handleStartCalibration = () => {
    if (isCalibrating) return; // 중복 실행 방지
    setIsCalibrating(true);
    setCalibProgress(0);

    const stepSnapshots = [];
    let count = 0;
    const totalCount = 30; // 0.1초(100ms) 간격 * 30회 = 3초

    calibTimerRef.current = setInterval(() => {
      // 0.1초마다 현재 센서 배열 캡처
      stepSnapshots.push([...pressuresRef.current]);
      count++;
      setCalibProgress(Math.round((count / totalCount) * 100));

      // 3초 측정 완료 시
      if (count >= totalCount) {
        clearInterval(calibTimerRef.current);
        
        // 현재까지 누적된 전체 데이터에 방금 측정한 30개 추가
        const updatedSnapshots = [...calibSnapshots, ...stepSnapshots];
        setCalibSnapshots(updatedSnapshots);
        setIsCalibrating(false);

        // 측정 단계(Step) 넘기기 또는 학습 완료
        if (calibStep === 0) {
          setCalibStep(1); // 1차 완료 -> 2차 대기
        } else if (calibStep === 1) {
          setCalibStep(2); // 2차 완료 -> 3차 대기
        } else if (calibStep === 2) {
          finishCalibration(updatedSnapshots); // 3차 완료 -> AI 학습(서버 전송)
        }
      }
    }, 100); // 100ms (0.1초)
  };

  const finishCalibration = async (finalSnapshots) => {
    // 총 90회(3회x30번) 측정값의 평균 계산
    const avgSnapshot = finalSnapshots[0].map((_, colIndex) =>
      Math.round(finalSnapshots.reduce((acc, row) => acc + row[colIndex], 0) / finalSnapshots.length)
    );

    // 평균 배열을 서버(app.py)로 전송하여 AI 기준점 재학습
    try {
      await fetch(`${serverUrl}/api/calibrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ good_baseline: avgSnapshot })
      });
      alert('✅ [3/3] 모든 정밀 측정이 완료되었습니다!\n(최종 평균 데이터가 AI 모델에 성공적으로 적용되었습니다)');
    } catch (error) {
      alert('⚠️ 측정은 끝났으나 서버로 전송하지 못했습니다.\n네트워크 상태를 확인해주세요.');
    }

    // 모달 초기화
    closeCalibModal();
  };

  // 모달 강제 종료 시 초기화 함수
  const closeCalibModal = () => {
    if (calibTimerRef.current) clearInterval(calibTimerRef.current);
    setIsCalibrating(false);
    setCalibProgress(0);
    setCalibStep(0);
    setCalibSnapshots([]);
    setActiveModal(null);
  };
  // -------------------------------------------------------------

  const getRiskInfo = (score) => {
    if (score >= 80) return { label: '안전', class: 'risk-safe' };
    if (score >= 70) return { label: '주의', class: 'risk-warning' };
    return { label: '위험', class: 'risk-danger' };
  };

  const getDisplayUrl = (url) => url ? url.replace(/^https?:\/\//, '') : '';

  return (
    <div className="dashboard">
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
            <button className="history-btn" onClick={() => setActiveModal('daily')}>
              📊 지난 자세점수 보기
            </button>
            <button className="monthly-btn" onClick={() => setActiveModal('monthly')}>
              📅 월별 평균 점수
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
              <div className="modal-actions">
                <button type="submit" className="modal-confirm-btn">연결 주소 저장</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeModal === 'daily' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>과거 자세점수 기록</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <p className="modal-subtext">하루 착석 종료 시점의 최종 점수</p>
            <div className="history-list">
              {historyScores.map((record, index) => {
                const risk = getRiskInfo(record.score);
                return (
                  <div key={index} className="history-item">
                    <div className="history-info">
                      <span className="history-text"><strong>{record.date}</strong> 자세점수 <span className="highlight-score">{record.score}점</span></span>
                      <span className="history-sit-time">(착석 시간: {record.sitTime})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={`risk-tag ${risk.class}`}>{risk.label}</span>
                      <button style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => { setSelectedDetail(record); setActiveModal('dailyDetail'); }}>세부 데이터 🔍</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="modal-confirm-btn" onClick={() => setActiveModal(null)}>닫기</button>
          </div>
        </div>
      )}

      {activeModal === 'monthly' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>월별 평균 점수 및 위험도</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <p className="modal-subtext">한 달간 누적된 일일 점수의 평균</p>
            <div className="history-list">
              {monthlyScores.map((item, index) => {
                const risk = getRiskInfo(item.score);
                return (
                  <div key={index} className="history-item">
                    <div className="history-info">
                      <span className="history-text"><strong>{item.month}</strong> 자세점수 <span className="highlight-score">{item.score}점</span></span>
                      <span className="history-sit-time">(일평균 착석: {item.avgSitTime})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={`risk-tag ${risk.class}`}>{risk.label}</span>
                      <button style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => { setSelectedDetail(item); setActiveModal('monthlyDetail'); }}>세부 데이터 🔍</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="modal-confirm-btn" onClick={() => setActiveModal(null)}>닫기</button>
          </div>
        </div>
      )}

      {/* 🎯 3단계 분할 정밀 캘리브레이션 모달 UI */}
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

            {/* 측정 진행률 게이지 바 */}
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

      {activeModal === 'dailyDetail' && selectedDetail && (
        <div className="modal-overlay" onClick={() => setActiveModal('daily')}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedDetail.date} 세부 리포트</h3>
              <button className="close-btn" onClick={() => setActiveModal('daily')}>✕</button>
            </div>
            <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '10px', marginBottom: '15px', border: '1px solid #e9ecef' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}><strong>이날 가장 많이 측정된 자세:</strong> <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{selectedDetail.topPosture || '데이터 없음'}</span></p>
            </div>
            <div style={{ background: '#e6fcf5', padding: '15px', borderRadius: '10px', fontSize: '14px', lineHeight: '1.6', border: '1px solid #b2f2bb' }}>
              <strong style={{ display: 'block', marginBottom: '8px', color: '#0ca678' }}>🤖 의사결정나무 AI 피드백</strong>
              {selectedDetail.feedback || 'AI 피드백 데이터가 아직 충분하지 않습니다.'}
            </div>
            <button className="modal-confirm-btn" style={{ marginTop: '20px' }} onClick={() => setActiveModal('daily')}>목록으로 돌아가기</button>
          </div>
        </div>
      )}

      {activeModal === 'monthlyDetail' && selectedDetail && (
        <div className="modal-overlay" onClick={() => setActiveModal('monthly')}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedDetail.month} 종합 리포트</h3>
              <button className="close-btn" onClick={() => setActiveModal('monthly')}>✕</button>
            </div>
            <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '10px', marginBottom: '15px', border: '1px solid #e9ecef' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}><strong>이달 가장 잦았던 불량 자세:</strong> <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{selectedDetail.topPosture || '데이터 없음'}</span></p>
            </div>
            <div style={{ background: '#e6fcf5', padding: '15px', borderRadius: '10px', fontSize: '14px', lineHeight: '1.6', border: '1px solid #b2f2bb' }}>
              <strong style={{ display: 'block', marginBottom: '8px', color: '#0ca678' }}>🤖 의사결정나무 AI 종합 진단</strong>
              {selectedDetail.feedback || 'AI 피드백 데이터가 아직 충분하지 않습니다.'}
            </div>
            <button className="modal-confirm-btn" style={{ marginTop: '20px' }} onClick={() => setActiveModal('monthly')}>목록으로 돌아가기</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
