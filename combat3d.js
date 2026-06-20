// ===========================================
// COMBAT 3D — Module Three.js (style HD2D)
// ===========================================
// Ce module gère UNIQUEMENT l'affichage 3D de l'arène de combat (sol, lumière,
// sprites billboard, particules, flou de profondeur). Toute la LOGIQUE du combat
// (dégâts, tours, XP, talents) reste entièrement dans script.js, qui appelle les
// fonctions exposées ici (window.Combat3D.xxx) pour piloter ce qui doit s'afficher.
//
// IMPORTANT : ce fichier est un script CLASSIQUE (pas de type="module"), chargé
// après three-bundle.js. Les navigateurs bloquent les modules ES par CORS quand
// la page est ouverte directement depuis le disque (file://), ce qui empêchait
// toute la scène 3D de s'afficher. three-bundle.js regroupe Three.js + les addons
// nécessaires en un seul fichier sans import/export, compatible file://.

const THREE = window.THREE;
const { EffectComposer, RenderPass, BokehPass, OutputPass } = window.THREE_ADDONS;

let scene, camera, renderer, composer, bokehPass;
let enemySprite, playerSprite;
let clock;
let isInitialized = false;

// Positions des sprites dans la scène (mêmes valeurs validées dans le fichier de test)
const ENEMY_POSITION = { x: 2.2, y: 1.0, z: -1.5 };
const PLAYER_POSITION = { x: -2, y: 1.0, z: 1.5 };

// Hauteur de référence (en unités de scène) pour TOUS les sprites ennemis, peu
// importe le ratio de leur image source. La largeur est calculée proportionnellement
// à cette hauteur pour ne jamais déformer l'image (voir setEnemySpriteFrame).
const ENEMY_SPRITE_HEIGHT = 2.6;

/**
 * Initialise toute la scène 3D. À appeler UNE SEULE FOIS, au premier chargement
 * de l'écran de combat (équivalent du rôle de initCombatSession côté logique).
 * @param {string} containerId - id de l'élément DOM qui doit héberger le canvas WebGL
 */
