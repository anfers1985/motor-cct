// utils/categorias.js
// Taxonomia canônica de categorias/subcategorias de cláusulas de instrumentos coletivos.
// v2 — reformulado para eliminar fragmentação de nomenclatura e suportar múltiplas
// classificações por cláusula (ver services/ai/index.js e pages/Instrumentos.jsx).
//
// ESTRUTURA:
// Cada subcategoria canônica tem uma lista de "aliases" — todas as variações de texto já
// observadas (na base atual ou previstas) que devem ser tratadas como a mesma coisa.
// A partir disso são derivados automaticamente:
//   - CATEGORIAS            → { categoria: [subcategoria, ...] }         (para os dropdowns)
//   - SUBCATEGORIA_INDEX     → { alias_normalizado: [categoria, subcategoria] } (para normalizar)
//
// Para adicionar um tema novo no futuro: encontre a categoria mais próxima abaixo e adicione
// um novo objeto { nome, aliases } no array `subcategorias`. Nunca crie uma subcategoria solta
// fora desta estrutura — isso é exatamente o que causava a fragmentação anterior.

const TAXONOMIA = [
  {
    categoria: 'Remuneração e Reajuste',
    subcategorias: [
      { nome: 'Piso Salarial', aliases: ['piso salarial', 'salario normativo', 'salário normativo'] },
      { nome: 'Reajuste Salarial', aliases: ['reajuste', 'reajuste salarial', 'reajustes/correções salariais', 'reajustes correcoes salariais', 'correção salarial', 'correcao salarial', 'perdas salariais'] },
      { nome: 'Equiparação/Isonomia Salarial', aliases: ['equiparação salarial', 'equiparacao salarial', 'isonomia salarial'] },
      { nome: 'Salário Substituição', aliases: ['salário substituição', 'salario substituicao'] },
      { nome: 'Gratificação', aliases: ['gratificação', 'gratificacao'] },
      { nome: 'Gratificação por Tempo de Serviço', aliases: ['gratificação por tempo de serviço', 'gratificacao por tempo de servico', 'prêmio por tempo de serviço', 'premio por tempo de servico'] },
      { nome: 'Gratificação por Aposentadoria', aliases: ['gratificação por aposentadoria', 'gratificacao por aposentadoria'] },
      { nome: 'Prêmio de Produção/Desempenho', aliases: ['prêmio produção', 'premio producao', 'prêmio de produção', 'prêmio desempenho'] },
      { nome: 'Participação em Metas', aliases: ['participação em metas', 'participacao em metas'] },
      { nome: 'PLR/PPR', aliases: ['plr', 'ppr', 'plr/ppr'] },
      { nome: 'Comissão', aliases: ['comissão', 'comissao'] },
      { nome: 'Adicional de Função', aliases: ['adicional de função', 'adicional de funcao'] },
      { nome: 'Adicional de Acúmulo de Função', aliases: ['adicional de acúmulo de função', 'adicional de acumulo de funcao'] },
      { nome: 'Adicional Noturno', aliases: ['adicional noturno'] },
      { nome: 'Adicional de Transferência', aliases: ['adicional de transferência', 'adicional de transferencia'] },
      { nome: 'Adicional de Penosidade', aliases: ['adicional de penosidade'] },
      { nome: 'Quebra de Caixa', aliases: ['quebra de caixa'] },
      { nome: 'Promoção/Progressão Salarial', aliases: ['promoção salarial', 'promocao salarial', 'progressão salarial', 'progressao salarial'] },
      { nome: 'Complementação Salarial (Auxílio-Doença/Acidente)', aliases: ['complementação salarial', 'complementacao salarial', 'complementação de auxílio-doença'] },
      { nome: '13º Salário', aliases: ['13º salário', '13o salario', 'decimo terceiro', 'décimo terceiro'] },
      { nome: 'Comprovante de Pagamento', aliases: ['comprovante de pagamento', 'comprovantes e anotações', 'comprovantes e anotacoes', 'pagamento de salário', 'pagamento de salario'] },
      { nome: 'Descontos em Folha', aliases: ['descontos em folha', 'descontos salariais'] },
      { nome: 'DSR', aliases: ['dsr', 'descanso semanal remunerado'] },
      { nome: 'Adiantamento Salarial', aliases: ['adiantamento salarial'] },
      { nome: 'Forma e Prazo de Pagamento', aliases: ['forma de pagamento', 'prazo de pagamento', 'forma e prazo de pagamento'] },
      { nome: 'Base de Cálculo Salarial', aliases: ['base de cálculo', 'base de calculo', 'base de cálculo salarial'] },
    ],
  },
  {
    categoria: 'Jornada de Trabalho',
    subcategorias: [
      { nome: 'Duração da Jornada', aliases: ['duração da jornada', 'duracao da jornada', 'interrupção do trabalho', 'interrupcoes de trabalho', 'interrupções de trabalho'] },
      { nome: 'Banco de Horas', aliases: ['banco de horas'] },
      { nome: 'Hora Extra', aliases: ['hora extra', 'horas extras', 'apuração de horas extras', 'apuracao de horas extras'] },
      { nome: 'Compensação de Jornada', aliases: ['compensação de jornada', 'compensacao de jornada', 'compensação de horas', 'compensacao de horas'] },
      { nome: 'Controle de Ponto', aliases: ['controle de ponto', 'controle de jornada', 'controle de jornada externa'] },
      { nome: 'Registro Eletrônico de Ponto', aliases: ['registro eletrônico de ponto', 'registro eletronico de ponto'] },
      { nome: 'Registro de Ponto por Exceção', aliases: ['registro por exceção', 'registro por excecao', 'registro de ponto por exceção'] },
      { nome: 'Tolerância de Ponto', aliases: ['tolerância de ponto', 'tolerancia de ponto'] },
      { nome: 'Intervalo Intrajornada', aliases: ['intervalo intrajornada', 'intervalo remunerado', 'intervalos'] },
      { nome: 'Intervalo Interjornada', aliases: ['intervalo interjornada'] },
      { nome: 'Trabalho Noturno', aliases: ['trabalho noturno'] },
      { nome: 'Sobreaviso', aliases: ['sobreaviso'] },
      { nome: 'Convocação Extraordinária', aliases: ['convocação extraordinária', 'convocacao extraordinaria'] },
      { nome: 'Jornada Reduzida', aliases: ['jornada reduzida'] },
      { nome: 'Jornada Externa', aliases: ['jornada externa'] },
      { nome: 'Tempo à Disposição', aliases: ['tempo à disposição', 'tempo a disposicao'] },
      { nome: 'Escala de Trabalho', aliases: ['escala', 'escala de trabalho', 'jornada flexível para motoristas', 'jornada flexivel para motoristas'] },
      { nome: 'Turnos de Revezamento', aliases: ['turno', 'turnos de revezamento'] },
      { nome: 'Trabalho aos Domingos', aliases: ['trabalho aos domingos'] },
      { nome: 'Trabalho em Feriados', aliases: ['trabalho em feriados'] },
      { nome: 'Teletrabalho/Home Office', aliases: ['teletrabalho', 'home office', 'teletrabalho/home office'] },
      { nome: 'Trabalho Híbrido', aliases: ['trabalho híbrido', 'trabalho hibrido'] },
      { nome: 'Abono de Faltas', aliases: ['abono de faltas'] },
      { nome: 'Flexibilidade para Estudantes', aliases: ['flexibilidade para estudantes'] },
    ],
  },
  {
    categoria: 'Benefícios',
    subcategorias: [
      { nome: 'Vale-Alimentação/Auxílio Alimentação', aliases: ['vale-alimentação', 'vale alimentação', 'vale-alimentacao', 'auxílio alimentação', 'auxilio alimentação', 'auxilio alimentacao', 'alimentação', 'alimentacao', 'ticket refeição/alimentação', 'ticket refeicao alimentacao'] },
      { nome: 'Vale-Refeição', aliases: ['vale-refeição', 'vale refeição', 'vale-refeicao'] },
      { nome: 'Lanche', aliases: ['lanche', 'fornecimento de lanche'] },
      { nome: 'Alimentação no Local de Trabalho (Refeitório)', aliases: ['alimentação no local de trabalho', 'refeitório', 'refeitorio'] },
      { nome: 'Vale-Transporte', aliases: ['vale-transporte', 'vale transporte'] },
      { nome: 'Vale-Combustível', aliases: ['vale combustível', 'vale combustivel', 'vale-combustível'] },
      { nome: 'Transporte Fornecido pela Empresa', aliases: ['transporte fornecido pela empresa', 'fretado'] },
      { nome: 'Cesta Básica', aliases: ['cesta básica', 'cesta basica'] },
      { nome: 'Benefício Assistencial Social/Familiar', aliases: ['benefício assistencial social', 'beneficio assistencial social', 'benefício assistencial familiar', 'assistência social ao empregado'] },
      { nome: 'Auxílio Creche', aliases: ['auxílio creche', 'auxilio creche'] },
      { nome: 'Auxílio Moradia', aliases: ['auxílio moradia', 'auxilio moradia'] },
      { nome: 'Auxílio Educação/Bolsa de Estudos', aliases: ['auxílio educação', 'auxilio educacao', 'bolsa de estudos'] },
      { nome: 'Auxílio Internet/Home Office', aliases: ['auxílio internet', 'auxilio internet', 'auxílio home office', 'auxilio home office'] },
      { nome: 'Auxílio Mobilidade', aliases: ['auxílio mobilidade', 'auxilio mobilidade'] },
      { nome: 'Plano de Saúde', aliases: ['plano de saúde', 'plano de saude', 'convênio médico', 'convenio medico', 'extensão de benefícios', 'extensao de beneficios', 'pat'] },
      { nome: 'Plano Odontológico', aliases: ['plano odontológico', 'plano odontologico', 'assistência odontológica', 'assistencia odontologica', 'assistência odontológica / pts', 'assistencia odontologica pts'] },
      { nome: 'Seguro de Vida e Auxílio Funeral', aliases: ['seguro de vida', 'seguro de vida e auxílio funeral', 'seguro de vida e auxilio funeral', 'seguro de vida e fundo de inclusão social', 'auxílio funeral', 'auxilio funeral', 'auxílio funeral (transporte)'] },
      { nome: 'Auxílio Farmácia', aliases: ['auxílio farmácia', 'auxilio farmacia', 'convênio farmácia', 'convenio farmacia'] },
      { nome: 'Auxílio Doença/Acidente', aliases: ['auxílio doença/acidente', 'auxilio doenca acidente'] },
      { nome: 'Auxílio Filho com Deficiência', aliases: ['auxílio filho excepcional', 'auxilio filho excepcional', 'auxílio filho com deficiência'] },
      { nome: 'Previdência Privada', aliases: ['previdência privada', 'previdencia privada', 'previdência social', 'previdencia social'] },
      { nome: 'Empréstimos Consignados', aliases: ['empréstimos consignados', 'emprestimos consignados'] },
      { nome: 'Convênios e Descontos (Diversos)', aliases: ['convênios e descontos', 'convenios e descontos'] },
      { nome: 'Reembolso de Despesas/Diárias de Viagem', aliases: ['reembolso de despesas de viagem', 'reembolso de despesas de viagem / diárias', 'reembolso de despesas de viagem diarias'] },
      { nome: 'Manutenção de Benefícios', aliases: ['manutenção de benefícios', 'manutencao de beneficios'] },
      { nome: 'Natureza Não Salarial de Benefícios', aliases: ['natureza não salarial de benefícios', 'natureza nao salarial de beneficios', 'natureza jurídica de benefícios', 'natureza juridica de beneficios', 'não incorporação de benefícios', 'nao incorporacao de beneficios'] },
      { nome: 'Outros Benefícios', aliases: ['outros benefícios', 'outros beneficios'] },
    ],
  },
  {
    categoria: 'Saúde e Segurança do Trabalho',
    subcategorias: [
      { nome: 'Insalubridade', aliases: ['insalubridade'] },
      { nome: 'Periculosidade', aliases: ['periculosidade', 'adicional de periculosidade'] },
      { nome: 'Adicionais de Insalubridade/Periculosidade', aliases: ['adicionais de insalubridade/periculosidade', 'adicionais de insalubridade periculosidade', 'insalubridade/periculosidade', 'insalubridade e periculosidade', 'adicionais de insalubridade/periculosidade e proteção à maternidade'] },
      { nome: 'EPI', aliases: ['epi', 'equipamentos de proteção', 'equipamentos de protecao', 'equipamentos de proteção individual (epi)', 'epi e exames médicos', 'fornecimento de uniformes'] },
      { nome: 'Exames Médicos', aliases: ['exames médicos', 'exames medicos', 'exames médicos periódicos', 'exames medicos periodicos'] },
      { nome: 'Atestados Médicos', aliases: ['atestados médicos', 'atestados medicos', 'aceitação de atestados', 'aceitacao de atestados', 'validade de atestados médicos', 'validade de atestados medicos'] },
      { nome: 'CIPA', aliases: ['cipa'] },
      { nome: 'SESMT', aliases: ['sesmt'] },
      { nome: 'SIPAT', aliases: ['sipat'] },
      { nome: 'PCMSO/PPRA/PGR', aliases: ['pcmso', 'ppra', 'pgr', 'pcmso/ppra', 'ppra/pgr', 'pcmso/ppra/pgr'] },
      { nome: 'Ergonomia', aliases: ['ergonomia'] },
      { nome: 'Saúde Mental e Fatores Psicossociais (NR-01)', aliases: ['saúde mental', 'saude mental', 'fatores psicossociais', 'nr-01', 'nr01'] },
      { nome: 'Dependência Química', aliases: ['dependência química', 'dependencia quimica'] },
      { nome: 'Programa de Bem-Estar', aliases: ['programa de bem-estar', 'programa de bem estar'] },
      { nome: 'Vacinação', aliases: ['vacinação', 'vacinacao'] },
      { nome: 'Brigada de Incêndio', aliases: ['brigada de incêndio', 'brigada de incendio'] },
      { nome: 'Acidente de Trabalho', aliases: ['acidente de trabalho', 'assistência médica em acidente de trabalho', 'assistencia medica em acidente de trabalho'] },
      { nome: 'Prevenção de Acidentes e Doenças', aliases: ['prevenção de acidentes e doenças', 'prevencao de acidentes e doencas', 'prevenção de acidentes e doenças profissionais'] },
      { nome: 'Uniformes', aliases: ['uniformes', 'uniformes e lavagem'] },
      { nome: 'Treinamento e Informação em Segurança', aliases: ['treinamento e informação', 'treinamento e informacao'] },
      { nome: 'Direito de Recusa', aliases: ['direito de recusa'] },
      { nome: 'Condições de Ambiente de Trabalho', aliases: ['condições de ambiente de trabalho', 'condicoes de ambiente de trabalho'] },
      { nome: 'NR Específica', aliases: ['nr específica', 'nr especifica'] },
    ],
  },
  {
    categoria: 'Estabilidade e Garantias de Emprego',
    subcategorias: [
      { nome: 'Estabilidade Gestante', aliases: ['estabilidade gestante'] },
      { nome: 'Estabilidade Acidentado/Doença Profissional', aliases: ['estabilidade acidente de trabalho', 'estabilidade pós-acidente/doença profissional', 'estabilidade pos-acidente doenca profissional'] },
      { nome: 'Estabilidade Pré-Aposentadoria', aliases: ['estabilidade pré-aposentadoria', 'estabilidade pre-aposentadoria', 'pré-aposentadoria', 'pre-aposentadoria', 'garantia pré-aposentadoria', 'garantia pre-aposentadoria'] },
      { nome: 'Estabilidade Dirigente Sindical/Cipeiro', aliases: ['dirigente sindical', 'cipeiro', 'estabilidade dirigente sindical'] },
      { nome: 'Estabilidade Eleitoral Interna', aliases: ['estabilidade eleitoral interna'] },
      { nome: 'Estabilidade Serviço Militar', aliases: ['estabilidade serviço militar', 'estabilidade servico militar'] },
      { nome: 'Garantia de Retorno ao Trabalho', aliases: ['garantia de retorno ao trabalho'] },
      { nome: 'Garantia ao Afastado Previdenciário', aliases: ['garantia ao afastado previdenciário', 'garantia ao afastado previdenciario'] },
      { nome: 'Garantia por Transferência', aliases: ['garantia por transferência', 'garantia por transferencia'] },
      { nome: 'Garantias Gerais de Emprego', aliases: ['garantias gerais de emprego'] },
      { nome: 'Dispensa Coletiva', aliases: ['dispensa coletiva'] },
      { nome: 'Contrato de Experiência', aliases: ['contrato de experiência', 'contrato de experiencia'] },
    ],
  },
  {
    categoria: 'Férias e Licenças',
    subcategorias: [
      { nome: 'Férias', aliases: ['férias', 'ferias', 'concessão de férias', 'concessao de ferias', 'férias proporcionais na rescisão', 'ferias proporcionais na rescisao'] },
      { nome: 'Abono de Férias', aliases: ['abono de férias', 'abono de ferias', 'gratificação de férias', 'gratificacao de ferias'] },
      { nome: 'Concessão/Programação de Férias', aliases: ['programação de férias', 'programacao de ferias'] },
      { nome: 'Férias Coletivas', aliases: ['férias coletivas', 'ferias coletivas'] },
      { nome: 'Fracionamento de Férias', aliases: ['fracionamento de férias', 'fracionamento de ferias'] },
      { nome: 'Licença Maternidade', aliases: ['licença maternidade', 'licenca maternidade'] },
      { nome: 'Licença Paternidade', aliases: ['licença paternidade', 'licenca paternidade'] },
      { nome: 'Licença Adoção', aliases: ['licença adoção', 'licenca adocao'] },
      { nome: 'Licença Amamentação', aliases: ['licença amamentação', 'licenca amamentacao'] },
      { nome: 'Licença Casamento (Gala)', aliases: ['licença casamento', 'licenca casamento', 'licença gala', 'licenca gala'] },
      { nome: 'Licença Nojo/Luto', aliases: ['licença nojo', 'licenca nojo', 'licença luto', 'licenca luto'] },
      { nome: 'Licença para Acompanhamento Médico (Filho/Dependente)', aliases: ['licença para acompanhamento médico', 'licenca para acompanhamento medico'] },
      { nome: 'Licença para Doação de Sangue', aliases: ['licença para doação de sangue', 'licenca para doacao de sangue'] },
      { nome: 'Licença para Alistamento Eleitoral', aliases: ['licença para alistamento eleitoral', 'licenca para alistamento eleitoral'] },
      { nome: 'Licença para Serviço Militar', aliases: ['licença para serviço militar', 'licenca para servico militar'] },
      { nome: 'Licença para Comparecimento a Juízo', aliases: ['licença para comparecimento a juízo', 'licenca para comparecimento a juizo'] },
      { nome: 'Licença para Exame Vestibular', aliases: ['licença para exame vestibular', 'licenca para exame vestibular'] },
      { nome: 'Licença Não Remunerada', aliases: ['licença não remunerada', 'licenca nao remunerada'] },
      { nome: 'Licença Prêmio', aliases: ['licença prêmio', 'licenca premio'] },
      // Para cláusulas que concedem, no MESMO texto, mais de um tipo de licença remunerada
      // (ex.: "3 dias por casamento e 2 dias por luto" na mesma cláusula). Alternativa: usar
      // a classificação principal para o tipo predominante e "categorias_adicionais" para o(s)
      // outro(s) tipo(s) — mas esta subcategoria existe para os casos em que enumerar cada tipo
      // separadamente não vale a pena (3+ tipos na mesma cláusula, ou cláusula genérica de
      // "licenças diversas").
      { nome: 'Outras Licenças Remuneradas (Múltiplos Tipos na Mesma Cláusula)', aliases: ['outras licenças remuneradas', 'outras licencas remuneradas', 'licenças remuneradas diversas', 'licencas remuneradas diversas', 'licenças remuneradas', 'licencas remuneradas', 'licença remunerada', 'licenca remunerada'] },
    ],
  },
  {
    categoria: 'FGTS, Verbas e Rescisão Contratual',
    subcategorias: [
      { nome: 'FGTS', aliases: ['fgts', 'extrato fgts'] },
      { nome: 'Multa Rescisória (FGTS)', aliases: ['multa rescisória', 'multa rescisoria', 'multa rescisória (fgts)'] },
      { nome: 'Verbas Rescisórias', aliases: ['verbas rescisórias', 'verbas rescisorias', 'rescisão contratual', 'rescisao contratual', 'cálculo de verbas rescisórias e férias (comissionados)', 'calculo de verbas rescisorias e ferias comissionados'] },
      { nome: 'Parcelamento de Verbas Rescisórias', aliases: ['parcelamento de verbas rescisórias', 'parcelamento de verbas rescisorias'] },
      { nome: 'Homologação de Rescisão', aliases: ['homologação de rescisão', 'homologacao de rescisao', 'homologação', 'homologacao'] },
      { nome: 'Homologação Sindical', aliases: ['homologação sindical', 'homologacao sindical'] },
      { nome: 'Aviso Prévio', aliases: ['aviso prévio', 'aviso previo', 'comunicação de aviso prévio', 'comunicacao de aviso previo', 'aviso prévio diferenciado', 'aviso previo diferenciado'] },
      { nome: 'Dispensa de Cumprimento de Aviso Prévio', aliases: ['dispensa de cumprimento de aviso prévio', 'dispensa de cumprimento de aviso previo'] },
      { nome: 'Pedido de Demissão', aliases: ['pedido de demissão', 'pedido de demissao'] },
      { nome: 'Rescisão por Acordo (Art. 484-A CLT)', aliases: ['rescisão por acordo', 'rescisao por acordo', 'art. 484-a', 'artigo 484-a'] },
      { nome: 'Dispensa por Justa Causa', aliases: ['dispensa por justa causa'] },
      { nome: 'Plano de Demissão Voluntária (PDV/PDI)', aliases: ['plano de demissão voluntária', 'plano de demissao voluntaria', 'pdv', 'pdi'] },
      { nome: 'Seguro-Desemprego', aliases: ['seguro-desemprego', 'seguro desemprego'] },
      { nome: 'Quitação Anual', aliases: ['quitação anual', 'quitacao anual'] },
      { nome: 'Documentação de Admissão/Rescisão', aliases: ['documentação de admissão', 'documentacao de admissao', 'documentação de rescisão', 'documentacao de rescisao', 'documentação pós-rescisão', 'documentacao pos rescisao', 'documentos pós-rescisão', 'documentos pos rescisao', 'documentação do empregado', 'documentacao do empregado', 'documentação trabalhista', 'documentacao trabalhista', 'contrato de trabalho'] },
    ],
  },
  {
    categoria: 'Relações Sindicais e Representação',
    subcategorias: [
      { nome: 'Contribuição Assistencial Empregado', aliases: ['contribuição assistencial', 'contribuicao assistencial', 'contribuição assistencial (empregados)', 'contribuição assistencial empregados', 'contribuição assistencial empregado', 'custeio sindical', 'taxa negocial'] },
      { nome: 'Contribuição Assistencial Patronal', aliases: ['contribuição assistencial patronal', 'contribuição confederativa patronal', 'contribuição permanente patronal'] },
      { nome: 'Contribuição Sindical/Confederativa Empregado', aliases: ['contribuições sindicais', 'contribuicoes sindicais', 'contribuições sindicais dos empregados', 'contribuição sindical/confederativa', 'contribuição sindical confederativa', 'contribuição sindical', 'contribuição confederativa'] },
      { nome: 'Contribuição Sindical/Confederativa Patronal', aliases: ['contribuições sindicais patronais', 'contribuição sindical patronal', 'contribuição confederativa patronal (empresa)'] },
      { nome: 'Mensalidade Sindical Empregado', aliases: ['mensalidade associativa', 'mensalidade associativa (empregado)', 'mensalidade sindical', 'mensalidade sindical empregado'] },
      { nome: 'Mensalidade Sindical Empresa', aliases: ['mensalidade sindical empresa', 'mensalidade sindical patronal', 'mensalidade associativa patronal', 'mensalidade associativa empresa'] },
      { nome: 'Taxa de Abertura/Funcionamento', aliases: ['taxa de abertura', 'taxa de funcionamento', 'taxa de abertura/funcionamento', 'taxa de abertura e funcionamento'] },
      { nome: 'Direito de Oposição', aliases: ['direito de oposição', 'direito de oposicao'] },
      { nome: 'Garantias a Dirigentes Sindicais', aliases: ['garantias a diretores sindicais', 'liberação sindical', 'liberacao sindical', 'liberação de dirigentes sindicais', 'licença para dirigente sindical', 'licenca para dirigente sindical', 'licença remunerada para dirigentes sindicais'] },
      { nome: 'Informações Sindicais aos Empregados', aliases: ['informações sindicais', 'informacoes sindicais', 'informações sobre contribuições sindicais', 'comunicação sindical', 'comunicacao sindical'] },
      { nome: 'Fornecimento de Documentos e Informações ao Sindicato', aliases: ['fornecimento de documentos ao sindicato', 'fornecimento de informações ao sindicato'] },
      { nome: 'Assembleia', aliases: ['assembleia', 'assembléia'] },
      { nome: 'Negociação Coletiva', aliases: ['negociação coletiva', 'negociacao coletiva', 'princípios da negociação', 'principios da negociacao', 'apoio sindical', 'obrigações sindicais', 'obrigacoes sindicais'] },
      { nome: 'Mesa Permanente de Negociação', aliases: ['mesa permanente de negociação', 'mesa permanente de negociacao'] },
      { nome: 'Acesso do Sindicato ao Local de Trabalho', aliases: ['acesso do sindicato', 'acesso do sindicato ao local de trabalho', 'acesso do sindicato à empresa', 'acesso do sindicato a empresa'] },
      { nome: 'Quadro de Avisos Sindical', aliases: ['quadro de avisos', 'quadro de avisos sindical'] },
      { nome: 'Compromisso de Não Paralisação', aliases: ['compromisso de não paralisação', 'compromisso de nao paralisacao', 'compromisso de não paralisação e negociação futura'] },
      { nome: 'Vedação de Conduta Antissindical', aliases: ['vedação de conduta antissindical', 'vedacao de conduta antissindical'] },
    ],
  },
  {
    categoria: 'Comissão de Conciliação Prévia e Resolução de Conflitos',
    subcategorias: [
      {
        nome: 'Comissão de Conciliação Prévia (CCP)',
        aliases: [
          'comissão de conciliação prévia', 'comissao de conciliacao previa',
          'comissão de conciliação prévia - composição', 'comissão de conciliação prévia - conciliação parcial',
          'comissão de conciliação prévia - convocação e documentação', 'comissão de conciliação prévia - definição e obrigatoriedade',
          'comissão de conciliação prévia - horário e tolerância', 'comissão de conciliação prévia - local de instalação',
          'comissão de conciliação prévia - recebimento de reclamações', 'comissão de conciliação prévia - tentativa frustrada',
          'comissão de conciliação prévia - termo de conciliação',
          'composição da ccp', 'horário de reuniões da ccp', 'horario de reunioes da ccp',
          'local de funcionamento da ccp', 'natureza e obrigatoriedade da ccp',
          'prazos e convocação da ccp', 'prazos e convocacao da ccp',
          'procedimento de reclamação na ccp', 'procedimento de reclamacao na ccp',
          'câmara de conciliação trabalhista', 'camara de conciliacao trabalhista',
          'conciliação prévia', 'conciliacao previa',
          'efeitos da conciliação parcial', 'efeitos do termo de conciliação',
          'procedimento em caso de conciliação frustrada',
        ],
      },
      { nome: 'Mediação', aliases: ['mediação', 'mediacao'] },
      { nome: 'Arbitragem', aliases: ['arbitragem'] },
      { nome: 'Resolução de Conflitos e Dúvidas', aliases: ['resolução de conflitos', 'resolucao de conflitos', 'resolução de conflitos e dúvidas', 'resolução de dúvidas e conflitos', 'mecanismos de solução de conflitos', 'mecanismos de solucao de conflitos'] },
    ],
  },
  {
    categoria: 'Penalidades',
    subcategorias: [
      { nome: 'Multa por Descumprimento', aliases: ['multa por descumprimento', 'multa por descumprimento da cct', 'comunicação de penalidades', 'comunicacao de penalidades'] },
      { nome: 'Cláusula Penal', aliases: ['cláusula penal', 'clausula penal'] },
      { nome: 'Advertência', aliases: ['advertência', 'advertencia'] },
      { nome: 'Suspensão Disciplinar', aliases: ['suspensão disciplinar', 'suspensao disciplinar', 'suspensão'] },
      { nome: 'Ressarcimento de Danos/Responsabilidade por Perdas', aliases: ['ressarcimento de danos', 'responsabilidade por perdas'] },
    ],
  },
  {
    categoria: 'Capacitação e Desenvolvimento',
    subcategorias: [
      { nome: 'Treinamento Obrigatório', aliases: ['treinamento obrigatório', 'treinamento obrigatorio'] },
      { nome: 'Qualificação Profissional', aliases: ['qualificação profissional', 'qualificacao profissional'] },
      { nome: 'Certificações Obrigatórias', aliases: ['certificações obrigatórias', 'certificacoes obrigatorias'] },
      { nome: 'Integração de Novos Empregados', aliases: ['integração de novos empregados', 'integracao de novos empregados'] },
      { nome: 'Desenvolvimento de Lideranças', aliases: ['desenvolvimento de lideranças', 'desenvolvimento de liderancas'] },
      { nome: 'Educação Corporativa', aliases: ['educação corporativa', 'educacao corporativa'] },
      { nome: 'Reembolso Educacional', aliases: ['reembolso educacional'] },
    ],
  },
  {
    categoria: 'Igualdade, Diversidade e Categorias Especiais',
    subcategorias: [
      { nome: 'Equidade de Gênero', aliases: ['equidade de gênero', 'equidade de genero'] },
      { nome: 'Igualdade Salarial entre Homens e Mulheres', aliases: ['igualdade salarial', 'igualdade salarial entre homens e mulheres'] },
      { nome: 'Combate ao Assédio', aliases: ['combate ao assédio', 'combate ao assedio'] },
      { nome: 'PCD', aliases: ['pcd', 'pessoa com deficiência', 'pessoa com deficiencia'] },
      { nome: 'Diversidade Racial', aliases: ['diversidade racial'] },
      { nome: 'Pessoas Trans/LGBTQIA+', aliases: ['pessoas trans', 'lgbtqia+', 'lgbtqia'] },
      { nome: 'Trabalhadores Migrantes/Refugiados', aliases: ['migrantes', 'refugiados', 'trabalhadores migrantes'] },
      { nome: 'Trabalhadores Idosos', aliases: ['idosos', 'trabalhadores idosos'] },
      { nome: 'Apoio a Vítimas de Violência Doméstica', aliases: ['violência doméstica', 'violencia domestica'] },
      { nome: 'Trabalho do Menor/Aprendiz', aliases: ['trabalho do menor', 'aprendiz'] },
    ],
  },
  {
    categoria: 'Tecnologia, Dados e Propriedade Intelectual',
    subcategorias: [
      { nome: 'Monitoramento e Uso de Sistemas', aliases: ['monitoramento e uso de sistemas', 'monitoramento eletrônico', 'monitoramento eletronico'] },
      { nome: 'Videomonitoramento/Biometria', aliases: ['videomonitoramento', 'biometria'] },
      { nome: 'Inteligência Artificial', aliases: ['inteligência artificial', 'inteligencia artificial', 'ia'] },
      { nome: 'Correio Eletrônico e Ferramentas Corporativas', aliases: ['correio eletrônico', 'correio eletronico', 'e-mail corporativo'] },
      { nome: 'Equipamentos Tecnológicos Fornecidos', aliases: ['equipamentos tecnológicos', 'equipamentos tecnologicos'] },
      { nome: 'Propriedade Intelectual', aliases: ['propriedade intelectual', 'propriedade intelectual e responsabilidade'] },
      { nome: 'Proteção de Dados (LGPD)', aliases: ['proteção de dados', 'protecao de dados', 'lgpd', 'propriedade de dados e sistemas'] },
      { nome: 'Segurança da Informação e Confidencialidade', aliases: ['segurança da informação', 'seguranca da informacao', 'confidencialidade'] },
    ],
  },
  {
    categoria: 'Disposições Gerais e Vigência',
    subcategorias: [
      { nome: 'Vigência', aliases: ['vigência', 'vigencia', 'vigência do instrumento coletivo', 'vigencia do instrumento coletivo', 'vigência e data-base', 'vigencia e data base'] },
      { nome: 'Prorrogação', aliases: ['prorrogação', 'prorrogacao'] },
      { nome: 'Revisão', aliases: ['revisão', 'revisao'] },
      { nome: 'Denúncia do Instrumento', aliases: ['denúncia do instrumento', 'denuncia do instrumento'] },
      { nome: 'Abrangência', aliases: ['abrangência', 'abrangencia', 'abrangência da categoria e territorial', 'abrangência da cct', 'abrangência e aplicação', 'abrangência territorial', 'validade e abrangência', 'validade e fundamentação legal'] },
      { nome: 'Hierarquia de Normas', aliases: ['hierarquia de normas', 'apoio e prevalência de cláusulas', 'apoio e prevalencia de clausulas'] },
      { nome: 'Interpretação do Instrumento Coletivo', aliases: ['interpretação', 'interpretacao', 'interpretação do instrumento coletivo'] },
      { nome: 'Casos Omissos', aliases: ['casos omissos'] },
      { nome: 'Integração das Cláusulas', aliases: ['integração das cláusulas', 'integracao das clausulas'] },
      { nome: 'Revogação', aliases: ['revogação', 'revogacao'] },
      { nome: 'Foro de Eleição', aliases: ['foro de eleição', 'foro de eleicao'] },
      { nome: 'Condições Gerais', aliases: ['condições gerais', 'condicoes gerais', 'alteração e extinção do acordo', 'alteracao e extincao do acordo'] },
      { nome: 'Outras', aliases: ['outras', 'outro'] },
    ],
  },
]

