const P = '/pet-world/cute-fantasy/Buildings';
const D = `${P}/House_Decor`;

const T = 16;

const S_BED = `${D}/Beds.png`;
const S_TBL = `${D}/Tables.png`;
const S_CHR = `${D}/Chairs.png`;
const S_SHF = `${D}/BookShelves.png`;
const S_DOOR = `${D}/Doors.png`;
const S_WIN = `${D}/Windows_Single.png`;
const S_DECO = `${D}/Indoor_Decor.png`;
const S_ART = `${D}/Placeable_Decoration.png`;
const S_LAMP = `${D}/Standing_Lamps.png`;
const S_DRW = `${D}/Drawers.png`;
const S_PLT = `${D}/Planters.png`;
const S_FURN = `${D}/Furnace_Anim.png`;
const S_ANVL = `${D}/Anvil_Anim.png`;
const S_CHST = `${D}/Chest_Anim.png`;
const S_GCHST = `${D}/Golden_Chest_Anim.png`;

const rectSprite = (sheet, rect) => ({ sheet, rect });
const animSprite = (sheet, frameWidth, frameHeight, frameCount) => ({
  sheet,
  anim: { frameWidth, frameHeight, frameCount },
});

const matchesRect = (item, name, sheet, [sx, sy, sw, sh]) => (
  item?.n === name
  && item?.s === sheet
  && item?.sx === sx
  && item?.sy === sy
  && item?.sw === sw
  && item?.sh === sh
);

const matchesRectNameSet = (item, names, sheet, [sx, sy, sw, sh]) => (
  names.includes(item?.n)
  && item?.s === sheet
  && item?.sx === sx
  && item?.sy === sy
  && item?.sw === sw
  && item?.sh === sh
);

const matchesAnim = (item, name, sheet, frameWidth, frameHeight, frameCount) => (
  item?.n === name
  && item?.s === sheet
  && item?.anim === true
  && item?.fw === frameWidth
  && item?.fh === frameHeight
  && item?.fc === frameCount
);

const matchesBed = (item) => (
  item?.n === 'Bed'
  && item?.s === S_BED
  && item?.sx === 0
  && item?.sw === 32
  && item?.sh === 32
);

const matchesArmchair = (item) => (
  item?.n === 'Chair'
  && item?.s === S_CHR
  && item?.sx === 96
  && item?.sw === 32
  && item?.sh === 32
);

const matchesSofa = (item) => (
  item?.n === 'Sofa'
  && item?.s === S_CHR
  && item?.sx === 160
  && item?.sw === 48
  && item?.sh === 32
);

export const INTERIOR_BUILDING_TYPES = [
  'house',
  'large_house',
  'farm',
  'fishing_hut',
  'bakery',
  'woodcutters_hut',
  'stone_pit',
  'lumberyard',
  'quarry',
  'weaving_hut',
  'market',
  'trading_post',
  'storehouse',
  'warehouse',
  'town_hall',
  'shrine',
  'watchtower',
  'tavern',
];

export const ROOM_ANCHOR_ORDER = [
  'back_left',
  'back_center',
  'back_right',
  'left_edge',
  'center',
  'right_edge',
  'front_left',
  'front_center',
  'front_right',
];

export const ROOM_ANCHOR_LABELS = {
  back_left: 'Back Left',
  back_center: 'Back Center',
  back_right: 'Back Right',
  left_edge: 'Left Edge',
  center: 'Center',
  right_edge: 'Right Edge',
  front_left: 'Front Left',
  front_center: 'Front Center',
  front_right: 'Front Right',
};

export const INTERIOR_RULE_GLOSSARY = [
  {
    id: 'back_wall_only',
    label: 'Back wall only',
    description: 'The sprite reads correctly only when its back edge sits against the room’s back wall.',
  },
  {
    id: 'back_wall_left_wall_only',
    label: 'Back wall + left wall only',
    description: 'The sprite has a hard left cut-off and must live in the top-left corner of the room.',
  },
  {
    id: 'edge_only',
    label: 'Edge only',
    description: 'The piece should live on a wall edge or corner, not floating in the center walkway.',
  },
  {
    id: 'surface_only',
    label: 'Surface only',
    description: 'This is a tabletop accessory. It should sit on another surface, never directly on the floor.',
  },
  {
    id: 'relationship_only',
    label: 'Relationship only',
    description: 'This asset only makes sense in relation to another item, such as a chair around a table.',
  },
  {
    id: 'no_back_to_camera',
    label: 'No back-to-camera use',
    description: 'Do not fake a missing orientation. Leave that side empty until there is art for it.',
  },
];

