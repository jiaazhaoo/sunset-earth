const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data: rankings } = await supabase
    .from('camera_rankings')
    .select('camera_id, score, label, computed_at')
    .eq('available', true)
    .order('score', { ascending: false })
    .limit(10);

  const { data: cameras } = await supabase
    .from('camera_ytb')
    .select('camera_id, placename, link_available')
    .in('camera_id', rankings.map(r => r.camera_id));

  const cameraMap = new Map(cameras.map(c => [c.camera_id.toString(), c]));

  console.log('\nTop 10 Cameras in Database:');
  console.log('═══════════════════════════════════════════════════════════════');
  rankings.forEach((r, i) => {
    const cam = cameraMap.get(r.camera_id);
    const name = cam ? cam.placename : 'Unknown';
    const link = cam ? cam.link_available : 'N/A';
    const label = r.label || 'none';
    const computedAt = new Date(r.computed_at).toLocaleString();
    console.log(`${i+1}. ${name}`);
    console.log(`   Score: ${r.score} | Label: ${label} | LinkAvailable: ${link}`);
    console.log(`   Computed at: ${computedAt}`);
  });
})();
