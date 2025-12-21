import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
  // Check all cameras with coordinates
  const { data: allCameras, error: allError } = await supabase
    .from('camera_ytb')
    .select('camera_id, timezone, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (allError) {
    console.error('Error fetching all cameras:', allError);
    return;
  }

  const withTimezone = allCameras?.filter(c => c.timezone && c.timezone.trim() !== '') || [];
  console.log(`Total cameras with coords: ${allCameras?.length}`);
  console.log(`Cameras with timezone: ${withTimezone.length}`);

  // Get sample with timezone
  const { data, error } = await supabase
    .from('camera_ytb')
    .select('camera_id, ytb_title, placename, country, timezone, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .not('timezone', 'is', null)
    .neq('timezone', '')
    .limit(10);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('\nFound cameras with valid timezone:', data?.length);
    console.log('Sample cameras:');
    data?.slice(0, 5).forEach(cam => {
      console.log(`  ${cam.camera_id}: ${cam.placename || cam.ytb_title} (${cam.country}) - ${cam.timezone}`);
    });
  }
}

test();