function initCombat3D(containerId) {
  console.log('Combat3D: initCombat3D() appelé avec containerId =', containerId);

  if (isInitialized) {
    console.log('Combat3D: déjà initialisé, on ignore cet appel.');
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Combat3D: conteneur #${containerId} introuvable dans le DOM.`);
    return;
  }

  console.log('Combat3D: conteneur trouvé. Dimensions actuelles :', {
    clientWidth: container.clientWidth,
    clientHeight: container.clientHeight,
    offsetWidth: container.offsetWidth,
    offsetHeight: container.offsetHeight,
    displayStyle: window.getComputedStyle(container).display,
  });

  if (container.clientWidth === 0 || container.clientHeight === 0) {
    console.error('Combat3D: ATTENTION — le conteneur a une largeur ou hauteur de 0. La scène sera invisible. Vérifie que l\'écran de combat est bien affiché (display != none) avant cet appel.');
  }

  // --- Scène, caméra, renderer ---
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6a96c8);
  scene.fog = new THREE.Fog(0x6a96c8, 8, 28);

  const safeWidth = container.clientWidth || 800;   // valeur de secours si jamais 0
  const safeHeight = container.clientHeight || 400;  // pour ne jamais créer un renderer 0x0
  const aspect = safeWidth / safeHeight;
  console.log('Combat3D: dimensions utilisées pour le renderer :', safeWidth, 'x', safeHeight, '(aspect:', aspect, ')');

  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
  camera.position.set(0, 1.7, 6.5);
  camera.lookAt(0, 1.1, -1);

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (err) {
    console.error('Combat3D: ÉCHEC de la création du WebGLRenderer. WebGL est peut-être désactivé ou non supporté sur ce navigateur/cette machine.', err);
    return;
  }
  renderer.setSize(safeWidth, safeHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  console.log('Combat3D: canvas WebGL créé et ajouté au conteneur.', renderer.domElement);

  // --- Lumières ---
  const ambient = new THREE.AmbientLight(0xaabbdd, 0.55);
  scene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xfff4d6, 1.4);
  sunLight.position.set(5, 8, 4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 25;
  sunLight.shadow.camera.left = -8;
  sunLight.shadow.camera.right = 8;
  sunLight.shadow.camera.top = 8;
  sunLight.shadow.camera.bottom = -8;
  scene.add(sunLight);

  // --- Sol ---
  const groundGeo = new THREE.PlaneGeometry(40, 40);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x5c7a3e, roughness: 0.9 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Décor de forêt dense : silhouettes 2D en sprites, réparties sur 3 bandes
  // de profondeur (lointain/moyen/proche) pour un effet de parallax HD2D. ---
  createForestDecor(scene);

  // --- Sprites billboard (placeholders au départ, remplacés via setXxxSprite) ---
  const placeholderTexture = buildPlaceholderTexture('#3d3d5c');
  const enemyMat = new THREE.SpriteMaterial({ map: placeholderTexture, transparent: true });
  enemySprite = new THREE.Sprite(enemyMat);
  enemySprite.scale.set(ENEMY_SPRITE_HEIGHT, ENEMY_SPRITE_HEIGHT, 1);
  enemySprite.position.set(ENEMY_POSITION.x, ENEMY_POSITION.y, ENEMY_POSITION.z);
  scene.add(enemySprite);

  const playerPlaceholderTexture = buildPlaceholderTexture('#3f6b2b');
  const playerMat = new THREE.SpriteMaterial({ map: playerPlaceholderTexture, transparent: true });
  playerSprite = new THREE.Sprite(playerMat);
  playerSprite.scale.set(1.8, 1.8, 1);
  playerSprite.position.set(PLAYER_POSITION.x, PLAYER_POSITION.y, PLAYER_POSITION.z);
  scene.add(playerSprite);

  addGroundShadow(ENEMY_POSITION.x, ENEMY_POSITION.z, 0.5);
  addGroundShadow(PLAYER_POSITION.x, PLAYER_POSITION.z, 0.55);

  // --- Particules ambiantes : overlay HTML/CSS, PAS dans la scène 3D ---
  // Les particules 3D (THREE.Points) sont sujettes à la perspective : une particule
  // proche de la caméra sort du cadre visible plus vite qu'une particule lointaine,
  // donc aucune limite Y unique ne peut satisfaire toutes les profondeurs en même
  // temps. En les plaçant en overlay HTML/CSS par-dessus le canvas, "haut de l'écran"
  // et "bas de l'écran" sont garantis correspondre aux vraies limites visuelles.
  createDOMParticles(container);

  // --- Post-processing : flou de profondeur uniquement ---
  // (le bloom n'est plus géré ici : il est appliqué en CSS directement sur les
  // particules ambiantes, qui sont en overlay DOM et non dans la scène 3D — voir
  // createDOMParticles. Un bloom WebGL ne peut techniquement pas affecter des
  // éléments HTML, donc toute tentative de bloom Three.js ne pouvait jamais
  // répondre à ce besoin précis.)
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bokehPass = new BokehPass(scene, camera, { focus: 5.4, aperture: 0.018, maxblur: 0 });
  composer.addPass(bokehPass);
  composer.addPass(new OutputPass());

  // --- Boucle de rendu ---
  clock = new THREE.Clock();
  let firstFrameLogged = false;
  function animate() {
    requestAnimationFrame(animate);
    if (!firstFrameLogged) {
      console.log('Combat3D: première frame rendue. Si l\'écran reste noir malgré ce message, le souci vient du CSS (canvas masqué) ou du contenu de la scène, pas du moteur de rendu.');
      firstFrameLogged = true;
    }
    const t = clock.getElapsedTime();
    enemySprite.position.y = ENEMY_POSITION.y + Math.sin(t * 2.1) * 0.06;
    playerSprite.position.y = PLAYER_POSITION.y + Math.sin(t * 1.8 + 1) * 0.06;

    composer.render();
  }
  animate();

  // --- Redimensionnement : on observe le conteneur, pas la fenêtre, car son
  // espace dépend du layout flex du jeu (bandeau de vague, dialog box en bas) ---
  function syncRendererSizeToContainer() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) {
      console.warn('Combat3D: syncRendererSizeToContainer appelé alors que le conteneur fait', w, 'x', h, '— ignoré.');
      return;
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    console.log('Combat3D: taille du renderer synchronisée sur le conteneur :', w, 'x', h);
  }

  const resizeObserver = new ResizeObserver(syncRendererSizeToContainer);
  resizeObserver.observe(container);

  // On force aussi une synchronisation immédiate après un court délai : si le
  // conteneur était caché (display:none) au moment de l'init et que sa taille
  // finale était déjà stable au moment où il est devenu visible, le
  // ResizeObserver peut ne jamais se déclencher (pas de "changement" détecté
  // après coup). Ce filet de sécurité corrige ce cas précis.
  setTimeout(syncRendererSizeToContainer, 100);

  isInitialized = true;
  console.log('Combat3D: scène initialisée.');
}

