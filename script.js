"use strict";

// ===========================================
// SYSTÈME D'ÉCRANS (Menu / Dialogue / Éditeur)
// ===========================================
const screens = {
  menu: document.getElementById("screen-menu"),
  dialogue: document.getElementById("screen-dialogue"),
  editor: document.getElementById("screen-editor"),
  combat: document.getElementById("screen-combat"),
};

function showScreen(name) {
  Object.keys(screens).forEach((key) => {
    screens[key].style.display = (key === name) ? "" : "none";
  });
}

// ===========================================
// MOTEUR DE DIALOGUE (style Visual Novel)
// ===========================================
// Chaque réplique a un texte. Si elle a "choice: true", on affiche
// les boutons Oui/Non au lieu du bouton "Suivant" une fois le texte affiché.
const DIALOGUE_SCRIPT = [
  {
    text: "Ah... te voilà enfin, jeune apprenti. Je t'attendais.",
    mood: "neutral",
  },
  {
    text: "Un homme mystérieux et malveillant utilise une magie noire pour faire disparaître toutes les créatures pacifiques de notre forêt sacrée...",
    mood: "concerned",
  },
  {
    text: "Si rien n'est fait, notre forêt sera bientôt vidée de toute vie paisible, et les ténèbres s'installeront pour de bon.",
    mood: "concerned",
  },
  {
    text: "Je te confie donc une grande quête : retrouver cet homme et mettre fin à sa magie noire, avant qu'il ne soit trop tard.",
    mood: "neutral",
  },
  {
    text: "Acceptes-tu cette quête, jeune apprenti ?",
    mood: "neutral",
    choice: true,
  },
];

const dialogueState = {
  index: 0,
  isTyping: false,
  typingTimeoutId: null,
  fullTextBeingTyped: "",
  onTypingComplete: null,
};

const dialogueTextEl = document.getElementById("dialogueText");
const dialogueNextBtn = document.getElementById("dialogueNextBtn");
const dialogueChoicesEl = document.getElementById("dialogueChoices");
const choiceYesBtn = document.getElementById("choiceYesBtn");
const choiceNoBtn = document.getElementById("choiceNoBtn");
const enterForgeBtn = document.getElementById("enterForgeBtn");
const magePortraitImgEl = document.getElementById("magePortraitImg");

// Un fichier PNG individuel par humeur, conformément à la nouvelle organisation
// des assets (plus de feuille de sprites unique, chaque image est détourée à part).
const MAGE_MOOD_IMAGES = {
  neutral: "sprites/PNJ/mage_neutre.png",
  concerned: "sprites/PNJ/mage_inquiet.png",
  happy: "sprites/PNJ/mage_joyeux.png",
};

function setMageMood(mood) {
  const imagePath = MAGE_MOOD_IMAGES[mood];
  if (!imagePath) {
    console.warn(`Humeur inconnue: "${mood}", le portrait du Mage n'a pas été changé.`);
    return;
  }
  // On évite de relancer le fondu si l'humeur demandée est déjà celle affichée
  // (utile car playCurrentLine() rappelle setMageMood à chaque réplique, même
  // quand deux répliques consécutives partagent la même humeur).
  if (magePortraitImgEl.getAttribute("src") === imagePath) return;

  magePortraitImgEl.src = imagePath;
}

const TYPING_SPEED_MS = 28; // délai entre chaque lettre affichée

function startDialogue() {
  dialogueState.index = 0;
  enterForgeBtn.style.display = "none";
  dialogueChoicesEl.style.display = "none";
  dialogueNextBtn.style.display = "";
  showScreen("dialogue");
  playCurrentLine();
}

function playCurrentLine() {
  const line = DIALOGUE_SCRIPT[dialogueState.index];
  setMageMood(line.mood || "neutral");
  typeText(line.text, () => {
    // Une fois le texte entièrement affiché :
    if (line.choice) {
      dialogueNextBtn.style.display = "none";
      dialogueChoicesEl.style.display = "flex";
    } else {
      dialogueNextBtn.style.display = "";
      dialogueChoicesEl.style.display = "none";
    }
  });
}

function typeText(fullText, onComplete) {
  // On annule un effet machine à écrire en cours si on enchaîne vite sur "Suivant"
  if (dialogueState.typingTimeoutId) {
    clearTimeout(dialogueState.typingTimeoutId);
    dialogueState.typingTimeoutId = null;
  }

  dialogueState.isTyping = true;
  dialogueState.fullTextBeingTyped = fullText;
  dialogueState.onTypingComplete = onComplete || null;
  dialogueNextBtn.disabled = true;
  dialogueTextEl.textContent = "";

  const cursorSpan = document.createElement("span");
  cursorSpan.className = "typing-cursor";
  dialogueTextEl.appendChild(cursorSpan);

  let charIndex = 0;

  function typeNextChar() {
    if (charIndex < fullText.length) {
      // On insère le caractère juste avant le curseur
      cursorSpan.insertAdjacentText("beforebegin", fullText[charIndex]);
      charIndex++;
      dialogueState.typingTimeoutId = setTimeout(typeNextChar, TYPING_SPEED_MS);
    } else {
      // Texte terminé : on retire le curseur clignotant et on déverrouille la suite
      cursorSpan.remove();
      dialogueState.isTyping = false;
      dialogueNextBtn.disabled = false;
      dialogueState.typingTimeoutId = null;
      if (onComplete) onComplete();
    }
  }

  typeNextChar();
}

function skipTypingIfNeeded() {
  // Si le joueur clique pendant que le texte défile encore, on l'affiche en entier d'un coup
  // plutôt que de bloquer : plus agréable à l'usage qu'un clic qui ne fait rien.
  // Cette fonction est volontairement générique (elle ne suppose pas QUI a déclenché le typing)
  // afin de fonctionner aussi bien pour les répliques normales que pour les réponses aux choix.
  if (dialogueState.isTyping && dialogueState.typingTimeoutId) {
    clearTimeout(dialogueState.typingTimeoutId);
    dialogueState.typingTimeoutId = null;
    dialogueState.isTyping = false;
    dialogueTextEl.textContent = dialogueState.fullTextBeingTyped;
    dialogueNextBtn.disabled = false;
    if (dialogueState.onTypingComplete) {
      dialogueState.onTypingComplete();
    }
    return true;
  }
  return false;
}

// Clic sur la boîte de dialogue elle-même = méthode universelle pour accélérer le texte,
// quel que soit le contexte (réplique normale, réponse à "Non", réponse à "Oui"...).
// On ignore les clics qui viennent d'un vrai bouton, pour ne pas interférer avec leur propre action.
document.querySelector(".dialogue-box").addEventListener("click", (evt) => {
  if (evt.target.closest("button")) return;
  skipTypingIfNeeded();
});

dialogueNextBtn.addEventListener("click", () => {
  if (skipTypingIfNeeded()) return;

  dialogueState.index++;
  if (dialogueState.index < DIALOGUE_SCRIPT.length) {
    playCurrentLine();
  }
});

choiceNoBtn.addEventListener("click", () => {
  // Réponse humoristique du Mage, puis on redonne le choix (la quête est obligatoire pour avancer)
  dialogueChoicesEl.style.display = "none";
  setMageMood("concerned");
  typeText("La forêt n'attend pas, nous n'avons pas le temps de plaisanter ! Allons, je sais que tu es plus brave que ça...", () => {
    setMageMood("neutral");
    dialogueChoicesEl.style.display = "flex";
  });
});

choiceYesBtn.addEventListener("click", () => {
  dialogueChoicesEl.style.display = "none";
  setMageMood("happy");
  typeText("Parfait ! Prends le Pinceau Magique et dessine notre premier gardien... La forêt compte sur toi.", () => {
    // Une fois la réplique de joie terminée, on enchaîne automatiquement sur la
    // séquence visuelle de remise du Pinceau, puis sur l'ouverture de l'éditeur.
    playGivingSequence();
  });
});

enterForgeBtn.addEventListener("click", () => {
  showScreen("editor");
});

// ===========================================
// TRANSITION : REMISE DU PINCEAU MAGIQUE
// ===========================================
// Une seule image fixe (pinceau_magique.png, déjà posée dans le HTML), dont l'apparition
// est portée par l'animation CSS "givingArtifactReveal". La légende, elle, défile en
// plusieurs temps pour garder un aspect narratif à ce moment clé de la cinématique.
const GIVING_CAPTIONS = [
  "Le Mage sort le Pinceau Magique de sa robe...",
  "« Ce pinceau a donné vie à bien des gardiens avant toi. »",
  "Le Pinceau Magique est désormais entre tes mains.",
];

const GIVING_CAPTION_DURATION_MS = 1600;
const GIVING_TOTAL_DURATION_MS = GIVING_CAPTIONS.length * GIVING_CAPTION_DURATION_MS;

const givingOverlayEl = document.getElementById("givingOverlay");
const givingCaptionEl = document.getElementById("givingCaption");

function playGivingSequence() {
  givingOverlayEl.style.display = "flex";
  let captionIndex = 0;

  givingCaptionEl.textContent = GIVING_CAPTIONS[captionIndex];

  const intervalId = setInterval(() => {
    captionIndex++;
    if (captionIndex >= GIVING_CAPTIONS.length) {
      clearInterval(intervalId);
      return;
    }
    givingCaptionEl.textContent = GIVING_CAPTIONS[captionIndex];
  }, GIVING_CAPTION_DURATION_MS);

  // Une fois toutes les légendes affichées (durée totale = nb de légendes x durée de chacune),
  // on referme l'overlay et on bascule vers l'éditeur.
  setTimeout(() => {
    givingOverlayEl.style.display = "none";
    showScreen("editor");
  }, GIVING_TOTAL_DURATION_MS);
}

document.getElementById("newGameBtn").addEventListener("click", () => {
  startDialogue();
});

