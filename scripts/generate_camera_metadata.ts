/**
 * 摄像头元数据生成脚本
 * 根据用户提供的170条规则生成每个摄像头的metadata
 *
 * 使用方法:
 * npx tsx scripts/generate_camera_metadata.ts
 */

type CameraMetadata = {
  primaryType:
    | 'aurora'
    | 'mountain'
    | 'ski-resort'
    | 'cultural-landmark'
    | 'nature'
    | 'railway-station'
    | 'street'
    | 'ocean'
    | 'city-skyline'
    | 'beach'
    | 'harbor'
    | 'railway-view'
    | 'village'
    | 'airport'
    | 'skating-rink'
    | 'river'
    | 'volcano';

  isFarpoint: boolean;
  tier: 't0' | 't1' | 't2' | 't3';
  resolution: '720p' | '1080p' | '高1080p' | '4k';

  viewingTime: {
    dayOnly: boolean;
    nightOnly: boolean;
    noSleepTime: boolean;
    anytime: boolean;
  };

  weatherTolerance: {
    clear: boolean;
    partlyCloudy: boolean;
    lightRain: boolean;
    lightSnow: boolean;
  };

  isEventDriven?: boolean;
};

/**
 * 摄像头元数据映射表
 * 基于用户提供的170条规则手动生成
 */
