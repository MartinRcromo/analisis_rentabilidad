'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: number;
  changeLabel?: string;
  type?: 'default' | 'success' | 'danger' | 'warning';
  icon?: React.ReactNode;
}

export function MetricCard({
  title,
  value,
  subtitle,
  change,
  changeLabel,
  type = 'default',
  icon,
}: MetricCardProps) {
  const typeColors = {
    default: 'text-gray-900',
    success: 'text-green-600',
    danger: 'text-red-600',
    warning: 'text-amber-600',
  };

  const bgColors = {
    default: 'bg-white',
    success: 'bg-green-50',
    danger: 'bg-red-50',
    warning: 'bg-amber-50',
  };

  const changeColor = change && change > 0 ? 'text-green-600' : change && change < 0 ? 'text-red-600' : 'text-gray-500';
  const ChangeIcon = change && change > 0 ? TrendingUp : change && change < 0 ? TrendingDown : Minus;

  return (
    <Card className={cn('border', bgColors[type])}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className={cn('mt-2 text-3xl font-bold', typeColors[type])}>
              {typeof value === 'number' ? formatNumber(value) : value}
            </p>
            {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
            {change !== undefined && (
              <div className={cn('mt-2 flex items-center gap-1 text-sm', changeColor)}>
                <ChangeIcon className="h-4 w-4" />
                <span>
                  {change > 0 ? '+' : ''}
                  {formatNumber(change)}
                </span>
                {changeLabel && <span className="text-gray-400">{changeLabel}</span>}
              </div>
            )}
          </div>
          {icon && <div className="text-gray-400">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function formatNumber(num: number): string {
  if (Math.abs(num) >= 1e9) {
    return `$${(num / 1e9).toFixed(1)}B`;
  }
  if (Math.abs(num) >= 1e6) {
    return `$${(num / 1e6).toFixed(1)}M`;
  }
  if (Math.abs(num) >= 1e3) {
    return `$${(num / 1e3).toFixed(1)}K`;
  }
  return `$${num.toFixed(0)}`;
}
