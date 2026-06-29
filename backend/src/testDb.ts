import prisma from './config/database';

async function main() {
  console.log('--- Starting Database and Geo Query Test ---');

  // 1. Clean up existing test data (to keep it idempotent)
  console.log('Cleaning up existing test data...');
  await prisma.taskSession.deleteMany({});
  await prisma.task.deleteMany({
    where: {
      title: { startsWith: 'TEST_' }
    }
  });
  await prisma.user.deleteMany({
    where: {
      email: { startsWith: 'test_' }
    }
  });

  // 2. Create a test user
  console.log('Creating test user...');
  const user = await prisma.user.create({
    data: {
      email: 'test_user@dogether.com',
      password: 'hashedpassword123',
      name: 'Test Runner'
    }
  });
  console.log(`Created User: ${user.name} (${user.id})`);

  // 3. Create test tasks (one nearby at 12.9716, 77.5946 - Bangalore, one far away in Mumbai 19.0760, 72.8777)
  console.log('Creating test tasks...');
  // Bangalore Task
  const taskNearby = await prisma.task.create({
    data: {
      title: 'TEST_Bangalore Coffee Vibe',
      description: 'Come grab coffee with me in central Bangalore',
      price: 0,
      isPaid: false,
      latitude: 12.9716,
      longitude: 77.5946,
      creatorId: user.id
    }
  });
  console.log(`Created Nearby Task: ${taskNearby.title}`);

  // Mumbai Task
  const taskFar = await prisma.task.create({
    data: {
      title: 'TEST_Mumbai Coding Jam',
      description: 'Coding session in Mumbai',
      price: 20.0,
      isPaid: true,
      latitude: 19.0760,
      longitude: 72.8777,
      creatorId: user.id
    }
  });
  console.log(`Created Far Task: ${taskFar.title}`);

  // 4. Test Geospatial query (Search from Bangalore: 12.972, 77.595 with 10km radius)
  console.log('Testing geospatial search from Bangalore (10km radius)...');
  const lat = 12.972;
  const lng = 77.595;
  const radiusKm = 10.0;

  const nearbyTasks: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, latitude, longitude, (
      6371 * acos(
        cos(radians(${lat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${lng})) +
        sin(radians(${lat})) * sin(radians(latitude))
      )
    ) AS distance
    FROM "Task"
    WHERE status = 'OPEN'
    AND (
      6371 * acos(
        cos(radians(${lat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${lng})) +
        sin(radians(${lat})) * sin(radians(latitude))
      )
    ) < ${radiusKm}
  `);

  console.log(`Geospatial results (found ${nearbyTasks.length} tasks):`);
  nearbyTasks.forEach((t) => {
    console.log(`- ${t.title} (Distance: ${parseFloat(t.distance).toFixed(2)} km)`);
  });

  // Check assertions
  const hasBangalore = nearbyTasks.some((t) => t.title === 'TEST_Bangalore Coffee Vibe');
  const hasMumbai = nearbyTasks.some((t) => t.title === 'TEST_Mumbai Coding Jam');

  if (hasBangalore && !hasMumbai) {
    console.log('✅ TEST PASSED: Successfully found nearby tasks and filtered out far tasks!');
  } else {
    console.error('❌ TEST FAILED: Verification criteria not met.');
    console.error(`Nearby? ${hasBangalore}, Mumbai? ${hasMumbai}`);
  }

  // 5. Cleanup test data
  console.log('Cleaning up test database records...');
  await prisma.task.deleteMany({
    where: {
      title: { startsWith: 'TEST_' }
    }
  });
  await prisma.user.deleteMany({
    where: {
      email: { startsWith: 'test_' }
    }
  });

  console.log('--- Test Completed ---');
}

main()
  .catch((e) => {
    console.error('Test errored out:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