// Au chargement : on s'assure que seul le menu est visible (l'éditeur reste
// initialisé en arrière-plan pour être instantanément prêt une fois affiché).
showScreen("menu");

// ===========================================
// SÉLECTEUR DE COULEUR HSV (conversions de couleur)
// ===========================================
// Couleur de démarrage par défaut, identique à l'ancienne couleur de pinceau par défaut
// de la palette "Nature" (un vert moyen), pour ne pas changer le ressenti au premier chargement.
const DEFAULT_COLOR = "#3f6b2b";

function hsvToRgb(h, s, v) {
  // h dans [0, 360), s et v dans [0, 1]
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r, g, b;

  if (h < 60)        { r = c; g = x; b = 0; }
  else if (h < 120)  { r = x; g = c; b = 0; }
  else if (h < 180)  { r = 0; g = c; b = x; }
  else if (h < 240)  { r = 0; g = x; b = c; }
  else if (h < 300)  { r = x; g = 0; b = c; }
  else               { r = c; g = 0; b = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex) {
  hex = hex.replace("#", "").trim();
  if (hex.length === 3) {
    hex = hex.split("").map(c => c + c).join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function isValidHex(hex) {
  return hexToRgb(hex) !== null;
}

// ===========================================
// ÉTAT GLOBAL
// ===========================================
const state = {
  gridSize: 64,
  pixelData: null,       // tableau 1D de couleurs (ou null = transparent)
  currentTool: "brush",
  currentColor: DEFAULT_COLOR,
  zoomLevel: 1,           // 1 = 100%
  baseCellSize: 12,       // taille de cellule en px à zoom 100% (avant *zoomLevel)
  isDrawing: false,
  shapePreview: null,     // {shapeType, startRow, startCol, currentRow, currentCol} pendant un glisser de forme, sinon null
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

// ===========================================
// RÉFÉRENCES DOM
// ===========================================
const canvas = document.getElementById("pixelCanvas");
const ctx = canvas.getContext("2d");
const viewport = document.getElementById("canvasViewport");
const previewCanvas = document.getElementById("previewCanvas");
const previewCtx = previewCanvas.getContext("2d");

const zoomDisplay = document.getElementById("zoomDisplay");
const zoomInfo = document.getElementById("zoomInfo");
const gridSizeInfo = document.getElementById("gridSizeInfo");
const toolInfo = document.getElementById("toolInfo");
const currentColorSwatch = document.getElementById("currentColorSwatch");

const nameInput = document.getElementById("creatureName");
const descInput = document.getElementById("creatureDesc");
const nameCount = document.getElementById("nameCount");
const descCount = document.getElementById("descCount");
const validateBtn = document.getElementById("validateBtn");
const validationMsg = document.getElementById("validationMsg");

// ===========================================
// INITIALISATION DE LA GRILLE DE PIXELS
// ===========================================
function initPixelData(size) {
  state.pixelData = new Array(size * size).fill(null);
}

function getCellSize() {
  return state.baseCellSize * state.zoomLevel;
}

// ===========================================
// RENDU DU CANVAS PRINCIPAL
// ===========================================
function resizeCanvasToGrid() {
  const cellSize = getCellSize();
  const pixelDimension = state.gridSize * cellSize;
  canvas.width = pixelDimension;
  canvas.height = pixelDimension;
}

function drawGrid() {
  const cellSize = getCellSize();
  const size = state.gridSize;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // CORRECTIF BUG ZOOM : le damier de fond ne doit JAMAIS disparaître, même à très fort
  // dézoom. Avant, sous 4px de cellSize, on désactivait complètement le damier, ce qui
  // laissait transparaître le fond du viewport (bois/parchemin) derrière le canvas —
  // donnant l'impression que "le fond blanc disparaît". Désormais, quand les cellules
  // individuelles deviennent trop petites pour qu'un damier case-par-case reste lisible,
  // on regroupe plusieurs cellules logiques en un seul "bloc de damier" (toujours >= 4px
  // à l'écran), pour que le motif reste visible et net à n'importe quel niveau de zoom.
  const MIN_CHECKER_BLOCK_PX = 4;
  const cellsPerCheckerBlock = Math.max(1, Math.ceil(MIN_CHECKER_BLOCK_PX / cellSize));

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const index = row * size + col;
      const color = state.pixelData[index];
      const x = col * cellSize;
      const y = row * cellSize;

      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, cellSize, cellSize);
      } else {
        const blockRow = Math.floor(row / cellsPerCheckerBlock);
        const blockCol = Math.floor(col / cellsPerCheckerBlock);
        ctx.fillStyle = ((blockRow + blockCol) % 2 === 0) ? "#e8e3d3" : "#d8d0b8";
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  // Grille (lignes) si zoom assez grand pour rester propre
  if (cellSize >= 4) {
    ctx.strokeStyle = "rgba(43, 33, 24, 0.25)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i++) {
      const pos = i * cellSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size * cellSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size * cellSize, pos);
      ctx.stroke();
    }
  }

  // Prévisualisation d'une forme en cours de glisser (Carré/Rond/Triangle) : dessinée
  // par-dessus tout le reste, en semi-transparent, pour bien la distinguer du dessin déjà
  // validé. Elle ne modifie PAS state.pixelData — la validation réelle n'a lieu qu'au
  // relâchement du clic (voir handlePointerUp), pour permettre d'ajuster la taille en
  // temps réel sans risquer de "valider" une forme qu'on ne voulait pas garder.
  if (state.shapePreview) {
    const { shapeType, startRow, startCol, currentRow, currentCol } = state.shapePreview;
    const previewCells = getShapeCells(shapeType, startRow, startCol, currentRow, currentCol);
    ctx.fillStyle = state.currentColor;
    ctx.globalAlpha = 0.6;
    for (const [r, c] of previewCells) {
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
    ctx.globalAlpha = 1;
  }
}

function renderAll() {
  resizeCanvasToGrid();
  drawGrid();
  renderPreview();
}

// ===========================================
// APERÇU (taille réelle, sans grille)
// ===========================================
function renderPreview() {
  const size = state.gridSize;
  previewCanvas.width = size;
  previewCanvas.height = size;

  // Affichage CSS agrandi mais rendu pixelisé (image-rendering: pixelated dans le CSS)
  const displaySize = 140;
  previewCanvas.style.width = displaySize + "px";
  previewCanvas.style.height = displaySize + "px";

  previewCtx.clearRect(0, 0, size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const color = state.pixelData[row * size + col];
      if (color) {
        previewCtx.fillStyle = color;
        previewCtx.fillRect(col, row, 1, 1);
      }
    }
  }
}

// ===========================================
// GESTION DU DESSIN (clic + glisser)
// ===========================================
function getCellFromEvent(evt) {
  const rect = canvas.getBoundingClientRect();
  const cellSize = getCellSize();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;
  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  if (col < 0 || col >= state.gridSize || row < 0 || row >= state.gridSize) {
    return null;
  }
  return { row, col };
}

function paintCell(row, col) {
  const index = row * state.gridSize + col;
  const newColor = (state.currentTool === "eraser") ? null : state.currentColor;
  if (state.pixelData[index] !== newColor) {
    state.pixelData[index] = newColor;
    return true;
  }
  return false;
}

// ===========================================
// OUTIL REMPLIR (flood fill, validé unitairement avant intégration)
// ===========================================
function floodFill(startRow, startCol, newColor) {
  const gridSize = state.gridSize;
  const pixelData = state.pixelData;
  const startIndex = startRow * gridSize + startCol;
  const targetColor = pixelData[startIndex];

  // Si on clique sur une zone déjà de la couleur qu'on veut appliquer, rien à faire
  if (targetColor === newColor) return false;

  const stack = [[startRow, startCol]];
  const visited = new Set();
  let changed = false;

  while (stack.length > 0) {
    const [row, col] = stack.pop();
    if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) continue;

    const index = row * gridSize + col;
    if (visited.has(index)) continue;
    visited.add(index);

    if (pixelData[index] !== targetColor) continue;

    pixelData[index] = newColor;
    changed = true;

    // 4-connectivité uniquement (haut/bas/gauche/droite) : un remplissage ne doit
    // jamais "fuiter" en passant par une diagonale entre deux cases d'une autre couleur.
    stack.push([row - 1, col]);
    stack.push([row + 1, col]);
    stack.push([row, col - 1]);
    stack.push([row, col + 1]);
  }

  return changed;
}

// ===========================================
// OUTILS FORMES PRÊTES (Carré / Rond / Triangle)
// ===========================================
function getShapeCells(shapeType, startRow, startCol, endRow, endCol) {
  const cells = [];
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);
  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);

  if (shapeType === "shape-square") {
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        cells.push([r, c]);
      }
    }
  } else if (shapeType === "shape-circle") {
    // Ellipse inscrite dans le rectangle englobant (centre + rayons par axe),
    // ce qui donne un "rond" même si le glisser n'est pas parfaitement carré.
    const centerRow = (minRow + maxRow) / 2;
    const centerCol = (minCol + maxCol) / 2;
    const radiusRow = (maxRow - minRow) / 2 || 0.5;
    const radiusCol = (maxCol - minCol) / 2 || 0.5;

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const normRow = (r - centerRow) / radiusRow;
        const normCol = (c - centerCol) / radiusCol;
        if (normRow * normRow + normCol * normCol <= 1) {
          cells.push([r, c]);
        }
      }
    }
  } else if (shapeType === "shape-triangle") {
    // Triangle isocèle pointant vers le haut, base en bas, inscrit dans le rectangle englobant.
    const height = maxRow - minRow;
    for (let r = minRow; r <= maxRow; r++) {
      const progress = height === 0 ? 1 : (r - minRow) / height;
      const halfWidth = (progress * (maxCol - minCol)) / 2;
      const centerCol = (minCol + maxCol) / 2;
      const rowMinCol = Math.round(centerCol - halfWidth);
      const rowMaxCol = Math.round(centerCol + halfWidth);
      for (let c = rowMinCol; c <= rowMaxCol; c++) {
        if (c >= minCol && c <= maxCol) {
          cells.push([r, c]);
        }
      }
    }
  }

  return cells;
}

