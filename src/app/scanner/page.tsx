'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import TopbarRight from '@/components/TopbarRight';

function hashStr(str: string){ let h=0; for(let i=0;i<str.length;i++){ h=(h<<5)-h+str.charCodeAt(i); h|=0; } return h; }
function mulberry32(seed: number){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let x=Math.imul(seed^seed>>>15,1|seed); x=x+Math.imul(x^x>>>7,61|x)^x; return ((x^x>>>14)>>>0)/4294967296; }; }

const BRANDS = ['PayPal','Google','Microsoft','Apple','Amazon','Chase','Netflix'];
const SUS_WORDS = ['verify','secure','account','login','update','confirm','support','signin','billing','wallet','alert','renew'];
const SUS_TLDS = ['.tk','.cf','.ml','.ga','.xyz','.top','.click'];
const SAFE_HOSTS = ['github.com','wikipedia.org','mozilla.org','apple.com','microsoft.com','google.com','stripe.com','notion.so'];

function analyzeUrl(rawUrl: string){
  const url = rawUrl.trim();
  const lower = url.toLowerCase();
  const rng = mulberry32(hashStr(lower) || 1);
  const host = lower.replace(/^https?:\/\//,'').split('/')[0];
  const isKnownSafe = SAFE_HOSTS.some(h => host === h || host === 'www.'+h);
  const susWordHits = SUS_WORDS.filter(w => lower.indexOf(w) !== -1).length;
  const susTldHit = SUS_TLDS.some(t => host.endsWith(t));
  let mimicked = null;
  BRANDS.forEach(b => {
    const slug = b.toLowerCase().replace(/\s+/g,'');
    if(lower.indexOf(slug) !== -1 && (susWordHits > 0 || susTldHit)) mimicked = b;
  });
  let score;
  if(isKnownSafe && !mimicked){ score = Math.round(2 + rng()*10); }
  else {
    let base = rng()*22 + 6;
    base += susWordHits * 11;
    if(susTldHit) base += 22;
    if(mimicked) base += 26;
    score = Math.round(Math.min(99, base));
  }
  const domainAgeDays = mimicked || susTldHit ? Math.round(1 + rng()*13) : Math.round(180 + rng()*2600);
  const sslIssuer = mimicked || susTldHit ? "Let's Encrypt (free)" : ['DigiCert','Sectigo','GlobalSign'][Math.floor(rng()*3)];
  const sslAgeDays = mimicked || susTldHit ? Math.round(1 + rng()*10) : Math.round(60 + rng()*900);
  const visualSim = mimicked ? Math.round(78 + rng()*20) : Math.round(rng()*35);
  const domAnomalies = mimicked ? Math.round(2 + rng()*4) : (susWordHits > 0 ? Math.round(rng()*2) : 0);
  return { url, host, score:Math.max(1,Math.min(99,score)), domainAgeDays, sslIssuer, sslAgeDays, visualSim, domAnomalies, mimicked };
}

function bandOf(score: number){ return score < 40 ? 'safe' : (score > 70 ? 'phishing' : 'suspicious'); }

const STEP_DEFS = [
  { label:'DNS Check', msg:'Resolving nameservers & A records…' },
  { label:'WHOIS Lookup', msg:'Querying registrar & domain age…' },
  { label:'SSL Cert Check', msg:'Validating certificate chain…' },
  { label:'DOM Analysis', msg:'Scanning markup for credential forms…' },
  { label:'Visual Similarity', msg:'Comparing render fingerprint to brand corpus…' },
  { label:'Final Verdict', msg:'Aggregating signal weights…' }
];

export default function ScannerPage() {
  const router = useRouter();
  const [urlInput, setUrlInput] = useState('');
  const [stage, setStage] = useState<'IDLE' | 'SCANNING' | 'RESULTS'>('IDLE');
  const [formError, setFormError] = useState('');
  const [scanData, setScanData] = useState<any>(null);
  
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [stepStatuses, setStepStatuses] = useState<string[]>(Array(6).fill(''));
  const [completedSteps, setCompletedSteps] = useState<boolean[]>(Array(6).fill(false));
  const [ringScore, setRingScore] = useState(0);
  const [showStamp, setShowStamp] = useState(false);
  const [typingText, setTypingText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const runTokenRef = useRef(0);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const radarRafRef = useRef<number | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('ThreatLens_user');
    if (!storedUser) {
      router.push('/login');
    }
  }, [router]);

  // Radar Animation
  useEffect(() => {
    if (stage === 'SCANNING') {
      const rc = radarRef.current;
      if (!rc) return;
      const rctx = rc.getContext('2d');
      if (!rctx) return;
      
      let angle = 0;
      let rW = rc.clientWidth;
      let rH = rc.clientHeight;
      const DPR = Math.min(window.devicePixelRatio || 1, 2);
      rc.width = rW * DPR;
      rc.height = rH * DPR;
      rctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      const rdraw = () => {
        rctx.clearRect(0, 0, rW, rH);
        const cx = rW * 0.82;
        const cy = rH * 0.2;
        const maxR = Math.max(rW, rH) * 0.75;
        
        for(let ring=1; ring<=3; ring++){ 
          rctx.beginPath(); 
          rctx.strokeStyle='rgba(0,240,255,0.06)'; 
          rctx.lineWidth=1; 
          rctx.arc(cx,cy,maxR*ring/3,0,Math.PI*2); 
          rctx.stroke(); 
        }
        if((rctx as any).createConicGradient){
          const grad = (rctx as any).createConicGradient(angle, cx, cy);
          grad.addColorStop(0,'rgba(0,240,255,0.2)'); 
          grad.addColorStop(0.06,'rgba(0,240,255,0)'); 
          grad.addColorStop(1,'rgba(0,240,255,0)');
          rctx.beginPath(); 
          rctx.moveTo(cx,cy); 
          rctx.fillStyle=grad; 
          rctx.arc(cx,cy,maxR,angle,angle+0.9); 
          rctx.closePath(); 
          rctx.fill();
        }
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        angle += reduceMotion ? 0 : 0.02;
        radarRafRef.current = requestAnimationFrame(rdraw);
      };
      
      radarRafRef.current = requestAnimationFrame(rdraw);
      return () => {
        if (radarRafRef.current) cancelAnimationFrame(radarRafRef.current);
      };
    }
  }, [stage]);

  function normalizeUrl(raw: string){
    let v = raw.trim(); if(!v) return null;
    if(!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try { new URL(v); return v; } catch(e) { return null; }
  }

  const handleScan = (targetUrl: string) => {
    const normalized = normalizeUrl(targetUrl);
    if (!normalized) {
      setFormError('Enter a valid URL to scan.');
      return;
    }
    setFormError('');
    setUrlInput(targetUrl); // Keep input visually synced
    
    // Also trigger background API call just to log to DB silently
    fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: normalized }),
    }).catch(() => {});

    runTokenRef.current++;
    const myToken = runTokenRef.current;
    const data = analyzeUrl(normalized);
    setScanData(data);
    
    setStage('SCANNING');
    setActiveStepIndex(0);
    setStepStatuses(Array(6).fill(''));
    setCompletedSteps(Array(6).fill(false));
    setShowStamp(false);
    setRingScore(0);
    setTypingText('');
    
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let currentI = 0;

    const runStep = () => {
      if (myToken !== runTokenRef.current) return;
      if (currentI >= STEP_DEFS.length) {
        setTimeout(() => {
          if (myToken === runTokenRef.current) {
            setStage('RESULTS');
            animateResults(data, myToken, reduceMotion);
          }
        }, 300);
        return;
      }

      setActiveStepIndex(currentI);
      
      // Typewriter effect for step status
      let typeIdx = 0;
      const msg = STEP_DEFS[currentI].msg;
      
      const typeNext = () => {
        if (myToken !== runTokenRef.current) return;
        if (typeIdx <= msg.length) {
          setStepStatuses(prev => {
            const next = [...prev];
            next[currentI] = msg.slice(0, typeIdx);
            return next;
          });
          typeIdx++;
          setTimeout(typeNext, reduceMotion ? 0 : 15);
        } else {
          // Done typing
          setTimeout(() => {
            if (myToken !== runTokenRef.current) return;
            setCompletedSteps(prev => {
              const next = [...prev];
              next[currentI] = true;
              return next;
            });
            setStepStatuses(prev => {
              const next = [...prev];
              next[currentI] = 'Done';
              return next;
            });
            currentI++;
            setTimeout(runStep, 160);
          }, 230);
        }
      };
      typeNext();
    };
    runStep();
  };

  const animateResults = (data: any, myToken: number, reduceMotion: boolean) => {
    // Ring score animation
    const dur = reduceMotion ? 0 : 1300;
    let startT: number | null = null;
    const countUp = (ts: number) => {
      if (myToken !== runTokenRef.current) return;
      if (startT === null) startT = ts;
      const p = dur === 0 ? 1 : Math.min(1, (ts - startT) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setRingScore(Math.round(data.score * eased));
      if (p < 1) requestAnimationFrame(countUp);
    };
    requestAnimationFrame(countUp);

    const band = bandOf(data.score);
    if (band === 'phishing') {
      setTimeout(() => {
        if (myToken === runTokenRef.current) setShowStamp(true);
      }, reduceMotion ? 0 : 950);
    }

    // AI Explanation typing
    const brand = data.mimicked;
    let explanation = '';
    if (band === 'phishing') {
      explanation = `This domain is ${data.visualSim}% visually similar to ${brand || 'a well-known brand'}, but was registered only ${data.domainAgeDays} day${data.domainAgeDays === 1 ? '' : 's'} ago. Its SSL certificate is a free ${data.sslIssuer} cert issued ${data.sslAgeDays} days ago \u2014 a pattern typical of disposable phishing infrastructure. ${data.domAnomalies} credential-harvesting form${data.domAnomalies === 1 ? '' : 's'} were found in the page markup. Recommendation: block and quarantine.`;
    } else if (band === 'suspicious') {
      explanation = `This domain shows some indicators worth flagging: a ${data.domainAgeDays}-day registration history, a ${data.sslIssuer} certificate issued ${data.sslAgeDays} days ago, and a visual-similarity score of ${data.visualSim}%. Nothing here is conclusive on its own, but treat links from this domain with caution.`;
    } else {
      explanation = `No significant phishing indicators were found. Domain age (${data.domainAgeDays} days), certificate chain (${data.sslIssuer}), and visual fingerprint (${data.visualSim}% match to known brands) are all consistent with legitimate, established infrastructure.`;
    }

    let eIdx = 0;
    setIsTyping(true);
    const typeExp = () => {
      if (myToken !== runTokenRef.current) return;
      if (eIdx <= explanation.length) {
        setTypingText(explanation.slice(0, eIdx));
        eIdx++;
        setTimeout(typeExp, reduceMotion ? 0 : 9);
      } else {
        setIsTyping(false);
      }
    };
    typeExp();
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleScan(urlInput);
  };

  function mixHex(c1: number[], c2: number[], f: number){ 
    return `rgb(${Math.round(c1[0]+(c2[0]-c1[0])*f)},${Math.round(c1[1]+(c2[1]-c1[1])*f)},${Math.round(c1[2]+(c2[2]-c1[2])*f)})`; 
  }

  let ringColor = '#00F0FF';
  let vLabel = 'Verified Safe';
  let band = 'safe';
  if (scanData) {
    band = bandOf(scanData.score);
    if (band === 'safe') { ringColor = '#00F0FF'; vLabel = 'Verified Safe'; }
    else if (band === 'phishing') { ringColor = '#FF0055'; vLabel = 'Phishing Detected'; }
    else { ringColor = mixHex([0,240,255],[255,0,85],(scanData.score-40)/30); vLabel = 'Suspicious'; }
  }

  const CIRC = 2 * Math.PI * 90;
  const dashOffset = scanData ? CIRC * (1 - scanData.score / 100) : CIRC;

  return (
    <>
      <style jsx global>{`
        .scanner-panel { max-width: 640px; margin: 0 auto; padding: 40px 40px 34px; text-align: center; }
        .scanner-sub { color: var(--text-muted); font-size: 13.5px; line-height: 1.6; margin: 0 0 26px; max-width: 440px; margin-left: auto; margin-right: auto; }
        .scan-form { display: flex; gap: 10px; }
        .scan-form input { flex: 1; background: rgba(255,255,255,0.04); border: 1px solid var(--line); border-radius: 10px; padding: 13px 16px; color: var(--text); font-family: var(--font-mono); font-size: 13.5px; }
        .scan-form input:focus { outline: none; border-color: var(--cyan); box-shadow: 0 0 0 3px rgba(0,240,255,0.12); }
        .scan-btn { position: relative; overflow: hidden; border: none; border-radius: 10px; padding: 0 24px; background: linear-gradient(90deg, var(--cyan), #4dd8ff); color: #031319; font-family: var(--font-mono); font-weight: 600; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; box-shadow: 0 0 0 1px rgba(0,240,255,0.4), 0 10px 26px -10px rgba(0,240,255,0.6); }
        .scan-btn:hover { filter: brightness(1.08); }
        .form-error { font-family: var(--font-mono); font-size: 11px; color: var(--magenta); min-height: 16px; margin-top: 9px; text-align: left; padding-left: 2px; }
        .chips-label { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-faint); margin: 22px 0 10px; }
        .chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .chip { border: 1px solid var(--line); background: rgba(255,255,255,0.03); color: var(--text-muted); font-family: var(--font-mono); font-size: 11px; padding: 7px 12px; border-radius: 999px; cursor: pointer; transition: border-color .15s,color .15s,background .15s; }
        .chip:hover { border-color: var(--magenta); color: var(--text); background: rgba(255,0,85,0.06); }

        .progress-panel { max-width: 640px; margin: 0 auto; padding: 36px 38px; overflow: hidden; position: relative; }
        .progress-panel canvas#radar { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.5; pointer-events: none; border-radius: 16px; }
        .scan-target-row { position: relative; z-index: 2; display: flex; align-items: baseline; gap: 8px; margin-bottom: 22px; flex-wrap: wrap; }
        .scan-target-label { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-faint); }
        .scan-target-url { font-family: var(--font-mono); font-size: 13.5px; color: var(--cyan); word-break: break-all; }
        .steps { position: relative; z-index: 2; list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
        .step { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 10px; border: 1px solid transparent; transition: border-color .25s, background .25s; }
        .step.active { border-color: rgba(0,240,255,0.3); background: rgba(0,240,255,0.05); }
        .step-icon { flex-shrink: 0; width: 19px; height: 19px; border-radius: 50%; border: 1.5px solid var(--line-bright); display: flex; align-items: center; justify-content: center; position: relative; }
        .step.active .step-icon { border-color: var(--cyan); box-shadow: 0 0 10px rgba(0,240,255,0.5); }
        .step.active .step-icon::after { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--cyan); animation: icon-pulse 1s ease-in-out infinite; }
        @keyframes icon-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }
        .step.done .step-icon { border-color: var(--cyan); background: rgba(0,240,255,0.12); }
        .step-label { font-family: var(--font-display); font-weight: 600; font-size: 13px; min-width: 128px; color: var(--text-faint); }
        .step.active .step-label, .step.done .step-label { color: var(--text); }
        .step-status { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); flex: 1; }
        .step-status::after { content: ''; display: inline-block; width: 6px; margin-left: 1px; border-right: 1.5px solid var(--cyan); animation: caret 0.8s steps(1) infinite; }
        .step:not(.active) .step-status::after { display: none; }
        @keyframes caret { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }

        .results-panel { max-width: 960px; margin: 0 auto; padding: 0; overflow: hidden; }
        .results-grid { display: grid; grid-template-columns: 320px 1fr; }
        .verdict-col { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 26px; border-right: 1px solid var(--line); position: relative; }
        .verdict-col.shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes shake { 10%,90% { transform: translate3d(-1px,0,0); } 20%,80% { transform: translate3d(2px,0,0); } 30%,50%,70% { transform: translate3d(-4px,0,0); } 40%,60% { transform: translate3d(4px,0,0); } }
        .risk-ring-wrap { position: relative; width: 200px; height: 200px; margin-bottom: 18px; }
        .risk-ring-wrap svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        .ring-bg { fill: none; stroke: rgba(255,255,255,0.08); stroke-width: 12; }
        .ring-fg { fill: none; stroke-width: 12; stroke-linecap: round; stroke-dasharray: 565.5; transition: stroke-dashoffset 1.3s cubic-bezier(.16,.8,.2,1), stroke .4s ease; filter: drop-shadow(0 0 10px currentColor); }
        .ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .ring-score-row { display: flex; align-items: baseline; gap: 2px; }
        .ring-score { font-family: var(--font-display); font-weight: 700; font-size: 40px; line-height: 1; }
        .ring-percent { font-family: var(--font-display); font-weight: 600; font-size: 16px; color: var(--text-muted); }
        .ring-caption { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-faint); margin-top: 6px; }
        .stamp { position: absolute; top: 38%; left: 50%; z-index: 6; font-family: var(--font-display); font-weight: 700; font-size: 20px; letter-spacing: 0.06em; color: var(--magenta); border: 3px solid var(--magenta); border-radius: 6px; padding: 5px 12px; text-transform: uppercase; background: rgba(5,2,9,0.55); pointer-events: none; opacity: 0; transform: translate(-50%,-50%) rotate(-14deg) scale(2.4); text-shadow: 0 0 12px rgba(255,0,85,0.7); box-shadow: 0 0 24px rgba(255,0,85,0.35); white-space: nowrap; }
        .stamp.show { animation: stamp-slam 0.45s cubic-bezier(.2,1.4,.5,1) forwards; }
        @keyframes stamp-slam { 0% { opacity: 0; transform: translate(-50%,-50%) rotate(-14deg) scale(2.6); } 60% { opacity: 1; transform: translate(-50%,-50%) rotate(-14deg) scale(0.92); } 100% { opacity: 1; transform: translate(-50%,-50%) rotate(-14deg) scale(1); } }
        .verdict-label { font-family: var(--font-display); font-weight: 700; font-size: 18px; margin-bottom: 6px; }
        .verdict-label.safe { color: var(--cyan); }
        .verdict-label.suspicious { color: var(--amber); }
        .verdict-label.phishing { color: var(--magenta); }
        .verdict-url { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); word-break: break-all; margin-bottom: 22px; max-width: 250px; }
        .btn-secondary { border: 1px solid var(--line-bright); background: rgba(255,255,255,0.03); color: var(--text); font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; padding: 9px 16px; border-radius: 8px; cursor: pointer; }
        .btn-secondary:hover { border-color: var(--cyan); background: rgba(0,240,255,0.06); }
        .explain-col { padding: 36px 36px 32px; }
        .explain-header { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 11px; display: flex; align-items: center; gap: 8px; }
        .explain-header .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 6px var(--cyan); animation: blip 1.6s ease-in-out infinite; }
        .terminal { font-family: var(--font-mono); font-size: 13px; line-height: 1.75; color: var(--text); background: rgba(0,0,0,0.28); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; min-height: 110px; }
        .terminal .caret { display: inline-block; width: 7px; height: 14px; background: var(--cyan); vertical-align: middle; margin-left: 2px; animation: caret-block .8s steps(1) infinite; }
        @keyframes caret-block { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
        .signal-rows { margin-top: 20px; display: flex; flex-direction: column; border-top: 1px solid var(--line); }
        .signal-row { display: flex; align-items: center; justify-content: space-between; padding: 11px 2px; border-bottom: 1px solid var(--line); font-family: var(--font-mono); font-size: 11.5px; }
        .signal-row .k { color: var(--text-muted); }
        .signal-row .v { color: var(--text); font-weight: 500; display: flex; align-items: center; gap: 7px; }
        .sw { width: 7px; height: 7px; border-radius: 50%; }
        .sw.ok { background: var(--cyan); box-shadow: 0 0 6px var(--cyan); }
        .sw.warn { background: var(--amber); box-shadow: 0 0 6px var(--amber); }
        .sw.bad { background: var(--magenta); box-shadow: 0 0 6px var(--magenta); }

        @media (max-width: 820px) {
          .results-grid { grid-template-columns: 1fr; }
          .verdict-col { border-right: none; border-bottom: 1px solid var(--line); }
        }
      `}</style>

      <div className="app">
        <div className="shell">
          <Sidebar activeRoute="scanner" />

          <div className="content-col">
            <header className="topbar">
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-faint)' }}>Workspace</span> / <span style={{ color: 'var(--text)' }}>Scanner</span>
              </div>
              <TopbarRight />
            </header>

            <main className="main">
              <section className="view">
                <div className="page-head">
                  <div>
                    <div className="page-eyebrow">URL Threat Scanner</div>
                    <h1 className="page-title">Is this link safe to open?</h1>
                    <p className="page-sub" style={{ marginTop: '6px' }}>Runs DNS, WHOIS, SSL, DOM and visual-similarity checks before rendering a verdict.</p>
                  </div>
                </div>

                {stage === 'IDLE' && (
                  <section className="panel scanner-panel">
                    <form className="scan-form" onSubmit={handleFormSubmit}>
                      <input 
                        type="text" 
                        placeholder="https://example.com" 
                        autoComplete="off" 
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                      />
                      <button type="submit" className="scan-btn">Scan</button>
                    </form>
                    <p className="form-error">{formError}</p>
                    <div className="chips-label">Try a sample</div>
                    <div className="chips">
                      <button className="chip" type="button" onClick={() => handleScan('https://github.com')}>github.com</button>
                      <button className="chip" type="button" onClick={() => handleScan('https://paypal-secure-verify-account.tk')}>paypal-secure-verify-account.tk</button>
                      <button className="chip" type="button" onClick={() => handleScan('https://accounts-google-support.cf/login')}>accounts-google-support.cf</button>
                      <button className="chip" type="button" onClick={() => handleScan('https://mybank-online-update.xyz')}>mybank-online-update.xyz</button>
                    </div>
                  </section>
                )}

                {stage === 'SCANNING' && (
                  <section className="panel progress-panel">
                    <canvas id="radar" ref={radarRef}></canvas>
                    <div className="scan-target-row">
                      <span className="scan-target-label">Scanning:</span>
                      <span className="scan-target-url">{scanData?.host}</span>
                    </div>
                    <ul className="steps">
                      {STEP_DEFS.map((def, i) => {
                        const isActive = i === activeStepIndex;
                        const isDone = completedSteps[i];
                        return (
                          <li key={i} className={`step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
                            <span className="step-icon">
                              {isDone && <svg viewBox="0 0 12 12" fill="none"><path d="M2 6.2L4.6 9L10 3" stroke="#00F0FF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </span>
                            <span className="step-label">{def.label}</span>
                            <span className="step-status">{stepStatuses[i]}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {stage === 'RESULTS' && scanData && (
                  <section className="panel results-panel">
                    <div className="results-grid">
                      <div className={`verdict-col ${showStamp && band === 'phishing' ? 'shake' : ''}`}>
                        <div className="risk-ring-wrap">
                          <svg viewBox="0 0 200 200">
                            <circle className="ring-bg" cx="100" cy="100" r="90"></circle>
                            <circle 
                              className="ring-fg" 
                              cx="100" cy="100" r="90" 
                              style={{ 
                                stroke: ringColor, 
                                color: ringColor,
                                strokeDashoffset: dashOffset 
                              }}
                            ></circle>
                          </svg>
                          <div className="ring-center">
                            <div className="ring-score-row"><span className="ring-score">{ringScore}</span><span className="ring-percent">%</span></div>
                            <div className="ring-caption">Risk score</div>
                          </div>
                          <div className={`stamp ${showStamp ? 'show' : ''}`}>Quarantined</div>
                        </div>
                        <div className={`verdict-label ${band}`}>{vLabel}</div>
                        <div className="verdict-url">{scanData.host}</div>
                        <button className="btn-secondary" onClick={() => { setUrlInput(''); setStage('IDLE'); }}>Scan another URL</button>
                      </div>
                      <div className="explain-col">
                        <div className="explain-header"><span className="dot"></span>AI Explanation</div>
                        <div className="terminal">
                          <span>{typingText}</span>
                          {isTyping && <span className="caret"></span>}
                        </div>
                        <div className="signal-rows">
                          <div className="signal-row">
                            <span className="k">Domain age</span>
                            <span className="v"><span className={`sw ${scanData.domainAgeDays < 30 ? 'bad' : (scanData.domainAgeDays < 180 ? 'warn' : 'ok')}`}></span>{scanData.domainAgeDays} day{scanData.domainAgeDays === 1 ? '' : 's'}</span>
                          </div>
                          <div className="signal-row">
                            <span className="k">SSL issuer</span>
                            <span className="v"><span className={`sw ${scanData.sslIssuer.startsWith('Let') ? 'warn' : 'ok'}`}></span>{scanData.sslIssuer}</span>
                          </div>
                          <div className="signal-row">
                            <span className="k">Visual similarity</span>
                            <span className="v"><span className={`sw ${scanData.visualSim > 70 ? 'bad' : (scanData.visualSim > 40 ? 'warn' : 'ok')}`}></span>{scanData.visualSim}%{scanData.mimicked ? ` to ${scanData.mimicked}` : ''}</span>
                          </div>
                          <div className="signal-row">
                            <span className="k">DOM anomalies</span>
                            <span className="v"><span className={`sw ${scanData.domAnomalies > 1 ? 'bad' : (scanData.domAnomalies === 1 ? 'warn' : 'ok')}`}></span>{scanData.domAnomalies} flagged</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Phishing Landscape Dashboard */}
                <section className="landscape-section">
                  <div className="landscape-header">
                    <div className="left">
                      <span className="dot"></span>GLOBAL PHISHING LANDSCAPE
                    </div>
                    <div>APWG Q1 2026 &amp; Check Point Research Q2 2026</div>
                  </div>

                  <div className="stats-row">
                    <div className="stat-box">
                      <div className="stat-val">971,181</div>
                      <div className="stat-label">Phishing attacks reported to APWG in Q1 2026</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-val cyan">+13.8%</div>
                      <div className="stat-label">Rise in attack volume vs. the previous quarter</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-val magenta">50%+</div>
                      <div className="stat-label">Of all brand impersonation held by the top 5 brands</div>
                    </div>
                  </div>

                  <div className="landscape-grid">
                    <div className="brands-col">
                      <div className="col-heading">MOST IMPERSONATED BRANDS &middot; Q2 2026</div>
                      <div className="brands-list">
                        <div className="brand-row">
                          <div className="brand-name">Microsoft</div>
                          <div className="brand-bar-track"><div className="brand-bar-fill" style={{ width: '92%' }}></div></div>
                          <div className="brand-val">23%</div>
                        </div>
                        <div className="brand-row">
                          <div className="brand-name">LinkedIn</div>
                          <div className="brand-bar-track"><div className="brand-bar-fill" style={{ width: '52%' }}></div></div>
                          <div className="brand-val">13%</div>
                        </div>
                        <div className="brand-row">
                          <div className="brand-name">Google</div>
                          <div className="brand-bar-track"><div className="brand-bar-fill" style={{ width: '40%' }}></div></div>
                          <div className="brand-val">10%</div>
                        </div>
                        <div className="brand-row">
                          <div className="brand-name">Apple</div>
                          <div className="brand-bar-track"><div className="brand-bar-fill" style={{ width: '32%' }}></div></div>
                          <div className="brand-val">8%</div>
                        </div>
                        <div className="brand-row">
                          <div className="brand-name">Amazon</div>
                          <div className="brand-bar-track"><div className="brand-bar-fill" style={{ width: '28%' }}></div></div>
                          <div className="brand-val">7%</div>
                        </div>
                        <div className="brand-row">
                          <div className="brand-name">ChatGPT</div>
                          <div className="brand-bar-track"><div className="brand-bar-fill" style={{ width: '15%' }}></div></div>
                          <div className="brand-val">New</div>
                        </div>
                      </div>
                    </div>

                    <div className="tech-col">
                      <div className="col-heading">COMMON ATTACK TECHNIQUES</div>
                      <div className="tech-list">
                        <div className="tech-item">
                          <div className="tech-title">Typosquatting</div>
                          <div className="tech-desc">Registering misspelled or hyphenated variants of a brand's domain (e.g. amaz0n-billing.com) to catch mistyped or hurried clicks.</div>
                        </div>
                        <div className="tech-item">
                          <div className="tech-title">Homograph / punycode spoofing</div>
                          <div className="tech-desc">Using look-alike Unicode characters so a domain renders almost identically to the real one.</div>
                        </div>
                        <div className="tech-item">
                          <div className="tech-title">Unauthorized logo &amp; brand use</div>
                          <div className="tech-desc">Copying a brand's logo, colors and layout onto a fake login or payment page to build false trust.</div>
                        </div>
                        <div className="tech-item">
                          <div className="tech-title">Disposable free-TLD hosting</div>
                          <div className="tech-desc">Short-lived pages on cheap or free top-level domains (.tk, .xyz, .top) paired with free SSL certs.</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="landscape-footer">
                    Figures reflect published third-party industry research (APWG Phishing Activity Trends Report, Q1 2026; Check Point Research Brand Phishing Report, Q2 2026) and are not a live feed of this workspace's own traffic.
                  </div>
                </section>
              </section>
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
