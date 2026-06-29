export const CATEGORIAS = {
  'Remuneração': [
    'Piso Salarial', 'Reajuste', 'Equiparação Salarial', 'Gratificação',
    'Gratificação por Tempo de Serviço', 'PLR/PPR', 'Comissão', 'Adicional de Função',
    'Adicional Noturno', '13º Salário', 'Comprovante de Pagamento', 'Descontos em Folha',
    'DSR', 'Adiantamento Salarial',
  ],
  'Jornada de Trabalho': [
    'Banco de Horas', 'Hora Extra', 'Turno', 'Escala', 'Intervalo Intrajornada',
    'Trabalho Noturno', 'Sobreaviso', 'Jornada Reduzida', 'Duração da Jornada',
    'Compensação de Jornada', 'Controle de Ponto', 'Abono de Faltas', 'Flexibilidade para Estudantes'
  ],
  'Benefícios': [
    'Vale-Alimentação', 'Auxílio Alimentação', 'Vale-Refeição', 'Vale-Transporte',
    'Cesta Básica', 'Auxílio Creche', 'Plano de Saúde', 'Plano Odontológico',
    'Seguro de Vida e Auxílio Funeral', 'Auxílio Farmácia', 'Auxílio Doença/Acidente',
    'Empréstimos Consignados', 'Manutenção de Benefícios', 'Outros Benefícios'
  ],
  'Saúde e Segurança': [
    'Insalubridade', 'Periculosidade', 'Adicionais de Insalubridade/Periculosidade',
    'EPI', 'Exames Médicos', 'CIPA', 'PCMSO/PPRA/PGR',
    'Ergonomia', 'Acidente de Trabalho', 'Prevenção de Acidentes e Doenças',
    'Uniformes', 'Treinamento e Informação', 'Direito de Recusa', 'NR Específica'
  ],
  'Estabilidade e Garantias': [
    'Estabilidade Gestante', 'Estabilidade Acidentado', 'Estabilidade Pós-Acidente/Doença Profissional',
    'Dirigente Sindical', 'Cipeiro', 'Pré-Aposentadoria', 'Aviso Prévio Diferenciado'
  ],
  'FGTS e Rescisão': [
    'FGTS', 'Multa Rescisória', 'Verbas Rescisórias', 'Homologação',
    'Aviso Prévio', 'Comunicação de Aviso Prévio'
  ],
  'Férias e Licenças': [
    'Férias', 'Abono de Férias', 'Licença Maternidade', 'Licença Paternidade',
    'Licença Remunerada', 'Abono de Faltas'
  ],
  'Relações Sindicais': [
    'Contribuição Sindical', 'Contribuição Assistencial', 'Liberação Sindical',
    'Garantias a Diretores Sindicais', 'Licença Remunerada para Dirigentes Sindicais',
    'Informações Sindicais', 'Assembleia', 'Negociação Coletiva',
    'Acesso do Sindicato ao Local de Trabalho', 'Resolução de Conflitos'
  ],
  'Penalidades': [
    'Multa por Descumprimento', 'Cláusula Penal'
  ],
  'Capacitação': [
    'Treinamento Obrigatório', 'Qualificação Profissional', 'Reembolso Educacional'
  ],
  'Igualdade e Diversidade': [
    'Equidade de Gênero', 'Combate ao Assédio', 'PCD', 'Diversidade Racial'
  ],
  'Disposições Gerais': [
    'Vigência', 'Abrangência', 'Hierarquia de Normas', 'Mecanismos de Solução de Conflitos',
    'Homologação', 'Condições Gerais', 'Outras'
  ],
}

export const CATEGORIA_CORES = {
  'Remuneração': 'bg-emerald-100 text-emerald-800',
  'Jornada de Trabalho': 'bg-blue-100 text-blue-800',
  'Benefícios': 'bg-purple-100 text-purple-800',
  'Saúde e Segurança': 'bg-red-100 text-red-800',
  'Estabilidade e Garantias': 'bg-amber-100 text-amber-800',
  'FGTS e Rescisão': 'bg-orange-100 text-orange-800',
  'Férias e Licenças': 'bg-cyan-100 text-cyan-800',
  'Relações Sindicais': 'bg-sky-100 text-sky-800',
  'Penalidades': 'bg-rose-100 text-rose-800',
  'Capacitação': 'bg-teal-100 text-teal-800',
  'Igualdade e Diversidade': 'bg-pink-100 text-pink-800',
  'Disposições Gerais': 'bg-slate-100 text-slate-700',
}

export const TAGS_PREDEFINIDAS = [
  { label: 'Negociar', color: 'bg-yellow-200 text-yellow-900' },
  { label: 'Risco Alto', color: 'bg-red-200 text-red-900' },
  { label: 'Favorável', color: 'bg-green-200 text-green-900' },
  { label: 'Atenção', color: 'bg-orange-200 text-orange-900' },
  { label: 'Referência', color: 'bg-blue-200 text-blue-900' },
  { label: 'Contestar', color: 'bg-purple-200 text-purple-900' },
]