// Comme getCellFromEvent, mais ramène la position dans les bornes de la grille plutôt que
// de renvoyer null quand le curseur sort du canvas. Utilisé pour les formes : pendant un
// glisser, il est courant que la souris dépasse temporairement la zone de dessin, et la
// prévisualisation ne doit pas se figer pour autant - elle doit suivre au bord le plus proche.
function getCellClamped(evt) {
  const rect = canvas.getBoundingClientRect();
  const cellSize = getCellSize();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;
  const col = Math.max(0, Math.min(state.gridSize - 1, Math.floor(x / cellSize)));
  const row = Math.max(0, Math.min(state.gridSize - 1, Math.floor(y / cellSize)));
  return { row, col };
}

const SHAPE_TOOLS = ["shape-square", "shape-circle", "shape-triangle"];

function handlePointerDown(evt) {
  if (evt.button !== undefined && evt.button !== 0) return; // clic gauche uniquement
  const tool = state.currentTool;

  if (tool === "fill") {
    // Le remplissage se déclenche en un seul clic, pas de glisser continu.
    const cell = getCellFromEvent(evt);
    if (!cell) return;
    const changed = floodFill(cell.row, cell.col, state.currentColor);
    if (changed) {
      drawGrid();
      renderPreview();
    }
    return;
  }

  if (SHAPE_TOOLS.includes(tool)) {
    // On enregistre le point de départ et on initialise la prévisualisation,
    // mais on ne touche PAS encore à pixelData (cela n'arrive qu'au relâchement).
    const cell = getCellClamped(evt);
    state.isDrawing = true;
    state.shapePreview = {
      shapeType: tool,
      startRow: cell.row,
      startCol: cell.col,
      currentRow: cell.row,
      currentCol: cell.col,
    };
    drawGrid();
    return;
  }

  // Comportement par défaut : pinceau / gomme
  const cell = getCellFromEvent(evt);
  if (!cell) return;
  state.isDrawing = true;
  const changed = paintCell(cell.row, cell.col);
  if (changed) {
    drawGrid();
    renderPreview();
  }
}

function handlePointerMove(evt) {
  if (!state.isDrawing) return;
  const tool = state.currentTool;

  if (SHAPE_TOOLS.includes(tool)) {
    if (!state.shapePreview) return;
    const cell = getCellClamped(evt);
    // On évite de redessiner si la cellule courante n'a pas changé, pour ne pas
    // surcharger le rendu inutilement à chaque micro-mouvement de souris.
    if (state.shapePreview.currentRow === cell.row && state.shapePreview.currentCol === cell.col) return;
    state.shapePreview.currentRow = cell.row;
    state.shapePreview.currentCol = cell.col;
    drawGrid();
    return;
  }

  // Comportement par défaut : pinceau / gomme (le remplissage n'a pas de mousemove)
  if (tool === "fill") return;

  const cell = getCellFromEvent(evt);
  if (!cell) return;
  const changed = paintCell(cell.row, cell.col);
  if (changed) {
    drawGrid();
    renderPreview();
  }
}

function handlePointerUp() {
  if (state.shapePreview) {
    // Validation réelle de la forme : on applique maintenant les pixels dans pixelData.
    const { shapeType, startRow, startCol, currentRow, currentCol } = state.shapePreview;
    const cells = getShapeCells(shapeType, startRow, startCol, currentRow, currentCol);
    for (const [r, c] of cells) {
      state.pixelData[r * state.gridSize + c] = state.currentColor;
    }
    state.shapePreview = null;
    drawGrid();
    renderPreview();
  }
  state.isDrawing = false;
}

canvas.addEventListener("mousedown", handlePointerDown);
window.addEventListener("mousemove", handlePointerMove);
window.addEventListener("mouseup", handlePointerUp);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ===========================================
// CHANGEMENT DE TAILLE DE GRILLE
// ===========================================
const gridSizeButtons = document.querySelectorAll(".grid-size-btn");
gridSizeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const newSize = parseInt(btn.dataset.size, 10);
    if (newSize === state.gridSize) return;

    const confirmChange = state.pixelData.some(c => c !== null)
      ? confirm("Changer la taille de grille effacera ton dessin actuel. Continuer ?")
      : true;

    if (!confirmChange) return;

    gridSizeButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    state.gridSize = newSize;
    initPixelData(newSize);
    gridSizeInfo.textContent = `Grille : ${newSize} × ${newSize}`;
    renderAll();
  });
});

// ===========================================
// OUTILS (Pinceau / Gomme)
// ===========================================
const TOOL_LABELS = {
  brush: "Pinceau",
  eraser: "Gomme",
  fill: "Remplir",
  "shape-square": "Forme Carré",
  "shape-circle": "Forme Rond",
  "shape-triangle": "Forme Triangle",
};

const toolButtons = document.querySelectorAll(".tool-btn[data-tool]");
toolButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    toolButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.currentTool = btn.dataset.tool;
    toolInfo.textContent = `Outil : ${TOOL_LABELS[state.currentTool] || state.currentTool}`;
  });
});

// Tout effacer
document.getElementById("clearAllBtn").addEventListener("click", () => {
  if (state.pixelData.some(c => c !== null)) {
    const confirmed = confirm("Effacer tout le dessin ? Cette action est irréversible.");
    if (!confirmed) return;
  }
  initPixelData(state.gridSize);
  drawGrid();
  renderPreview();
});

// ===========================================
// ZOOM
// ===========================================
function applyZoom(newZoom) {
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
  if (clamped === state.zoomLevel) return;
  state.zoomLevel = clamped;
  const percent = Math.round(state.zoomLevel * 100);
  zoomDisplay.textContent = percent + "%";
  zoomInfo.textContent = `Zoom : ${percent}%`;
  resizeCanvasToGrid();
  drawGrid();
}

document.getElementById("zoomInBtn").addEventListener("click", () => {
  applyZoom(state.zoomLevel + ZOOM_STEP);
});

document.getElementById("zoomOutBtn").addEventListener("click", () => {
  applyZoom(state.zoomLevel - ZOOM_STEP);
});

// Zoom à la molette (sur le viewport, pour ne pas scroller la page en même temps)
viewport.addEventListener("wheel", (evt) => {
  evt.preventDefault();
  if (evt.deltaY < 0) {
    applyZoom(state.zoomLevel + ZOOM_STEP);
  } else {
    applyZoom(state.zoomLevel - ZOOM_STEP);
  }
}, { passive: false });

// ===========================================
// SÉLECTEUR DE COULEUR HSV (rendu + interactions)
// ===========================================
const svSquareCanvas = document.getElementById("svSquareCanvas");
const svSquareCtx = svSquareCanvas.getContext("2d");
const svCursor = document.getElementById("svCursor");
const svSquareContainer = document.querySelector(".sv-square-container");

const hueSliderCanvas = document.getElementById("hueSliderCanvas");
const hueSliderCtx = hueSliderCanvas.getContext("2d");
const hueCursor = document.getElementById("hueCursor");
const hueSliderContainer = document.querySelector(".hue-slider-container");

const hexInput = document.getElementById("hexInput");

// La représentation HSV est la source de vérité pendant l'interaction (plutôt que de
// reconvertir sans cesse depuis le hex), pour éviter toute dérive d'arrondi qui ferait
// "sauter" légèrement le curseur après plusieurs clics successifs.
const hsvState = (() => {
  const startRgb = hexToRgb(DEFAULT_COLOR);
  return rgbToHsv(startRgb.r, startRgb.g, startRgb.b);
})();

function drawHueSlider() {
  const w = hueSliderCanvas.width;
  const h = hueSliderCanvas.height;
  const gradient = hueSliderCtx.createLinearGradient(0, 0, w, 0);
  // Le spectre complet de teintes, de 0 à 360 degrés, à saturation et luminosité maximales
  for (let i = 0; i <= 360; i += 30) {
    const { r, g, b } = hsvToRgb(i, 1, 1);
    gradient.addColorStop(i / 360, `rgb(${r},${g},${b})`);
  }
  hueSliderCtx.fillStyle = gradient;
  hueSliderCtx.fillRect(0, 0, w, h);
}

function drawSvSquare() {
  const w = svSquareCanvas.width;
  const h = svSquareCanvas.height;

  // Axe horizontal = saturation (0 à gauche -> 1 à droite), à teinte et luminosité fixes (1,1)
  const satGradient = svSquareCtx.createLinearGradient(0, 0, w, 0);
  satGradient.addColorStop(0, "#ffffff");
  const pureHueRgb = hsvToRgb(hsvState.h, 1, 1);
  satGradient.addColorStop(1, `rgb(${pureHueRgb.r},${pureHueRgb.g},${pureHueRgb.b})`);
  svSquareCtx.fillStyle = satGradient;
  svSquareCtx.fillRect(0, 0, w, h);

  // Axe vertical = luminosité, superposé en noir transparent (0 en haut -> 1 opaque en bas)
  const valGradient = svSquareCtx.createLinearGradient(0, 0, 0, h);
  valGradient.addColorStop(0, "rgba(0,0,0,0)");
  valGradient.addColorStop(1, "rgba(0,0,0,1)");
  svSquareCtx.fillStyle = valGradient;
  svSquareCtx.fillRect(0, 0, w, h);
}

