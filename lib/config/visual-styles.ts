/**
 * Visual Style Configuration for Vehicle Advertising
 *
 * This module defines comprehensive visual styles that deeply influence
 * storyboard generation, image prompts, and video aesthetics for vehicle ads.
 * Each style includes detailed cinematographic guidelines that will be woven
 * into every scene description and image prompt.
 */

export type VisualStyleType = 'whimsical' | 'luxury' | 'offroad';

export interface CinematographyGuide {
  // Camera & Lens
  cameraMovement: string[];
  lensChoices: string[];
  shotTypes: string[];
  frameComposition: string[];

  // Lighting & Color
  lightingStyle: string[];
  colorPalette: string[];
  colorGrading: string[];
  timeOfDay: string[];

  // Motion & Pacing
  pacing: string;
  motionStyle: string[];
  cameraSpeed: string;

  // Texture & Quality
  filmStock: string[];
  textureDetails: string[];
  postProcessing: string[];

  // Vehicle-Specific
  vehiclePresentation: string[];
  vehicleMovement: string[];
  environmentInteraction: string[];
}

export interface NarrativeGuide {
  storytellingApproach: string;
  emotionalTone: string[];
  paceDescription: string;
  targetAudience: string;
  brandPersonality: string[];
}

export interface VisualStyleDefinition {
  id: VisualStyleType;
  name: string;
  description: string;

  // Core visual identity
  cinematography: CinematographyGuide;
  narrative: NarrativeGuide;

  // Example reference prompt (shown in UI)
  examplePrompt: string;

  // System-level instructions for storyboard generation
  storyboardGuidance: {
    sceneStructure: string;
    transitionStyle: string;
    visualProgression: string;
    climaxApproach: string;
  };

  // Modifiers that get appended to every image prompt
  globalPromptModifiers: {
    prefix: string;  // Added before scene description
    suffix: string;  // Added after scene description
    negativePrompt: string;  // What to avoid
  };
}

/**
 * Complete Visual Style Definitions
 */
