/**
 * NewEra — app design (React + TypeScript)
 * Ported from the NewEra Redesign design component.
 *
 * Self-contained: no dependencies beyond react. All styling is inline.
 * Fonts: system SF Pro stack (falls back to Inter/system-ui).
 * The map area is a placeholder — mount your real Apple MapKit / react-native-maps
 * view there; the map itself is intentionally not restyled.
 */

import React, { useMemo, useState } from 'react';

/* ---------------------------------- theme ---------------------------------- */

export type ThemeMode = 'dark' | 'light';

export interface Theme {
  mode: ThemeMode;
  bg: string; bg2: string;
  surface: string; surface2: string;
  text: string; textDim: string;
  border: string;
  glassBg: string; glassBorder: string; glassShine: string;
  accent: string; accent2: string;
  /** page background (weather gradient) */
  pageBackground: string;
  /** foreground colors for content sitting on the accent hero gradient */
  heroFg: string; heroFgDim: string; heroChipBg: string; heroChipBorder: string;
  /** foreground for text on solid accent fills */
  accentFg: string;
}

const luminance = (hex: string): number => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

export function makeTheme(mode: ThemeMode): Theme {
  const isDark = mode === 'dark';
  // dark = "bad weather" stormy steel · light = clear-sky silver
  const [accent, accent2] = isDark ? ['#7d94a8', '#b8c8d4'] : ['#9fbdd4', '#d8e6f0'];

  const base = isDark
    ? 'linear-gradient(180deg, oklch(0.42 0.012 240) 0%, oklch(0.27 0.012 240) 45%, oklch(0.34 0.012 240) 100%)'
    : 'linear-gradient(180deg, #7ec6f0 0%, #b8dff6 30%, #eef7fc 62%, #e2f2e0 100%)';
  const mist = isDark
    ? 'radial-gradient(85% 42% at 50% 0%, oklch(1 0 0 / 0.16), transparent 70%)'
    : 'radial-gradient(55% 32% at 82% 0%, rgba(255,255,255,0.92), transparent 68%)';
  const glow = isDark ? 0.12 : 0.1;
  const pageBackground = [
    mist,
    `radial-gradient(120% 55% at 15% 100%, color-mix(in oklch, ${accent} ${glow * 100}%, transparent), transparent 60%)`,
    `radial-gradient(100% 55% at 100% 0%, color-mix(in oklch, ${accent2} ${glow * 80}%, transparent), transparent 58%)`,
    base,
  ].join(', ');

  const heroLight = (luminance(accent) + luminance(accent2)) / 2 > 0.62;

  return {
    mode,
    bg: isDark ? 'oklch(0.09 0.01 240)' : 'oklch(1 0 0)',
    bg2: isDark ? 'oklch(0.13 0.01 240)' : 'oklch(0.99 0.005 240)',
    surface: isDark ? 'oklch(0.17 0.01 238)' : 'oklch(1 0 0)',
    surface2: isDark ? 'oklch(0.22 0.01 238)' : 'oklch(0.96 0.008 220)',
    text: isDark ? 'oklch(0.97 0.004 240)' : 'oklch(0.15 0.01 240)',
    textDim: isDark ? 'oklch(0.65 0.012 240)' : 'oklch(0.48 0.01 240)',
    border: isDark ? 'oklch(1 0 0 / 0.13)' : 'oklch(0 0 0 / 0.08)',
    glassBg: isDark ? 'oklch(1 0 0 / 0.1)' : 'oklch(1 0 0 / 0.42)',
    glassBorder: isDark ? 'oklch(1 0 0 / 0.24)' : 'oklch(1 0 0 / 0.65)',
    glassShine: isDark ? 'oklch(1 0 0 / 0.35)' : 'oklch(1 0 0 / 0.95)',
    accent, accent2, pageBackground,
    heroFg: heroLight ? '#1a222b' : '#fff',
    heroFgDim: heroLight ? 'rgba(20,30,40,0.72)' : 'oklch(1 0 0 / 0.8)',
    heroChipBg: heroLight ? 'rgba(20,30,40,0.1)' : 'oklch(1 0 0 / 0.22)',
    heroChipBorder: heroLight ? 'rgba(20,30,40,0.28)' : 'oklch(1 0 0 / 0.4)',
    accentFg: luminance(accent) > 0.62 ? '#16202a' : '#fff',
  };
}

