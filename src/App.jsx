import React, { useState, useEffect } from 'react';
import './App.css';

// 5가지 자세 정의 (원본 유지)
const POSTURE_TYPES = {
  good: { name: '바른 자세', color: '#10b981' },
  left: { name: '좌측 쏠림 (다리 꼬기)', color: '#f59e0b' },
  right: { name: '우측 쏠림 (다리 꼬기)', color: '#6366f1' },
  forward: { name: '거북목 / 상체 숙임', color: '#ef4444' },
  slouch: { name: '뒤로 눕기 (슬라우칭)', color: '#8b5cf6' },
};

function App() {
  const [todayDate, setTodayDate] = useState('');
  const [currentPosture, setCurrentPosture] = useState('good');
  
  // 모달 상태 ('daily': 일별, 'monthly': 월별, 'calibrate': 측정, 'dailyDetail': 일간세부, 'monthlyDetail': 월간세부, null: 닫힘)
  const [activeModal, setActiveModal] = useState(null);

  // [추가] 캘리브레이션 단계 및 세부 데이터 선택 상태
  const [calibStep, setCalibStep] = useState(0);
  const [selectedDetail, setSelectedDetail] = useState(null);

  // Cloudflare Tunnel 주소 관리 (원본 유지)
  const [serverUrl, setServerUrl] = useState(() => 
    localStorage.getItem('chair_server_url') || localStorage.getItem('chair_pi_ip') || ''
  );
  const [inputUrl, setInputUrl] = useState('');
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // 1. 일별 지난 기록 (UI 시뮬레이션을 위해 최다 자세와 피드백 항목 임시 추가)
  const [historyScores, setHistoryScores] = useState([
    { date: '2026년 9월 7일', score: 88, sitTime: '5시간 40분', topPosture: '바른 자세', feedback: '의사결정나무 AI 분석 결과, 전체적으로 바른 자세를 잘 유지했습니다. 우측 쏠림이 12% 감지되었으니 짝다리 짚는 습관만 주의하세요.' },
    { date: '2026년 9월 6일', score: 74, sitTime: '6시간 10분', topPosture: '우측 쏠림 (다리 꼬기)', feedback: '의사결정나무 분석 결과, 3번과 6번 압력센서(우측 허벅지)에 하중이 집중되었습니다. 오른쪽 다리를 꼬는 습관이 있습니다.' },
    { date: '2026년 9월 5일', score: 92, sitTime: '4시간 50분', topPosture: '바른 자세', feedback: '매우 훌륭합니다! 의사결정나무 모델이 감지한 불량 자세 비율이 10% 미만입니다.' },
    { date: '2026년 9월 4일', score: 68, sitTime: '7시간 05분', topPosture: '거북목 / 상체 숙임', feedback: '전방 1,2,3번 센서에 압력이 과도합니다. 모니터가 너무 낮거나 멀리 있는지 확인해 보세요.' },
    { date: '2026년 9월 3일', score: 85, sitTime: '5시간 15분', topPosture: '바른 자세', feedback: '양호한 자세입니다. 다만 착석 시간이 길어지고 있으니 1시간마다 스트레칭을 권장합니다.' },
  ]);

  // 2. 월별 평균 점수 (UI 시뮬레이션을 위해 최다 자세와 피드백 항목 임시 추가)
  const [monthlyScores, setMonthlyScores] = useState([
    { month: '2026년 8월', score: 86, avgSitTime: '5시간 30분', topPosture: '바른 자세', feedback: '8월 한 달간 의사결정나무 데이터 분석 결과, 전월 대비 골반 불균형 수치가 15% 개선되었습니다.' },
    { month: '2026년 7월', score: 78, avgSitTime: '6시간 15분', topPosture: '우측 쏠림 (다리 꼬기)', feedback: '7월은 우측 쏠림이 잦았습니다. 우측 골반 하중이 평균 40% 이상 높게 측정되었습니다.' },
    { month: '2026년 6월', score: 82, avgSitTime: '5시간 50분', topPosture: '바른 자세', feedback: '무난한 한 달이었습니다. 앞으로 걸터앉는 자세(18%)만 조금 더 줄여보세요.' },
    { month: '2026년 5월', score: 64, avgSitTime: '7시간 10분', topPosture: '거북목 / 상체 숙임', feedback: '5월은 시험 기간 등의 영향으로 상체를 크게 숙이는 거북목 자세가 가장 많았습니다. 의식적으로 등받이에 기대세요.' },
    { month: '2026년 4월', score: 72, avgSitTime: '6시간 05분', topPosture: '좌측 쏠림 (다리 꼬기)', feedback: '좌측 쏠림이 잦았습니다. 왼쪽으로 턱을 괴거나 다리를 꼬는 습관을 주의하세요.' },
    { month: '2026년 3월', score: 91, avgSitTime: '4시간 40분', topPosture: '바른 자세', feedback: '완벽에 가까운 자세 밸런스를 유지한 달입니다!' },
  ]);

  // 오늘 누적된 각 자세별 시간 (원본 유지)
  const [postureSeconds, setPostureSeconds] = useState({
    good: 180, left: 20, right: 15, forward: 25, slouch: 10,
  });

  // 오늘 날짜 갱신 (원본 유지)
  useEffect(() => {
    const updateDate = () => {
      const now = new Date();
      const formatted = now.toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
      });
      setTodayDate(formatted);
    };
    updateDate();
    const dateTimer = setInterval(updateDate, 60000);
    return () => clearInterval(dateTimer);
  }, []);

  // 주소 정규화 및 저장 핸들러 (원본 유지)
  const handleSaveUrl = (e) => {
    e.preventDefault();
    let clean = inputUrl.trim();
    if (clean) {
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `https://${clean}`;
      }
      if (clean.endsWith('/')) {
        clean = clean.slice(0, -1);
      }
    }
    localStorage.setItem('chair_server_url', clean);
    setServerUrl(clean);
    setIsUrlModalOpen(false);
  };

  // 실시간 백엔드 통신 & 미연결 시 자동 시뮬레이션 (원본 유지)
  useEffect(() => {
    const keys = Object.keys(POSTURE_TYPES);
    const dataTimer = setInterval(async () => {
      if (serverUrl) {
        try {
          const response = await fetch(`${serverUrl}/api/live-status`, { signal: AbortSignal.timeout(900) });
          if (response.ok) {
            const data = await response.json();
            if (data.currentPosture) setCurrentPosture(data.currentPosture);
            if (data.postureSeconds) setPostureSeconds(data.postureSeconds);
            setIsConnected(true);
            return;
          }
        } catch {
          setIsConnected(false);
        }
      }
      const isGood = Math.random() < 0.7;
      const detected = isGood ? 'good' : keys[Math.floor(Math.random() * keys.length)];
      setCurrentPosture(detected);
      setPostureSeconds((prev) => ({ ...prev, [detected]: prev[detected] + 1 }));
    }, 1000);
    return () => clearInterval(dataTimer);
  }, [serverUrl]);

  // 라즈베리파이 DB 통신 (원본 유지)
  useEffect(() => {
    if (!serverUrl) return;
    fetch(`${serverUrl}/api/history`)
      .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data) => { if (Array.isArray(data) && data.length > 0) setHistoryScores(data); })
      .catch(() => {});

    fetch(`${serverUrl}/api/monthly`)
      .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data) => { if (Array.isArray(data) && data.length > 0) setMonthlyScores(data); })
      .catch(() => {});
  }, [serverUrl, activeModal]);

  // 통계 계산 (원본 유지)
  const totalSeconds = Object.values(postureSeconds).reduce((a, b) => a + b, 0);
  const postureStats = Object.keys(POSTURE_TYPES).map((key) => {
    const sec = postureSeconds[key];
    const percentage = totalSeconds > 0 ? (sec / totalSeconds) * 100 : 0;
    return { key, ...POSTURE_TYPES[key], seconds: sec, percentage: percentage };
  });

  const healthScore = totalSeconds > 0 ? Math.round((postureSeconds.good / totalSeconds) * 100) : 100;

  // 도넛 차트 계산 (원본 유지)
  let cumulativePercent = 0;
  const gradientParts = postureStats.map((stat) => {
    const start = cumulativePercent;
    cumulativePercent += stat.percentage;
    return `${stat.color} ${start}% ${cumulativePercent}%`;
  });
  const donutChartStyle = { background: `conic-gradient(${gradientParts.join(', ')})` };

  const formatTime = (totalSec) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}시간 ${m}분`;
    if (m > 0) return `${m}분 ${s}초`;
    return `${s}초`;
  };

  const getRiskInfo = (score) => {
    if (score >= 80) return { label: '안전', class: 'risk-safe' };
    if (score >= 70) return { label: '주의', class: 'risk-warning' };
    return { label: '위험', class: 'risk-danger' };
  };

  const getDisplayUrl = (url) => url ? url.replace(/^https?:\/\//, '') : '';

  // [추가] AI 측정(캘리브레이션) 버튼 핸들러
  const handleCalibrate = () => {
    if (calibStep >= 3) {
      setActiveModal(null);
      setCalibStep(0);
      alert('AI 의사결정나무 모델에 기준 자세가 성공적으로 학습되었습니다!');
      return;
    }
    setCalibStep(prev => prev + 1);
  };

  return (
    <div className="dashboard">
      <header className="header-card">
        <div className="header-left">
          <div className="status-indicators">
            <span className="live-dot">● 모니터링 활성</span>
            {serverUrl && (
              <span className={`connection-badge ${isConnected ? 'online' : 'offline'}`}>
                {isConnected ? `연결됨 (${getDisplayUrl(serverUrl)})` : `연결 대기중 (${getDisplayUrl(serverUrl)})`}
              </span>
            )}
          </div>
          <h2 className="date-title">{todayDate}</h2>
          <p className="sub-info">오늘 총 착석 시간: <strong>{formatTime(totalSeconds)}</strong></p>
        </div>

        <div className="header-right">
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
            {/* [추가] 바른 자세 측정 버튼 */}
            <button 
              style={{ background: '#4263eb', color: '#fff', border: 'none', fontWeight: 'bold', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }} 
              onClick={() => { setActiveModal('calibrate'); setCalibStep(0); }}
            >
              🎯 바른 자세 측정 (AI 학습)
            </button>
          </div>
        </div>
      </header>

      {/* 2. 현재 상태 안내 띠 (원본 유지) */}
      <div className="current-status-banner">
        <span>현재 감지 상태: </span>
        <strong style={{ color: POSTURE_TYPES[currentPosture].color }}>
          {POSTURE_TYPES[currentPosture].name}
        </strong>
      </div>

      {/* 3. 본문: 원형 차트 & 상세 통계 (원본 유지) */}
      <div className="main-content">
        <div className="chart-section">
          <h3>오늘의 자세 비율</h3>
          <div className="donut-container">
            <div className="donut-chart" style={donutChartStyle}>
              <div className="donut-hole">
                <span className="donut-center-label">바른 자세</span>
                <span className="donut-center-value">
                  {postureStats.find(p => p.key === 'good')?.percentage.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="details-section">
          <h3>자세별 상세 통계 (자정 초기화)</h3>
          <div className="stat-list">
            {postureStats.map((item) => (
              <div key={item.key} className="stat-item">
                <div className="stat-header">
                  <div className="stat-name-wrap">
                    <span className="color-dot" style={{ backgroundColor: item.color }}></span>
                    <span className="stat-name">{item.name}</span>
                  </div>
                  <span className="stat-ratio">{item.percentage.toFixed(1)}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                  ></div>
                </div>
                <div className="stat-time">{formatTime(item.seconds)} 유지</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. 의자 주소 설정 모달 (원본 유지) */}
      {isUrlModalOpen && (
        <div className="modal-overlay" onClick={() => setIsUrlModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>개인 스마트 의자 연결 설정</h3>
              <button className="close-btn" onClick={() => setIsUrlModalOpen(false)}>✕</button>
            </div>
            <p className="modal-subtext">라즈베리파이의 Cloudflare Tunnel HTTPS 주소를 입력하세요.</p>
            <form onSubmit={handleSaveUrl}>
              <input type="text" className="ip-input" placeholder="예: chair.yourdomain.com" value={inputUrl} onChange={(e) => setInputUrl(e.target.value)} autoFocus />
              <div className="modal-actions">
                <button type="submit" className="modal-confirm-btn">연결 주소 저장</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. 일별 지난 자세점수 모달 (수정: 세부 데이터 버튼 추가) */}
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
                      <span className="history-text">
                        <strong>{record.date}</strong> 자세점수 <span className="highlight-score">{record.score}점</span>
                      </span>
                      <span className="history-sit-time">(착석 시간: {record.sitTime})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={`risk-tag ${risk.class}`}>{risk.label}</span>
                      <button 
                        style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
                        onClick={() => { setSelectedDetail(record); setActiveModal('dailyDetail'); }}
                      >
                        세부 데이터 🔍
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="modal-confirm-btn" onClick={() => setActiveModal(null)}>닫기</button>
          </div>
        </div>
      )}

      {/* 6. 월별 평균 점수 모달 (수정: 세부 데이터 버튼 추가) */}
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
                      <span className="history-text">
                        <strong>{item.month}</strong> 자세점수 <span className="highlight-score">{item.score}점</span>
                      </span>
                      <span className="history-sit-time">(일평균 착석: {item.avgSitTime})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={`risk-tag ${risk.class}`}>{risk.label}</span>
                      <button 
                        style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
                        onClick={() => { setSelectedDetail(item); setActiveModal('monthlyDetail'); }}
                      >
                        세부 데이터 🔍
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="modal-confirm-btn" onClick={() => setActiveModal(null)}>닫기</button>
          </div>
        </div>
      )}

      {/* 7. [신규] AI 측정 (캘리브레이션) 모달 */}
      {activeModal === 'calibrate' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: '0 auto' }}>AI 기준 자세 측정 ({calibStep}/3)</h3>
            </div>
            <p style={{ color: '#555', fontSize: '15px', lineHeight: '1.6', margin: '25px 0' }}>
              {calibStep === 0 
                ? "의사결정나무 모델이 회원님의 체형 기준값을 학습합니다.\n허리를 펴고 의자 깊숙이 바르게 앉아주세요." 
                : `${calibStep}회차 측정 중입니다... (센서 데이터 수집 중)`}
            </p>
            <button 
              className="modal-confirm-btn" 
              onClick={handleCalibrate} 
              style={{ background: '#4263eb', color: 'white' }}
            >
              {calibStep === 0 ? "측정 시작" : "다음 측정"}
            </button>
          </div>
        </div>
      )}

      {/* 8. [신규] 일간 세부 데이터 및 AI 피드백 모달 */}
      {activeModal === 'dailyDetail' && selectedDetail && (
        <div className="modal-overlay" onClick={() => setActiveModal('daily')}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedDetail.date} 세부 리포트</h3>
              <button className="close-btn" onClick={() => setActiveModal('daily')}>✕</button>
            </div>
            <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '10px', marginBottom: '15px', border: '1px solid #e9ecef' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
                <strong>이날 가장 많이 측정된 자세:</strong> <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{selectedDetail.topPosture || '데이터 없음'}</span>
              </p>
            </div>
            <div style={{ background: '#e6fcf5', padding: '15px', borderRadius: '10px', fontSize: '14px', lineHeight: '1.6', border: '1px solid #b2f2bb' }}>
              <strong style={{ display: 'block', marginBottom: '8px', color: '#0ca678' }}>
                🤖 의사결정나무 AI 피드백
              </strong>
              {selectedDetail.feedback || 'AI 피드백 데이터가 아직 충분하지 않습니다.'}
            </div>
            <button className="modal-confirm-btn" style={{ marginTop: '20px' }} onClick={() => setActiveModal('daily')}>
              목록으로 돌아가기
            </button>
          </div>
        </div>
      )}

      {/* 9. [신규] 월간 세부 데이터 및 AI 피드백 모달 */}
      {activeModal === 'monthlyDetail' && selectedDetail && (
        <div className="modal-overlay" onClick={() => setActiveModal('monthly')}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedDetail.month} 종합 리포트</h3>
              <button className="close-btn" onClick={() => setActiveModal('monthly')}>✕</button>
            </div>
            <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '10px', marginBottom: '15px', border: '1px solid #e9ecef' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
                <strong>이달 가장 잦았던 불량 자세:</strong> <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{selectedDetail.topPosture || '데이터 없음'}</span>
              </p>
            </div>
            <div style={{ background: '#e6fcf5', padding: '15px', borderRadius: '10px', fontSize: '14px', lineHeight: '1.6', border: '1px solid #b2f2bb' }}>
              <strong style={{ display: 'block', marginBottom: '8px', color: '#0ca678' }}>
                🤖 의사결정나무 AI 종합 진단
              </strong>
              {selectedDetail.feedback || 'AI 피드백 데이터가 아직 충분하지 않습니다.'}
            </div>
            <button className="modal-confirm-btn" style={{ marginTop: '20px' }} onClick={() => setActiveModal('monthly')}>
              목록으로 돌아가기
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