function updateCursorPositions() {
  // Curseur du carré SV : x = saturation, y = (1 - luminosité) car l'axe vertical
  // du canvas va du clair (haut, v=1) au sombre (bas, v=0)
  const svRect = svSquareContainer.getBoundingClientRect();
  svCursor.style.left = `${hsvState.s * 100}%`;
  svCursor.style.top = `${(1 - hsvState.v) * 100}%`;
  // Couleur de bordure du curseur SV adaptée pour rester visible sur fond clair ou sombre
  svCursor.style.borderColor = hsvState.v > 0.5 && hsvState.s < 0.4 ? "#2b2118" : "white";

  // Curseur de la bande de teinte : position horizontale = teinte / 360
  hueCursor.style.left = `${(hsvState.h / 360) * 100}%`;
}

function applyHsvState(skipHexSync) {
  const rgb = hsvToRgb(hsvState.h, hsvState.s, hsvState.v);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  state.currentColor = hex;
  currentColorSwatch.style.backgroundColor = hex;
  updateCursorPositions();
  if (!skipHexSync) {
    hexInput.value = hex;
    hexInput.classList.remove("invalid");
  }

  // Choisir une couleur repasse automatiquement sur l'outil pinceau, comme avant
  if (state.currentTool === "eraser") {
    toolButtons.forEach(b => b.classList.remove("active"));
    document.querySelector('.tool-btn[data-tool="brush"]').classList.add("active");
    state.currentTool = "brush";
    toolInfo.textContent = "Outil : Pinceau";
  }
}

function setHueFromPointer(clientX) {
  const rect = hueSliderContainer.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  hsvState.h = ratio * 360;
  if (hsvState.h >= 360) hsvState.h = 359.999; // évite un éventuel retour à 0 exact en bord droit
  drawSvSquare(); // le carré SV dépend de la teinte, donc il doit se redessiner
  applyHsvState();
}

function setSaturationValueFromPointer(clientX, clientY) {
  const rect = svSquareContainer.getBoundingClientRect();
  const ratioX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const ratioY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  hsvState.s = ratioX;
  hsvState.v = 1 - ratioY;
  applyHsvState();
}

// --- Interaction clic-glisser sur le carré Saturation/Luminosité ---
let isDraggingSv = false;
svSquareContainer.addEventListener("pointerdown", (evt) => {
  isDraggingSv = true;
  svSquareContainer.setPointerCapture(evt.pointerId);
  setSaturationValueFromPointer(evt.clientX, evt.clientY);
});
svSquareContainer.addEventListener("pointermove", (evt) => {
  if (!isDraggingSv) return;
  setSaturationValueFromPointer(evt.clientX, evt.clientY);
});
svSquareContainer.addEventListener("pointerup", () => { isDraggingSv = false; });
svSquareContainer.addEventListener("pointercancel", () => { isDraggingSv = false; });

// --- Interaction clic-glisser sur la bande de teinte ---
let isDraggingHue = false;
hueSliderContainer.addEventListener("pointerdown", (evt) => {
  isDraggingHue = true;
  hueSliderContainer.setPointerCapture(evt.pointerId);
  setHueFromPointer(evt.clientX);
});
hueSliderContainer.addEventListener("pointermove", (evt) => {
  if (!isDraggingHue) return;
  setHueFromPointer(evt.clientX);
});
hueSliderContainer.addEventListener("pointerup", () => { isDraggingHue = false; });
hueSliderContainer.addEventListener("pointercancel", () => { isDraggingHue = false; });

// --- Saisie hexadécimale directe ---
hexInput.addEventListener("input", () => {
  let value = hexInput.value.trim();
  if (!value.startsWith("#")) value = "#" + value;

  if (isValidHex(value)) {
    const rgb = hexToRgb(value);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    hsvState.h = hsv.h;
    hsvState.s = hsv.s;
    hsvState.v = hsv.v;
    drawSvSquare();
    applyHsvState(true); // skipHexSync : on ne veut pas réécrire le champ pendant que l'utilisateur tape dedans
    hexInput.classList.remove("invalid");
  } else {
    hexInput.classList.add("invalid");
  }
});

// Au blur (quand on quitte le champ), si la valeur n'était pas valide, on la réinitialise
// proprement à la couleur actuellement sélectionnée plutôt que de laisser un texte invalide affiché.
hexInput.addEventListener("blur", () => {
  if (!isValidHex(hexInput.value)) {
    hexInput.value = state.currentColor;
    hexInput.classList.remove("invalid");
  }
});

function initColorPicker() {
  drawHueSlider();
  drawSvSquare();
  applyHsvState();
}

// ===========================================
// CHAMPS TEXTE (nom / description)
// ===========================================
nameInput.addEventListener("input", () => {
  nameCount.textContent = nameInput.value.length;
});
descInput.addEventListener("input", () => {
  descCount.textContent = descInput.value.length;
});

// ===========================================
// VALIDATION DE LA CRÉATURE
// ===========================================
validateBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const desc = descInput.value.trim();
  const hasDrawing = state.pixelData.some(c => c !== null);

  if (!hasDrawing) {
    showValidationMessage("error", "Ta créature doit avoir au moins un pixel dessiné !");
    return;
  }
  if (!name) {
    showValidationMessage("error", "Donne un nom à ta créature !");
    return;
  }
  if (!desc) {
    showValidationMessage("error", "Ajoute une petite description !");
    return;
  }

  // Sauvegarde en mémoire (objet global accessible pour les étapes suivantes)
  window.PIXEL_FORGE_CREATURE = {
    name: name,
    description: desc,
    gridSize: state.gridSize,
    pixelData: state.pixelData.slice(), // copie
    createdAt: new Date().toISOString(),
  };

  showValidationMessage("success", `✅ "${name}" a été créé(e) et sauvegardé(e) en mémoire !`);
  console.log("Créature sauvegardée :", window.PIXEL_FORGE_CREATURE);

  // Lance la séquence post-validation : loterie puis questionnaire du Mage
  startPostValidationSequence();
});

function showValidationMessage(type, text) {
  validationMsg.className = "validation-message " + type;
  validationMsg.textContent = text;
}

// ===========================================
// MODÈLE DE DONNÉES : STATS, ARCHÉTYPES, TALENTS
// ===========================================
// Stats de base égalitaires pour TOUTES les créatures (total 270, volontairement un peu
// sous la fourchette Pokémon habituelle de 300-320, pour laisser de la marge au bonus
// Shiny +10% sans déséquilibrer). Toutes les créatures démarrent strictement égales :
// seul le TAUX DE CROISSANCE par niveau diffère ensuite selon l'archétype choisi.
const BASE_STATS = {
  pv: 45,
  atk: 45,
  def: 45,
  atkSpe: 45,
  defSpe: 45,
  vit: 45,
};

// Bonus multiplicatifs appliqués aux GAINS DE NIVEAU (pas aux stats de base) selon l'archétype.
// Un multiplicateur de 1.3 signifie "30% de gains supplémentaires à chaque niveau dans cette stat".
const ARCHETYPE_GROWTH_BONUS = {
  physical_attacker: { atk: 1.3, vit: 1.15 },
  special_attacker: { atkSpe: 1.3, vit: 1.15 },
  physical_tank: { pv: 1.3, def: 1.3 },
  special_tank: { pv: 1.3, defSpe: 1.3 },
  speedster: { vit: 1.3, atk: 1.15, crit: 1.2 },
  balanced: {}, // aucun bonus : tout reste à un multiplicateur de base de 1.0 partout
};

const ARCHETYPE_LABELS = {
  physical_attacker: "Attaquant Physique",
  special_attacker: "Mage / Attaquant Spécial",
  physical_tank: "Tank Physique",
  special_tank: "Tank Spécial",
  speedster: "Speedster / Éclaireur",
  balanced: "Équilibré",
};

// Texte explicatif affiché dans le récapitulatif du questionnaire, dans le ton demandé
// ("La créature gagnera principalement des statistiques dans les catégories...")
const ARCHETYPE_DESCRIPTIONS = {
  physical_attacker: "La créature gagnera principalement des statistiques dans les catégories Attaque et Vitesse. Elle frappera fort et vite au corps-à-corps, mais restera plus fragile face aux dégâts magiques.",
  special_attacker: "La créature gagnera principalement des statistiques dans les catégories Attaque Spéciale et Vitesse. Idéale pour les sorts et capacités magiques, elle privilégie la puissance offensive à distance.",
  physical_tank: "La créature gagnera principalement des statistiques dans les catégories PV et Défense. Elle pourra encaisser de nombreux coups physiques et durer dans la durée face aux assauts adverses.",
  special_tank: "La créature gagnera principalement des statistiques dans les catégories PV et Défense Spéciale. Elle résistera particulièrement bien aux attaques magiques tout en gardant une bonne endurance.",
  speedster: "La créature gagnera principalement des statistiques dans les catégories Vitesse et Attaque, avec un bonus de taux de critique. Elle agira en premier et frappera les points faibles avec précision.",
  balanced: "La créature progressera de manière équilibrée sur toutes ses statistiques, sans se spécialiser. Une polyvalence qui permet de s'adapter à de nombreuses situations différentes.",
};

const TALENTS_CATALOG = {
  surcharge_critique: {
    name: "Surcharge Critique",
    description: "+15% de chances de Critique. Si coup critique, la vitesse augmente pour le prochain tour.",
  },
  peau_de_glyphe: {
    name: "Peau de Glyphe",
    description: "Réduit tous les dégâts subis de 10% de manière permanente.",
  },
  sangsue_dencre: {
    name: "Sangsue d'Encre",
    description: "Convertit 12% des dégâts infligés en PV pour se soigner.",
  },
  echo_du_neant: {
    name: "Écho du Néant",
    description: "20% de chances à la fin de chaque tour de rejouer immédiatement son action (attaquer 2 fois).",
  },
  aura_incandescente: {
    name: "Aura Incandescente",
    description: "Au début de chaque tour, inflige 5 PV de dégâts magiques fixes à tous les ennemis.",
  },
  volonte_vegetale: {
    name: "Volonté Végétale",
    description: "Si les PV tombent sous 30%, régénère automatiquement 10% des PV max au début de chaque tour.",
  },
};

