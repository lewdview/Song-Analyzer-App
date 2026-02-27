import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, LogOut, Sparkles } from 'lucide-react';
import { analyzeCreativeLyrics, type CreativeEngineResult, type HeatmapPoint } from '@/services/creativeEngine';
import { fetchOwnSharedProfile, sharedSupabase, type SharedProfile } from '@/services/sharedSupabase';
import './tooldrop.css';

type GateState = 'loading' | 'needs_auth' | 'forbidden' | 'ready' | 'error';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sentimentPillColor(score: number): string {
  if (score >= 0.2) return 'rgba(34,197,94,0.2)';
  if (score <= -0.2) return 'rgba(239,68,68,0.2)';
  return 'rgba(148,163,184,0.25)';
}

function heatmapBackground(point: HeatmapPoint): string {
  const sentiment = clamp(point.sentiment, -1, 1);
  const intensity = clamp(point.intensity, 0, 1);

  // Heat gradient via HSL:
  //   negative sentiment → cool blue (hue ~220)
  //   neutral            → desaturated gray
  //   positive sentiment → warm amber→red (hue ~10-40)
  // Intensity controls saturation + opacity

  let hue: number;
  let saturation: number;
  let lightness: number;

  if (sentiment >= 0) {
    // Warm: lerp from amber (40) down to red-orange (10) as sentiment rises
    hue = 40 - sentiment * 30;
    saturation = 30 + sentiment * 55 + intensity * 15;
    lightness = 18 + sentiment * 12 + intensity * 8;
  } else {
    // Cool: lerp from gray-blue (210) up to deep blue (230)
    const absSent = Math.abs(sentiment);
    hue = 210 + absSent * 20;
    saturation = 25 + absSent * 50 + intensity * 15;
    lightness = 18 + absSent * 8 + intensity * 6;
  }

  const alpha = 0.35 + Math.abs(sentiment) * 0.35 + intensity * 0.25;
  return `hsla(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%, ${Math.min(alpha, 0.95).toFixed(2)})`;
}

