/**
 * SOBRE MÍDIA — Unit Test Suite for src/utils/formatters.ts
 */

import { describe, it, expect } from 'vitest';
import { formatPercentage, formatBytes, formatCpfCnpj, formatCep, formatPhone } from '../../utils/formatters';

describe('formatters', () => {
  it('formatCpfCnpj formata CPF com 11 digitos', () => {
    expect(formatCpfCnpj('12345678901')).toBe('123.456.789-01');
  });

  it('formatCpfCnpj formata CNPJ com 14 digitos', () => {
    expect(formatCpfCnpj('12345678000195')).toBe('12.345.678/0001-95');
  });

  it('formatCpfCnpj trata string vazia ou null', () => {
    expect(formatCpfCnpj('')).toBe('');
    expect(formatCpfCnpj(null as any)).toBe('');
  });

  it('formatCep formata CEP com 8 digitos ou vazio', () => {
    expect(formatCep('01310100')).toBe('01310-100');
    expect(formatCep('')).toBe('');
  });

  it('formatPhone formata celular e fixo', () => {
    expect(formatPhone('11987654321')).toBe('(11) 98765-4321');
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444');
    expect(formatPhone('')).toBe('');
  });

  it('formatPercentage e formatBytes', () => {
    expect(formatPercentage(50)).toBe('50.0%');
    expect(formatBytes(1024)).toBe('1 KB');
  });
});
