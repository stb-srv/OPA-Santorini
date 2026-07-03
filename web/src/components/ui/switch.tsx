import { cn } from '@/lib/utils';

interface SwitchProps {
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
    disabled?: boolean;
    className?: string;
    'aria-label'?: string;
}

/** Schlanker Toggle-Switch (ohne zusätzliche Radix-Dependency). */
export function Switch({ checked, onCheckedChange, disabled, className, ...rest }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onCheckedChange(!checked)}
            className={cn(
                'relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:opacity-50',
                checked ? 'bg-primary' : 'bg-muted-foreground/40',
                className
            )}
            {...rest}
        >
            <span
                className={cn(
                    'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    checked ? 'translate-x-[22px]' : 'translate-x-0'
                )}
            />
        </button>
    );
}