export const CAMERA_METADATA_MAP: Record<number, CameraMetadata> = {
  // 1: Aurora极光
  1: {
    primaryType: 'aurora',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: true, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 2: Mountain Fuji - farpoint
  2: {
    primaryType: 'mountain',
    isFarpoint: true,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: true, lightSnow: false },
  },

  // 3: Ski Resort
  3: {
    primaryType: 'ski-resort',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 4: Cultural Landmark (历史建筑)
  4: {
    primaryType: 'cultural-landmark',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 5: Nature - farpoint
  5: {
    primaryType: 'nature',
    isFarpoint: true,
    tier: 't3',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 6: Railway Station
  6: {
    primaryType: 'railway-station',
    isFarpoint: false,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: true, lightSnow: false },
  },

  // 7: Street - 事件导向
  7: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: true, lightSnow: false },
    isEventDriven: true,
  },

  // 8: Street - 时间导向
  8: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't0',
    resolution: '高1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: true, lightSnow: false },
  },

  // 9: Nature
  9: {
    primaryType: 'nature',
    isFarpoint: false,
    tier: 't1',
    resolution: '高1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 10: Railway + Beach - 事件导向
  10: {
    primaryType: 'beach',
    isFarpoint: false,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
    isEventDriven: true,
  },

  // 11: City Skyline - farpoint
  11: {
    primaryType: 'city-skyline',
    isFarpoint: true,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 12: City Skyline - farpoint, clear only
  12: {
    primaryType: 'city-skyline',
    isFarpoint: true,
    tier: 't1',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 13: City Skyline - farpoint
  13: {
    primaryType: 'city-skyline',
    isFarpoint: true,
    tier: 't0',
    resolution: '高1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 14: Railway Station - 事件导向
  14: {
    primaryType: 'railway-station',
    isFarpoint: false,
    tier: 't0',
    resolution: '高1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: true, lightSnow: false },
    isEventDriven: true,
  },

  // 15: Cultural Landmark
  15: {
    primaryType: 'cultural-landmark',
    isFarpoint: false,
    tier: 't2',
    resolution: '720p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 16: Beach
  16: {
    primaryType: 'beach',
    isFarpoint: false,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 17: Mountain
  17: {
    primaryType: 'mountain',
    isFarpoint: false,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 18: Street
  18: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 19: Nature
  19: {
    primaryType: 'nature',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 20: Street
  20: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 21: Beach
  21: {
    primaryType: 'beach',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 22: Street
  22: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 23: Street + Cultural Landmark
  23: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't1',
    resolution: '高1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 24: Ocean - farpoint
  24: {
    primaryType: 'ocean',
    isFarpoint: true,
    tier: 't0',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 25: Aurora
  25: {
    primaryType: 'aurora',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: true, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 26: Nature
  26: {
    primaryType: 'nature',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 27: Harbor
  27: {
    primaryType: 'harbor',
    isFarpoint: false,
    tier: 't0',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 28: Street
  28: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 29: Ski Resort
  29: {
    primaryType: 'ski-resort',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 30: Ski Resort (雪地)
  30: {
    primaryType: 'ski-resort',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 31: Ski Resort
  31: {
    primaryType: 'ski-resort',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 32: Village - farpoint
  32: {
    primaryType: 'village',
    isFarpoint: true,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 34: Airport - farpoint
  34: {
    primaryType: 'airport',
    isFarpoint: true,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 35: Cultural Landmark
  35: {
    primaryType: 'cultural-landmark',
    isFarpoint: false,
    tier: 't2',
    resolution: '720p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 36: Street
  36: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 38: Ski Resort - farpoint
  38: {
    primaryType: 'ski-resort',
    isFarpoint: true,
    tier: 't0',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: true },
  },

  // 39: City Skyline - farpoint
  39: {
    primaryType: 'city-skyline',
    isFarpoint: true,
    tier: 't1',
    resolution: '720p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 40: Street + Beach - farpoint
  40: {
    primaryType: 'beach',
    isFarpoint: true,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: true },
  },

  // 41: Beach
  41: {
    primaryType: 'beach',
    isFarpoint: false,
    tier: 't2',
    resolution: '720p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 42: City Skyline - farpoint
  42: {
    primaryType: 'city-skyline',
    isFarpoint: true,
    tier: 't0',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 43: Street
  43: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't1',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 44: Cultural Landmark
  44: {
    primaryType: 'cultural-landmark',
    isFarpoint: false,
    tier: 't2',
    resolution: '720p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 45: Mountain
  45: {
    primaryType: 'mountain',
    isFarpoint: false,
    tier: 't1',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: true, lightSnow: false },
  },

  // 46: Cultural Landmark
  46: {
    primaryType: 'cultural-landmark',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 47: Ocean - farpoint
  47: {
    primaryType: 'ocean',
    isFarpoint: true,
    tier: 't1',
    resolution: '720p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 48: Mountain
  48: {
    primaryType: 'mountain',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 50: Railway Station - 事件导向
  50: {
    primaryType: 'railway-station',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
    isEventDriven: true,
  },

  // 51: Mountain - farpoint
  51: {
    primaryType: 'mountain',
    isFarpoint: true,
    tier: 't1',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 52: Street + Railway
  52: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't1',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 53: City Skyline
  53: {
    primaryType: 'city-skyline',
    isFarpoint: false,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 54: Cultural Landmark
  54: {
    primaryType: 'cultural-landmark',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 55: City Skyline
  55: {
    primaryType: 'city-skyline',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 57: Nature
  57: {
    primaryType: 'nature',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 58: Street
  58: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 59: Airport
  59: {
    primaryType: 'airport',
    isFarpoint: false,
    tier: 't0',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 60: Airport
  60: {
    primaryType: 'airport',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 61: Street
  61: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't0',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 62: City Skyline
  62: {
    primaryType: 'city-skyline',
    isFarpoint: false,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 63: Mountain - farpoint
  63: {
    primaryType: 'mountain',
    isFarpoint: true,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 64: Street
  64: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't0',
    resolution: '720p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 66: Railway
  66: {
    primaryType: 'railway-station',
    isFarpoint: false,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 68: Street
  68: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 69: Cultural Landmark
  69: {
    primaryType: 'cultural-landmark',
    isFarpoint: false,
    tier: 't0',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 70: City Skyline
  70: {
    primaryType: 'city-skyline',
    isFarpoint: false,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 71: City Skyline
  71: {
    primaryType: 'city-skyline',
    isFarpoint: false,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 72: River
  72: {
    primaryType: 'river',
    isFarpoint: false,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 73: Ocean
  73: {
    primaryType: 'ocean',
    isFarpoint: false,
    tier: 't1',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 74: Harbor
  74: {
    primaryType: 'harbor',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 75: Cultural Landmark + Ocean
  75: {
    primaryType: 'cultural-landmark',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 77: Nature
  77: {
    primaryType: 'nature',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 78: Beach
  78: {
    primaryType: 'beach',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 80: Railway View (火车第一视角)
  80: {
    primaryType: 'railway-view',
    isFarpoint: false,
    tier: 't1',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: true, lightSnow: true },
  },

  // 81: Nature
  81: {
    primaryType: 'nature',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 82: Nature
  82: {
    primaryType: 'nature',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 84: Mountain - 事件导向
  84: {
    primaryType: 'mountain',
    isFarpoint: false,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
    isEventDriven: true,
  },

  // 86: Village - farpoint
  86: {
    primaryType: 'village',
    isFarpoint: true,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 88: Mountain - farpoint
  88: {
    primaryType: 'mountain',
    isFarpoint: true,
    tier: 't1',
    resolution: '720p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 89: City Skyline
  89: {
    primaryType: 'city-skyline',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 90: Cultural Landmark
  90: {
    primaryType: 'cultural-landmark',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 91: Harbor
  91: {
    primaryType: 'harbor',
    isFarpoint: false,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 92: Street - 事件导向
  92: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
    isEventDriven: true,
  },

  // 93: Ski Resort - farpoint
  93: {
    primaryType: 'ski-resort',
    isFarpoint: true,
    tier: 't1',
    resolution: '720p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 94: Street
  94: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 95: Mountain + Ski Resort
  95: {
    primaryType: 'ski-resort',
    isFarpoint: false,
    tier: 't1',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 96: City Skyline
  96: {
    primaryType: 'city-skyline',
    isFarpoint: false,
    tier: 't1',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 97: Street
  97: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 98: Street
  98: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 99: Street
  99: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 100: City Skyline - farpoint
  100: {
    primaryType: 'city-skyline',
    isFarpoint: true,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 101: Street
  101: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '720p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: true },
  },

  // 102: Cultural Landmark
  102: {
    primaryType: 'cultural-landmark',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: true },
  },

  // 103: City Skyline - farpoint
  103: {
    primaryType: 'city-skyline',
    isFarpoint: true,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 104: Railway - 事件导向
  104: {
    primaryType: 'railway-station',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
    isEventDriven: true,
  },

  // 105: Street
  105: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 106: Beach
  106: {
    primaryType: 'beach',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 107: Street
  107: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: true, lightSnow: true },
  },

  // 108: Aurora - 事件导向
  108: {
    primaryType: 'aurora',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: true, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
    isEventDriven: true,
  },

  // 109: Nature
  109: {
    primaryType: 'nature',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 111: Railway
  111: {
    primaryType: 'railway-station',
    isFarpoint: false,
    tier: 't1',
    resolution: '720p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: true },
  },

  // 112: Harbor
  112: {
    primaryType: 'harbor',
    isFarpoint: false,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: true },
  },

  // 113: Ski Resort
  113: {
    primaryType: 'ski-resort',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 114: River + Street
  114: {
    primaryType: 'river',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: true },
  },

  // 115: Village
  115: {
    primaryType: 'village',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 116: 雪地
  116: {
    primaryType: 'nature',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: true },
  },

  // 117: Village - farpoint
  117: {
    primaryType: 'village',
    isFarpoint: true,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: true },
  },

  // 119: Volcano
  119: {
    primaryType: 'volcano',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: true, lightSnow: true },
  },

  // 120: Street
  120: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: true },
  },

  // 121: 雪地 + Railway
  121: {
    primaryType: 'railway-station',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: true },
  },

  // 122: Cultural Landmark
  122: {
    primaryType: 'cultural-landmark',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 123: Aurora - 事件导向
  123: {
    primaryType: 'aurora',
    isFarpoint: false,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: true, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
    isEventDriven: true,
  },

  // 124: Beach - farpoint
  124: {
    primaryType: 'beach',
    isFarpoint: true,
    tier: 't1',
    resolution: '720p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 125: Street + Mountain
  125: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't1',
    resolution: '720p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: true },
  },

  // 126: Mountain + Nature
  126: {
    primaryType: 'mountain',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: true },
  },

  // 127: Street
  127: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 128: Harbor - farpoint
  128: {
    primaryType: 'harbor',
    isFarpoint: true,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 129: Sky - farpoint
  129: {
    primaryType: 'nature',
    isFarpoint: true,
    tier: 't1',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 130: Mountain
  130: {
    primaryType: 'mountain',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 131: Mountain - farpoint
  131: {
    primaryType: 'mountain',
    isFarpoint: true,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 132: City Skyline
  132: {
    primaryType: 'city-skyline',
    isFarpoint: false,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 133: City Skyline
  133: {
    primaryType: 'city-skyline',
    isFarpoint: false,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 134: City Skyline
  134: {
    primaryType: 'city-skyline',
    isFarpoint: false,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 135: Ski Resort
  135: {
    primaryType: 'ski-resort',
    isFarpoint: false,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 136: Harbor
  136: {
    primaryType: 'harbor',
    isFarpoint: false,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 137: 雪地 + Village
  137: {
    primaryType: 'village',
    isFarpoint: false,
    tier: 't1',
    resolution: '720p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 138: Ski Resort
  138: {
    primaryType: 'ski-resort',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 139: Mountain - farpoint
  139: {
    primaryType: 'mountain',
    isFarpoint: true,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 140: Skating Rink (溜冰场)
  140: {
    primaryType: 'skating-rink',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 141: Skating Rink
  141: {
    primaryType: 'skating-rink',
    isFarpoint: false,
    tier: 't0',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 142: Skating Rink
  142: {
    primaryType: 'skating-rink',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 143: 雪地 - farpoint
  143: {
    primaryType: 'nature',
    isFarpoint: true,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 144: 雪地
  144: {
    primaryType: 'nature',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 145: Ski Resort
  145: {
    primaryType: 'ski-resort',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 146: Railway Station
  146: {
    primaryType: 'railway-station',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
  },

  // 147: Mountain - farpoint
  147: {
    primaryType: 'mountain',
    isFarpoint: true,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 148: Street + Village
  148: {
    primaryType: 'village',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 149: Harbor - farpoint
  149: {
    primaryType: 'harbor',
    isFarpoint: true,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 150: Railway Station - 事件导向
  150: {
    primaryType: 'railway-station',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
    isEventDriven: true,
  },

  // 151: Beach
  151: {
    primaryType: 'beach',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 152: City Skyline
  152: {
    primaryType: 'city-skyline',
    isFarpoint: false,
    tier: 't2',
    resolution: '720p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 153: Harbor
  153: {
    primaryType: 'harbor',
    isFarpoint: false,
    tier: 't0',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 154: 雪地 - farpoint
  154: {
    primaryType: 'nature',
    isFarpoint: true,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 155: Railway Station
  155: {
    primaryType: 'railway-station',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 156: Mountain - farpoint
  156: {
    primaryType: 'mountain',
    isFarpoint: true,
    tier: 't2',
    resolution: '720p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  },

  // 157: Street
  157: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 158: Beach
  158: {
    primaryType: 'beach',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 159: Beach - farpoint
  159: {
    primaryType: 'beach',
    isFarpoint: true,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 160: Ocean - 事件导向
  160: {
    primaryType: 'ocean',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
    isEventDriven: true,
  },

  // 161: Harbor - 事件导向
  161: {
    primaryType: 'harbor',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
    isEventDriven: true,
  },

  // 163: Skating Rink
  163: {
    primaryType: 'skating-rink',
    isFarpoint: false,
    tier: 't1',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 164: Harbor
  164: {
    primaryType: 'harbor',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 165: City Skyline
  165: {
    primaryType: 'city-skyline',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 166: City Skyline - farpoint
  166: {
    primaryType: 'city-skyline',
    isFarpoint: true,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 167: Street
  167: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 168: 雪地
  168: {
    primaryType: 'nature',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },

  // 169: Street + Railway - 事件导向
  169: {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
    isEventDriven: true,
  },

  // 170: River - farpoint
  170: {
    primaryType: 'river',
    isFarpoint: true,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  },
};

// 生成SQL更新语句
export function generateUpdateSQL(): string {
  const sqlStatements: string[] = [];

  for (const [cameraId, metadata] of Object.entries(CAMERA_METADATA_MAP)) {
    const jsonString = JSON.stringify(metadata).replace(/'/g, "''");
    sqlStatements.push(
      `UPDATE camera_ytb SET camera_metadata = '${jsonString}'::jsonb WHERE camera_id = ${cameraId};`
    );
  }

  return sqlStatements.join('\n');
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log('-- Camera Metadata Update SQL Script');
  console.log('-- Generated on:', new Date().toISOString());
  console.log('-- Total cameras:', Object.keys(CAMERA_METADATA_MAP).length);
  console.log('');
  console.log(generateUpdateSQL());
}
