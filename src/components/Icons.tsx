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

export const IconFullscreen: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <polyline points="8 3 3 3 3 8" />
        <polyline points="16 3 21 3 21 8" />
        <polyline points="3 16 3 21 8 21" />
        <polyline points="16 21 21 21 21 16" />
    </DefaultIcon>
);

export const IconFullscreenExit: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <polyline points="9 3 9 9 3 9" />
        <polyline points="15 3 15 9 21 9" />
        <polyline points="3 15 9 15 9 21" />
        <polyline points="15 21 15 15 21 15" />
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

// --- メニュー用アイコン（絵文字置き換え用） ---

/** 🎮 ゲームパッド */
export const IconGamepad: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <line x1="6" y1="12" x2="10" y2="12" />
        <line x1="8" y1="10" x2="8" y2="14" />
        <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
        <circle cx="18" cy="12" r="1" fill="currentColor" stroke="none" />
    </DefaultIcon>
);

/** 🌐 地球 */
export const IconGlobe: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </DefaultIcon>
);

/** 🛠 レンチ */
export const IconWrench: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </DefaultIcon>
);

/** 🏠 家 */
export const IconHome: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
    </DefaultIcon>
);

/** 🔗 リンク */
export const IconLink: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </DefaultIcon>
);

/** 🎲 サイコロ */
export const IconDice: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <rect x="2" y="2" width="20" height="20" rx="2" />
        <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </DefaultIcon>
);

/** 🚀 ロケット */
export const IconRocket: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </DefaultIcon>
);

/** 📋 クリップボード */
export const IconClipboard: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </DefaultIcon>
);

/** ⚙️ 歯車（メニュー用） */
export const IconGear: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </DefaultIcon>
);

/** 🌊 波（デフォルトテーマ） */
export const IconWave: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
        <path d="M2 18c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
    </DefaultIcon>
);

/** ✅ チェックマーク */
export const IconCheck: React.FC<IconProps> = (props) => (
    <DefaultIcon {...props}>
        <polyline points="20 6 9 17 4 12" />
    </DefaultIcon>
);
