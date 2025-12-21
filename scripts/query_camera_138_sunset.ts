/**
 * 直接查询138号摄像头的日落时间
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function queryCamera138Sunset() {
  console.log('🔍 Querying Camera #138 from Database\n');
  console.log('='.repeat(60));

  // 1. 查询摄像头基本信息
  const { data: camera, error } = await supabase
    .from('camera_ytb')
    .select('*')
    .eq('camera_id', 138)
    .single();

  if (error) {
    console.error('❌ Error querying camera:', error);
    return;
  }

  if (!camera) {
    console.error('❌ Camera #138 not found');
    return;
  }

  console.log('📹 Camera #138 Info:');
  console.log('  ID:', camera.camera_id);
  console.log('  Name:', camera.title);
  console.log('  Latitude:', camera.latitude);
  console.log('  Longitude:', camera.longitude);
  console.log('  Timezone:', camera.timezone);
  console.log('');

  // 2. 使用Open-Meteo API获取实际的日出日落时间
  const lat = camera.latitude;
  const lon = camera.longitude;

  console.log('🌐 Fetching current sunset/sunrise from Open-Meteo API...');
  console.log('');

  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset&timezone=${encodeURIComponent(camera.timezone)}&forecast_days=1`
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const weatherData = await response.json();

    console.log('📅 Today\'s Solar Events:');
    console.log('  Date:', weatherData.daily.time[0]);
    console.log('  Sunrise:', weatherData.daily.sunrise[0]);
    console.log('  Sunset:', weatherData.daily.sunset[0]);
    console.log('');

    // 解析日落时间
    const sunsetDate = new Date(weatherData.daily.sunset[0]);
    const sunriseDate = new Date(weatherData.daily.sunrise[0]);

    console.log('🕐 Local Times:');
    console.log('  Sunrise (local):', sunriseDate.toLocaleTimeString('en-US', {
      timeZone: camera.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }));
    console.log('  Sunset (local):', sunsetDate.toLocaleTimeString('en-US', {
      timeZone: camera.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }));
    console.log('');

    // 计算扩展白天的结束时间
    const extendedDayEnd = new Date(sunsetDate.getTime() + 45 * 60 * 1000);
    console.log('⏰ Extended Daytime Definition:');
    console.log('  Daytime Start (sunrise - 45min):',
      new Date(sunriseDate.getTime() - 45 * 60 * 1000).toLocaleTimeString('en-US', {
        timeZone: camera.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    );
    console.log('  Daytime End (sunset + 45min):',
      extendedDayEnd.toLocaleTimeString('en-US', {
        timeZone: camera.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    );
    console.log('');

    // 检查晚上8点是否在扩展白天范围内
    const testTime = new Date(sunsetDate);
    testTime.setHours(20, 0, 0, 0);

    console.log('='.repeat(60));
    console.log('\n🧪 Test: Is 20:00 (8:00 PM) considered daytime?\n');

    if (testTime <= extendedDayEnd) {
      console.log('✅ YES - 20:00 is within extended daytime');
      console.log(`   → 20:00 < ${extendedDayEnd.toLocaleTimeString('en-US', {
        timeZone: camera.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })} (sunset + 45min)`);
      console.log('   → dayOnly penalty does NOT apply');
      console.log('   → Score will be ~60-65 (normal daytime score)');
      console.log('   → This explains the 62 score!');
    } else {
      console.log('❌ NO - 20:00 is after extended daytime');
      console.log(`   → 20:00 > ${extendedDayEnd.toLocaleTimeString('en-US', {
        timeZone: camera.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })} (sunset + 45min)`);
      console.log('   → dayOnly penalty applies (×0.1)');
      console.log('   → Score should be ~2-5');
    }
    console.log('');

  } catch (apiError) {
    console.error('❌ Error fetching weather data:', apiError);
  }
}

queryCamera138Sunset().catch(console.error);
