import { Copy, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ScreenIdBadgeProps {
    id?: string;
    customId?: string | null;
    className?: string;
    showHash?: boolean;
}

export function ScreenIdBadge({ customId, className, showHash = true }: ScreenIdBadgeProps) {
    // Strict Custom ID enforcement: Never show UUID
    const displayId = customId || "SEM ID";
    const isCustom = !!customId;

    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!customId) {
            toast.error("Nenhum ID personalizado configurado.");
            return;
        }
        navigator.clipboard.writeText(displayId);
        toast.success("ID copiado!");
    };

    return (
        <div
            className={cn(
                "group/id flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 shadow-sm",
                isCustom
                    ? "bg-primary/10 border-primary/20 text-primary hover:scale-105"
                    : "bg-destructive/5 border-destructive/10 text-destructive grayscale hover:grayscale-0",
                className
            )}
        >
            {showHash && <Hash className={cn("h-3 w-3", isCustom ? "text-primary/70" : "text-destructive/50")} />}

            <code className="text-[11px] font-mono font-black tracking-widest truncate max-w-[140px] uppercase">
                {displayId}
            </code>

            <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover/id:opacity-100 transition-all hover:bg-transparent -mr-1"
                onClick={handleCopy}
            >
                <Copy className="h-3 w-3" />
            </Button>
        </div>
    );
}
