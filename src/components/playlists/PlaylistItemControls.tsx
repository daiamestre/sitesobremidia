import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  WEEKDAY_FULL,
  WEEKDAY_LETTER,
  clampDuration,
  hasSchedule,
  normalizeDays,
  normalizeTime,
  scheduleSummary,
  type EditableItem,
} from '@/lib/playlistItems';
import { formatDurationMs, playbackOf } from '@/lib/mediaDuration';

/**
 * Controles por item da lista de reprodução (usados na tela do dispositivo e no editor da playlist):
 * duração em segundos + agendamento (horário e dias da semana). Tudo é gravado pelo mesmo caminho atômico.
 */

interface DurationInputProps {
  value: number;
  onChange: (seconds: number) => void;
  disabled?: boolean;
  className?: string;
  /** Duração exata do vídeo (ms). Mostra o tempo que a tela realmente toca, com milésimos. */
  realMs?: number | null;
}

export function ItemDurationInput({ value, onChange, disabled, className, realMs }: DurationInputProps) {
  const play = playbackOf(value, realMs);
  // Rascunho: permite apagar o campo para digitar outro número sem cair em 0.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <Input
        type="number"
        inputMode="numeric"
        min={MIN_DURATION_SECONDS}
        max={MAX_DURATION_SECONDS}
        step={1}
        value={draft}
        disabled={disabled}
        aria-label="Duração em segundos"
        title="Duração em segundos"
        className="h-8 w-16 px-1 text-center font-mono"
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n) && n >= MIN_DURATION_SECONDS) onChange(clampDuration(n));
        }}
        onBlur={() => {
          const c = clampDuration(draft);
          setDraft(String(c));
          if (c !== value) onChange(c);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <span className="text-xs text-muted-foreground">s</span>
      {play && (
        <span
          className={`hidden sm:inline whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[11px] ${play.cut ? 'bg-amber-500/15 text-amber-500' : 'bg-emerald-500/15 text-emerald-500'}`}
          title={play.cut
            ? `Corta o vídeo: toca ${formatDurationMs(play.playsMs)} de ${formatDurationMs(realMs!)}`
            : `Toca o vídeo inteiro: ${formatDurationMs(play.playsMs)}`}
          data-testid="item-real-duration"
        >
          {play.cut ? `corta · ${formatDurationMs(realMs!)}` : formatDurationMs(play.playsMs)}
        </span>
      )}
    </div>
  );
}

export type ScheduleUpdates = { start_time?: string | null; end_time?: string | null; days?: number[] | null };

interface ScheduleButtonProps {
  item: Pick<EditableItem, 'id' | 'start_time' | 'end_time' | 'days'>;
  onChange: (updates: ScheduleUpdates) => void;
  disabled?: boolean;
}

export function ItemScheduleButton({ item, onChange, disabled }: ScheduleButtonProps) {
  const active = hasSchedule(item);
  const start = normalizeTime(item.start_time) ?? '';
  const end = normalizeTime(item.end_time) ?? '';
  const days = normalizeDays(item.days) ?? [];
  const overnight = !!start && !!end && end < start;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Agendamento: ${scheduleSummary(item)}`}
          title={`Agendamento: ${scheduleSummary(item)}`}
          className={`relative h-8 w-8 ${active ? 'text-primary hover:text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <CalendarIcon className="h-4 w-4" />
          {active && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium leading-none">Agendamento</h4>
            <p className="mt-1 text-sm text-muted-foreground">Defina quando este item deve aparecer (horário de Brasília).</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`start-${item.id}`}>Início</Label>
              <Input
                id={`start-${item.id}`}
                type="time"
                value={start}
                onChange={(e) => onChange({ start_time: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`end-${item.id}`}>Fim</Label>
              <Input
                id={`end-${item.id}`}
                type="time"
                value={end}
                onChange={(e) => onChange({ end_time: e.target.value || null })}
              />
            </div>
          </div>
          {overnight && (
            <p className="text-xs text-muted-foreground">O fim é antes do início: o item aparece atravessando a meia-noite.</p>
          )}

          <div className="space-y-2">
            <Label>Dias da Semana</Label>
            <ToggleGroup
              type="multiple"
              variant="outline"
              value={days.map(String)}
              onValueChange={(val) => onChange({ days: normalizeDays(val.map(Number)) })}
              className="flex justify-between"
            >
              {WEEKDAY_LETTER.map((letter, i) => (
                <ToggleGroupItem key={i} value={String(i)} className="h-8 w-8 p-0" title={WEEKDAY_FULL[i]} aria-label={WEEKDAY_FULL[i]}>
                  {letter}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-center text-xs text-muted-foreground">
              {days.length === 0 ? 'Todos os dias (padrão)' : days.length === 7 ? 'Todos os dias' : 'Apenas dias selecionados'}
            </p>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-xs text-muted-foreground">{scheduleSummary(item)}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!active}
              onClick={() => onChange({ start_time: null, end_time: null, days: null })}
            >
              Limpar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface DuplicateButtonProps {
  onDuplicate: () => void;
  disabled?: boolean;
}

/** Duplica o item (cópia logo abaixo, com mesma mídia, duração e agendamento). Vale só depois de "Salvar". */
export function ItemDuplicateButton({ onDuplicate, disabled }: DuplicateButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      onClick={onDuplicate}
      aria-label="Duplicar mídia"
      title="Duplicar mídia"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
    >
      <Copy className="h-4 w-4" />
    </Button>
  );
}
