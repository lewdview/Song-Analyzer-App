// One repo, two sites:
// - mood.th3scr1b3.art / ce.th3scr1b3.art: the Poem Analyzer (default build)
// - analyzer.th3scr1b3.art: the Song Analyzer studio, built with VITE_APP_MODE=analyzer
// Both are tools of the Creative Engine, th3scr1b3's whole toolkit.
export const IS_ANALYZER_APP = (import.meta as any).env.VITE_APP_MODE === 'analyzer';
