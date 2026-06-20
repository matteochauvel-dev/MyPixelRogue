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
  // Ambiance crépuscule/nuit en forêt : bleu-violet profond plutôt que ciel de
  // jour clair, cohérent avec l'ambiance sombre et mystérieuse recherchée.
  scene.background = new THREE.Color(0x141d2e);
  scene.fog = new THREE.Fog(0x141d2e, 6, 24);

  const safeWidth = container.clientWidth || 800;   // valeur de secours si jamais 0
  const safeHeight = container.clientHeight || 400;  // pour ne jamais créer un renderer 0x0
  const aspect = safeWidth / safeHeight;
  console.log('Combat3D: dimensions utilisées pour le renderer :', safeWidth, 'x', safeHeight, '(aspect:', aspect, ')');

  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
  camera.position.set(0, 2.4, 5.5);
  camera.lookAt(0, 0.3, -3);

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

  // --- Lumières : ambiance nocturne froide, lumière de lune tamisée plutôt que soleil ---
  const ambient = new THREE.AmbientLight(0x4a5d8a, 0.65);
  scene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0x8fa8d6, 0.55);
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
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x2c3d28, roughness: 0.9 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Décor de forêt dense : silhouettes 2D en sprites, réparties sur 3 bandes
  // de profondeur (lointain/moyen/proche) pour un effet de parallax HD2D. ---
  createForestDecor(scene);
  createDeepForestBackdrop(scene);

  // --- Sprites billboard (placeholders au départ, remplacés via setXxxSprite) ---
  // Teinte très légère (proche du blanc, juste assez pour ancrer les sprites dans
  // l'ambiance nocturne sans dénaturer leurs couleurs d'origine).
  const characterAmbientTint = new THREE.Color(0xdce4f0);

  const placeholderTexture = buildPlaceholderTexture('#3d3d5c');
  const enemyMat = new THREE.SpriteMaterial({ map: placeholderTexture, transparent: true, color: characterAmbientTint });
  enemySprite = new THREE.Sprite(enemyMat);
  enemySprite.scale.set(ENEMY_SPRITE_HEIGHT, ENEMY_SPRITE_HEIGHT, 1);
  enemySprite.position.set(ENEMY_POSITION.x, ENEMY_POSITION.y, ENEMY_POSITION.z);
  scene.add(enemySprite);

  const playerPlaceholderTexture = buildPlaceholderTexture('#3f6b2b');
  const playerMat = new THREE.SpriteMaterial({ map: playerPlaceholderTexture, transparent: true, color: characterAmbientTint });
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
  bokehPass = new BokehPass(scene, camera, { focus: 4.7, aperture: 0.045, maxblur: 0.018 });
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

// Catalogue des fichiers de décor disponibles, par catégorie. Chaque catégorie
// peut avoir plusieurs variantes (ex: 2 feuillus différents) piochées au hasard.
const FOREST_DECOR_FILES = {
  deciduous: ['sprites/decor/feuillu_01.png', 'sprites/decor/feuillu_02.png'],
  bush: ['sprites/decor/buisson_01.png', 'sprites/decor/buisson_02.png', 'sprites/decor/buisson_03.png', 'sprites/decor/buisson_04.png'],
  grass: ['sprites/decor/herbe_01.png', 'sprites/decor/herbe_02.png'],
};

// Hauteur de référence (en unités de scène) par catégorie d'élément, avant
// application du multiplicateur d'échelle de la bande de profondeur. Les
// buissons et herbes sont nettement plus bas que les arbres.
const FOREST_ELEMENT_BASE_HEIGHT = {
  deciduous: 1,
  bush: 0.45,
  grass: 0.3,
};

const forestTextureCache = {}; // évite de recharger la même image plusieurs fois

/**
 * Charge une image de décor et exécute le callback une fois prête, avec son
 * ratio d'aspect réel. Utilise une vraie balise <img> (pas THREE.TextureLoader)
 * par cohérence avec setEnemySpriteFrame, et pour éviter tout risque de
 * problème CORS si jamais le jeu est un jour rouvert en file:// localement.
 */
function loadForestTexture(url, callback) {
  if (forestTextureCache[url]) {
    callback(forestTextureCache[url]);
    return;
  }
  const imgEl = new Image();
  imgEl.onload = () => {
    const texture = new THREE.Texture(imgEl);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    const entry = { texture, aspectRatio: imgEl.naturalWidth / imgEl.naturalHeight };
    forestTextureCache[url] = entry;
    callback(entry);
  };
  imgEl.onerror = (err) => {
    console.error('Combat3D: échec de chargement du décor :', url, err);
  };
  imgEl.src = url;
}

/**
 * Construit tout le décor de forêt : vrais sprites PNG (arbres, buissons,
 * herbe) réparties sur 3 bandes de profondeur pour un effet de parallax HD2D.
 * Les éléments lointains sont plus petits, plus pâles (désaturation
 * atmosphérique via material.color, sans regénérer de texture) et plus
 * nombreux ; les éléments proches sont plus grands, plus saturés, et
 * projettent une ombre.
 */
/**
 * Crée le fond panoramique de "forêt profonde" : un grand plan texturé placé
 * très loin derrière toutes les bandes d'arbres, avec un visuel volontairement
 * flou et sombre (dégradé + silhouettes ovales indistinctes) pour suggérer une
 * forêt qui continue à l'infini, sans dessiner d'arbres reconnaissables (qui
 * casseraient l'illusion s'ils étaient nets à cette distance).
 */
