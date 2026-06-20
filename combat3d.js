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
const { EffectComposer, RenderPass, BokehPass, OutputPass, UnrealBloomPass } = window.THREE_ADDONS;

let scene, camera, renderer, composer, bokehPass, bloomPass;
let enemySprite, playerSprite;
let particleGeometry, particleSystem;
let clock;
let isInitialized = false;

const PARTICLE_COUNT = 120;
const PARTICLE_ZONE = { xMin: -4.5, xMax: 4.5, yMin: 0, yMax: 3.5, zMin: -4, zMax: 3 };
let particleSpeeds, particleDrift;

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping; // requis par UnrealBloomPass (voir doc officielle)
  renderer.toneMappingExposure = 1.15;
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

  // --- Rochers en profondeur (silhouettes, donnent un repère d'échelle/profondeur) ---
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a6332, roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const size = 0.6 + Math.random() * 1.2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMat);
    const angle = (i / 6) * Math.PI * 2;
    const dist = 10 + Math.random() * 6;
    rock.position.set(Math.cos(angle) * dist, size * 0.4, Math.sin(angle) * dist - 4);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }

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

  // --- Particules ambiantes ---
  particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  particleSpeeds = new Float32Array(PARTICLE_COUNT);
  particleDrift = new Float32Array(PARTICLE_COUNT);

  function resetParticle(i, randomizeY) {
    particlePositions[i * 3 + 0] = PARTICLE_ZONE.xMin + Math.random() * (PARTICLE_ZONE.xMax - PARTICLE_ZONE.xMin);
    particlePositions[i * 3 + 1] = randomizeY
      ? PARTICLE_ZONE.yMin + Math.random() * (PARTICLE_ZONE.yMax - PARTICLE_ZONE.yMin)
      : PARTICLE_ZONE.yMin;
    particlePositions[i * 3 + 2] = PARTICLE_ZONE.zMin + Math.random() * (PARTICLE_ZONE.zMax - PARTICLE_ZONE.zMin);
    particleSpeeds[i] = 0.15 + Math.random() * 0.25;
    particleDrift[i] = Math.random() * Math.PI * 2;
  }
  for (let i = 0; i < PARTICLE_COUNT; i++) resetParticle(i, true);
  particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));
  particleGeometry.userData.resetParticle = resetParticle; // exposé pour la boucle d'animation

  const particleMaterial = new THREE.PointsMaterial({
    color: 0xfff2c8,
    size: 0.13,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particleSystem);

  // --- Post-processing : bloom puis flou de profondeur ---
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomResolution = new THREE.Vector2(safeWidth, safeHeight);
  bloomPass = new UnrealBloomPass(bloomResolution, 0.5, 0.4, 0.86);
  // strength=0.5 (intensité modérée, pour un halo discret plutôt qu'un effet excessif
  // qui dénaturerait le pixel art), radius=0.4, threshold=0.86 (seules les zones les
  // plus lumineuses de la scène - le ciel clair, les particules dorées - déclenchent le bloom)
  composer.addPass(bloomPass);

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

    const positions = particleGeometry.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3 + 1] += particleSpeeds[i] * 0.016;
      positions[i * 3 + 0] += Math.sin(t * 0.8 + particleDrift[i]) * 0.003;
      if (positions[i * 3 + 1] > PARTICLE_ZONE.yMax) {
        particleGeometry.userData.resetParticle(i, false);
      }
    }
    particleGeometry.attributes.position.needsUpdate = true;

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
    bloomPass.setSize(w, h);
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