export const VISUAL_STYLES: Record<VisualStyleType, VisualStyleDefinition> = {
  whimsical: {
    id: 'whimsical',
    name: 'Whimsical',
    description: 'Wes Anderson-inspired aesthetic with symmetrical framing, pastel palettes, and deliberate staging',

    cinematography: {
      cameraMovement: [
        'Static tripod shots with perfect horizontal stability',
        'Slow methodical lateral tracking on dolly',
        'Precise perpendicular movements maintaining symmetry',
        'Deliberate whip pans between static compositions',
        'Locked-off frames with subjects moving within frame',
      ],
      lensChoices: [
        'Wide angle lenses (24mm-35mm) for environmental context',
        'Normal lenses (40mm-50mm) for character-to-environment balance',
        'Shallow depth of field isolating subject from background',
        'Center-sharp optics with natural vignetting',
      ],
      shotTypes: [
        'Symmetrical center-framed compositions',
        'Flat frontal angles with direct camera address',
        'Profile shots with geometric precision',
        'Overhead "God\'s eye" views showing spatial relationships',
        'Low angle shots emphasizing architecture and scale',
      ],
      frameComposition: [
        'Perfect bilateral symmetry with centered subjects',
        'Rule of thirds for balanced asymmetrical moments',
        'Geometric patterns and repeating elements',
        'Strong horizontal and vertical lines',
        'Layered depth with foreground, mid-ground, background elements',
        'Flat horizon line at exact vertical center or thirds',
      ],

      lightingStyle: [
        'Soft diffused natural light with minimal contrast',
        'Golden hour warm glow with long soft shadows',
        'Overcast even lighting reducing harsh shadows',
        'Practical lights (neon signs, lamps) as color accents',
        'Bounce light filling shadows naturally',
      ],
      colorPalette: [
        'Pastel tones: seafoam green, dusty rose, butter yellow',
        'Burnt orange and terracotta for warmth',
        'Muted turquoise and powder blue for coolness',
        'Cream and beige as neutral base tones',
        'Strategic pops of saturated primary colors',
      ],
      colorGrading: [
        'Desaturated overall with selective saturation boosts',
        'Pushed magentas in shadows, yellows in highlights',
        'Milky lifted blacks with reduced contrast',
        'Film-like color response with gentle rolloff',
        'Vintage Kodak Ektachrome color science',
      ],
      timeOfDay: [
        'Golden hour (sunrise/sunset) for warm nostalgic glow',
        'High noon for flat even lighting',
        'Blue hour twilight for melancholic atmosphere',
      ],

      pacing: 'Methodical and contemplative with extended static holds',
      motionStyle: [
        'Slow deliberate subject movement within locked frame',
        'Characters moving perpendicular to camera (profile walks)',
        'Vehicle enters frame, stops at perfect composition point',
        'Subjects exit frame completely before cut',
      ],
      cameraSpeed: 'Extremely slow dolly/tracking moves (1-2 fps equivalent camera speed)',

      filmStock: [
        '35mm film grain texture at moderate levels',
        'Slight softness and organic texture',
        'Film gate weave and breathing (very subtle)',
        'Kodak Vision3 500T color characteristics',
      ],
      textureDetails: [
        'Crisp detail in center, gentle softness at edges',
        'Visible texture in fabrics, surfaces, and materials',
        'Natural film grain adding tactile quality',
        'Slight halation around bright highlights',
      ],
      postProcessing: [
        'Light vintage color grading',
        'Subtle vignette drawing eye to center',
        'Minimal sharpening preserving organic feel',
        'Slight bloom on highlights for dreamy quality',
      ],

      vehiclePresentation: [
        'Vehicle as protagonist within carefully staged tableau',
        'Symmetrically framed with equal negative space',
        'Static vehicle with world moving around it',
        'Quirky human-scale interactions with vehicle',
        'Vehicle color as key element in color palette',
      ],
      vehicleMovement: [
        'Slow steady speed conveying purposefulness',
        'Enters frame from side, stops at composition sweet spot',
        'Movement perpendicular to camera (true profile)',
        'Long slow reveal as camera dollies past obstacles',
      ],
      environmentInteraction: [
        'Retro gas stations, vintage motels, desert landscapes',
        'Perfectly maintained mid-century architecture',
        'Geometric patterns in environment echoing frame composition',
        'Human-made structures in natural landscapes creating juxtaposition',
        'Carefully curated background details telling micro-stories',
      ],
    },

    narrative: {
      storytellingApproach: 'Character-driven narrative where vehicle is a character with personality and history',
      emotionalTone: [
        'Nostalgic and bittersweet',
        'Whimsical yet melancholic',
        'Quirky and charming',
        'Deadpan humor with emotional undercurrent',
      ],
      paceDescription: 'Unhurried and contemplative, giving viewer time to absorb details',
      targetAudience: 'Design-conscious individuals who appreciate artistry and craftsmanship',
      brandPersonality: [
        'Quirky and memorable',
        'Detail-oriented and meticulous',
        'Nostalgic and timeless',
        'Sophisticated yet approachable',
      ],
    },

    examplePrompt: 'Wes Anderson cinematography with static tripod shots flat horizon line, retro 1960s gas station, vintage car commercial aesthetic, pastel color palette with burnt orange and seafoam green, film grain texture, shallow focus on car, deliberate staging, whimsical yet melancholic mood, golden hour lighting, desert landscape, methodical camera movement',

    storyboardGuidance: {
      sceneStructure: 'Build from wide establishing shots to medium character moments, always returning to symmetrical compositions. Each scene should feel like a perfectly composed photograph that happens to move.',
      transitionStyle: 'Straight cuts between static compositions. No fades or dissolves. Occasional whip pan transitions for energy.',
      visualProgression: 'Start with environmental context, reveal vehicle as central character, build to human-vehicle interaction moments, culminate in hero shot of vehicle in perfect composition.',
      climaxApproach: 'Final scene is the most perfectly composed, symmetrical frame with vehicle at absolute center, held longer than expected for contemplative ending.',
    },

    globalPromptModifiers: {
      prefix: 'Wes Anderson inspired cinematography, symmetrical center framing, pastel color palette,',
      suffix: ', shot on 35mm film with natural grain, soft diffused golden hour lighting, flat horizon line, methodical deliberate staging, whimsical nostalgic atmosphere, shallow depth of field, vintage aesthetic',
      negativePrompt: 'asymmetrical framing, handheld shakiness, harsh lighting, oversaturated colors, modern digital look, fast movement, chaotic composition, dark moody atmosphere, extreme angles, motion blur',
    },
  },

  luxury: {
    id: 'luxury',
    name: 'Luxury',
    description: 'High-end cinematic commercial aesthetic emphasizing sophistication, power, and refined elegance',

    cinematography: {
      cameraMovement: [
        'Smooth gimbal tracking shots following vehicle gracefully',
        'Elegant crane movements revealing environment majestically',
        'Slow push-ins building tension and focus',
        'Circular orbiting moves showcasing vehicle from all angles',
        'Steady Steadicam glides with perfect stability',
        'Dramatic reveal movements (crane up, dolly back)',
      ],
      lensChoices: [
        'Anamorphic lenses (2.39:1 aspect) with characteristic lens flares',
        'Fast primes (T1.4-T2) for creamy bokeh and subject isolation',
        'Long lenses (85mm-135mm) compressing space dramatically',
        'Wide lenses (24mm-35mm) for environmental grandeur',
        'Vintage glass with subtle aberrations for character',
      ],
      shotTypes: [
        'Dramatic low angles emphasizing power and presence',
        'Sweeping aerial establishing shots showing scale',
        'Intimate close-ups revealing craftsmanship details',
        'Dynamic tracking shots at vehicle speed',
        'Hero beauty shots with perfect lighting and reflection',
      ],
      frameComposition: [
        'Rule of thirds with subject in power positions',
        'Leading lines guiding eye to vehicle',
        'Negative space emphasizing isolation and exclusivity',
        'Balanced asymmetry creating visual tension',
        'Depth layers separating subject from environment',
        'Wide 2.39:1 cinematic aspect ratio',
      ],

      lightingStyle: [
        'Dramatic side lighting sculpting vehicle form',
        'Edge lighting (rim light) separating subject from background',
        'Motivated practical lights (street lamps, building lights)',
        'High contrast ratios with deep rich shadows',
        'Specular highlights on chrome and glass',
        'Soft key light maintaining detail in shadows',
      ],
      colorPalette: [
        'Rich jewel tones: deep burgundy, emerald, sapphire blue',
        'Metallic accents: chrome, brushed aluminum, rose gold',
        'Sophisticated neutrals: charcoal, slate, warm grey',
        'Warm amber and cool teal contrast',
        'Black and deep navy as power colors',
      ],
      colorGrading: [
        'Teal and orange cinematic color scheme',
        'Crushed blacks for dramatic contrast',
        'Warm skin tones with amber midtones',
        'Cool desaturated shadows',
        'Boosted saturation in specific channels',
        'Film-like color response with smooth gradients',
        'Slight cyan/blue in shadows, orange/amber in highlights',
      ],
      timeOfDay: [
        'Golden hour for warm prestigious glow',
        'Blue hour for sophisticated urban atmosphere',
        'Nighttime for dramatic lighting opportunities',
        'Overcast for even controlled lighting',
      ],

      pacing: 'Confident and powerful with calculated rhythm',
      motionStyle: [
        'Smooth unwavering camera movements',
        'Vehicle moving with purpose and authority',
        'Graceful arcing camera paths',
        'Speed ramping for emphasis (slow to fast)',
        'Floating ethereal camera movements',
      ],
      cameraSpeed: 'Moderate to slow for gravitas, occasional faster movements for excitement',

      filmStock: [
        'Arri Alexa LF or Mini LF digital cinema camera look',
        'Clean high-resolution capture with minimal noise',
        'Very subtle grain for organic feel',
        'Wide dynamic range capturing detail in shadows and highlights',
      ],
      textureDetails: [
        'Razor-sharp focus on hero elements',
        'Creamy smooth bokeh in out-of-focus areas',
        'Specular highlights with natural rolloff',
        'Micro-contrast revealing material textures',
        'Detailed reflections in vehicle paint and glass',
      ],
      postProcessing: [
        'Precise color grading with secondary corrections',
        'Subtle lens flares and light leaks for cinematic feel',
        'Light sharpening on vehicle, softening on background',
        'Careful vignette directing attention',
        'Film emulation LUTs for organic color response',
      ],

      vehiclePresentation: [
        'Vehicle as ultimate expression of refinement and power',
        'Emphasis on design lines and sculptural form',
        'Lighting revealing paint depth and reflections',
        'Close-ups of premium materials and craftsmanship',
        'Vehicle moving through environment with commanding presence',
      ],
      vehicleMovement: [
        'Smooth powerful acceleration suggesting effortless performance',
        'Graceful cornering highlighting handling precision',
        'Commanding speed with perfect stability',
        'Vehicle appears to float over road surface',
        'Quiet confidence rather than aggressive speed',
      ],
      environmentInteraction: [
        'Modern architecture and clean minimal backgrounds',
        'Empty roads suggesting exclusivity and private moments',
        'Urban environments at golden hour or blue hour',
        'Desert highways emphasizing solitude and freedom',
        'Reflective surfaces (wet roads, glass buildings) for visual interest',
        'Premium locations: canyons, coastal highways, modern cityscapes',
      ],
    },

    narrative: {
      storytellingApproach: 'Aspirational lifestyle narrative where vehicle represents achievement and refined taste',
      emotionalTone: [
        'Sophisticated and elegant',
        'Powerful yet refined',
        'Confident and commanding',
        'Aspirational and inspiring',
      ],
      paceDescription: 'Measured and confident pacing building to powerful crescendo',
      targetAudience: 'Affluent individuals seeking premium quality and status',
      brandPersonality: [
        'Sophisticated and refined',
        'Powerful and confident',
        'Timeless and elegant',
        'Exclusive and aspirational',
      ],
    },

    examplePrompt: 'Cinematic luxury car commercial, beautifully lit car driving through empty desert highway at golden hour, slow tracking shot following the vehicle, dramatic side lighting highlighting reflective paint, shallow depth of field, 2.35:1 aspect ratio, high-end production quality, smooth camera movement. Elegant, powerful, sophisticated, and refined',

    storyboardGuidance: {
      sceneStructure: 'Open with dramatic establishing shot, build through increasingly intimate reveals of vehicle details, escalate to dynamic motion shots, culminate in powerful hero moment.',
      transitionStyle: 'Smooth dissolves and match cuts on motion. Occasional hard cuts for dramatic emphasis. Speed ramps within scenes.',
      visualProgression: 'Begin with environmental grandeur, progressively reveal vehicle as protagonist, build energy through motion, end with statement of power and prestige.',
      climaxApproach: 'Final scene combines dramatic lighting, perfect composition, and commanding presence. Vehicle at peak visual power, potentially with reveal of brand badge/emblem.',
    },

    globalPromptModifiers: {
      prefix: 'Cinematic luxury commercial aesthetic, Arri Alexa cinema camera, anamorphic lenses, dramatic lighting,',
      suffix: ', shot in 2.39:1 widescreen format, teal and orange color grading, smooth gimbal movement, high-end production quality, rich contrast, sophisticated elegant atmosphere, shallow depth of field with creamy bokeh, specular highlights on vehicle surface',
      negativePrompt: 'low budget look, poor lighting, oversaturated colors, digital noise, shaky camera, amateur composition, cluttered background, harsh shadows, flat lighting, consumer camera look',
    },
  },

  offroad: {
    id: 'offroad',
    name: 'Offroad',
    description: 'High-energy action sports aesthetic with aggressive pacing, visceral camera work, and adventure vibes',

    cinematography: {
      cameraMovement: [
        'Aggressive handheld following action intimately',
        'POV helmet cams and bumper mounts putting viewer in action',
        'Fast whip pans tracking movement explosively',
        'Mounted GoPro perspectives on vehicle body',
        'Drone chase shots keeping pace with vehicle',
        'Rapid gimbal movements reacting to action',
        'Static cameras capturing impacts and obstacle conquering',
      ],
      lensChoices: [
        'Wide angle GoPro/action cam perspective (14-16mm equivalent)',
        'Ultra-wide lenses (12-24mm) for dramatic distortion',
        'Normal lenses (24-35mm) for natural eye-level perspective',
        'Telephoto compression (70-200mm) for dramatic mud spray shots',
      ],
      shotTypes: [
        'POV from driver perspective showing wheel wrestling',
        'Low angle tight on tires conquering terrain',
        'Chase cam following vehicle through obstacles',
        'Slow-motion impacts: mud spray, water crossings, jumps',
        'Chest-mounted camera showing driver reactions',
        'Mounted cameras capturing rooster tails and splatter',
        'Aerial drone following through trails',
      ],
      frameComposition: [
        'Dynamic asymmetric framing capturing energy',
        'Extreme angles emphasizing action',
        'Tight framing creating visceral intensity',
        'Dutch angles (canted frames) for instability and excitement',
        'Action filling frame edge-to-edge',
        'Layers of flying mud, water, dirt in foreground',
      ],

      lightingStyle: [
        'Natural daylight with high contrast',
        'Backlit mud and water spray creating dramatic silhouettes',
        'Harsh direct sunlight emphasizing textures',
        'Dappled forest light creating dynamic patterns',
        'Dust particles lit by low-angle sunlight',
      ],
      colorPalette: [
        'Vibrant saturated greens of forest and trails',
        'Rich brown mud and earth tones',
        'Bright pops of vehicle color against natural terrain',
        'Deep blue sky as vibrant backdrop',
        'Orange and red in dirt and canyon environments',
      ],
      colorGrading: [
        'Punchy saturated colors with boosted vibrancy',
        'High contrast with deep blacks and bright highlights',
        'Warm orange/amber tones in dirt and rocks',
        'Cool teal/blue in shadows and sky',
        'Lifted midtones maintaining detail in action',
        'Film-like grain adding gritty texture',
      ],
      timeOfDay: [
        'Mid-day with strong directional sunlight',
        'Golden hour for dramatic backlit dust/spray',
        'Overcast for even lighting in forest trails',
      ],

      pacing: 'Fast and aggressive with adrenaline-fueled energy',
      motionStyle: [
        'Quick aggressive cuts between angles',
        'Speed ramping: real-time to slow-motion on impacts',
        'Fast camera movements tracking action',
        'Whip pans creating kinetic energy',
        'Slow-motion for maximum drama on key moments',
      ],
      cameraSpeed: 'Variable: fast movements intercut with slow-motion highlights',

      filmStock: [
        'Digital cinema look with natural texture',
        'Visible grain adding organic gritty feel',
        'High frame rates (120-240fps) for smooth slow-motion',
        'GoPro/action cam aesthetic on POV shots',
      ],
      textureDetails: [
        'Visible dirt, mud splatter, and textures',
        'Gritty detailed rendering of terrain',
        'Motion blur on fast movements',
        'Sharp detail on vehicle in slow-motion',
        'Dust and particle details in air',
      ],
      postProcessing: [
        'Impact cuts with brief flash frames',
        'Aggressive color grading with boosted saturation',
        'Heavy contrast with crushed blacks',
        'Sharpening emphasizing texture and detail',
        'Speed ramps for dramatic effect',
        'Sound design cues guiding edit rhythm',
      ],

      vehiclePresentation: [
        'Vehicle as capable adventure machine conquering obstacles',
        'Emphasis on capability and ruggedness',
        'Showing vehicle getting dirty and tested',
        'Tire articulation and suspension travel highlighted',
        'Aggressive approach angles and ground clearance on display',
        'Vehicle relationship with challenging terrain',
      ],
      vehicleMovement: [
        'Full throttle acceleration through obstacles',
        'Tire spin and rooster tails of mud/dirt',
        'Rock crawling with visible suspension articulation',
        'Water crossings with massive splashes',
        'Jumps and drops with suspension compression',
        'Quick direction changes and evasive maneuvers',
      ],
      environmentInteraction: [
        'Muddy trails with puddles and bogs',
        'Rocky terrain with boulders and obstacles',
        'Forest trails with tight trees',
        'Stream and river crossings',
        'Hill climbs and descents showing capability',
        'Varied terrain types showcasing versatility',
        'Natural obstacles: fallen trees, rocks, ruts',
      ],
    },

    narrative: {
      storytellingApproach: 'Adventure story where vehicle enables exploration and overcomes challenges',
      emotionalTone: [
        'Exciting and adrenaline-fueled',
        'Fun and playful',
        'Adventurous and bold',
        'Raw and authentic',
      ],
      paceDescription: 'High energy with peaks and valleys, explosive action moments contrasted with brief recovery beats',
      targetAudience: 'Adventure seekers and outdoor enthusiasts who value capability and experience',
      brandPersonality: [
        'Adventurous and capable',
        'Fun and exciting',
        'Authentic and real',
        'Bold and confident',
      ],
    },

    examplePrompt: 'High-energy action sports aesthetic with aggressive, adrenaline-fueled pacing. Think muddy trail runs, rock bouncing, and full-throttle excitement. Fast cuts, dynamic camera angles, and visceral close-ups that put you IN the action. Vibrant, punchy color grading - saturated greens of forest trails, rich brown mud splatter, bright pops of the vehicle color against natural terrain. High contrast with deep blacks and bright highlights. Gritty, textured look with visible dirt, mud spray, and water flying everywhere. Camera work is aggressive and immersive - mounted GoPros on bumpers and fenders capturing mud rooster tails and tire spin, chest-mounted POV shots from inside the cabin showing the wheel wrestling and driver reactions, low-angle tight shots of tires chewing through mud bogs. Quick whip pans and impact cuts when the vehicle hits obstacles or drops off ledges. Slow-motion used for maximum drama - mud exploding off tires, suspension compression on big hits, water crossings with massive splashes erupting. Paired with real-time speed ramping for that holy shit moment energy. Raw, authentic, Fun with a capital F. More YouTube off-road channel energy than luxury brand - this is about capability, adventure, and getting dirty. Think weekend warrior excitement and take your buddies out vibes.',

    storyboardGuidance: {
      sceneStructure: 'Start with arrival at adventure location, build through progressively more challenging obstacles, peak with most dramatic moment (jump, water crossing, mud bog), end with triumphant completion shot.',
      transitionStyle: 'Fast cuts, impact cuts, whip pans between angles. Minimal dissolves. Speed ramps within scenes for dramatic emphasis.',
      visualProgression: 'Begin with anticipation and arrival, escalate through obstacle after obstacle, build to climactic challenge moment, resolve with satisfaction and capability proven.',
      climaxApproach: 'Biggest obstacle or most dramatic moment: multiple angles, slow-motion breakdown of key action beats, fast cuts building energy, resolve with successful completion and vehicle emerging victorious.',
    },

    globalPromptModifiers: {
      prefix: 'High-energy offroad action aesthetic, GoPro and action cam perspectives, aggressive dynamic framing,',
      suffix: ', vibrant saturated color grading with boosted greens and browns, high contrast with deep blacks, gritty textured look, fast aggressive camera movement, natural outdoor lighting, dirt and mud spray, motion blur on action, slow-motion capable 120fps footage, raw authentic adventure vibe',
      negativePrompt: 'clean vehicle, studio lighting, static camera, slow boring pacing, low contrast, desaturated colors, smooth pristine environments, luxury aesthetic, careful conservative movement, flat lighting',
    },
  },
};

/**
 * Get style definition by ID
 */
export function getStyleDefinition(styleId: VisualStyleType): VisualStyleDefinition {
  return VISUAL_STYLES[styleId];
}

/**
 * Get all available style options for UI display
 */
export function getStyleOptions(): Array<{ id: VisualStyleType; name: string; description: string; examplePrompt: string }> {
  return Object.values(VISUAL_STYLES).map(style => ({
    id: style.id,
    name: style.name,
    description: style.description,
    examplePrompt: style.examplePrompt,
  }));
}
