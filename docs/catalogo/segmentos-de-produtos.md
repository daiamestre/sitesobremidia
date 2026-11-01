# Segmentos de produtos do varejo brasileiro: catálogo SOBRE MÍDIA

Pesquisa de 01/11/2026. Objetivo: definir a espinha dorsal de classificação e a árvore de segmentos para abastecer o catálogo em etapas, por GTIN ou por nome.

## Como ler este documento

- **Fato confirmado:** tem fonte ao final do documento ou foi contado em arquivo oficial.
- **Decisão de curadoria:** a árvore, as prioridades, a fonte de foto e a coluna GTIN são julgamento editorial, não dado medido.
- **Marcas:** amostra de vocabulário vinda de conhecimento geral. Não é ranking nem foi conferida marca a marca. Antes de usar a marca em massa, conferir se ela segue ativa no mercado.

| Legenda | Significado |
|---|---|
| Prioridade 1 | Aparece em quase todo encarte de supermercado ou atacarejo |
| Prioridade 2 | Frequente, sazonal ou ligada a um tipo específico de loja |
| Prioridade 3 | Ocasional em mercado; importante para lojas de outros ramos |
| GTIN Sim | Produto industrial que normalmente tem código de barras próprio |
| GTIN Misto | Parte tem GTIN (embalado de marca) e parte não tem (balcão, balança, feito na loja) |
| GTIN Não | Sem GTIN na prática; depende de foto genérica própria e de código interno |

## 1. Taxonomia recomendada

**Recomendação: GS1 GPC como espinha dorsal**, com a árvore em português deste documento como camada de exibição.

