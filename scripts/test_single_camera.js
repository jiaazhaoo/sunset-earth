const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test a camera that was marked unavailable
const testCameraId = '41'; // Maspalomas Dunes

(async () => {
  const { data: camera } = await supabase
    .from('camera_ytb')
    .select('camera_id, placename, link, link_available, last_check')
    .eq('camera_id', testCameraId)
    .single();

  console.log('\nCamera Info:');
  console.log(`ID: ${camera.camera_id}`);
  console.log(`Name: ${camera.placename}`);
  console.log(`Link: ${camera.link}`);
  console.log(`Link Available: ${camera.link_available}`);
  console.log(`Last Check: ${camera.last_check}`);

  // Try to fetch the YouTube page
  console.log('\n Testing availability...');
  try {
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(camera.link)}`);
    console.log(`Oembed status: ${response.status}`);
    if (response.ok) {
      const data = await response.json();
      console.log(`Oembed data:`, data);
    }
  } catch (e) {
    console.log(`Oembed error:`, e.message);
  }
})();