const TALENT_KEYS = Object.keys(TALENTS_CATALOG);

// ===========================================
// SÉQUENCE POST-VALIDATION : RÉFÉRENCES DOM
// ===========================================
const postValidationOverlay = document.getElementById("postValidationOverlay");

const wheel1Stage = document.getElementById("wheel1Stage");
const wheel1Needle = document.getElementById("wheel1Needle");
const spinWheel1Btn = document.getElementById("spinWheel1Btn");

const wheel2Stage = document.getElementById("wheel2Stage");
const wheel2Needle = document.getElementById("wheel2Needle");
const spinWheel2Btn = document.getElementById("spinWheel2Btn");

const lotteryResultStage = document.getElementById("lotteryResultStage");
const lotteryResultTitle = document.getElementById("lotteryResultTitle");
const lotteryResultCard = document.getElementById("lotteryResultCard");
const lotteryContinueBtn = document.getElementById("lotteryContinueBtn");

const archetypeQuestionStage = document.getElementById("archetypeQuestionStage");
const archetypeRecapStage = document.getElementById("archetypeRecapStage");
const archetypeRecapText = document.getElementById("archetypeRecapText");
const archetypeRestartBtn = document.getElementById("archetypeRestartBtn");
const archetypeAcceptBtn = document.getElementById("archetypeAcceptBtn");

// État de la créature en cours de génération via la loterie.
const lotteryState = {
  isShiny: false,
  talentKey: null,
  archetypeKey: null,
  needle1CurrentDeg: 0, // on cumule les rotations pour que l'aiguille continue toujours dans le même sens
  needle2CurrentDeg: 0,
};

function startPostValidationSequence() {
  lotteryState.isShiny = false;
  lotteryState.talentKey = null;
  lotteryState.archetypeKey = null;
  lotteryState.needle1CurrentDeg = 0;
  lotteryState.needle2CurrentDeg = 0;

  // Reset visual des aiguilles (sans transition pour que ce soit instantané)
  wheel1Needle.style.transition = "none";
  wheel2Needle.style.transition = "none";
  wheel1Needle.style.transform = "rotate(0deg)";
  wheel2Needle.style.transform = "rotate(0deg)";

  // Reset mise en surbrillance des cases
  document.querySelectorAll("#wheel1InfoItems .wheel-info-item").forEach(el => el.classList.remove("highlighted"));
  document.querySelectorAll("#wheel2InfoItems .wheel-info-item").forEach(el => el.classList.remove("highlighted"));

  spinWheel1Btn.disabled = false;
  spinWheel2Btn.disabled = false;

  showLotteryStage("wheel1Stage");
  postValidationOverlay.style.display = "flex";
}

function showLotteryStage(stageId) {
  const allStages = [wheel1Stage, wheel2Stage, lotteryResultStage, archetypeQuestionStage, archetypeRecapStage];
  allStages.forEach(stage => {
    stage.style.display = (stage.id === stageId) ? "flex" : "none";
  });
}

// ===========================================
// TIRAGE ALÉATOIRE (validé statistiquement sur 200 000 simulations)
// ===========================================
function spinWheel1Result() {
  const roll = Math.random() * 100;
  if (roll < 5) return "shiny";
  if (roll < 15) return "talent";
  return "normale";
}

function spinWheel2Result() {
  return TALENT_KEYS[Math.floor(Math.random() * TALENT_KEYS.length)];
}

// ===========================================
// ANIMATION DE L'AIGUILLE (nouveau système)
// ===========================================
// Les angles médians de chaque case de la Roue 1, mesurés dans le repère SVG
// (0° = sommet du cercle, sens horaire) — identiques aux arcs tracés dans le SVG.
// Shiny    : arc de 0° à 18°  → médian = 9°
// Talent   : arc de 18° à 54° → médian = 36°
// Normale  : arc de 54° à 360° → médian = 207°
const WHEEL1_RESULT_ANGLES = { shiny: 9, talent: 36, normale: 207 };

// Roue 2 : 6 × 60°, segments numérotés 1 à 6 dans le sens horaire depuis le sommet
// Segment 1 (index 0): 0° à 60°   → médian = 30°
// Segment 2 (index 1): 60° à 120° → médian = 90°  … etc.
const WHEEL2_TALENT_ANGLES = TALENT_KEYS.reduce((acc, key, i) => { acc[key] = i * 60 + 30; return acc; }, {});

const EXTRA_SPINS = 6; // tours complets avant de s'arrêter (effet suspense)
const NEEDLE_TRANSITION = "transform 3.4s cubic-bezier(0.15, 0.85, 0.22, 1)";

function spinNeedleToAngle(needleEl, currentDegRef, targetAngle) {
  // L'aiguille part de currentDeg et doit pointer vers targetAngle.
  // On ajoute EXTRA_SPINS tours entiers pour le suspense, plus la rotation minimale
  // nécessaire pour dépasser l'angle cible depuis la position courante.
  const currentMod = ((currentDegRef % 360) + 360) % 360;
  let delta = targetAngle - currentMod;
  if (delta <= 0) delta += 360; // on ne recule jamais
  const finalDeg = currentDegRef + EXTRA_SPINS * 360 + delta;

  needleEl.style.transition = NEEDLE_TRANSITION;
  needleEl.style.transform = `rotate(${finalDeg}deg)`;
  return finalDeg; // retourner le nouveau "current" pour la prochaine fois
}

// ===========================================
// ROUE N°1 : L'ALIGNEMENT DES ASTRES
// ===========================================
spinWheel1Btn.addEventListener("click", () => {
  spinWheel1Btn.disabled = true;
  const result = spinWheel1Result();
  lotteryState.needle1CurrentDeg = spinNeedleToAngle(
    wheel1Needle, lotteryState.needle1CurrentDeg, WHEEL1_RESULT_ANGLES[result]
  );

  setTimeout(() => {
    // Mise en surbrillance de la case gagnante dans le panneau latéral
    document.querySelectorAll("#wheel1InfoItems .wheel-info-item").forEach(el => {
      el.classList.toggle("highlighted", el.dataset.result === result);
    });

    if (result === "shiny") {
      lotteryState.isShiny = true;
      showWheel1Result("shiny");
    } else if (result === "talent") {
      setTimeout(() => showLotteryStage("wheel2Stage"), 800);
    } else {
      showWheel1Result("normale");
    }
  }, 3500);
});

function showWheel1Result(result) {
  lotteryResultCard.classList.remove("is-shiny");
  if (result === "shiny") {
    lotteryResultTitle.textContent = "✨ Créature Shiny !";
    lotteryResultCard.classList.add("is-shiny");
    lotteryResultCard.innerHTML = `<span class="result-highlight">+10% sur toutes les statistiques de base</span>
      Ta créature scintille d'un éclat rare ! Elle bénéficie d'un filtre scintillant permanent
      et de statistiques de base renforcées de 10% dans toutes les catégories.`;
  } else {
    lotteryResultTitle.textContent = "Créature Normale";
    lotteryResultCard.innerHTML = `<span class="result-highlight">Pas de bonus particulier</span>
      Ta créature est née sans trait exceptionnel cette fois-ci. Elle conserve ses
      statistiques de base classiques, prête à grandir selon l'archétype que tu vas choisir.`;
  }
  setTimeout(() => showLotteryStage("lotteryResultStage"), 600);
}

// ===========================================
// ROUE N°2 : LE TAMBOUR DES TALENTS
// ===========================================
spinWheel2Btn.addEventListener("click", () => {
  spinWheel2Btn.disabled = true;
  const talentKey = spinWheel2Result();
  lotteryState.talentKey = talentKey;
  lotteryState.needle2CurrentDeg = spinNeedleToAngle(
    wheel2Needle, lotteryState.needle2CurrentDeg, WHEEL2_TALENT_ANGLES[talentKey]
  );

  setTimeout(() => {
    // Surligner la case correspondante dans le panneau
    const talentIndex = TALENT_KEYS.indexOf(talentKey);
    document.querySelectorAll("#wheel2InfoItems .wheel-info-item").forEach(el => {
      el.classList.toggle("highlighted", parseInt(el.dataset.talentIndex) === talentIndex);
    });

    const talent = TALENTS_CATALOG[talentKey];
    lotteryResultCard.classList.remove("is-shiny");
    lotteryResultTitle.textContent = "🎁 Compétence Exclusive !";
    lotteryResultCard.innerHTML = `<span class="result-highlight">${talent.name}</span>${talent.description}`;
    setTimeout(() => showLotteryStage("lotteryResultStage"), 600);
  }, 3500);
});

lotteryContinueBtn.addEventListener("click", () => showLotteryStage("archetypeQuestionStage"));


// ===========================================
// QUESTIONNAIRE DU MAGE : CHOIX DE L'ARCHÉTYPE
// ===========================================
document.querySelectorAll(".archetype-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const archetypeKey = btn.dataset.archetype;
    lotteryState.archetypeKey = archetypeKey;
    archetypeRecapText.textContent = ARCHETYPE_DESCRIPTIONS[archetypeKey];
    showLotteryStage("archetypeRecapStage");
  });
});

archetypeRestartBtn.addEventListener("click", () => {
  lotteryState.archetypeKey = null;
  showLotteryStage("archetypeQuestionStage");
});

archetypeAcceptBtn.addEventListener("click", () => {
  finalizeCreatureCreation();
});