export const INTERIOR_ITEM_RULES = [
  {
    id: 'window_a',
    label: 'Window (single arch)',
    family: 'Windows_Single.png',
    category: 'Wall',
    sprite: rectSprite(S_WIN, [0, 0, 32, 32]),
    matches: (item) => matchesRect(item, 'Window', S_WIN, [0, 0, 32, 32]),
    status: 'wired',
    placementKind: 'wall',
    validAnchors: ['back_left', 'back_center', 'back_right'],
    hardRules: ['Back wall only.', 'Keep tall furniture from covering the sill.'],
    softRules: ['Symmetry reads best when two windows flank a central focal point.'],
    avoid: ['Center floor', 'Front edge'],
    notes: 'Best for small houses and huts where the opening should sit high on the back wall.',
    invalidHint: 'This is a wall-mounted window. It should live on the back wall, not on the floor.',
    scenes: ['wall_pairing'],
    validators: ['wall_mount'],
  },
  {
    id: 'window_b',
    label: 'Window (wide arch)',
    family: 'Windows_Single.png',
    category: 'Wall',
    sprite: rectSprite(S_WIN, [64, 0, 32, 32]),
    matches: (item) => matchesRect(item, 'Window', S_WIN, [64, 0, 32, 32]),
    status: 'wired',
    placementKind: 'wall',
    validAnchors: ['back_left', 'back_center', 'back_right'],
    hardRules: ['Back wall only.', 'Leave enough space below for the frame to read cleanly.'],
    softRules: ['Works well as the dominant window on larger civic rooms.'],
    avoid: ['Center floor', 'Front edge'],
    notes: 'The wider arch reads as a more formal focal window.',
    invalidHint: 'Windows belong on the back wall only.',
    scenes: ['wall_pairing'],
    validators: ['wall_mount'],
  },
  {
    id: 'window_c',
    label: 'Window (round top)',
    family: 'Windows_Single.png',
    category: 'Wall',
    sprite: rectSprite(S_WIN, [0, 192, 32, 32]),
    matches: (item) => matchesRect(item, 'Window', S_WIN, [0, 192, 32, 32]),
    status: 'wired',
    placementKind: 'wall',
    validAnchors: ['back_left', 'back_center', 'back_right'],
    hardRules: ['Back wall only.'],
    softRules: ['Looks best centered in smaller utility buildings.'],
    avoid: ['Center floor', 'Front edge'],
    notes: 'A compact round-topped window suited to rustic interiors.',
    invalidHint: 'Windows should stay on the back wall.',
    scenes: ['wall_pairing'],
    validators: ['wall_mount'],
  },
  {
    id: 'window_d',
    label: 'Window (guard slit)',
    family: 'Windows_Single.png',
    category: 'Wall',
    sprite: rectSprite(S_WIN, [64, 192, 32, 32]),
    matches: (item) => matchesRect(item, 'Window', S_WIN, [64, 192, 32, 32]),
    status: 'wired',
    placementKind: 'wall',
    validAnchors: ['back_left', 'back_center', 'back_right'],
    hardRules: ['Back wall only.'],
    softRules: ['Good for stone rooms and watch points where you want a narrow view slit.'],
    avoid: ['Center floor', 'Front edge'],
    notes: 'This narrow window feels defensive, so keep it high and wall-bound.',
    invalidHint: 'Windows should stay on the back wall.',
    scenes: ['wall_pairing'],
    validators: ['wall_mount'],
  },
  {
    id: 'door_brown',
    label: 'Interior door (brown)',
    family: 'Doors.png',
    category: 'Wall',
    sprite: rectSprite(S_DOOR, [0, 0, 16, 32]),
    matches: (item) => matchesRect(item, 'Door', S_DOOR, [0, 0, 16, 32]),
    status: 'wired',
    placementKind: 'wall',
    validAnchors: ['back_left', 'back_center', 'back_right'],
    hardRules: ['Back wall only.', 'Leave clear walking space below the doorway.'],
    softRules: ['Center placement reads most naturally for a primary entrance.'],
    avoid: ['Center floor', 'Front edge'],
    notes: 'The door should feel like it opens out of the back wall, not sit as a floor prop.',
    invalidHint: 'Doors should be mounted on the back wall.',
    scenes: ['wall_pairing'],
    validators: ['wall_mount'],
  },
  {
    id: 'door_green',
    label: 'Interior door (green variant)',
    family: 'Doors.png',
    category: 'Wall',
    sprite: rectSprite(S_DOOR, [0, 128, 16, 32]),
    matches: () => false,
    status: 'available',
    placementKind: 'wall',
    validAnchors: ['back_left', 'back_center', 'back_right'],
    hardRules: ['Back wall only.', 'Leave clear walking space below the doorway.'],
    softRules: ['Use when you want a richer, more decorated door finish.'],
    avoid: ['Center floor', 'Front edge'],
    notes: 'Art is available but not currently used by the interior generator.',
    invalidHint: 'Doors should be mounted on the back wall.',
    scenes: ['wall_pairing'],
    validators: ['wall_mount'],
  },
  {
    id: 'painting_1',
    label: 'Painting (crest)',
    family: 'Placeable_Decoration.png',
    category: 'Wall',
    sprite: rectSprite(S_ART, [0, 0, 16, 16]),
    matches: (item) => matchesRect(item, 'Painting', S_ART, [0, 0, 16, 16]),
    status: 'wired',
    placementKind: 'wall',
    validAnchors: ['back_left', 'back_center', 'back_right'],
    hardRules: ['Back wall only.'],
    softRules: ['Use as accent art between bigger furniture masses.'],
    avoid: ['Floor placement'],
    notes: 'Small wall art reads best above back-row furniture or between windows.',
    invalidHint: 'Paintings belong on the back wall.',
    scenes: ['wall_pairing'],
    validators: ['wall_mount'],
  },
  {
    id: 'painting_2',
    label: 'Painting (portrait)',
    family: 'Placeable_Decoration.png',
    category: 'Wall',
    sprite: rectSprite(S_ART, [16, 0, 16, 16]),
    matches: (item) => matchesRect(item, 'Painting', S_ART, [16, 0, 16, 16]),
    status: 'wired',
    placementKind: 'wall',
    validAnchors: ['back_left', 'back_center', 'back_right'],
    hardRules: ['Back wall only.'],
    softRules: ['Use this as a narrow accent, not as a main centerpiece.'],
    avoid: ['Floor placement'],
    notes: 'The portrait format wants more breathing room than the square crest.',
    invalidHint: 'Paintings belong on the back wall.',
    scenes: ['wall_pairing'],
    validators: ['wall_mount'],
  },
  {
    id: 'painting_3',
    label: 'Painting (banner icon)',
    family: 'Placeable_Decoration.png',
    category: 'Wall',
    sprite: rectSprite(S_ART, [32, 0, 16, 16]),
    matches: (item) => matchesRect(item, 'Painting', S_ART, [32, 0, 16, 16]),
    status: 'wired',
    placementKind: 'wall',
    validAnchors: ['back_left', 'back_center', 'back_right'],
    hardRules: ['Back wall only.'],
    softRules: ['Strongest when centered over a formal room.'],
    avoid: ['Floor placement'],
    notes: 'This one reads more ceremonial, so it works well in civic interiors.',
    invalidHint: 'Paintings belong on the back wall.',
    scenes: ['wall_pairing'],
    validators: ['wall_mount'],
  },
  {
    id: 'bed_single',
    label: 'Bed',
    family: 'Beds.png',
    category: 'Sleep',
    sprite: rectSprite(S_BED, [0, 0, 32, 32]),
    matches: matchesBed,
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_center', 'back_right'],
    hardRules: ['Headboard against the back wall.', 'Leave at least one walk tile in front of the bed.'],
    softRules: ['Twin placements work best mirrored from the back corners inward.'],
    avoid: ['Center floor', 'Front edge'],
    notes: 'All bed colorways share the same geometry, so the same placement rule applies to every variant.',
    invalidHint: 'Beds should sit against the back wall with space in front to walk up to them.',
    scenes: ['sleeping_row'],
    validators: ['back_row'],
  },
  {
    id: 'wide_table_surface',
    label: 'Wide work surface',
    family: 'Tables.png',
    category: 'Surface',
    sprite: rectSprite(S_TBL, [0, 0, 48, 32]),
    matches: (item) => matchesRectNameSet(item, ['Desk', 'Prep Table', 'Work Table', 'Loom', 'Bar Counter', 'Counter'], S_TBL, [0, 0, 48, 32]),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_center', 'back_right', 'left_edge', 'right_edge'],
    hardRules: ['Keep one full walk tile in front of the long edge.', 'Best when one long edge is visually supported by a wall or room edge.'],
    softRules: ['Use the back wall for desks, counters, looms, and prep benches.', 'Side-edge placement also works when the open front stays readable.'],
    avoid: ['Front-center crowding'],
    notes: 'This sprite is versatile, but it still wants a supported back edge and clear working side.',
    invalidHint: 'This long surface wants wall support or an edge, plus open space in front.',
    scenes: ['work_wall'],
    validators: [],
  },
  {
    id: 'round_table',
    label: 'Round table / pedestal',
    family: 'Tables.png',
    category: 'Surface',
    sprite: rectSprite(S_TBL, [96, 0, 32, 32]),
    matches: (item) => matchesRectNameSet(item, ['Table', 'Dining Table', 'Counter'], S_TBL, [96, 0, 32, 32]),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_center', 'back_right', 'left_edge', 'center', 'right_edge', 'front_left', 'front_center', 'front_right'],
    hardRules: ['If used for seating, only the top, left, and right chair positions are valid.', 'Do not fake a bottom chair until there is art for a back-to-camera seat.'],
    softRules: ['Use the center for social tables.', 'Use the edges for side tables, counters, or lookout stands.'],
    avoid: ['Overcrowded corners when paired with chairs'],
    notes: 'The same round table art is used as a dining table, service counter, and small side surface.',
    invalidHint: 'This table can move around the room, but dining chairs only belong on its top, left, and right sides.',
    scenes: ['dining_set', 'tabletop_accessories'],
    validators: [],
  },
  {
    id: 'tabletop_planter',
    label: 'Tabletop planter',
    family: 'Planters.png',
    category: 'Surface Accessory',
    sprite: rectSprite(S_PLT, [0, 0, 32, 16]),
    matches: (item) => matchesRect(item, 'Plant', S_PLT, [0, 0, 32, 16]),
    status: 'wired',
    placementKind: 'surface',
    validAnchors: [],
    hardRules: ['Table surface only.', 'It should visually sit on a table or counter, never on bare floor.'],
    softRules: ['Center it on the surface so it reads as tabletop decor rather than a floor planter.'],
    avoid: ['Any bare floor tile'],
    notes: 'This asset is a topper, not a freestanding room object.',
    invalidHint: 'This planter should sit on a table or counter, not on the floor.',
    scenes: ['tabletop_accessories'],
    validators: ['support_surface'],
  },
  {
    id: 'tabletop_supplies',
    label: 'Tabletop supplies',
    family: 'Indoor_Decor.png',
    category: 'Surface Accessory',
    sprite: rectSprite(S_DECO, [16, 176, 16, 16]),
    matches: (item) => matchesRect(item, 'Supplies', S_DECO, [16, 176, 16, 16]),
    status: 'wired',
    placementKind: 'surface',
    validAnchors: [],
    hardRules: ['Table surface only.'],
    softRules: ['Group it slightly off-center so it reads as a casual stack of goods.'],
    avoid: ['Bare floor placement'],
    notes: 'The same crate art reads as a supply pile only when it sits on top of a larger surface.',
    invalidHint: 'This supply stack should sit on a table or counter surface.',
    scenes: ['tabletop_accessories'],
    validators: ['support_surface'],
  },
  {
    id: 'chair_left_of_table',
    label: 'Dining chair (left of table)',
    family: 'Chairs.png',
    category: 'Seating',
    sprite: rectSprite(S_CHR, [64, 0, 16, 32]),
    matches: (item) => matchesRect(item, 'Chair', S_CHR, [64, 0, 16, 32]),
    status: 'wired',
    placementKind: 'relationship',
    validAnchors: [],
    hardRules: ['Must sit on the left side of a table.', 'The open seat side should face right into the table.'],
    softRules: ['Leave a little space between the chair back and the room edge so it feels usable.'],
    avoid: ['Standalone placement', 'Right side of table', 'Below the table'],
    notes: 'This is the right-facing side chair. It only makes sense when a table is directly to its right.',
    invalidHint: 'This chair only works on the left side of a table, with its seat opening toward the table.',
    scenes: ['dining_set'],
    validators: ['chair_left_of_table'],
  },
  {
    id: 'chair_right_of_table',
    label: 'Dining chair (right of table)',
    family: 'Chairs.png',
    category: 'Seating',
    sprite: rectSprite(S_CHR, [16, 0, 16, 32]),
    matches: (item) => matchesRect(item, 'Chair', S_CHR, [16, 0, 16, 32]),
    status: 'wired',
    placementKind: 'relationship',
    validAnchors: [],
    hardRules: ['Must sit on the right side of a table.', 'The open seat side should face left into the table.'],
    softRules: ['Leave breathing room behind the chair so the silhouette stays legible.'],
    avoid: ['Standalone placement', 'Left side of table', 'Below the table'],
    notes: 'This is the left-facing side chair. It only works when a table is directly to its left.',
    invalidHint: 'This chair only works on the right side of a table, with its seat opening toward the table.',
    scenes: ['dining_set'],
    validators: ['chair_right_of_table'],
  },
  {
    id: 'chair_top_of_table',
    label: 'Dining chair (top of table)',
    family: 'Chairs.png',
    category: 'Seating',
    sprite: rectSprite(S_CHR, [32, 0, 32, 32]),
    matches: (item) => matchesRect(item, 'Chair', S_CHR, [32, 0, 32, 32]),
    status: 'wired',
    placementKind: 'relationship',
    validAnchors: [],
    hardRules: ['Must sit above the table.', 'Never use it below the table because that would show the chair back to the camera.'],
    softRules: ['The top seat works best centered to the table.'],
    avoid: ['Bottom side of table', 'Standalone placement'],
    notes: 'This is the only front-facing dining chair art we have, so the bottom seat position should remain empty.',
    invalidHint: 'This chair belongs above a table only. The bottom seat is invalid until there is a back-to-camera chair asset.',
    scenes: ['dining_set'],
    validators: ['chair_top_of_table'],
  },
  {
    id: 'armchair_front',
    label: 'Armchair',
    family: 'Chairs.png',
    category: 'Seating',
    sprite: rectSprite(S_CHR, [96, 100, 32, 32]),
    matches: matchesArmchair,
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['left_edge', 'center', 'right_edge', 'front_left', 'front_center', 'front_right'],
    hardRules: ['Front-facing seating piece.', 'Give the seat open space in front so it reads as usable.'],
    softRules: ['Works well in meeting rooms or reading nooks.'],
    avoid: ['Back wall crowding'],
    notes: 'Because the chair faces the camera, it belongs in the lower half of the room instead of being crushed into the top wall.',
    invalidHint: 'This front-facing chair wants space in front of it, not the back wall pressed right behind it.',
    scenes: ['meeting_nook'],
    validators: [],
  },
  {
    id: 'sofa_front',
    label: 'Sofa',
    family: 'Chairs.png',
    category: 'Seating',
    sprite: rectSprite(S_CHR, [160, 0, 48, 32]),
    matches: matchesSofa,
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['left_edge', 'right_edge', 'front_left', 'front_center', 'front_right'],
    hardRules: ['Front-facing seating piece.', 'Keep the sofa in the lower half or on a side edge so the backrest reads naturally.'],
    softRules: ['Use as a lounge anchor, not as a wall-hugging back-row object.'],
    avoid: ['Back wall placements'],
    notes: 'Sofas want breathing room in front of them and work best as a social anchor in the lower room.',
    invalidHint: 'This sofa should sit in the lower half or on a side edge, not be jammed into the back wall.',
    scenes: ['meeting_nook'],
    validators: [],
  },
  {
    id: 'bookshelf_small',
    label: 'Small shelf / display',
    family: 'BookShelves.png',
    category: 'Storage',
    sprite: rectSprite(S_SHF, [0, 0, 32, 32]),
    matches: (item) => matchesRectNameSet(item, ['Shelf', 'Display'], S_SHF, [0, 0, 32, 32]),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_center', 'back_right', 'left_edge', 'right_edge', 'front_left', 'front_right'],
    hardRules: ['Edge-only storage piece.', 'Keep it off the center walkway.'],
    softRules: ['Works best as a market edge display or side-wall shelf.'],
    avoid: ['Center floor'],
    notes: 'This shelf reads as a small side display. It can work on several edges, but it should not float in open floor.',
    invalidHint: 'This shelf should stay on a wall edge or corner, not in the center of the room.',
    scenes: ['edge_storage'],
    validators: ['edge_only'],
  },
  {
    id: 'bookshelf_medium_left',
    label: 'Bookshelf (left-corner only)',
    family: 'BookShelves.png',
    category: 'Storage',
    sprite: rectSprite(S_SHF, [32, 0, 32, 48]),
    matches: (item) => matchesRect(item, 'Bookshelf', S_SHF, [32, 0, 32, 48]),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left'],
    hardRules: ['Back wall + left wall only.', 'The flat left edge must touch the left wall.'],
    softRules: ['Do not mirror in your head; leave the right corner empty until there is a matching sprite.'],
    avoid: ['Back center', 'Back right', 'Any open floor placement'],
    notes: 'This is the shelf you called out. Its geometry only makes sense in the top-left corner with the open face reading toward the room.',
    invalidHint: 'This bookshelf only works in the top-left corner because its flat left edge has to touch the left wall.',
    scenes: ['corner_library'],
    validators: ['top_left_corner'],
  },
  {
    id: 'bookshelf_wide',
    label: 'Wide bookshelf',
    family: 'BookShelves.png',
    category: 'Storage',
    sprite: rectSprite(S_SHF, [96, 0, 64, 48]),
    matches: () => false,
    status: 'available',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_center', 'back_right'],
    hardRules: ['Back wall only.', 'Treat it like a long storage span with clear room in front.'],
    softRules: ['Use in larger houses or civic rooms where you want a full wall library.'],
    avoid: ['Center floor', 'Front edge'],
    notes: 'Art exists, but the current generator never places this wide shelf.',
    invalidHint: 'This wide shelf should sit against the back wall.',
    scenes: ['corner_library'],
    validators: ['back_row'],
  },
  {
    id: 'lamp_a',
    label: 'Standing lamp (small shade)',
    family: 'Standing_Lamps.png',
    category: 'Lighting',
    sprite: rectSprite(S_LAMP, [0, 0, 16, 32]),
    matches: (item) => matchesRect(item, 'Lamp', S_LAMP, [0, 0, 16, 32]),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_right', 'left_edge', 'right_edge', 'front_left', 'front_right'],
    hardRules: ['Edge-only lighting piece.', 'Do not block the main walkway with a standing lamp.'],
    softRules: ['Corners and side edges read best.'],
    avoid: ['Center floor', 'Front center'],
    notes: 'Standing lamps want to live on the room edge like practical accent lighting.',
    invalidHint: 'Standing lamps should stay on room edges and corners, not in the middle of the path.',
    scenes: ['edge_storage'],
    validators: ['edge_only'],
  },
  {
    id: 'lamp_b',
    label: 'Standing lamp (tall shade)',
    family: 'Standing_Lamps.png',
    category: 'Lighting',
    sprite: rectSprite(S_LAMP, [16, 0, 16, 32]),
    matches: (item) => matchesRect(item, 'Lamp', S_LAMP, [16, 0, 16, 32]),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_right', 'left_edge', 'right_edge', 'front_left', 'front_right'],
    hardRules: ['Edge-only lighting piece.', 'Do not block the main walkway with a standing lamp.'],
    softRules: ['The taller lamp works well as a symmetric pair.'],
    avoid: ['Center floor', 'Front center'],
    notes: 'Use this variant the same way as the smaller lamp: on edges and corners.',
    invalidHint: 'Standing lamps should stay on room edges and corners, not in the middle of the path.',
    scenes: ['edge_storage'],
    validators: ['edge_only'],
  },
  {
    id: 'drawer_a',
    label: 'Cabinet / drawers (solid)',
    family: 'Drawers.png',
    category: 'Storage',
    sprite: rectSprite(S_DRW, [0, 0, 32, 32]),
    matches: (item) => matchesRectNameSet(item, ['Cabinet', 'Drawer'], S_DRW, [0, 0, 32, 32]),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_center', 'back_right', 'left_edge', 'right_edge'],
    hardRules: ['Back or side edge only.', 'Keep the room center open.'],
    softRules: ['Works well as a support piece beside beds or along workshop walls.'],
    avoid: ['Center floor', 'Front center'],
    notes: 'This is a wall-supporting storage block. It reads best when one face is anchored to the room edge.',
    invalidHint: 'Cabinets and drawers should sit against a wall or side edge, not in open floor.',
    scenes: ['edge_storage'],
    validators: ['back_or_side_edge'],
  },
  {
    id: 'drawer_b',
    label: 'Cabinet / drawers (open shelf)',
    family: 'Drawers.png',
    category: 'Storage',
    sprite: rectSprite(S_DRW, [32, 0, 32, 32]),
    matches: (item) => matchesRectNameSet(item, ['Cabinet', 'Drawer'], S_DRW, [32, 0, 32, 32]),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_center', 'back_right', 'left_edge', 'right_edge'],
    hardRules: ['Back or side edge only.', 'Keep the room center open.'],
    softRules: ['Pairs well with storage and utility buildings.'],
    avoid: ['Center floor', 'Front center'],
    notes: 'Same spatial rule as the solid cabinet: support it against a wall or edge.',
    invalidHint: 'Cabinets and drawers should sit against a wall or side edge, not in open floor.',
    scenes: ['edge_storage'],
    validators: ['back_or_side_edge'],
  },
  {
    id: 'barrel',
    label: 'Barrel',
    family: 'Indoor_Decor.png',
    category: 'Storage',
    sprite: rectSprite(S_DECO, [0, 176, 16, 16]),
    matches: (item) => matchesRect(item, 'Barrel', S_DECO, [0, 176, 16, 16]),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_right', 'left_edge', 'right_edge', 'front_left', 'front_right'],
    hardRules: ['Edge-only clutter piece.', 'Cluster it near walls or corners, not in the center walkway.'],
    softRules: ['Barrels work best in pairs or tucked beside larger utility furniture.'],
    avoid: ['Center floor'],
    notes: 'Barrels are excellent edge clutter, but they instantly look wrong when left floating in the room center.',
    invalidHint: 'Barrels should stay on the room edges and out of the main walking lane.',
    scenes: ['edge_storage'],
    validators: ['edge_only'],
  },
  {
    id: 'crate_floor',
    label: 'Floor crate',
    family: 'Indoor_Decor.png',
    category: 'Storage',
    sprite: rectSprite(S_DECO, [16, 176, 16, 16]),
    matches: (item) => matchesRect(item, 'Crate', S_DECO, [16, 176, 16, 16]),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_right', 'left_edge', 'right_edge', 'front_left', 'front_right'],
    hardRules: ['Edge-only clutter piece.', 'Keep it out of the center walkway.'],
    softRules: ['Reads well beside barrels, cabinets, or counters.'],
    avoid: ['Center floor'],
    notes: 'The floor crate should behave like edge clutter unless it is intentionally placed on top of another surface.',
    invalidHint: 'Floor crates should stay near edges or corners, not in the middle of the room.',
    scenes: ['edge_storage'],
    validators: ['edge_only'],
  },
  {
    id: 'flower_pot_tall',
    label: 'Floor pot (tall)',
    family: 'Planters.png',
    category: 'Nature',
    sprite: rectSprite(S_PLT, [0, 48, 16, 32]),
    matches: (item) => (
      ['Plant', 'Flower Pot'].includes(item?.n)
      && item?.s === S_PLT
      && item?.sx === 0
      && item?.sy === 48
      && item?.sw === 16
      && item?.sh === 32
    ),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_right', 'left_edge', 'right_edge', 'front_left', 'front_right'],
    hardRules: ['Edge-only accent piece.'],
    softRules: ['Use in corners, door flanks, or beside storage, not in the center path.'],
    avoid: ['Center floor'],
    notes: 'The tall pot is a wall-edge accent, not a centerpiece.',
    invalidHint: 'Floor pots should stay on edges or corners so the center walkway stays open.',
    scenes: ['edge_storage'],
    validators: ['edge_only'],
  },
  {
    id: 'flower_pot_bloom',
    label: 'Floor pot (blooming)',
    family: 'Planters.png',
    category: 'Nature',
    sprite: rectSprite(S_PLT, [32, 48, 16, 32]),
    matches: (item) => (
      ['Plant', 'Flower Pot'].includes(item?.n)
      && item?.s === S_PLT
      && item?.sx === 32
      && item?.sy === 48
      && item?.sw === 16
      && item?.sh === 32
    ),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_right', 'left_edge', 'right_edge', 'front_left', 'front_right'],
    hardRules: ['Edge-only accent piece.'],
    softRules: ['Use as a stronger color accent on room edges.'],
    avoid: ['Center floor'],
    notes: 'Same rule as the tall pot: keep it on the perimeter.',
    invalidHint: 'Floor pots should stay on edges or corners so the center walkway stays open.',
    scenes: ['edge_storage'],
    validators: ['edge_only'],
  },
  {
    id: 'furnace',
    label: 'Furnace',
    family: 'Furnace_Anim.png',
    category: 'Workshop',
    sprite: animSprite(S_FURN, 16, 32, 5),
    matches: (item) => matchesAnim(item, 'Furnace', S_FURN, 16, 32, 5),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_center', 'back_right'],
    hardRules: ['Back wall only.', 'Keep the front clear so it reads as a working station.'],
    softRules: ['Corner placement works especially well for ovens and kilns.'],
    avoid: ['Center floor', 'Front edge'],
    notes: 'Heat-source stations should be anchored to the back wall so the chimney/body reads correctly.',
    invalidHint: 'This furnace should sit against the back wall with open space in front.',
    scenes: ['work_wall'],
    validators: ['back_row'],
  },
  {
    id: 'anvil',
    label: 'Anvil',
    family: 'Anvil_Anim.png',
    category: 'Workshop',
    sprite: animSprite(S_ANVL, 16, 16, 8),
    matches: (item) => matchesAnim(item, 'Anvil', S_ANVL, 16, 16, 8),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_left', 'back_center', 'back_right', 'left_edge', 'right_edge'],
    hardRules: ['Workshop edge station.', 'Do not leave it floating in the room center.'],
    softRules: ['Pair it with a work table or storage near the same edge.'],
    avoid: ['Center floor', 'Front center'],
    notes: 'The anvil is compact, but it still wants to feel like a wall-side workstation.',
    invalidHint: 'Anvils should stay on the room edge, not floating in the center.',
    scenes: ['work_wall'],
    validators: ['edge_only'],
  },
  {
    id: 'chest',
    label: 'Chest',
    family: 'Chest_Anim.png',
    category: 'Treasure',
    sprite: animSprite(S_CHST, 16, 16, 6),
    matches: (item) => matchesAnim(item, 'Chest', S_CHST, 16, 16, 6),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_center', 'center', 'front_center', 'left_edge', 'right_edge'],
    hardRules: ['Leave at least one approach side clear.'],
    softRules: ['Use center placements for reward focal points and edge placements for storage rooms.'],
    avoid: ['Deep corner pinning'],
    notes: 'Unlike barrels and crates, treasure chests can be focal points as long as the player can approach them.',
    invalidHint: 'Treasure chests need at least one open approach side.',
    scenes: ['treasure_focus'],
    validators: [],
  },
  {
    id: 'golden_chest',
    label: 'Golden chest',
    family: 'Golden_Chest_Anim.png',
    category: 'Treasure',
    sprite: animSprite(S_GCHST, 16, 16, 6),
    matches: (item) => matchesAnim(item, 'Golden Chest', S_GCHST, 16, 16, 6),
    status: 'wired',
    placementKind: 'room',
    validAnchors: ['back_center', 'center', 'front_center'],
    hardRules: ['Treat as a focal treasure piece.', 'Leave a clear approach side.'],
    softRules: ['Center or shrine-like placements read best.'],
    avoid: ['Cramped corners'],
    notes: 'The golden chest wants to feel important, so it reads best as a focal object.',
    invalidHint: 'Golden chests should feel like focal pieces with clear access.',
    scenes: ['treasure_focus'],
    validators: [],
  },
];

