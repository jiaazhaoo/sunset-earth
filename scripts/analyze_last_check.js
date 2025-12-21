const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Get all cameras and their last_check times
  const { data: cameras } = await supabase
    .from('camera_ytb')
    .select('camera_id, placename, link_available, last_check')
    .order('last_check', { ascending: false });

  // Group by last_check time (rounded to minute)
  const checkTimes = new Map();

  cameras.forEach(cam => {
    if (!cam.last_check) return;

    const checkTime = new Date(cam.last_check);
    const roundedTime = new Date(checkTime);
    roundedTime.setSeconds(0, 0);
    const key = roundedTime.toISOString();

    if (!checkTimes.has(key)) {
      checkTimes.set(key, {
        time: key,
        total: 0,
        available: 0,
        unavailable: 0,
        cameras: []
      });
    }

    const bucket = checkTimes.get(key);
    bucket.total++;
    if (cam.link_available === false) {
      bucket.unavailable++;
    } else {
      bucket.available++;
    }
    bucket.cameras.push({
      id: cam.camera_id,
      name: cam.placename,
      available: cam.link_available
    });
  });

  // Sort by time
  const sorted = Array.from(checkTimes.values()).sort((a, b) =>
    new Date(b.time) - new Date(a.time)
  );

  console.log('\nRefresh-links Run History (last 10 runs):');
  console.log('═══════════════════════════════════════════════════════════════');

  sorted.slice(0, 10).forEach((run, idx) => {
    const date = new Date(run.time);
    const failureRate = ((run.unavailable / run.total) * 100).toFixed(1);

    console.log(`\n${idx + 1}. ${date.toLocaleString()}`);
    console.log(`   Total: ${run.total} | Available: ${run.available} | Unavailable: ${run.unavailable}`);
    console.log(`   Failure Rate: ${failureRate}%`);

    // If high failure rate, show some examples
    if (run.unavailable > 10) {
      console.log(`   Failed cameras (first 5):`);
      run.cameras
        .filter(c => c.available === false)
        .slice(0, 5)
        .forEach(c => console.log(`     - ${c.id}: ${c.name}`));
    }
  });

  // Find the run with highest failure rate
  const worstRun = sorted.reduce((worst, current) => {
    const currentRate = current.unavailable / current.total;
    const worstRate = worst.unavailable / worst.total;
    return currentRate > worstRate ? current : worst;
  });

  console.log('\n\nWorst Run (Highest Failure Rate):');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Time: ${new Date(worstRun.time).toLocaleString()}`);
  console.log(`Failure Rate: ${((worstRun.unavailable / worstRun.total) * 100).toFixed(1)}%`);
  console.log(`Total: ${worstRun.total} | Unavailable: ${worstRun.unavailable}`);
})();