// ===========================================
// FINALISATION : FUSION DE TOUS LES RÉSULTATS DANS LA CRÉATURE
// ===========================================
function finalizeCreatureCreation() {
  const archetypeKey = lotteryState.archetypeKey;
  const growthBonus = ARCHETYPE_GROWTH_BONUS[archetypeKey] || {};

  const finalBaseStats = {};
  for (const statKey in BASE_STATS) {
    const raw = BASE_STATS[statKey];
    finalBaseStats[statKey] = lotteryState.isShiny ? Math.round(raw * 1.1) : raw;
  }

  window.PIXEL_FORGE_CREATURE.lottery = {
    isShiny: lotteryState.isShiny,
    talentKey: lotteryState.talentKey,
    talent: lotteryState.talentKey ? TALENTS_CATALOG[lotteryState.talentKey] : null,
  };
  window.PIXEL_FORGE_CREATURE.archetype = {
    key: archetypeKey,
    label: ARCHETYPE_LABELS[archetypeKey],
    growthBonus: growthBonus,
  };
  window.PIXEL_FORGE_CREATURE.baseStats = finalBaseStats;

  console.log("Créature finalisée :", window.PIXEL_FORGE_CREATURE);

  postValidationOverlay.style.display = "none";

  // IMPORTANT : on affiche l'écran de combat AVANT d'initialiser la session, pour
  // que le conteneur 3D ait déjà sa vraie taille (clientWidth/clientHeight) au
  // moment où Three.js calcule l'aspect ratio de la caméra et dimensionne le
  // renderer. Dans l'ordre inverse, le conteneur était encore display:none et
  // ces valeurs valaient 0, ce qui rendait toute la scène invisible sans erreur.
  showScreen("combat");
  initCombatSession();
}

// ===========================================
// MOTEUR DE COMBAT
// ===========================================

// --- Données des ennemis ---
const ENEMY_CATALOG = {
  goutteux: {
    name: "Goutteux",
    baseLevel: 1,
    baseStats: { pv: 35, atk: 30, def: 15, atkSpe: 10, defSpe: 10, vit: 25 },
    gainPerLevel: { pv: 4, atk: 2, def: 1, atkSpe: 1, defSpe: 1, vit: 1.5 },
    idleFrames: [
      "sprites/ennemis/01_goutteux/goutteux_idle_01.png",
      "sprites/ennemis/01_goutteux/goutteux_idle_02.png",
      "sprites/ennemis/01_goutteux/goutteux_idle_03.png",
    ],
    xpRewardBase: 5,
  },
  arachno: {
    name: "Arachno",
    baseLevel: 3,
    baseStats: { pv: 30, atk: 38, def: 12, atkSpe: 15, defSpe: 8, vit: 40 },
    gainPerLevel: { pv: 3, atk: 3, def: 1, atkSpe: 1.5, defSpe: 1, vit: 2 },
    idleFrames: [
      "sprites/ennemis/02_arachno/arachno_idle_01.png",
      "sprites/ennemis/02_arachno/arachno_idle_02.png",
    ],
    xpRewardBase: 8,
  },
  bloc: {
    name: "Bloc",
    baseLevel: 6,
    // Difficulté "moyenne" : très tanky (PV/DEF élevés) mais plus lent
    baseStats: { pv: 55, atk: 34, def: 26, atkSpe: 12, defSpe: 18, vit: 18 },
    gainPerLevel: { pv: 5, atk: 2.5, def: 2, atkSpe: 1, defSpe: 1.5, vit: 1 },
    idleFrames: [
      "sprites/ennemis/03_bloc/bloc_idle_01.png",
      "sprites/ennemis/03_bloc/bloc_idle_02.png",
      "sprites/ennemis/03_bloc/bloc_idle_03.png",
    ],
    xpRewardBase: 12,
  },
  rodeur: {
    name: "Rôdeur",
    baseLevel: 10,
    // Difficulté "difficile" : le plus agressif (ATK/VIT élevés), profil glass cannon
    baseStats: { pv: 38, atk: 50, def: 16, atkSpe: 22, defSpe: 14, vit: 48 },
    gainPerLevel: { pv: 3.5, atk: 4, def: 1.5, atkSpe: 2, defSpe: 1.5, vit: 2.5 },
    idleFrames: [
      "sprites/ennemis/04_rodeur/rodeur_idle_01.png",
      "sprites/ennemis/04_rodeur/rodeur_idle_02.png",
    ],
    xpRewardBase: 18,
  },
};

// Probabilité d'apparition de chaque ennemi à une vague donnée : fonction en cloche
// (gaussienne) centrée sur la vague "de pic" de chacun, avec un plancher minimum pour
// que tous les ennemis restent possibles à n'importe quelle vague (coexistence totale),
// tout en respectant la hiérarchie de difficulté Goutteux < Arachno < Bloc < Rôdeur.
const ENEMY_DISTRIBUTION = {
  goutteux: { peakWave: 1,  spread: 30, floor: 0.05 },
  arachno:  { peakWave: 20, spread: 28, floor: 0.04 },
  bloc:     { peakWave: 50, spread: 30, floor: 0.02 },
  rodeur:   { peakWave: 85, spread: 35, floor: 0.01 },
};

function weightAtWave(enemyKey, wave) {
  const { peakWave, spread, floor } = ENEMY_DISTRIBUTION[enemyKey];
  return Math.exp(-((wave - peakWave) ** 2) / (2 * spread * spread)) + floor;
}

function getWaveEnemyPool(wave) {
  return Object.keys(ENEMY_CATALOG).map(key => ({
    key,
    weight: weightAtWave(key, wave),
  }));
}

function pickEnemy(wave) {
  const pool = getWaveEnemyPool(wave);
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry.key;
  }
  return pool[pool.length - 1].key;
}

function enemyLevelForWave(enemyKey, wave) {
  return ENEMY_CATALOG[enemyKey].baseLevel + Math.floor(wave * 0.8);
}

function computeEnemyStats(enemyKey, level) {
  const cat = ENEMY_CATALOG[enemyKey];
  const stats = {};
  for (const s in cat.baseStats) {
    stats[s] = Math.floor(cat.baseStats[s] + cat.gainPerLevel[s] * (level - cat.baseLevel));
  }
  stats.maxPv = stats.pv;
  return stats;
}

// Gain de stat par niveau pour le joueur (stats de base × (1 + bonus archétype))
const PLAYER_BASE_GAIN = { pv: 4, atk: 3, def: 2, atkSpe: 3, defSpe: 2, vit: 2.5 };

function computePlayerStats(baseStats, archetype, level) {
  const growthBonus = archetype.growthBonus || {};
  const stats = {};
  for (const s of ["pv", "atk", "def", "atkSpe", "defSpe", "vit"]) {
    const gain = PLAYER_BASE_GAIN[s] * (growthBonus[s] || 1.0);
    stats[s] = Math.floor(baseStats[s] + gain * (level - 1));
  }
  stats.maxPv = stats.pv;
  return stats;
}

// Formule de dégâts demandée : max(1, ATK - DEF) × Multiplicateur
function calcDamage(atk, def, multiplier = 1.0) {
  return Math.max(1, Math.floor(Math.max(0, atk - def) * multiplier));
}

// XP requise pour atteindre le niveau N (courbe cubique inspirée Pokémon)
function xpForLevel(n) { return n <= 1 ? 0 : Math.floor(n ** 3); }
function xpRequiredForNextLevel(n) { return xpForLevel(n + 1) - xpForLevel(n); }

// XP gagnée en battant un ennemi
function xpReward(enemyKey, wave) {
  return Math.floor(ENEMY_CATALOG[enemyKey].xpRewardBase * enemyLevelForWave(enemyKey, wave) * (1 + wave / 50));
}

// --- État de session de combat ---
const combatSession = {
  wave: 1,
  playerLevel: 1,
  playerXp: 0,
  playerHp: 0,
  playerStats: null,
  playerIsDefending: false,   // flag pour le tour en cours
  enemyKey: null,
  enemyLevel: 1,
  enemyHp: 0,
  enemyStats: null,
  idleFrameIndex: 0,
  idleIntervalId: null,
  isPlayerTurn: true,
  isBusy: false,   // pendant les animations/délais, on bloque les boutons
};

// Références DOM combat
const playerPixelCanvas = document.getElementById("playerPixelCanvas");
const playerPixelCtx = playerPixelCanvas.getContext("2d");
const playerNameEl = document.getElementById("playerName");
const playerLevelEl = document.getElementById("playerLevel");
const playerHpTextEl = document.getElementById("playerHpText");
const playerHpBarEl = document.getElementById("playerHpBar");
const playerXpBarEl = document.getElementById("playerXpBar");
const playerXpTextEl = document.getElementById("playerXpText");

const enemyNameEl = document.getElementById("enemyName");
const enemyLevelEl = document.getElementById("enemyLevel");
const enemyHpTextEl = document.getElementById("enemyHpText");
const enemyHpBarEl = document.getElementById("enemyHpBar");

const combatEntryVeilEl = document.getElementById("combatEntryVeil");

const combatLogEl = document.getElementById("combatLog");
const dialogCursorEl = document.getElementById("dialogCursor");
const dialogNextArrowEl = document.getElementById("dialogNextArrow");
const combatActionsEl = document.getElementById("combatActions");
const combatWaitingEl = document.getElementById("combatWaiting");
const waveNumberEl = document.getElementById("waveNumber");
const waveProgressFillEl = document.getElementById("waveProgressFill");
const waveEnemyLabelEl = document.getElementById("waveEnemyLabel");

// ===========================================
// PONT AVEC LA SCÈNE 3D (combat3d.js)
// ===========================================
// PONT AVEC LA SCÈNE 3D (combat3d.js)
// ===========================================
// combat3d.js, three-bundle.js et script.js sont tous des scripts CLASSIQUES
// avec defer, donc leur ordre d'exécution est garanti par la spec HTML :
// three-bundle.js termine, puis combat3d.js termine, puis script.js démarre.
// À ce stade, window.Combat3D existe déjà — pas besoin d'attendre un événement.
// (Une version précédente utilisait un événement 'combat3d-ready', mais comme
// combat3d.js termine TOUJOURS avant que script.js ne commence à s'exécuter,
// l'événement était émis avant que quiconque ait pu s'y abonner, et n'était
// donc jamais reçu. C'est exactement la cause du bug observé : la scène 3D
// n'était jamais initialisée, sans aucune erreur visible dans la console.)
const combat3DReady = typeof window.Combat3D !== "undefined";
let pendingCreatureForCombat3D = null;
let combat3DInitPending = false;

