/*
 * Regras do calendário: datas, distribuição das aulas, formatação e arquivo .ics.
 * Nada aqui mexe na tela, para poder ser testado em testes/testes.html.
 *
 * Datas circulam sempre como texto 'AAAA-MM-DD'. Nunca usar new Date('2026-10-13'):
 * o navegador lê em UTC e, em Manaus (UTC-4), vira o dia 12.
 */
(function (raiz) {
  'use strict';

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var LIMITE_DIAS = 3 * 366; // trava de segurança: curso com mais de 3 anos é erro de digitação

  /* ---------- Datas ---------- */

  function pad(n) { return String(n).padStart(2, '0'); }

  function partes(iso) { return iso.split('-').map(Number); }

  function utc(iso) {
    var p = partes(iso);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  }

  function paraIso(d) {
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function somarDias(iso, n) {
    var p = partes(iso);
    return paraIso(new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)));
  }

  function diaSemana(iso) { return utc(iso).getUTCDay(); }

  function hoje() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function isoValido(iso) {
    return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && paraIso(utc(iso)) === iso;
  }

  /* ---------- Distribuição das aulas ---------- */

  /*
   * op.inicio        'AAAA-MM-DD'
   * op.diasSemana    [0..6] (0 = domingo)
   * op.minutosTotal  carga horária total em minutos
   * op.minutosDia    carga horária por aula em minutos
   * op.bloqueios     { 'AAAA-MM-DD': motivo } dias sem aula (feriados, dias ponte)
   * op.alertas       { 'AAAA-MM-DD': motivo } dias com aula que merecem aviso
   * op.removidos     ['AAAA-MM-DD'] dias tirados à mão pelo usuário
   *
   * Dia sem aula nunca reduz a carga: a aula passa para o próximo dia marcado.
   */
  function calcularAulas(op) {
    var marcados = {};
    (op.diasSemana || []).forEach(function (d) { marcados[d] = true; });
    var removidos = {};
    (op.removidos || []).forEach(function (d) { removidos[d] = true; });
    var bloqueios = op.bloqueios || {};
    var alertas = op.alertas || {};

    var aulas = [], pulados = [], avisos = [];
    var restante = op.minutosTotal;
    var dia = op.inicio;

    for (var i = 0; restante > 0 && i < LIMITE_DIAS; i++, dia = somarDias(dia, 1)) {
      if (!marcados[diaSemana(dia)]) continue;
      if (bloqueios[dia]) {
        pulados.push({ data: dia, motivo: bloqueios[dia], tipo: 'bloqueio' });
      } else if (removidos[dia]) {
        pulados.push({ data: dia, motivo: 'Removido manualmente', tipo: 'removido' });
      } else {
        var minutos = Math.min(op.minutosDia, restante);
        aulas.push({ data: dia, numero: aulas.length + 1, minutos: minutos });
        restante -= minutos;
        if (alertas[dia]) avisos.push({ data: dia, motivo: alertas[dia] });
      }
    }

    return {
      aulas: aulas,
      pulados: pulados,
      avisos: avisos,
      inicio: aulas.length ? aulas[0].data : null,
      fim: aulas.length ? aulas[aulas.length - 1].data : null,
      incompleto: restante > 0
    };
  }

  // Meses (ano, mes 1-12) entre duas datas, inclusive
  function mesesDoPeriodo(inicio, fim) {
    var a = partes(inicio), b = partes(fim);
    var lista = [];
    var ano = a[0], mes = a[1];
    while (ano < b[0] || (ano === b[0] && mes <= b[1])) {
      lista.push({ ano: ano, mes: mes });
      mes++;
      if (mes > 12) { mes = 1; ano++; }
    }
    return lista;
  }

  // Semanas do mês (domingo a sábado); posições fora do mês ficam null
  function gradeDoMes(ano, mes) {
    var primeiro = ano + '-' + pad(mes) + '-01';
    var totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    var celulas = [];
    for (var v = diaSemana(primeiro); v > 0; v--) celulas.push(null);
    for (var d = 1; d <= totalDias; d++) celulas.push(ano + '-' + pad(mes) + '-' + pad(d));
    while (celulas.length % 7) celulas.push(null);
    var semanas = [];
    for (var s = 0; s < celulas.length; s += 7) semanas.push(celulas.slice(s, s + 7));
    return semanas;
  }

  /* ---------- Horários ---------- */

  // '18:30' -> 1110 minutos; vazio -> null
  function minutosDeHora(hhmm) {
    if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
    var p = hhmm.split(':').map(Number);
    return p[0] * 60 + p[1];
  }

  function horaDeMinutos(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }

  // Minutos de aula entre início e fim, descontado o intervalo (se houver)
  function minutosDaJanela(h) {
    var ini = minutosDeHora(h.inicio), fim = minutosDeHora(h.fim);
    if (ini === null || fim === null || fim <= ini) return null;
    var total = fim - ini;
    var ii = minutosDeHora(h.intervaloInicio), fi = minutosDeHora(h.intervaloFim);
    if (ii !== null && fi !== null && fi > ii) total -= (fi - ii);
    return total;
  }

  // Hora de término de uma aula com 'minutos' de duração (pula o intervalo, se cruzar)
  function fimDaAula(h, minutos) {
    var ini = minutosDeHora(h.inicio);
    if (ini === null) return null;
    var fim = ini + minutos;
    var ii = minutosDeHora(h.intervaloInicio), fi = minutosDeHora(h.intervaloFim);
    if (ii !== null && fi !== null && fi > ii && ii > ini && fim > ii) fim += (fi - ii);
    return horaDeMinutos(fim);
  }

  /* ---------- Formatação ---------- */

  // 240 -> '4h'; 210 -> '3h30'
  function formatarHoras(min) {
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    return h + 'h' + (m ? pad(m) : '');
  }

  // '08:00' -> '8h'; '18:30' -> '18h30'
  function formatarHora(hhmm) {
    var min = minutosDeHora(hhmm);
    return min === null ? '' : formatarHoras(min);
  }

  function formatarHorario(h) {
    if (!h.inicio || !h.fim) return '';
    var temIntervalo = h.intervaloInicio && h.intervaloFim &&
      minutosDeHora(h.intervaloFim) > minutosDeHora(h.intervaloInicio);
    if (temIntervalo) {
      return formatarHora(h.inicio) + ' às ' + formatarHora(h.intervaloInicio) + ' e ' +
        formatarHora(h.intervaloFim) + ' às ' + formatarHora(h.fim);
    }
    return formatarHora(h.inicio) + ' às ' + formatarHora(h.fim);
  }

  // 'dd/mm/aaaa', 'dd/mm' ou 'sem dd/mm'
  function formatarData(iso, estilo) {
    var p = partes(iso);
    var curta = pad(p[2]) + '/' + pad(p[1]);
    if (estilo === 'curta') return curta;
    if (estilo === 'semana') return DIAS_CURTOS[diaSemana(iso)] + ' ' + curta;
    return curta + '/' + p[0];
  }

  function formatarPeriodo(inicio, fim) {
    if (inicio === fim) return formatarData(inicio);
    if (partes(inicio)[0] === partes(fim)[0]) return formatarData(inicio, 'curta') + ' a ' + formatarData(fim);
    return formatarData(inicio) + ' a ' + formatarData(fim);
  }

  function juntarComE(itens) {
    if (itens.length < 2) return itens.join('');
    return itens.slice(0, -1).join(', ') + ' e ' + itens[itens.length - 1];
  }

  // ['2026-10-14', '2026-10-16', '2026-11-04'] -> '14 e 16/out · 4/nov'
  function listaCompacta(datas) {
    var grupos = [];
    datas.forEach(function (iso) {
      var p = partes(iso);
      var chave = p[0] + '-' + p[1];
      var ultimo = grupos[grupos.length - 1];
      if (!ultimo || ultimo.chave !== chave) {
        ultimo = { chave: chave, mes: p[1], dias: [] };
        grupos.push(ultimo);
      }
      ultimo.dias.push(String(p[2]));
    });
    return grupos.map(function (g) {
      return juntarComE(g.dias) + '/' + MESES_CURTOS[g.mes - 1];
    }).join(' · ');
  }

  /* ---------- Arquivo .ics (agenda) ---------- */

  function escaparIcs(texto) {
    return String(texto || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;')
      .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  // Quebra linhas com mais de 75 bytes (regra do formato iCalendar)
  function dobrarLinha(linha) {
    var enc = new TextEncoder();
    var partesLinha = [], atual = '', bytes = 0;
    Array.from(linha).forEach(function (ch) {
      var b = enc.encode(ch).length;
      var limite = partesLinha.length ? 74 : 75;
      if (bytes + b > limite) {
        partesLinha.push(atual);
        atual = '';
        bytes = 0;
      }
      atual += ch;
      bytes += b;
    });
    partesLinha.push(atual);
    return partesLinha.join('\r\n ');
  }

  function carimboUtc(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  /*
   * c.curso, c.local, c.instrutor, c.horario {inicio, fim, intervaloInicio, intervaloFim}
   * aulas: resultado de calcularAulas().aulas
   */
  function gerarIcs(c, aulas, agora) {
    var stamp = carimboUtc(agora || new Date());
    var slug = String(c.curso || 'curso').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'curso';
    var linhas = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IEL Amazonas//Calendario de Cursos//PT-BR',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE', 'TZID:America/Manaus', 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
      'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0400', 'TZNAME:-04', 'END:STANDARD', 'END:VTIMEZONE'
    ];
    var temHora = minutosDeHora(c.horario.inicio) !== null;
    aulas.forEach(function (a) {
      var ymd = a.data.replace(/-/g, '');
      var descricao = ['Aula ' + a.numero + ' de ' + aulas.length + ' (' + formatarHoras(a.minutos) + ')'];
      if (c.instrutor) descricao.push('Instrutor(a): ' + c.instrutor);
      descricao.push('IEL Amazonas');
      linhas.push('BEGIN:VEVENT', 'UID:' + ymd + '-' + slug + '@calendario.iel-am', 'DTSTAMP:' + stamp);
      if (temHora) {
        linhas.push('DTSTART;TZID=America/Manaus:' + ymd + 'T' + c.horario.inicio.replace(':', '') + '00');
        linhas.push('DTEND;TZID=America/Manaus:' + ymd + 'T' + fimDaAula(c.horario, a.minutos).replace(':', '') + '00');
      } else {
        linhas.push('DTSTART;VALUE=DATE:' + ymd, 'DTEND;VALUE=DATE:' + somarDias(a.data, 1).replace(/-/g, ''));
      }
      linhas.push('SUMMARY:' + escaparIcs((c.curso || 'Curso') + ' – aula ' + a.numero + '/' + aulas.length));
      if (c.local) linhas.push('LOCATION:' + escaparIcs(c.local));
      linhas.push('DESCRIPTION:' + escaparIcs(descricao.join('\n')), 'END:VEVENT');
    });
    linhas.push('END:VCALENDAR');
    return linhas.map(dobrarLinha).join('\r\n') + '\r\n';
  }

  var api = {
    MESES: MESES, MESES_CURTOS: MESES_CURTOS, DIAS_CURTOS: DIAS_CURTOS,
    somarDias: somarDias, diaSemana: diaSemana, hoje: hoje, isoValido: isoValido,
    calcularAulas: calcularAulas, mesesDoPeriodo: mesesDoPeriodo, gradeDoMes: gradeDoMes,
    minutosDeHora: minutosDeHora, minutosDaJanela: minutosDaJanela, fimDaAula: fimDaAula,
    formatarHoras: formatarHoras, formatarHora: formatarHora, formatarHorario: formatarHorario,
    formatarData: formatarData, formatarPeriodo: formatarPeriodo, listaCompacta: listaCompacta,
    gerarIcs: gerarIcs
  };
  raiz.CalendarioIEL = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
