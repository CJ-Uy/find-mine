'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', weight: ['500','700','800'] });
const sans    = DM_Sans({ subsets: ['latin'], variable: '--font-sans', weight: ['400','500','600'] });

/* ─── palette — canvas drawing only ─── */
const C = {
  yellow: '#fbbd40',
  teal:   '#108ab1',
  purple: '#2f0c33',
  salmon: '#ee9290',
  white:  '#ffffff',
};

const COORDS = [
  { lat: '14.6401°', lng: '121.0773°', spd: '4.2 km/h' },
  { lat: '14.6408°', lng: '121.0781°', spd: '5.1 km/h' },
  { lat: '14.6415°', lng: '121.0788°', spd: '3.7 km/h' },
];

/* ─── original blinking device card ─── */
function DeviceMockup() {
  const [i, setI]       = useState(0);
  const [fade, setFade] = useState(true);
  useEffect(() => {
    const t = setInterval(() => {
      setFade(false);
      setTimeout(() => { setI(n => (n + 1) % COORDS.length); setFade(true); }, 160);
    }, 2000);
    return () => clearInterval(t);
  }, []);
  const c = COORDS[i];
  return (
    <div className="
      bg-white border border-[rgba(47,12,51,0.09)] rounded-[28px] p-8
      shadow-[0_12px_48px_rgba(16,138,177,0.12)] w-[300px]
      max-[768px]:w-[calc(100vw-48px)] max-[768px]:max-w-[300px] max-[768px]:p-6
      max-[480px]:w-[calc(100vw-32px)] max-[480px]:p-5
    ">
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="font-display font-bold text-sm text-[#2f0c33]">NAVIO-001</p>
          <p className="text-[11px] text-[rgba(47,12,51,0.35)] mt-0.5">42mm · 28g · IP68</p>
        </div>
        <span className="bg-[#fbbd40] rounded-full px-3 py-1 text-[11px] font-bold text-[#2f0c33] inline-flex items-center gap-[5px] font-display">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2f0c33] inline-block animate-pulse" />
          LIVE
        </span>
      </div>
      {[{l:'LAT',v:c.lat},{l:'LNG',v:c.lng},{l:'SPD',v:c.spd}].map(r => (
        <div key={r.l} className="flex justify-between items-center py-2.5 border-b border-[rgba(47,12,51,0.06)]">
          <span className="text-[10px] font-bold tracking-[.1em] text-[rgba(47,12,51,0.3)]">{r.l}</span>
          {/* only the value flashes, card stays solid */}
          <span className={`font-mono text-[15px] font-bold text-[#2f0c33] transition-opacity duration-[160ms] ${fade ? 'opacity-100' : 'opacity-0'}`}>{r.v}</span>
        </div>
      ))}
      <div className="mt-[18px] flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-[rgba(47,12,51,0.07)]">
          <div className="w-[72%] h-full rounded-full bg-[#108ab1]" />
        </div>
        <span className="text-[11px] text-[#108ab1] font-semibold">Battery 72%</span>
      </div>
    </div>
  );
}

