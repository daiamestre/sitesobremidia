import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ItemDurationInput, ItemScheduleButton } from '@/components/playlists/PlaylistItemControls';

describe('ItemDurationInput — duração por item na Lista de Reprodução', () => {
  it('mostra a duração atual em segundos', () => {
    render(<ItemDurationInput value={20} onChange={() => {}} />);
    expect(screen.getByLabelText('Duração em segundos')).toHaveValue(20);
  });

  it('digitar um valor válido atualiza na hora', () => {
    const onChange = vi.fn();
    render(<ItemDurationInput value={10} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Duração em segundos'), { target: { value: '58' } });
    expect(onChange).toHaveBeenLastCalledWith(58);
  });

  it('apagar o campo NÃO grava 0 (a Player pulava imagem de 0 s); ao sair volta a um valor válido', () => {
    const onChange = vi.fn();
    render(<ItemDurationInput value={10} onChange={onChange} />);
    const input = screen.getByLabelText('Duração em segundos');
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalledWith(0);
    fireEvent.blur(input);
    expect(input).toHaveValue(10); // padrão, nunca 0
  });

  it('valor 0 digitado não é aceito', () => {
    const onChange = vi.fn();
    render(<ItemDurationInput value={10} onChange={onChange} />);
    const input = screen.getByLabelText('Duração em segundos');
    fireEvent.change(input, { target: { value: '0' } });
    expect(onChange).not.toHaveBeenCalledWith(0);
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('funciona também para widget (antes o campo ficava travado)', () => {
    const onChange = vi.fn();
    render(<ItemDurationInput value={10} onChange={onChange} />);
    expect(screen.getByLabelText('Duração em segundos')).not.toBeDisabled();
  });
});

describe('ItemScheduleButton — agendamento por item', () => {
  // O Radix Popover usa ResizeObserver como construtor; o mock global do setup não é construtível.
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });

  it('sem agendamento: rótulo "Sempre"', () => {
    render(<ItemScheduleButton item={{ id: 'a', start_time: null, end_time: null, days: null }} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Agendamento: Sempre/ })).toBeInTheDocument();
  });

  it('com agendamento: o botão resume horário e dias', () => {
    render(<ItemScheduleButton item={{ id: 'a', start_time: '08:00:00', end_time: '18:30:00', days: [1, 3, 5] }} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /08:00–18:30 · Seg, Qua, Sex/ })).toBeInTheDocument();
  });

  it('abre o popover e altera início/fim/dias', async () => {
    const onChange = vi.fn();
    render(<ItemScheduleButton item={{ id: 'a', start_time: null, end_time: null, days: null }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Agendamento/ }));
    const start = await screen.findByLabelText('Início');
    fireEvent.change(start, { target: { value: '09:15' } });
    expect(onChange).toHaveBeenCalledWith({ start_time: '09:15' });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '17:00' } });
    expect(onChange).toHaveBeenCalledWith({ end_time: '17:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Segunda' }));
    expect(onChange).toHaveBeenCalledWith({ days: [1] });
  });

  it('"Limpar" zera o agendamento', async () => {
    const onChange = vi.fn();
    render(<ItemScheduleButton item={{ id: 'a', start_time: '08:00', end_time: null, days: [2] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Agendamento/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Limpar' }));
    expect(onChange).toHaveBeenCalledWith({ start_time: null, end_time: null, days: null });
  });
});
