// Suíte de regressão do motor determinístico (src/utils/comparacao.js).
//
// Objetivo: parar de depender só de revisão manual de Excel exportado a cada
// lote novo de dados. Toda vez que um caso real (bom ou ruim) for confirmado
// numa verificação, ele deve ganhar um teste aqui — assim um PR futuro que
// quebre esse comportamento falha o `npm test` automaticamente, em vez de só
// aparecer meses depois num relatório de produção.
//
// Convenção de proveniência nos comentários de cada teste:
// - "Caso real confirmado" = texto extraído literalmente de um instrumento
//   revisado (data indicada), com o comportamento correto verificado à mão.
// - "Caso hipotético" = motivado por um risco plausível, mas nunca observado
//   nos dados revisados até a data indicada. Serve pra travar a intenção do
//   código, não para alegar que o bug já ocorreu.
//
// Rodar com: npm test

import { describe, it, expect } from 'vitest'
import {
  avaliarSuperioridade,
  familiasIncompativeis,
  tituloApenasGenerico,
  compararInstrumentosNeg,
  resultadoTexto,
} from './comparacao.js'

describe('avaliarSuperioridade — reajuste em faixas salariais mistas', () => {
  // Caso real confirmado (negociacao_sindical_2026-08-25.xlsx, ponto 5, e
  // comparativo_objetivo_2026-08-25.xlsx, ponto 4): ACT com reajuste em duas
  // faixas de remuneração — percentual para uma, valor fixo em R$ para outra.
  // Antes do fix, o motor reportava só o percentual da primeira faixa (4,11%)
  // como se fosse o reajuste de toda a categoria, omitindo o R$ 369,90 fixo da
  // segunda faixa.
  const baseFaixaDupla = `Nº 4ª — DO REAJUSTE SALARIAL

Os salários dos empregados abrangidos por este ACORDO COLETIVO DE TRABALHO, que não tenham sido incluídos na política de salary review como antecipação de data-base, ainda que proporcionais, serão reajustados da seguinte forma:

a) Para os empregados cuja remuneração, inclusive salário fixo acrescido de variável, tenha sido de até R$ 9.000,00 (nove mil reais) em 30/04/2026: reajuste de 4,11% (quatro vírgula onze por cento), incidente exclusivamente sobre o salário-base, sem reflexo em benefícios ou quaisquer outras verbas de natureza indenizatória, a partir de 01/05/2026;

b) Para os empregados cuja remuneração, incluindo salário fixo acrescido de variável, tenha sido acima de R$ 9.000,01 (nove mil reais e um centavo) em 30/04/2026: reajuste fixo de R$ 369,90 (trezentos e sessenta e nove reais e noventa centavos).`

  const comparadaSimples = `Nº QUARTA — REAJUSTE

Sobre os salários vigentes em 31 de maio de 2025 será aplicado as cláusulas de cunho econômico o percentual de 6% (seis por cento) retroativo à data base de 01 de junho de 2025, acrescido do percentual de 1% (um por cento) sobre os valores praticados em 31/10/2025 a partir de 01/11/2025, perfazendo um total de 7% (sete por cento).`

  it('sinaliza Ambigua com aviso quando a base tem faixas salariais mistas (% + R$ fixo)', () => {
    const r = avaliarSuperioridade(baseFaixaDupla, comparadaSimples, 'REAJUSTE SALARIAL')
    expect(r.status).toBe('Ambigua')
    expect(r.resumo).toMatch(/faixas salariais distintas/i)
  })

  it('NÃO sinaliza faixas mistas num reajuste simples de faixa única (controle)', () => {
    const base = 'Nº 4ª — REAJUSTE SALARIAL\n\nOs salários serão reajustados em 5,00% a partir de janeiro/2025.'
    const comp = 'Nº QUARTA — REAJUSTE SALARIAL\n\nOs salários serão reajustados em 5,18% a partir de julho/2025.'
    const r = avaliarSuperioridade(base, comp, 'REAJUSTE SALARIAL')
    expect(r.status).toBe('Inferior')
    expect(r.resumo).not.toMatch(/faixas salariais distintas/i)
  })

  it('NÃO confunde progressão temporal de piso salarial com faixa mista (controle)', () => {
    // Caso real confirmado (comparativo_objetivo_2026-08-26.xlsx, ponto 3):
    // dois valores em R$ no mesmo caput, mas são a mesma faixa em datas
    // diferentes (progressão), não faixas de remuneração distintas.
    const base = 'Nº TERCEIRA — PISO SALARIAL\n\nFica assegurado a partir de 1º de Julho de 2025 um piso salarial no valor de R$ 1.800,00. A partir de 1º de setembro de 2025 o piso salarial assegurado será de R$ 1.872,00.'
    const comp = 'Nº TERCEIRA — PISO SALARIAL\n\nEstabelecem que o Piso Salarial da categoria, a partir de janeiro/2025, será no valor R$ 1.735,70.'
    const r = avaliarSuperioridade(base, comp, 'PISO SALARIAL')
    expect(r.status).toBe('Superior')
    expect(r.resumo).not.toMatch(/faixas salariais distintas/i)
  })
})