function createDeepForestBackdrop(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Dégradé de fond : sombre en haut (sous-bois profond), plus clair-brumeux
  // au centre, sombre à nouveau vers le sol.
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#1c2a22');
  gradient.addColorStop(0.45, '#3a5248');
  gradient.addColorStop(0.7, '#4a6358');
  gradient.addColorStop(1, '#2e4438');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Silhouettes ovales indistinctes (troncs/feuillage flous), jamais nettes,
  // pour suggérer une masse de forêt sans dessiner de forme reconnaissable.
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * canvas.width;
    const y = canvas.height * 0.25 + Math.random() * canvas.height * 0.6;
    const w = 15 + Math.random() * 35;
    const h = 40 + Math.random() * 100;
    const darkness = Math.random() * 0.3;
    ctx.fillStyle = `rgba(15, 25, 18, ${0.15 + darkness})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Flou appliqué directement sur le canvas (si le navigateur le supporte),
  // pour garantir que rien n'a de contour net, cohérent avec l'effet "hors
  // focus" recherché plutôt que de compter uniquement sur le flou de
  // profondeur 3D (BokehPass), qui pourrait être désactivé ou ajusté plus tard.
  if (ctx.filter !== undefined) {
    const blurredCanvas = document.createElement('canvas');
    blurredCanvas.width = canvas.width;
    blurredCanvas.height = canvas.height;
    const blurredCtx = blurredCanvas.getContext('2d');
    blurredCtx.filter = 'blur(12px)';
    blurredCtx.drawImage(canvas, 0, 0);
    var finalCanvas = blurredCanvas;
  } else {
    var finalCanvas = canvas;
  }

  const texture = new THREE.CanvasTexture(finalCanvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.MeshBasicMaterial({ map: texture, fog: true });
  const geometry = new THREE.PlaneGeometry(70, 24);
  const backdrop = new THREE.Mesh(geometry, material);
  backdrop.position.set(0, 10, -18); // distance ~24.5 de la caméra, sous la limite de 28 où le fog de scène devient total
  scene.add(backdrop);
}

function createForestDecor(scene) {
  const BANDS = [
    { zMin: -26, zMax: -18, scaleMin: 1.6, scaleMax: 2.4, fade: 0.55, count: 14, xRange: 16, categories: ['deciduous'] },
    { zMin: -16, zMax: -9,  scaleMin: 2.4, scaleMax: 3.4, fade: 0.28, count: 12, xRange: 13, categories: ['deciduous', 'bush'] },
    { zMin: 2,   zMax: 4,   scaleMin: 2.6, scaleMax: 3.6, fade: 0,    count: 8,  xRange: 4.2, excludeCenter: true, categories: ['deciduous', 'bush', 'grass'] },
  ];

  // Teinte appliquée au décor : un assombrissement de base systématique (même
  // pour les éléments proches) pour cohérence avec l'ambiance nocturne/crépuscule,
  // puis un fade supplémentaire vers le bleu sombre du brouillard pour les
  // éléments lointains (au lieu d'un fade vers le blanc, qui n'avait de sens
  // qu'avec un ciel de jour clair).
  function fadeTintColor(fade) {
    const baseDarken = 0.6; // 60% de la luminosité d'origine, même au premier plan
    const fr = 20, fg = 29, fb = 46; // teinte du brouillard nocturne (cohérent avec scene.fog)
    const r = Math.round(255 * baseDarken * (1 - fade) + fr * fade);
    const g = Math.round(255 * baseDarken * (1 - fade) + fg * fade);
    const b = Math.round(255 * baseDarken * (1 - fade) + fb * fade);
    return new THREE.Color(`rgb(${r}, ${g}, ${b})`);
  }

  for (const band of BANDS) {
    for (let i = 0; i < band.count; i++) {
      const category = band.categories[Math.floor(Math.random() * band.categories.length)];
      const files = FOREST_DECOR_FILES[category];
      const url = files[Math.floor(Math.random() * files.length)];

      loadForestTexture(url, ({ texture, aspectRatio }) => {
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          color: fadeTintColor(band.fade),
        });
        const sprite = new THREE.Sprite(material);

        const scaleMul = band.scaleMin + Math.random() * (band.scaleMax - band.scaleMin);
        const baseHeight = FOREST_ELEMENT_BASE_HEIGHT[category];
        const height = baseHeight * scaleMul;
        const width = height * aspectRatio;
        sprite.scale.set(width, height, 1);

        let x;
        if (band.excludeCenter) {
          const side = Math.random() < 0.5 ? -1 : 1;
          x = side * (band.xRange * 0.55 + Math.random() * band.xRange * 0.45);
        } else {
          x = (Math.random() - 0.5) * 2 * band.xRange;
        }
        const z = band.zMin + Math.random() * (band.zMax - band.zMin);
        sprite.position.set(x, height / 2, z);
        scene.add(sprite);

        if (band.fade === 0) {
          addGroundShadow(x, z, height * 0.28);
        }
      });
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
  // Léger glow doré en superposant une émissive sur le sprite si shiny, sinon
  // on conserve la teinte d'ambiance nocturne (pas un blanc pur qui annulerait
  // la cohérence visuelle avec le reste de la scène assombrie).
  playerSprite.material.color.set(isShiny ? 0xfff0c0 : 0xdce4f0);
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
