/**
 * F-291 — REGRA DO DONO: fruta, legume, verdura e ovos sem marca recebem SÓ foto do hortifrúti (nunca refrigerante de uva, cachaça
 * de caju, macarrão com ovos, farinha de mandioca, snack de batata doce) e o nome curto recebe a variedade tradicional.
 */
import { describe, expect, it } from 'vitest';
import { ehPedidoDeHortifruti, nomeTradicionalDoHortifruti } from '@/lib/tabloide/hortifruti';

describe('F-291 pedido de hortifrúti', () => {
  it.each(['Uva', 'Caju', 'Ovos', 'Mandioca', 'Batata Doce', 'Batata Doce Roxa', 'Batata Doce Branca', 'Coentro', 'Cheiro Verde', 'Xuxu', 'Abacaxi Pérola', 'Laranja Pera kg', 'Alface Crespa un', 'Banana da Terra'])('"%s" é hortifrúti', (n) => {
    expect(ehPedidoDeHortifruti(n)).toBe(true);
  });
  it.each(['Refrigerante Fanta Uva 2L', 'Pitú Cajú', 'Macarrão com Ovos Isabela 500g', 'Farinha de Mandioca Yoki 1kg', 'Snack Arroz Batata Doce Camil', 'Coentro em Folhas Kisabor', 'Batata Palha Yoki 140g', 'Suco de Laranja Del Valle 1L'])('"%s" NÃO é hortifrúti (tem marca ou é industrializado)', (n) => {
    expect(ehPedidoDeHortifruti(n)).toBe(false);
  });
  it('nome curto vira a variedade tradicional', () => {
    expect(nomeTradicionalDoHortifruti('Uva')).toBe('Uva Vitória');
    expect(nomeTradicionalDoHortifruti('Banana')).toBe('Banana Prata');
    expect(nomeTradicionalDoHortifruti('Laranja kg')).toBe('Laranja Pera');
    expect(nomeTradicionalDoHortifruti('Ovos')).toBe('Ovos Brancos');
    expect(nomeTradicionalDoHortifruti('Xuxu')).toBe('Chuchu');
    expect(nomeTradicionalDoHortifruti('Aipim')).toBe('Mandioca');
    expect(nomeTradicionalDoHortifruti('Refrigerante Fanta Uva')).toBeNull();
  });
});