export const INTERIOR_RELATIONSHIP_SCENES = [
  {
    id: 'dining_set',
    label: 'Dining set relationship',
    description: 'The round table supports three visible seating sides only: left, right, and top. The bottom side stays empty until there is a back-to-camera chair sprite.',
    placements: [
      { ruleId: 'round_table', x: 122, y: 88 },
      { ruleId: 'chair_left_of_table', x: 90, y: 88 },
      { ruleId: 'chair_right_of_table', x: 178, y: 88 },
      { ruleId: 'chair_top_of_table', x: 122, y: 58 },
    ],
    warning: 'Bottom-side chair is intentionally omitted.',
  },
  {
    id: 'tabletop_accessories',
    label: 'Surface accessory relationship',
    description: 'Small decor like planters and supply stacks only read correctly when they sit on a larger surface.',
    placements: [
      { ruleId: 'round_table', x: 122, y: 92 },
      { ruleId: 'tabletop_planter', x: 120, y: 92 },
      { ruleId: 'tabletop_supplies', x: 144, y: 104 },
    ],
    warning: 'These pieces should never be dropped directly on the floor.',
  },
  {
    id: 'corner_library',
    label: 'Corner library relationship',
    description: 'The medium bookshelf sprite is corner-locked: its back touches the back wall and its flat left edge touches the left wall.',
    placements: [
      { ruleId: 'bookshelf_medium_left', x: 34, y: 52 },
      { ruleId: 'bookshelf_small', x: 86, y: 98 },
    ],
    warning: 'There is no mirrored right-corner companion in the current wired set.',
  },
  {
    id: 'work_wall',
    label: 'Workshop wall relationship',
    description: 'Work surfaces, furnaces, and anvils all read best when they hug the room edge and leave an open working side.',
    placements: [
      { ruleId: 'furnace', x: 32, y: 58 },
      { ruleId: 'wide_table_surface', x: 96, y: 84 },
      { ruleId: 'anvil', x: 220, y: 96 },
    ],
    warning: 'Keep the player-facing side clear so the station remains usable.',
  },
  {
    id: 'meeting_nook',
    label: 'Front-facing seating relationship',
    description: 'Armchairs and sofas are front-facing pieces, so they belong in the lower half or along the side edges where their backrests feel natural.',
    placements: [
      { ruleId: 'armchair_front', x: 86, y: 100 },
      { ruleId: 'round_table', x: 130, y: 90 },
      { ruleId: 'sofa_front', x: 178, y: 102 },
    ],
    warning: 'Do not crush front-facing seating into the back wall.',
  },
  {
    id: 'edge_storage',
    label: 'Edge storage relationship',
    description: 'Shelves, cabinets, barrels, crates, lamps, and floor pots all read best when they support the room perimeter instead of blocking the center lane.',
    placements: [
      { ruleId: 'drawer_a', x: 34, y: 66 },
      { ruleId: 'barrel', x: 90, y: 114 },
      { ruleId: 'crate_floor', x: 114, y: 114 },
      { ruleId: 'lamp_a', x: 214, y: 96 },
      { ruleId: 'flower_pot_tall', x: 246, y: 98 },
    ],
    warning: 'Treat these as edge clutter and support pieces, not centerpieces.',
  },
  {
    id: 'treasure_focus',
    label: 'Treasure focus relationship',
    description: 'Treasure chests can sit more centrally than generic storage, but they still need a clear approach side so they feel accessible.',
    placements: [
      { ruleId: 'golden_chest', x: 122, y: 90 },
      { ruleId: 'bookshelf_small', x: 52, y: 88 },
      { ruleId: 'lamp_b', x: 226, y: 98 },
    ],
    warning: 'Leave the front or one side open for access.',
  },
  {
    id: 'sleeping_row',
    label: 'Sleeping wall relationship',
    description: 'Beds want the back wall, and supporting furniture should stay on edges so the sleeping row still feels walkable.',
    placements: [
      { ruleId: 'bed_single', x: 40, y: 80 },
      { ruleId: 'bed_single', x: 172, y: 80 },
      { ruleId: 'drawer_b', x: 116, y: 84 },
    ],
    warning: 'Keep the front of the bed clear for foot traffic.',
  },
  {
    id: 'wall_pairing',
    label: 'Back wall relationship',
    description: 'Doors, windows, and paintings all belong to the back wall layer. Use them to frame the room, not as floor props.',
    placements: [
      { ruleId: 'window_a', x: 58, y: 44 },
      { ruleId: 'door_brown', x: 124, y: 60 },
      { ruleId: 'window_b', x: 184, y: 44 },
      { ruleId: 'painting_1', x: 92, y: 28 },
    ],
    warning: 'These are wall objects and should never drop to the floor plane.',
  },
];