describe('familiasIncompativeis — contribuição patronal × profissional', () => {
  it('bloqueia par entre contribuição patronal e contribuição profissional (caso hipotético, motivado por confusões documentadas no pareamento por IA)', () => {
    const patronal = 'Contribuição Confederativa Patronal — as EMPRESAS recolherão ao sindicato patronal, categoria econômica, o valor de...'
    const profissional = 'Taxa Negocial — será descontado do salário do empregado, sindicato profissional, categoria profissional...'
    expect(familiasIncompativeis(patronal, profissional)).toBe(true)
  })

  it('NÃO bloqueia duas cláusulas do mesmo lado profissional (controle)', () => {
    const a = 'Contribuição Assistencial Negocial — desconto do salário do empregado, sindicato profissional...'
    const b = 'Contribuição Negocial dos Empregados — desconto em folha, categoria profissional...'
    expect(familiasIncompativeis(a, b)).toBe(false)
  })
})

describe('tituloApenasGenerico — termo genérico demais não prova mesmo instituto', () => {
  it('caso hipotético: "Banco de horas" × "Da Compensação" só compartilham a palavra "compensação"', () => {
    expect(tituloApenasGenerico('Banco de horas (compensação dias)', 'DA COMPENSAÇÃO')).toBe(true)
  })

  it('caso hipotético: "Salário Ingresso" × "Salário Substituição" só compartilham a palavra "salário"', () => {
    expect(tituloApenasGenerico('Salário Ingresso', 'Salário Substituição')).toBe(true)
  })

  it('NÃO bloqueia pareamento legítimo com termo específico em comum (controle)', () => {
    expect(tituloApenasGenerico('Auxílio Combustível', 'Ajuda de Custo Combustível')).toBe(false)
  })

  it('caso real confirmado (comparativo_objetivo_2026-08-26.xlsx, ponto 14): "Contribuição Assistencial Negocial" × "Contribuição Negocial dos Empregados" é pareamento legítimo — não deve ser tratado como só-genérico porque compartilham também "negocial"', () => {
    expect(tituloApenasGenerico('CONTRIBUIÇÃO ASSISTENCIAL NEGOCIAL', 'CONTRIBUIÇÃO NEGOCIAL DOS EMPREGADOS')).toBe(false)
  })
})

