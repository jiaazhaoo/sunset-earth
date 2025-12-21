const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Get a few cameras that are marked as unavailable in rankings
  const { data: cameras, error: cameraError } = await supabase
    .from('camera_ytb')
    .select('camera_id, placename, link, link_available')
    .in('camera_id', ['2', '3', '4', '5'])
    .order('camera_id');

  if (cameraError) {
    console.error('Error fetching cameras:', cameraError);
    return;
  }

  console.log('\nCamera Details:');
  console.log('═══════════════════════════════════════════════════════════════');
  (cameras || []).forEach(cam => {
    console.log(`\nCamera ${cam.camera_id}: ${cam.placename}`);
    console.log(`  link: ${cam.link}`);
    console.log(`  link_available: ${cam.link_available}`);
  });

  // Check their ranking status
  const { data: rankings } = await supabase
    .from('camera_rankings')
    .select('camera_id, available, score, computed_at')
    .in('camera_id', ['2', '3', '4', '5'])
    .order('camera_id');

  console.log('\n\nRanking Status:');
  console.log('═══════════════════════════════════════════════════════════════');
  rankings.forEach(r => {
    console.log(`Camera ${r.camera_id}: available=${r.available}, score=${r.score}, computed_at=${new Date(r.computed_at).toLocaleString()}`);
  });
})();