// ── Mapa de normalização de subcategorias ─────────────────────────────────────
// Converte variações geradas pela IA em subcategoria canônica padronizada.
// Chave: variação (lowercase trim) → Valor: nome canônico
export const SUBCATEGORIA_NORMALIZACAO = {
  // Alimentação / Auxílio Alimentação  → canônico: Auxílio Alimentação
  'alimentação': 'Auxílio Alimentação',
  'auxílio alimentação': 'Auxílio Alimentação',
  'auxilio alimentação': 'Auxílio Alimentação',
  'vale-alimentação': 'Vale-Alimentação',
  'vale alimentação': 'Vale-Alimentação',

  // Gratificação por aposentadoria → canônico dentro de Benefícios; mas em Remuneração é "Gratificação"
  // A IA pode gerar ambas — mapeamos "gratificação por aposentadoria" separado do campo remuneração
  'gratificação por aposentadoria': 'Gratificação por Aposentadoria',
  'gratificação por tempo de serviço': 'Gratificação por Tempo de Serviço',
  'gratificacao por aposentadoria': 'Gratificação por Aposentadoria',
  'gratificacao por tempo de servico': 'Gratificação por Tempo de Serviço',

  // Seguro de vida / fundo → canônico: Seguro de Vida e Auxílio Funeral
  'seguro de vida e fundo de inclusão social': 'Seguro de Vida e Auxílio Funeral',
  'seguro de vida e auxílio funeral': 'Seguro de Vida e Auxílio Funeral',
  'seguro de vida e auxilio funeral': 'Seguro de Vida e Auxílio Funeral',
  'seguro de vida': 'Seguro de Vida e Auxílio Funeral',

  // Pré-aposentadoria
  'pré-aposentadoria': 'Pré-Aposentadoria',
  'pre-aposentadoria': 'Pré-Aposentadoria',
  'garantia pré-aposentadoria': 'Pré-Aposentadoria',
  'garantia pre-aposentadoria': 'Pré-Aposentadoria',
  'garantia pré aposentadoria': 'Pré-Aposentadoria',

  // Aviso prévio
  'comunicação de aviso prévio': 'Aviso Prévio',
  'comunicacao de aviso previo': 'Aviso Prévio',
  'aviso prévio diferenciado': 'Aviso Prévio',
  'aviso previo': 'Aviso Prévio',
  'aviso prévio': 'Aviso Prévio',

  // EPI e Exames Médicos → separar em dois campos canônicos ou unificar?
  // A IA gera "EPI" e "EPI e Exames Médicos" e "Exames Médicos" — unificamos em duas subcategorias canônicas
  'epi e exames médicos': 'EPI',
  'epi e exames medicos': 'EPI',

  // Exames Médicos
  'exames médicos periódicos': 'Exames Médicos',
  'exames medicos periódicos': 'Exames Médicos',
  'exames medicos periodicos': 'Exames Médicos',
  'exames médicos': 'Exames Médicos',
  'exames medicos': 'Exames Médicos',

  // Uniformes
  'uniformes e lavagem': 'Uniformes',

  // Adicionais insalubridade/periculosidade
  'adicionais de insalubridade/periculosidade e proteção à maternidade': 'Adicionais de Insalubridade/Periculosidade',
  'adicionais de insalubridade/periculosidade e protecao a maternidade': 'Adicionais de Insalubridade/Periculosidade',
  'adicionais de insalubridade/periculosidade': 'Adicionais de Insalubridade/Periculosidade',
  'insalubridade/periculosidade': 'Adicionais de Insalubridade/Periculosidade',
  'insalubridade e periculosidade': 'Adicionais de Insalubridade/Periculosidade',

  // Prevenção de acidentes
  'prevenção de acidentes e doenças profissionais': 'Prevenção de Acidentes e Doenças',
  'prevencao de acidentes e doencas profissionais': 'Prevenção de Acidentes e Doenças',
  'prevenção de acidentes e doenças': 'Prevenção de Acidentes e Doenças',

  // PCMSO/PPRA
  'pcmso/ppra': 'PCMSO/PPRA/PGR',
  'ppra/pgr': 'PCMSO/PPRA/PGR',
  'pgr': 'PCMSO/PPRA/PGR',
  'pcmso': 'PCMSO/PPRA/PGR',

  // Informações sindicais
  'informações sobre contribuições sindicais': 'Informações Sindicais',
  'informacoes sobre contribuicoes sindicais': 'Informações Sindicais',
  'informações sindicais': 'Informações Sindicais',

  // Liberação sindical / dirigentes
  'liberação de dirigentes sindicais': 'Garantias a Diretores Sindicais',
  'liberacao de dirigentes sindicais': 'Garantias a Diretores Sindicais',
  'licença remunerada para dirigentes sindicais': 'Garantias a Diretores Sindicais',
  'licenca remunerada para dirigentes sindicais': 'Garantias a Diretores Sindicais',
  'garantias a diretores sindicais': 'Garantias a Diretores Sindicais',

  // Resolução de conflitos / mecanismos
  'mecanismos de solução de conflitos': 'Resolução de Conflitos',
  'mecanismos de solucao de conflitos': 'Resolução de Conflitos',

  // Reajuste
  'reajuste salarial': 'Reajuste',
  'reajuste': 'Reajuste',
  'correção salarial': 'Reajuste',
  'correcao salarial': 'Reajuste',

  // PLR
  'plr': 'PLR/PPR',
  'plr/ppr': 'PLR/PPR',
  'ppr': 'PLR/PPR',

  // Estabilidade pós-acidente
  'estabilidade pós-acidente/doença profissional': 'Estabilidade Pós-Acidente/Doença Profissional',
  'estabilidade pos-acidente/doenca profissional': 'Estabilidade Pós-Acidente/Doença Profissional',
}

/**
 * Normaliza uma subcategoria aplicando o mapa de equivalências.
 * Se não houver mapeamento, retorna o valor original sem alteração.
 */
export function normalizarSubcategoria(subcategoria) {
  if (!subcategoria) return subcategoria
  const chave = subcategoria.trim().toLowerCase()
  return SUBCATEGORIA_NORMALIZACAO[chave] || subcategoria
}