/* ─── background compass environment ─── */
function CompassSignal() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const start = performance.now();

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width  = Math.round(canvas!.offsetWidth  * dpr);
      canvas!.height = Math.round(canvas!.offsetHeight * dpr);
    }
    resize();
    window.addEventListener('resize', resize);

    /* one compass arm: forward spike + rear tail */
    function arm(len: number, w: number, fill: string, tailFill: string, tailLen: number) {
      ctx!.beginPath();
      ctx!.moveTo(0, 0);
      ctx!.lineTo(-w, -len * 0.55);
      ctx!.lineTo(0, -len);
      ctx!.lineTo(w, -len * 0.55);
      ctx!.closePath();
      ctx!.fillStyle = fill;
      ctx!.fill();

      ctx!.beginPath();
      ctx!.moveTo(0, 0);
      ctx!.lineTo(-w * 0.55, tailLen * 0.6);
      ctx!.lineTo(0, tailLen);
      ctx!.lineTo(w  * 0.55, tailLen * 0.6);
      ctx!.closePath();
      ctx!.fillStyle = tailFill;
      ctx!.fill();
    }

    function draw(ts: number) {
      const el = ts - start;
      const dpr = window.devicePixelRatio || 1;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const W  = canvas!.offsetWidth;
      const H  = canvas!.offsetHeight;
      const cx = W / 2;
      const cy = H / 2;
      const rot = Math.PI + (el / 32000) * Math.PI * 2; // start 180° offset so N arm faces the visible half

      /* transparent — floats over white hero */
      ctx!.clearRect(0, 0, W, H);

      /* topographic contour rings */
      for (let i = 1; i <= 9; i++) {
        ctx!.beginPath();
        ctx!.arc(cx, cy, i * 72, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(47,12,51,${i % 2 === 0 ? 0.035 : 0.018})`;
        ctx!.lineWidth   = i % 3 === 0 ? 1.5 : 0.7;
        ctx!.stroke();
      }

      /* pulse rings */
      const pp = 2400;
      [0, 0.34, 0.67].forEach(phase => {
        const t     = ((el % pp) / pp + phase) % 1;
        const r     = Math.max(0, t * 300);
        const alpha = (1 - t) * 0.45;
        ctx!.beginPath();
        ctx!.arc(cx, cy, r, 0, Math.PI * 2);
        ctx!.strokeStyle = t < 0.45
          ? `rgba(251,189,64,${alpha})`
          : `rgba(16,138,177,${alpha})`;
        ctx!.lineWidth = Math.max(0.3, 3 - t * 2.7);
        ctx!.stroke();
      });

      /* ── rotating compass rose ── */
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(rot);

      /* outer degree ring */
      ctx!.beginPath();
      ctx!.arc(0, 0, 385, 0, Math.PI * 2);
      ctx!.strokeStyle = 'rgba(16,138,177,0.07)';
      ctx!.lineWidth   = 1;
      ctx!.stroke();

      /* tick marks */
      for (let deg = 0; deg < 360; deg += 5) {
        const a       = (deg * Math.PI) / 180 - Math.PI / 2;
        const isMajor = deg % 90 === 0;
        const isMid   = deg % 30 === 0;
        const inner   = isMajor ? 362 : isMid ? 374 : 380;
        ctx!.beginPath();
        ctx!.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx!.lineTo(Math.cos(a) * 385,   Math.sin(a) * 385);
        ctx!.strokeStyle = isMajor ? 'rgba(16,138,177,0.4)' : isMid ? 'rgba(16,138,177,0.18)' : 'rgba(16,138,177,0.07)';
        ctx!.lineWidth   = isMajor ? 2 : 0.8;
        ctx!.stroke();
      }

      /* cardinal arms: N yellow, rest teal */
      ctx!.save(); ctx!.rotate(0);            arm(250, 28, C.yellow, 'rgba(251,189,64,0.28)',  75); ctx!.restore();
      ctx!.save(); ctx!.rotate(Math.PI);      arm(250, 28, C.teal,  'rgba(16,138,177,0.28)',   75); ctx!.restore();
      ctx!.save(); ctx!.rotate(Math.PI / 2);  arm(250, 28, C.teal,  'rgba(16,138,177,0.28)',   75); ctx!.restore();
      ctx!.save(); ctx!.rotate(-Math.PI / 2); arm(250, 28, C.teal,  'rgba(16,138,177,0.28)',   75); ctx!.restore();

      /* intercardinal arms */
      [45, 135, 225, 315].forEach(deg => {
        ctx!.save();
        ctx!.rotate((deg * Math.PI) / 180);
        arm(155, 17, 'rgba(16,138,177,0.42)', 'rgba(16,138,177,0.14)', 46);
        ctx!.restore();
      });

      /* inner decorative ring */
      ctx!.beginPath();
      ctx!.arc(0, 0, 52, 0, Math.PI * 2);
      ctx!.strokeStyle = 'rgba(16,138,177,0.18)';
      ctx!.lineWidth   = 1;
      ctx!.stroke();

      /* center hub */
      ctx!.beginPath();
      ctx!.arc(0, 0, 32, 0, Math.PI * 2);
      ctx!.fillStyle   = C.white;
      ctx!.fill();
      ctx!.strokeStyle = C.teal;
      ctx!.lineWidth   = 2.5;
      ctx!.stroke();

      ctx!.restore(); /* end compass rotation */

      /* cardinal labels — upright, track arm tips */
      ctx!.font         = 'bold 14px system-ui, sans-serif';
      ctx!.textAlign    = 'center';
      ctx!.textBaseline = 'middle';
      const labelR = 315;
      [
        { base: -Math.PI / 2, label: 'N', color: C.yellow },
        { base: 0,            label: 'E', color: 'rgba(16,138,177,0.6)' },
        { base: Math.PI / 2,  label: 'S', color: 'rgba(16,138,177,0.6)' },
        { base: Math.PI,      label: 'W', color: 'rgba(16,138,177,0.6)' },
      ].forEach(({ base, label, color }) => {
        const a = base + rot;
        ctx!.fillStyle = color;
        ctx!.fillText(label, cx + Math.cos(a) * labelR, cy + Math.sin(a) * labelR);
      });

      /* center pulsing GPS dot */
      const pulse = 1 + 0.25 * Math.sin((el / 700) * Math.PI * 2);
      const grd   = ctx!.createRadialGradient(cx, cy, 0, cx, cy, 24 * pulse);
      grd.addColorStop(0, 'rgba(251,189,64,0.85)');
      grd.addColorStop(1, 'rgba(251,189,64,0)');
      ctx!.beginPath();
      ctx!.arc(cx, cy, 24 * pulse, 0, Math.PI * 2);
      ctx!.fillStyle = grd;
      ctx!.fill();

      ctx!.beginPath();
      ctx!.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx!.fillStyle = C.yellow;
      ctx!.fill();

      animId = requestAnimationFrame(draw);
    }

    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: 900, height: 900, display: 'block' }}
    />
  );
}

/* ─── ticker ─── */
const TICKS = ['Real-time GPS','IP68 Waterproof','< 3m Accuracy','7-Day Battery','One-press SOS','24/7 Tracking','Works Globally'];
function Ticker() {
  const items = [...TICKS,...TICKS,...TICKS];
  return (
    <div className="border-t border-b border-[rgba(47,12,51,0.06)] py-3 overflow-hidden bg-[#f8f9fa]">
      <div className="flex gap-10 [animation:ticker_22s_linear_infinite] whitespace-nowrap w-max">
        {items.map((t,i) => (
          <span key={i} className="text-xs font-semibold text-[rgba(47,12,51,0.35)] tracking-[.08em] uppercase font-display">
            {t} <span className="ml-10 opacity-40">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className={`${display.variable} ${sans.variable} font-sans overflow-x-hidden bg-white`}>

      {/* ── NAV ── */}
      <nav className="bg-white border-b border-[rgba(47,12,51,0.07)] sticky top-0 z-50 px-6">
        <div className="max-w-[1100px] mx-auto h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/Logo no bg.png" alt="Navio logo" width={32} height={32} style={{ objectFit:'contain' }} />
            <span className="font-display font-extrabold text-2xl tracking-[-0.02em]">
              <span className="text-[#fbbd40]">Nav</span><span className="text-[#108ab1]">io</span>
            </span>
          </div>
          <div className="hidden md:flex gap-7">
            {[['Features','#features'],['How it works','#how-it-works'],['Stories','#stories']].map(([l,h]) => (
              <a key={l} href={h} className="text-[rgba(47,12,51,0.45)] text-sm font-medium transition-colors duration-150 hover:text-[#2f0c33]">{l}</a>
            ))}
          </div>
          <Link href="/tracker" className="pill bg-[#108ab1] text-white text-sm px-[22px] py-[10px]">
            Open Tracker →
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="
        bg-white px-6 pt-[120px] pb-24 relative overflow-hidden
        max-[768px]:pt-[72px] max-[768px]:pb-16 max-[768px]:px-5
        max-[480px]:pt-[60px] max-[480px]:pb-14 max-[480px]:px-4
      ">
        {/* compass — huge background environment, right half off screen */}
        <div className="
          absolute top-1/2 -translate-y-1/2 z-0 pointer-events-none
          [animation:float_7s_ease-in-out_infinite]
          -right-112.5
          max-[768px]:-right-150
          max-[480px]:hidden
        ">
          <CompassSignal />
        </div>

        <div className="max-w-[1100px] mx-auto grid [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))] gap-16 items-center relative z-[1]">
          <div>
            <span className="pill bg-[rgba(16,138,177,0.1)] [border:1.5px_solid_rgba(16,138,177,0.25)] text-[#108ab1] text-[11px] px-4 py-[5px] mb-6 gap-[7px] tracking-[.08em] uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#108ab1] inline-block animate-pulse" />
              Wearable GPS Tracker
            </span>

            <h1 className="font-display font-extrabold text-[clamp(36px,7vw,78px)] leading-[1.04] tracking-[-0.03em] text-[#2f0c33] my-5">
              Safety you<br/>
              <span className="text-[#fbbd40]">can wear.</span>
            </h1>

            <p className="text-[rgba(47,12,51,0.55)] text-lg leading-[1.7] max-w-[400px] mb-9">
              A lightweight wearable GPS that keeps your loved ones connected to you — in real time, everywhere, always.
            </p>

            <div className="flex gap-3 flex-wrap">
              <Link href="/tracker" className="pill bg-[#108ab1] text-white text-base px-[34px] py-4 shadow-[0_6px_24px_rgba(16,138,177,0.3)]">
                Open Tracker
              </Link>
              <a href="#how-it-works" className="pill bg-transparent [border:1.5px_solid_rgba(47,12,51,0.18)] text-[#2f0c33] text-base px-[34px] py-4">
                How it works
              </a>
            </div>

            <div className="flex gap-7 mt-11 pt-9 border-t border-[rgba(47,12,51,0.07)] flex-wrap">
              {[{n:'< 3m',l:'accuracy'},{n:'7 days',l:'battery'},{n:'< 5s',l:'SOS alert'}].map(s => (
                <div key={s.l}>
                  <p className="font-display font-extrabold text-[22px] text-[#108ab1]">{s.n}</p>
                  <p className="text-[rgba(47,12,51,0.4)] text-xs mt-[3px]">{s.l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* right column — device card centered */}
          <div className="flex justify-center items-center">
            <div className="[animation:float_5s_ease-in-out_infinite]">
              <DeviceMockup />
            </div>
          </div>
        </div>
      </section>

      <Ticker />

      {/* ── FEATURES ── */}
      <section id="features" className="bg-white px-6 py-24">
        <div className="max-w-[1100px] mx-auto">
          <p className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-[#108ab1] mb-3">Features</p>
          <h2 className="font-display font-extrabold text-[clamp(30px,4vw,44px)] tracking-[-0.02em] leading-[1.12] text-[#2f0c33] mb-[52px] max-w-[400px]">
            Built for peace of mind.
          </h2>

          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] gap-5">
            {[
              { icon:'📍', title:'Real-time GPS',  desc:"Location updates every second. Watch the live map update in real time — no delay, no guessing.", bg:'rgba(251,189,64,.1)',  border:'rgba(251,189,64,.4)'  },
              { icon:'🆘', title:'One-press SOS',  desc:'A single button sends GPS coordinates to all linked contacts within 5 seconds. When it counts, it works.', bg:'rgba(238,146,144,.1)', border:'rgba(238,146,144,.4)' },
              { icon:'🗺️', title:'Route History',  desc:"Review the full trail of where they've been. Up to 30 days of history stored securely in the cloud.", bg:'rgba(16,138,177,.08)', border:'rgba(16,138,177,.25)' },
            ].map(f => (
              <div key={f.title} className="pcard p-8" style={{ background:f.bg, border:`1px solid ${f.border}` }}>
                <span className="text-[38px] block mb-5">{f.icon}</span>
                <h3 className="font-display font-bold text-[19px] text-[#2f0c33] mb-2.5">{f.title}</h3>
                <p className="text-[rgba(47,12,51,0.55)] text-[15px] leading-[1.65]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="bg-[#108ab1] px-6 py-24">
        <div className="max-w-[1100px] mx-auto">
          <p className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-white/60 mb-3">How it works</p>
          <h2 className="font-display font-extrabold text-[clamp(30px,4vw,44px)] tracking-[-0.02em] leading-[1.12] text-white mb-[60px] max-w-[380px]">
            Up and running in three steps.
          </h2>

          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] gap-12">
            {[
              { num:'01', title:'Wear it',  desc:"Clip or strap Navio to a bag, wrist, or belt. At 28g, they'll forget it's even there.", pill:C.yellow, text:C.purple },
              { num:'02', title:'Connect',  desc:'Open the app, scan the QR code, and link up to 5 trusted contacts who can view the live tracker.', pill:'rgba(255,255,255,.2)', text:C.white },
              { num:'03', title:'Track',    desc:'Watch the map update every second. Get push alerts when they arrive, leave, or press SOS.', pill:C.salmon, text:C.white },
            ].map(step => (
              <div key={step.num} className="flex gap-[18px]">
                <div className="w-[46px] h-[46px] rounded-full shrink-0 flex items-center justify-center font-display font-extrabold text-xs"
                  style={{ background:step.pill, color:step.text }}>
                  {step.num}
                </div>
                <div>
                  <h3 className="font-display font-bold text-[19px] text-white mb-2">{step.title}</h3>
                  <p className="text-white/60 text-[15px] leading-[1.65]">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STORIES ── */}
      <section id="stories" className="bg-[#f8f9fa] px-6 py-24">
        <div className="max-w-[1100px] mx-auto">
          <p className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-[#ee9290] mb-3">Stories</p>
          <h2 className="font-display font-extrabold text-[clamp(30px,4vw,44px)] tracking-[-0.02em] leading-[1.12] text-[#2f0c33] mb-[52px] max-w-[440px]">
            Real families.<br/>Real peace of mind.
          </h2>

          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] gap-4">
            {[
              { quote:"My daughter walks to school alone now. I used to worry every day. With Navio I just open the app and breathe.", name:'Maria Santos', role:'Parent of a 9-year-old', dot:C.yellow },
              { quote:"Dad has early-stage dementia. Navio means we can let him walk in the garden without anyone hovering. It changed everything.", name:'James Reyes', role:'Family caregiver', dot:C.teal },
              { quote:"One member twisted her ankle off-trail. The SOS alert got us to her in under 8 minutes. Navio is non-negotiable for our hikes.", name:'Lea Mendoza', role:'Trail runner', dot:C.salmon },
            ].map(t => (
              <div key={t.name} className="tcard bg-white border border-[rgba(47,12,51,0.08)] p-7">
                <p className="text-[rgba(47,12,51,0.65)] text-[15px] leading-[1.75] mb-5">"{t.quote}"</p>
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background:t.dot }} />
                  <div>
                    <p className="font-display font-bold text-[#2f0c33] text-sm">{t.name}</p>
                    <p className="text-[rgba(47,12,51,0.4)] text-xs mt-0.5">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="bg-[#fbbd40] px-6 py-20 text-center">
        <h2 className="font-display font-extrabold text-[clamp(32px,5vw,54px)] tracking-[-0.03em] leading-[1.1] text-[#2f0c33] mb-4">
          Keep your loved ones<br/>safe today.
        </h2>
        <p className="text-[rgba(47,12,51,0.55)] text-[17px] mb-9">
          Join thousands of families who trust Navio every day.
        </p>
        <Link href="/tracker" className="pill bg-[#108ab1] text-white text-[18px] px-11 py-[18px] shadow-[0_10px_32px_rgba(16,138,177,0.3)]">
          Open Tracker →
        </Link>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-white border-t border-[rgba(47,12,51,0.07)] px-6 pt-11 pb-9">
        <div className="max-w-[1100px] mx-auto flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-2.5">
            <Image src="/Logo no bg.png" alt="Navio logo" width={28} height={28} style={{ objectFit:'contain' }} />
            <div>
              <p className="font-display font-extrabold text-lg">
                <span className="text-[#fbbd40]">Nav</span><span className="text-[#108ab1]">io</span>
              </p>
              <p className="text-[rgba(47,12,51,0.35)] text-xs mt-0.5">Safety you can wear.</p>
            </div>
          </div>
          <div className="flex gap-6 flex-wrap">
            {[['Features','#features'],['How it works','#how-it-works'],['Stories','#stories'],['Tracker','/tracker']].map(([l,h]) => (
              <a key={l} href={h} className="text-[rgba(47,12,51,0.4)] text-sm hover:text-[#108ab1] transition-colors duration-150">{l}</a>
            ))}
          </div>
          <p className="text-[rgba(47,12,51,0.25)] text-xs">© 2026 Navio. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
