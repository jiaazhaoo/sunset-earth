/**
 * 摄像头元数据类型定义
 * 用于新的推荐算法
 */

export type CameraPrimaryType =
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

export type CameraTier = 't0' | 't1' | 't2' | 't3';

export type CameraResolution = '720p' | '1080p' | '高1080p' | '4k';

export type CameraMetadata = {
  primaryType: CameraPrimaryType;
  isFarpoint: boolean;
  tier: CameraTier;
  resolution: CameraResolution;

  viewingTime: {
    dayOnly: boolean;         // 仅白天可看
    nightOnly: boolean;       // 仅夜晚可看 (如极光)
    noSleepTime: boolean;     // 睡眠时间不可看 (如街景、火车站)
    anytime: boolean;         // 任何时间可看 (如城市天际线)
  };

  weatherTolerance: {
    clear: boolean;           // 接受晴天
    partlyCloudy: boolean;    // 接受部分多云
    lightRain: boolean;       // 接受小雨
    lightSnow: boolean;       // 接受小雪
  };

  isEventDriven?: boolean;    // 事件导向（如极光爆发、火车发车）
};

/**
 * 从数据库camera_ytb.camera_metadata字段解析元数据
 */
export function parseCameraMetadata(raw: unknown): CameraMetadata | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as Record<string, unknown>;

  // 验证必需字段
  if (
    !data.primaryType ||
    typeof data.isFarpoint !== 'boolean' ||
    !data.tier ||
    !data.resolution ||
    !data.viewingTime ||
    !data.weatherTolerance
  ) {
    return null;
  }

  return data as CameraMetadata;
}

/**
 * 默认元数据（用于没有metadata的旧摄像头）
 */
export function getDefaultMetadata(): CameraMetadata {
  return {
    primaryType: 'nature',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: {
      dayOnly: true,
      nightOnly: false,
      noSleepTime: false,
      anytime: false,
    },
    weatherTolerance: {
      clear: true,
      partlyCloudy: false,
      lightRain: false,
      lightSnow: false,
    },
  };
}
