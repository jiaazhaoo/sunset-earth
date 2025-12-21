const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Check link_available distribution
  const { data: all } = await supabase
    .from('camera_ytb')
    .select('camera_id, placename, link_available')
    .order('camera_id');

  const available = all.filter(c => c.link_available !== false);
  const unavailable = all.filter(c => c.link_available === false);

  console.log('\nLink Availability Status:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total cameras: ${all.length}`);
  console.log(`Available (true/null): ${available.length}`);
  console.log(`Unavailable (false): ${unavailable.length}`);

  console.log('\nUnavailable cameras:');
  unavailable.slice(0, 20).forEach(c => {
    console.log(`  ${c.camera_id}: ${c.placename}`);
  });

  if (unavailable.length > 20) {
    console.log(`  ... and ${unavailable.length - 20} more`);
  }
})();