const displayFont = "-apple-system, 'SF Pro Display', Inter, system-ui, sans-serif";
const uiFont = 'Inter, system-ui, sans-serif';
const monoFont = 'ui-monospace, monospace';

const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* ------------------------------ shared pieces ------------------------------ */

const glassLayer = (t: Theme, radius: number): React.CSSProperties => ({
  position: 'absolute', inset: 0, borderRadius: radius,
  backdropFilter: 'blur(40px) saturate(220%)', WebkitBackdropFilter: 'blur(40px) saturate(220%)',
  background: t.glassBg,
});

const machinedEdge = (t: Theme, radius: number): React.CSSProperties => ({
  position: 'absolute', inset: 0, borderRadius: radius,
  border: `0.5px solid ${t.glassBorder}`,
  boxShadow: `inset 0 1.5px 1px ${t.glassShine}, inset 0 -1.5px 1px oklch(0 0 0 / 0.2)`,
});

const brushedTexture: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: 'repeating-linear-gradient(90deg, transparent 0 2px, oklch(0 0 0 / 0.02) 2px 3px)',
};

const StripedPlaceholder: React.FC<{ t: Theme; label?: string; children?: React.ReactNode; style?: React.CSSProperties }> = ({ t, label, children, style }) => (
  <div style={{
    background: `repeating-linear-gradient(135deg, ${t.surface2} 0 12px, ${t.surface} 12px 24px)`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', ...style,
  }}>
    {children}
    {label && <span style={{ fontFamily: monoFont, fontSize: 11, letterSpacing: 0.5, color: t.textDim }}>{label}</span>}
  </div>
);

/* ----------------------------------- logo ---------------------------------- */

