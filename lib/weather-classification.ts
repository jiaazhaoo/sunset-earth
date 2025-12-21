/**
 * 天气分类和细分逻辑
 * 基于Open-Meteo API返回的数据
 */

// 基础天气分类（从WMO代码）
export type WeatherClassBase =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "freezing-rain"
  | "snow"
  | "snow-showers"
  | "thunderstorm"
  | "thunderstorm-hail";

// 细分天气分类（考虑降水/降雪强度）
export type WeatherClassDetailed =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "light-rain"      // 小雨
  | "moderate-rain"   // 中雨
  | "heavy-rain"      // 大雨
  | "freezing-rain"
  | "light-snow"      // 小雪
  | "heavy-snow"      // 大雪
  | "snow-showers"
  | "thunderstorm"
  | "thunderstorm-hail";

/**
 * 从WMO天气代码分类基础天气
 */
export function classifyWeatherBase(code: number | null): WeatherClassBase {
  switch (code) {
    case 0:
    case 1:
      return "clear";
    case 2:
      return "partly-cloudy";
    case 3:
      return "cloudy";
    case 45:
    case 48:
      return "fog";
    case 51:
    case 53:
    case 55:
      return "drizzle";
    case 56:
    case 57:
      return "freezing-rain";
    case 61:
    case 63:
    case 65:
    case 80:
    case 81:
    case 82:
      return "rain";
    case 66:
    case 67:
      return "freezing-rain";
    case 71:
    case 73:
    case 75:
    case 77:
      return "snow";
    case 85:
    case 86:
      return "snow-showers";
    case 95:
      return "thunderstorm";
    case 96:
    case 99:
      return "thunderstorm-hail";
    default:
      return "cloudy"; // fallback
  }
}

/**
 * 细分天气（考虑降水和降雪强度）
 *
 * @param weatherCode WMO天气代码
 * @param precipitation 降水量（mm）
 * @param snowfall 降雪量（cm）
 */
export function classifyWeatherDetailed(
  weatherCode: number | null,
  precipitation?: number,
  snowfall?: number
): WeatherClassDetailed {
  const baseClass = classifyWeatherBase(weatherCode);

  // 细分降雨
  if (baseClass === 'rain' || baseClass === 'drizzle') {
    if (precipitation !== undefined) {
      if (precipitation < 0.5) return 'light-rain';
      if (precipitation < 2) return 'moderate-rain';
      return 'heavy-rain';
    }
    // 如果没有降水数据，drizzle默认为light-rain，rain默认为moderate-rain
    return baseClass === 'drizzle' ? 'light-rain' : 'moderate-rain';
  }

  // 细分降雪
  if (baseClass === 'snow' || baseClass === 'snow-showers') {
    if (snowfall !== undefined) {
      if (snowfall < 0.5) return 'light-snow';
      return 'heavy-snow';
    }
    // 如果没有降雪数据，默认为light-snow
    return 'light-snow';
  }

  // 其他天气保持原分类
  return baseClass as WeatherClassDetailed;
}

/**
 * 检查摄像头是否可以容忍当前天气
 *
 * @param weatherClass 细分天气分类
 * @param tolerance 摄像头的天气容忍度
 */
export function isWeatherTolerable(
  weatherClass: WeatherClassDetailed,
  tolerance: {
    clear: boolean;
    partlyCloudy: boolean;
    lightRain: boolean;
    lightSnow: boolean;
  }
): boolean {
  switch (weatherClass) {
    case 'clear':
      return tolerance.clear;

    case 'partly-cloudy':
      return tolerance.partlyCloudy;

    case 'light-rain':
    case 'moderate-rain':  // 如果接受小雨，也接受中雨（权重会降低）
      return tolerance.lightRain;

    case 'light-snow':
      return tolerance.lightSnow;

    case 'heavy-rain':
    case 'heavy-snow':
    case 'freezing-rain':
    case 'thunderstorm':
    case 'thunderstorm-hail':
      return false;  // 恶劣天气一律不接受

    case 'cloudy':
    case 'fog':
    case 'snow-showers':
      return tolerance.partlyCloudy;  // 多云和雾视为partly-cloudy

    default:
      return false;
  }
}

/**
 * 获取天气权重（0-1）
 * 用于评分计算
 */
export function getWeatherWeight(
  weatherClass: WeatherClassDetailed,
  tolerance: {
    clear: boolean;
    partlyCloudy: boolean;
    lightRain: boolean;
    lightSnow: boolean;
  }
): number {
  // 如果完全不容忍，返回0.1（极低分）
  if (!isWeatherTolerable(weatherClass, tolerance)) {
    return 0.1;
  }

  // 根据天气细分返回权重
  switch (weatherClass) {
    case 'clear':
      return 1.0;

    case 'partly-cloudy':
      return 0.9; // lower penalty for partly cloudy

    case 'cloudy':
      return 0.65;

    case 'fog':
      return 0.5;

    case 'light-rain':
      return tolerance.lightRain ? 0.75 : 0.3;

    case 'moderate-rain':
      return tolerance.lightRain ? 0.5 : 0.2;

    case 'heavy-rain':
      return 0.15;

    case 'light-snow':
      return tolerance.lightSnow ? 0.8 : 0.4;

    case 'heavy-snow':
      return 0.3;

    case 'snow-showers':
      return tolerance.lightSnow ? 0.7 : 0.35;

    case 'freezing-rain':
      return 0.2;

    case 'thunderstorm':
      return 0.15;

    case 'thunderstorm-hail':
      return 0.1;

    default:
      return 0.5;
  }
}
