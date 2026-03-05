import { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Sparkles } from 'lucide-react';
import { analyzeCreativeLyrics, type CreativeEngineResult, type HeatmapPoint } from '@/services/creativeEngine';
import { fetchOwnSharedProfile, sharedSupabase, type SharedProfile } from '@/services/sharedSupabase';
import {
  addLocalCreativeHistory,
  createCreativeHistoryEntry,
  deleteCreativeHistoryFromCloud,
  loadCreativeHistoryFromCloud,
  markLocalEntriesSynced,
  mergeCreativeHistory,
  readLocalCreativeHistory,
  removeLocalCreativeHistory,
  saveCreativeHistoryToCloud,
  type CreativeHistoryEntry,
} from '@/services/creativeHistory';
import { IntroScreen } from '@/components/IntroScreen';
import { CipherPoster } from '@/components/CipherPoster';
import './tooldrop.css';

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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function TooldropPage() {
  const [showCipherIntro, setShowCipherIntro] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [profile, setProfile] = useState<SharedProfile | null>(null);
  const [signedInUserId, setSignedInUserId] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [artistName, setArtistName] = useState('');
  const [lyricsInput, setLyricsInput] = useState('');
  const [applyArtistName, setApplyArtistName] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCloudSaving, setIsCloudSaving] = useState(false);
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [analysis, setAnalysis] = useState<CreativeEngineResult | null>(null);
  const [historyEntries, setHistoryEntries] = useState<CreativeHistoryEntry[]>(() =>
    readLocalCreativeHistory()
  );
  const [magicEmail, setMagicEmail] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showSignInOffer, setShowSignInOffer] = useState(false);
  const [introReady, setIntroReady] = useState(false);
  const signInOfferRef = useRef<HTMLElement | null>(null);
  const isSignedIn = Boolean(signedInUserId && accessToken);

  useEffect(() => {
    let active = true;

    const hydrateProfile = async (userId: string, userMetadata: Record<string, unknown>) => {
      try {
        const ownProfile = await fetchOwnSharedProfile(userId);
        if (!active) return;
        setProfile(ownProfile);

        const metadataName =
          typeof userMetadata.full_name === 'string'
            ? userMetadata.full_name
            : typeof userMetadata.name === 'string'
              ? userMetadata.name
              : '';

        const preferredName = ownProfile?.display_name?.trim() || metadataName.trim();
        if (preferredName) {
          setArtistName((prev) => (prev.trim().length > 0 ? prev : preferredName));
        }
      } catch (error) {
        if (!active) return;
        setProfile(null);
        setAccountMessage(error instanceof Error ? error.message : 'Could not load profile.');
      }
    };

    const applySession = async (session: any | null) => {
      const user = session?.user;
      const userId = typeof user?.id === 'string' ? user.id : null;
      const email = typeof user?.email === 'string' ? user.email : '';
      const token = typeof session?.access_token === 'string' ? session.access_token : null;
      const metadata =
        user && typeof user.user_metadata === 'object' && user.user_metadata
          ? (user.user_metadata as Record<string, unknown>)
          : {};

      setSignedInUserId(userId);
      setSignedInEmail(email);
      setAccessToken(token);
      setProfile(null);

      if (!userId) return;
      await hydrateProfile(userId, metadata);
    };

    const hydrateSession = async () => {
      setAuthReady(false);
      try {
        const {
          data: { session },
          error,
        } = await sharedSupabase.auth.getSession();

        if (!active) return;

        if (error) {
          setAccountMessage(`Session check failed: ${error.message}`);
          await applySession(null);
          setAuthReady(true);
          return;
        }

        await applySession(session);
      } catch (error) {
        if (!active) return;
        setAccountMessage(error instanceof Error ? error.message : 'Session check failed.');
        await applySession(null);
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    };

    void hydrateSession();

    const { data: listener } = sharedSupabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session as any);
      setAuthReady(true);
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

  const accountLabel = useMemo(() => {
    const profileName = profile?.display_name?.trim();
    if (profileName) return profileName;
    if (signedInEmail.trim().length > 0) return signedInEmail.trim();
    return 'Signed In';
  }, [profile, signedInEmail]);

  const sentimentPercent = analysis ? Math.round(analysis.sentimentScore * 100) : 0;

  // Only start the card-level intro countdown AFTER the full-screen cipher intro is gone
  useEffect(() => {
    if (showCipherIntro) return; // wait until cipher intro exits
    const timer = window.setTimeout(() => {
      setIntroReady(true);
    }, 2800); // show orb + "Start Free Analysis" for 2.8 s then auto-open
    return () => window.clearTimeout(timer);
  }, [showCipherIntro]);

  useEffect(() => {
    if (isSignedIn) {
      setShowSignInOffer(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (showSignInOffer && signInOfferRef.current) {
      signInOfferRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showSignInOffer]);

  useEffect(() => {
    setHistoryEntries(readLocalCreativeHistory());
  }, []);

  useEffect(() => {
    if (!isSignedIn || !accessToken) return;
    let active = true;

    const syncHistory = async () => {
      setIsSyncingHistory(true);

      try {
        const localHistory = readLocalCreativeHistory();
        const unsynced = localHistory.filter((entry) => !entry.syncedToCloud);

        if (unsynced.length > 0) {
          const syncSuccess = await saveCreativeHistoryToCloud(accessToken, unsynced);
          if (syncSuccess) {
            markLocalEntriesSynced(unsynced.map((entry) => entry.id));
            setAccountMessage(`Synced ${unsynced.length} temporary entr${unsynced.length === 1 ? 'y' : 'ies'} to your account.`);
          } else {
            setAccountMessage('Signed in, but cloud sync failed. Local history is still available.');
          }
        }

        const cloudHistory = await loadCreativeHistoryFromCloud(accessToken);
        const merged = mergeCreativeHistory(readLocalCreativeHistory(), cloudHistory);
        if (!active) return;
        setHistoryEntries(merged);
      } finally {
        if (active) {
          setIsSyncingHistory(false);
        }
      }
    };

    void syncHistory();

    return () => {
      active = false;
    };
  }, [isSignedIn, accessToken, signedInUserId]);

  const handleMagicLinkSignIn = async () => {
    if (!magicEmail.trim()) {
      setAccountMessage('Enter an email for magic link sign in.');
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
      setAccountMessage(error.message);
      return;
    }

    setAccountMessage('Magic link sent. Check your inbox.');
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
      setAccountMessage(error.message);
    }
  };

  const handleBaseWalletSignIn = async () => {
    const wallet = (window as { ethereum?: unknown }).ethereum as {
      request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    } | undefined;

    if (!wallet?.request) {
      setAccountMessage('No Base-compatible wallet detected.');
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
      setAccountMessage(error.message);
    }
  };

  const handleSignOut = async () => {
    const { error } = await sharedSupabase.auth.signOut();
    if (error) {
      setAccountMessage(error.message);
      return;
    }
    setAccountMessage('Signed out. Your local temporary history is still available.');
  };

  const handleAnalyze = async () => {
    const input = lyricsInput.trim();
    if (input.length < 12) {
      setStatusMessage('Paste a few more lines so analysis quality is usable.');
      return;
    }

    setStatusMessage('');
    setIsAnalyzing(true);

    await new Promise((resolve) => setTimeout(resolve, 320));

    const next = analyzeCreativeLyrics(input);
    const entry = createCreativeHistoryEntry({
      lyricsInput: input,
      result: next,
      artistName: applyArtistName ? artistName : '',
    });

    setAnalysis(next);
    setHistoryEntries(addLocalCreativeHistory(entry));
    setIsAnalyzing(false);

    if (!isSignedIn || !accessToken) {
      setShowSignInOffer(true);
      setStatusMessage('Analyzed for free. Sign in below if you want to save across devices.');
      return;
    }

    setShowSignInOffer(false);
    setIsCloudSaving(true);
    const saved = await saveCreativeHistoryToCloud(accessToken, [entry]);
    setIsCloudSaving(false);

    if (!saved) {
      setStatusMessage('Saved locally, but cloud save failed this time.');
      return;
    }

    const synced = markLocalEntriesSynced([entry.id]);
    setHistoryEntries(synced);
    setStatusMessage('Saved to your account history.');
  };

  const handleLoadHistoryEntry = (entry: CreativeHistoryEntry) => {
    setLyricsInput(entry.lyricsInput);
    setAnalysis(entry.result);
    if (entry.artistName) {
      setArtistName(entry.artistName);
      setApplyArtistName(true);
    }
    setStatusMessage('Loaded saved lyrical analysis.');
  };

  const handleDeleteHistoryEntry = async (entry: CreativeHistoryEntry) => {
    setHistoryEntries(removeLocalCreativeHistory(entry.id));

    if (isSignedIn && accessToken && entry.syncedToCloud) {
      await deleteCreativeHistoryFromCloud(accessToken, entry.id);
    }
  };

  return (
    <main className="td-page">
      {/* ── Full-page Cipher Intro ── */}
      {showCipherIntro && <IntroScreen onComplete={() => setShowCipherIntro(false)} />}
      <div className="td-shell">
        <header className="td-header">
          <div>
            <p className="td-eyebrow">Tooldrop</p>
            <h1 className="td-title">The Creative Engine</h1>
          </div>
          <div className="td-row td-row--wrap td-header-actions">
            <span className="td-subtitle td-subtitle--compact">
              {authReady ? (isSignedIn ? accountLabel : 'Using Guest Mode') : 'Checking sign-in...'}
            </span>
            {isSignedIn && (
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
            )}
          </div>
        </header>

        <section className="td-card td-compose-card">
          <div className={`td-intro-overlay${introReady ? ' td-intro-overlay--hidden' : ''}`}>
            <div className="td-intro-orb" aria-hidden="true" />
            <p className="td-eyebrow">Creative Engine</p>
            <h2 className="td-title td-title--intro">Song Lyrics + Poems</h2>
            <p className="td-subtitle td-subtitle--intro">
              Drop in your words. Get instant lyrical analysis for free.
            </p>
            <button
              type="button"
              className="td-btn td-btn--primary td-btn--glow"
              onClick={() => setIntroReady(true)}
            >
              Start Free Analysis
            </button>
          </div>

          <div className={`td-compose-body${introReady ? ' td-compose-body--ready' : ''}`}>
            <p className="td-eyebrow">Insert Song Lyrics Or Poem</p>
            <p className="td-subtitle">Analyze for free. No sign-in required.</p>

            <textarea
              value={lyricsInput}
              onChange={(event) => setLyricsInput(event.target.value)}
              placeholder="Paste your song lyrics or poem here..."
              className="td-textarea"
            />

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
                {isAnalyzing ? 'Analyzing...' : 'Analyze Free'}
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

            <p className="td-subtitle td-subtitle--compact td-compose-note">
              {isSignedIn
                ? `Signed in as ${accountLabel} · syncing ${isSyncingHistory ? 'in progress' : 'on'}`
                : 'Guest mode active · local temporary history only'}
              {isCloudSaving ? ' · saving to cloud...' : ''}
            </p>

            {isSignedIn && accountMessage && <p className="td-message td-message--warning">{accountMessage}</p>}
            {statusMessage && <p className="td-message td-message--success">{statusMessage}</p>}
          </div>
        </section>

        {!isSignedIn && showSignInOffer && (
          <section ref={signInOfferRef} className="td-card td-card--offer">
            <p className="td-eyebrow">Save Your Work</p>
            <h2 className="td-title td-title--small">Keep this analysis forever</h2>
            <p className="td-subtitle">
              You already analyzed for free. Sign in now if you want permanent saves and cross-device history.
            </p>

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

            {accountMessage && <p className="td-message td-message--warning">{accountMessage}</p>}
          </section>
        )}

        <section className="td-card td-card--panel">
          <div className="td-row td-row--between td-history-header">
            <div>
              <h2 className="td-title td-title--small">Past Lyrical Analysis</h2>
              <p className="td-subtitle">
                {historyEntries.length} saved entr{historyEntries.length === 1 ? 'y' : 'ies'}.
              </p>
            </div>
          </div>

          {historyEntries.length === 0 ? (
            <p className="td-subtitle">
              No history yet. Run an analysis and it will appear here automatically.
            </p>
          ) : (
            <div className="td-history-list">
              {historyEntries.map((entry) => {
                const previewText = entry.lyricsInput.replace(/\s+/g, ' ').trim().slice(0, 200);
                return (
                  <article key={entry.id} className="td-history-item">
                    <div className="td-row td-row--between td-row--wrap">
                      <div>
                        <p className="td-history-title">{entry.result.posterTitle}</p>
                        <p className="td-history-meta">
                          {formatDateTime(entry.createdAt)} · {entry.result.sentimentLabel} · {entry.result.confidence}% confidence
                        </p>
                      </div>
                      <span className={`td-chip ${entry.syncedToCloud ? 'td-chip--saved' : 'td-chip--temp'}`}>
                        {entry.syncedToCloud ? 'Saved' : 'Temporary'}
                      </span>
                    </div>

                    <p className="td-history-snippet">{previewText}</p>

                    <div className="td-row td-row--wrap">
                      <button
                        type="button"
                        className="td-btn td-btn--small td-btn--ghost"
                        onClick={() => handleLoadHistoryEntry(entry)}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        className="td-btn td-btn--small td-btn--warning"
                        onClick={() => {
                          void handleDeleteHistoryEntry(entry);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
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
              <p className="td-subtitle" style={{ marginTop: '0.25rem', fontFamily: 'Share Tech Mono, monospace', fontSize: '0.82rem', letterSpacing: '0.08em', color: 'rgba(180,140,255,0.85)' }}>
                ↳ {analysis.lyricalFingerprint}
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
                  <div>
                    <div className="td-row td-row--between td-meter-head">
                      <span>Flow</span>
                      <span>{analysis.flowScore}</span>
                    </div>
                    <div className="td-meter-track">
                      <div className="td-meter-fill td-meter-fill--cyan" style={{ width: `${analysis.flowScore}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="td-row td-row--between td-meter-head">
                      <span>Metaphor Density</span>
                      <span>{analysis.metaphorDensity}</span>
                    </div>
                    <div className="td-meter-track">
                      <div className="td-meter-fill td-meter-fill--fuchsia" style={{ width: `${analysis.metaphorDensity}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="td-row td-row--between td-meter-head">
                      <span>Slang Index</span>
                      <span>{analysis.slangIndex}</span>
                    </div>
                    <div className="td-meter-track">
                      <div className="td-meter-fill td-meter-fill--amber" style={{ width: `${analysis.slangIndex}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="td-row td-row--between td-meter-head">
                      <span>Sentiment Sharpness</span>
                      <span>{analysis.sentimentSharpness}</span>
                    </div>
                    <div className="td-meter-track">
                      <div className="td-meter-fill td-meter-fill--rose" style={{ width: `${analysis.sentimentSharpness}%` }} />
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
              <CipherPoster analysis={analysis} artistLine={posterArtistLine} />
            </article>
          </section>
        )}
      </div>
    </main>
  );
}

export default TooldropPage;