export const TurbineLogo: React.FC<{ t: Theme }> = ({ t }) => (
  <div style={{
    fontFamily: displayFont, fontWeight: 800, fontSize: 32, letterSpacing: -0.5,
    color: t.text, display: 'flex', alignItems: 'center', gap: 8,
  }}>
    <svg width={30} height={34} viewBox="0 0 32 36" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <defs>
        <linearGradient id="ne-blade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.accent2} />
          <stop offset="1" stopColor={t.accent} />
        </linearGradient>
      </defs>
      <path d="M15.1 17L14 36h4l-1.1-19h-1.8z" fill={t.textDim} />
      <g style={{ transformOrigin: '16px 15px', animation: 'newera-spin 6s linear infinite' }}>
        {[0, 120, 240].map(deg => (
          <path key={deg} d="M16.8 15.5 L13.1 3.4 L15.2 0.2 L17.6 12.8 Z" fill="url(#ne-blade)"
            transform={deg ? `rotate(${deg} 16 15)` : undefined} />
        ))}
      </g>
      <path d="M16 12.4l2.3 1.3v2.6L16 17.6l-2.3-1.3v-2.6L16 12.4z" fill={t.text} />
    </svg>
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, filter: `drop-shadow(0 2px 5px color-mix(in oklch, ${t.accent} 45%, transparent))` }}>
      <span style={{ background: `linear-gradient(180deg, ${t.text} 30%, color-mix(in oklch, ${t.text} 45%, ${t.accent}))`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>New</span>
      <span style={{ background: `linear-gradient(135deg, ${t.accent} 10%, ${t.accent2} 55%, ${t.accent} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Era</span>
    </span>
  </div>
);

/* --------------------------------- tab bar --------------------------------- */

export type Tab = 'home' | 'find' | 'profile';

const TabIcon: React.FC<{ tab: Tab; active: boolean; t: Theme }> = ({ tab, active, t }) => {
  const c = active ? t.text : t.textDim;
  const w = active ? 2.2 : 1.8;
  const size = active ? 24 : 23;
  if (tab === 'home') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 11l9-8 9 8" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v10h14V10" fill={active ? c : 'none'} stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (tab === 'find') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke={c} strokeWidth={w} />
      <path d="M21 21l-4.3-4.3" stroke={c} strokeWidth={w} strokeLinecap="round" />
    </svg>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke={c} strokeWidth={w} />
      <path d="M4 20c0-4 3.6-6.5 8-6.5S20 16 20 20" stroke={c} strokeWidth={w} strokeLinecap="round" />
    </svg>
  );
};

export const GlassTabBar: React.FC<{ t: Theme; active: Tab; onChange: (tab: Tab) => void }> = ({ t, active, onChange }) => (
  <div style={{
    position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', width: 210,
    zIndex: 30, borderRadius: 34, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
  }}>
    <div style={glassLayer(t, 34)} />
    <div style={machinedEdge(t, 34)} />
    <div style={{ ...brushedTexture, borderRadius: 34 }} />
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '15px 4px' }}>
      {(['home', 'find', 'profile'] as Tab[]).map(tab => (
        <div key={tab} onClick={() => onChange(tab)}
          style={{ flex: 1, display: 'flex', justifyContent: 'center', cursor: tab === active ? 'default' : 'pointer' }}>
          <TabIcon tab={tab} active={tab === active} t={t} />
        </div>
      ))}
    </div>
  </div>
);

/* --------------------------------- screens --------------------------------- */

const HomeScreen: React.FC<{ t: Theme }> = ({ t }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
    {/* floating header */}
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: '58px 18px 14px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: `linear-gradient(to bottom, color-mix(in oklch, ${t.bg} 88%, transparent) 55%, transparent), linear-gradient(120deg, color-mix(in oklch, ${t.accent} 22%, transparent), color-mix(in oklch, ${t.accent2} 18%, transparent))`,
    }}>
      <TurbineLogo t={t} />
      {/* notification bell — glass */}
      <div style={{
        position: 'relative', width: 40, height: 40, borderRadius: '50%', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: t.glassBg, backdropFilter: 'blur(30px) saturate(220%)', WebkitBackdropFilter: 'blur(30px) saturate(220%)',
        border: `0.5px solid ${t.glassBorder}`, boxShadow: `inset 1px 1px 1px ${t.glassShine}`,
      }}>
        <svg width={17} height={17} viewBox="0 0 24 24" fill="none">
          <path d="M12 3a5 5 0 00-5 5v3.5c0 .8-.3 1.6-.9 2.2L4.5 15.2c-.7.7-.2 1.8.8 1.8h13.4c1 0 1.5-1.1.8-1.8l-1.6-1.5a3.2 3.2 0 01-.9-2.2V8a5 5 0 00-5-5z" stroke={t.text} strokeWidth={1.6} strokeLinejoin="round" />
          <path d="M9.5 19a2.5 2.5 0 005 0" stroke={t.text} strokeWidth={1.6} strokeLinecap="round" />
        </svg>
        <span style={{ position: 'absolute', top: 8, right: 9, width: 6, height: 6, borderRadius: '50%', background: t.accent, boxShadow: `0 0 6px ${t.accent}` }} />
      </div>
    </div>

    {/* map area — REPLACE with your real MapKit / react-native-maps view (unstyled) */}
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: 118, left: 16, zIndex: 15, width: 40, height: 40, borderRadius: 13,
        overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: t.glassBg, backdropFilter: 'blur(30px) saturate(220%)', WebkitBackdropFilter: 'blur(30px) saturate(220%)',
        border: `0.5px solid ${t.glassBorder}`, boxShadow: `inset 1px 1px 1px ${t.glassShine}, 0 4px 14px rgba(0,0,0,0.25)`,
      }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" stroke={t.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <StripedPlaceholder t={t} style={{ position: 'absolute', inset: 0, flexDirection: 'column', gap: 8 }}
        label="apple maps view · unchanged">
        <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
          <path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2z" stroke={t.textDim} strokeWidth={1.6} strokeLinejoin="round" />
          <path d="M9 3v16M15 5v16" stroke={t.textDim} strokeWidth={1.6} />
        </svg>
      </StripedPlaceholder>
      <div style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 -60px 60px -30px color-mix(in oklch, ${t.bg} 70%, transparent)` }} />
    </div>
  </div>
);

interface FindResult { name: string; addr: string; tag: 'NEARBY' | 'FAR'; tileAccent2?: boolean }

const FIND_RESULTS: FindResult[] = [
  { name: 'Paragraph', addr: 'Grigolеti – Shekvetili – Kobuleti hwy', tag: 'NEARBY' },
  { name: 'Paragraph Tabori', addr: 'Taboris Mta Street, Shindisi, Kala', tag: 'NEARBY', tileAccent2: true },
  { name: 'Paragraph Tbilisi', addr: 'Lado Gudiashvili Street, Mtatsminda', tag: 'NEARBY' },
  { name: 'Paragraf', addr: 'Růžová, okres Děčín, Ústí nad Labem', tag: 'FAR', tileAccent2: true },
  { name: 'Paragraph', addr: '156, вуліца Прытыцкага, Krasny Bor', tag: 'FAR' },
];

const FindScreen: React.FC<{ t: Theme }> = ({ t }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '58px 18px 0', boxSizing: 'border-box', position: 'relative' }}>
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontFamily: displayFont, fontWeight: 800, fontSize: 34, letterSpacing: -0.6, lineHeight: 1, width: 'fit-content',
        background: `linear-gradient(180deg, ${t.text} 25%, color-mix(in oklch, ${t.text} 40%, ${t.accent}) 75%, ${t.accent})`,
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        filter: `drop-shadow(0 2px 6px color-mix(in oklch, ${t.accent} 40%, transparent))`,
      }}>Find</div>
      <div style={{ width: 46, height: 4, borderRadius: 2, background: `linear-gradient(90deg, ${t.accent}, ${t.accent2})`, marginTop: 6 }} />
    </div>

    {/* filter chips */}
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      <div style={{ padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 800, letterSpacing: 0.3, background: t.accent, color: t.accentFg }}>Places</div>
      {['People', 'Saved'].map(label => (
        <div key={label} style={{
          padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, color: t.text,
          background: t.glassBg, backdropFilter: 'blur(30px) saturate(220%)', WebkitBackdropFilter: 'blur(30px) saturate(220%)',
          border: `0.5px solid ${t.glassBorder}`,
        }}>{label}</div>
      ))}
    </div>

    {/* search bar */}
    <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', marginBottom: 22, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
      <div style={{ ...glassLayer(t, 22), backdropFilter: 'blur(32px) saturate(210%)', WebkitBackdropFilter: 'blur(32px) saturate(210%)' }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: 22, border: `1px solid ${t.accent}`, boxShadow: `inset 1px 1px 1px ${t.glassShine}, 0 0 0 3px color-mix(in oklch, ${t.accent} 18%, transparent)` }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px' }}>
        <svg width={17} height={17} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="7" stroke={t.textDim} strokeWidth={2} />
          <path d="M21 21l-4.3-4.3" stroke={t.textDim} strokeWidth={2} strokeLinecap="round" />
        </svg>
        <span style={{ color: t.text, fontSize: 15, fontWeight: 500 }}>paragraph</span>
        <span style={{ width: 1.5, height: 16, background: t.accent, animation: 'newera-pulse 1s infinite' }} />
      </div>
    </div>

    <div style={{ fontFamily: monoFont, fontSize: 10.5, letterSpacing: 1.6, color: t.textDim, marginBottom: 10 }}>{'// TOP RESULTS'}</div>

    {/* results — Spotify-style rows */}
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 130 }}>
      {FIND_RESULTS.map((r, i) => {
        const tile = r.tileAccent2 ? t.accent2 : t.accent;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 2px', borderBottom: `1px solid ${t.border}` }}>
            <div style={{ width: 52, height: 52, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(155deg, ${tile}, color-mix(in oklch, ${tile} 45%, #000))`, boxShadow: `0 6px 14px color-mix(in oklch, ${tile} 35%, transparent)` }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <path d="M12 2C8 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3-7-7-7z" fill="#0d0c0c" />
                <circle cx="12" cy="9" r="2.4" fill={tile} />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: t.text, fontWeight: 800, fontSize: 16, letterSpacing: -0.2 }}>{r.name}</div>
              <div style={{ color: t.textDim, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{r.addr}</div>
            </div>
            <div style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, color: t.textDim }}>{r.tag}</div>
          </div>
        );
      })}
    </div>
  </div>
);

