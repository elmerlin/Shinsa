import type { ImageSourcePropType } from 'react-native';

export const PET_UI_ASSETS = {
  food: require('../assets/pet-ui/food.png'),
  happy: require('../assets/pet-ui/happy.png'),
  energy: require('../assets/pet-ui/energy.png'),
  trust: require('../assets/pet-ui/trust.png'),
  momentum: require('../assets/pet-ui/momentum.png'),
  trick: require('../assets/pet-ui/trick.png'),
  mission: require('../assets/pet-ui/mission.png'),
  toy: require('../assets/pet-ui/toy.png'),
  outfit: require('../assets/pet-ui/outfit.png'),
  habitat: require('../assets/pet-ui/habitat.png'),
  shop: require('../assets/pet-ui/shop.png'),
  leaderboard: require('../assets/pet-ui/leaderboard.png'),
  groom: require('../assets/pet-ui/groom.png'),
  rest: require('../assets/pet-ui/rest.png'),
  spar: require('../assets/pet-ui/spar.png'),
  explore: require('../assets/pet-ui/explore.png'),
} satisfies Record<string, ImageSourcePropType>;

export type PetUiAssetKey = keyof typeof PET_UI_ASSETS;
