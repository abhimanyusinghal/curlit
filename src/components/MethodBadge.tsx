import { getMethodColor } from '../utils/http';

interface Props {
  method: string;
  size?: 'sm' | 'md';
}

export function MethodBadge({ method, size = 'md' }: Props) {
  const color = getMethodColor(method);
  const sizeClass = size === 'sm' ? 'text-[10px] px-1' : 'text-xs px-1.5 py-0.5';

  return (
    <span className={`${color} ${sizeClass} font-bold tracking-wider`}>
      {method}
    </span>
  );
}