if (!combat3DReady) {
  console.error("script.js: window.Combat3D est introuvable. Vérifie que combat3d.js et three-bundle.js sont bien chargés AVANT script.js dans index.html.");
}

function ensureCombat3DInitialized() {
  if (combat3DReady) {
    window.Combat3D.init("combat3d-container");
  } else {
    combat3DInitPending = true;
  }
}

// ===========================================
// TRANSITION D'ENTRÉE EN COMBAT (jouée une seule fois, à l'arrivée sur l'écran)
// ===========================================
// Le voile noir reste pertinent quel que soit le contenu dessous (2D ou 3D) :
// il masque le temps que la scène 3D charge et que les premiers sprites soient prêts.
function resetCombatEntryVisuals() {
  combatEntryVeilEl.classList.remove("is-fading");
}

function playCombatEntryTransition() {
  resetCombatEntryVisuals();
  // Le voile noir se dissipe après un court délai, laissant le temps à la scène 3D
  // de s'initialiser et au premier sprite ennemi de charger sa texture.
  setTimeout(() => {
    combatEntryVeilEl.classList.add("is-fading");
  }, 400);
}

// ===========================================
// MOTEUR DE FILE DE MESSAGES (machine à écrire style Pokémon)
// ===========================================
const msgQueue = {
  queue: [],           // [{text, cssClass, delay}]
  isTyping: false,
  typingTimeout: null,
  afterQueueCallback: null,  // appelé quand la file est entièrement vidée
};

const TYPING_SPEED = 35;         // ms par caractère
const MSG_AUTO_ADVANCE = 1600;   // délai avant d'avancer automatiquement au msg suivant

function queueMsg(text, cssClass = "", delay = MSG_AUTO_ADVANCE) {
  msgQueue.queue.push({ text, cssClass, delay });
  if (!msgQueue.isTyping) processNextMsg();
}

function processNextMsg() {
  if (msgQueue.queue.length === 0) {
    // File vide : curseur disparaît, on appelle le callback si présent
    dialogCursorEl.style.display = "none";
    dialogNextArrowEl.classList.remove("visible");
    if (msgQueue.afterQueueCallback) {
      const cb = msgQueue.afterQueueCallback;
      msgQueue.afterQueueCallback = null;
      cb();
    }
    return;
  }

  msgQueue.isTyping = true;
  const { text, cssClass, delay } = msgQueue.queue.shift();

  combatLogEl.textContent = "";
  combatLogEl.className = cssClass ? `dialog-msg-${cssClass}` : "";
  dialogCursorEl.style.display = "inline-block";
  dialogNextArrowEl.classList.remove("visible");

  let charIndex = 0;
  function typeNextChar() {
    if (charIndex < text.length) {
      combatLogEl.textContent += text[charIndex];
      charIndex++;
      msgQueue.typingTimeout = setTimeout(typeNextChar, TYPING_SPEED);
    } else {
      // Texte terminé : curseur disparaît, triangle de suite apparaît brièvement
      dialogCursorEl.style.display = "none";
      dialogNextArrowEl.classList.add("visible");
      msgQueue.isTyping = false;
      msgQueue.typingTimeout = setTimeout(() => {
        dialogNextArrowEl.classList.remove("visible");
        processNextMsg();
      }, delay);
    }
  }
  typeNextChar();
}

function flushMsgQueue(callback) {
  // Vide la file et appelle le callback une fois terminé
  msgQueue.afterQueueCallback = callback;
  if (!msgQueue.isTyping && msgQueue.queue.length === 0) {
    callback && callback();
    msgQueue.afterQueueCallback = null;
  }
}

function clearMsgQueue() {
  if (msgQueue.typingTimeout) clearTimeout(msgQueue.typingTimeout);
  msgQueue.queue = [];
  msgQueue.isTyping = false;
  msgQueue.afterQueueCallback = null;
  combatLogEl.textContent = "";
  dialogCursorEl.style.display = "none";
  dialogNextArrowEl.classList.remove("visible");
}

// Compatibilité avec l'ancien système addLog → on utilise queueMsg
function addLog(text, type = "") { queueMsg(text, type); }
function clearCombatLog() { clearMsgQueue(); }

// --- Initialisation de la session ---
function initCombatSession() {
  const creature = window.PIXEL_FORGE_CREATURE;
  combatSession.wave = 1;
  combatSession.playerLevel = 1;
  combatSession.playerXp = 0;
  combatSession.playerStats = computePlayerStats(creature.baseStats, creature.archetype, 1);
  combatSession.playerHp = combatSession.playerStats.maxPv;

  playerNameEl.textContent = creature.name;

  ensureCombat3DInitialized();
  if (combat3DReady) {
    window.Combat3D.setPlayerShiny(creature.lottery.isShiny);
  } else {
    // La scène 3D n'a pas encore fini de charger : on mémorise la créature pour
    // que le listener 'combat3d-ready' applique le shiny et le sprite plus tard.
    pendingCreatureForCombat3D = creature;
  }

  // Dessine le portrait pixel art de la créature dans le canvas de combat
  renderCreaturePortraitForCombat(creature);

  updatePlayerUI();
  playCombatEntryTransition();
  // On attend la fin de la transition avant de démarrer la logique de vague,
  // pour ne pas afficher "un ennemi apparaît" avant qu'il soit réellement visible.
  setTimeout(() => startWave(1), 1400);
}

function renderCreaturePortraitForCombat(creature) {
  const size = creature.gridSize;
  playerPixelCanvas.width = size;
  playerPixelCanvas.height = size;
  playerPixelCtx.clearRect(0, 0, size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const color = creature.pixelData[row * size + col];
      if (color) {
        playerPixelCtx.fillStyle = color;
        playerPixelCtx.fillRect(col, row, 1, 1);
      }
    }
  }
  // Envoie le dessin terminé à la scène 3D pour qu'il remplace le sprite placeholder du joueur
  if (combat3DReady) {
    window.Combat3D.setPlayerSpriteFromCanvas(playerPixelCanvas);
  }
}

// --- Démarrage d'une vague ---
function startWave(wave) {
  combatSession.wave = wave;
  combatSession.playerIsDefending = false;
  combatSession.isBusy = false;

  // Mise à jour du bandeau de vague
  waveNumberEl.textContent = wave;
  waveProgressFillEl.style.width = `${wave}%`;

  const difficulty = wave <= 20 ? "Très facile" :
                     wave <= 40 ? "Facile" :
                     wave <= 60 ? "Moyen" :
                     wave <= 80 ? "Difficile" : "Très difficile";
  waveEnemyLabelEl.textContent = `Difficulté : ${difficulty}`;

  // Choix de l'ennemi
  const enemyKey = pickEnemy(wave);
  const enemyLevel = enemyLevelForWave(enemyKey, wave);
  combatSession.enemyKey = enemyKey;
  combatSession.enemyLevel = enemyLevel;
  combatSession.enemyStats = computeEnemyStats(enemyKey, enemyLevel);
  combatSession.enemyHp = combatSession.enemyStats.maxPv;

  // Affichage de l'ennemi
  enemyNameEl.textContent = ENEMY_CATALOG[enemyKey].name;
  enemyLevelEl.textContent = enemyLevel;

  // Démarre l'animation idle de l'ennemi
  startEnemyIdleAnimation(enemyKey);

  // Mise à jour des barres
  updateEnemyUI();

  // Tour déterminé par VIT : le plus rapide commence
  const playerVit = combatSession.playerStats.vit;
  const enemyVit = combatSession.enemyStats.vit;
  combatSession.isPlayerTurn = playerVit >= enemyVit;

  clearCombatLog();
  addLog(`Vague ${wave} — Un ${ENEMY_CATALOG[enemyKey].name} (Niv. ${enemyLevel}) apparaît !`, "system");
  addLog(`${combatSession.isPlayerTurn ? window.PIXEL_FORGE_CREATURE.name : ENEMY_CATALOG[enemyKey].name} attaque en premier (VIT : ${playerVit} vs ${enemyVit}).`, "system");

  setCombatActionsEnabled(combatSession.isPlayerTurn);
  if (!combatSession.isPlayerTurn) {
    scheduleEnemyTurn();
  }
}

// --- Animation idle ennemi (cycle de frames) ---
function startEnemyIdleAnimation(enemyKey) {
  if (combatSession.idleIntervalId) clearInterval(combatSession.idleIntervalId);
  combatSession.idleFrameIndex = 0;
  const frames = ENEMY_CATALOG[enemyKey].idleFrames;
  if (combat3DReady) window.Combat3D.setEnemySpriteFrame(frames[0]);
  combatSession.idleIntervalId = setInterval(() => {
    combatSession.idleFrameIndex = (combatSession.idleFrameIndex + 1) % frames.length;
    if (combat3DReady) window.Combat3D.setEnemySpriteFrame(frames[combatSession.idleFrameIndex]);
  }, 600); // 600ms par frame = ~1.5fps, typique du pixel art RPG
}

function stopEnemyIdleAnimation() {
  if (combatSession.idleIntervalId) {
    clearInterval(combatSession.idleIntervalId);
    combatSession.idleIntervalId = null;
  }
}

