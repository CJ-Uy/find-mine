'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', weight: ['500','700','800'] });
const sans    = DM_Sans({ subsets: ['latin'], variable: '--font-sans', weight: ['400','500','600'] });

/* ─── palette — yellow + teal are the hero duo ─── */
const C = {
  yellow: '#fbbd40',
  teal:   '#108ab1',
  purple: '#2f0c33',   // text & footer only
  salmon: '#ee9290',
  white:  '#ffffff',
};

/* ─── animated device card ─── */
const COORDS = [
  { lat: '14.6401°', lng: '121.0773°', spd: '4.2 km/h' },
  { lat: '14.6408°', lng: '121.0781°', spd: '5.1 km/h' },
  { lat: '14.6415°', lng: '121.0788°', spd: '3.7 km/h' },
];

function DeviceMockup() {
  const [i, setI]     = useState(0);
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
    <div style={{
      background: C.white,
      border: `1px solid rgba(47,12,51,0.09)`,
      borderRadius: 28, padding: 32,
      boxShadow: '0 12px 48px rgba(16,138,177,0.12)',
      width: 300,
      transition: 'opacity .16s',
      opacity: fade ? 1 : 0,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <p style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:14, color:C.purple }}>NAVIO-001</p>
          <p style={{ fontSize:11, color:'rgba(47,12,51,.35)', marginTop:2 }}>42mm · 28g · IP68</p>
        </div>
        {/* LIVE chip in yellow — brand signature */}
        <span style={{
          background: C.yellow, borderRadius: 9999,
          padding: '4px 12px', fontSize: 11, fontWeight: 700,
          color: C.purple, display:'inline-flex', alignItems:'center', gap:5,
          fontFamily:'var(--font-display)',
        }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:C.purple, display:'inline-block' }} className="animate-pulse" />
          LIVE
        </span>
      </div>

      {[{l:'LAT',v:c.lat},{l:'LNG',v:c.lng},{l:'SPD',v:c.spd}].map(r => (
        <div key={r.l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid rgba(47,12,51,.06)' }}>
          <span style={{ fontSize:10, fontWeight:700, letterSpacing:'.1em', color:'rgba(47,12,51,.3)' }}>{r.l}</span>
          <span style={{ fontFamily:'monospace', fontSize:15, fontWeight:700, color:C.purple }}>{r.v}</span>
        </div>
      ))}

      <div style={{ marginTop:18, display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ flex:1, height:4, borderRadius:9999, background:'rgba(47,12,51,.07)' }}>
          <div style={{ width:'72%', height:'100%', borderRadius:9999, background:C.teal }} />
        </div>
        <span style={{ fontSize:11, color:C.teal, fontWeight:600 }}>Battery 72%</span>
      </div>
    </div>
  );
}

