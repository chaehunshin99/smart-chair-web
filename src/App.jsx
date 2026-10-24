import React, { useState, useEffect } from 'react';

export default function SmartChairApp() {
  const [domain, setDomain] = useState(
    localStorage.getItem('chair_domain') || 'https://api.smart-chair-web.site'
  );
  const [isEditingDomain, setIsEditingDomain] = useState(false);
  const [inputDomain, setInputDomain] = useState(domain);

  const [isConnected, setIsConnected] = useState(false);
  const [chairData, setChairData] = useState({
    is_seated: false,
    posture_status: '자리 비움',
    posture_score: 0,
    tilt_warning: false,
    sensors: [0, 0, 0, 0, 0, 0, 0, 0, 0]
  });

  const [sittingSeconds, setSittingSeconds] = useState(0);
  
  // 모달(팝업창) 상태 관리
  const [activeModal, setActiveModal] = useState(null); // 'calibrate', 'daily', 'monthly'
  const [calibStep, setCalibStep] = useState(0);

  const saveDomain = () => {
    let cleanDomain = inputDomain.trim();
    if (cleanDomain.endsWith('/')) cleanDomain = cleanDomain.slice(0, -1);
    if (!cleanDomain.startsWith('http')) cleanDomain = 'https://' + cleanDomain;
    
    setDomain(cleanDomain);
    localStorage.setItem('chair_domain', cleanDomain);
    setIsEditingDomain(false);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${domain}/api/live-status`, { headers: { 'Accept': 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          setChairData(data);
          setIsConnected(true);
          if (data.is_seated || data.isSeated) {
            setSittingSeconds(prev => prev + 1);
          }
        } else {
          setIsConnected(false);
        }
      } catch (err) {
        setIsConnected(false);
      }
    };
    fetchData();
    const timer = setInterval(fetchData, 1000);
    return () => clearInterval(timer);
  }, [domain]);

  const formatTime = (totalSec) => {
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}분 ${sec}초`;
  };

  // 측정(캘리브레이션) 시뮬레이션
  const handleCalibrate = () => {
    if (calibStep >= 3) {
      setActiveModal(null);
      setCalibStep(0);
      alert('바른 자세 기준값이 성공적으로 저장되었습니다!');
      return;
    }
    setCalibStep(prev => prev + 1);
  };

  return (
    <div style={{ maxWidth: '420px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif', position: 'relative' }}>
      
      {/* 1. 상단: 연결 상태 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <span style={{ 
          padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold',
          backgroundColor: isConnected ? '#e6f7ed' : '#fff1f0',
          color: isConnected ? '#1e7e34' : '#d93025'
        }}>
          {isConnected ? '● 모니터링 활성' : '● 연결 대기중'}
        </span>
        <button onClick={() => setIsEditingDomain(true)} style={{ fontSize: '12px', padding: '5px 8px' }}>⚙️ 주소</button>
      </div>

      {isEditingDomain && (
        <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '10px', marginBottom: '15px' }}>
          <input style={{ width: '90%', padding: '6px', marginBottom: '8px' }} value={inputDomain} onChange={(e) => setInputDomain(e.target.value)} />
          <div>
            <button onClick={saveDomain} style={{ marginRight: '5px' }}>저장</button>
            <button onClick={() => setIsEditingDomain(false)}>취소</button>
          </div>
        </div>
      )}

      {/* 2. 타이머 */}
      <div style={{ textAlign: 'center', margin: '15px 0' }}>
        <h2 style={{ margin: '0 0 5px 0' }}>{new Date().toLocaleDateString('ko-KR')}</h2>
        <p style={{ color: '#666', margin: 0 }}>총 착석 시간: <strong>{formatTime(sittingSeconds)}</strong></p>
      </div>

      {/* 3. 실시간 점수판 */}
      <div style={{ background: chairData.tilt_warning ? '#fff3cd' : '#eafaf1', padding: '20px', borderRadius: '15px', textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ color: chairData.tilt_warning ? '#856404' : '#2d6a4f', fontSize: '14px' }}>실시간 자세 점수</div>
        <div style={{ fontSize: '42px', fontWeight: 'bold', color: chairData.tilt_warning ? '#856404' : '#1b4332' }}>
          {chairData.is_seated ? `${chairData.posture_score}점` : '-'}
        </div>
        <div style={{ marginTop: '8px', fontSize: '15px', color: '#555' }}>
          상태: <strong style={{ color: chairData.tilt_warning ? '#d32f2f' : '#388e3c' }}>{chairData.posture_status}</strong>
        </div>
      </div>

      {/* 4. 방석 그래픽 */}
      <div style={{ textAlign: 'center', marginBottom: '25px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', width: '200px', margin: '0 auto', background: '#f1f3f5', padding: '12px', borderRadius: '12px' }}>
          {chairData.sensors.map((val, idx) => {
            let bgColor = '#ced4da'; 
            if (val >= 150) bgColor = '#40c057';
            else if (val >= 50) bgColor = '#b2f2bb';
            return (
              <div key={idx} style={{ height: '55px', borderRadius: '8px', backgroundColor: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: bgColor === '#ced4da' ? '#868e96' : '#fff', fontWeight: 'bold', fontSize: '11px', transition: 'background-color 0.3s' }}>
                {val}
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. AI 메뉴 버튼들 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button onClick={() => {setActiveModal('calibrate'); setCalibStep(0);}} style={{ padding: '12px', borderRadius: '8px', background: '#4263eb', color: 'white', border: 'none', fontWeight: 'bold', fontSize: '15px' }}>
          🎯 내 몸에 맞게 바른 자세 측정 (총 3회)
        </button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setActiveModal('daily')} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#f8f9fa', border: '1px solid #dee2e6', fontWeight: 'bold' }}>
            📊 오늘의 세부 데이터
          </button>
          <button onClick={() => setActiveModal('monthly')} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#f8f9fa', border: '1px solid #dee2e6', fontWeight: 'bold' }}>
            📅 월간 통계 및 피드백
          </button>
        </div>
      </div>

      {/* --- 모달 (팝업창) 디자인 --- */}
      {activeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 }}>
          <div style={{ background: 'white', width: '85%', maxWidth: '350px', borderRadius: '15px', padding: '25px', boxSizing: 'border-box' }}>
            
            {/* 캘리브레이션 창 */}
            {activeModal === 'calibrate' && (
              <div style={{ textAlign: 'center' }}>
                <h3>기준 자세 학습 ({calibStep}/3)</h3>
                <p style={{ color: '#555', fontSize: '14px', lineHeight: '1.5' }}>
                  {calibStep === 0 ? "의사결정나무 AI가 회원님의 체형을 학습합니다.\n허리를 펴고 바르게 앉아주세요." : `${calibStep}회차 측정 중입니다... 잠시 자세를 유지해 주세요.`}
                </p>
                <button onClick={handleCalibrate} style={{ width: '100%', padding: '12px', marginTop: '15px', background: '#4263eb', color: 'white', borderRadius: '8px', border: 'none' }}>
                  {calibStep === 0 ? "측정 시작" : "다음 단계로"}
                </button>
              </div>
            )}

            {/* 일간 통계 창 */}
            {activeModal === 'daily' && (
              <div>
                <h3 style={{ margin: '0 0 15px 0' }}>오늘의 세부 데이터</h3>
                <div style={{ background: '#f1f3f5', padding: '15px', borderRadius: '10px', marginBottom: '15px', fontSize: '14px' }}>
                  <p><strong>가장 많이 감지된 자세:</strong> 우측 쏠림 (42%)</p>
                  <p><strong>바른 자세 유지 비율:</strong> 35%</p>
                </div>
                <div style={{ background: '#e6fcf5', padding: '15px', borderRadius: '10px', fontSize: '13px', lineHeight: '1.6' }}>
                  <strong>🤖 AI 맞춤 피드백</strong><br/>
                  "오늘은 우측 쏠림 자세가 가장 많았습니다. 의사결정나무 분석 결과, 우측 허벅지(3번, 6번 센서)에 평균보다 40% 높은 하중이 집중되었습니다. 다리를 꼬는 습관을 점검해 보세요!"
                </div>
                <button onClick={() => setActiveModal(null)} style={{ width: '100%', padding: '10px', marginTop: '20px', borderRadius: '8px', border: '1px solid #ccc', background: 'white' }}>닫기</button>
              </div>
            )}

            {/* 월간 통계 창 */}
            {activeModal === 'monthly' && (
              <div>
                <h3 style={{ margin: '0 0 15px 0' }}>월간 자세 리포트</h3>
                <div style={{ background: '#f1f3f5', padding: '15px', borderRadius: '10px', marginBottom: '15px', fontSize: '14px' }}>
                  <p><strong>월 평균 점수:</strong> 82점 (전월 대비 ▲ 5점)</p>
                  <p><strong>위험 알림 횟수:</strong> 총 14회 (▼ 8회 감소)</p>
                </div>
                <div style={{ background: '#e6fcf5', padding: '15px', borderRadius: '10px', fontSize: '13px', lineHeight: '1.6' }}>
                  <strong>🤖 AI 종합 진단</strong><br/>
                  "첫째 주 대비 넷째 주의 바른 자세 비율이 20% 상승했습니다. 특히 골반 불균형 수치가 눈에 띄게 개선되었습니다. 앞으로도 이 자세를 유지해 주세요!"
                </div>
                <button onClick={() => setActiveModal(null)} style={{ width: '100%', padding: '10px', marginTop: '20px', borderRadius: '8px', border: '1px solid #ccc', background: 'white' }}>닫기</button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
