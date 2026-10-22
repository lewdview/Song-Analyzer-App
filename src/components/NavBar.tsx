import { NavLink } from 'react-router-dom';
import { Flame, Music, Calendar, Mic2 } from 'lucide-react';
import { IS_ANALYZER_APP } from '@/config/appMode';
import { signInUrl, IDENTITY_HUB, useAccount } from '@/hooks/useAccount';
import './navbar.css';

const SHOW_INTERNAL_TOOLS =
    (import.meta as any).env.DEV || (import.meta as any).env.VITE_ENABLE_INTERNAL_TOOLS === 'true';

const NAV_ITEMS = IS_ANALYZER_APP ? [
    { to: '/', label: 'Song Analyzer', icon: Music, end: true },
    { to: '/scheduler', label: 'Scheduler', icon: Calendar, end: false },
    { to: '/karaoke', label: 'Karaoke', icon: Mic2, end: false },
] as const : [
    { to: '/', label: 'Poem Analyzer', icon: Flame, end: true },
    ...(SHOW_INTERNAL_TOOLS
        ? [
            { to: '/studio', label: 'Studio', icon: Music, end: false },
            { to: '/scheduler', label: 'Scheduler', icon: Calendar, end: false },
            { to: '/karaoke', label: 'Karaoke', icon: Mic2, end: false },
        ]
        : []),
] as const;

/** Analyzer app: the shared th3scr1b3.art login; saving analyses needs an admin account. */
function AccountChip() {
    const account = useAccount();
    if (account.status === 'loading') return <span className="nb-account">…</span>;
    if (!account.signedIn) {
        return <a className="nb-account" href={signInUrl()} title="One login for every th3scr1b3.art layer">Sign in</a>;
    }
    return (
        <a className="nb-account" href={IDENTITY_HUB} title={account.isAdmin ? 'Can save analyses' : 'Signed in, but only admins can save analyses'}>
            {account.displayName}{account.isAdmin ? ' · Admin' : ''}
        </a>
    );
}

export function NavBar() {
    return (
        <nav className="nb-bar" aria-label="Main navigation">
            <div className="nb-inner">
                <span className="nb-brand">{IS_ANALYZER_APP ? 'th3scr1b3 · Song Analyzer' : 'th3scr1b3'}</span>
                <ul className="nb-links">
                    {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                        <li key={to}>
                            <NavLink
                                to={to}
                                end={end}
                                className={({ isActive }) =>
                                    `nb-link${isActive ? ' nb-link--active' : ''}`
                                }
                            >
                                <Icon size={15} aria-hidden="true" />
                                <span>{label}</span>
                            </NavLink>
                        </li>
                    ))}
                </ul>
                {IS_ANALYZER_APP && <AccountChip />}
            </div>
        </nav>
    );
}
