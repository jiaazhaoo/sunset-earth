const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Get total count
  const { count } = await supabase
    .from('camera_rankings')
    .select('*', { count: 'exact', head: true });

  console.log(`\nTotal rankings in database: ${count}`);

  // Get breakdown by available status
  const { data: availableTrue } = await supabase
    .from('camera_rankings')
    .select('camera_id', { count: 'exact' })
    .eq('available', true);

  const { data: availableFalse } = await supabase
    .from('camera_rankings')
    .select('camera_id', { count: 'exact' })
    .eq('available', false);

  console.log(`Available=true: ${availableTrue?.length || 0}`);
  console.log(`Available=false: ${availableFalse?.length || 0}`);

  // Get top 20 regardless of availability
  const { data: topRankings } = await supabase
    .from('camera_rankings')
    .select('camera_id, score, label, available, computed_at')
    .order('score', { ascending: false })
    .limit(20);

  const { data: cameras } = await supabase
    .from('camera_ytb')
    .select('camera_id, placename')
    .in('camera_id', topRankings.map(r => r.camera_id));

  const cameraMap = new Map(cameras.map(c => [c.camera_id.toString(), c]));

  console.log('\nTop 20 Cameras (all):');
  console.log('═══════════════════════════════════════════════════════════════');
  topRankings.forEach((r, i) => {
    const cam = cameraMap.get(r.camera_id);
    const name = cam ? cam.placename : 'Unknown';
    const computedAt = new Date(r.computed_at).toLocaleString();
    console.log(`${i+1}. ${name} | Score: ${r.score} | Label: ${r.label} | Available: ${r.available} | ${computedAt}`);
  });
})();
