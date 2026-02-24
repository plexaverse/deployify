import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface SettingsToggleProps {
    id: string;
    title: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    className?: string;
    disabled?: boolean;
}

export function SettingsToggle({
    id,
    title,
    description,
    checked,
    onCheckedChange,
    className,
    disabled
}: SettingsToggleProps) {
    return (
        <div
            className={cn(
                "flex items-center justify-between p-4 border border-[var(--border)] rounded-md bg-[var(--background)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer group",
                className
            )}
            onClick={() => !disabled && onCheckedChange(!checked)}
        >
            <div className="flex-1 pr-4">
                <Label
                    htmlFor={id}
                    className={cn(
                        "text-base font-medium cursor-pointer transition-colors",
                        disabled ? "cursor-not-allowed opacity-50" : "group-hover:text-[var(--primary)]"
                    )}
                >
                    {title}
                </Label>
                <p className={cn(
                    "text-sm text-[var(--muted-foreground)] mt-1",
                    disabled && "opacity-50"
                )}>
                    {description}
                </p>
            </div>
            <Switch
                id={id}
                checked={checked}
                onCheckedChange={onCheckedChange}
                onClick={(e) => e.stopPropagation()}
                disabled={disabled}
            />
        </div>
    );
}
