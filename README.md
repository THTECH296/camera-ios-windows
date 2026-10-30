# Câmera

O app Câmera do iOS 26/27 recriado para o Windows: visor ao vivo da webcam, botões em Liquid Glass, obturador, modos e galeria no mesmo visual do iPhone.

Feito com [Tauri 2](https://tauri.app) e HTML/CSS/JS puro (sem bundler).

## Recursos

- **Foto**: flash de tela (como a câmera frontal do iPhone), Live Photo (1,5 s antes e depois do clique), timer de 3 ou 10 s, proporção 4:3, 16:9 ou quadrada.
- **Vídeo**: HD 720, HD 1080 ou 4K a 24, 30 ou 60 fps, com pausa e foto durante a gravação.
- **Time-lapse**: o intervalo dobra conforme a gravação fica longa, como no iPhone.
- **Bandeja de controles**: flash, Live, exposição (régua), timer, Estilos Fotográficos com prévia ao vivo, proporção e grade.
- **Foco por toque** com quadrado amarelo, sol para ajustar a exposição e trava AE/AF (segurar o clique).
- **Zoom** 1×, 2, 3 ou pela roda do mouse.
- **Galeria** com faixa de miniaturas, Live Photos, abrir no app padrão e apagar para a Lixeira.
- Salva em `Imagens\Camera Roll` (a mesma pasta do app Câmera do Windows), com nomes no padrão do iPhone (`IMG_0001.jpg`).
- Janela sem moldura com cantos arredondados; layout deitado (trilho à direita) ou em pé (controles embaixo), conforme o formato da janela.

Atalhos: **Espaço** tira a foto, **← →** trocam o modo, **+ / −** dão zoom.

## Rodar

Requisitos: [Rust](https://rustup.rs), Node.js e o WebView2 (já vem no Windows 11).

```bash
npm install
npm run dev      # abre o app em modo de desenvolvimento
npm run build    # gera o instalador em src-tauri/target/release/bundle/nsis
```

Para ver só a interface no navegador (sem webcam entra uma cena de demonstração):

```bash
python tools/serve.py src 5350
```

## Estrutura

```
src/              interface (index.html, css/, js/)
  js/app.js       câmera, modos, captura, gravação, bandeja e ajustes
  js/gallery.js   miniatura e visualizador
  js/icons.js     ícones no traço dos SF Symbols
src-tauri/        lado nativo (Rust): rolo da câmera, protocolo midia://, permissão da webcam
```

Projeto independente, sem ligação com a Apple. iOS e iPhone são marcas da Apple Inc.