export const INTERIOR_UNWIRED_ASSETS = [
  {
    id: 'door_green_note',
    label: 'Green door variant',
    sprite: rectSprite(S_DOOR, [0, 128, 16, 32]),
    note: 'Art exists, but the current interior generator never places this door.',
  },
  {
    id: 'bookshelf_wide_note',
    label: 'Wide bookshelf',
    sprite: rectSprite(S_SHF, [96, 0, 64, 48]),
    note: 'Large back-wall shelf art exists, but it is not used in the current room layouts.',
  },
  {
    id: 'double_window_sheet_note',
    label: 'Windows_Double.png sheet',
    sprite: null,
    note: 'A double-window sheet exists in the art folder, but the current interior renderer only uses Windows_Single.png.',
  },
  {
    id: 'metal_chest_sheet_note',
    label: 'Metal / jeweled chest variants',
    sprite: null,
    note: 'Additional chest sheets are present but not wired into the current generator.',
  },
];

export function getInteriorRuleById(ruleId) {
  return INTERIOR_ITEM_RULES.find((rule) => rule.id === ruleId) || null;
}

export function getInteriorRuleForItem(item) {
  return INTERIOR_ITEM_RULES.find((rule) => rule.matches(item)) || null;
}

export function getRelationshipSceneById(sceneId) {
  return INTERIOR_RELATIONSHIP_SCENES.find((scene) => scene.id === sceneId) || null;
}

