/* Tela do Calendário de Cursos: formulário, pré-visualização, impressão, PNG, .ics e listas de feriados. */
(function () {
  'use strict';

  const VERSAO = 'v1.0.0';
  const C = window.CalendarioIEL;
  const F = window.FeriadosIEL;
  const CHAVE_LISTAS = 'calendarioIEL.feriados.v1';
  const TIPO_ARQUIVO_LISTA = 'calendario-iel-feriados';
  const LOGO_MAX_BYTES = 2 * 1024 * 1024;
  const LOGO_TIPOS = ['image/png', 'image/jpeg', 'image/svg+xml'];
  const CAMPOS_HORARIO = ['horaInicio', 'horaFim', 'intervaloInicio', 'intervaloFim'];

  // Horários sugeridos ao escolher o turno (só preenchem se o horário estiver vazio ou for de outro turno)
  const TURNOS = {
    Matutino: { horaInicio: '08:00', horaFim: '12:00', intervaloInicio: '', intervaloFim: '' },
    Vespertino: { horaInicio: '13:00', horaFim: '17:00', intervaloInicio: '', intervaloFim: '' },
    Noturno: { horaInicio: '18:00', horaFim: '22:00', intervaloInicio: '', intervaloFim: '' },
    Integral: { horaInicio: '08:00', horaFim: '17:00', intervaloInicio: '12:00', intervaloFim: '13:00' }
  };

  const $ = (id) => document.getElementById(id);
  const form = $('form');

  const estado = {
    logoParceiro: null,   // data URL da logo enviada
    removidos: [],        // dias tirados à mão na pré-visualização (não ficam salvos)
    modo: 1,              // calendários por folha
    chDiariaManual: false
  };
  let listas = carregarListas();
  let ultimo = null;      // último cálculo válido: { dados, resultado }

  /* ---------- Utilidades ---------- */

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const numero = (v) => {
    const n = parseFloat(String(v || '').replace(',', '.'));
    return isFinite(n) ? n : null;
  };

  const dataSemana = (iso) => C.DIAS_CURTOS[C.diaSemana(iso)] + ' ' + C.formatarData(iso);

  function slug(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function baixarArquivo(href, nome) {
    const a = document.createElement('a');
    a.href = href;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function baixarTexto(conteudo, tipo, nome) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    baixarArquivo(url, nome);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // As logos levam width/height no HTML, então já têm tamanho antes de carregar (senão o PNG sai sem elas)
  function esperarImagens(raiz) {
    const imagens = Array.from(raiz.querySelectorAll('img')).map((img) =>
      img.complete ? null : new Promise((ok) => { img.onload = img.onerror = ok; }));
    const limite = new Promise((ok) => setTimeout(ok, 3000));
    return Promise.race([Promise.all(imagens), limite]);
  }

  /* ---------- Feriados e dias ponte (salvos no navegador) ---------- */

  function listasVazias() { return { alterados: {}, extras: [], pontes: [] }; }

  // Aceita só o que tem formato certo; o resto é descartado
  function normalizarListas(obj) {
    const l = listasVazias();
    if (!obj || typeof obj !== 'object') return l;
    if (obj.alterados && typeof obj.alterados === 'object') {
      Object.keys(obj.alterados).forEach((k) => {
        if (typeof obj.alterados[k] === 'boolean') l.alterados[k] = obj.alterados[k];
      });
    }
    (Array.isArray(obj.extras) ? obj.extras : []).forEach((e) => {
      if (e && C.isoValido(e.data)) {
        l.extras.push({ data: e.data, nome: String(e.nome || 'Recesso IEL').slice(0, 60), pular: e.pular !== false });
      }
    });
    (Array.isArray(obj.pontes) ? obj.pontes : []).forEach((p) => {
      if (p && C.isoValido(p.data)) l.pontes.push({ data: p.data, motivo: String(p.motivo || '').slice(0, 60) });
    });
    return l;
  }

  function carregarListas() {
    try {
      const bruto = localStorage.getItem(CHAVE_LISTAS);
      if (bruto) return normalizarListas(JSON.parse(bruto));
    } catch (e) { /* navegador sem armazenamento: segue com a lista padrão */ }
    return listasVazias();
  }

  function salvarListas() {
    try { localStorage.setItem(CHAVE_LISTAS, JSON.stringify(listas)); } catch (e) { /* idem */ }
  }

  const chaveFeriado = (f) => f.data + '|' + f.nome;

  function feriadosEfetivos(ano) {
    const base = F.feriadosDoAno(ano).map((f) => {
      const k = chaveFeriado(f);
      return Object.assign({}, f, { origem: 'base', padrao: f.pular,
        pular: k in listas.alterados ? listas.alterados[k] : f.pular });
    });
    const extras = listas.extras
      .map((e, i) => ({ data: e.data, nome: e.nome, tipo: 'recesso', pular: e.pular, origem: 'extra', indice: i }))
      .filter((e) => e.data.startsWith(ano + '-'));
    return base.concat(extras).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  }

  function bloqueiosEAlertas(anoInicial) {
    const bloqueios = {}, alertas = {};
    const juntar = (mapa, data, texto) => { mapa[data] = mapa[data] ? mapa[data] + ' / ' + texto : texto; };
    for (let ano = anoInicial; ano <= anoInicial + 3; ano++) {
      feriadosEfetivos(ano).forEach((f) => {
        if (f.pular) juntar(bloqueios, f.data, f.nome);
        else if (f.tipo === 'facultativo') juntar(alertas, f.data, f.nome + ' (ponto facultativo)');
      });
    }
    listas.pontes.forEach((p) => juntar(bloqueios, p.data, 'Dia ponte' + (p.motivo ? ': ' + p.motivo : '')));
    return { bloqueios, alertas };
  }

  /* ---------- Leitura e validação do formulário ---------- */

  function lerHorario() {
    const fd = new FormData(form);
    return {
      inicio: fd.get('horaInicio') || '', fim: fd.get('horaFim') || '',
      intervaloInicio: fd.get('intervaloInicio') || '', intervaloFim: fd.get('intervaloFim') || ''
    };
  }

  function lerDados() {
    const fd = new FormData(form);
    const txt = (n) => String(fd.get(n) || '').trim();
    return {
      curso: txt('curso'), chTotal: numero(fd.get('chTotal')), turma: txt('turma'), instrutor: txt('instrutor'),
      turno: txt('turno'), horario: lerHorario(), chDiaria: numero(fd.get('chDiaria')),
      local: txt('localOpcao') === 'outro' ? txt('localOutro') : txt('localOpcao'),
      inicio: txt('inicio'), dias: fd.getAll('dias').map(Number), observacoes: txt('observacoes')
    };
  }

  // faltando: campos ainda vazios (aparecem na pré-visualização); erros: dados que não batem
  function validar(d) {
    const faltando = [], erros = [], avisos = [];
    const minTotal = d.chTotal > 0 ? Math.round(d.chTotal * 60) : 0;
    const minDia = d.chDiaria > 0 ? Math.round(d.chDiaria * 60) : 0;
    const h = d.horario;
    const m = {
      ini: C.minutosDeHora(h.inicio), fim: C.minutosDeHora(h.fim),
      ii: C.minutosDeHora(h.intervaloInicio), fi: C.minutosDeHora(h.intervaloFim)
    };

    if (!minTotal) faltando.push('carga horária total');
    if (!minDia) faltando.push('horas por aula');
    if (!d.dias.length) faltando.push('dias de aula');
    if (!C.isoValido(d.inicio)) faltando.push('data de início');

    if (m.ini !== null && m.fim !== null && m.fim <= m.ini) erros.push('O término do horário precisa ser depois do início.');
    if ((m.ii === null) !== (m.fi === null)) avisos.push('Preencha o início e o fim do intervalo, ou deixe os dois vazios.');
    if (m.ii !== null && m.fi !== null && m.ini !== null && m.fim !== null &&
        (m.fi <= m.ii || m.ii <= m.ini || m.fi >= m.fim)) {
      erros.push('O intervalo precisa ficar dentro do horário da aula.');
    }
    const janela = C.minutosDaJanela(h);
    if (janela && minDia > janela) {
      erros.push('As horas por aula (' + C.formatarHoras(minDia) + ') passam do horário informado (' + C.formatarHoras(janela) + ').');
    }
    if (minTotal && minDia > minTotal) erros.push('As horas por aula são maiores que a carga horária total.');

    if (C.isoValido(d.inicio) && d.inicio < C.hoje()) avisos.push('A data de início já passou.');
    if (minTotal && minDia && minDia <= minTotal && minTotal % minDia) {
      const aulas = (minTotal / minDia).toFixed(2).replace('.', ',');
      avisos.push(C.formatarHoras(minTotal) + ' ÷ ' + C.formatarHoras(minDia) + ' = ' + aulas +
        ' aulas. A última aula terá ' + C.formatarHoras(minTotal % minDia) + '.');
    }
    return { faltando, erros, avisos, minTotal, minDia };
  }

  /* ---------- Atualização geral ---------- */

  function atualizar() {
    const dados = lerDados();
    const v = validar(dados);
    ultimo = null;

    if (!v.faltando.length && !v.erros.length) {
      const { bloqueios, alertas } = bloqueiosEAlertas(Number(dados.inicio.slice(0, 4)));
      const resultado = C.calcularAulas({
        inicio: dados.inicio, diasSemana: dados.dias, minutosTotal: v.minTotal, minutosDia: v.minDia,
        bloqueios, alertas, removidos: estado.removidos
      });
      if (resultado.incompleto) {
        v.erros.push('A carga horária não coube em 3 anos. Confira os dados.');
      } else {
        if (dados.dias.indexOf(C.diaSemana(dados.inicio)) === -1) {
          v.avisos.push('A data de início (' + dataSemana(dados.inicio) + ') não é dia de aula. A primeira aula fica em ' +
            dataSemana(resultado.inicio) + '.');
        }
        resultado.avisos.forEach((a) => v.avisos.push(dataSemana(a.data) + ' é ' + a.motivo +
          '. A aula foi mantida; para tirar, marque "Sem aula" em Feriados e dias ponte.'));
        ultimo = { dados, resultado, minDia: v.minDia };
      }
    }

    renderMensagens(v);
    renderPrevia(v);
    renderDetalhes();
    $('saida-fim').textContent = ultimo ? dataSemana(ultimo.resultado.fim) : '—';
    ['imprimir', 'baixar-png', 'baixar-ics'].forEach((id) => { $(id).disabled = !ultimo; });
    renderFeriados();
  }

  function renderMensagens(v) {
    $('mensagens').innerHTML =
      v.erros.map((t) => '<div class="msg erro">' + esc(t) + '</div>').join('') +
      v.avisos.map((t) => '<div class="msg aviso">' + esc(t) + '</div>').join('');
  }

  /* ---------- Cartão do calendário ---------- */

  const icone = (corpo) => '<svg class="cc-icone" viewBox="0 0 24 24" aria-hidden="true">' + corpo + '</svg>';
  const ICONES = {
    carga: icone('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>'),
    periodo: icone('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    horario: icone('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    local: icone('<path d="M12 21s-6.5-6-6.5-11.5a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/>')
  };

  function htmlMes(ano, mes, mapas, tela) {
    const cab = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((x) => '<span class="sem">' + x + '</span>').join('');
    // Feriados / dias ponte que tiraram aula neste mês, escritos embaixo do calendário
    const prefixo = ano + '-' + String(mes).padStart(2, '0') + '-';
    const notas = Object.keys(mapas.semAula).filter((iso) => iso.startsWith(prefixo)).sort()
      .map((iso) => '<p class="mes-nota"><b>' + C.formatarData(iso, 'curta') + '</b><span>' + esc(mapas.semAula[iso]) + '</span></p>').join('');
    const dias = C.gradeDoMes(ano, mes).flat().map((iso, i) => {
      if (!iso) return '<span class="dia fora"></span>';
      const cls = ['dia'];
      let titulo = '';
      if (i % 7 === 0 || i % 7 === 6) cls.push('fim-semana');
      if (mapas.aulas[iso]) {
        cls.push('aula');
        titulo = 'Aula ' + mapas.aulas[iso].numero;
      } else if (mapas.semAula[iso]) {
        cls.push('sem-aula');
        titulo = mapas.semAula[iso];
      } else if (tela && mapas.removidos[iso]) {
        cls.push('removido');
        titulo = 'Removido. Clique para restaurar.';
      }
      return '<span class="' + cls.join(' ') + '" data-data="' + iso + '"' +
        (titulo ? ' title="' + esc(titulo) + '"' : '') + '>' + Number(iso.slice(8)) + '</span>';
    }).join('');
    return '<div class="mes"><div class="mes-nome">' + C.MESES[mes - 1] + ' <span>' + ano + '</span></div>' +
      '<div class="mes-grade">' + cab + dias + '</div>' + notas + '</div>';
  }

  function htmlCartao(dados, resultado, minDia, tela) {
    const mapas = { aulas: {}, semAula: {}, removidos: {} };
    resultado.aulas.forEach((a) => { mapas.aulas[a.data] = a; });
    const semAulaLista = resultado.pulados.filter((p) => p.tipo === 'bloqueio');
    semAulaLista.forEach((p) => { mapas.semAula[p.data] = p.motivo; });
    resultado.pulados.filter((p) => p.tipo === 'removido').forEach((p) => { mapas.removidos[p.data] = true; });

    const meses = C.mesesDoPeriodo(resultado.inicio, resultado.fim);
    const layout = ultimo.layout || { cols: Math.min(meses.length, 3), cel: 6 };
    const minTotal = resultado.aulas.reduce((s, a) => s + a.minutos, 0);

    const horario = C.formatarHorario(dados.horario);
    const meta = [['carga', 'Carga horária', C.formatarHoras(minTotal)],
      ['periodo', 'Período', C.formatarPeriodo(resultado.inicio, resultado.fim)]];
    if (horario || dados.turno) meta.push(['horario', 'Horário', horario || dados.turno]);
    if (dados.local) meta.push(['local', 'Local', dados.local]);
    const metaHtml = meta.map((m) => '<div class="cc-dado">' + ICONES[m[0]] +
      '<dl><dt>' + m[1] + '</dt><dd>' + esc(m[2]) + '</dd></dl></div>').join('');

    const sub = [];
    if (dados.turma) sub.push('Turma ' + esc(dados.turma));
    if (dados.instrutor) sub.push('Instrutor(a): ' + esc(dados.instrutor));

    const ultimaAula = resultado.aulas[resultado.aulas.length - 1];
    // As datas já aparecem no calendário; aqui vão só os recados
    const info = [];
    if (resultado.aulas.length > 1 && ultimaAula.minutos !== minDia) {
      info.push('<p><b>Última aula</b> (' + C.formatarData(ultimaAula.data, 'curta') + '): ' +
        C.formatarHoras(ultimaAula.minutos) + '</p>');
    }
    if (dados.observacoes) info.push('<p class="cc-obs">' + esc(dados.observacoes) + '</p>');

    // Curso longo: cabeçalho mais enxuto para sobrar espaço aos meses
    return '<article class="cartao"><div class="cc' + (meses.length > 6 ? ' compacto' : '') + '">' +
      '<header class="cc-topo"><img class="cc-logo" src="img/logo-iel.png" width="1744" height="538" alt="IEL">' +
      (estado.logoParceiro ? '<img class="cc-logo-parceiro" src="' + estado.logoParceiro.src + '" width="' +
        estado.logoParceiro.largura + '" height="' + estado.logoParceiro.altura + '" alt="Logo do parceiro">' : '') +
      '</header>' +
      '<div class="cc-faixa"></div>' +
      '<div class="cc-cabeca"><p class="cc-rotulo">Calendário de aulas</p>' +
      '<h2 class="cc-titulo' + ((dados.curso || '').length > 26 ? ' longo' : '') + '">' +
      esc(dados.curso || 'Nome do curso') + '</h2>' +
      (sub.length ? '<p class="cc-sub">' + sub.join(' · ') + '</p>' : '') + '</div>' +
      '<div class="cc-meta">' + metaHtml + '</div>' +
      '<section class="cc-meses" style="--cols:' + layout.cols + ';--cel:' + layout.cel.toFixed(3) + 'cqw' +
      (layout.lin ? ';--lin:' + layout.lin.toFixed(3) + 'cqw' : '') + '">' +
      meses.map((m) => htmlMes(m.ano, m.mes, mapas, tela)).join('') + '</section>' +
      '<div class="cc-legenda"><span><i class="l-aula"></i>Dia de aula</span>' +
      (semAulaLista.length ? '<span><i class="l-sem"></i>Feriado / sem aula</span>' : '') + '</div>' +
      (info.length ? '<div class="cc-info">' + info.join('') + '</div>' : '') +
      '<footer class="cc-rodape">IEL Amazonas</footer>' +
      '</div></article>';
  }

  /*
   * Escolhe quantas colunas de meses usar e o tamanho do dia (em cqw) para o calendário
   * ocupar a área livre do cartão. Medido na pré-visualização e reaproveitado na impressão e no PNG
   * (todas as medidas do cartão são proporcionais à largura, então a conta vale para qualquer tamanho).
   */
  // Medidas em "células" (largura de um dia); os vãos entre meses também, para tudo encolher junto
  const ALTURA_MES = 0.75 + 0.55 + 6 / 1.25; // nome do mês + cabeçalho + 6 semanas
  const VAO_X = 0.8, VAO_Y = 0.6;            // espaço entre meses (ver .cc-meses no CSS)
  const ALTURA_NOTA = 0.5;                   // cada linha de feriado embaixo do mês
  function calcularLayout(qtdMeses, larguraCq, alturaCq, maxNotas) {
    const extra = maxNotas ? 0.2 + maxNotas * ALTURA_NOTA : 0;
    let melhor = { cols: 1, cel: 0 };
    for (let c = 1; c <= Math.min(qtdMeses, 4); c++) {
      const linhas = Math.ceil(qtdMeses / c);
      const cel = Math.min(larguraCq / (7 * c + VAO_X * (c - 1)),
        alturaCq / ((ALTURA_MES + extra) * linhas + VAO_Y * (linhas - 1)));
      if (cel > melhor.cel * 1.01) melhor = { cols: c, cel };
    }
    melhor.cel = Math.min(melhor.cel, 12);
    // Sobrando altura, as semanas ficam mais altas (até quase quadradas) para preencher a folha
    const linhas = Math.ceil(qtdMeses / melhor.cols);
    const alturaMes = (alturaCq - VAO_Y * melhor.cel * (linhas - 1)) / linhas;
    melhor.lin = Math.max(melhor.cel / 1.25, Math.min(melhor.cel * 1.05, (alturaMes - melhor.cel * (1.3 + extra)) / 6));
    return melhor;
  }

  function aplicarLayout(area, layout) {
    area.style.setProperty('--cols', layout.cols);
    area.style.setProperty('--cel', layout.cel.toFixed(3) + 'cqw');
    area.style.setProperty('--lin', layout.lin.toFixed(3) + 'cqw');
  }

  function renderPrevia(v) {
    const previa = $('previa');
    if (ultimo) {
      previa.innerHTML = htmlCartao(ultimo.dados, ultimo.resultado, ultimo.minDia, true);
      const cartao = previa.querySelector('.cartao');
      const area = previa.querySelector('.cc-meses');
      if (cartao.clientWidth) {
        const cq = 100 / cartao.clientWidth;
        const qtd = area.querySelectorAll('.mes').length;
        const maxNotas = Math.max(0, ...Array.from(area.querySelectorAll('.mes'), (m) => m.querySelectorAll('.mes-nota').length));
        const layout = calcularLayout(qtd, area.clientWidth * cq, area.clientHeight * cq, maxNotas);
        aplicarLayout(area, layout);
        // Garantia: se ainda transbordar (arredondamentos, fonte), encolhe até caber
        for (let i = 0; i < 20 && (area.scrollHeight > area.clientHeight + 1 || area.scrollWidth > area.clientWidth + 1); i++) {
          layout.cel *= 0.95;
          layout.lin *= 0.95;
          aplicarLayout(area, layout);
        }
        ultimo.layout = layout;
      }
    } else {
      const falta = v.faltando.length
        ? 'Para montar o calendário, falta preencher: ' + v.faltando.join(', ') + '.'
        : 'Corrija os itens destacados acima para montar o calendário.';
      previa.innerHTML = '<div class="vazio-previa"><p>' + esc(falta) + '</p></div>';
    }
    $('dica-clique').hidden = !ultimo;
  }

  function renderDetalhes() {
    const el = $('detalhes');
    if (!ultimo) { el.innerHTML = ''; return; }
    const r = ultimo.resultado;
    const total = r.aulas.reduce((s, a) => s + a.minutos, 0);
    let html = '<p class="resumo">' + r.aulas.length + (r.aulas.length === 1 ? ' aula' : ' aulas') + ' · ' +
      C.formatarHoras(total) + ' · de ' + dataSemana(r.inicio) + ' a ' + dataSemana(r.fim) + '</p>';
    html += '<h3>Aulas</h3><ol>' + r.aulas.map((a) =>
      '<li>' + dataSemana(a.data) + ' · ' + C.formatarHoras(a.minutos) + '</li>').join('') + '</ol>';
    if (r.pulados.length) {
      html += '<h3>Dias pulados</h3><ul>' + r.pulados.map((p) => '<li class="pulado">' + dataSemana(p.data) +
        ' – ' + esc(p.motivo) + (p.tipo === 'removido'
          ? ' <button type="button" class="botao-link" data-restaurar="' + p.data + '">restaurar</button>' : '') +
        '</li>').join('') + '</ul>';
    }
    el.innerHTML = html;
  }

  /* ---------- Tela de feriados ---------- */

  function anosDisponiveis() {
    const atual = Number(C.hoje().slice(0, 4));
    const anos = new Set([atual, atual + 1]);
    const inicio = form.elements.inicio.value;
    if (C.isoValido(inicio)) anos.add(Number(inicio.slice(0, 4)));
    if (ultimo) anos.add(Number(ultimo.resultado.fim.slice(0, 4)));
    return Array.from(anos).sort();
  }

  function renderFeriados() {
    const sel = $('ano-feriados');
    const anos = anosDisponiveis();
    const escolhido = Number(sel.value) || anos[0];
    const opcoes = anos.map((a) => '<option' + (a === escolhido ? ' selected' : '') + '>' + a + '</option>').join('');
    if (sel.innerHTML !== opcoes) sel.innerHTML = opcoes;
    const ano = Number(sel.value);

    $('tabela-feriados').tBodies[0].innerHTML = feriadosEfetivos(ano).map((f) =>
      '<tr class="' + (f.pular ? '' : 'mantido') + '">' +
      '<td><input type="checkbox" ' + (f.pular ? 'checked ' : '') +
      (f.origem === 'base' ? 'data-chave="' + esc(chaveFeriado(f)) + '" data-padrao="' + f.padrao + '"'
        : 'data-extra="' + f.indice + '"') +
      ' aria-label="Sem aula em ' + esc(f.nome) + '"></td>' +
      '<td>' + dataSemana(f.data) + '</td><td>' + esc(f.nome) + '</td><td>' + F.TIPOS[f.tipo] + '</td>' +
      '<td>' + (f.origem === 'extra'
        ? '<button type="button" class="botao-link perigo" data-remover-extra="' + f.indice + '">Excluir</button>' : '') +
      '</td></tr>').join('');

    const pontes = listas.pontes.map((p, i) => ({ p, i })).sort((a, b) => (a.p.data < b.p.data ? -1 : 1));
    $('lista-pontes').innerHTML = pontes.length
      ? pontes.map(({ p, i }) => '<li><span>' + dataSemana(p.data) + ' – ' + esc(p.motivo || 'Dia ponte') + '</span>' +
        '<button type="button" class="botao-link perigo" data-remover-ponte="' + i + '">Excluir</button></li>').join('')
      : '<li class="vazio">Nenhum dia ponte cadastrado.</li>';
  }

  function mudouLista() {
    salvarListas();
    atualizar();
  }

  /* ---------- Saídas: impressão, PNG e .ics ---------- */

  function nomeArquivo(ext) {
    return 'calendario-' + (slug(ultimo && ultimo.dados.curso) || 'curso') + '.' + ext;
  }

  // O navegador sugere o nome do PDF a partir do título da página
  const TITULO_PAGINA = document.title;
  function prepararImpressao() {
    if (!ultimo) return;
    document.title = 'Calendário de Cursos – ' + (ultimo.dados.curso || 'IEL Amazonas').replace(/[\\/:*?"<>|]/g, '-');
    const n = estado.modo;
    const cartao = htmlCartao(ultimo.dados, ultimo.resultado, ultimo.minDia, false);
    $('estilo-pagina').textContent = '@page { size: A4 ' + (n === 2 ? 'landscape' : 'portrait') + '; margin: 0; }';
    $('impressao').innerHTML = '<div class="folha folha-' + n + '">' +
      new Array(n).fill('<div class="slot">' + cartao + '</div>').join('') + '</div>';
  }

  function imprimir() {
    prepararImpressao();
    esperarImagens($('impressao')).then(() => window.print());
  }

  async function baixarPng() {
    if (!ultimo) return;
    const botao = $('baixar-png');
    const caixa = document.createElement('div');
    caixa.className = 'render-png';
    caixa.innerHTML = htmlCartao(ultimo.dados, ultimo.resultado, ultimo.minDia, false);
    document.body.appendChild(caixa);
    botao.disabled = true;
    try {
      await esperarImagens(caixa);
      const opcoes = { pixelRatio: 1, backgroundColor: '#ffffff' };
      // A 1ª renderização às vezes sai sem as imagens embutidas (limitação do html-to-image); a 2ª sai completa
      await window.htmlToImage.toPng(caixa.firstElementChild, opcoes);
      const url = await window.htmlToImage.toPng(caixa.firstElementChild, opcoes);
      baixarArquivo(url, nomeArquivo('png'));
    } catch (e) {
      console.error(e);
      alert('Não foi possível gerar a imagem. Se o sistema foi aberto direto do computador (arquivo), abra pelo endereço do site.');
    } finally {
      caixa.remove();
      botao.disabled = !ultimo;
    }
  }

  function baixarIcs() {
    if (!ultimo) return;
    const d = ultimo.dados;
    const ics = C.gerarIcs({ curso: d.curso, local: d.local, instrutor: d.instrutor, horario: d.horario },
      ultimo.resultado.aulas);
    baixarTexto(ics, 'text/calendar;charset=utf-8', nomeArquivo('ics'));
  }

  /* ---------- Eventos ---------- */

  function preencherChDiaria() {
    if (estado.chDiariaManual) return;
    const janela = C.minutosDaJanela(lerHorario());
    form.elements.chDiaria.value = janela ? String(Number((janela / 60).toFixed(2))) : '';
  }

  function atualizarAjudaChDiaria() {
    $('ajuda-chdiaria').textContent = estado.chDiariaManual
      ? 'Ajustado à mão. Apague o campo para voltar ao cálculo pelo horário.'
      : 'Calculado pelo horário. Pode ajustar à mão.';
  }

  function aplicarTurno(nome) {
    const padrao = TURNOS[nome];
    if (!padrao) return;
    const atual = {};
    CAMPOS_HORARIO.forEach((c) => { atual[c] = form.elements[c].value; });
    const vazio = CAMPOS_HORARIO.every((c) => !atual[c]);
    const deOutroTurno = Object.values(TURNOS).some((t) => CAMPOS_HORARIO.every((c) => t[c] === atual[c]));
    if (!vazio && !deOutroTurno) return; // horário digitado à mão: não sobrescreve
    CAMPOS_HORARIO.forEach((c) => { form.elements[c].value = padrao[c]; });
    preencherChDiaria();
  }

  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.closest('#bloco-feriados') || t.type === 'file') return;
    if (t.name === 'chDiaria') {
      estado.chDiariaManual = t.value !== '';
      if (!estado.chDiariaManual) preencherChDiaria();
      atualizarAjudaChDiaria();
    }
    if (CAMPOS_HORARIO.indexOf(t.name) !== -1) preencherChDiaria();
    if (t.name === 'turno') aplicarTurno(t.value);
    if (t.name === 'localOpcao') {
      $('campo-local-outro').hidden = t.value !== 'outro';
      if (t.value === 'outro') form.elements.localOutro.focus();
    }
    atualizar();
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  // Clique num dia da pré-visualização: tira ou devolve a aula
  $('previa').addEventListener('click', (e) => {
    const dia = e.target.closest('.dia[data-data]');
    if (!dia) return;
    const iso = dia.dataset.data;
    if (dia.classList.contains('aula')) estado.removidos.push(iso);
    else if (dia.classList.contains('removido')) estado.removidos = estado.removidos.filter((d) => d !== iso);
    else return;
    atualizar();
  });

  $('detalhes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-restaurar]');
    if (!b) return;
    estado.removidos = estado.removidos.filter((d) => d !== b.dataset.restaurar);
    atualizar();
  });

  document.querySelectorAll('input[name=modo]').forEach((r) => r.addEventListener('change', () => {
    estado.modo = Number(document.querySelector('input[name=modo]:checked').value);
  }));
  $('imprimir').addEventListener('click', imprimir);
  $('baixar-png').addEventListener('click', baixarPng);
  $('baixar-ics').addEventListener('click', baixarIcs);
  window.addEventListener('beforeprint', prepararImpressao); // também cobre o Ctrl+P
  window.addEventListener('afterprint', () => { document.title = TITULO_PAGINA; });

  // Logo do parceiro: lida só no navegador, sem envio
  $('logo-parceiro').addEventListener('change', (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    if (LOGO_TIPOS.indexOf(arquivo.type) === -1) { alert('Use um arquivo PNG, JPG ou SVG.'); return; }
    if (arquivo.size > LOGO_MAX_BYTES) { alert('A logo passa de 2 MB. Use uma versão menor.'); return; }
    const leitor = new FileReader();
    leitor.onload = () => {
      const img = new Image();
      img.onload = () => {
        // SVG sem tamanho próprio vem com 0; usa um formato largo padrão
        estado.logoParceiro = { src: leitor.result, largura: img.naturalWidth || 300, altura: img.naturalHeight || 100 };
        $('logo-nome').textContent = arquivo.name;
        $('logo-remover').hidden = false;
        atualizar();
      };
      img.onerror = () => alert('Não foi possível ler esta imagem.');
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
  $('logo-remover').addEventListener('click', () => {
    estado.logoParceiro = null;
    $('logo-nome').textContent = 'Nenhum arquivo';
    $('logo-remover').hidden = true;
    atualizar();
  });

  // Feriados: marcar/desmarcar, incluir e excluir recessos
  $('ano-feriados').addEventListener('change', renderFeriados);
  $('tabela-feriados').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.chave) {
      if (String(t.checked) === t.dataset.padrao) delete listas.alterados[t.dataset.chave];
      else listas.alterados[t.dataset.chave] = t.checked;
    } else if (t.dataset.extra) {
      listas.extras[Number(t.dataset.extra)].pular = t.checked;
    } else return;
    mudouLista();
  });
  $('tabela-feriados').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remover-extra]');
    if (!b) return;
    listas.extras.splice(Number(b.dataset.removerExtra), 1);
    mudouLista();
  });
  $('adicionar-feriado').addEventListener('click', () => {
    const data = $('novo-feriado-data').value;
    if (!C.isoValido(data)) { alert('Escolha a data do recesso.'); return; }
    listas.extras.push({ data, nome: $('novo-feriado-nome').value.trim() || 'Recesso IEL', pular: true });
    $('novo-feriado-data').value = '';
    $('novo-feriado-nome').value = '';
    $('ano-feriados').value = data.slice(0, 4);
    mudouLista();
  });

  // Dias ponte
  $('adicionar-ponte').addEventListener('click', () => {
    const data = $('nova-ponte-data').value;
    if (!C.isoValido(data)) { alert('Escolha a data do dia ponte.'); return; }
    const motivo = $('nova-ponte-motivo').value.trim();
    const existente = listas.pontes.find((p) => p.data === data);
    if (existente) existente.motivo = motivo;
    else listas.pontes.push({ data, motivo });
    $('nova-ponte-data').value = '';
    $('nova-ponte-motivo').value = '';
    mudouLista();
  });
  $('lista-pontes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remover-ponte]');
    if (!b) return;
    listas.pontes.splice(Number(b.dataset.removerPonte), 1);
    mudouLista();
  });

  // Exportar / importar / restaurar a lista (para todos usarem a mesma)
  $('exportar-lista').addEventListener('click', () => {
    const conteudo = Object.assign({ tipo: TIPO_ARQUIVO_LISTA, versao: 1, exportadoEm: C.hoje() }, listas);
    baixarTexto(JSON.stringify(conteudo, null, 2), 'application/json', 'feriados-dias-ponte-iel-' + C.hoje() + '.json');
  });
  $('importar-lista').addEventListener('change', (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    arquivo.text().then((texto) => {
      let obj;
      try { obj = JSON.parse(texto); } catch (err) { obj = null; }
      if (!obj || obj.tipo !== TIPO_ARQUIVO_LISTA) {
        alert('Este arquivo não é uma lista de feriados exportada por este sistema.');
        return;
      }
      if (!confirm('Substituir os feriados e dias ponte deste navegador pela lista do arquivo?')) return;
      listas = normalizarListas(obj);
      mudouLista();
    });
  });
  $('restaurar-lista').addEventListener('click', () => {
    if (!confirm('Voltar para a lista padrão? Recessos, dias ponte e alterações deste navegador serão apagados.')) return;
    listas = listasVazias();
    mudouLista();
  });

  $('versao').textContent = VERSAO;
  atualizar();
})();
