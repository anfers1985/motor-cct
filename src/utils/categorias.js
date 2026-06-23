// Categorias e subcategorias canônicas do Motor CCT.
// Os valores aqui DEVEM corresponder exatamente (ou via SUBCATEGORIA_ALIASES)
// ao que a IA grava no campo `subcategoria` no banco de dados.

export const CATEGORIAS = {
  'Remuneração': [
    'Piso Salarial',
    'Reajuste Salarial',
    'Gratificação',
    'PLR',
    '13º Salário',
    'Adicional Noturno',
    'Comprovante de Pagamento',
    'Descontos em Folha',
  ],
  'Jornada de Trabalho': [
    'Banco de Horas',
    'Horas Extras',
    'Compensação de Jornada',
    'Controle de Ponto',
    'Duração da Jornada',
    'Abono de Faltas',
    'Flexibilidade para Estudantes',
    'Férias',
  ],
  'Benefícios': [
    'Cesta Básica',
    'Vale-Transporte',
    'Alimentação',
    'Auxílio Alimentação',
    'Auxílio Doença/Acidente',
    'Seguro de Vida e Auxílio Funeral',
    'Seguro de Vida e Fundo de Inclusão Social',
    'Gratificação por Aposentadoria',
    'Gratificação por Tempo de Serviço',
    'Manutenção de Benefícios',
    'Empréstimos Consignados',
  ],
  'Saúde e Segurança': [
    'Adicionais de Insalubridade/Periculosidade',
    'Adicionais de Insalubridade/Periculosidade e Proteção à Maternidade',
    'EPI',
    'EPI e Exames Médicos',
    'Exames Médicos',
    'Exames Médicos Periódicos',
    'Prevenção de Acidentes e Doenças',
    'Prevenção de Acidentes e Doenças Profissionais',
    'Uniformes',
    'Uniformes e Lavagem',
    'Treinamento e Informação',
    'Direito de Recusa',
    'CIPA',
  ],
  'Estabilidade e Garantias': [
    'Estabilidade Pós-Acidente/Doença Profissional',
    'Garantia Pré-Aposentadoria',
    'Pré-Aposentadoria',
  ],
  'FGTS e Rescisão': [
    'Aviso Prévio',
    'Comunicação de Aviso Prévio',
  ],
  'Férias e Licenças': [
    'Férias',
  ],
  'Relações Sindicais': [
    'Contribuição Assistencial',
    'Liberação de Dirigentes Sindicais',
    'Licença Remunerada para Dirigentes Sindicais',
    'Garantias a Diretores Sindicais',
    'Acesso do Sindicato ao Local de Trabalho',
    'Informações Sindicais',
    'Informações sobre Contribuições Sindicais',
    'Resolução de Conflitos',
    'CIPA',
  ],
  'Penalidades': [
    'Multa por Descumprimento',
  ],
  'Disposições Gerais': [
    'Vigência',
    'Abrangência',
    'Hierarquia de Normas',
    'Mecanismos de Solução de Conflitos',
  ],
}

