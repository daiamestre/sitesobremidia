// F-122 — Pagador do boleto montado com o cadastro REAL do cliente (tabela empresas).
// Módulo puro (sem Deno/rede) para poder ser testado. Nada é inventado: se faltar dado
// obrigatório para o banco, o boleto não é emitido e a lista "faltando" diz o que completar.

export type CadastroCliente = {
  razao_social?: string | null;
  nome_fantasia?: string | null;
  cnpj?: string | null; // guarda CNPJ (14 dígitos) ou CPF (11 dígitos)
  email?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
};

export type PagadorInter = {
  tipoPessoa: 'FISICA' | 'JURIDICA';
  nome: string;
  cpfCnpj: string;
  endereco: string;
  cidade: string;
  uf: string;
  cep: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  email?: string;
};

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const limpo = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function cpfValido(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

export function cnpjValido(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (ate: number) => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cnpj[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(cnpj[12]) && digito(13) === Number(cnpj[13]);
}

/** Monta o pagador exigido pelo Banco Inter. `faltando` vazio = pode emitir. */
export function montarPagador(c: CadastroCliente | null | undefined): { pagador: PagadorInter | null; faltando: string[] } {
  const faltando: string[] = [];
  if (!c) return { pagador: null, faltando: ['cadastro do cliente'] };

  const doc = soDigitos(c.cnpj);
  const pessoaJuridica = doc.length === 14;
  if (!(pessoaJuridica ? cnpjValido(doc) : cpfValido(doc))) faltando.push('CPF/CNPJ válido');

  const nome = limpo(c.razao_social || c.nome_fantasia, 100);
  if (nome.length < 2) faltando.push('nome/razão social');

  const cep = soDigitos(c.cep);
  if (cep.length !== 8) faltando.push('CEP');

  const endereco = limpo(c.logradouro, 100);
  if (!endereco) faltando.push('endereço (rua)');

  const cidade = limpo(c.cidade, 60);
  if (!cidade) faltando.push('cidade');

  const uf = limpo(c.estado, 2).toUpperCase();
  if (!UFS.includes(uf)) faltando.push('estado (UF)');

  if (faltando.length) return { pagador: null, faltando };

  const pagador: PagadorInter = { tipoPessoa: pessoaJuridica ? 'JURIDICA' : 'FISICA', nome, cpfCnpj: doc, endereco, cidade, uf, cep };
  const numero = limpo(c.numero, 10);
  if (numero) pagador.numero = numero;
  const complemento = limpo(c.complemento, 30);
  if (complemento) pagador.complemento = complemento;
  const bairro = limpo(c.bairro, 60);
  if (bairro) pagador.bairro = bairro;
  const email = limpo(c.email, 50);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) pagador.email = email;
  return { pagador, faltando };
}

/** Frase única para o painel: o que completar no cadastro para o boleto sair. */
export function mensagemCadastroIncompleto(faltando: string[]): string {
  return `Cadastro do cliente incompleto para emitir boleto. Complete: ${faltando.join(', ')}.`;
}
