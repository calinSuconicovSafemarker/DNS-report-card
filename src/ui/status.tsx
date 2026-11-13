import {
  CircleCheck,
  CircleX,
  CloudOff,
  Info,
  TriangleExclamationPoint,
  type LucideIcon,
} from 'lucide-react';
import type { Status } from '../engine/types';

export const STATUS_LABEL: Record<Status, string> = {
  pass: 'Pass',
  warning: 'Warning',
  fail: 'Fail',
  'couldnt-check': 'Couldn’t check',
  info: 'Info',
};

const STATUS_ICON: Record<Status, LucideIcon> = {
  pass: CircleCheck,
  warning: TriangleExclamationPoint,
  fail: CircleX,
  'couldnt-check': CloudOff,
  info: Info,
};

/** A Status as an icon plus a word, never color alone. */
export function StatusBadge({ status }: { status: Status }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`badge tone-${status}`}>
      <Icon aria-hidden="true" size={16} strokeWidth={2.25} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StatusIcon({ status, size = 16 }: { status: Status; size?: number }) {
  const Icon = STATUS_ICON[status];
  return <Icon aria-hidden="true" size={size} strokeWidth={2.25} />;
}