// Mapa de aliases: variantes que a IA pode gerar → subcategoria canônica.
// Usado para normalizar na query do banco (expandir "Reajuste Salarial" para incluir
// "Reajuste", "Reajuste de Salário", etc. que possam existir em outros instrumentos).
export const SUBCATEGORIA_ALIASES = {
  // Remuneração
  'Reajuste':                              'Reajuste Salarial',
  'Reajuste de Salário':                   'Reajuste Salarial',
  'Reajuste Salarial':                     'Reajuste Salarial',
  'PLR/PPR':                               'PLR',
  'Participação nos Lucros e Resultados':  'PLR',

  // Jornada
  'Hora Extra':        'Horas Extras',
  'Banco de Horas':    'Banco de Horas',
  'Compensação de Horas': 'Compensação de Jornada',

  // Saúde
  'Insalubridade':                         'Adicionais de Insalubridade/Periculosidade',
  'Insalubridade/Periculosidade':          'Adicionais de Insalubridade/Periculosidade',
  'Adicionais de Insalubridade/Periculosidade': 'Adicionais de Insalubridade/Periculosidade',
  'Adicionais de Insalubridade/Periculosidade e Proteção à Maternidade':
    'Adicionais de Insalubridade/Periculosidade e Proteção à Maternidade',
  'Exame Médico':      'Exames Médicos',
  'Exames Médicos':    'Exames Médicos',
  'Exames Médicos Periódicos': 'Exames Médicos Periódicos',
  'Prevenção de Acidentes': 'Prevenção de Acidentes e Doenças',
  'Prevenção de Acidentes e Doenças': 'Prevenção de Acidentes e Doenças',
  'Prevenção de Acidentes e Doenças Profissionais': 'Prevenção de Acidentes e Doenças Profissionais',
  'Uniforme':          'Uniformes',
  'Uniformes':         'Uniformes',
  'Uniformes e Lavagem': 'Uniformes e Lavagem',

  // Rescisão
  'Aviso Prévio Diferenciado': 'Aviso Prévio',
  'Aviso Prévio Indenizado':   'Aviso Prévio',

  // Relações Sindicais
  'Contribuição Sindical':  'Contribuição Assistencial',
  'Custeio Sindical':       'Contribuição Assistencial',
  'Liberação Sindical':     'Liberação de Dirigentes Sindicais',
  'Vedação de Conduta Antissindical': 'Acesso do Sindicato ao Local de Trabalho',
  'Vedação à Conduta Antissindical':  'Acesso do Sindicato ao Local de Trabalho',
  'Acesso do Sindicato':   'Acesso do Sindicato ao Local de Trabalho',
  'Resolução de Conflitos e Dúvidas': 'Resolução de Conflitos',
  'Resolução de Dúvidas e Conflitos': 'Resolução de Conflitos',

  // Disposições Gerais
  'Vigência do Instrumento Coletivo': 'Vigência',
  'Vigência e Data-Base':             'Vigência',
  'Abrangência da CCT':               'Abrangência',
  'Abrangência da Categoria e Territorial': 'Abrangência',
  'Validade e Abrangência':           'Abrangência',

  // Benefícios
  'Seguro de Vida':            'Seguro de Vida e Auxílio Funeral',
  'Auxílio Funeral':           'Seguro de Vida e Auxílio Funeral',
  'Fundo de Inclusão Social':  'Seguro de Vida e Fundo de Inclusão Social',
}

// Dado um conjunto de subcategorias canônicas selecionadas,
// retorna todas as variantes (aliases) correspondentes para usar na query .in()
export function expandirSubcategorias(subcatsCanônicas) {
  if (!subcatsCanônicas || subcatsCanônicas.length === 0) return []
  const conjunto = new Set(subcatsCanônicas)
  // Adicionar aliases que apontam para as canônicas selecionadas
  for (const [alias, canônica] of Object.entries(SUBCATEGORIA_ALIASES)) {
    if (conjunto.has(canônica)) conjunto.add(alias)
  }
  // Adicionar também as próprias canônicas (caso o banco use exatamente esse nome)
  for (const s of subcatsCanônicas) conjunto.add(s)
  return [...conjunto]
}

export const CATEGORIA_CORES = {
  'Remuneração':          'bg-emerald-100 text-emerald-800',
  'Jornada de Trabalho':  'bg-blue-100 text-blue-800',
  'Benefícios':           'bg-purple-100 text-purple-800',
  'Saúde e Segurança':    'bg-red-100 text-red-800',
  'Estabilidade e Garantias': 'bg-amber-100 text-amber-800',
  'FGTS e Rescisão':      'bg-orange-100 text-orange-800',
  'Férias e Licenças':    'bg-cyan-100 text-cyan-800',
  'Relações Sindicais':   'bg-sky-100 text-sky-800',
  'Penalidades':          'bg-rose-100 text-rose-800',
  'Disposições Gerais':   'bg-slate-100 text-slate-700',
}

export const TAGS_PREDEFINIDAS = [
  { label: 'Negociar',    color: 'bg-yellow-200 text-yellow-900' },
  { label: 'Risco Alto',  color: 'bg-red-200 text-red-900' },
  { label: 'Favorável',   color: 'bg-green-200 text-green-900' },
  { label: 'Atenção',     color: 'bg-orange-200 text-orange-900' },
  { label: 'Referência',  color: 'bg-blue-200 text-blue-900' },
  { label: 'Contestar',   color: 'bg-purple-200 text-purple-900' },
]