const PIN_TILES: { label?: string; height: number }[][] = [
  [{ label: 'photo: didubeee', height: 206 }, { height: 150 }],
  [{ label: 'photo: wemura', height: 170 }, { label: 'photo: arrggg', height: 236 }, { height: 140 }],
];

const ProfileScreen: React.FC<{ t: Theme; displayName: string; onOpenSettings: () => void }> = ({ t, displayName, onOpenSettings }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
    <div style={{ flex: 1, overflow: 'auto', padding: '58px 18px 110px', boxSizing: 'border-box' }}>
      {/* gradient hero card */}
      <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', padding: 18, marginBottom: 22, boxShadow: `0 10px 26px color-mix(in oklch, ${t.accent} 30%, transparent)` }}>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${t.accent} 0%, color-mix(in oklch, ${t.accent} 55%, ${t.accent2}) 55%, ${t.accent2} 100%)` }} />
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(90deg, transparent 0 2px, oklch(0 0 0 / 0.035) 2px 3px)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 45% at 85% 0%, oklch(1 0 0 / 0.55), transparent 65%)' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: 22, boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.6), inset 0 -1px 0 oklch(0 0 0 / 0.25)', border: '1px solid oklch(0 0 0 / 0.18)' }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 30, letterSpacing: -0.6, color: t.heroFg }}>{displayName}</div>
          <div onClick={onOpenSettings} style={{
            width: 38, height: 38, borderRadius: '50%', position: 'relative', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            background: t.heroChipBg, backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: `0.5px solid ${t.heroChipBorder}`,
          }}>
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" stroke={t.heroFg} strokeWidth={1.7} />
              <path d="M19.4 13.5a7.6 7.6 0 000-3l2-1.5-2-3.4-2.3.9a7.6 7.6 0 00-2.6-1.5L14 2.5h-4l-.5 2.5a7.6 7.6 0 00-2.6 1.5l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 000 3l-2 1.5 2 3.4 2.3-.9c.8.7 1.7 1.2 2.6 1.5l.5 2.5h4l.5-2.5a7.6 7.6 0 002.6-1.5l2.3.9 2-3.4-2-1.5z" stroke={t.heroFg} strokeWidth={1.4} strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
            <div style={{ width: 90, height: 90, borderRadius: '50%', overflow: 'hidden', border: `2.5px solid ${t.heroFg}`, boxShadow: '0 6px 18px rgba(0,0,0,0.25)' }}>
              {/* avatar placeholder — drop the user photo here */}
              <div style={{ width: '100%', height: '100%', background: 'repeating-linear-gradient(135deg, oklch(1 0 0 / 0.3) 0 8px, oklch(1 0 0 / 0.15) 8px 16px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="9" r="3.4" stroke={t.heroFg} strokeWidth={1.5} />
                  <path d="M5 20c0-3.6 3.1-5.8 7-5.8s7 2.2 7 5.8" stroke={t.heroFg} strokeWidth={1.5} strokeLinecap="round" />
                </svg>
              </div>
            </div>
            <div style={{ position: 'absolute', bottom: -2, right: -2, width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: `2.5px solid ${t.accent}`, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                <path d="M4 8h3l1.5-2h7L17 8h3v11H4V8z" stroke={t.accent} strokeWidth={1.8} strokeLinejoin="round" />
                <circle cx="12" cy="13.5" r="3.2" stroke={t.accent} strokeWidth={1.8} />
              </svg>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {([['0', 'Connections'], ['6', 'Pins'], ['0', 'Streak']] as const).map(([n, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 19, fontWeight: 800, color: t.heroFg }}>{n}</span>
                <span style={{ fontSize: 13, color: t.heroFgDim, fontWeight: 600 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 21, letterSpacing: -0.3, color: t.text }}>Your pins</div>
        <div style={{ fontFamily: monoFont, fontSize: 10.5, letterSpacing: 1, color: t.textDim }}>[ 06 SAVED ]</div>
      </div>

      {/* masonry pin grid — replace placeholders with real pin photos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
        {PIN_TILES.map((col, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {col.map((tile, ti) => (
              <div key={ti} style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', height: tile.height, background: `repeating-linear-gradient(135deg, ${t.surface2} 0 12px, ${t.surface} 12px 24px)`, display: 'flex', alignItems: 'flex-end' }}>
                {tile.label && <>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.3), transparent 45%)' }} />
                  <div style={{ position: 'relative', padding: '9px 10px', fontFamily: monoFont, fontSize: 10.5, color: t.textDim }}>{tile.label}</div>
                </>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ------------------------------ settings sheet ----------------------------- */

const SettingsSheet: React.FC<{
  t: Theme;
  displayName: string;
  onNameChange: (name: string) => void;
  onClose: () => void;
  onSetTheme: (mode: ThemeMode) => void;
}> = ({ t, displayName, onNameChange, onClose, onSetTheme }) => {
  const sectionLabel: React.CSSProperties = { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: t.textDim, fontWeight: 700, marginBottom: 9 };
  const card: React.CSSProperties = { borderRadius: 14, background: t.surface, border: `1px solid ${t.border}`, padding: '13px 15px' };
  const isDark = t.mode === 'dark';

  const appearanceChip = (label: string, icon: React.ReactNode, active: boolean, onClick?: () => void, dim?: boolean) => (
    <div onClick={onClick} style={{
      borderRadius: 14, padding: '16px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
      cursor: 'pointer', background: active ? t.accent : t.surface, border: `1px solid ${active ? t.accent : t.border}`,
    }}>
      {icon}
      <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? t.accentFg : dim ? t.textDim : t.text }}>{label}</span>
    </div>
  );

  const chipFg = (active: boolean, dim?: boolean) => active ? t.accentFg : dim ? t.textDim : t.text;

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.45)' }} onClick={onClose} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 61, borderRadius: '26px 26px 0 0', overflow: 'hidden', maxHeight: '88%', display: 'flex', flexDirection: 'column', boxShadow: '0 -10px 40px rgba(0,0,0,0.4)' }}>
        {/* liquid glass panel */}
        <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(44px) saturate(200%)', WebkitBackdropFilter: 'blur(44px) saturate(200%)', background: `color-mix(in oklch, ${t.bg2} 55%, transparent)` }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '26px 26px 0 0', border: `0.5px solid ${t.glassBorder}`, borderBottom: 'none', boxShadow: `inset 0 1.5px 1px ${t.glassShine}` }} />

        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', paddingTop: 9 }}>
          <div style={{ width: 36, height: 4.5, borderRadius: 3, background: t.border }} />
        </div>
        <div style={{ position: 'relative', overflow: 'auto', padding: '14px 20px 34px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <div style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 26, letterSpacing: -0.4, color: t.text }}>Settings</div>
            <div onClick={onClose} style={{ color: t.accent, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Done</div>
          </div>

          <div style={sectionLabel}>Appearance</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9, marginBottom: 24 }}>
            {appearanceChip('Light', (
              <svg width={19} height={19} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4.5" stroke={chipFg(!isDark)} strokeWidth={1.7} />
                <path d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M19 5l-1.8 1.8M6.8 17.2 5 19M19 19l-1.8-1.8M6.8 6.8 5 5" stroke={chipFg(!isDark)} strokeWidth={1.7} strokeLinecap="round" />
              </svg>
            ), !isDark, () => onSetTheme('light'))}
            {appearanceChip('Dark', (
              <svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                <path d="M20 14.5A8.5 8.5 0 1110 3.2a7 7 0 0010 11.3z" fill={chipFg(isDark)} />
              </svg>
            ), isDark, () => onSetTheme('dark'))}
            {appearanceChip('System', (
              <svg width={15} height={17} viewBox="0 0 24 24" fill="none">
                <rect x="6" y="2" width="12" height="20" rx="2.5" stroke={t.textDim} strokeWidth={1.7} />
              </svg>
            ), false, undefined, true)}
          </div>

          <div style={sectionLabel}>Display name</div>
          <div style={{ ...card, marginBottom: 12 }}>
            <input value={displayName} onChange={e => onNameChange(e.target.value)}
              style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: t.text, fontSize: 15, fontFamily: uiFont, boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 26 }}>
            {/* machined-silver industrial button */}
            <div style={{
              borderRadius: 9, padding: '10px 24px', fontWeight: 800, fontSize: 13, letterSpacing: 0.4, color: '#1a1d20',
              background: 'linear-gradient(180deg, #eef1f3, #c4ccd2 60%, #b2bcc3)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.25), 0 3px 8px rgba(0,0,0,0.2)',
              border: '1px solid rgba(0,0,0,0.25)', cursor: 'pointer',
            }}>SAVE</div>
          </div>

          <div style={sectionLabel}>Account</div>
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ fontSize: 11.5, color: t.textDim, marginBottom: 3 }}>Signed in as</div>
            <div style={{ fontSize: 14.5, color: t.text, fontWeight: 600 }}>beka.natchkebia.1@btu.edu.ge</div>
          </div>

          <div style={{
            borderRadius: 14, padding: 13, textAlign: 'center', fontWeight: 700, fontSize: 14.5, color: t.accent,
            border: `1px solid color-mix(in oklch, ${t.accent} 55%, transparent)`,
            background: `color-mix(in oklch, ${t.accent} 10%, transparent)`, cursor: 'pointer',
          }}>Sign out</div>
        </div>
      </div>
    </>
  );
};

/* ----------------------------------- app ----------------------------------- */

export interface NewEraAppProps {
  initialTheme?: ThemeMode;
  /** 0–0.18 film-grain overlay strength */
  grainIntensity?: number;
}

export const NewEraApp: React.FC<NewEraAppProps> = ({ initialTheme = 'dark', grainIntensity = 0.05 }) => {
  const [mode, setMode] = useState<ThemeMode>(initialTheme);
  const [tab, setTab] = useState<Tab>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displayName, setDisplayName] = useState('lieh');
  const t = useMemo(() => makeTheme(mode), [mode]);

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
      background: t.pageBackground, fontFamily: uiFont,
    }}>
      <style>{`
        @keyframes newera-pulse{0%,100%{opacity:.55}50%{opacity:1}}
        @keyframes newera-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      `}</style>

      {/* film grain */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none', mixBlendMode: 'overlay',
        backgroundImage: GRAIN_URI, opacity: grainIntensity,
      }} />

      {tab === 'home' && <HomeScreen t={t} />}
      {tab === 'find' && <FindScreen t={t} />}
      {tab === 'profile' && (
        <ProfileScreen t={t} displayName={displayName} onOpenSettings={() => setSettingsOpen(true)} />
      )}

      <GlassTabBar t={t} active={tab} onChange={next => { setTab(next); setSettingsOpen(false); }} />

      {settingsOpen && tab === 'profile' && (
        <SettingsSheet
          t={t}
          displayName={displayName}
          onNameChange={setDisplayName}
          onClose={() => setSettingsOpen(false)}
          onSetTheme={setMode}
        />
      )}
    </div>
  );
};

export default NewEraApp;
