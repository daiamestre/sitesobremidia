import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  CanvasSignaturePad,
  TypedSignaturePad,
  SignatureCaptureModal,
} from '@/modules/crm/components/signature';
import {
  CanvasSignaturePadRef,
  TypedSignaturePadRef,
} from '@/modules/crm/types/assinatura.types';

// Mock Canvas 2D context methods for jsdom
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextId: string) => {
    if (contextId === '2d') {
      return {
        scale: vi.fn(),
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        bezierCurveTo: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn().mockReturnValue({
          width: 150,
          actualBoundingBoxAscent: 30,
          actualBoundingBoxDescent: 10,
        }),
        save: vi.fn(),
        restore: vi.fn(),
        strokeStyle: '#0f172a',
        fillStyle: '#0f172a',
        lineWidth: 2.5,
        lineCap: 'round',
        lineJoin: 'round',
        textBaseline: 'alphabetic',
        font: '16px sans-serif',
      };
    }
    return null;
  }) as any;

  HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((callback: (blob: Blob) => void, type?: string) => {
    const mockBlob = new Blob(['mock-png-data'], { type: type || 'image/png' });
    callback(mockBlob);
  });

  HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');

  // Mock setPointerCapture / releasePointerCapture
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);
});

describe('GATE 2-D — Testes de Captura de Assinatura Digital', () => {

  // ==========================================================================
  // 1. CANVAS SIGNATURE PAD (DRAWN)
  // ==========================================================================
  describe('1. CanvasSignaturePad (Método DRAWN)', () => {
    it('1.1. Renderiza o elemento canvas com touch-action: none e linhas guia', () => {
      render(<CanvasSignaturePad />);
      const canvas = screen.getByLabelText('Área de assinatura digital manuscrita');
      expect(canvas).toBeInTheDocument();
      expect(canvas).toHaveStyle({ touchAction: 'none' });
      expect(screen.getByText(/Assine sobre a linha/i)).toBeInTheDocument();
    });

    it('1.2. Inicia, traça e encerra o desenho via Pointer Events unificados', () => {
      const onStrokeChange = vi.fn();
      render(<CanvasSignaturePad onStrokeChange={onStrokeChange} />);
      const canvas = screen.getByLabelText('Área de assinatura digital manuscrita');

      // PointerDown
      fireEvent.pointerDown(canvas, {
        clientX: 50,
        clientY: 50,
        pointerId: 1,
        isPrimary: true,
        pressure: 0.8,
      });

      // PointerMove
      fireEvent.pointerMove(canvas, {
        clientX: 80,
        clientY: 70,
        pointerId: 1,
        isPrimary: true,
        pressure: 0.8,
      });

      // PointerUp
      fireEvent.pointerUp(canvas, {
        clientX: 120,
        clientY: 90,
        pointerId: 1,
        isPrimary: true,
      });

      expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
      expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
      expect(onStrokeChange).toHaveBeenCalledWith(false);
      expect(screen.getByText(/Traçado Registrado/i)).toBeInTheDocument();
    });

    it('1.3. Encerra desenho corretamente em caso de pointercancel', () => {
      const onStrokeChange = vi.fn();
      render(<CanvasSignaturePad onStrokeChange={onStrokeChange} />);
      const canvas = screen.getByLabelText('Área de assinatura digital manuscrita');

      fireEvent.pointerDown(canvas, { clientX: 30, clientY: 30, pointerId: 2, isPrimary: true });
      fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60, pointerId: 2, isPrimary: true });
      fireEvent.pointerCancel(canvas, { pointerId: 2 });

      expect(canvas.releasePointerCapture).toHaveBeenCalledWith(2);
      expect(onStrokeChange).toHaveBeenCalledWith(false);
    });

    it('1.4. Suporta eventos de Touch (smartphone, tablet, iPad) via pointerType=touch', () => {
      const onStrokeChange = vi.fn();
      render(<CanvasSignaturePad onStrokeChange={onStrokeChange} />);
      const canvas = screen.getByLabelText('Área de assinatura digital manuscrita');

      fireEvent.pointerDown(canvas, { clientX: 15, clientY: 25, pointerId: 10, isPrimary: true, pointerType: 'touch' });
      fireEvent.pointerMove(canvas, { clientX: 45, clientY: 55, pointerId: 10, isPrimary: true, pointerType: 'touch' });
      fireEvent.pointerUp(canvas, { pointerId: 10, pointerType: 'touch' });

      expect(onStrokeChange).toHaveBeenCalledWith(false);
    });

    it('1.5. Suporta eventos de Stylus / Caneta (Apple Pencil, S-Pen) com pressão via pointerType=pen', () => {
      const onStrokeChange = vi.fn();
      render(<CanvasSignaturePad onStrokeChange={onStrokeChange} />);
      const canvas = screen.getByLabelText('Área de assinatura digital manuscrita');

      fireEvent.pointerDown(canvas, { clientX: 20, clientY: 30, pointerId: 11, isPrimary: true, pointerType: 'pen', pressure: 0.95 });
      fireEvent.pointerMove(canvas, { clientX: 70, clientY: 80, pointerId: 11, isPrimary: true, pointerType: 'pen', pressure: 0.85 });
      fireEvent.pointerUp(canvas, { pointerId: 11, pointerType: 'pen' });

      expect(onStrokeChange).toHaveBeenCalledWith(false);
    });

    it('1.6. Suporta métodos de ref: isEmpty, clear, undo, toPngBlob e toDataUrl', async () => {
      const ref = React.createRef<CanvasSignaturePadRef>();
      render(<CanvasSignaturePad ref={ref} />);
      const canvas = screen.getByLabelText('Área de assinatura digital manuscrita');

      // Inicialmente vazio
      expect(ref.current?.isEmpty()).toBe(true);

      // Desenha traço 1
      fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1, isPrimary: true });
      fireEvent.pointerMove(canvas, { clientX: 40, clientY: 40, pointerId: 1, isPrimary: true });
      fireEvent.pointerUp(canvas, { pointerId: 1 });

      // Desenha traço 2
      fireEvent.pointerDown(canvas, { clientX: 60, clientY: 60, pointerId: 1, isPrimary: true });
      fireEvent.pointerMove(canvas, { clientX: 80, clientY: 80, pointerId: 1, isPrimary: true });
      fireEvent.pointerUp(canvas, { pointerId: 1 });

      expect(ref.current?.isEmpty()).toBe(false);

      // Exportação para Blob e DataUrl
      const blob = await ref.current?.toPngBlob();
      expect(blob).toBeInstanceOf(Blob);

      const dataUrl = ref.current?.toDataUrl();
      expect(dataUrl).toContain('data:image/png;base64');

      // Undo remove 1 traço
      act(() => {
        ref.current?.undo();
      });
      expect(ref.current?.isEmpty()).toBe(false);

      // Clear limpa tudo
      act(() => {
        ref.current?.clear();
      });
      expect(ref.current?.isEmpty()).toBe(true);
    });

    it('1.7. Botões de Desfazer e Limpar na barra de ferramentas funcionam', () => {
      render(<CanvasSignaturePad />);
      const canvas = screen.getByLabelText('Área de assinatura digital manuscrita');

      // Desenha traço
      fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1, isPrimary: true });
      fireEvent.pointerMove(canvas, { clientX: 50, clientY: 50, pointerId: 1, isPrimary: true });
      fireEvent.pointerUp(canvas, { pointerId: 1 });

      expect(screen.getByText('1 traço(s)')).toBeInTheDocument();

      const btnLimpar = screen.getByTitle(/Limpar toda a área/i);
      expect(btnLimpar).not.toBeDisabled();

      fireEvent.click(btnLimpar);
      expect(screen.getByText(/Aguardando traço/i)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 2. TYPED SIGNATURE PAD (TYPED)
  // ==========================================================================
  describe('2. TypedSignaturePad (Método TYPED)', () => {
    it('2.1. Renderiza o campo de digitação com pré-visualização caligráfica', () => {
      render(<TypedSignaturePad initialName="Maria Joaquina" />);
      const input = screen.getByLabelText(/Digite seu Nome Completo/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('Maria Joaquina');
      expect(screen.getAllByText('Maria Joaquina').length).toBeGreaterThan(0);
      expect(screen.getByText(/Assinatura Válida/i)).toBeInTheDocument();
    });

    it('2.2. Atualiza pré-visualização e status vazio conforme digitação', () => {
      const onNameChange = vi.fn();
      render(<TypedSignaturePad onNameChange={onNameChange} />);
      const input = screen.getByLabelText(/Digite seu Nome Completo/i);

      fireEvent.change(input, { target: { value: 'Carlos Drummond' } });
      expect(onNameChange).toHaveBeenCalledWith('Carlos Drummond', false);
      expect(screen.getByText('15 caractere(s)')).toBeInTheDocument();

      fireEvent.change(input, { target: { value: '   ' } });
      expect(onNameChange).toHaveBeenCalledWith('', true);
      expect(screen.getByText(/Aguardando digitação/i)).toBeInTheDocument();
    });

    it('2.3. Permite selecionar estilos caligráficos diferentes (Caveat, Dancing, Great Vibes)', () => {
      render(<TypedSignaturePad initialName="Ana Clara" />);
      
      const btnCaveat = screen.getByText('Fluido & Moderno');
      const btnDancing = screen.getByText('Elegante & Expressivo');
      const btnGreatVibes = screen.getByText('Clássico & Formal');

      expect(btnCaveat).toBeInTheDocument();
      expect(btnDancing).toBeInTheDocument();
      expect(btnGreatVibes).toBeInTheDocument();

      fireEvent.click(btnDancing);
      expect(btnDancing.closest('button')).toHaveClass('border-primary');
    });

    it('2.4. Suporta métodos de ref: isEmpty, clear, toPngBlob, toDataUrl e getSelectedName', async () => {
      const ref = React.createRef<TypedSignaturePadRef>();
      render(<TypedSignaturePad ref={ref} initialName="Fernando Pessoa" />);

      expect(ref.current?.isEmpty()).toBe(false);
      expect(ref.current?.getSelectedName()).toBe('Fernando Pessoa');

      const blob = await ref.current?.toPngBlob();
      expect(blob).toBeInstanceOf(Blob);

      const dataUrl = await ref.current?.toDataUrl();
      expect(dataUrl).toContain('data:image/png;base64');

      act(() => {
        ref.current?.clear();
      });
      expect(ref.current?.isEmpty()).toBe(true);
      expect(ref.current?.getSelectedName()).toBe('');
    });
  });

  // ==========================================================================
  // 3. SIGNATURE CAPTURE MODAL (INTEGRAÇÃO E REGRAS)
  // ==========================================================================
  describe('3. SignatureCaptureModal (Modal e Regras de Negócio)', () => {
    const mockSigner = {
      nome: 'Roberto Justus',
      email: 'roberto@empresa.com.br',
      cpfCnpj: '12.345.678/0001-90',
    };

    it('3.1. Renderiza o modal com informações do signatário, contrato e aviso de segurança', () => {
      render(
        <SignatureCaptureModal
          isOpen={true}
          onClose={vi.fn()}
          onCapture={vi.fn()}
          signer={mockSigner}
          contratoNumero="CTR-2026-0099"
          tipoContrato="ANUNCIANTE"
          tituloDocumento="Contrato de Prestação de Serviços de Mídia"
        />
      );

      expect(screen.getByText('Assinatura Digital do Contrato')).toBeInTheDocument();
      expect(screen.getByText('CTR-2026-0099')).toBeInTheDocument();
      expect(screen.getByText('ANUNCIANTE')).toBeInTheDocument();
      expect(screen.getAllByText('Roberto Justus').length).toBeGreaterThan(0);
      expect(screen.getByText('Doc: 12.345.678/0001-90')).toBeInTheDocument();
      expect(screen.getByText(/MP 2.200-2\/2001 e a Lei Federal 14.063\/2020/i)).toBeInTheDocument();
    });

    it('3.2. Alterna entre abas "Desenhar na Tela" e "Digitar meu Nome"', () => {
      render(
        <SignatureCaptureModal
          isOpen={true}
          onClose={vi.fn()}
          onCapture={vi.fn()}
          signer={mockSigner}
        />
      );

      const tabDrawn = screen.getByRole('tab', { name: /Desenhar na Tela/i });
      const tabTyped = screen.getByRole('tab', { name: /Digitar meu Nome/i });

      expect(tabDrawn).toHaveAttribute('data-state', 'active');

      fireEvent.click(tabTyped);
      expect(tabTyped).toHaveAttribute('data-state', 'active');
      expect(screen.getByLabelText(/Digite seu Nome Completo/i)).toBeInTheDocument();
    });

    it('3.3. REGRA DE OURO: "Assinar Depois" encerra sem bloquear cadastro (action: SKIPPED)', () => {
      const onCapture = vi.fn();
      const onClose = vi.fn();

      render(
        <SignatureCaptureModal
          isOpen={true}
          onClose={onClose}
          onCapture={onCapture}
          signer={mockSigner}
        />
      );

      const btnAssinarDepois = screen.getByRole('button', { name: /Assinar Depois/i });
      fireEvent.click(btnAssinarDepois);

      expect(onCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SKIPPED',
          signer: mockSigner,
        })
      );
      expect(onClose).toHaveBeenCalled();
    });

    it('3.4. Bloqueia confirmação quando a assinatura está vazia no modo DRAWN', () => {
      render(
        <SignatureCaptureModal
          isOpen={true}
          onClose={vi.fn()}
          onCapture={vi.fn()}
          signer={{ nome: '' }}
        />
      );

      const btnConfirmar = screen.getByRole('button', { name: /Confirmar Assinatura/i });
      expect(btnConfirmar).toBeDisabled();
    });

    it('3.5. Confirma assinatura com sucesso no modo DRAWN (action: SIGNED, method: DRAWN)', async () => {
      const onCapture = vi.fn();
      const onClose = vi.fn();

      render(
        <SignatureCaptureModal
          isOpen={true}
          onClose={onClose}
          onCapture={onCapture}
          signer={mockSigner}
        />
      );

      const canvas = screen.getByLabelText('Área de assinatura digital manuscrita');

      // Simula traçado no canvas
      fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1, isPrimary: true });
      fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60, pointerId: 1, isPrimary: true });
      fireEvent.pointerUp(canvas, { pointerId: 1 });

      const btnConfirmar = screen.getByRole('button', { name: /Confirmar Assinatura/i });
      expect(btnConfirmar).not.toBeDisabled();

      fireEvent.click(btnConfirmar);

      await waitFor(() => {
        expect(onCapture).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'SIGNED',
            method: 'DRAWN',
            signatureImage: expect.any(Blob),
            signer: expect.objectContaining({ nome: 'Roberto Justus' }),
          })
        );
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('3.6. Confirma assinatura com sucesso no modo TYPED (action: SIGNED, method: TYPED)', async () => {
      const onCapture = vi.fn();
      const onClose = vi.fn();

      render(
        <SignatureCaptureModal
          isOpen={true}
          onClose={onClose}
          onCapture={onCapture}
          signer={{ nome: 'Silvio Santos' }}
        />
      );

      // Troca para aba Digitar
      const tabTyped = screen.getByRole('tab', { name: /Digitar meu Nome/i });
      fireEvent.click(tabTyped);

      const btnConfirmar = screen.getByRole('button', { name: /Confirmar Assinatura/i });
      expect(btnConfirmar).not.toBeDisabled();

      fireEvent.click(btnConfirmar);

      await waitFor(() => {
        expect(onCapture).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'SIGNED',
            method: 'TYPED',
            signatureImage: expect.any(Blob),
            signer: expect.objectContaining({ nome: 'Silvio Santos' }),
          })
        );
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('3.7. Botão Cancelar fecha o modal sem emitir evento de captura', () => {
      const onCapture = vi.fn();
      const onClose = vi.fn();

      render(
        <SignatureCaptureModal
          isOpen={true}
          onClose={onClose}
          onCapture={onCapture}
          signer={mockSigner}
        />
      );

      const btnCancelar = screen.getByRole('button', { name: /Cancelar/i });
      fireEvent.click(btnCancelar);

      expect(onClose).toHaveBeenCalled();
      expect(onCapture).not.toHaveBeenCalled();
    });
  });
});
