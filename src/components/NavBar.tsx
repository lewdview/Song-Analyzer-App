import { NavLink } from 'react-router-dom';
import { Flame, Music, Calendar, Mic2 } from 'lucide-react';
import './navbar.css';

const SHOW_INTERNAL_TOOLS =
    (import.meta as any).env.DEV || (import.meta as any).env.VITE_ENABLE_INTERNAL_TOOLS === 'true';

const NAV_ITEMS = [
    { to: '/', label: 'Creative Engine', icon: Flame, end: true },
    ...(SHOW_INTERNAL_TOOLS
        ? [
            { to: '/studio', label: 'Studio', icon: Music, end: false },
            { to: '/scheduler', label: 'Scheduler', icon: Calendar, end: false },
            { to: '/karaoke', label: 'Karaoke', icon: Mic2, end: false },
        ]
        : []),
] as const;

export function NavBar() {
    return (
        <nav className="nb-bar" aria-label="Main navigation">
            <div className="nb-inner">
                <span className="nb-brand">th3scr1b3</span>
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
            </div>
        </nav>
    );
}