export function getAnchorLabel(anchorId) {
  return ROOM_ANCHOR_LABELS[anchorId] || anchorId;
}

function getItemWidthTiles(item, rule) {
  const width = item?.anim ? item.fw : item?.sw || rule?.sprite?.rect?.[2] || rule?.sprite?.anim?.frameWidth || 0;
  return width / T;
}

function getItemHeightTiles(item, rule) {
  const height = item?.anim ? item.fh : item?.sh || rule?.sprite?.rect?.[3] || rule?.sprite?.anim?.frameHeight || 0;
  return height / T;
}

function approx(a, b, epsilon = 0.3) {
  return Math.abs(a - b) <= epsilon;
}

function isPotentialTable(item) {
  return item?.s === S_TBL && !item?.anim;
}

function findSupportingSurface(item, roomItems) {
  const centerX = item.x + (item.sw || item.fw || 0) / T / 2;
  const centerY = item.y + (item.sh || item.fh || 0) / T / 2;
  return roomItems.find((candidate) => {
    if (candidate === item || !isPotentialTable(candidate)) return false;
    const width = candidate.sw / T;
    const height = candidate.sh / T;
    const withinX = centerX >= candidate.x - 0.1 && centerX <= candidate.x + width + 0.1;
    const withinY = centerY >= candidate.y + 0.4 && centerY <= candidate.y + height + 0.8;
    return withinX && withinY;
  }) || null;
}

