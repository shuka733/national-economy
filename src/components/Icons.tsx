import React from 'react';

// Common props for icons
interface IconProps extends React.SVGProps<SVGSVGElement> {
    size?: number | string;
    className?: string;
    color?: string;
}

const DefaultIcon: React.FC<IconProps & { children: React.ReactNode; viewBox?: string }> = ({
    size = 24,
    className = "",
    color = "currentColor",
    viewBox = "0 0 24 24",
    children,
    ...props
}) => {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox={viewBox}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`game-icon ${className}`}
            style={{ display: 'inline-block', verticalAlign: 'middle' }}
            {...props}
        >
            {children}
        </svg>
    );
};

// --- Resources ---

export const IconMoney: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <circle cx="12" cy="12" r="10" />
        <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
        <path d="M12 18V6" />
    </DefaultIcon>
);

export const IconWorker: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </DefaultIcon>
);

export const IconHouse: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M3 21h18" />
        <path d="M5 21V7l8-4 8 4v14" />
        <path d="M9 10a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
    </DefaultIcon>
);

// --- Game Object Icons ---

export const IconDeck: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
    </DefaultIcon>
);

export const IconDiscard: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <polyline points="21 8 21 21 3 21 3 8" />
        <line x1="1" y1="3" x2="23" y2="3" />
        <line x1="10" y1="12" x2="14" y2="12" />
    </DefaultIcon>
);

export const IconLog: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
    </DefaultIcon>
);

// --- Action Icons ---

export const IconHammer: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M18.3 5.7a2.126 2.126 0 0 0-3-3L8.5 9.6l-3.2-1.2-2.3 2.5 4.7 4.7 2.5-2.5-1.2-3.3 6.9-6.9 2.4 2.8z" />
        <path d="M2 22l6.5-6.5" />
    </DefaultIcon>
);

export const IconSearch: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </DefaultIcon>
);

export const IconTrash: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
    </DefaultIcon>
);

export const IconPayment: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
    </DefaultIcon>
);

// --- Player & CPU ---

export const IconRobot: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
        <line x1="8" y1="16" x2="8" y2="16" />
        <line x1="16" y1="16" x2="16" y2="16" />
    </DefaultIcon>
);

export const IconPlayer: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </DefaultIcon>
);

// --- Tags & Badges ---

export const TagFarm: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M11 20s-5.8-3.4-6-10a6 6 0 0 1 12 0c-.2 6.6-6 10-6 10z" />
        <path d="M11 20v-8" />
        <path d="M7 10h8" />
    </DefaultIcon>
);

export const TagFactory: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </DefaultIcon>
);

export const TagLock: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </DefaultIcon>
);

// --- Special ---

export const IconTrophy: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="M7 4h10" />
        <path d="M17 4v8a5 5 0 0 1-10 0V4" />
        <path d="M5 9v-5" />
        <path d="M19 9v-5" />
    </DefaultIcon>
);

export const IconSoundOn: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </DefaultIcon>
);

export const IconSoundOff: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
    </DefaultIcon>
);

export const LogoFactory: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props} viewBox="0 0 100 100" strokeWidth="4">
        <path d="M10 90h80" />
        <path d="M15 90V40l15-10v20l15-10v20l15-10v40" />
        <path d="M75 90V20h10v70" />
        <path d="M78 15h4v-5h-4z" />
        <path d="M82 12h8" />
        <path d="M85 9v-5" />
    </DefaultIcon>
);