export function TooldropPage() {
  const isDevMode = (import.meta as any).env.DEV;
  const [gateState, setGateState] = useState<GateState>('loading');
  const [gateMessage, setGateMessage] = useState('');
  const [profile, setProfile] = useState<SharedProfile | null>(null);
  const [artistName, setArtistName] = useState('');
  const [lyricsInput, setLyricsInput] = useState('');
  const [applyArtistName, setApplyArtistName] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<CreativeEngineResult | null>(null);
  const [magicEmail, setMagicEmail] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    let active = true;

    const hydrateAccess = async () => {
      setGateState('loading');
      setGateMessage('');

      try {
        const {
          data: { session },
          error,
        } = await sharedSupabase.auth.getSession();

        if (error) {
          if (!active) return;
          setGateState('error');
          setGateMessage(error.message);
          return;
        }

        const user = session?.user;
        if (!user) {
          if (!active) return;
          setProfile(null);
          setGateState('needs_auth');
          return;
        }

        let ownProfile = await fetchOwnSharedProfile(user.id);
        if (!ownProfile) {
          const fallbackName =
            typeof user.user_metadata?.full_name === 'string'
              ? user.user_metadata.full_name
              : typeof user.user_metadata?.name === 'string'
                ? user.user_metadata.name
                : null;

          const { error: upsertError } = await sharedSupabase
            .from('profiles')
            .upsert({ id: user.id, display_name: fallbackName, lab_access: false });

          if (upsertError) {
            if (!active) return;
            setGateState('error');
            setGateMessage(upsertError.message);
            return;
          }

          ownProfile = await fetchOwnSharedProfile(user.id);
        }

        if (!active) return;
        setProfile(ownProfile);
        const nameFromProfile = ownProfile?.display_name?.trim();
        if (nameFromProfile) {
          setArtistName((prev) => (prev.trim().length > 0 ? prev : nameFromProfile));
        }

        if (!ownProfile?.lab_access) {
          setGateState('forbidden');
          setGateMessage('Lab access is disabled for this account.');
          return;
        }

        setGateState('ready');
      } catch (error) {
        if (!active) return;
        setGateState('error');
        setGateMessage(error instanceof Error ? error.message : 'Access check failed');
      }
    };

    void hydrateAccess();

    const { data: listener } = sharedSupabase.auth.onAuthStateChange(() => {
      void hydrateAccess();
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const posterArtistLine = useMemo(() => {
    if (!applyArtistName) return 'Tooldrop Lab';
    const cleaned = artistName.trim();
    return cleaned.length > 0 ? cleaned : 'Your Artist Name';
  }, [applyArtistName, artistName]);

  const sentimentPercent = analysis ? Math.round(analysis.sentimentScore * 100) : 0;

  const handleMagicLinkSignIn = async () => {
    if (!magicEmail.trim()) {
      setGateMessage('Enter an email for magic link sign in.');
      return;
    }

    setIsSigningIn(true);
    const { error } = await sharedSupabase.auth.signInWithOtp({
      email: magicEmail.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    setIsSigningIn(false);

    if (error) {
      setGateMessage(error.message);
      return;
    }

    setGateMessage('Magic link sent. Check your inbox.');
    setMagicEmail('');
  };

  const handleGithubSignIn = async () => {
    setIsSigningIn(true);
    const { error } = await sharedSupabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin,
      },
    });
    setIsSigningIn(false);

    if (error) {
      setGateMessage(error.message);
    }
  };

  const handleBaseWalletSignIn = async () => {
    const wallet = (window as { ethereum?: unknown }).ethereum as {
      request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    } | undefined;

    if (!wallet?.request) {
      setGateMessage('No Base-compatible wallet detected.');
      return;
    }

    setIsSigningIn(true);
    const { error } = await sharedSupabase.auth.signInWithWeb3({
      chain: 'ethereum',
      wallet: wallet as never,
      statement: 'Sign in to th3scr1b3 on Base.',
      options: {
        url: window.location.origin,
        signInWithEthereum: {
          chainId: 8453,
        },
      },
    });
    setIsSigningIn(false);

    if (error) {
      setGateMessage(error.message);
    }
  };

  const handleSignOut = async () => {
    const { error } = await sharedSupabase.auth.signOut();
    if (error) {
      setGateMessage(error.message);
    }
  };

  const handleAnalyze = async () => {
    const input = lyricsInput.trim();
    if (input.length < 12) {
      setGateMessage('Paste a few more lines so analysis quality is usable.');
      return;
    }

    setGateMessage('');
    setIsAnalyzing(true);

    await new Promise((resolve) => setTimeout(resolve, 320));

    const next = analyzeCreativeLyrics(input);
    setAnalysis(next);
    setIsAnalyzing(false);
  };

  if (gateState === 'loading') {
    return (
      <main className="td-page">
        <div className="td-shell td-shell--narrow td-center-copy">
          <p>Checking access...</p>
        </div>
      </main>
    );
  }

  if (gateState === 'needs_auth') {
    return (
      <main className="td-page">
        <div className="td-shell td-shell--narrow">
          <section className="td-card">
            <h1 className="td-title">The Creative Engine</h1>
            <p className="td-subtitle">Sign in with your shared account to continue.</p>

            <div className="td-stack">
              <button
                type="button"
                onClick={() => {
                  void handleGithubSignIn();
                }}
                disabled={isSigningIn}
                className="td-btn td-btn--ghost"
              >
                Continue With GitHub
              </button>

              <div className="td-divider">or</div>

              <input
                type="email"
                value={magicEmail}
                onChange={(event) => setMagicEmail(event.target.value)}
                placeholder="Email for magic link"
                className="td-input"
              />

              <div className="td-row td-row--wrap">
                <button
                  type="button"
                  onClick={() => {
                    void handleMagicLinkSignIn();
                  }}
                  disabled={isSigningIn}
                  className="td-btn td-btn--accent"
                >
                  Send Magic Link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleBaseWalletSignIn();
                  }}
                  disabled={isSigningIn}
                  className="td-btn td-btn--wallet"
                >
                  Sign In With Base Wallet
                </button>
              </div>
            </div>
            {gateMessage && <p className="td-message td-message--error">{gateMessage}</p>}
            {isDevMode && (
              <div className="td-row td-row--wrap">
                <Link to="/studio" className="td-btn td-btn--ghost td-btn--small">
                  Studio
                </Link>
                <Link to="/original" className="td-btn td-btn--ghost td-btn--small">
                  Original Analyzer
                </Link>
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  if (gateState === 'forbidden') {
    return (
      <main className="td-page">
        <div className="td-shell td-shell--narrow">
          <section className="td-card td-card--warning td-center-copy">
            <Lock size={40} />
            <h1 className="td-title">Lab Access Required</h1>
            <p>{gateMessage || 'Your account does not have lab access yet.'}</p>
            <p className="td-subtitle">Ask admin to set `profiles.lab_access = true` for your account.</p>
            <div>
              <button
                type="button"
                onClick={() => {
                  void handleSignOut();
                }}
                className="td-btn td-btn--warning"
              >
                Sign Out
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (gateState === 'error') {
    return (
      <main className="td-page">
        <div className="td-shell td-shell--narrow td-center-copy">
          <p className="td-message td-message--error">{gateMessage || 'Failed to load access state.'}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="td-page">
      <div className="td-shell">
        <header className="td-header">
          <div>
            <p className="td-eyebrow">Tooldrop</p>
            <h1 className="td-title">The Creative Engine</h1>
          </div>
          <div className="td-row td-row--wrap td-header-actions">
            <span className="td-subtitle td-subtitle--compact">{profile?.display_name || 'Signed In'}</span>
            <button
              type="button"
              onClick={() => {
                void handleSignOut();
              }}
              className="td-btn td-btn--ghost td-btn--small"
            >
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        <section className="td-card">
          <p className="td-eyebrow">Paste your lyrics below.</p>
          <p className="td-subtitle">See what your music says about you.</p>

          <textarea
            value={lyricsInput}
            onChange={(event) => setLyricsInput(event.target.value)}
            placeholder="Paste lyrics here..."
            className="td-textarea"
          />

          {/* Live word & line count */}
          {lyricsInput.trim().length > 0 && (
            <div className="td-word-count">
              {lyricsInput.trim().split(/\s+/).length} words · {lyricsInput.trim().split('\n').filter(Boolean).length} lines
            </div>
          )}

          <div className="td-row td-row--wrap td-controls">
            <button
              type="button"
              onClick={() => {
                void handleAnalyze();
              }}
              disabled={isAnalyzing}
              className={`td-btn td-btn--primary${lyricsInput.trim().length >= 12 && !isAnalyzing ? ' td-btn--glow' : ''}`}
            >
              {isAnalyzing ? 'Analyzing...' : 'Analyze'}
            </button>

            <label className="td-checkbox-label">
              <input
                type="checkbox"
                checked={applyArtistName}
                onChange={(event) => setApplyArtistName(event.target.checked)}
              />
              Apply Your Artist Name
            </label>

            <input
              value={artistName}
              onChange={(event) => setArtistName(event.target.value)}
              placeholder="Artist name"
              className="td-input td-input--small"
            />
          </div>

          {gateMessage && <p className="td-message td-message--warning">{gateMessage}</p>}
        </section>

        {/* Shimmer loading overlay */}
        {isAnalyzing && (
          <section className="td-card td-shimmer-card">
            <div className="td-shimmer-bar td-shimmer-bar--wide" />
            <div className="td-shimmer-bar td-shimmer-bar--medium" />
            <div className="td-shimmer-bar td-shimmer-bar--narrow" />
          </section>
        )}

        {analysis && (
          <section className="td-results">
            <div className="td-card td-card--success">
              <div className="td-row">
                <Sparkles size={16} />
                <p className="td-title td-title--small">Analysis Complete</p>
              </div>
              <p className="td-subtitle">
                {analysis.wordCount} words · Arc: {analysis.narrativeArc} · Confidence {analysis.confidence}%
              </p>
              <div className="td-meter-track" style={{ marginTop: '0.5rem' }}>
                <div
                  className="td-meter-fill td-meter-fill--emerald"
                  style={{ width: `${analysis.confidence}%` }}
                />
              </div>
            </div>

            <div className="td-grid">
              <article className="td-card td-card--panel">
                <h2 className="td-title td-title--small">Mood Breakdown</h2>
                <div className="td-stack td-stack--tight">
                  {analysis.moodBreakdown.map((point) => (
                    <div key={point.mood}>
                      <div className="td-row td-row--between td-meter-head">
                        <span>{point.mood}</span>
                        <span>{point.score}%</span>
                      </div>
                      <div className="td-meter-track">
                        <div className="td-meter-fill td-meter-fill--cyan" style={{ width: `${point.score}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="td-card td-card--panel">
                <h2 className="td-title td-title--small">Themes</h2>
                <div className="td-chip-wrap">
                  {analysis.themes.map((theme) => (
                    <span key={theme} className="td-chip">
                      {theme}
                    </span>
                  ))}
                </div>
                {analysis.topKeywords.length > 0 && (
                  <>
                    <h3 className="td-title td-title--small" style={{ marginTop: '0.75rem' }}>Top Keywords</h3>
                    <div className="td-chip-wrap">
                      {analysis.topKeywords.map((kw) => (
                        <span key={kw} className="td-chip td-chip--keyword">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </article>

              <article className="td-card td-card--panel">
                <h2 className="td-title td-title--small">Sentiment Score</h2>
                <div className="td-pill" style={{ background: sentimentPillColor(analysis.sentimentScore) }}>
                  <span>{analysis.sentimentLabel}</span>
                  <span>{sentimentPercent}</span>
                </div>
                <div className="td-chip-wrap" style={{ marginTop: '0.5rem' }}>
                  <span className="td-chip td-chip--arc">{analysis.narrativeArc} arc</span>
                  <span className="td-chip td-chip--emotion">{analysis.dominantEmotion}</span>
                </div>
              </article>

              <article className="td-card td-card--panel">
                <h2 className="td-title td-title--small">Lyric DNA</h2>
                <div className="td-stack td-stack--tight">
                  <div>
                    <div className="td-row td-row--between td-meter-head">
                      <span>Energy</span>
                      <span>{analysis.energyScore}</span>
                    </div>
                    <div className="td-meter-track">
                      <div className="td-meter-fill td-meter-fill--fuchsia" style={{ width: `${analysis.energyScore}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="td-row td-row--between td-meter-head">
                      <span>Emotion</span>
                      <span>{analysis.emotionScore}</span>
                    </div>
                    <div className="td-meter-track">
                      <div className="td-meter-fill td-meter-fill--amber" style={{ width: `${analysis.emotionScore}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="td-row td-row--between td-meter-head">
                      <span>Vocab Richness</span>
                      <span>{analysis.vocabularyRichness}</span>
                    </div>
                    <div className="td-meter-track">
                      <div className="td-meter-fill td-meter-fill--emerald" style={{ width: `${analysis.vocabularyRichness}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="td-row td-row--between td-meter-head">
                      <span>Repetition</span>
                      <span>{analysis.repetitionScore}</span>
                    </div>
                    <div className="td-meter-track">
                      <div className="td-meter-fill td-meter-fill--rose" style={{ width: `${analysis.repetitionScore}%` }} />
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <article className="td-card td-card--panel">
              <h2 className="td-title td-title--small">Craft &amp; Complexity</h2>
              <div className="td-grid">
                <div className="td-stack td-stack--tight">
                  <div>
                    <div className="td-row td-row--between td-meter-head">
                      <span>Imagery Density</span>
                      <span>{analysis.imageryDensity}</span>
                    </div>
                    <div className="td-meter-track">
                      <div className="td-meter-fill td-meter-fill--violet" style={{ width: `${analysis.imageryDensity}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="td-row td-row--between td-meter-head">
                      <span>Rhyme Score</span>
                      <span>{analysis.rhymeScore}</span>
                    </div>
                    <div className="td-meter-track">
                      <div className="td-meter-fill td-meter-fill--sky" style={{ width: `${analysis.rhymeScore}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="td-row td-row--between td-meter-head">
                      <span>Emotional Complexity</span>
                      <span>{analysis.emotionalComplexity}</span>
                    </div>
                    <div className="td-meter-track">
                      <div className="td-meter-fill td-meter-fill--orange" style={{ width: `${analysis.emotionalComplexity}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </article>

            <article className="td-card td-card--panel">
              <h2 className="td-title td-title--small">Visual Heatmap</h2>
              <div className="td-stack td-stack--tight td-heatmap-scroll">
                {analysis.heatmap.map((point, index) => {
                  const s = clamp(point.sentiment, -1, 1);
                  const borderHue = s >= 0 ? Math.round(40 - s * 30) : Math.round(210 + Math.abs(s) * 20);
                  const borderSat = Math.round(40 + Math.abs(s) * 45);
                  const borderLight = Math.round(35 + Math.abs(s) * 15);
                  return (
                    <div
                      key={`${index}-${point.line.slice(0, 16)}`}
                      className="td-heat-row"
                      style={{
                        background: heatmapBackground(point),
                        borderLeftColor: `hsl(${borderHue}, ${borderSat}%, ${borderLight}%)`,
                      }}
                    >
                      {point.line}
                    </div>
                  );
                })}
              </div>
            </article>

            {analysis.chorusLines.length > 0 && (
              <article className="td-card td-card--panel">
                <h2 className="td-title td-title--small">Detected Chorus / Hook</h2>
                <div className="td-stack td-stack--tight">
                  {analysis.chorusLines.map((line, index) => (
                    <div key={`chorus-${index}`} className="td-heat-row td-heat-row--chorus">
                      {line}
                    </div>
                  ))}
                </div>
              </article>
            )}

            <article className="td-card td-card--panel">
              <h2 className="td-title td-title--small">Poster Preview</h2>
              <div className="td-poster">
                {/* === Large background animation (atmospheric) === */}
                <div className="td-poster-svg-wrap td-poster-svg-wrap--lg">
                  <svg viewBox="0 0 200 200" className="td-poster-svg" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <radialGradient id="core-glow-lg">
                        <stop offset="0%" stopColor={analysis.sentimentScore >= 0 ? '#fbbf24' : '#38bdf8'} stopOpacity="0.6" />
                        <stop offset="100%" stopColor={analysis.sentimentScore >= 0 ? '#f97316' : '#6366f1'} stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    <circle cx="100" cy="100" r={20 + analysis.emotionScore * 0.25} fill="url(#core-glow-lg)" className="td-svg-pulse" style={{ animationDuration: `${3 - analysis.energyScore * 0.015}s` }} />
                    <circle cx="100" cy="100" r="18" fill="none" stroke={analysis.sentimentScore >= 0 ? '#fbbf24' : '#67e8f9'} strokeWidth="1.5" strokeOpacity={0.3 + analysis.confidence * 0.006} className="td-svg-pulse" style={{ animationDuration: `${2.5 - analysis.energyScore * 0.01}s` }} />
                    <circle cx="100" cy="100" r="35" fill="none" stroke={analysis.sentimentScore >= 0 ? '#f59e0b' : '#818cf8'} strokeWidth="1.2" strokeOpacity="0.7" strokeDasharray="30 190" strokeLinecap="round" className="td-svg-orbit" style={{ animationDuration: `${6 - analysis.energyScore * 0.035}s` }} />
                    <circle cx="100" cy="100" r="52" fill="none" stroke={analysis.sentimentScore >= 0 ? '#fbbf24' : '#67e8f9'} strokeWidth="1" strokeOpacity="0.55" strokeDasharray="50 280" strokeLinecap="round" className="td-svg-orbit-reverse" style={{ animationDuration: `${8 - analysis.energyScore * 0.04}s` }} />
                    <circle cx="100" cy="100" r="70" fill="none" stroke={analysis.sentimentScore >= 0 ? '#fb923c' : '#a5b4fc'} strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="40 400" strokeLinecap="round" className="td-svg-orbit" style={{ animationDuration: `${12 - analysis.energyScore * 0.06}s` }} />
                    {Array.from({ length: Math.max(4, Math.round(analysis.emotionalComplexity / 12)) }, (_, i) => {
                      const count = Math.max(4, Math.round(analysis.emotionalComplexity / 12));
                      const rad = ((i / count) * 360 * Math.PI) / 180;
                      const x1 = 100 + Math.cos(rad) * 24, y1 = 100 + Math.sin(rad) * 24;
                      const x2 = 100 + Math.cos(rad) * (40 + analysis.confidence * 0.45), y2 = 100 + Math.sin(rad) * (40 + analysis.confidence * 0.45);
                      return <line key={`spoke-lg-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={analysis.sentimentScore >= 0 ? '#fcd34d' : '#93c5fd'} strokeWidth="0.5" strokeOpacity={0.15 + analysis.confidence * 0.004} strokeDasharray="2 3" />;
                    })}
                    <circle cx="100" cy="100" r="88" fill="none" stroke={analysis.sentimentScore >= 0 ? '#fbbf24' : '#67e8f9'} strokeWidth="0.5" strokeOpacity="0.15" strokeDasharray="4 8" className="td-svg-orbit-reverse" style={{ animationDuration: '20s' }} />
                  </svg>
                </div>

                {/* === Small foreground animation (crisp) === */}
                <div className="td-poster-svg-wrap td-poster-svg-wrap--sm">
                  <svg viewBox="0 0 200 200" className="td-poster-svg" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <radialGradient id="core-glow-sm">
                        <stop offset="0%" stopColor={analysis.sentimentScore >= 0 ? '#fbbf24' : '#38bdf8'} stopOpacity="0.6" />
                        <stop offset="100%" stopColor={analysis.sentimentScore >= 0 ? '#f97316' : '#6366f1'} stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    <circle cx="100" cy="100" r={20 + analysis.emotionScore * 0.25} fill="url(#core-glow-sm)" className="td-svg-pulse" style={{ animationDuration: `${3 - analysis.energyScore * 0.015}s` }} />
                    <circle cx="100" cy="100" r="18" fill="none" stroke={analysis.sentimentScore >= 0 ? '#fbbf24' : '#67e8f9'} strokeWidth="1.5" strokeOpacity={0.3 + analysis.confidence * 0.006} className="td-svg-pulse" style={{ animationDuration: `${2.5 - analysis.energyScore * 0.01}s` }} />
                    <circle cx="100" cy="100" r="35" fill="none" stroke={analysis.sentimentScore >= 0 ? '#f59e0b' : '#818cf8'} strokeWidth="1.2" strokeOpacity="0.7" strokeDasharray="30 190" strokeLinecap="round" className="td-svg-orbit" style={{ animationDuration: `${6 - analysis.energyScore * 0.035}s` }} />
                    <circle cx="100" cy="100" r="52" fill="none" stroke={analysis.sentimentScore >= 0 ? '#fbbf24' : '#67e8f9'} strokeWidth="1" strokeOpacity="0.55" strokeDasharray="50 280" strokeLinecap="round" className="td-svg-orbit-reverse" style={{ animationDuration: `${8 - analysis.energyScore * 0.04}s` }} />
                    <circle cx="100" cy="100" r="70" fill="none" stroke={analysis.sentimentScore >= 0 ? '#fb923c' : '#a5b4fc'} strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="40 400" strokeLinecap="round" className="td-svg-orbit" style={{ animationDuration: `${12 - analysis.energyScore * 0.06}s` }} />
                    {Array.from({ length: Math.max(4, Math.round(analysis.emotionalComplexity / 12)) }, (_, i) => {
                      const count = Math.max(4, Math.round(analysis.emotionalComplexity / 12));
                      const rad = ((i / count) * 360 * Math.PI) / 180;
                      const x1 = 100 + Math.cos(rad) * 24, y1 = 100 + Math.sin(rad) * 24;
                      const x2 = 100 + Math.cos(rad) * (40 + analysis.confidence * 0.45), y2 = 100 + Math.sin(rad) * (40 + analysis.confidence * 0.45);
                      return <line key={`spoke-sm-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={analysis.sentimentScore >= 0 ? '#fcd34d' : '#93c5fd'} strokeWidth="0.5" strokeOpacity={0.15 + analysis.confidence * 0.004} strokeDasharray="2 3" />;
                    })}
                    <circle cx="100" cy="100" r="88" fill="none" stroke={analysis.sentimentScore >= 0 ? '#fbbf24' : '#67e8f9'} strokeWidth="0.5" strokeOpacity="0.15" strokeDasharray="4 8" className="td-svg-orbit-reverse" style={{ animationDuration: '20s' }} />
                  </svg>
                </div>

                {/* Resonance label — between the two layers */}
                <div className="td-poster-resonance">
                  <span className="td-poster-resonance-value">{analysis.confidence}%</span>
                  <span className="td-poster-resonance-label">RESONANCE</span>
                </div>

                <p className="td-poster-eyebrow">{posterArtistLine}</p>
                <h3 className="td-title td-title--medium">{analysis.posterTitle}</h3>
                <p className="td-subtitle">{analysis.posterSubline}</p>
              </div>
            </article>
          </section>
        )}
      </div>
    </main>
  );
}

export default TooldropPage;