function findTableRelativeToChair(item, roomItems, mode) {
  return roomItems.find((candidate) => {
    if (candidate === item || !isPotentialTable(candidate)) return false;
    if (mode === 'left') {
      return approx(candidate.x, item.x + 1, 0.6) && approx(candidate.y, item.y - 0.5, 0.6);
    }
    if (mode === 'right') {
      return approx(candidate.x, item.x - 1, 0.6) && approx(candidate.y, item.y - 0.5, 0.6);
    }
    if (mode === 'top') {
      return approx(candidate.x, item.x, 0.6) && approx(candidate.y, item.y + 1, 0.6);
    }
    return false;
  }) || null;
}

function isEdgePlacement(item, room, rule) {
  const width = getItemWidthTiles(item, rule);
  const height = getItemHeightTiles(item, rule);
  const nearBack = item.y <= 0.25;
  const nearLeft = item.x <= 0.25;
  const nearRight = item.x + width >= room.cols - 0.25;
  const nearFront = item.y + height >= room.fRows - 0.25;
  return nearBack || nearLeft || nearRight || nearFront;
}

function isBackOrSideEdgePlacement(item, room, rule) {
  const width = getItemWidthTiles(item, rule);
  const nearBack = item.y <= 0.25;
  const nearLeft = item.x <= 0.25;
  const nearRight = item.x + width >= room.cols - 0.25;
  return nearBack || nearLeft || nearRight;
}

