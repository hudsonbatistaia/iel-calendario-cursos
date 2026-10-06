/*
 * Feriados que entram no cálculo do calendário (nacionais, Amazonas e Manaus).
 * REVISAR TODO COMEÇO DE ANO: decretos estaduais e municipais mudam.
 *
 * pular: true  -> não há aula nesse dia (a aula vai para o próximo dia válido)
 * pular: false -> o dia continua com aula, mas aparece um aviso (ponto facultativo)
 * O usuário pode inverter qualquer um deles na tela "Feriados e dias ponte".
 */
(function (raiz) {
  'use strict';

  var FIXOS = [
    ['01-01', 'Confraternização Universal', 'nacional'],
    ['04-21', 'Tiradentes', 'nacional'],
    ['05-01', 'Dia do Trabalho', 'nacional'],
    ['09-05', 'Elevação do Amazonas a Província', 'estadual'],
    ['09-07', 'Independência do Brasil', 'nacional'],
    ['10-12', 'Nossa Senhora Aparecida', 'nacional'],
    ['10-24', 'Aniversário de Manaus', 'municipal'],
    ['11-02', 'Finados', 'nacional'],
    ['11-15', 'Proclamação da República', 'nacional'],
    ['11-20', 'Consciência Negra', 'nacional'],
    ['12-08', 'Nossa Senhora da Conceição', 'municipal'],
    ['12-25', 'Natal', 'nacional']
  ];

  // Deslocamento em dias a partir do domingo de Páscoa
  var MOVEIS = [
    [-48, 'Carnaval (segunda)', 'facultativo', false],
    [-47, 'Carnaval (terça)', 'facultativo', false],
    [-46, 'Quarta-feira de Cinzas', 'facultativo', false],
    [-2, 'Sexta-feira Santa', 'nacional', true],
    [60, 'Corpus Christi', 'facultativo', false]
  ];

  var TIPOS = {
    nacional: 'Nacional',
    estadual: 'Amazonas',
    municipal: 'Manaus',
    facultativo: 'Ponto facultativo',
    recesso: 'Recesso IEL'
  };

  function pad(n) { return String(n).padStart(2, '0'); }

  function isoDeUtc(d) {
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  // Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano)
  function pascoa(ano) {
    var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mes = Math.floor((h + l - 7 * m + 114) / 31);
    var dia = ((h + l - 7 * m + 114) % 31) + 1;
    return isoDeUtc(new Date(Date.UTC(ano, mes - 1, dia)));
  }

  function feriadosDoAno(ano) {
    var p = pascoa(ano).split('-').map(Number);
    var lista = FIXOS.map(function (f) {
      return { data: ano + '-' + f[0], nome: f[1], tipo: f[2], pular: true };
    });
    MOVEIS.forEach(function (f) {
      lista.push({
        data: isoDeUtc(new Date(Date.UTC(p[0], p[1] - 1, p[2] + f[0]))),
        nome: f[1], tipo: f[2], pular: f[3]
      });
    });
    return lista.sort(function (x, y) { return x.data < y.data ? -1 : x.data > y.data ? 1 : 0; });
  }

  var api = { feriadosDoAno: feriadosDoAno, pascoa: pascoa, TIPOS: TIPOS };
  raiz.FeriadosIEL = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