describe('resultadoTexto — nunca perde o resumo (regressão do bug de 28/08/2026)', () => {
  // Caso real confirmado: comparativo_objetivo_2026-08-28.xlsx trazia
  // "? Ambígua" sem NENHUM texto em 3 células (Reajuste Salarial, Piso
  // Salarial), enquanto negociacao_sindical_2026-08-28.xlsx, com os MESMOS
  // dados, trazia a explicação completa. Causa raiz: Negociacao.jsx tinha duas
  // implementações independentes de "montar o texto do resultado" — uma
  // (exportarExcel) incluía av.resumo, a outra (montarPontosNegociacao, usada
  // pelo Comparativo Objetivo) não. resultadoTexto() unifica as duas.
  it('inclui o resumo para status Ambigua', () => {
    const av = { status: 'Ambigua', resumo: 'Ambas as fontes têm faixas salariais distintas...' }
    const texto = resultadoTexto(av, 'ACT', 'Prática do Cliente', true)
    expect(texto).toContain('Ambígua')
    expect(texto).toContain('faixas salariais distintas')
  })

  it('inclui o resumo para qualquer status (Superior, Inferior, Igual, Redação Diferente)', () => {
    for (const status of ['Superior', 'Inferior', 'Igual', 'Modificada']) {
      const av = { status, resumo: 'texto explicativo específico deste caso' }
      const texto = resultadoTexto(av, 'ACT', 'CCT', true)
      expect(texto).toContain('texto explicativo específico deste caso')
    }
  })

  it('não quebra quando não há resumo (ex.: Sem Previsão, que não gera texto extra)', () => {
    const av = { status: 'Sem previsão' }
    const texto = resultadoTexto(av, 'ACT', 'CCT', true)
    expect(texto).not.toContain('undefined')
    expect(texto).not.toMatch(/— $/)
  })

  it('retorna null quando não há avaliação (evita "undefined" na planilha)', () => {
    expect(resultadoTexto(null, 'ACT', 'CCT')).toBeNull()
    expect(resultadoTexto({}, 'ACT', 'CCT')).toBeNull()
  })
})

describe('compararInstrumentosNeg — regressão end-to-end com pares reais confirmados', () => {
  // Caso real confirmado (negociacao_sindical_2026-08-25.xlsx, pareado por IA
  // e depois confirmado por revisão manual): mesmo instituto (banco de horas /
  // compensação de jornada), vocabulário muito diferente entre ACT e CCT — é
  // o caso de uso que motivou o pareamento por IA existir. Este teste garante
  // que o casamento AUTOMÁTICO (sem IA) não pareia por engano nem deixa de
  // reconhecer isso como pares de institutos distintos quando processado só
  // pelo motor lexical (aqui documentamos o comportamento esperado: SEM ajuda
  // da IA, o motor não deveria arriscar esse pareamento sozinho, dado o baixo
  // overlap léxico).
  it('não pareia automaticamente "Banco de Horas" com "Regime de Compensação Horária" só pelo léxico (requer IA)', () => {
    const a = [{ id: 'a1', titulo: 'DO SISTEMA DE BANCO DE HORAS', conteudo: 'Conforme possibilidade prevista no artigo 7º, XIII, da Constituição Federal e artigo 59 da CLT, as PARTES instituem Banco de Horas para compensação de jornada extraordinária.' }]
    const b = [{ id: 'b1', titulo: 'DO REGIME DE COMPENSAÇÃO HORÁRIA P/ EMP. QUE UTILIZAM CONTROLE DE JORNADA', conteudo: 'Fica instituído regime de compensação horária mediante controle de jornada, nos termos do acordo de compensação previsto na CLT.' }]
    const resultado = compararInstrumentosNeg(a, b)
    const pareado = resultado.find(r => r.clausulaA && r.clausulaB)
    // Documenta o comportamento atual (sem pareamento automático — os dois
    // ficam como SUPRIMIDA/NOVA isolados) — se isso mudar intencionalmente
    // (ex.: sinônimo novo cobrindo esse caso), atualizar este teste.
    expect(pareado).toBeUndefined()
    expect(resultado.some(r => r.status?.label === 'SUPRIMIDA')).toBe(true)
    expect(resultado.some(r => r.status?.label === 'NOVA')).toBe(true)
  })
})
