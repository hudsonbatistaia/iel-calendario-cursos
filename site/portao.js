/* Tela de senha. Compara o SHA-256 do que foi digitado com window.HASH_SENHA (definido no index.html). */
(function () {
  'use strict';

  const CHAVE = 'calendarioIEL.acesso';
  const raiz = document.documentElement;
  const form = document.getElementById('form-senha');
  const campo = document.getElementById('senha');
  const erro = document.getElementById('senha-erro');

  async function sha256(texto) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hash = await sha256(campo.value.trim());
    if (hash !== window.HASH_SENHA) {
      erro.hidden = false;
      campo.select();
      return;
    }
    try { localStorage.setItem(CHAVE, hash); } catch (err) { /* sem armazenamento: pede de novo na próxima visita */ }
    raiz.dataset.liberado = '1';
    // A pré-visualização mede o espaço do calendário; recalcula agora que a tela apareceu
    window.dispatchEvent(new Event('resize'));
  });

  if (!raiz.dataset.liberado) campo.focus();
})();