// ── Derivações automáticas ──────────────────────────────────────────────────

// Remove acentos, baixa a caixa, colapsa espaços e hífens — usado só para comparação/lookup.
function normalizarChave(texto) {
  if (!texto) return ''
  return texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—/()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// CATEGORIAS: { 'Remuneração e Reajuste': ['Piso Salarial', ...], ... } — usado nos dropdowns
export const CATEGORIAS = Object.fromEntries(
  TAXONOMIA.map(({ categoria, subcategorias }) => [categoria, subcategorias.map(s => s.nome)])
)

// SUBCATEGORIA_INDEX: 'chave normalizada' → [categoria, subcategoria] — usado para normalizar
export const SUBCATEGORIA_INDEX = {}
for (const { categoria, subcategorias } of TAXONOMIA) {
  for (const { nome, aliases } of subcategorias) {
    SUBCATEGORIA_INDEX[normalizarChave(nome)] = [categoria, nome]
    for (const alias of aliases) {
      SUBCATEGORIA_INDEX[normalizarChave(alias)] = [categoria, nome]
    }
  }
}

// CATEGORIA_INDEX: 'chave normalizada' → nome canônico da categoria — para normalizar a
// própria categoria quando ela vier grafada de forma diferente (ex.: "Beneficios" sem acento)
export const CATEGORIA_INDEX = Object.fromEntries(
  TAXONOMIA.map(({ categoria }) => [normalizarChave(categoria), categoria])
)

export const CATEGORIA_CORES = {
  'Remuneração e Reajuste': 'bg-emerald-100 text-emerald-800',
  'Jornada de Trabalho': 'bg-blue-100 text-blue-800',
  'Benefícios': 'bg-purple-100 text-purple-800',
  'Saúde e Segurança do Trabalho': 'bg-red-100 text-red-800',
  'Estabilidade e Garantias de Emprego': 'bg-amber-100 text-amber-800',
  'Férias e Licenças': 'bg-cyan-100 text-cyan-800',
  'FGTS, Verbas e Rescisão Contratual': 'bg-orange-100 text-orange-800',
  'Relações Sindicais e Representação': 'bg-sky-100 text-sky-800',
  'Comissão de Conciliação Prévia e Resolução de Conflitos': 'bg-indigo-100 text-indigo-800',
  'Penalidades': 'bg-rose-100 text-rose-800',
  'Capacitação e Desenvolvimento': 'bg-teal-100 text-teal-800',
  'Igualdade, Diversidade e Categorias Especiais': 'bg-pink-100 text-pink-800',
  'Tecnologia, Dados e Propriedade Intelectual': 'bg-violet-100 text-violet-800',
  'Disposições Gerais e Vigência': 'bg-slate-100 text-slate-700',
}

export const TAGS_PREDEFINIDAS = [
  { label: 'Negociar', color: 'bg-yellow-200 text-yellow-900' },
  { label: 'Risco Alto', color: 'bg-red-200 text-red-900' },
  { label: 'Favorável', color: 'bg-green-200 text-green-900' },
  { label: 'Atenção', color: 'bg-orange-200 text-orange-900' },
  { label: 'Referência', color: 'bg-blue-200 text-blue-900' },
  { label: 'Contestar', color: 'bg-purple-200 text-purple-900' },
]

/**
 * Normaliza uma subcategoria (com ou sem a categoria) para o par canônico.
 * A busca é feita primeiro pela subcategoria (mais específica e discriminante),
 * já que o mesmo texto de subcategoria pode ter chegado com uma categoria "errada"
 * atribuída por um provedor de IA diferente.
 *
 * @param {string} categoriaBruta   categoria como veio da IA/usuário (pode ser vazia)
 * @param {string} subcategoriaBruta subcategoria como veio da IA/usuário
 * @returns {{categoria: string, subcategoria: string} | null} par canônico, ou null se não
 *          foi possível reconhecer nem a categoria nem a subcategoria (cabe revisão manual)
 */
export function classificar(categoriaBruta, subcategoriaBruta) {
  const chaveSub = normalizarChave(subcategoriaBruta)
  if (chaveSub && SUBCATEGORIA_INDEX[chaveSub]) {
    const [categoria, subcategoria] = SUBCATEGORIA_INDEX[chaveSub]
    return { categoria, subcategoria }
  }
  // Não reconheceu a subcategoria — tenta ao menos normalizar a categoria
  const chaveCat = normalizarChave(categoriaBruta)
  const categoria = CATEGORIA_INDEX[chaveCat] || null
  if (categoria) {
    return { categoria, subcategoria: subcategoriaBruta || '' }
  }
  return null
}

/**
 * Normaliza apenas a subcategoria (mantida por compatibilidade com código existente).
 * Se não houver correspondência, retorna o valor original sem alteração.
 */
export function normalizarSubcategoria(subcategoria) {
  if (!subcategoria) return subcategoria
  const chave = normalizarChave(subcategoria)
  const achado = SUBCATEGORIA_INDEX[chave]
  return achado ? achado[1] : subcategoria
}

/** Normaliza apenas a categoria. Se não houver correspondência, retorna o valor original. */
export function normalizarCategoria(categoria) {
  if (!categoria) return categoria
  const chave = normalizarChave(categoria)
  return CATEGORIA_INDEX[chave] || categoria
}
