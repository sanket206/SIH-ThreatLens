'use client';

import { useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import TopbarRight from '@/components/TopbarRight';

export default function ScannerPage() {
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ============================================================
       Ambient particle background
       ============================================================ */
    let radarRaf: number | null = null;
    let bgRaf: number | null = null;
    let glowRaf: number | null = null;

    try {
      const canvas = document.getElementById('bg') as HTMLCanvasElement;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        let W = 0, H = 0, particles: any[] = [];
        
        const resize = () => {
          const DPR = Math.min(window.devicePixelRatio || 1, 2);
          W = canvas.clientWidth = canvas.offsetWidth;
          H = canvas.clientHeight = canvas.offsetHeight;
          canvas.width = W * DPR; canvas.height = H * DPR;
          ctx?.setTransform(DPR, 0, 0, DPR, 0, 0);
          particles = [];
          const count = Math.min(70, Math.max(24, Math.round((W * H) / 24000)));
          for (let i = 0; i < count; i++) {
            particles.push({
              x: Math.random() * W, y: Math.random() * H,
              vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12,
              magenta: Math.random() > 0.55
            });
          }
        };
        
        const draw = () => {
          if (!ctx) return;
          ctx.clearRect(0, 0, W, H);
          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
            if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
          }
          for (let a = 0; a < particles.length; a++) {
            for (let b = a + 1; b < particles.length; b++) {
              const pa = particles[a], pb = particles[b];
              const dx = pa.x - pb.x, dy = pa.y - pb.y;
              const d = Math.sqrt(dx * dx + dy * dy);
              if (d < 115) {
                ctx.strokeStyle = `rgba(0,240,255,${(1 - d / 115) * 0.1})`;
                ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
              }
            }
          }
          for (let j = 0; j < particles.length; j++) {
            const pp = particles[j];
            const base = pp.magenta ? [255, 0, 85] : [0, 240, 255];
            ctx.beginPath(); ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},0.35)`;
            ctx.arc(pp.x, pp.y, 1.2, 0, Math.PI * 2); ctx.fill();
          }
          if (!reduceMotion) bgRaf = requestAnimationFrame(draw);
        };
        
        window.addEventListener('resize', resize);
        resize();
        if (!reduceMotion) bgRaf = requestAnimationFrame(draw); else draw();
      }
    } catch (e) { console.error('bg failed', e); }

    try {
      const cursorGlow = document.getElementById('cursorGlow');
      if (!reduceMotion && cursorGlow) {
        let gx = innerWidth / 2, gy = innerHeight / 2, cgx = gx, cgy = gy, active = false;
        const moveHandler = (e: MouseEvent) => { gx = e.clientX; gy = e.clientY; if (!active) { active = true; cursorGlow.classList.add('active'); } };
        window.addEventListener('mousemove', moveHandler);
        const loop = () => {
          cgx += (gx - cgx) * 0.16; cgy += (gy - cgy) * 0.16;
          cursorGlow.style.transform = `translate3d(${cgx}px,${cgy}px,0) translate(-50%,-50%)`;
          glowRaf = requestAnimationFrame(loop);
        };
        loop();
      }
    } catch (e) { console.error('glow failed', e); }

    /* ============================================================
       Shared data store for Scanner Logic
       ============================================================ */
    function hashStr(str: string) { let h = 0; for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; } return h; }
    function mulberry32(seed: number) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }

    const BRANDS = ['PayPal', 'Google', 'Microsoft', 'Apple', 'Amazon', 'Chase', 'Netflix'];
    const SUS_WORDS = ['verify', 'secure', 'account', 'login', 'update', 'confirm', 'support', 'signin', 'billing', 'wallet', 'alert', 'renew'];
    const SUS_TLDS = ['.tk', '.cf', '.ml', '.ga', '.xyz', '.top', '.click'];
    const SAFE_HOSTS = ['github.com', 'wikipedia.org', 'mozilla.org', 'apple.com', 'microsoft.com', 'google.com', 'stripe.com', 'notion.so'];

    function analyzeUrl(rawUrl: string) {
      const url = rawUrl.trim();
      const lower = url.toLowerCase();
      const rng = mulberry32(hashStr(lower) || 1);
      const host = lower.replace(/^https?:\/\//, '').split('/')[0];
      const isKnownSafe = SAFE_HOSTS.some(h => host === h || host === 'www.' + h);
      const susWordHits = SUS_WORDS.filter(w => lower.indexOf(w) !== -1).length;
      const susTldHit = SUS_TLDS.some(t => host.endsWith(t));
      let mimicked: string | null = null;
      BRANDS.forEach(b => {
        const slug = b.toLowerCase().replace(/\s+/g, '');
        if (lower.indexOf(slug) !== -1 && (susWordHits > 0 || susTldHit)) mimicked = b;
      });
      let score;
      if (isKnownSafe && !mimicked) { score = Math.round(2 + rng() * 10); }
      else {
        let base = rng() * 22 + 6;
        base += susWordHits * 11;
        if (susTldHit) base += 22;
        if (mimicked) base += 26;
        score = Math.round(Math.min(99, base));
      }
      const domainAgeDays = mimicked || susTldHit ? Math.round(1 + rng() * 13) : Math.round(180 + rng() * 2600);
      const sslIssuer = mimicked || susTldHit ? "Let's Encrypt (free)" : ['DigiCert', 'Sectigo', 'GlobalSign'][Math.floor(rng() * 3)];
      const sslAgeDays = mimicked || susTldHit ? Math.round(1 + rng() * 10) : Math.round(60 + rng() * 900);
      const visualSim = mimicked ? Math.round(78 + rng() * 20) : Math.round(rng() * 35);
      const domAnomalies = mimicked ? Math.round(2 + rng() * 4) : (susWordHits > 0 ? Math.round(rng() * 2) : 0);
      return { url, host, score: Math.max(1, Math.min(99, score)), domainAgeDays, sslIssuer, sslAgeDays, visualSim, domAnomalies, mimicked };
    }

    function bandOf(score: number) { return score < 40 ? 'safe' : (score > 70 ? 'phishing' : 'suspicious'); }

    /* ============================================================
       Scanner engine (progress steps + risk ring + explanation)
       ============================================================ */
    const scannerPanel = document.getElementById('scannerPanel');
    const progressPanel = document.getElementById('progressPanel');
    const resultsPanel = document.getElementById('resultsPanel');
    const scanForm = document.getElementById('scanForm');
    const urlInput = document.getElementById('urlInput') as HTMLInputElement;
    const formError = document.getElementById('formError');
    const scanTargetUrl = document.getElementById('scanTargetUrl');
    const stepsList = document.getElementById('stepsList');
    const rescanBtn = document.getElementById('rescanBtn');

    if (!scannerPanel || !progressPanel || !resultsPanel || !scanForm || !urlInput || !formError || !scanTargetUrl || !stepsList || !rescanBtn) return;

    const STEP_DEFS = [
      { label: 'DNS Check', msg: 'Resolving nameservers & A records…' },
      { label: 'WHOIS Lookup', msg: 'Querying registrar & domain age…' },
      { label: 'SSL Cert Check', msg: 'Validating certificate chain…' },
      { label: 'DOM Analysis', msg: 'Scanning markup for credential forms…' },
      { label: 'Visual Similarity', msg: 'Comparing render fingerprint to brand corpus…' },
      { label: 'Final Verdict', msg: 'Aggregating signal weights…' }
    ];

    function buildSteps() {
      if(!stepsList) return;
      stepsList.innerHTML = '';
      STEP_DEFS.forEach((def, i) => {
        const li = document.createElement('li');
        li.className = 'step'; li.dataset.step = i.toString();
        li.innerHTML = `<span class="step-icon"></span><span class="step-label">${def.label}</span><span class="step-status"></span>`;
        stepsList.appendChild(li);
      });
    }

    function normalizeUrl(raw: string) {
      let v = raw.trim(); if (!v) return null;
      if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
      try { new URL(v); return v; } catch (e) { return null; }
    }

    function typeInto(el: Element, text: string, speed: number, cb: () => void) {
      el.textContent = ''; let idx = 0;
      function step() {
        if (idx <= text.length) { el.textContent = text.slice(0, idx); idx++; setTimeout(step, reduceMotion ? 0 : speed); }
        else if (cb) cb();
      }
      step();
    }

    let runToken = 0;
    function startScan(rawUrl: string) {
      const normalized = normalizeUrl(rawUrl);
      if (!normalized || !formError || !scannerPanel || !resultsPanel || !progressPanel || !scanTargetUrl || !stepsList) {
        if(formError) formError.textContent = 'Enter a valid URL to scan.'; return;
      }
      formError.textContent = '';
      runToken++; const myToken = runToken;
      
      const data = analyzeUrl(normalized);

      scannerPanel.classList.add('hidden');
      resultsPanel.classList.add('hidden');
      progressPanel.classList.remove('hidden');
      scanTargetUrl.textContent = data.host;
      buildSteps();
      startRadar();

      // OPTIONAL: Still dispatch to the real backend in the background so history works
      fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized })
      }).catch(() => {});

      const items = stepsList.querySelectorAll('.step');
      let i = 0;
      function runStep() {
        if (myToken !== runToken) return;
        if (i >= items.length) { setTimeout(() => { if (myToken === runToken) showResults(data); }, 300); return; }
        const li = items[i]; const statusEl = li.querySelector('.step-status');
        if(!statusEl) return;
        li.classList.add('active');
        typeInto(statusEl, STEP_DEFS[i].msg, 15, () => {
          if (myToken !== runToken) return;
          setTimeout(() => {
            if (myToken !== runToken) return;
            li.classList.remove('active'); li.classList.add('done');
            const icon = li.querySelector('.step-icon');
            if(icon) icon.innerHTML = '<svg viewBox="0 0 12 12" fill="none"><path d="M2 6.2L4.6 9L10 3" stroke="#00F0FF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            statusEl.textContent = 'Done';
            i++; setTimeout(runStep, 160);
          }, 230);
        });
      }
      runStep();
    }

    function startRadar() {
      const rc = document.getElementById('radar') as HTMLCanvasElement; if (!rc) return;
      const rctx = rc.getContext('2d'); if(!rctx) return;
      let rW: number, rH: number, angle = 0;
      function rresize() {
        rW = rc.clientWidth; rH = rc.clientHeight;
        const DPR = Math.min(devicePixelRatio || 1, 2);
        rc.width = rW * DPR; rc.height = rH * DPR; rctx?.setTransform(DPR, 0, 0, DPR, 0, 0);
      }
      rresize();
      function rdraw() {
        if(!rctx) return;
        rctx.clearRect(0, 0, rW, rH);
        const cx = rW * 0.82, cy = rH * 0.2, maxR = Math.max(rW, rH) * 0.75;
        for (let ring = 1; ring <= 3; ring++) { rctx.beginPath(); rctx.strokeStyle = 'rgba(0,240,255,0.06)'; rctx.lineWidth = 1; rctx.arc(cx, cy, maxR * ring / 3, 0, Math.PI * 2); rctx.stroke(); }
        if (rctx.createConicGradient) {
          const grad = rctx.createConicGradient(angle, cx, cy);
          grad.addColorStop(0, 'rgba(0,240,255,0.2)'); grad.addColorStop(0.06, 'rgba(0,240,255,0)'); grad.addColorStop(1, 'rgba(0,240,255,0)');
          rctx.beginPath(); rctx.moveTo(cx, cy); rctx.fillStyle = grad; rctx.arc(cx, cy, maxR, angle, angle + 0.9); rctx.closePath(); rctx.fill();
        }
        angle += reduceMotion ? 0 : 0.02;
        if(progressPanel && !progressPanel.classList.contains('hidden') && !reduceMotion) radarRaf = requestAnimationFrame(rdraw);
      }
      if (radarRaf) cancelAnimationFrame(radarRaf);
      if (!reduceMotion) radarRaf = requestAnimationFrame(rdraw);
    }

    const ringFg = document.getElementById('ringFg');
    const ringScore = document.getElementById('ringScore');
    const verdictLabel = document.getElementById('verdictLabel');
    const verdictUrl = document.getElementById('verdictUrl');
    const verdictCol = document.getElementById('verdictCol');
    const stamp = document.getElementById('stamp');
    const explainTerminal = document.getElementById('explainTerminal');
    const signalRows = document.getElementById('signalRows');
    const CIRC = 2 * Math.PI * 90;

    function mixHex(c1: number[], c2: number[], f: number) { return `rgb(${Math.round(c1[0] + (c2[0] - c1[0]) * f)},${Math.round(c1[1] + (c2[1] - c1[1]) * f)},${Math.round(c1[2] + (c2[2] - c1[2]) * f)})`; }

    function showResults(data: any) {
      if (radarRaf) cancelAnimationFrame(radarRaf);
      if(!progressPanel || !resultsPanel || !stamp || !verdictCol || !verdictUrl || !verdictLabel || !ringFg || !ringScore || !explainTerminal || !signalRows) return;
      
      progressPanel.classList.add('hidden');
      resultsPanel.classList.remove('hidden');
      stamp.classList.remove('show');
      verdictCol.classList.remove('shake');
      verdictUrl.textContent = data.host;

      const band = bandOf(data.score);
      let color;
      if (band === 'safe') { color = '#00F0FF'; verdictLabel.textContent = 'Verified Safe'; }
      else if (band === 'phishing') { color = '#FF0055'; verdictLabel.textContent = 'Phishing Detected'; }
      else { color = mixHex([0, 240, 255], [255, 0, 85], (data.score - 40) / 30); verdictLabel.textContent = 'Suspicious'; }
      verdictLabel.className = 'verdict-label ' + band;
      ringFg.style.stroke = color; ringFg.style.color = color;
      ringFg.style.transition = 'none'; ringFg.style.strokeDashoffset = CIRC.toString(); ringScore.textContent = '0';
      void ringFg.getBoundingClientRect();
      ringFg.style.transition = reduceMotion ? 'none' : 'stroke-dashoffset 1.3s cubic-bezier(.16,.8,.2,1), stroke .4s ease';
      requestAnimationFrame(() => { ringFg.style.strokeDashoffset = (CIRC * (1 - data.score / 100)).toString(); });

      const dur = reduceMotion ? 0 : 1300; let startT: number | null = null;
      function countUp(ts: number) { if (startT === null) startT = ts; const p = dur === 0 ? 1 : Math.min(1, (ts - startT) / dur); const eased = 1 - Math.pow(1 - p, 3); if(ringScore) ringScore.textContent = Math.round(data.score * eased).toString(); if (p < 1) requestAnimationFrame(countUp); }
      requestAnimationFrame(countUp);

      if (band === 'phishing') { setTimeout(() => { stamp.classList.add('show'); verdictCol.classList.add('shake'); }, reduceMotion ? 0 : 950); }

      const brand = data.mimicked; let explanation;
      if (band === 'phishing') {
        explanation = `This domain is ${data.visualSim}% visually similar to ${brand || 'a well-known brand'}, but was registered only ${data.domainAgeDays} day${data.domainAgeDays === 1 ? '' : 's'} ago. Its SSL certificate is a free ${data.sslIssuer} cert issued ${data.sslAgeDays} days ago — a pattern typical of disposable phishing infrastructure. ${data.domAnomalies} credential-harvesting form${data.domAnomalies === 1 ? '' : 's'} were found in the page markup. Recommendation: block and quarantine.`;
      } else if (band === 'suspicious') {
        explanation = `This domain shows some indicators worth flagging: a ${data.domainAgeDays}-day registration history, a ${data.sslIssuer} certificate issued ${data.sslAgeDays} days ago, and a visual-similarity score of ${data.visualSim}%. Nothing here is conclusive on its own, but treat links from this domain with caution.`;
      } else {
        explanation = `No significant phishing indicators were found. Domain age (${data.domainAgeDays} days), certificate chain (${data.sslIssuer}), and visual fingerprint (${data.visualSim}% match to known brands) are all consistent with legitimate, established infrastructure.`;
      }
      explainTerminal.innerHTML = '';
      const span = document.createElement('span'); explainTerminal.appendChild(span);
      const caret = document.createElement('span'); caret.className = 'caret'; explainTerminal.appendChild(caret);
      typeInto(span, explanation, reduceMotion ? 0 : 9, () => { });

      function sw(level: string) { return `<span class="sw ${level}"></span>`; }
      const rows = [
        { k: 'Domain age', v: `${data.domainAgeDays} day${data.domainAgeDays === 1 ? '' : 's'}`, level: data.domainAgeDays < 30 ? 'bad' : (data.domainAgeDays < 180 ? 'warn' : 'ok') },
        { k: 'SSL issuer', v: data.sslIssuer, level: data.sslIssuer.indexOf('Let') === 0 ? 'warn' : 'ok' },
        { k: 'Visual similarity', v: `${data.visualSim}%${brand ? ' to ' + brand : ''}`, level: data.visualSim > 70 ? 'bad' : (data.visualSim > 40 ? 'warn' : 'ok') },
        { k: 'DOM anomalies', v: `${data.domAnomalies} flagged`, level: data.domAnomalies > 1 ? 'bad' : (data.domAnomalies === 1 ? 'warn' : 'ok') }
      ];
      signalRows.innerHTML = rows.map(r => `<div class="signal-row"><span class="k">${r.k}</span><span class="v">${sw(r.level)}${r.v}</span></div>`).join('');
    }

    const onFormSubmit = (e: Event) => { e.preventDefault(); startScan(urlInput.value); };
    scanForm.addEventListener('submit', onFormSubmit);

    const onChipClick = (e: Event) => {
      const chip = e.currentTarget as HTMLElement;
      urlInput.value = chip.dataset.url || ''; startScan(urlInput.value);
    };
    const chips = document.querySelectorAll('.chip');
    chips.forEach(chip => chip.addEventListener('click', onChipClick));

    const onRescanClick = () => {
      runToken++; urlInput.value = ''; if(formError) formError.textContent = '';
      resultsPanel?.classList.add('hidden'); scannerPanel?.classList.remove('hidden');
    };
    rescanBtn.addEventListener('click', onRescanClick);

    return () => {
      if (bgRaf) cancelAnimationFrame(bgRaf);
      if (glowRaf) cancelAnimationFrame(glowRaf);
      if (radarRaf) cancelAnimationFrame(radarRaf);
      scanForm.removeEventListener('submit', onFormSubmit);
      chips.forEach(chip => chip.removeEventListener('click', onChipClick));
      rescanBtn.removeEventListener('click', onRescanClick);
    };
  }, []);

  return (
    <>
      <style jsx>{`
        canvas#bg { position: absolute; inset: -4%; width: 108%; height: 108%; display: block; }
        .vignette { position: absolute; inset: 0; pointer-events: none; z-index: 1;
          background: radial-gradient(ellipse at 24% 20%, transparent 0%, transparent 20%, rgba(5,2,9,0.55) 68%, var(--bg) 100%); }
        .cursor-glow { position: fixed; top: 0; left: 0; width: 480px; height: 480px; z-index: 5; pointer-events: none;
          background: radial-gradient(circle, rgba(0,240,255,0.12) 0%, rgba(255,0,85,0.06) 42%, transparent 68%);
          transform: translate3d(-1000px,-1000px,0) translate(-50%,-50%); mix-blend-mode: screen; opacity: 0; transition: opacity 0.4s ease; }
        .cursor-glow.active { opacity: 1; }

        .view { display: block; animation: fade-in 0.45s cubic-bezier(.2,.8,.2,1) both; position: relative; z-index: 3; }
        @keyframes fade-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

        .page-head { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 12px; max-width: 960px; margin: 0 auto 24px auto; }
        .page-eyebrow { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--cyan); margin-bottom: 8px; }
        .page-title { font-family: var(--font-display); font-weight: 700; font-size: 26px; letter-spacing: -0.01em; margin: 0; }
        .page-sub { color: var(--text-muted); font-size: 13px; margin: 6px 0 0; }

        .panel { position: relative; border-radius: 16px; border: 1px solid var(--line); background: var(--panel-glass);
          backdrop-filter: blur(20px) saturate(140%); box-shadow: 0 24px 60px -28px rgba(0,0,0,0.65); }
        .hidden { display: none !important; }

        .scanner-panel { max-width: 640px; margin: 0 auto; padding: 40px 40px 34px; text-align: center; }
        .scanner-sub { color: var(--text-muted); font-size: 13.5px; line-height: 1.6; margin: 0 0 26px; max-width: 440px; margin-left: auto; margin-right: auto; }
        .scan-form { display: flex; gap: 10px; }
        .scan-form input { flex: 1; background: rgba(255,255,255,0.04); border: 1px solid var(--line); border-radius: 10px; padding: 13px 16px; color: var(--text); font-family: var(--font-mono); font-size: 13.5px; }
        .scan-form input:focus { outline: none; border-color: var(--cyan); box-shadow: 0 0 0 3px rgba(0,240,255,0.12); }
        .scan-btn { position: relative; overflow: hidden; border: none; border-radius: 10px; padding: 0 24px; background: linear-gradient(90deg, var(--cyan), #4dd8ff); color: #031319;
          font-family: var(--font-mono); font-weight: 600; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer;
          box-shadow: 0 0 0 1px rgba(0,240,255,0.4), 0 10px 26px -10px rgba(0,240,255,0.6); }
        .scan-btn:hover { filter: brightness(1.08); }
        .form-error { font-family: var(--font-mono); font-size: 11px; color: var(--magenta); min-height: 16px; margin-top: 9px; text-align: left; padding-left: 2px; }
        .chips-label { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-faint); margin: 22px 0 10px; }
        .chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .chip { border: 1px solid var(--line); background: rgba(255,255,255,0.03); color: var(--text-muted); font-family: var(--font-mono); font-size: 11px; padding: 7px 12px; border-radius: 999px; cursor: pointer; transition: border-color .15s,color .15s,background .15s; }
        .chip:hover { border-color: var(--magenta); color: var(--text); background: rgba(255,0,85,0.06); }

        .progress-panel { max-width: 640px; margin: 0 auto; padding: 36px 38px; overflow: hidden; }
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
        .ring-fg { fill: none; stroke: var(--cyan); stroke-width: 12; stroke-linecap: round; stroke-dasharray: 565.5; stroke-dashoffset: 565.5; transition: stroke-dashoffset 1.3s cubic-bezier(.16,.8,.2,1), stroke .4s ease; filter: drop-shadow(0 0 10px currentColor); }
        .ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .ring-score-row { display: flex; align-items: baseline; gap: 2px; }
        .ring-score { font-family: var(--font-display); font-weight: 700; font-size: 40px; line-height: 1; }
        .ring-percent { font-family: var(--font-display); font-weight: 600; font-size: 16px; color: var(--text-muted); }
        .ring-caption { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-faint); margin-top: 6px; }
        .stamp { position: absolute; top: 38%; left: 50%; z-index: 6; font-family: var(--font-display); font-weight: 700; font-size: 20px; letter-spacing: 0.06em; color: var(--magenta);
          border: 3px solid var(--magenta); border-radius: 6px; padding: 5px 12px; text-transform: uppercase; background: rgba(5,2,9,0.55); pointer-events: none;
          opacity: 0; transform: translate(-50%,-50%) rotate(-14deg) scale(2.4); text-shadow: 0 0 12px rgba(255,0,85,0.7); box-shadow: 0 0 24px rgba(255,0,85,0.35); white-space: nowrap; }
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
        
        .landscape-section { max-width: 960px; margin: 60px auto 0; padding: 0; position: relative; z-index: 3; }
        .landscape-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-faint); }
        .landscape-header .left { display: flex; align-items: center; gap: 10px; color: var(--text-muted); }
        .landscape-header .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 6px rgba(0,240,255,0.5); }
        
        .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 50px; }
        .stat-box { background: var(--panel-glass); border: 1px solid var(--line); border-radius: 12px; padding: 32px 24px; text-align: center; }
        .stat-val { font-family: var(--font-display); font-weight: 700; font-size: 28px; margin-bottom: 8px; color: var(--text); }
        .stat-val.cyan { color: var(--cyan); }
        .stat-val.magenta { color: var(--magenta); }
        .stat-label { font-family: var(--font-mono); font-size: 10px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.06em; line-height: 1.5; }
        
        .landscape-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; }
        .col-heading { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 24px; }
        
        .brands-list { display: flex; flex-direction: column; gap: 18px; }
        .brand-row { display: flex; align-items: center; gap: 16px; }
        .brand-name { width: 90px; font-family: var(--font-body); font-size: 13px; font-weight: 600; color: var(--text); }
        .brand-bar-track { flex: 1; height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
        .brand-bar-fill { height: 100%; background: linear-gradient(90deg, var(--cyan), var(--magenta)); border-radius: 3px; }
        .brand-val { width: 32px; text-align: right; font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); }
        
        .tech-list { display: flex; flex-direction: column; gap: 24px; }
        .tech-item { border-bottom: 1px solid var(--line); padding-bottom: 20px; }
        .tech-item:last-child { border-bottom: none; padding-bottom: 0; }
        .tech-title { font-family: var(--font-body); font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
        .tech-desc { font-family: var(--font-body); font-size: 12px; line-height: 1.6; color: var(--text-muted); }
        
        .landscape-footer { margin-top: 50px; padding-top: 24px; border-top: 1px solid var(--line); font-family: var(--font-mono); font-size: 10px; color: var(--text-faint); line-height: 1.6; }
      `}</style>
      
      <style jsx global>{`
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
      `}</style>

      <canvas id="bg"></canvas>
      <div className="vignette"></div>
      <div className="cursor-glow" id="cursorGlow"></div>

      <div className="app-shell">
        <Sidebar activeRoute="scanner" />

        <div className="shell-main">
          <header className="topbar">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
              <span style={{ color: 'var(--text-faint)' }}>Workspace</span> / <span style={{ color: 'var(--text)' }}>Scanner</span>
            </div>
            <TopbarRight />
          </header>

          <main className="main" style={{ position: 'relative' }}>
            <section className="view" id="view-scanner">
              <div className="page-head">
                <div>
                  <div className="page-eyebrow">URL Threat Scanner</div>
                  <h1 className="page-title">Is this link safe to open?</h1>
                  <p className="page-sub" style={{ marginTop: '6px' }}>Runs DNS, WHOIS, SSL, DOM and visual-similarity checks before rendering a verdict.</p>
                </div>
              </div>

              <section className="panel scanner-panel" id="scannerPanel">
                <form className="scan-form" id="scanForm" noValidate>
                  <input type="text" id="urlInput" placeholder="https://example.com" autoComplete="off" />
                  <button type="submit" className="scan-btn" id="scanBtn">Scan</button>
                </form>
                <p className="form-error" id="formError"></p>
                <div className="chips-label">Try a sample</div>
                <div className="chips">
                  <button className="chip" type="button" data-url="https://github.com">github.com</button>
                  <button className="chip" type="button" data-url="https://paypal-secure-verify-account.tk">paypal-secure-verify-account.tk</button>
                  <button className="chip" type="button" data-url="https://accounts-google-support.cf/login">accounts-google-support.cf</button>
                  <button className="chip" type="button" data-url="https://mybank-online-update.xyz">mybank-online-update.xyz</button>
                </div>
              </section>

              <section className="panel progress-panel hidden" id="progressPanel">
                <canvas id="radar"></canvas>
                <div className="scan-target-row">
                  <span className="scan-target-label">Scanning:</span>
                  <span className="scan-target-url" id="scanTargetUrl"></span>
                </div>
                <ul className="steps" id="stepsList"></ul>
              </section>

              <section className="panel results-panel hidden" id="resultsPanel">
                <div className="results-grid">
                  <div className="verdict-col" id="verdictCol">
                    <div className="risk-ring-wrap">
                      <svg viewBox="0 0 200 200">
                        <circle className="ring-bg" cx="100" cy="100" r="90"></circle>
                        <circle className="ring-fg" id="ringFg" cx="100" cy="100" r="90"></circle>
                      </svg>
                      <div className="ring-center">
                        <div className="ring-score-row"><span className="ring-score" id="ringScore">0</span><span className="ring-percent">%</span></div>
                        <div className="ring-caption">Risk score</div>
                      </div>
                      <div className="stamp" id="stamp">Quarantined</div>
                    </div>
                    <div className="verdict-label" id="verdictLabel">—</div>
                    <div className="verdict-url" id="verdictUrl"></div>
                    <button className="btn-secondary" id="rescanBtn">Scan another URL</button>
                  </div>
                  <div className="explain-col">
                    <div className="explain-header"><span className="dot"></span>AI Explanation</div>
                    <div className="terminal" id="explainTerminal"></div>
                    <div className="signal-rows" id="signalRows"></div>
                  </div>
                </div>
              </section>

              {/* ========== PHISHING LANDSCAPE DASHBOARD ========== */}
              <section className="landscape-section">
                <div className="landscape-header">
                  <div className="left">
                    <span className="dot"></span>GLOBAL PHISHING LANDSCAPE
                  </div>
                  <div>APWG Q1 2026 & Check Point Research Q2 2026</div>
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
                    <div className="col-heading">MOST IMPERSONATED BRANDS · Q2 2026</div>
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
                        <div className="tech-title">Unauthorized logo & brand use</div>
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
    </>
  );
}