/**
 * Crée une texture de secours simple (carré uni) utilisée tant qu'aucun vrai
 * sprite n'a été assigné, pour ne jamais avoir un Sprite invisible/cassé.
 */
/**
 * Crée des particules ambiantes en overlay HTML/CSS par-dessus le canvas 3D.
 * Contrairement à des particules dans la scène 3D (THREE.Points), qui sont sujettes
 * à la perspective (une particule proche sort du cadre plus vite qu'une lointaine),
 * cette approche garantit que "haut de l'écran" et "bas de l'écran" correspondent
 * TOUJOURS aux vraies limites visuelles du conteneur, quel que soit l'angle de caméra.
 */
function createDOMParticles(container) {
  // Injecte le CSS d'animation une seule fois (peu importe le nombre d'appels)
  if (!document.getElementById('combat3d-particle-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'combat3d-particle-style';
    styleEl.textContent = `
      .combat3d-particle {
        position: absolute;
        bottom: 0;
        border-radius: 50%;
        background: #fffbe8;
        /* Halo lumineux en plusieurs couches : simule un effet de bloom directement
           en CSS, sans dépendre du rendu WebGL (qui ne peut pas affecter ces
           éléments DOM de toute façon, puisqu'ils sont en overlay HTML). */
        box-shadow:
          0 0 3px 1px rgba(255, 250, 220, 0.8),
          0 0 6px 2px rgba(255, 240, 180, 0.55),
          0 0 10px 4px rgba(255, 230, 150, 0.3),
          0 0 16px 7px rgba(255, 220, 120, 0.15);
        pointer-events: none;
        z-index: 2;
        opacity: 0;
        animation-name: combat3dParticleRise;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }
      @keyframes combat3dParticleRise {
        0%   { transform: translate(0, 0); opacity: 0; }
        10%  { opacity: 1; }
        90%  { opacity: 0.7; }
        100% { transform: translate(var(--drift), var(--rise-distance)); opacity: 0; }
      }
    `;
    document.head.appendChild(styleEl);
  }

  // IMPORTANT : transform: translate() en pourcentage se base sur la taille de
  // l'ÉLÉMENT TRANSFORMÉ lui-même, jamais sur celle de son parent (comportement
  // CSS standard, vérifié sur MDN/CSS-Tricks). Comme nos particules ne font que
  // quelques pixels, "translateY(-100%)" ne les déplaçait que de leur propre
  // hauteur (quelques pixels) au lieu de toute la hauteur du conteneur — elles
  // semblaient donc rester bloquées en bas de l'écran. On calcule donc la vraie
  // distance de montée en pixels, à partir de la hauteur réelle du conteneur.
  const riseDistance = container.clientHeight || 400; // valeur de secours si 0

  const PARTICLE_COUNT_DOM = 18;
  for (let i = 0; i < PARTICLE_COUNT_DOM; i++) {
    const el = document.createElement('div');
    el.className = 'combat3d-particle';
    const size = 3 + Math.random() * 4; // 3 à 7px
    const leftPercent = Math.random() * 100;
    const duration = 12 + Math.random() * 8; // 12 à 20s pour traverser tout l'écran (plus lent)
    const delay = Math.random() * duration; // décale le départ de chaque particule
    const driftPx = (Math.random() - 0.5) * 60; // léger flottement horizontal, -30px à +30px

    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.left = leftPercent + '%';
    el.style.setProperty('--drift', driftPx + 'px');
    el.style.setProperty('--rise-distance', '-' + riseDistance + 'px');
    el.style.animationDuration = duration + 's';
    el.style.animationDelay = '-' + delay + 's'; // délai négatif = certaines particules démarrent déjà "en cours"

    container.appendChild(el);
  }
}

/**
 * Dessine une silhouette de conifère (sapin étagé) sur un canvas 2D fourni.
 */
function drawConiferSilhouette(ctx, cx, baseY, width, height, color) {
  const layers = 4;
  const layerH = height / layers;
  ctx.fillStyle = color;
  for (let i = 0; i < layers; i++) {
    const yTop = baseY - height + i * layerH;
    const yBot = yTop + layerH * 1.3;
    const w = width * (1 - i / layers) * 0.9 + width * 0.15;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, yBot);
    ctx.lineTo(cx, yTop);
    ctx.lineTo(cx + w / 2, yBot);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#3c2d1e';
  ctx.fillRect(cx - width * 0.06, baseY - height * 0.15, width * 0.12, height * 0.15);
}

/**
 * Dessine une silhouette d'arbre feuillu (tronc + amas de cercles) sur un canvas 2D.
 */
function drawDeciduousSilhouette(ctx, cx, baseY, width, height, color) {
  const trunkH = height * 0.35;
  ctx.fillStyle = '#463223';
  ctx.fillRect(cx - width * 0.05, baseY - trunkH, width * 0.1, trunkH);

  const foliageCy = baseY - trunkH - height * 0.4;
  const blobs = [
    [cx, foliageCy, width * 0.55],
    [cx - width * 0.3, foliageCy + height * 0.12, width * 0.4],
    [cx + width * 0.32, foliageCy + height * 0.1, width * 0.42],
    [cx - width * 0.1, foliageCy - height * 0.2, width * 0.38],
    [cx + width * 0.15, foliageCy - height * 0.22, width * 0.36],
  ];
  ctx.fillStyle = color;
  for (const [bx, by, br] of blobs) {
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Dessine une silhouette de buisson (amas de cercles bas) sur un canvas 2D.
 */
function drawBushSilhouette(ctx, cx, baseY, width, height, color) {
  const blobs = [
    [cx, baseY - height * 0.5, width * 0.4],
    [cx - width * 0.28, baseY - height * 0.35, width * 0.32],
    [cx + width * 0.28, baseY - height * 0.35, width * 0.32],
    [cx - width * 0.12, baseY - height * 0.65, width * 0.3],
    [cx + width * 0.14, baseY - height * 0.6, width * 0.28],
  ];
  ctx.fillStyle = color;
  for (const [bx, by, br] of blobs) {
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Dessine une touffe d'herbe (brins triangulaires) sur un canvas 2D.
 */
function drawGrassSilhouette(ctx, cx, baseY, width, height, color) {
  const blades = 5;
  ctx.fillStyle = color;
  for (let i = 0; i < blades; i++) {
    const offset = (i - blades / 2) * (width / blades);
    const sway = Math.sin(i * 1.3) * width * 0.15;
    ctx.beginPath();
    ctx.moveTo(cx + offset - width * 0.04, baseY);
    ctx.lineTo(cx + offset + sway, baseY - height);
    ctx.lineTo(cx + offset + width * 0.04, baseY);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Construit une texture canvas pour un type d'élément de décor donné, avec une
 * couleur paramétrable (utilisé pour la désaturation atmosphérique selon la
 * profondeur : plus c'est loin, plus la couleur est pâle/bleutée).
 */
function buildForestElementTexture(type, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const baseY = canvas.height - 4;
  const w = canvas.width * 0.9;
  const h = canvas.height * 0.92;

  if (type === 'conifer') drawConiferSilhouette(ctx, cx, baseY, w, h, color);
  else if (type === 'deciduous') drawDeciduousSilhouette(ctx, cx, baseY, w, h, color);
  else if (type === 'bush') drawBushSilhouette(ctx, cx, baseY, w * 0.9, h * 0.55, color);
  else if (type === 'grass') drawGrassSilhouette(ctx, cx, baseY, w * 0.7, h * 0.35, color);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Construit tout le décor de forêt : silhouettes 2D en sprites, réparties sur
 * 3 bandes de profondeur pour un effet de parallax HD2D. Les éléments lointains
 * sont plus petits, plus pâles (désaturation atmosphérique) et plus nombreux ;
 * les éléments proches sont plus grands, plus saturés, et projettent une ombre.
 */
function createForestDecor(scene) {
  // Bandes de profondeur : [zMin, zMax, scaleMin, scaleMax, colorMix (0=normal couleur, 1=pâle/bleuté), count]
  const BANDS = [
    { zMin: -26, zMax: -18, scaleMin: 1.6, scaleMax: 2.4, fade: 0.55, count: 16, xRange: 16 },
    { zMin: -16, zMax: -9,  scaleMin: 2.4, scaleMax: 3.4, fade: 0.28, count: 12, xRange: 13 },
    { zMin: 2,   zMax: 4,   scaleMin: 2.6, scaleMax: 3.6, fade: 0,    count: 8,  xRange: 4.2, excludeCenter: true },
  ];

  // Couleurs de base par type d'élément (verts forêt variés pour éviter la monotonie)
  const ELEMENT_TYPES = [
    { type: 'conifer',   baseColor: [35, 70, 40],  weight: 3 },
    { type: 'conifer',   baseColor: [45, 80, 48],  weight: 2 },
    { type: 'deciduous', baseColor: [60, 95, 50],  weight: 3 },
    { type: 'deciduous', baseColor: [70, 100, 55], weight: 2 },
    { type: 'bush',      baseColor: [55, 90, 45],  weight: 2 },
  ];
  const totalWeight = ELEMENT_TYPES.reduce((s, e) => s + e.weight, 0);

  function pickElementType() {
    let roll = Math.random() * totalWeight;
    for (const e of ELEMENT_TYPES) {
      roll -= e.weight;
      if (roll <= 0) return e;
    }
    return ELEMENT_TYPES[0];
  }

  // Mélange la couleur de base avec un bleu-gris pâle selon le facteur "fade"
  // (0 = couleur normale, 1 = quasi entièrement pâle) pour simuler la brume
  // atmosphérique qui désature les objets lointains.
  function fadeColor([r, g, b], fade) {
    const fr = 165, fg = 178, fb = 188; // teinte brume bleu-gris pâle
    const mr = Math.round(r + (fr - r) * fade);
    const mg = Math.round(g + (fg - g) * fade);
    const mb = Math.round(b + (fb - b) * fade);
    return `rgb(${mr}, ${mg}, ${mb})`;
  }

  const textureCache = {};
  function getTexture(type, colorKey, colorStr) {
    const cacheKey = type + ':' + colorKey;
    if (!textureCache[cacheKey]) {
      textureCache[cacheKey] = buildForestElementTexture(type, colorStr);
    }
    return textureCache[cacheKey];
  }

  for (const band of BANDS) {
    for (let i = 0; i < band.count; i++) {
      const elementDef = pickElementType();
      const colorStr = fadeColor(elementDef.baseColor, band.fade);
      const colorKey = Math.round(band.fade * 10); // arrondi pour limiter le nb de textures en cache
      const texture = getTexture(elementDef.type, colorKey, colorStr);

      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);

      const scale = band.scaleMin + Math.random() * (band.scaleMax - band.scaleMin);
      // Les silhouettes sont dessinées dans un canvas 128x160 (ratio 0.8:1)
      sprite.scale.set(scale * 0.8, scale, 1);

      let x;
      if (band.excludeCenter) {
        // Bande proche : on évite la zone centrale (où se trouvent les combattants)
        // en plaçant l'élément soit franchement à gauche, soit franchement à droite,
        // façon cadrage "avant-scène" plutôt qu'une distribution uniforme qui
        // risquerait de masquer le combat.
        const side = Math.random() < 0.5 ? -1 : 1;
        x = side * (band.xRange * 0.55 + Math.random() * band.xRange * 0.45);
      } else {
        x = (Math.random() - 0.5) * 2 * band.xRange;
      }
      const z = band.zMin + Math.random() * (band.zMax - band.zMin);
      sprite.position.set(x, scale / 2, z);
      scene.add(sprite);

      // Ombre portée uniquement pour la bande proche (les bandes lointaines sont
      // trop loin pour qu'une ombre soit perceptible, et ça évite l'effort de calcul)
      if (band.fade === 0) {
        addGroundShadow(x, z, scale * 0.22);
      }
    }
  }
}

function buildPlaceholderTexture(hexColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 8; canvas.height = 8;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hexColor;
  ctx.fillRect(1, 1, 6, 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

function addGroundShadow(x, z, radius) {
  const shadowGeo = new THREE.CircleGeometry(radius, 24);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(x, 0.01, z);
  scene.add(shadowMesh);
}

/**
 * Change l'image affichée pour le sprite ennemi. Appelé par le cycle d'animation
 * idle existant dans script.js (celui qui changeait déjà enemySpriteEl.src toutes
 * les 600ms) — on lui fait aussi appeler cette fonction en plus de l'ancien <img>.
 *
 * IMPORTANT : on n'utilise PAS THREE.TextureLoader ici, car il charge l'image via
 * fetch/XMLHttpRequest en interne, qui est bloqué par la politique CORS du navigateur
 * quand la page est ouverte en file:// (chaque fichier local est considéré comme une
 * origine différente). Une balise <img> HTML classique n'est PAS soumise à cette même
 * restriction pour un simple affichage, donc on charge l'image ainsi puis on construit
 * la texture Three.js à partir de cet élément déjà chargé.
 *
 * @param {string} imageUrl - chemin vers le fichier PNG (ex: 'sprites/ennemis/01_goutteux/goutteux_idle_01.png')
 */
const enemyTextureCache = {}; // évite de recharger la même image à chaque frame d'idle (toutes les 600ms)

function setEnemySpriteFrame(imageUrl) {
  if (!isInitialized) return;

  if (enemyTextureCache[imageUrl]) {
    const cached = enemyTextureCache[imageUrl];
    enemySprite.material.map = cached.texture;
    enemySprite.material.needsUpdate = true;
    enemySprite.scale.set(cached.width, cached.height, 1);
    return;
  }

  const imgEl = new Image();
  imgEl.onload = () => {
    const texture = new THREE.Texture(imgEl);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true; // requis : THREE.Texture ne sait pas tout seul que l'image vient de charger

    // Calcul du ratio RÉEL de l'image (ex: Arachno est en format paysage, plus
    // large que haut) pour ne jamais la déformer en forçant un carré arbitraire.
    const aspectRatio = imgEl.naturalWidth / imgEl.naturalHeight;
    const height = ENEMY_SPRITE_HEIGHT;
    const width = ENEMY_SPRITE_HEIGHT * aspectRatio;

    console.log('Combat3D DIAGNOSTIC ratio sprite ennemi:', {
      imageUrl,
      naturalWidth: imgEl.naturalWidth,
      naturalHeight: imgEl.naturalHeight,
      aspectRatioCalcule: aspectRatio,
      scaleAppliqueX: width,
      scaleAppliqueY: height,
    });

    enemyTextureCache[imageUrl] = { texture, width, height };
    enemySprite.material.map = texture;
    enemySprite.material.needsUpdate = true;
    enemySprite.scale.set(width, height, 1);
  };
  imgEl.onerror = (err) => {
    console.error('Combat3D: échec de chargement de l\'image ennemie :', imageUrl, err);
  };
  imgEl.src = imageUrl;
}

/**
 * Remplace le sprite du joueur par le dessin pixel art réel de la créature.
 * @param {HTMLCanvasElement} sourceCanvas - le canvas contenant déjà le dessin
 *   (typiquement playerPixelCanvas, déjà rempli par renderCreaturePortraitForCombat)
 */
function setPlayerSpriteFromCanvas(sourceCanvas) {
  if (!isInitialized) return;
  const texture = new THREE.CanvasTexture(sourceCanvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  playerSprite.material.map = texture;
  playerSprite.material.needsUpdate = true;
}

/**
 * Active/désactive le filtre "shiny" visuel sur le sprite du joueur.
 */
function setPlayerShiny(isShiny) {
  if (!isInitialized) return;
  // Léger glow doré en superposant une émissive sur le sprite, via une teinte simple.
  playerSprite.material.color.set(isShiny ? 0xfff0c0 : 0xffffff);
}

/**
 * Petit flash blanc bref sur le sprite ciblé (joueur ou ennemi), pour matérialiser
 * un impact. 'target' vaut 'player' ou 'enemy'. Conçu pour être appelé par
 * playerAttack()/enemyTurn() dans script.js au moment où les dégâts sont appliqués.
 */
function playImpactFlash(target) {
  if (!isInitialized) return;
  const sprite = target === 'enemy' ? enemySprite : playerSprite;
  const originalColor = sprite.material.color.clone();
  sprite.material.color.set(0xffffff);
  sprite.material.color.multiplyScalar(2); // flash plus clair que blanc pur pour bien se voir
  setTimeout(() => {
    sprite.material.color.copy(originalColor);
  }, 120);
}

// API publique exposée à script.js (chargé en script classique juste après ce fichier)
window.Combat3D = {
  init: initCombat3D,
  setEnemySpriteFrame,
  setPlayerSpriteFromCanvas,
  setPlayerShiny,
  playImpactFlash,
};
