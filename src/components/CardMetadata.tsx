import React from 'react';
import { getCardDef, CONSUMABLE_DEF_ID } from '../cards';
import { TagFarm, TagFactory, TagLock } from './Icons';

type CardTagKind = 'farm' | 'factory' | 'lock';

const TAG_META: Record<CardTagKind, {
    label: string;
    className: string;
    Icon: typeof TagFarm;
}> = {
    farm: { label: '農園マーク', className: 'tag-farm', Icon: TagFarm },
    factory: { label: '工場マーク', className: 'tag-factory', Icon: TagFactory },
    lock: { label: '売却不可マーク', className: 'tag-lock', Icon: TagLock },
};

export function renderTagBadge(kind: CardTagKind, options: { compact?: boolean; size?: number | string } = {}) {
    const { compact = false, size = "calc(var(--fs) * 1.11)" } = options;
    const meta = TAG_META[kind];
    const Icon = meta.Icon;
    return (
        <span
            className={`tag-badge ${meta.className}${compact ? ' tag-badge-compact' : ''} tag-badge-icon-only`}
            title={meta.label}
            aria-label={meta.label}
        >
            <Icon size={size} />
        </span>
    );
}

export function TagIconBadges({ defId, compact = false, size }: { defId: string; compact?: boolean; size?: number | string }) {
    if (defId === CONSUMABLE_DEF_ID) return null;
    const d = getCardDef(defId);
    const badges = [
        d.tags.includes('farm') ? renderTagBadge('farm', { compact, size }) : null,
        d.tags.includes('factory') ? renderTagBadge('factory', { compact, size }) : null,
        d.unsellable ? renderTagBadge('lock', { compact, size }) : null,
    ].filter(Boolean);
    if (badges.length === 0) return null;
    return (
        <div style={{ display: 'flex', gap: compact ? 2 : 4, flexWrap: 'wrap', marginTop: compact ? 2 : 4, position: 'relative', zIndex: 1 }}>
            {badges.map((badge, index) => <React.Fragment key={index}>{badge}</React.Fragment>)}
        </div>
    );
}

export function renderCardText(text: string): React.ReactNode {
    if (!text) return null;
    const tokenPattern = /(\$\d+|\d+枚|\d+つ|\d+人|[+\-]\d+VP|\d+VP|コスト[+\-]?\d+|農園マーク|工場マーク|売却不可マーク|\[農園マーク\]|\[工場マーク\]|\[売却不可マーク\]|\[※農園\]|\[※工場\]|\[売却不可\]|[※]?農園|[※]?工場|売却不可|消費財|手札|山札|捨て札|家計|負債トークン|負債|労働者|建物|建設|無料)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = tokenPattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        const token = match[0];
        if (['農園マーク', '[農園マーク]', '[※農園]', '農園', '※農園'].includes(token)) {
            parts.push(<React.Fragment key={key++}>{renderTagBadge('farm', { compact: true, size: "calc(var(--fs) * 1.05)" })}</React.Fragment>);
        } else if (['工場マーク', '[工場マーク]', '[※工場]', '工場', '※工場'].includes(token)) {
            parts.push(<React.Fragment key={key++}>{renderTagBadge('factory', { compact: true, size: "calc(var(--fs) * 1.05)" })}</React.Fragment>);
        } else if (['売却不可マーク', '[売却不可マーク]', '[売却不可]', '売却不可'].includes(token)) {
            parts.push(<React.Fragment key={key++}>{renderTagBadge('lock', { compact: true, size: "calc(var(--fs) * 1.05)" })}</React.Fragment>);
        } else {
            const isNumeric = /^\$?\d|^[+\-]\d|^コスト/.test(token);
            parts.push(
                <b key={key++} style={{ color: isNumeric ? 'var(--gold-light)' : 'var(--teal)', fontWeight: 700 }}>
                    {token}
                </b>
            );
        }
        lastIndex = tokenPattern.lastIndex;
    }
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    return parts;
}