/* ─── ticker ─── */
const TICKS = ['Real-time GPS','IP68 Waterproof','< 3m Accuracy','7-Day Battery','One-press SOS','24/7 Tracking','Works Globally'];
function Ticker() {
  const items = [...TICKS,...TICKS,...TICKS];
  return (
    <div style={{ borderTop:'1px solid rgba(47,12,51,.06)', borderBottom:'1px solid rgba(47,12,51,.06)', padding:'12px 0', overflow:'hidden', background:'#f8f9fa' }}>
      <div style={{ display:'flex', gap:'2.5rem', animation:'ticker 22s linear infinite', whiteSpace:'nowrap', width:'max-content' }}>
        {items.map((t,i) => (
          <span key={i} style={{ fontSize:12, fontWeight:600, color:'rgba(47,12,51,.35)', letterSpacing:'.08em', textTransform:'uppercase', fontFamily:'var(--font-display)' }}>
            {t} <span style={{ marginLeft:'2.5rem', opacity:.4 }}>·</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className={`${display.variable} ${sans.variable}`} style={{ fontFamily:'var(--font-sans)', overflowX:'hidden', background:C.white }}>
      <style>{`
        @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-33.333%)} }
        @keyframes float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        .pill{border-radius:9999px;font-family:var(--font-display);font-weight:700;display:inline-block;text-decoration:none;transition:transform .15s,filter .15s;cursor:pointer;border:none;}
        .pill:hover{transform:translateY(-2px);filter:brightness(1.06);}
        .pcard{border-radius:24px;transition:transform .2s,box-shadow .2s;}
        .pcard:hover{transform:translateY(-4px);box-shadow:0 20px 44px rgba(16,138,177,0.12);}
        .tcard{border-radius:16px;transition:transform .2s;}
        .tcard:hover{transform:translateY(-3px);}
        a{text-decoration:none;}
      `}</style>

      {/* ── NAV — white, teal CTA ── */}
      <nav style={{ background:C.white, borderBottom:'1px solid rgba(47,12,51,.07)', position:'sticky', top:0, zIndex:50, padding:'0 24px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', height:64, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Image src="/Logo no bg.png" alt="Navio logo" width={32} height={32} style={{ objectFit:'contain' }} />
            <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:24, letterSpacing:'-.02em' }}>
              <span style={{ color:C.yellow }}>Nav</span><span style={{ color:C.teal }}>io</span>
            </span>
          </div>
          <div className="hidden md:flex" style={{ display:'flex', gap:28 }}>
            {[['Features','#features'],['How it works','#how-it-works'],['Stories','#stories']].map(([l,h]) => (
              <a key={l} href={h} style={{ color:'rgba(47,12,51,.45)', fontSize:14, fontWeight:500, transition:'color .15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = C.purple)}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(47,12,51,.45)')}>{l}</a>
            ))}
          </div>
          {/* teal pill — matches logo color */}
          <Link href="/tracker" className="pill" style={{ background:C.teal, color:C.white, fontSize:14, padding:'10px 22px' }}>
            Open Tracker →
          </Link>
        </div>
      </nav>

      {/* ── HERO — white canvas ── */}
      <section style={{ background:C.white, padding:'120px 24px 96px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:64, alignItems:'center' }}>
          <div>
            {/* teal badge */}
            <span className="pill" style={{ background:'rgba(16,138,177,.1)', border:'1.5px solid rgba(16,138,177,.25)', color:C.teal, fontSize:11, padding:'5px 16px', marginBottom:24, display:'inline-flex', alignItems:'center', gap:7, letterSpacing:'.08em', textTransform:'uppercase' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:C.teal, display:'inline-block' }} className="animate-pulse" />
              Wearable GPS Tracker
            </span>

            <h1 style={{
              fontFamily:'var(--font-display)', fontWeight:800,
              fontSize:'clamp(48px,7vw,78px)',
              lineHeight:1.04, letterSpacing:'-.03em',
              color:C.purple, margin:'20px 0 20px',
            }}>
              Safety you<br/>
              <span style={{ color:C.yellow }}>can wear.</span>
            </h1>

            <p style={{ color:'rgba(47,12,51,.55)', fontSize:18, lineHeight:1.7, maxWidth:400, marginBottom:36 }}>
              A lightweight wearable GPS that keeps your loved ones connected to you — in real time, everywhere, always.
            </p>

            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {/* primary: teal */}
              <Link href="/tracker" className="pill" style={{ background:C.teal, color:C.white, fontSize:16, padding:'16px 34px', boxShadow:'0 6px 24px rgba(16,138,177,.3)' }}>
                Open Tracker
              </Link>
              {/* secondary: outline */}
              <a href="#how-it-works" className="pill" style={{ background:'transparent', border:`1.5px solid rgba(47,12,51,.18)`, color:C.purple, fontSize:16, padding:'16px 34px' }}>
                How it works
              </a>
            </div>

            {/* stats — teal numbers */}
            <div style={{ display:'flex', gap:28, marginTop:44, paddingTop:36, borderTop:'1px solid rgba(47,12,51,.07)' }}>
              {[{n:'< 3m',l:'accuracy'},{n:'7 days',l:'battery'},{n:'< 5s',l:'SOS alert'}].map(s => (
                <div key={s.l}>
                  <p style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:22, color:C.teal }}>{s.n}</p>
                  <p style={{ color:'rgba(47,12,51,.4)', fontSize:12, marginTop:3 }}>{s.l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* floating device mockup */}
          <div style={{ display:'flex', justifyContent:'center' }}>
            <div style={{ animation:'float 5s ease-in-out infinite' }}>
              <DeviceMockup />
            </div>
          </div>
        </div>
      </section>

      <Ticker />

      {/* ── FEATURES — pastel tinted cards ── */}
      <section id="features" style={{ background:C.white, padding:'96px 24px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <p style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:11, letterSpacing:'.14em', textTransform:'uppercase', color:C.teal, marginBottom:12 }}>Features</p>
          <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'clamp(30px,4vw,44px)', letterSpacing:'-.02em', lineHeight:1.12, color:C.purple, marginBottom:52, maxWidth:400 }}>
            Built for peace of mind.
          </h2>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:20 }}>
            {[
              { icon:'📍', title:'Real-time GPS',  desc:"Location updates every second. Watch the live map update in real time — no delay, no guessing.", bg:'rgba(251,189,64,.1)',  border:'rgba(251,189,64,.4)'  },
              { icon:'🆘', title:'One-press SOS',  desc:'A single button sends GPS coordinates to all linked contacts within 5 seconds. When it counts, it works.', bg:'rgba(238,146,144,.1)', border:'rgba(238,146,144,.4)' },
              { icon:'🗺️', title:'Route History',  desc:"Review the full trail of where they've been. Up to 30 days of history stored securely in the cloud.", bg:'rgba(16,138,177,.08)', border:'rgba(16,138,177,.25)' },
            ].map(f => (
              <div key={f.title} className="pcard" style={{ background:f.bg, border:`1px solid ${f.border}`, padding:32 }}>
                <span style={{ fontSize:38, display:'block', marginBottom:20 }}>{f.icon}</span>
                <h3 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:19, color:C.purple, marginBottom:10 }}>{f.title}</h3>
                <p style={{ color:'rgba(47,12,51,.55)', fontSize:15, lineHeight:1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS — teal section (matches logo) ── */}
      <section id="how-it-works" style={{ background:C.teal, padding:'96px 24px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <p style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:11, letterSpacing:'.14em', textTransform:'uppercase', color:'rgba(255,255,255,.6)', marginBottom:12 }}>How it works</p>
          <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'clamp(30px,4vw,44px)', letterSpacing:'-.02em', lineHeight:1.12, color:C.white, marginBottom:60, maxWidth:380 }}>
            Up and running in three steps.
          </h2>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:48 }}>
            {[
              { num:'01', title:'Wear it',  desc:"Clip or strap Navio to a bag, wrist, or belt. At 28g, they'll forget it's even there.", pill:C.yellow, text:C.purple },
              { num:'02', title:'Connect',  desc:'Open the app, scan the QR code, and link up to 5 trusted contacts who can view the live tracker.', pill:'rgba(255,255,255,.2)', text:C.white },
              { num:'03', title:'Track',    desc:'Watch the map update every second. Get push alerts when they arrive, leave, or press SOS.', pill:C.salmon, text:C.white },
            ].map(step => (
              <div key={step.num} style={{ display:'flex', gap:18 }}>
                <div style={{ width:46, height:46, borderRadius:9999, flexShrink:0, background:step.pill, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-display)', fontWeight:800, fontSize:12, color:step.text }}>
                  {step.num}
                </div>
                <div>
                  <h3 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:19, color:C.white, marginBottom:8 }}>{step.title}</h3>
                  <p style={{ color:'rgba(255,255,255,.6)', fontSize:15, lineHeight:1.65 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STORIES — white canvas ── */}
      <section id="stories" style={{ background:'#f8f9fa', padding:'96px 24px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <p style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:11, letterSpacing:'.14em', textTransform:'uppercase', color:C.salmon, marginBottom:12 }}>Stories</p>
          <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'clamp(30px,4vw,44px)', letterSpacing:'-.02em', lineHeight:1.12, color:C.purple, marginBottom:52, maxWidth:440 }}>
            Real families.<br/>Real peace of mind.
          </h2>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16 }}>
            {[
              { quote:"My daughter walks to school alone now. I used to worry every day. With Navio I just open the app and breathe.", name:'Maria Santos', role:'Parent of a 9-year-old', dot:C.yellow },
              { quote:"Dad has early-stage dementia. Navio means we can let him walk in the garden without anyone hovering. It changed everything.", name:'James Reyes', role:'Family caregiver', dot:C.teal },
              { quote:"One member twisted her ankle off-trail. The SOS alert got us to her in under 8 minutes. Navio is non-negotiable for our hikes.", name:'Lea Mendoza', role:'Trail runner', dot:C.salmon },
            ].map(t => (
              <div key={t.name} className="tcard" style={{ background:C.white, border:'1px solid rgba(47,12,51,.08)', padding:28 }}>
                <p style={{ color:'rgba(47,12,51,.65)', fontSize:15, lineHeight:1.75, marginBottom:20 }}>"{t.quote}"</p>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:t.dot, display:'inline-block', flexShrink:0 }} />
                  <div>
                    <p style={{ fontFamily:'var(--font-display)', fontWeight:700, color:C.purple, fontSize:14 }}>{t.name}</p>
                    <p style={{ color:'rgba(47,12,51,.4)', fontSize:12, marginTop:2 }}>{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER — yellow with teal button ── */}
      <section style={{ background:C.yellow, padding:'80px 24px', textAlign:'center' }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'clamp(32px,5vw,54px)', letterSpacing:'-.03em', lineHeight:1.1, color:C.purple, marginBottom:16 }}>
          Keep your loved ones<br/>safe today.
        </h2>
        <p style={{ color:'rgba(47,12,51,.55)', fontSize:17, marginBottom:36 }}>
          Join thousands of families who trust Navio every day.
        </p>
        {/* teal button on yellow — the logo combo */}
        <Link href="/tracker" className="pill" style={{ background:C.teal, color:C.white, fontSize:18, padding:'18px 44px', boxShadow:'0 10px 32px rgba(16,138,177,.3)' }}>
          Open Tracker →
        </Link>
      </section>

      {/* ── FOOTER — white, mirrors nav ── */}
      <footer style={{ background:C.white, borderTop:'1px solid rgba(47,12,51,.07)', padding:'44px 24px 36px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Image src="/Logo no bg.png" alt="Navio logo" width={28} height={28} style={{ objectFit:'contain' }} />
            <div>
              <p style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:18 }}>
                <span style={{ color:C.yellow }}>Nav</span><span style={{ color:C.teal }}>io</span>
              </p>
              <p style={{ color:'rgba(47,12,51,.35)', fontSize:12, marginTop:2 }}>Safety you can wear.</p>
            </div>
          </div>
          <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
            {[['Features','#features'],['How it works','#how-it-works'],['Stories','#stories'],['Tracker','/tracker']].map(([l,h]) => (
              <a key={l} href={h} style={{ color:'rgba(47,12,51,.4)', fontSize:14 }}
                onMouseEnter={e => (e.currentTarget.style.color = C.teal)}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(47,12,51,.4)')}>{l}</a>
            ))}
          </div>
          <p style={{ color:'rgba(47,12,51,.25)', fontSize:12 }}>© 2026 Navio. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