function validateRulePlacement(rule, item, room) {
  const issues = [];
  for (const validator of rule.validators || []) {
    if (validator === 'wall_mount' && item.z !== 'w') {
      issues.push('Should be mounted on the back wall, not placed on the floor layer.');
    }
    if (validator === 'back_row' && item.y > 0.25) {
      issues.push('Should sit against the back wall/top row.');
    }
    if (validator === 'top_left_corner' && (item.x > 0.25 || item.y > 0.25)) {
      issues.push('Only valid in the top-left corner because the sprite needs both the back wall and the left wall.');
    }
    if (validator === 'edge_only' && !isEdgePlacement(item, room, rule)) {
      issues.push('Should stay on a wall edge or corner instead of the center walkway.');
    }
    if (validator === 'back_or_side_edge' && !isBackOrSideEdgePlacement(item, room, rule)) {
      issues.push('Should sit against the back wall or a side edge, not free-float in open floor.');
    }
    if (validator === 'support_surface' && !findSupportingSurface(item, room.items)) {
      issues.push('Needs a supporting table or counter surface underneath it.');
    }
    if (validator === 'chair_left_of_table' && !findTableRelativeToChair(item, room.items, 'left')) {
      issues.push('Must sit on the left side of a table with the seat opening toward it.');
    }
    if (validator === 'chair_right_of_table' && !findTableRelativeToChair(item, room.items, 'right')) {
      issues.push('Must sit on the right side of a table with the seat opening toward it.');
    }
    if (validator === 'chair_top_of_table' && !findTableRelativeToChair(item, room.items, 'top')) {
      issues.push('Must sit above a table. Using it below a table would show the chair back to the camera.');
    }
  }
  return issues;
}

export function buildInteriorUsageMap(buildRoom, buildingTypes = INTERIOR_BUILDING_TYPES) {
  const usage = new Map();
  INTERIOR_ITEM_RULES.forEach((rule) => usage.set(rule.id, new Set()));

  for (const buildingType of buildingTypes) {
    for (const level of [1, 2, 3]) {
      const room = buildRoom(buildingType, level);
      for (const item of room.items) {
        const rule = getInteriorRuleForItem(item);
        if (rule) usage.get(rule.id).add(buildingType);
      }
    }
  }

  return usage;
}

export function auditInteriorRooms(buildRoom, buildingTypes = INTERIOR_BUILDING_TYPES) {
  const issues = [];

  for (const buildingType of buildingTypes) {
    for (const level of [1, 2, 3]) {
      const room = buildRoom(buildingType, level);
      for (const item of room.items) {
        const rule = getInteriorRuleForItem(item);
        if (!rule) continue;
        const itemIssues = validateRulePlacement(rule, item, room);
        itemIssues.forEach((message) => {
          issues.push({
            ruleId: rule.id,
            buildingType,
            level,
            itemName: item.n,
            message,
          });
        });
      }
    }
  }

  return issues;
}
