const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Check Maspalomas camera
  const { data: camera } = await supabase
    .from('camera_ytb')
    .select('camera_id, placename, tag, latitude, longitude')
    .eq('camera_id', '41')
    .single();

  console.log('\nMaspalomas Dunes Camera:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`ID: ${camera.camera_id}`);
  console.log(`Name: ${camera.placename}`);
  console.log(`Tags: ${camera.tag}`);
  console.log(`Location: ${camera.latitude}, ${camera.longitude}`);

  // Check its ranking
  const { data: ranking } = await supabase
    .from('camera_rankings')
    .select('camera_id, score, label, computed_at')
    .eq('camera_id', '41')
    .single();

  console.log('\nCurrent Ranking:');
  console.log(`Score: ${ranking.score}`);
  console.log(`Label: ${ranking.label}`);
  console.log(`Computed at: ${new Date(ranking.computed_at).toLocaleString()}`);
})();
