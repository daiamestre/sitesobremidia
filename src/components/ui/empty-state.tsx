import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReactNode } from 'react';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
        icon?: LucideIcon;
    };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
    return (
        <Card className="glass border-dashed border-2 bg-background/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
                <div className="p-6 rounded-full bg-primary/5 mb-6 ring-1 ring-primary/20">
                    <Icon className="h-12 w-12 text-primary/80" />
                </div>
                <h3 className="text-xl font-semibold mb-2 tracking-tight">{title}</h3>
                <p className="text-muted-foreground max-w-sm mb-6 leading-relaxed">
                    {description}
                </p>
                {action && (
                    <Button
                        className="gradient-primary shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all font-medium"
                        onClick={action.onClick}
                    >
                        {action.icon && <action.icon className="h-4 w-4 mr-2" />}
                        {action.label}
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