- **Por quê:** o GPC é o único dos quatro padrões ligado diretamente ao GTIN. Cada GTIN recebe um único brick, e o campo é obrigatório no Cadastro Nacional de Produtos da GS1 Brasil desde 2016. Assim, o produto consultado por código de barras pode já vir classificado.
- **Onde baixar:** [gpc-browser.gs1.org](https://gpc-browser.gs1.org/). A versão mais recente localizada é **GPC as of May 2026 (v20260520)**, com arquivos em JSON, XML e XLSX. A versão usada em GDSN é a de novembro de 2025 (v20251127).
- **Atenção:** a página não tem um link direto confirmado para o arquivo. O site recusa acesso automatizado, então uma pessoa precisa baixar pelo navegador. Isso é feito uma vez a cada publicação (maio e novembro).
- **Pendências antes de adotar:** confirmar a licença e a existência de versão em português (ver seção 7).
- **Plano B com arquivo direto:** se a licença ou o acesso do GPC não servirem, usar o Google Product Taxonomy em pt-BR, que é o único com arquivo direto e tradução confirmados: [taxonomy-with-ids.pt-BR.txt](https://www.google.com/basepages/producttype/taxonomy-with-ids.pt-BR.txt).

### Comparação

| Critério | GS1 GPC | Google Product Taxonomy | NCM/Mercosul | Árvores de varejistas |
|---|---|---|---|---|
| Finalidade | Classificação comercial global ligada ao GTIN | Categorias para anúncios de produto | Classificação fiscal e aduaneira | Navegação de loja |
| Estrutura | 4 níveis: segmento, família, classe, brick, com atributos | 21 categorias de topo, até 7 níveis | 8 dígitos sobre o Sistema Harmonizado | Livre, muda sem aviso |
| Tamanho | 44 segmentos (lista de junho/2024); totais atuais não confirmados | 5.595 categorias (contado) | 15.157 linhas, 10.516 códigos de 8 dígitos (contado) | Variável |
| Versão | Maio/2026 (v20260520) | 2021-09-21 no cabeçalho do arquivo | Vigente em 01/11/2026, Resolução Gecex nº 926/2026 | Não se aplica |
| Atualização | 2 vezes por ano (maio e novembro) | Arquivo sem revisão desde 2021 | Contínua, por atos legais | Contínua |
| Download | XLSX, JSON, XML, via navegador | TXT e XLS, link direto | JSON, link direto oficial; XLSX pelo Classif | Sem arquivo |
| Português | Não confirmado | Sim, pt-BR oficial | Sim, nativo | Sim, nativo |
| Licença | Não confirmada; descrito como gratuito por terceiros | Não verificada | Dado público oficial | Uso só como referência |
| Vínculo com GTIN | Direto, um brick por GTIN | Indireto | Indireto, um código fiscal por item | Nenhum |
| Principal limite | Tradução e licença em aberto | Parado desde 2021, feito para anúncios | Linguagem fiscal, agrupa por material e função aduaneira | Não é padrão |

**Detalhes contados no Google pt-BR:** nível 1 = 21; nível 2 = 192; nível 3 = 1.349; nível 4 = 2.203; nível 5 = 1.385; nível 6 = 397; os outros 48 estão no nível 7. Alimentos, bebidas e tabaco somam 364 categorias, e a taxonomia desce até a variedade (bananas, tomates, alface).

**NCM:** a tabela vigente tem 96 capítulos preenchidos, de 01 a 97 sem o 77. O Siscomex descreve o Sistema Harmonizado com 97 capítulos e 21 seções.

- JSON direto: `https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO`
- XLSX: [Classif, tabela pública](https://portalunico.siscomex.gov.br/classif/#/nomenclatura/tabela?perfil=publico)

**Papel de cada padrão no catálogo:** guardar o brick GPC quando vier da base de GTIN, guardar o NCM quando houver e usar o Google pt-BR como dicionário de sinônimos para o cadastro por nome. As árvores de varejistas entraram só como vocabulário.

### Vocabulário de varejistas lido nesta pesquisa

| Varejista | Departamentos lidos no site |
|---|---|
| Tenda Atacado | Food Service, Bem-estar, Bebidas, Mercearia, Congelados, Frios e Laticínios, Carnes Aves e Peixes, Limpeza, Higiene e Perfumaria, Bebê, Bomboniere, Pães e Bolos, Hortifrúti, Bazar, Pet Shop |
| Pão de Açúcar | Alimentos, Bebidas, Limpeza, Descartáveis, Bebê e Criança, Perfumaria, Bazar, PetShop, Têxtil, Eletro |
| Cobasi | Cachorros, Gatos, Pássaros, Peixes, Outros pets, Casa, Jardim, Piscina |
| Kalunga | Escolar, Papéis e Pastas, Escrita e Corretivos, Organização, Informática, Embalagens, Coffee Break, Higiene e Limpeza, Móveis e Equipamentos |
| Renner | Feminino, Masculino, Infantil, Beleza, Jeans, Acessórios, Calçados, Esportivo, Moda Praia, Moda Íntima |
| Ri Happy | Brinquedos, Bonecos e bonecas, Jogos, Baby, Esportes, Geek e Colecionáveis, Fantasias, Livros e Papelaria |
| Decathlon | Esportes, Feminino, Masculino, Infantil, Acessórios, Equipamentos |

## 2. Resumo dos segmentos

Total: **40 segmentos** de primeiro nível. A contagem de subcategorias está na seção 6.

| # | Segmento | Prioridade | GTIN | Fonte de foto mais provável |
|---|---|---:|---|---|
| 01 | Frutas | 1 | Não | Foto própria genérica |
| 02 | Legumes, verduras e temperos frescos | 1 | Não | Foto própria genérica |
| 03 | Açougue | 1 | Misto | Foto própria genérica; embalados por base de GTIN |
| 04 | Peixaria e frutos do mar | 2 | Misto | Foto própria genérica; embalados por base de GTIN |
| 05 | Padaria e confeitaria | 1 | Misto | Foto própria genérica; embalados por base de GTIN |
| 06 | Frios e embutidos | 1 | Misto | Base de GTIN; fatiados por foto própria genérica |
| 07 | Laticínios e ovos | 1 | Sim | Base de GTIN |
| 08 | Congelados e sorvetes | 1 | Sim | Base de GTIN |
| 09 | Comida pronta e rotisseria | 2 | Não | Foto própria genérica |
| 10 | A granel e empório | 2 | Não | Foto própria genérica |
| 11 | Mercearia básica | 1 | Sim | Base de GTIN |
| 12 | Molhos, temperos e conservas | 1 | Sim | Base de GTIN |
| 13 | Café, chá e matinais | 1 | Sim | Base de GTIN |
| 14 | Biscoitos e snacks | 1 | Sim | Base de GTIN |
| 15 | Doces, chocolates e bomboniere | 1 | Sim | Base de GTIN |
| 16 | Refrigerantes | 1 | Sim | Base de GTIN |
| 17 | Sucos, águas e bebidas sem álcool | 1 | Sim | Base de GTIN |
| 18 | Cervejas e bebidas alcoólicas | 1 | Sim | Base de GTIN |
| 19 | Limpeza da casa | 1 | Sim | Base de GTIN |
| 20 | Higiene e perfumaria | 1 | Sim | Base de GTIN |
| 21 | Bebê e infantil | 1 | Sim | Base de GTIN |
| 22 | Beleza e cosméticos | 2 | Sim | Base de GTIN; site da marca |
| 23 | Farmácia e saúde | 2 | Sim | Base de GTIN; site da marca |
| 24 | Pet shop | 2 | Misto | Base de GTIN; a granel por foto própria genérica |
| 25 | Bazar, descartáveis e utilidades | 2 | Sim | Base de GTIN; site da marca |
| 26 | Cama, mesa, banho e móveis | 3 | Misto | Site da marca |
| 27 | Eletrodomésticos e eletroportáteis | 2 | Sim | Site da marca |
| 28 | Eletrônicos, informática e telefonia | 3 | Sim | Site da marca |
| 29 | Papelaria e escritório | 2 | Sim | Base de GTIN; site da marca |
| 30 | Ferragens, construção e jardim | 3 | Misto | Site da marca; a granel por foto própria genérica |
| 31 | Automotivo | 3 | Misto | Site da marca |
| 32 | Roupas e acessórios | 3 | Misto | Foto própria da loja; site da marca |
| 33 | Calçados | 3 | Misto | Site da marca; foto própria da loja |
| 34 | Brinquedos e festas | 3 | Sim | Base de GTIN; site da marca |
| 35 | Esporte e lazer | 3 | Misto | Site da marca |
| 36 | Tabacaria | 3 | Sim | Não anunciar; ver seção 5 |
| 37 | Lanchonete e fast food | 2 | Não | Foto própria genérica ou da loja |
| 38 | Pizzaria | 2 | Não | Foto própria genérica ou da loja |
| 39 | Restaurante, sorveteria e cafeteria | 2 | Não | Foto própria genérica ou da loja |
| 40 | Serviços de varejo | 3 | Não | Foto própria genérica; marca do serviço |

## 3. Segmentos sem GTIN na prática

Estes dependem de **foto genérica própria** e de um código interno do catálogo. Não adianta procurá-los em base de GTIN.

| Grupo | Segmentos e itens | Observação |
|---|---|---|
| Sem GTIN em quase tudo | 01 Frutas, 02 Legumes e verduras, 09 Comida pronta, 10 A granel, 37 Lanchonete, 38 Pizzaria, 39 Restaurante, 40 Serviços | Criar foto genérica por item, como "banana prata" ou "pizza calabresa" |
| Sem GTIN no balcão | 03 Açougue, 04 Peixaria, 05 Padaria, cortes fatiados de 06 Frios | Só os embalados de marca têm GTIN |
| Sem GTIN em parte | 24 ração a granel, 26 peças sob medida, 30 itens a metro ou a quilo, 31 peças e serviços, 32 e 33 grade por tamanho e cor, 35 itens por tamanho | O GTIN costuma variar por tamanho e cor, então a foto deve ser do modelo |

**Regras úteis para esses itens:**

- **Chave do catálogo:** usar código interno próprio. Não inventar GTIN: a Sefaz-SP orienta informar o literal "SEM GTIN" e não usar código aleatório na NF-e.
- **Código PLU:** pode ser um campo opcional para hortifruti. O sistema é voluntário, usa 4 dígitos no convencional e normalmente um 9 à frente no orgânico. Não confirmei adoção no Brasil.
- **Etiqueta de balança:** o código começado por 2 guarda o código da loja mais peso ou preço e **não identifica o produto**. Ao ler esse código no cadastro, cair na busca por nome. A descrição veio de fontes de terceiros, não da GS1 Brasil.

## 4. Fontes de foto

| Fonte | Tipo | O que retorna | Limites e condições |
|---|---|---|---|
| Bluesoft Cosmos | Base de GTIN | Descrição, GTIN, miniatura, preço médio, marca, GPC, NCM e CEST, segundo exemplo de biblioteca npm | Exige token; preços, limites e tamanho da base não confirmados; a imagem é miniatura |
| Verified by GS1 (GS1 Brasil) | Base de GTIN oficial | Marca, descrição, GPC, NCM, CEST, imagens, peso e medidas, segundo terceiro | Exige contrato; os campos variam conforme o perfil contratado |
| Open Food Facts | Base aberta | Dados e fotos de alimentos; 37.649 produtos do Brasil na página do país | Base ODbL, imagens CC BY-SA 3.0, com crédito e compartilhamento pela mesma licença; logos e marcas nas fotos não são cobertos |
| Open Products Facts e Open Beauty Facts | Base aberta | Mesma ideia para não alimentos e cosméticos | Tamanho e licença não conferidos |
| Site da marca | Site oficial | Foto de boa qualidade | Direito autoral da marca; pedir autorização ou usar material oficial para varejistas |
| Foto própria genérica | Própria (fotografada ou gerada) | Item sem marca | Precisa ser produzida; não pode mostrar marca de terceiros |

A cobertura real de cada base por segmento **não foi medida**. Antes de investir em um segmento, testar uma amostra de 50 a 100 GTINs dele.

## 5. Alertas legais que afetam o catálogo

Não é parecer jurídico. Confirmar antes de ligar esses itens a encartes.

| Item | Regra | Efeito no catálogo |
|---|---|---|
| Fórmulas infantis, mamadeiras, bicos e chupetas | A Lei 11.265/2006 (NBCAL) veda promoção comercial; reportagem cita proibição de ofertas e descontos em lojas | Classificar, mas bloquear em encarte |
| Cigarros e derivados do tabaco | Propaganda proibida no país; só exposição no ponto de venda, com advertência e tabela de preços | Classificar, mas bloquear em encarte; o dispositivo eletrônico para fumar tem venda proibida (RDC 46/2009, citada em fonte municipal) |
| Medicamentos | Há regra específica da Anvisa sobre propaganda; **não consegui confirmar o texto vigente** | Tratar com cautela até o jurídico revisar |
| Bebidas alcoólicas | Lei 9.294/96 traz restrições; **não verifiquei o que vale para tela digital em loja** | Verificar antes de liberar sem aviso |

## 6. Árvore de segmentos

**Total: 40 segmentos e 332 subcategorias**, das quais 68 estão marcadas como sem GTIN na prática.

GPC usa os nomes em inglês da lista de junho/2024. Os capítulos NCM foram conferidos na tabela vigente. O vínculo com GPC, Google e NCM é por aproximação no nível do segmento.

### Perecíveis e balcão

## 01. Frutas

Prioridade 1 · GTIN Não · Foto própria genérica · GPC: Food/Beverage · Google: Alimentos, bebidas e tabaco > Alimentos > Frutas e vegetais · NCM: 08

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Frutas tropicais | Banana prata, banana nanica, manga, abacaxi, mamão, maracujá | Não |
| Frutas cítricas | Laranja, limão, tangerina, mexerica | Não |
| Frutas de clima temperado | Maçã, pera, uva, ameixa, pêssego | Não |
| Melões e melancia | Melancia, melão amarelo, melão orange | Não |
| Frutas vermelhas | Morango, amora, mirtilo, framboesa | Misto |
| Frutas secas e castanhas a peso | Uva-passa, damasco, tâmara, ameixa seca | Não |

## 02. Legumes, verduras e temperos frescos

Prioridade 1 · GTIN Não · Foto própria genérica · GPC: Food/Beverage · Google: Alimentos, bebidas e tabaco > Alimentos > Frutas e vegetais · NCM: 07

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Legumes | Tomate, cenoura, abobrinha, chuchu, pepino, pimentão | Não |
| Raízes e tubérculos | Batata, batata-doce, mandioca, inhame, beterraba | Não |
| Bulbos | Cebola, alho, alho-poró | Não |
| Folhas e verduras | Alface, couve, rúcula, agrião, repolho | Não |
| Temperos frescos | Cheiro-verde, coentro, salsinha, manjericão, hortelã | Não |
| Minimamente processados | Saladas lavadas, legumes cortados, couve fatiada | Misto |
| Orgânicos | Itens em bandeja de produtores locais | Misto |

## 03. Açougue

Prioridade 1 · GTIN Misto · Foto própria genérica; embalados por base de GTIN · GPC: Food/Beverage · Google: Alimentos > Carne, frutos do mar e ovos · NCM: 02, 16

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Carne bovina, cortes de primeira | Picanha, alcatra, contrafilé, filé-mignon | Não |
| Carne bovina, cortes de segunda | Acém, músculo, costela, paleta, patinho moído | Não |
| Carne bovina embalada | Friboi, Maturatta, Swift, Bassi, Estância 92 | Misto |
| Carne suína | Pernil, lombo, costelinha, bisteca; Sadia, Seara, Perdigão | Misto |
| Frango in natura | Frango inteiro, coxa, sobrecoxa, peito, asa; Sadia, Seara, Perdigão, Copacol | Misto |
| Peru, pato e chester | Sadia, Perdigão, Seara | Sim |
| Cordeiro e carnes especiais | Pernil de cordeiro, carré | Misto |
| Linguiças frescas | Toscana, calabresa fresca, de frango; Sadia, Seara, Aurora | Misto |
| Miúdos e vísceras | Fígado, coração, moela, bucho | Não |
| Churrasco | Kits de espetos, carvão, sal grosso; Swift, Friboi | Misto |

## 04. Peixaria e frutos do mar

Prioridade 2 · GTIN Misto · Foto própria genérica; embalados por base de GTIN · GPC: Food/Beverage · Google: Alimentos > Carne, frutos do mar e ovos · NCM: 03, 16

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Peixes frescos | Tilápia, sardinha, salmão, pescada | Não |
| Peixes congelados | Costa Sul, Noronha Pescados, Copacol | Sim |
| Bacalhau e salgados | Bacalhau do Porto, saithe, ling | Misto |
| Frutos do mar | Camarão, lula, polvo, marisco | Misto |

## 05. Padaria e confeitaria

Prioridade 1 · GTIN Misto · Foto própria genérica; embalados por base de GTIN · GPC: Food/Beverage · Google: Alimentos > Padaria · NCM: 19

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Pães da casa | Pão francês, pão de forma artesanal, pão doce, baguete | Não |
| Salgados assados e fritos | Coxinha, esfiha, enroladinho, pão de queijo | Não |
| Bolos caseiros e rocamboles | Bolo de cenoura, de fubá, de chocolate | Não |
| Confeitaria | Tortas, sonhos, brigadeiro, doces de festa | Não |
| Pães industrializados | Wickbold, Pullman, Seven Boys, Panco, Visconti | Sim |
| Bolos industrializados | Bauducco, Pullman, Panco, Ana Maria | Sim |
| Massas frescas e de pastel | Massa de pastel, lasanha fresca; Massa Leve | Misto |

## 06. Frios e embutidos

Prioridade 1 · GTIN Misto · Base de GTIN; fatiados por foto própria genérica · GPC: Food/Beverage · Google: Alimentos > Carne, frutos do mar e ovos · NCM: 16

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Presunto e apresuntado | Sadia, Perdigão, Seara, Aurora, Ceratti | Misto |
| Mortadela | Sadia, Perdigão, Seara, Ceratti, Marba | Misto |
| Salame e copa | Sadia, Perdigão, Aurora, Ceratti | Misto |
| Salsicha | Sadia, Perdigão, Seara, Aurora | Sim |
| Linguiça defumada e calabresa | Sadia, Perdigão, Seara, Aurora | Sim |
| Peito de peru e blanquet | Sadia, Perdigão, Seara | Sim |
| Bacon e toucinho | Sadia, Seara, Aurora | Sim |
| Carne seca e charque | Sadia, Seara | Misto |
| Antepastos de balcão | Azeitonas, conservas e pastas vendidas a peso | Não |

## 07. Laticínios e ovos

Prioridade 1 · GTIN Sim · Base de GTIN · GPC: Food/Beverage · Google: Alimentos > Lacticínios; Bebidas > Leite · NCM: 04

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Leite UHT | Italac, Piracanjuba, Parmalat, Itambé, Ninho | Sim |
| Leite em pó | Ninho, Itambé, Piracanjuba, Italac | Sim |
| Leite condensado e creme de leite | Moça, Itambé, Piracanjuba, Nestlé | Sim |
| Iogurtes e bebidas lácteas | Danone, Nestlé, Vigor, Batavo, Itambé | Sim |
| Queijos embalados | Tirolez, Polenghi, Président, Vigor, Scala | Sim |
| Queijo muçarela e prato a peso | Fatiados de balcão | Não |
| Requeijão e cream cheese | Catupiry, Vigor, Philadelphia, Polenghi | Sim |
| Manteiga | Aviação, Itambé, Président, Vigor | Sim |
| Margarina | Qualy, Doriana, Delícia, Becel | Sim |
| Sobremesas lácteas | Chandelle, Danette, Paulista | Sim |
| Ovos | Mantiqueira, Katayama, Yabuta; ovos de granja local | Misto |

## 08. Congelados e sorvetes

Prioridade 1 · GTIN Sim · Base de GTIN · GPC: Food/Beverage · Google: Alimentos > Pratos prontos; Sobremesas congeladas · NCM: 16, 19, 20, 21

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Hambúrgueres e empanados | Sadia, Seara, Perdigão, Swift | Sim |
| Lasanhas e pratos prontos | Sadia, Seara, Perdigão | Sim |
| Pizzas congeladas | Sadia, Seara, Perdigão | Sim |
| Pão de queijo congelado | Forno de Minas, Pif Paf, Seara | Sim |
| Batata pré-frita | McCain, Bem Brasil, Lamb Weston | Sim |
| Legumes congelados | Bonduelle, Pratigel, Bem Brasil | Sim |
| Polpas de fruta | DeMarchi, Mais Fruta | Sim |
| Sorvetes em pote | Kibon, Nestlé, Häagen-Dazs, Ben & Jerry's | Sim |
| Picolés | Kibon, Nestlé, Magnum | Sim |
| Açaí congelado | Frooty, Oakberry | Sim |

## 09. Comida pronta e rotisseria

Prioridade 2 · GTIN Não · Foto própria genérica · GPC: Food/Beverage · Google: Alimentos > Pratos prontos · NCM: 16, 19, 21

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Frango assado | Frango de padaria, galeto, com farofa | Não |
| Marmitas e pratos do dia | Feijoada, strogonoff, arroz com feijão | Não |
| Massas prontas | Lasanha da casa, nhoque, macarronada | Não |
| Assados e costelas | Costela assada, pernil, cupim | Não |
| Saladas e acompanhamentos | Maionese, vinagrete, farofa, salpicão | Não |
| Salgados por cento | Kits de festa, coxinha, risoles | Não |
| Sopas e caldos prontos | Caldo verde, canja, sopa de legumes | Não |

## 10. A granel e empório

Prioridade 2 · GTIN Não · Foto própria genérica · GPC: Food/Beverage · Google: Alimentos > Nozes e sementes; Temperos · NCM: 08, 09, 10, 12

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Grãos a granel | Feijão, arroz, lentilha, grão-de-bico | Não |
| Castanhas e sementes | Castanha-do-pará, de caju, amêndoa, chia, linhaça | Não |
| Farinhas e cereais a granel | Aveia, farinha de mandioca, fubá | Não |
| Temperos a peso | Colorau, cominho, pimenta, orégano | Não |
| Doces a granel | Balas, jujubas, confeitos | Não |
| Chás e ervas a peso | Camomila, boldo, erva-doce | Não |

### Mercearia

## 11. Mercearia básica

Prioridade 1 · GTIN Sim · Base de GTIN · GPC: Food/Beverage · Google: Alimentos > Grãos, arroz e cereais; Massas e talharins; Ingredientes para cozidos e assados · NCM: 10, 11, 15, 17, 19

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Arroz | Camil, Tio João, Prato Fino, Namorado | Sim |
| Feijão | Camil, Kicaldo, Broto Legal, Tio João | Sim |
| Açúcar e adoçantes | União, Caravelas, Guarani, Zero-Cal, Adocyl | Sim |
| Óleos | Liza, Soya, Cocamar, Salada | Sim |
| Azeites | Gallo, Andorinha, Borges, O-Live | Sim |
| Farinhas de trigo e de mandioca | Dona Benta, Anaconda, Sol, Yoki, Renata | Sim |
| Fubá, polenta e flocão | Yoki, Kimilho, Sinhá, Quaker | Sim |
| Massas secas | Renata, Barilla, Adria, Vitarella, Galo | Sim |
| Macarrão instantâneo | Nissin, Maggi, Turma da Mônica | Sim |
| Sal | Cisne, Lebre | Sim |
| Misturas e fermentos | Royal, Fleischmann, Dona Benta, Dr. Oetker | Sim |
| Sopas e caldos em pó | Knorr, Maggi, Sazón | Sim |

## 12. Molhos, temperos e conservas

Prioridade 1 · GTIN Sim · Base de GTIN · GPC: Food/Beverage · Google: Alimentos > Condimentos e molhos; Temperos · NCM: 16, 20, 21, 22

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Molho de tomate e extrato | Heinz, Quero, Fugini, Pomarola, Elefante | Sim |
| Maionese | Hellmann's, Heinz, Quero, Arisco | Sim |
| Ketchup e mostarda | Heinz, Hellmann's, Quero | Sim |
| Temperos prontos | Knorr, Sazón, Kitano, Arisco, Maggi | Sim |
| Vinagres e molhos de salada | Castelo, Toscano, Hellmann's, Kikkoman | Sim |
| Atum e sardinha em lata | Gomes da Costa, Coqueiro, Pescador | Sim |
| Milho, ervilha e seleta | Quero, Bonduelle, Predilecta, Fugini | Sim |
| Azeitonas e palmito | La Violetera, Vale Fértil, Bonduelle | Sim |
| Molho de pimenta e shoyu | Tabasco, Sakura, Kikkoman, Hemmer | Sim |

## 13. Café, chá e matinais

Prioridade 1 · GTIN Sim · Base de GTIN · GPC: Food/Beverage · Google: Bebidas > Café; Chás e infusões; Alimentos > Grãos, arroz e cereais · NCM: 09, 18, 19, 21

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Café torrado e moído | Pilão, Melitta, 3 Corações, Santa Clara, Café do Ponto | Sim |
| Café solúvel | Nescafé, 3 Corações, Melitta | Sim |
| Cápsulas de café | Nespresso, TRES, Dolce Gusto, Orfeu | Sim |
| Chás e erva-mate | Matte Leão, Twinings, Barão, Ximango | Sim |
| Achocolatados | Nescau, Toddy, Ovomaltine, Italac | Sim |
| Cereais matinais | Nestlé, Kellogg's, Quaker | Sim |
| Aveia e granola | Quaker, Yoki, Jasmine, Nestlé | Sim |
| Geleias, mel e pastas doces | Queensberry, Predilecta, Baldoni, Nutella | Sim |

## 14. Biscoitos e snacks

Prioridade 1 · GTIN Sim · Base de GTIN · GPC: Food/Beverage · Google: Alimentos > Aperitivos e petiscos · NCM: 19, 20

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Biscoitos recheados | Trakinas, Oreo, Bono, Passatempo, Bauducco | Sim |
| Biscoitos salgados e cream cracker | Piraquê, Vitarella, Marilan, Adria | Sim |
| Biscoitos doces e wafers | Piraquê, Bauducco, Nestlé, Mabel | Sim |
| Rosquinhas e amanteigados | Mabel, Vitarella, Bauducco | Sim |
| Salgadinhos | Elma Chips, Ruffles, Doritos, Cheetos, Fandangos | Sim |
| Batata em tubo e palha | Pringles, Yoki, Elma Chips, Visconti | Sim |
| Amendoins e mix | Santa Helena, Dori, Yoki, Elma Chips | Sim |
| Torradas e pães de forma crocantes | Bauducco, Visconti, Marilan | Sim |
| Barras de cereal | Nutry, Trio, Quaker | Sim |

## 15. Doces, chocolates e bomboniere

Prioridade 1 · GTIN Sim · Base de GTIN · GPC: Food/Beverage · Google: Alimentos > Doces e chocolates · NCM: 17, 18, 20, 21

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Barras de chocolate | Lacta, Garoto, Nestlé, Hershey's | Sim |
| Caixas de bombons | Garoto, Nestlé, Lacta, Ferrero Rocher | Sim |
| Balas e gomas | Fini, Arcor, Dori, Riclan | Sim |
| Chicletes e pastilhas | Trident, Mentos, Halls, Bubbaloo | Sim |
| Goiabada e doces em pasta | Predilecta, Quero, Paçoquita, Santa Helena | Sim |
| Gelatinas e sobremesas em pó | Royal, Dr. Oetker, Apti | Sim |
| Panetones e chocotones | Bauducco, Visconti, Village, Casa Suíça | Sim |
| Ovos de Páscoa | Lacta, Garoto, Nestlé, Cacau Show | Sim |
| Chocolates finos | Cacau Show, Kopenhagen, Brasil Cacau, Lindt | Sim |

### Bebidas

## 16. Refrigerantes

Prioridade 1 · GTIN Sim · Base de GTIN · GPC: Food/Beverage · Google: Bebidas > Refrigerante · NCM: 22

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Cola | Coca-Cola, Pepsi, Coca-Cola Zero | Sim |
| Guaraná | Guaraná Antarctica, Kuat, Dolly | Sim |
| Laranja e cítricos | Fanta, Sukita, Sprite, H2OH | Sim |
| Tubaínas e regionais | Itubaína, Schin, Mineirinho, Convenção | Sim |

## 17. Sucos, águas e bebidas sem álcool

Prioridade 1 · GTIN Sim · Base de GTIN · GPC: Food/Beverage · Google: Bebidas > Suco; Água; Bebidas energéticas · NCM: 20, 21, 22

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Sucos e néctares prontos | Del Valle, Maguary, Natural One, Dafruta, Sufresh | Sim |
| Sucos em pó | Tang, Fresh, Mid, Trink, Clight | Sim |
| Sucos concentrados | Maguary, Dafruta, Ebba, Bela Ischia | Sim |
| Água mineral | Crystal, Bonafont, Minalba, Lindoya | Sim |
| Água de coco | Kero Coco, Obrigado, Ducoco | Sim |
| Energéticos | Red Bull, Monster, TNT, Baly | Sim |
| Isotônicos | Gatorade, Powerade | Sim |
| Chás prontos | Fuze Tea, Lipton, Matte Leão | Sim |
| Bebidas vegetais | Ades, Naturis, NotCo, A Tal da Castanha | Sim |

## 18. Cervejas e bebidas alcoólicas

Prioridade 1 · GTIN Sim · Base de GTIN · GPC: Food/Beverage · Google: Bebidas > Bebidas alcóolicas · NCM: 22 · Ver alerta na seção 5

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Cervejas populares | Skol, Brahma, Antarctica, Itaipava, Kaiser | Sim |
| Cervejas puro malte e premium | Heineken, Amstel, Budweiser, Stella Artois, Original | Sim |
| Cervejas especiais | Eisenbahn, Colorado, Baden Baden, Spaten | Sim |
| Vinhos nacionais | Aurora, Salton, Miolo, Pergola | Sim |
| Vinhos importados | Casillero del Diablo, Santa Helena, Periquita | Sim |
| Espumantes | Chandon, Salton, Aurora | Sim |
| Vodca e gim | Smirnoff, Absolut, Tanqueray, Gordon's | Sim |
| Uísque | Johnnie Walker, Jack Daniel's, Ballantine's, Passport | Sim |
| Cachaça | 51, Velho Barreiro, Ypióca, Sagatiba | Sim |
| Bebidas mistas e ices | Smirnoff Ice, Beats, Campari, Licor 43 | Sim |

### Casa e cuidados

## 19. Limpeza da casa

Prioridade 1 · GTIN Sim · Base de GTIN · GPC: Cleaning/hygiene products · Google: Casa e jardim > Suprimentos domésticos · NCM: 34, 38

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Detergentes | Ypê, Limpol, Minuano, Odd | Sim |
| Sabão em pó e líquido | Omo, Brilhante, Ariel, Tixan Ypê, Surf | Sim |
| Sabão em barra | Ypê, Minuano | Sim |
| Amaciantes | Comfort, Downy, Mon Bijou, Fofo, Ypê | Sim |
| Água sanitária e alvejantes | Qboa, Ypê, Candida, Vanish | Sim |
| Desinfetantes | Pinho Sol, Lysoform, Veja, Ajax, Pato | Sim |
| Multiuso e limpa-vidros | Veja, Cif, Mr Músculo, Ypê | Sim |
| Saponáceos e limpa-alumínio | Radium, Cif, Assolan | Sim |
| Esponjas e palha de aço | Bombril, Assolan, Scotch-Brite | Sim |
| Inseticidas e repelentes domésticos | Baygon, SBP, Raid | Sim |
| Odorizadores | Bom Ar, Glade, Air Wick | Sim |
| Vassouras, rodos e panos | Bettanin, Perfex, Noviça, Condor | Sim |

## 20. Higiene e perfumaria

Prioridade 1 · GTIN Sim · Base de GTIN · GPC: Beauty/personal care/hygiene · Google: Saúde e beleza > Cuidados pessoais · NCM: 33, 34, 48, 96

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Creme dental | Colgate, Sorriso, Oral-B, Close Up, Sensodyne | Sim |
| Escovas e enxaguantes | Oral-B, Colgate, Listerine, Condor | Sim |
| Sabonetes | Dove, Lux, Protex, Palmolive, Nivea | Sim |
| Xampu e condicionador | Seda, Pantene, Elseve, Clear, Dove | Sim |
| Desodorantes | Rexona, Nivea, Dove, Axe, Bozzano | Sim |
| Papel higiênico | Neve, Personal, Scott, Sublime, Mili | Sim |
| Absorventes | Always, Intimus, Carefree, Sempre Livre | Sim |
| Barbear | Gillette, Bic, Bozzano | Sim |
| Fraldas geriátricas | Tena, Bigfral, Plenitud | Sim |
| Algodão e hastes | Johnson's, Cremer, Apolo | Sim |
| Cremes e loções corporais | Nivea, Dove, Monange, Paixão | Sim |

## 21. Bebê e infantil

Prioridade 1 · GTIN Sim · Base de GTIN · GPC: Beauty/personal care/hygiene; Food/Beverage · Google: Infantil · NCM: 19, 33, 48, 87, 96 · Ver alerta na seção 5

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Fraldas | Pampers, Huggies, MamyPoko, Turma da Mônica Baby, BabySec | Sim |
| Lenços umedecidos | Johnson's Baby, Huggies, Pom Pom, Pampers | Sim |
| Higiene do bebê | Johnson's Baby, Granado Bebê, Dove Baby, Natura Mamãe e Bebê | Sim |
| Cereais infantis | Mucilon, Neston, Nestlé | Sim |
| Papinhas | Nestlé Naturnes | Sim |
| Fórmulas infantis (bloquear em encarte) | Nan, Aptamil, Milnutri | Sim |
| Mamadeiras e chupetas (bloquear em encarte) | Mam, Lillo, Philips Avent | Sim |
| Carrinhos e cadeirinhas | Burigotto, Galzerano, Chicco, Maxi-Cosi | Sim |

## 22. Beleza e cosméticos

Prioridade 2 · GTIN Sim · Base de GTIN; site da marca · GPC: Beauty/personal care/hygiene · Google: Saúde e beleza > Cuidados pessoais · NCM: 33

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Tinturas | Koleston, Garnier Nutrisse, L'Oréal Imédia, Wella | Sim |
| Tratamento capilar | Skala, Salon Line, Niely, Bio Extratus | Sim |
| Maquiagem | Vult, Ruby Rose, Dailus, Maybelline | Sim |
| Perfumes | O Boticário, Natura, Eudora, Avon, Jequiti | Sim |
| Cuidados com a pele | Neutrogena, Nivea, La Roche-Posay, Vichy | Sim |
| Esmaltes e unhas | Risqué, Colorama, Impala, Dailus | Sim |
| Protetor solar | Sundown, Nivea Sun, Episol, Neutrogena | Sim |

## 23. Farmácia e saúde

Prioridade 2 · GTIN Sim · Base de GTIN; site da marca · GPC: Healthcare · Google: Saúde e beleza > Cuidados com a saúde · NCM: 30, 38, 90 · Ver alerta na seção 5

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Analgésicos sem prescrição | Dorflex, Neosaldina, Tylenol, Novalgina | Sim |
| Genéricos | EMS, Medley, Eurofarma, Neo Química, Germed | Sim |
| Vitaminas e minerais | Centrum, Lavitan, Redoxon, Cewin | Sim |
| Suplementos esportivos | Max Titanium, Growth, Integralmedica | Sim |
| Primeiros socorros | Band-Aid, Nexcare, Cremer, Merthiolate | Sim |
| Medidores e aparelhos | Accu-Chek, G-Tech, Omron | Sim |
| Preservativos e saúde íntima | Jontex, Prudence, Olla | Sim |

## 24. Pet shop

Prioridade 2 · GTIN Misto · Base de GTIN; a granel por foto própria genérica · GPC: Pet care/food; Live animals · Google: Animais e suprimentos para animais de estimação · NCM: 23, 30, 42

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Ração para cães | Pedigree, Golden, Premier, Royal Canin, Special Dog | Sim |
| Ração para gatos | Whiskas, Gran Plus, Friskies, Cat Chow | Sim |
| Sachês e petiscos | Whiskas, Sheba, Pedigree, Friskies | Sim |
| Ração a granel | Vendida a peso na loja | Não |
| Areia e higiene | Pipicat, Chalesco, Sanol Dog | Sim |
| Antipulgas e saúde | Frontline, Bravecto, NexGard | Sim |
| Brinquedos e acessórios | Chalesco, Furacão Pet, Kong | Sim |
| Pássaros e aquário | Alcon, Nutrópica, Megazoo, Tetra | Sim |

## 25. Bazar, descartáveis e utilidades

Prioridade 2 · GTIN Sim · Base de GTIN; site da marca · GPC: Kitchenware and tableware; Storage/haulage containers · Google: Casa e jardim > Produtos de cozinha e aparelhos de jantar · NCM: 39, 48, 69, 70, 73, 76, 82, 85

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Panelas e frigideiras | Tramontina, Rochedo, Panex, Brinox | Sim |
| Talheres e facas | Tramontina, Brinox, Mundial | Sim |
| Louças e vidros | Nadir Figueiredo, Duralex, Marinex, Oxford | Sim |
| Potes e plásticos | Sanremo, Plasútil, Tupperware, Ordene | Sim |
| Copos e pratos descartáveis | Copobras, Darnel, Totalplast | Sim |
| Sacos de lixo | Embalixo | Sim |
| Papel-alumínio e filme | Wyda | Sim |
| Guardanapos e papel-toalha | Snob, Scott | Sim |
| Pilhas | Duracell, Rayovac, Energizer | Sim |
| Lâmpadas | Philips, Osram, Taschibra, Elgin | Sim |

## 26. Cama, mesa, banho e móveis

Prioridade 3 · GTIN Misto · Site da marca · GPC: Household/office furniture/furnishings · Google: Casa e jardim; Móveis · NCM: 63, 94, 57

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Cama | Karsten, Buddemeyer, Santista, Artex, Teka | Misto |
| Mesa | Karsten, Dohler, Rozac | Misto |
| Banho | Karsten, Buddemeyer, Santista, Dohler | Misto |
| Travesseiros | Fibrasca, Duoflex, Nasa | Sim |
| Colchões | Ortobom, Castor, Probel, Herval, Sealy | Misto |
| Móveis de sala e quarto | Madesa, Politorno, Kappesberg, Henn | Misto |
| Móveis de cozinha | Bartira, Madesa, Henn, Telasul | Misto |
| Tapetes e cortinas | Jolitex, Rozac, Kapazi | Misto |
| Decoração | Tok&Stok, Mobly, Camicado | Misto |

## 27. Eletrodomésticos e eletroportáteis

Prioridade 2 · GTIN Sim · Site da marca · GPC: Home appliances · Google: Casa e jardim > Eletrodomésticos · NCM: 84, 85

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Geladeiras e freezers | Brastemp, Consul, Electrolux, Samsung, LG | Sim |
| Fogões e fornos | Atlas, Esmaltec, Dako, Consul, Electrolux | Sim |
| Lavadoras | Brastemp, Consul, Electrolux, LG | Sim |
| Ar-condicionado e ventiladores | LG, Samsung, Midea, Arno, Ventisol | Sim |
| Liquidificadores e batedeiras | Mondial, Britânia, Arno, Philco, Oster | Sim |
| Air fryers e fornos elétricos | Mondial, Britânia, Philco, Arno, Fischer | Sim |
| Cafeteiras e sanduicheiras | Mondial, Britânia, Arno, Cadence | Sim |
| Ferros e aspiradores | Black+Decker, Philips Walita, WAP, Electrolux | Sim |
| Bebedouros e purificadores | Esmaltec, Libell, IBBL, Consul | Sim |

## 28. Eletrônicos, informática e telefonia

Prioridade 3 · GTIN Sim · Site da marca · GPC: Audio visual/photography; Communications; Computing · Google: Eletrônicos · NCM: 84, 85

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Televisores | Samsung, LG, TCL, Philco, AOC | Sim |
| Celulares | Samsung, Motorola, Xiaomi, Apple | Sim |
| Notebooks e computadores | Dell, Lenovo, Acer, Positivo | Sim |
| Áudio e fones | JBL, Sony, Philips, Edifier | Sim |
| Games | PlayStation, Xbox, Nintendo | Sim |
| Acessórios e cabos | Multi, Geonav, i2GO, Intelbras | Sim |
| Casa conectada e segurança | Intelbras, Positivo Casa Inteligente, TP-Link | Sim |

## 29. Papelaria e escritório

Prioridade 2 · GTIN Sim · Base de GTIN; site da marca · GPC: Stationery/office machinery/occasion supplies · Google: Materiais de escritório · NCM: 39, 48, 96

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Cadernos | Tilibra, Foroni, Jandaia, Credeal | Sim |
| Canetas e lápis | Bic, Faber-Castell, Compactor, Pilot | Sim |
| Papel sulfite | Chamex, Report, HP | Sim |
| Colas e corretivos | Tenaz, Pritt, UHU, Acrilex | Sim |
| Mochilas e estojos | Sestini, Xeryus, Pacific, Dermiwil | Sim |
| Organização e arquivo | Dello, Pimaco | Sim |
| Tintas e toners | HP, Epson, Canon | Sim |
| Artes e pintura | Acrilex, Faber-Castell, Corfix | Sim |

## 30. Ferragens, construção e jardim

Prioridade 3 · GTIN Misto · Site da marca; a granel por foto própria genérica · GPC: Building products; Tools/equipment – hand; Tools/equipment – power; Electrical supplies; Plumbing/heating/ventilation/air conditioning; Lawn/garden supplies; Horticulture plants · Google: Ferragens; Casa e jardim > Gramado e jardim · NCM: 25, 31, 32, 39, 68, 69, 73, 82, 85

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Cimento e argamassa | Votoran, Quartzolit, Cauê, Nacional | Sim |
| Tintas | Suvinil, Coral, Sherwin-Williams, Lukscolor | Sim |
| Hidráulica | Tigre, Amanco, Krona, Fortlev | Sim |
| Elétrica | Prysmian, Sil, Steck, Schneider, Tramontina | Misto |
| Ferramentas manuais | Tramontina, Vonder, Gedore, Stanley | Sim |
| Ferramentas elétricas | Bosch, Makita, DeWalt, Black+Decker | Sim |
| Pisos e revestimentos | Portobello, Eliane, Portinari, Incepa | Misto |
| Louças e metais | Deca, Docol, Lorenzetti, Hydra | Sim |
| Fechaduras e parafusos | Papaiz, Pado, Soprano, Fame; parafusos a peso | Misto |
| Areia, brita e ferro a metro | Gerdau; areia e brita sem marca | Não |
| Jardinagem e adubos | Vitaplan, Forth, Tramontina | Sim |
| Plantas e flores | Mudas e vasos de produtor local | Não |
| Piscina | Sodramar, Genco, Hth | Sim |

## 31. Automotivo

Prioridade 3 · GTIN Misto · Site da marca · GPC: Vehicle; Lubricants; Fluids/fuels/gases · Google: Veículos e peças · NCM: 27, 34, 40, 85, 87

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Óleos lubrificantes | Lubrax, Castrol, Mobil, Shell Helix, Ipiranga | Sim |
| Baterias | Moura, Heliar, Zetta | Misto |
| Pneus | Pirelli, Michelin, Goodyear, Bridgestone | Misto |
| Peças | Bosch, Cofap, Nakata, Monroe, Tecfil | Misto |
| Limpeza e estética | Grand Prix, Cadillac, Vonixx, 3M | Sim |
| Acessórios | Multi, Pósitron, Shutt | Sim |
| Motos | Honda, Yamaha, Pro Tork | Misto |

### Moda, lazer e outros

## 32. Roupas e acessórios

Prioridade 3 · GTIN Misto · Foto própria da loja; site da marca · GPC: Clothing; Personal accessories · Google: Vestuário e acessórios; Malas e bolsas · NCM: 42, 61, 62, 65, 71, 91

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Moda feminina | Renner, Riachuelo, C&A, Marisa, Colcci | Misto |
| Moda masculina | Hering, Reserva, Renner, Lacoste, Aramis | Misto |
| Moda infantil | Malwee Kids, Kyly, Brandili, Lilica Ripilica, Carter's | Misto |
| Jeans | Levi's, Lee, Colcci, Zinco | Misto |
| Moda íntima | Hope, DeMillus, Liebe, Zorba, Lupo | Sim |
| Meias | Lupo, Trifil, Puket | Sim |
| Moda praia | Mormaii, Rip Curl, Cia. Marítima | Misto |
| Uniformes e roupa profissional | Confecções locais | Não |
| Bolsas e malas | Arezzo, Santa Lolla, Samsonite, Kipling | Misto |
| Relógios | Technos, Mondaine, Casio, Orient | Sim |
| Óculos | Chilli Beans, Ray-Ban, Oakley | Sim |
| Bijuterias e joias | Rommanel, Vivara, Pandora | Misto |

## 33. Calçados

Prioridade 3 · GTIN Misto · Site da marca; foto própria da loja · GPC: Footwear · Google: Vestuário e acessórios · NCM: 64

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Sandálias e chinelos | Havaianas, Ipanema, Rider, Grendene, Melissa | Sim |
| Tênis esportivo | Olympikus, Mizuno, Nike, Adidas, Asics | Sim |
| Tênis casual | Puma, Fila, Vans, West Coast | Sim |
| Calçado feminino | Beira Rio, Vizzano, Moleca, Piccadilly, Dakota | Misto |
| Calçado masculino | Democrata, Ferracini, Pegada, Sapatoterapia | Misto |
| Calçado infantil | Bibi, Pampili, Klin, Kidy, Ortopé | Misto |
| Botas e segurança | Bracol, Marluvas, West Coast | Misto |

## 34. Brinquedos e festas

Prioridade 3 · GTIN Sim · Base de GTIN; site da marca · GPC: Toys/games; Stationery/office machinery/occasion supplies · Google: Brinquedos e jogos · NCM: 49, 95

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Bonecas e bonecos | Estrela, Mattel, Barbie, Hasbro | Sim |
| Carrinhos e pistas | Hot Wheels, Bandeirante, Roma | Sim |
| Jogos de tabuleiro | Estrela, Grow, Hasbro | Sim |
| Blocos e montagem | Lego, Mimo, Xalingo | Sim |
| Bebê e primeira infância | Fisher-Price, Elka, Sunny | Sim |
| Livros infantis | Ciranda Cultural, Todolivro | Sim |
| Artigos de festa | Regina, Silver Festas, Cromus, Junco | Sim |
| Fantasias | Sulamericana | Misto |

## 35. Esporte e lazer

Prioridade 3 · GTIN Misto · Site da marca · GPC: Sports equipment; Camping · Google: Artigos esportivos · NCM: 61, 87, 95

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Futebol | Penalty, Topper, Nike, Adidas | Sim |
| Bicicletas | Caloi, Oggi, Sense, Houston | Misto |
| Academia e fitness | Kikos, Polimet, Domyos | Misto |
| Natação | Speedo, Hammerhead, Mormaii | Sim |
| Camping e pesca | Coleman, Nautika, Guepardo | Sim |
| Praia e piscina | Mor, Bel, Belfix | Sim |
| Roupas esportivas | Nike, Adidas, Puma, Fila | Misto |

## 36. Tabacaria

Prioridade 3 · GTIN Sim · Não anunciar · GPC: Tobacco/Cannabis · Google: Alimentos, bebidas e tabaco > Produtos de tabaco · NCM: 24 · Ver alerta na seção 5

Sem marcas de propósito: a categoria existe só para classificar o que entrar pelo código de barras.

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Cigarros (bloquear em encarte) | Sem exemplos | Sim |
| Charutos e fumo (bloquear em encarte) | Sem exemplos | Sim |
| Isqueiros e fósforos | Bic, Fiat Lux | Sim |

### Serviços de alimentação e varejo

## 37. Lanchonete e fast food

Prioridade 2 · GTIN Não · Foto própria genérica ou da loja · GPC: Services/vending machines; Food/Beverage · Google: Alimentos > Pratos prontos · NCM: não se aplica à refeição servida

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Hambúrgueres | X-salada, X-tudo, X-bacon, artesanal | Não |
| Cachorro-quente | Tradicional, prensado, completo | Não |
| Sanduíches e beirutes | Misto-quente, bauru, natural | Não |
| Pastéis | Carne, queijo, pizza, frango | Não |
| Salgados | Coxinha, kibe, enroladinho | Não |
| Porções | Batata frita, mandioca, frango a passarinho | Não |
| Sucos e vitaminas da casa | Laranja, abacaxi com hortelã, vitamina de banana | Não |
| Combos | Lanche, batata e refrigerante | Não |
| Redes conhecidas | McDonald's, Burger King, Bob's, Subway, Habib's | Não |

## 38. Pizzaria

Prioridade 2 · GTIN Não · Foto própria genérica ou da loja · GPC: Services/vending machines; Food/Beverage · Google: Alimentos > Pratos prontos · NCM: não se aplica à refeição servida

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Pizzas salgadas tradicionais | Muçarela, calabresa, portuguesa, marguerita | Não |
| Pizzas especiais | Frango com requeijão, quatro queijos, pepperoni | Não |
| Pizzas doces | Brigadeiro, romeu e julieta, banana com canela | Não |
| Bordas recheadas | Catupiry, cheddar, chocolate | Não |
| Esfihas e calzones | Abertas, fechadas, calzone | Não |
| Combos e promoções | Duas pizzas com refrigerante | Não |
| Redes conhecidas | Domino's, Pizza Hut, Patroni | Não |

## 39. Restaurante, sorveteria e cafeteria

Prioridade 2 · GTIN Não · Foto própria genérica ou da loja · GPC: Services/vending machines; Food/Beverage · Google: Alimentos > Pratos prontos · NCM: não se aplica à refeição servida

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Prato feito e marmita | Executivo, marmitex, quentinha | Não |
| Self-service e buffet | Comida por quilo, buffet livre | Não |
| Churrasco e espetinhos | Rodízio, espetos, jantinha | Não |
| Comida japonesa | Sushi, temaki, combinado | Não |
| Comida regional | Feijoada, moqueca, acarajé, baião | Não |
| Açaí no copo | Açaí com complementos, tigelas; Oakberry | Não |
| Sorvete e gelateria | Casquinha, milk-shake, sundae; Chiquinho, Bacio di Latte | Não |
| Cafeteria | Café expresso, capuccino, pão na chapa; Starbucks, Havanna | Não |

## 40. Serviços de varejo

Prioridade 3 · GTIN Não · Foto própria genérica; marca do serviço · GPC: Services/vending machines; Fluids/fuels/gases; Monetary assets · Google: sem equivalente direto · NCM: 27 para combustíveis e gás; serviços não têm NCM

| Subcategoria | Marcas ou itens típicos | GTIN |
|---|---|---|
| Gás de cozinha | Ultragaz, Liquigás, Supergasbras, Consigaz | Não |
| Combustíveis | Ipiranga, Vibra, Shell | Não |
| Recarga de celular | Vivo, Claro, TIM | Não |
| Vale-presente | Google Play, Netflix, iFood | Misto |
| Lavanderia | 5àSec, Lavô | Não |
| Salão e barbearia | Corte, escova, barba | Não |
| Ótica e relojoaria | Exames, conserto, troca de bateria | Não |
| Chaveiro, gráfica e consertos | Cópia de chave, impressão, assistência técnica | Não |

## 7. O que não foi confirmado

| Assunto | Situação | Como resolver |
|---|---|---|
| Totais atuais do GPC | Confirmados só 4 níveis e 44 segmentos em junho/2024. Famílias, classes e bricks de maio/2026 não foram obtidos. Um site de terceiros cita cerca de 40 mil categorias (versão 2024-02), sem detalhe | Abrir o arquivo no navegador e contar |
| GPC em português | O navegador tem mais de 15 traduções, segundo guia de 2021, mas nenhuma fonte diz se o português está entre elas. A GS1 Brasil cita um "Excel GPC" em curso, sem o conteúdo | Ver a lista de idiomas no navegador ou perguntar à GS1 Brasil |
| Licença do GPC | Terceiros dizem "gratuito". Não foram lidos os termos oficiais; o guia técnico trata de patentes, não de uso. Portal europeu arquivado traz informação antiga | Ler "Legal Information & Fees" ou perguntar à GS1 Brasil |
| Link direto do GPC | Não confirmado; download pelo navegador | Baixar manualmente |
| Licença do Google Product Taxonomy | Não verificada | Conferir antes de redistribuir o arquivo |
| Mercado Livre | Empresa tinha 29 categorias e 2 mil subcategorias em 2024, segundo reportagem. A API pública recusou o acesso, então a árvore não foi lida | Consultar a API ou o site manualmente |
| Carrefour, Assaí, Atacadão, Drogasil, Petz, Leroy Merlin, Magalu | Sites recusaram a leitura ou mostraram só parte do menu; ficaram fora do vocabulário | Consultar manualmente, se necessário |
| Peso de cada departamento no faturamento | Nenhuma fonte com a divisão por departamento | Estudos pagos ou dados da ABRAS; as prioridades seguem editoriais |
| Bluesoft Cosmos | Preços, limites e tamanho da base não lidos; site recusou o acesso | Consultar o site |
| Verified by GS1 | Campo de imagem visto só em documentação de terceiro; o manual oficial não abriu | Perguntar à GS1 Brasil |
| Prefixo 2 em balança | Só fontes de terceiros | Conferir nas especificações GS1 |
| Pesáveis na NF-e | Nenhuma regra específica encontrada para açougue e balança | Consultar a Nota Técnica 2021.003 ou a Sefaz |
| RDC 96/2008 e medicamentos | Texto vigente não verificado | Consultar a Anvisa |
| Decreto da NBCAL | Fontes divergem entre Decreto 8.552 e 9.579/2018 | Consultar o Planalto |
| Marcas | Não conferidas uma a uma; podem ter mudado de dono ou saído de linha | Validar ao cadastrar |
| Cobertura de foto por segmento | Não medida | Amostra de 50 a 100 GTINs por segmento |

## 8. Fontes

**GPC**

- [GPC Browser](https://gpc-browser.gs1.org/)
- [Arquivo de versões do GPC](https://ref.gs1.org/standards/gpc/archive)
- [GPC Browser Guide](https://www.gs1.org/sites/gs1/files/2021-10/gpc-browser-guide.pdf)
- [GS1 Netherlands e Belgium: GPC in a nutshell, junho/2024](https://www.gs1.nl/media/sfpiaxye/gpc-in-a-nutshell_jun24-def.pdf)
- [GS1 Belgium & Luxembourg: GPC](https://gs1belu.org/en/gpc-product-classification)
- [GS1: formatos do GPC](https://support.gs1.org/support/solutions/articles/43000734315-what-format-is-gpc-released-in-)
- [GS1: o que é o esquema GPC](https://support.gs1.org/support/solutions/articles/43000734164-what-is-the-gpc-schema-)
- [GS1: Brasil usa o GPC no Cadastro Nacional de Produtos](https://www.gs1.org/articles/brazil-uses-gpc-their-national-product-registration)
- [GS1: GPC em mais idiomas](https://www.gs1.org/articles/browse-global-product-classification-system-more-languages)
- [GS1: acesso aos padrões GPC](https://www.gs1.org/standards/gpc/access-gpc-standards)
- [GS1 Switzerland: GPC](https://www.gs1.ch/en/barcodes-standards/gs1-standards/share/global-product-classification-gpc)
- [Interoperable Europe: GPC](https://interoperable-europe.ec.europa.eu/collection/gs1-resources/solution/global-product-classification-gpc)
- [WisePIM: guia do GS1 GPC](https://wisepim.com/guides/product-taxonomy/gs1-gpc)

**Google e NCM**

- [Google Product Taxonomy pt-BR](https://www.google.com/basepages/producttype/taxonomy-with-ids.pt-BR.txt)
- [Receita Federal: download da NCM](https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/classificacao-fiscal-de-mercadorias/download-ncm-nomenclatura-comum-do-mercosul)
- [Siscomex: SH e NCM](https://www.gov.br/siscomex/pt-br/servicos/aprendendo-a-exportar/1-classificacao-fiscal-da-mercadoria/sh-e-ncm)

**Bases de produto e foto**

- [Biblioteca npm da API Bluesoft Cosmos](https://www.npmjs.com/package/bluesoft-cosmos-api)
- [Terceiro: consulta Verified by GS1 Brasil](https://glama.ai/mcp/servers/vertexdevs-hq/mcp-gs1br/tools/gs1_verify_gtin)
- [Manual da API Verified by GS1](https://gs1br.org/educacao-e-eventos/Documents/Manual%20do%20Usu%C3%A1rio%20-%20API%20Verified%20by%20GS1_v.03.pdf)
- [Open Food Facts: termos de uso](https://world.openfoodfacts.org/terms-of-use)
- [Open Food Facts Brasil](https://br.openfoodfacts.org/)

**GTIN, PLU e balança**

- [Contmatic: GTIN na NF-e a partir de outubro/2025](https://simplifique.contmatic.com.br/blogs/gtin-na-nfe-passa-a-ser-obrigatorio-em-outubro-de-2025)
- [Sefaz-SP: Resposta à Consulta 26206/2022](https://legislacao.fazenda.sp.gov.br/Paginas/RC26206_2022.aspx)
- [IFPS: guia de códigos PLU](https://www.ifpsglobal.com/s/PLU-Users-Guide-January-2023-ldxr.pdf)
- [Ferramenta sobre código de balança](https://yo-facturo.com/herramientas/codigo-de-balanza-peso-variable/)

**Regras legais**

- [Lei 11.265/2006 (NBCAL)](https://legis.senado.leg.br/norma/572804/publicacao/15727044)
- [Reportagem: promoção irregular de produto que compete com a amamentação](https://www.tnh1.com.br/noticia/nid/lojas-fazem-promocao-irregular-de-produto-que-compete-com-amamentacao/)
- [Lei 9.294/1996](https://www.legisweb.com.br/legislacao/?id=84711)
- [Anvisa: Orientação de Serviço 01/2014](https://goias.gov.br/saude/wp-content/uploads/sites/34/2016/03/orientaCAo-de-serviCo-no_-01-2014-sutox-anvisa-6ba.pdf)
- [Prefeitura do Rio: Tabagismo, fique legal](https://vigilanciasanitaria.prefeitura.rio/wp-content/uploads/sites/84/2023/03/Tabagismo-Fique-legal.pdf)

**Marcas e vocabulário**

- [Kantar: Brand Footprint 2025](https://www.kantar.com/brazil/inspiration/consumo/2025/menos-marcas-conseguem-crescer-presenca-nos-lares-brasileiros)
- [Tenda Atacado](https://www.tendaatacado.com.br/)
- [Pão de Açúcar](https://www.paodeacucar.com/)
- [Cobasi](https://www.cobasi.com.br/)
- [Kalunga](https://www.kalunga.com.br/)
- [Renner](https://www.lojasrenner.com.br/)
- [Ri Happy](https://www.rihappy.com.br/)
- [Decathlon](https://www.decathlon.com.br/)