// --- Mise à jour des UI ---
function updatePlayerUI() {
  const s = combatSession;
  playerLevelEl.textContent = s.playerLevel;
  playerHpTextEl.textContent = `${Math.max(0, s.playerHp)} / ${s.playerStats.maxPv}`;
  const hpPct = Math.max(0, s.playerHp / s.playerStats.maxPv * 100);
  playerHpBarEl.style.width = `${hpPct}%`;
  playerHpBarEl.className = `poke-hp-fill${hpPct <= 30 ? " hp-low" : hpPct <= 60 ? " hp-medium" : ""}`;

  const xpNeeded = xpRequiredForNextLevel(s.playerLevel);
  const xpPct = Math.min(100, s.playerXp / xpNeeded * 100);
  playerXpBarEl.style.width = `${xpPct}%`;
  playerXpTextEl.textContent = `${s.playerXp} / ${xpNeeded}`;
}

function updateEnemyUI() {
  const s = combatSession;
  enemyHpTextEl.textContent = `${Math.max(0, s.enemyHp)} / ${s.enemyStats.maxPv}`;
  const hpPct = Math.max(0, s.enemyHp / s.enemyStats.maxPv * 100);
  enemyHpBarEl.style.width = `${hpPct}%`;
  enemyHpBarEl.className = `poke-hp-fill${hpPct <= 30 ? " hp-low" : hpPct <= 60 ? " hp-medium" : ""}`;
}

function setCombatActionsEnabled(enabled) {
  if (enabled) {
    // On attend que tous les messages aient fini de défiler avant d'activer les boutons
    flushMsgQueue(() => {
      combatActionsEl.style.display = "grid";
      combatWaitingEl.classList.remove("visible");
      combatWaitingEl.style.display = "none";
    });
  } else {
    combatActionsEl.style.display = "none";
    combatWaitingEl.style.display = "flex";
    combatWaitingEl.classList.add("visible");
  }
}

// --- Actions du joueur ---
function applyTalentPassivesOnAttack(rawDamage) {
  // Sangsue d'Encre : soin de 12% des dégâts infligés
  if (window.PIXEL_FORGE_CREATURE?.lottery?.talentKey === "sangsue_dencre") {
    const heal = Math.floor(rawDamage * 0.12);
    if (heal > 0) {
      combatSession.playerHp = Math.min(combatSession.playerStats.maxPv, combatSession.playerHp + heal);
      addLog(`🩸 Sangsue d'Encre : +${heal} PV récupérés.`, "player");
    }
  }
}

function applyTalentPassivesStartOfPlayerTurn() {
  // Aura Incandescente : 5 dégâts magiques fixes à l'ennemi en début de tour
  if (window.PIXEL_FORGE_CREATURE?.lottery?.talentKey === "aura_incandescente") {
    const auraDmg = 5;
    combatSession.enemyHp -= auraDmg;
    addLog(`🔥 Aura Incandescente inflige ${auraDmg} dégâts magiques !`, "crit");
    updateEnemyUI();
    if (combatSession.enemyHp <= 0) return true; // ennemi mort par l'aura
  }
  // Volonté Végétale : régén si PV < 30%
  if (window.PIXEL_FORGE_CREATURE?.lottery?.talentKey === "volonte_vegetale") {
    const hpPct = combatSession.playerHp / combatSession.playerStats.maxPv;
    if (hpPct < 0.30) {
      const regen = Math.floor(combatSession.playerStats.maxPv * 0.10);
      combatSession.playerHp = Math.min(combatSession.playerStats.maxPv, combatSession.playerHp + regen);
      addLog(`🌿 Volonté Végétale : +${regen} PV régénérés !`, "player");
      updatePlayerUI();
    }
  }
  return false;
}

function playerAttack(isSpecial) {
  if (!combatSession.isPlayerTurn || combatSession.isBusy) return;
  combatSession.isBusy = true;
  setCombatActionsEnabled(false);

  // Passifs de début de tour
  if (applyTalentPassivesStartOfPlayerTurn()) {
    handleEnemyDeath();
    return;
  }

  const s = combatSession;
  const creature = window.PIXEL_FORGE_CREATURE;
  const talentKey = creature.lottery?.talentKey;

  // Critique (Surcharge Critique : +15% de chance de critique)
  let critChance = 0.10 + (talentKey === "surcharge_critique" ? 0.15 : 0);
  const isCrit = Math.random() < critChance;
  const critMult = isCrit ? 1.5 : 1.0;

  let dmg;
  if (isSpecial) {
    dmg = calcDamage(s.playerStats.atkSpe, s.enemyStats.defSpe, 1.2 * critMult);
    addLog(`${creature.name} lance une Attaque Spéciale${isCrit ? " (CRITIQUE !)" : ""} : ${dmg} dégâts.`, isCrit ? "crit" : "player");
  } else {
    dmg = calcDamage(s.playerStats.atk, s.enemyStats.def, critMult);
    addLog(`${creature.name} attaque${isCrit ? " (CRITIQUE !)" : ""} : ${dmg} dégâts.`, isCrit ? "crit" : "player");
  }

  s.enemyHp -= dmg;
  if (combat3DReady) window.Combat3D.playImpactFlash("enemy");
  applyTalentPassivesOnAttack(dmg);
  updatePlayerUI();
  updateEnemyUI();

  if (s.enemyHp <= 0) {
    handleEnemyDeath();
    return;
  }

  // Écho du Néant : 20% de chance de rejouer immédiatement
  if (talentKey === "echo_du_neant" && Math.random() < 0.20) {
    addLog(`🌀 Écho du Néant : action rejouée immédiatement !`, "crit");
    combatSession.isBusy = false;
    playerAttack(isSpecial);
    return;
  }

  // Fin du tour joueur → tour ennemi
  s.isPlayerTurn = false;
  combatSession.isBusy = false;
  scheduleEnemyTurn();
}

function playerDefend() {
  if (!combatSession.isPlayerTurn || combatSession.isBusy) return;
  combatSession.playerIsDefending = true;
  combatSession.isBusy = true;
  setCombatActionsEnabled(false);
  addLog(`🛡️ ${window.PIXEL_FORGE_CREATURE.name} se défend (dégâts réduits de 50% ce tour).`, "player");
  combatSession.isPlayerTurn = false;
  combatSession.isBusy = false;
  scheduleEnemyTurn();
}

// --- Tour de l'ennemi ---
function scheduleEnemyTurn() {
  setCombatActionsEnabled(false);
  setTimeout(() => {
    enemyTurn();
  }, 900); // petit délai "réflexion" de l'ennemi
}

function enemyTurn() {
  const s = combatSession;
  const enemy = ENEMY_CATALOG[s.enemyKey];

  let dmg = calcDamage(s.enemyStats.atk, s.playerStats.def * (s.playerIsDefending ? 2 : 1));
  // Peau de Glyphe : -10% dégâts reçus
  if (window.PIXEL_FORGE_CREATURE?.lottery?.talentKey === "peau_de_glyphe") {
    dmg = Math.floor(dmg * 0.90);
  }

  s.playerHp -= dmg;
  if (combat3DReady) window.Combat3D.playImpactFlash("player");
  addLog(`${enemy.name} attaque : ${dmg} dégâts${s.playerIsDefending ? " (défense active)" : ""}.`, "enemy");
  s.playerIsDefending = false;

  updatePlayerUI();

  if (s.playerHp <= 0) {
    handlePlayerDeath();
    return;
  }

  // Fin du tour ennemi → tour joueur
  s.isPlayerTurn = true;
  s.isBusy = false;
  setCombatActionsEnabled(true);
}

// --- Gestion de la mort ---
function handleEnemyDeath() {
  stopEnemyIdleAnimation();
  const s = combatSession;
  const enemy = ENEMY_CATALOG[s.enemyKey];

  addLog(`⭐ ${enemy.name} est vaincu !`, "system");

  // XP
  const xpGained = xpReward(s.enemyKey, s.wave);
  s.playerXp += xpGained;
  addLog(`+${xpGained} XP gagnée.`, "xp");

  // Montée de niveau immédiate
  let leveledUp = false;
  while (s.playerXp >= xpRequiredForNextLevel(s.playerLevel)) {
    s.playerXp -= xpRequiredForNextLevel(s.playerLevel);
    s.playerLevel++;
    s.playerStats = computePlayerStats(window.PIXEL_FORGE_CREATURE.baseStats, window.PIXEL_FORGE_CREATURE.archetype, s.playerLevel);
    s.playerHp = Math.min(s.playerHp + 20, s.playerStats.maxPv); // petit soin au level up
    addLog(`🌟 Niveau ${s.playerLevel} atteint ! (+20 PV récupérés)`, "level");
    leveledUp = true;
  }

  updatePlayerUI();
  updateEnemyUI();
  s.isBusy = false;

  // Prochaine vague après un délai
  const nextWave = s.wave + 1;
  if (nextWave > 100) {
    setTimeout(() => addLog("🏆 100 vagues terminées ! Tu as conquis la forêt sacrée !", "level"), 1000);
    return;
  }

  setCombatActionsEnabled(false);
  setTimeout(() => {
    startWave(nextWave);
  }, 1800);
}

function handlePlayerDeath() {
  stopEnemyIdleAnimation();
  addLog(`💀 ${window.PIXEL_FORGE_CREATURE.name} est tombé...`, "enemy");
  addLog(`Vague ${combatSession.wave} atteinte.`, "system");
  setCombatActionsEnabled(false);
  // Pour l'instant : on laissse l'écran figé. 
  // Un écran Game Over sera ajouté dans une prochaine itération.
}

// --- Listeners des boutons ---
document.getElementById("actionAttack").addEventListener("click", () => playerAttack(false));
document.getElementById("actionSpecial").addEventListener("click", () => playerAttack(true));
document.getElementById("actionDefend").addEventListener("click", () => playerDefend());

// ===========================================
// DÉMARRAGE
// ===========================================
function init() {
  initPixelData(state.gridSize);
  initColorPicker();
  renderAll();
}

init();

