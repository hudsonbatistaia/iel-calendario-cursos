# Calendário de Cursos – IEL Amazonas

Gera o calendário de aulas de cursos livres para imprimir (PDF), mandar pelo WhatsApp (PNG) e colocar na agenda do celular (.ics).
Funciona inteiro no navegador, sem servidor, banco de dados ou login.

## Como usar

1. Preencha o curso, o horário e os dias de aula, e escolha a data de início.
2. O sistema calcula a data de término pela carga horária e pula feriados e dias ponte.
3. Para tirar uma aula específica, clique no dia na pré-visualização. A aula vai para o próximo dia marcado.
4. Escolha 1, 2 ou 4 calendários por folha e clique em **Imprimir / PDF**. Na janela de impressão, escolha "Salvar como PDF" ou a impressora.

## Feriados e dias ponte

- A lista já vem com os feriados nacionais, os do Amazonas (5/set) e os de Manaus (24/out e 8/dez). Carnaval, Quarta-feira de Cinzas e Corpus Christi vêm como ponto facultativo: a aula é mantida e aparece um aviso.
- Os recessos, os dias ponte e as alterações ficam salvos **no navegador de quem usa**. Para todos usarem a mesma lista:
  1. Uma pessoa mantém a lista oficial e clica em **Exportar lista**.
  2. As demais clicam em **Importar lista** e escolhem o arquivo.
- **Todo começo de ano**, revise os feriados fixos em `site/feriados.js`, porque decretos estaduais e municipais mudam. Os feriados móveis são calculados pela data da Páscoa.

## Estrutura

```
site/              pasta publicada no Render
  index.html       tela
  estilo.css       visual e layout de impressão (A4; 1, 2 ou 4 por folha)
  app.js           formulário, pré-visualização, PNG, .ics e listas de feriados
  calendario.js    cálculo das datas (separado da tela)
  feriados.js      feriados nacionais, AM e Manaus + cálculo da Páscoa
  img/             logos do IEL (cópias de "Imagens IEL/logo")
  vendor/          html-to-image 1.11.11 (gera o PNG)
testes/
  testes.html      abra no navegador: todos os itens devem ficar verdes
```

## Publicar no Render

1. Envie a pasta `calendario-cursos-iel` para um repositório no GitHub.
2. No Render, crie um **New → Static Site** ligado a esse repositório.
   - Build Command: deixe em branco.
   - Publish Directory: `site`
3. A cada atualização enviada ao GitHub, o Render publica a nova versão sozinho.

Mantenha sempre o mesmo endereço. As listas de feriados ficam salvas por endereço; se a URL mudar, elas "somem" (basta importar o arquivo exportado).

## Senha de acesso

A página pede uma senha antes de abrir, e o navegador lembra depois do primeiro acesso. É uma barreira simples contra quem não é da equipe; quem souber programar consegue contorná-la. O sistema não guarda dados, então não há informação exposta.

Para trocar a senha:
1. Gere o SHA-256 da nova senha. No PowerShell:
   `$b=[Text.Encoding]::UTF8.GetBytes('NOVA_SENHA'); ([Security.Cryptography.SHA256]::Create().ComputeHash($b) | % { $_.ToString('x2') }) -join ''`
2. Cole o resultado em `window.HASH_SENHA`, no `<head>` de `site/index.html`.
3. Publique. Todos precisarão digitar a nova senha no próximo acesso.

## Observações

- Abrindo o `index.html` direto do computador, tudo funciona, **menos a imagem PNG**: o navegador bloqueia a leitura da logo nesse modo. Pelo endereço do Render, funciona normalmente.
- A data de início no passado gera só um aviso, não um bloqueio.
- As unidades da lista "Local" (Distrito, Leste, Centro) ficam em `site/index.html`, no campo `localOpcao`. "Outro (digitar)" abre um campo livre.
- Ao mudar o sistema, atualize `VERSAO` no topo de `site/app.js`.
